import { contextBridge, ipcRenderer } from "electron";
import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from "crypto";
import type {
  CryptoAlgorithm,
  ToriiPipelineTransactionStatus,
} from "@iroha/iroha-js";
import {
  NetworkId,
  buildCanonicalJsonRequest,
} from "@iroha/iroha-js/canonical-request";
import { normalizeAssetHoldingId } from "@iroha/iroha-js/normalizers";
import {
  generateKeyPair as generateSdkKeyPair,
  normalizeCryptoAlgorithm,
  publicKeyFromPrivate,
  sign,
  supportedCryptoAlgorithms,
} from "@iroha/iroha-js/crypto";
import {
  DEFAULT_SIGNING_ALGORITHM,
  signingAlgorithmLabel,
} from "../src/utils/signingAlgorithms";
import {
  assertConfidentialPolicyProjectionAgreement,
  formatOnboardingError,
  normalizeAccountAssetListPayload,
  normalizeBaseUrl,
  normalizeConfidentialAssetPolicyPayload,
  assertExplorerAccountQrMatchesRequestedAccount,
  normalizeGovernanceCitizenCountPayload,
  normalizeGovernanceCouncilCurrentPayload,
  normalizeGovernanceUnlockStatsPayload,
  parseNexusLifecycleJson,
  normalizePublicLaneRewardsPayload,
  normalizePublicLaneStakePayload,
  normalizePublicLaneValidatorsPayload,
  extractApiErrorDetail,
  readNexusUnbondingDelayMs,
  type ConfidentialAssetPolicyView,
  type ExplorerAccountQrResponse,
  type GovernanceCouncilCurrentResponseView,
  type NexusLifecycleView,
  type PublicLaneRewardsResponseView,
  type PublicLaneStakeResponseView,
  type PublicLaneValidatorsResponseView,
} from "./preload-utils";
import {
  extractGovernanceStats,
  extractRuntimeStatsFromStatusSnapshot,
  normalizeCurrentSumeragiTelemetry,
  normalizeExplorerAssetDefinitionEconometricsPayload,
  normalizeExplorerAssetDefinitionSnapshotPayload,
} from "./networkStats";
import {
  buildAssetHoldingIdLiteral,
  extractAssetDefinitionId,
} from "../src/utils/assetId";
import {
  buildSoraCloudHfStatusQuery,
  missingSoraCloudHfStatus,
  normalizeSoraCloudHfStatusPayload,
  normalizeSoraCloudStatusPayload,
  unavailableSoraCloudStatus,
  type SoraCloudHfStatusView,
  type SoraCloudStatusView,
  type SoraCloudStorageClass,
} from "../src/utils/soracloud";
import {
  type ChainMetadata,
  parseFirstReleaseChainMetadataPayload,
} from "../src/utils/chainMetadata";
import type {
  AccountAssetsResponse,
  AccountPermissionsResponse,
  AccountTransactionsResponse,
  ExplorerMetricsResponse,
  GovernanceCitizenStatusResponse,
  GovernanceUnlockStatsResponse,
  NetworkStatsResponse,
  ToriiHealth,
  VpnProfile,
  VpnReceipt,
} from "../src/types/iroha";
import {
  canonicalGovernanceProposalId,
  normalizeGovernanceProposalDetail,
  normalizeGovernanceProposalList,
  type GovernanceProposalIdResolver,
  type GovernanceProposalDetail,
  type GovernanceProposalList,
  type GovernanceWritableProposalKindId,
} from "../src/governance/model";
import type { TransactionFeeQuoteView } from "../src/utils/transactionFee";
import {
  waitForFinalizedTransaction,
  type TransactionFinalityProof,
} from "./transactionFinality";
import { nodeFetch } from "./nodeFetch";
import {
  MAX_TORII_JSON_RESPONSE_BYTES,
  readBoundedJsonResponse,
  readBoundedResponseBytes,
} from "./boundedJsonResponse";
import {
  assertFirstReleaseHasMore,
  assertFirstReleasePageWindow,
  requireFirstReleaseInputArray,
  requireFirstReleaseInputText,
  requireFirstReleasePagination,
  requireOptionalFirstReleaseFilter,
} from "./firstReleaseReadInput";
import {
  parseFirstReleaseVpnAvailabilityIpcResponse,
  parseFirstReleaseVpnProfileIpcResponse,
  parseFirstReleaseVpnReceiptListIpcResponse,
  parseFirstReleaseVpnStatusIpcResponse,
} from "./firstReleaseVpnIpcResponse";
import { parseStrictJson } from "./secureBoundedJson";
import {
  assertEndpointFaucetChallengeAvailable,
  assertEndpointFeatureOperationSupported,
  assertEndpointFeatureSupported,
  assertEndpointWriteAuthorized,
  getTrustedEndpointIdentityScope,
  inspectEndpoint,
  requireTrustedInspectionNetworkId,
  resolvePinnedEndpointNetworkId,
  type EndpointIdentityPins,
} from "./endpointInspector";
import {
  NETWORK_IDENTITY_CONFIRM_CHANGE_CHANNEL,
  NETWORK_IDENTITY_PIN_FIRST_USE_CHANNEL,
  NETWORK_IDENTITY_PIN_READ_CHANNEL,
} from "./networkIdentityPinStore";
import {
  isNetworkIdentityPin,
  type NetworkIdentityPin,
} from "../src/utils/networkIdentity";
import type {
  EndpointFeature,
  EndpointInspection,
  EndpointNetworkContext,
} from "../src/types/endpointInspection";
import {
  buildEndpointDerivedStorageKey,
  type EndpointIdentityScopeInput,
} from "../src/utils/endpointScope";
import {
  requestFaucetFundsWithPuzzle,
  type AccountFaucetResult,
  type FaucetRequestProgress,
} from "./faucetApi";
import { reviewConnectTransactionPayload } from "./connectTransactionReview";
import { parseIrohaConnectDeepLink } from "./deepLink";
import {
  IROHA_CONNECT_DEEP_LINK_AVAILABLE_CHANNEL,
  IROHA_CONNECT_DEEP_LINK_DOM_EVENT,
  IROHA_CONNECT_TAKE_DEEP_LINK_CHANNEL,
} from "./irohaConnectDeepLinkChannels";
import {
  IROHA_CONNECT_CONFIRMATION_CHANNEL,
  IrohaConnectBoundary,
  type IrohaConnectProcessedFrame,
  type IrohaConnectWalletContext,
} from "./irohaConnectBoundary";
import {
  deriveAccountAddressView,
  normalizeCanonicalAccountIdLiteral,
  normalizeCanonicalI105AccountIdLiteral,
  requireAccountIdBoundToPublicKey,
} from "./accountAddress";
import {
  buildCanonicalInstructionFeeQuoteRequest,
  resolveCanonicalInstructionWireInput,
  transactionFeeQuoteView,
} from "./transactionFeeQuote";
import {
  FIRST_RELEASE_FEE_QUOTE_RESPONSE_MAX_BYTES,
  parseFirstReleaseAuthorityFeeQuoteResponse,
  type FirstReleaseAuthorityFeeQuoteResponse,
} from "./firstReleaseFeeQuoteResponse";
import {
  decryptKaigiPayload,
  decryptKaigiPayloadWithSecret,
  encryptKaigiPayload,
  encryptKaigiPayloadWithSecret,
  generateKaigiX25519KeyPair,
  type KaigiX25519KeyPair,
} from "./kaigiCrypto";
import {
  requireKaigiCallId,
  requireKaigiInviteSecretBase64Url,
} from "../src/utils/kaigiInvite";
import {
  collectWalletConfidentialLedger,
  deriveWalletConfidentialReceiveAddress,
  type WalletConfidentialTransactionLike,
} from "./confidentialWallet";
import { parseConfidentialNoteIndexPage } from "./confidentialNoteIndex";
import { installGlobalIrohaJsNativeBinding } from "./irohaJsNativeDir";
import {
  computeFirstReleaseValidationFeePayoutLifecycleFingerprint,
  computeFirstReleaseValidationFeePolicyFingerprint,
} from "./firstReleaseGovernanceFingerprint";
import {
  parseGovernanceValidationFeePolicyView,
  type GovernanceValidationFeePolicyView,
} from "./governanceValidationFeePolicyView";
import { GOVERNANCE_VALIDATION_FEE_POLICY_IPC_CHANNEL } from "./governanceValidationFeeFinality";
import {
  assertGovernanceCitizenDraftResponse,
  decodeGovernanceCitizenStatus,
  normalizeGovernanceNetworkPrefix,
  unavailableGovernanceCitizenStatus,
} from "./governanceCitizenStatus";
import { parseRetryAfterMs, withBoundedHttpGetRetry } from "./httpReadRetry";
import {
  normalizeGovernanceDraftPayloadHex,
  normalizeGovernanceDraftWireId,
  reviewedGovernanceDraftWireId,
} from "./governanceDraftInstruction";
import {
  runLocalVpnRepair,
  runVpnConnectAfterProfileCheck,
  runVpnDisconnectWithLocalFallback,
} from "./vpnPreloadGuard";
import { normalizeFirstReleaseAssetDefinitionId } from "./assetDefinitionId";
import {
  assertValidationFeePolicyDecodedInstruction,
  assertValidationFeePolicyDraftResponse,
  buildValidationFeePolicyDraftRequest,
  validationFeePolicyDraftInstruction,
  VALIDATION_FEE_POLICY_DRAFT_PATH,
} from "./governanceValidationFeeDraft";
import {
  governanceCapabilitiesContractFingerprintV1,
  parseGovernanceCapabilitiesV1,
  TAIRA_GOVERNANCE_CHAIN_ID,
  TAIRA_GOVERNANCE_NETWORK_PREFIX,
  type GovernanceCapabilitiesV1,
} from "./governanceCapabilities";
import {
  GOVERNANCE_CAPABILITIES_PATH,
  GOVERNANCE_CITIZEN_DRAFT_PATH,
  VALIDATION_FEE_PROPOSALS_PATH,
  validationFeeProposalPath,
} from "./governanceRoutes";
import {
  decodeSubscriptionListItemResponse,
  decodeSubscriptionListResponse,
  decodeSubscriptionPlanListResponse,
} from "./subscriptionResponses";
import { executeSubscriptionMutationBoundary } from "./subscriptionMutationBoundary";
import {
  classifySubscriptionStateConfirmation,
  decodeSubscriptionActionMutationDraft,
  decodeSubscriptionCreateMutationDraft,
  subscriptionPlanSnapshotsMatch,
  subscriptionStateSnapshotsMatch,
  type SubscriptionActionDraftName,
  type SubscriptionActionMutationDraft,
  type SubscriptionCancelMode,
  type SubscriptionCreateMutationDraft,
  type SubscriptionStateDraft,
} from "./subscriptionMutationDraft";
import {
  SECURE_VAULT_MAX_RECEIVE_KEY_BATCH,
  SECURE_VAULT_MAX_RECEIVE_KEYS_PER_ACCOUNT,
  type ConfidentialReceiveKeyRecord,
} from "./secureVault";
import {
  CONFIDENTIAL_WALLET_BACKUP_CIPHERTEXT_MAX_CHARACTERS,
  CONFIDENTIAL_WALLET_BACKUP_KDF_INFO,
  CONFIDENTIAL_WALLET_BACKUP_SCHEMA_V2,
  type ConfidentialWalletBackupMetadata,
  type ConfidentialWalletBackupMetadataV2,
  type ConfidentialWalletBackupStateBoxV2,
} from "../src/utils/walletBackup";
import { normalizeMnemonicPhrase } from "../src/utils/mnemonic";
import { parseJsonWithoutDuplicateObjectKeys } from "../src/utils/json";
import { wrapRendererSigningBoundary } from "./rendererSigningBoundary";
import {
  requireFirstReleaseIpcInput,
  requireFirstReleaseIpcInputObject,
} from "./firstReleaseIpcInput";
import {
  FIRST_RELEASE_CLIPBOARD_TEXT_MAX_BYTES,
  FIRST_RELEASE_CRYPTO_KEY_MATERIAL_MAX_BYTES,
  FIRST_RELEASE_ACCOUNT_TRANSACTION_SCAN_MAX_ITEMS,
  FIRST_RELEASE_ACCOUNT_TRANSACTION_SCAN_MAX_PAGES,
  FIRST_RELEASE_CONFIDENTIAL_NOTE_PAGE_SIZE,
  assertFirstReleaseConfidentialNoteContinuation,
  assertFirstReleaseConfidentialScanTargets,
  consumeFirstReleaseConfidentialNotePage,
  requireFirstReleaseFaucetRequestId,
  requireFirstReleaseJsonObject,
  reserveFirstReleaseFaucetRequest,
} from "./firstReleaseResourceLimits";
import { streamFirstReleaseSseJson } from "./firstReleaseSse";
import {
  normalizeFirstReleaseKaigiCall,
  normalizeFirstReleaseKaigiCallEvent,
  normalizeFirstReleaseKaigiCallSignals,
  type FirstReleaseKaigiCallView,
} from "./firstReleaseToriiResponses";
import {
  KAIGI_CALL_METADATA_SCHEMA,
  KAIGI_CALL_OFFER_SCHEMA,
  KAIGI_CHAIN_ANSWER_SCHEMA,
  KAIGI_CHAIN_SIGNAL_SCHEMA,
  normalizeFirstReleaseKaigiCallMetadata,
  normalizeFirstReleaseKaigiCallOfferPayload,
  normalizeFirstReleaseKaigiChainAnswerPayload,
  normalizeFirstReleaseKaigiChainSignalMetadata,
  requireFirstReleaseKaigiMeetingPrivacy,
  toFirstReleaseKaigiUiEvent,
} from "./firstReleaseKaigiPayloads";
import {
  decodeFirstReleaseInstruction,
  decodeReviewedFirstReleaseInstructionDraft,
  inspectFirstReleaseSubscriptionTriggerAction,
} from "./firstReleaseNativeInstruction";
import {
  buildFirstReleaseAuthorityTransactionDraft,
  hashFirstReleaseSignedTransaction,
  signFirstReleaseAuthorityTransaction,
  type FirstReleaseAuthorityTransactionDraft,
} from "./firstReleaseTransaction";
import {
  buildFirstReleaseCreateKaigiInstruction,
  buildFirstReleaseEndKaigiInstruction,
  buildFirstReleaseJoinKaigiInstruction,
  buildFirstReleaseRegisterAccountInstruction,
  buildFirstReleaseTransferAssetInstruction,
  requireFirstReleaseTransferQuantity,
} from "./firstReleaseInstructionBuilders";

const irohaNativeBinding = installGlobalIrohaJsNativeBinding(import.meta.url);

type ToriiConfig = {
  toriiUrl: string;
};

type ChainMetadataResponse = ChainMetadata;
type SigningAlgorithmOption = {
  id: string;
  label: string;
  isDefault: boolean;
};
const trimString = (value: unknown): string => String(value ?? "").trim();
const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const assertExactObjectKeys = (
  record: Record<string, unknown>,
  expectedKeys: readonly string[],
  label: string,
): void => {
  const actual = Object.keys(record).sort();
  const expected = [...expectedKeys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw new Error(`${label} has an unsupported shape.`);
  }
};
const assertRequiredAndOptionalObjectKeys = (
  record: Record<string, unknown>,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[],
  label: string,
): void => {
  const actual = new Set(Object.keys(record));
  const allowed = new Set([...requiredKeys, ...optionalKeys]);
  if (
    requiredKeys.some((key) => !actual.has(key)) ||
    [...actual].some((key) => !allowed.has(key))
  ) {
    throw new Error(`${label} has an unsupported shape.`);
  }
};

const requireCanonicalResponseText = (
  value: unknown,
  label: string,
  maximumBytes = 64 * 1024,
): string => {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value ||
    Buffer.byteLength(value, "utf8") > maximumBytes ||
    Array.from(value).some((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code <= 0x1f || code === 0x7f;
    })
  ) {
    throw new Error(`${label} must be canonical bounded text.`);
  }
  return value;
};

const requireExactJsonUnsignedInteger = (
  value: unknown,
  label: string,
  { allowZero = true }: { allowZero?: boolean } = {},
): number => {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    Object.is(value, -0) ||
    value < (allowZero ? 0 : 1)
  ) {
    throw new Error(
      `${label} must be an exact ${allowZero ? "non-negative" : "positive"} JSON integer.`,
    );
  }
  return value;
};

const SORA_XOR_ASSET_DEFINITION_ID = "6TEAJqbb8oEPmLncoNiMRbLEK6tw";
const DEFAULT_GAS_ASSET_DISABLED_ORIGINS = new Set([
  "https://minamoto.sora.org",
]);
const shouldAttachDefaultGasAssetMetadata = (toriiUrlRaw?: string) => {
  if (!toriiUrlRaw) {
    return true;
  }
  try {
    return !DEFAULT_GAS_ASSET_DISABLED_ORIGINS.has(
      new URL(normalizeBaseUrl(toriiUrlRaw)).origin,
    );
  } catch {
    return true;
  }
};
const withRequiredGasAssetMetadata = (
  metadata: Record<string, unknown> | undefined,
  toriiUrl?: string,
) => {
  const baseMetadata = isPlainRecord(metadata) ? { ...metadata } : {};
  if (!shouldAttachDefaultGasAssetMetadata(toriiUrl)) {
    delete baseMetadata.gas_asset_id;
    return baseMetadata;
  }
  return {
    ...baseMetadata,
    gas_asset_id: SORA_XOR_ASSET_DEFINITION_ID,
  };
};
const FAUCET_CLAIM_STATUS_TIMEOUT_MS = 240_000;

const isSecureVaultAvailable = async (): Promise<boolean> => {
  const result = await ipcRenderer.invoke("vault:isAvailable");
  if (typeof result !== "boolean") {
    throw new Error("Secure vault availability returned an invalid response.");
  }
  return result;
};

const assertSecureVaultAvailable = async (operationLabel: string) => {
  if (await isSecureVaultAvailable()) {
    return;
  }
  throw new Error(
    `${operationLabel} requires secure OS-backed key storage on this device.`,
  );
};

const storeAccountSecretInVault = async (input: {
  accountId: string;
  privateKeyHex: string;
  signingAlgorithm: string;
}): Promise<void> => {
  const result = await ipcRenderer.invoke("vault:storeAccountSecret", input);
  if (result !== undefined) {
    throw new Error(
      "Secure vault secret storage returned an invalid response.",
    );
  }
};

type AccountSecretMaterial = {
  privateKeyHex: string;
  signingAlgorithm: string;
};

const getAccountSecretMaterialFromVault = async (
  accountId: string,
): Promise<AccountSecretMaterial | null> => {
  const result = (await ipcRenderer.invoke("vault:getAccountSecretMaterial", {
    accountId,
  })) as unknown;
  if (result === null) {
    return null;
  }
  const material = requireFirstReleaseIpcInputObject<AccountSecretMaterial>(
    result,
    {
      label: "Secure vault account secret material",
      required: ["privateKeyHex", "signingAlgorithm"],
    },
  );
  const privateKeyHex = normalizePrivateKeyHex(material.privateKeyHex);
  const signingAlgorithm = normalizeRequiredBridgeSigningAlgorithm(
    material.signingAlgorithm,
  );
  if (
    privateKeyHex !== material.privateKeyHex ||
    signingAlgorithm !== material.signingAlgorithm
  ) {
    throw new Error("Secure vault account secret material is not canonical.");
  }
  return { privateKeyHex, signingAlgorithm };
};

const listAccountSecretFlagsFromVault = async (
  accountIds: string[],
): Promise<Record<string, boolean>> => {
  const result = (await ipcRenderer.invoke("vault:listAccountSecretFlags", {
    accountIds,
  })) as unknown;
  const expectedAccountIds = [...new Set(accountIds)];
  const flags = requireFirstReleaseIpcInputObject<Record<string, boolean>>(
    result,
    {
      label: "Secure vault account secret flags",
      required: expectedAccountIds,
    },
  );
  if (Object.values(flags).some((value) => typeof value !== "boolean")) {
    throw new Error(
      "Secure vault account secret flags returned invalid values.",
    );
  }
  return { ...flags };
};

const isCanonicalBase64UrlBytes = (
  value: string,
  exactBytes: number,
): boolean => {
  const decoded = Buffer.from(value, "base64url");
  try {
    return (
      decoded.length === exactBytes && decoded.toString("base64url") === value
    );
  } finally {
    // Validation must not leave decoded private-key material to GC alone.
    decoded.fill(0);
  }
};

const parseConfidentialReceiveKeyRecord = (
  value: unknown,
  expectedAccountId: string | undefined,
  label: string,
): ConfidentialReceiveKeyRecord => {
  const record =
    requireFirstReleaseIpcInputObject<ConfidentialReceiveKeyRecord>(value, {
      label,
      required: [
        "keyId",
        "accountId",
        "ownerTagHex",
        "diversifierHex",
        "publicKeyBase64Url",
        "privateKeyBase64Url",
        "createdAtMs",
      ],
    });
  const keyId = requireFirstReleaseInputText(
    record.keyId,
    `${label}.keyId`,
    64,
  );
  const publicKey = requireFirstReleaseInputText(
    record.publicKeyBase64Url,
    `${label}.publicKeyBase64Url`,
    64,
  );
  const privateKey = requireFirstReleaseInputText(
    record.privateKeyBase64Url,
    `${label}.privateKeyBase64Url`,
    64,
  );
  const accountId = requireFirstReleaseInputText(
    record.accountId,
    `${label}.accountId`,
    512,
  );
  if (
    !isCanonicalBase64UrlBytes(keyId, 18) ||
    accountId.normalize("NFC") !== accountId ||
    (expectedAccountId !== undefined && accountId !== expectedAccountId) ||
    !/^[0-9a-f]{64}$/u.test(record.ownerTagHex) ||
    !/^[0-9a-f]{64}$/u.test(record.diversifierHex) ||
    !isCanonicalBase64UrlBytes(publicKey, 32) ||
    !isCanonicalBase64UrlBytes(privateKey, 32) ||
    !Number.isSafeInteger(record.createdAtMs) ||
    Object.is(record.createdAtMs, -0) ||
    record.createdAtMs < 0
  ) {
    throw new Error(`${label} is not a canonical receive-key record.`);
  }
  return {
    keyId,
    accountId,
    ownerTagHex: record.ownerTagHex,
    diversifierHex: record.diversifierHex,
    publicKeyBase64Url: publicKey,
    privateKeyBase64Url: privateKey,
    createdAtMs: record.createdAtMs,
  };
};

const storeConfidentialReceiveKeysInVault = async (
  inputs: readonly ConfidentialReceiveKeyRecord[],
): Promise<void> => {
  const records = requireFirstReleaseInputArray(
    inputs,
    "Confidential receive-key storage batch",
    SECURE_VAULT_MAX_RECEIVE_KEY_BATCH,
  ).map((record, index) =>
    parseConfidentialReceiveKeyRecord(
      record,
      undefined,
      `Confidential receive-key storage batch[${index}]`,
    ),
  );
  const response = requireFirstReleaseIpcInputObject<{ stored: number }>(
    await ipcRenderer.invoke("vault:storeReceiveKeys", { records }),
    {
      label: "Secure vault receive-key batch response",
      required: ["stored"],
    },
  );
  if (
    !Number.isSafeInteger(response.stored) ||
    Object.is(response.stored, -0) ||
    response.stored !== records.length
  ) {
    throw new Error(
      "Secure vault receive-key batch returned an invalid response.",
    );
  }
};

const listConfidentialReceiveKeysForAccount = async (
  accountId: string,
): Promise<ConfidentialReceiveKeyRecord[]> => {
  const result = (await ipcRenderer.invoke("vault:listReceiveKeysForAccount", {
    accountId,
  })) as unknown;
  return requireFirstReleaseInputArray(
    result,
    "Confidential receive-key list",
    SECURE_VAULT_MAX_RECEIVE_KEYS_PER_ACCOUNT,
  ).map((record, index) =>
    parseConfidentialReceiveKeyRecord(
      record,
      accountId,
      `Confidential receive key ${index}`,
    ),
  );
};

type HealthResponse = ToriiHealth;
type RegisterAccountInput = {
  toriiUrl: string;
  chainId: string;
  networkPrefix: number;
  accountId: string;
  metadata?: Record<string, unknown>;
  authorityAccountId: string;
};

type TransferAssetInput = {
  toriiUrl: string;
  chainId: string;
  assetDefinitionId: string;
  accountId: string;
  destinationAccountId: string;
  networkPrefix: number;
  quantity: string;
  memo?: string;
};

type ResolveAccountAliasInput = {
  toriiUrl: string;
  alias: string;
  networkPrefix: number;
};

type AccountAliasResolutionResponse = {
  alias: string;
  accountId: string;
  resolved: boolean;
  source?: string;
};

type ExportConfidentialWalletBackupInput = {
  toriiUrl: string;
  chainId: string;
  networkPrefix: number;
  accountId: string;
  mnemonic: string;
};

type ImportConfidentialWalletBackupInput = {
  toriiUrl: string;
  chainId: string;
  networkPrefix: number;
  accountId: string;
  mnemonic: string;
  confidentialWallet: ConfidentialWalletBackupMetadata;
};

type ConfidentialPaymentAddress = {
  schema: "iroha-confidential-payment-address/v3";
  receiveKeyId: string;
  receivePublicKeyBase64Url: string;
  shieldedOwnerTagHex: string;
  shieldedDiversifierHex: string;
  recoveryHint: "one-time-receive-key";
};

type ConfidentialAssetBalanceResponse = {
  resolvedAssetId: string;
  quantity: string | null;
  onChainQuantity: string | null;
  spendableQuantity: string;
  exact: boolean;
  scanSource: "global-note-index" | "account-transactions";
  scanStatus: "complete" | "limited" | "incomplete";
  scanWatermarkBlock: number | null;
  recoveredNoteCount: number;
  trackedAssetIds: string[];
};

type ConfidentialWalletBackupStatePayload = {
  schema: "iroha-demo-confidential-wallet-state/v1";
  receiveKeys: Array<{
    keyId: string;
    ownerTagHex: string;
    diversifierHex: string;
    publicKeyBase64Url: string;
    privateKeyBase64Url: string;
    createdAtMs: number;
  }>;
  shadowTransactions: PendingConfidentialWalletShadowTransaction[];
};

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

type VpnProfileResponse = VpnProfile | null;

type VpnStatusResponse = {
  state:
    | "idle"
    | "connecting"
    | "connected"
    | "disconnecting"
    | "reconciling"
    | "remote-expiry-pending"
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

type VpnReceiptResponse = VpnReceipt;

type AssetsResponse = AccountAssetsResponse;

type TransactionsResponse = AccountTransactionsResponse;

type GovernanceCouncilResponse = GovernanceCouncilCurrentResponseView;

type GovernanceCitizenCountResponse = {
  total: number | null;
  endpointAvailable: boolean;
};

type AccountOnboardingResponse = {
  account_id: string;
  tx_hash_hex: string;
  status: "FINALIZED";
  finality: TransactionFinalityProof;
};

type NexusStakingPolicyResponse = {
  unbondingDelayMs: number | null;
};

type KaigiSignalKeyPair = KaigiX25519KeyPair;
type KaigiMeetingPrivacy = "transparent";
type KaigiOfferDescription = {
  type: "offer";
  sdp: string;
};
type KaigiAnswerDescription = {
  type: "answer";
  sdp: string;
};

type KaigiCreateMeetingInput = {
  toriiUrl: string;
  chainId: string;
  networkPrefix: number;
  hostAccountId: string;
  callId: string;
  title?: string;
  scheduledStartMs: number;
  meetingCode: string;
  inviteSecretBase64Url: string;
  hostDisplayName: string;
  hostParticipantId: string;
  hostKaigiPublicKeyBase64Url: string;
  offerDescription: KaigiOfferDescription;
  privacyMode: "transparent";
};

type KaigiJoinMeetingInput = {
  toriiUrl: string;
  chainId: string;
  networkPrefix: number;
  participantAccountId: string;
  callId: string;
  inviteSecretBase64Url: string;
  participantId: string;
  participantName: string;
  answerDescription: KaigiAnswerDescription;
};

type KaigiGetMeetingInput = {
  toriiUrl: string;
  networkPrefix: number;
  callId: string;
  inviteSecretBase64Url: string;
};

type KaigiPollMeetingSignalsInput = {
  toriiUrl: string;
  chainId: string;
  networkPrefix: number;
  accountId: string;
  callId: string;
  hostKaigiKeys: KaigiSignalKeyPair;
  afterTimestampMs?: number;
  limit?: number;
};

type KaigiEndMeetingInput = {
  toriiUrl: string;
  chainId: string;
  networkPrefix: number;
  hostAccountId: string;
  callId: string;
  endedAtMs?: number;
};

type KaigiMeetingSignalRecord = {
  entrypointHash: string;
  authority: string;
  timestampMs: number;
  callId: string;
  participantAccountId: string;
  participantId: string;
  participantName: string;
  walletIdentity?: string;
  roomId?: string;
  createdAtMs: number;
  answerDescription: KaigiAnswerDescription;
};

type KaigiMeetingView = {
  callId: string;
  meetingCode: string;
  title?: string;
  hostAccountId: string;
  hostDisplayName?: string;
  hostParticipantId?: string;
  hostKaigiPublicKeyBase64Url: string;
  scheduledStartMs: number;
  expiresAtMs: number;
  createdAtMs: number;
  live: boolean;
  ended: boolean;
  endedAtMs?: number;
  privacyMode: KaigiMeetingPrivacy;
  offerDescription: KaigiOfferDescription;
};

type PendingConfidentialWalletShadowTransaction = {
  hash: string;
  createdAtMs: number;
  authority: string;
  metadata: Record<string, unknown> | null;
  instructions: Array<Record<string, unknown>>;
};

type PendingConfidentialWalletShadowState = {
  schema: "iroha-demo-confidential-wallet-shadow/v1";
  transactions: PendingConfidentialWalletShadowTransaction[];
};

type KaigiCallEvent = {
  kind: "roster_updated" | "ended" | "stream_closed";
  callId: string;
  endedAtMs?: number;
};

type KaigiWatchCallEventsInput = {
  toriiUrl: string;
  callId: string;
};

type KaigiCallEventCallback = (event: KaigiCallEvent) => void | Promise<void>;

type FaucetStatusCallback = (
  progress: FaucetRequestProgress,
) => void | Promise<void>;

type NexusPublicLaneBaseInput = {
  toriiUrl: string;
  laneId: number;
};

type NexusPublicLaneStakeInput = NexusPublicLaneBaseInput & {
  networkPrefix: number;
  validator?: string;
};

type NexusPublicLaneRewardsInput = NexusPublicLaneBaseInput & {
  networkPrefix: number;
  account: string;
  assetId?: string;
  uptoEpoch?: number;
};

type BondPublicLaneStakeInput = {
  toriiUrl: string;
  chainId: string;
  networkPrefix: number;
  stakeAccountId: string;
  validator: string;
  amount: string;
};

type RegisterPublicLaneValidatorInput = {
  toriiUrl: string;
  chainId: string;
  networkPrefix: number;
  laneId: number;
  validatorAccountId: string;
  stakeAccountId?: string;
  peerId: string;
  selfStake: string;
  metadata?: Record<string, unknown>;
};

type SchedulePublicLaneUnbondInput = {
  toriiUrl: string;
  chainId: string;
  networkPrefix: number;
  stakeAccountId: string;
  validator: string;
  amount: string;
  requestId: string;
  releaseAtMs: number;
};

type FinalizePublicLaneUnbondInput = {
  toriiUrl: string;
  chainId: string;
  networkPrefix: number;
  stakeAccountId: string;
  validator: string;
  requestId: string;
};

type ClaimPublicLaneRewardsInput = {
  toriiUrl: string;
  chainId: string;
  networkPrefix: number;
  stakeAccountId: string;
  validator: string;
};

type AccountPermissionsInput = {
  toriiUrl: string;
  networkPrefix: number;
  accountId: string;
  limit?: number;
  offset?: number;
};

type VpnAvailabilityInput = {
  toriiUrl: string;
};

type VpnConnectInput = {
  toriiUrl: string;
  chainId: string;
  accountId: string;
  networkPrefix: number;
  exitClass: "standard" | "low-latency" | "high-security";
};

type VpnDisconnectInput = {
  toriiUrl: string;
  chainId: string;
  accountId: string;
  networkPrefix: number;
};

type VpnStatusInput = VpnDisconnectInput;

type GovernanceCitizenStatusInput = {
  toriiUrl: string;
  accountId: string;
  networkPrefix: number;
};

type GovernanceProposalListInput = {
  toriiUrl: string;
  limit?: number;
  cursor?: string | null;
};

type GovernanceProposalDetailInput = {
  toriiUrl: string;
  networkPrefix: number;
  proposalId: string;
};

type GovernanceWriteOperation = "register-citizen" | "propose";

type GovernancePrepareContext = {
  toriiUrl: string;
  chainId: string;
  accountId: string;
  networkPrefix: number;
};

type GovernanceProposalPrepareInput = GovernancePrepareContext & {
  kind: GovernanceWritableProposalKindId;
  payload: Record<string, unknown>;
};

type GovernanceCitizenRegistrationPrepareInput = GovernancePrepareContext & {
  amount: string;
};

type GovernancePreparedActionView = {
  reviewId: string;
  operation: GovernanceWriteOperation;
  title: string;
  proposalId: string | null;
  decodedInstruction: Record<string, unknown>;
  fee: {
    payer: "authority" | "sponsor";
    components: Array<{
      kind: string;
      assetDefinitionId: string;
      maxAmount: string;
    }>;
    nextBlockHeight: string;
  };
  expiresAtMs: number;
};

type GovernanceFinalizedActionView = TransactionSubmissionResultView & {
  operation: GovernanceWriteOperation;
  proposalId: string | null;
  status: "finalized";
};

type SubscriptionStatusView =
  | "active"
  | "paused"
  | "past_due"
  | "canceled"
  | "suspended";

type SubscriptionPlanListResponseView = {
  items: Array<{
    plan_id: string;
    plan: Record<string, unknown>;
  }>;
  total: number;
};

type SubscriptionListItemView = {
  subscription_id: string;
  subscription: Record<string, unknown>;
  invoice: Record<string, unknown> | null;
  plan: Record<string, unknown> | null;
};

type SubscriptionListResponseView = {
  items: SubscriptionListItemView[];
  total: number;
};

type TransactionSubmissionResultView = {
  hash: string;
  feeQuote?: TransactionFeeQuoteView;
  finality: TransactionFinalityProof;
};

type SubscriptionMutationActionView = "create" | SubscriptionActionDraftName;

type SubscriptionActionResponseView = {
  ok: boolean;
  action: SubscriptionMutationActionView;
  subscription_id: string;
  tx_hash_hex: string;
  finality: TransactionFinalityProof;
  state_status: "confirmed" | "advanced" | "indexing";
  reconciliation_message?: string;
  feeQuote?: TransactionFeeQuoteView;
  billing_trigger_id?: string;
  usage_trigger_id?: string | null;
  first_charge_ms?: number;
};

type SubscriptionListPlansInput = {
  toriiUrl: string;
  provider?: string;
  limit?: number;
  offset?: number;
};

type SubscriptionListInput = {
  toriiUrl: string;
  ownedBy?: string;
  provider?: string;
  status?: SubscriptionStatusView;
  limit?: number;
  offset?: number;
};

type SubscriptionGetInput = {
  toriiUrl: string;
  subscriptionId: string;
};

type SubscriptionCreateInput = {
  toriiUrl: string;
  chainId: string;
  networkPrefix: number;
  accountId: string;
  subscriptionId: string;
  planId: string;
  firstChargeMs?: number;
};

type SubscriptionActionInput = {
  toriiUrl: string;
  chainId: string;
  networkPrefix: number;
  accountId: string;
  subscriptionId: string;
  chargeAtMs?: number;
  cancelMode?: SubscriptionCancelMode;
};

type SubscriptionReconcileInput = {
  toriiUrl: string;
  chainId: string;
  networkPrefix: number;
  accountId: string;
  subscriptionId: string;
  action: SubscriptionMutationActionView;
  transactionHash: string;
};

type PendingSubscriptionReconciliation = {
  toriiUrl: string;
  chainId: string;
  networkPrefix: number;
  accountId: string;
  subscriptionId: string;
  action: SubscriptionMutationActionView;
  transactionHash: string;
  expected: SubscriptionStateDraft;
  plan: Record<string, unknown> | null;
  receipt: SubscriptionActionResponseView;
};

const pendingSubscriptionReconciliations = new Map<
  string,
  PendingSubscriptionReconciliation
>();
const inFlightSubscriptionMutations = new Set<string>();

const subscriptionMutationScopeKey = (input: {
  toriiUrl: string;
  chainId: string;
  networkPrefix: number;
  accountId: string;
  subscriptionId: string;
}) =>
  [
    normalizeBaseUrl(input.toriiUrl),
    input.chainId,
    String(input.networkPrefix),
    input.accountId,
    input.subscriptionId,
  ].join("\u001f");

type SoraCloudStatusInput = {
  toriiUrl: string;
};

type SoraCloudHfSharedLeaseStatusInput = SoraCloudStatusInput & {
  repoId: string;
  revision: string;
  storageClass: SoraCloudStorageClass;
  leaseTermMs: number;
  accountId?: string;
};

type IrohaBridge = {
  ping(config: ToriiConfig): Promise<HealthResponse>;
  getChainMetadata(config: ToriiConfig): Promise<ChainMetadataResponse>;
  inspectEndpoint(config: EndpointNetworkContext): Promise<EndpointInspection>;
  confirmEndpointNetworkIdentity(input: {
    toriiUrl: string;
    networkId: string;
  }): Promise<{ confirmed: boolean }>;
  getSigningAlgorithms(config: ToriiConfig): Promise<SigningAlgorithmOption[]>;
  generateKeyPair(input: { signingAlgorithm: string; seedHex?: string }): {
    publicKeyHex: string;
    privateKeyHex: string;
    signingAlgorithm: string;
  };
  generateKaigiSignalKeyPair(): KaigiSignalKeyPair;
  isSecureVaultAvailable(): Promise<boolean>;
  storeAccountSecret(input: {
    accountId: string;
    networkPrefix: number;
    privateKeyHex: string;
    signingAlgorithm: string;
  }): Promise<void>;
  listAccountSecretFlags(input: {
    accountIds: string[];
    networkPrefix: number;
  }): Promise<Record<string, boolean>>;
  copyTextToClipboard(input: { text: string }): Promise<void>;
  deriveAccountAddress(input: {
    domain: string;
    publicKeyHex: string;
    networkPrefix: number;
    signingAlgorithm: string;
  }): {
    accountId: string;
    i105AccountId: string;
    i105DefaultAccountId: string;
    i105DefaultFullwidthAccountId?: string;
    publicKeyHex: string;
    signingAlgorithm: string;
    accountIdWarning: string;
  };
  validateCanonicalAccountId(input: {
    accountId: string;
    networkPrefix?: number;
  }): string;
  derivePublicKey(input: { privateKeyHex: string; signingAlgorithm: string }): {
    publicKeyHex: string;
    signingAlgorithm: string;
  };
  resolveAccountAlias(
    input: ResolveAccountAliasInput,
  ): Promise<AccountAliasResolutionResponse>;
  createConfidentialPaymentAddress(input: {
    accountId: string;
    networkPrefix: number;
  }): Promise<ConfidentialPaymentAddress>;
  exportConfidentialWalletBackup(
    input: ExportConfidentialWalletBackupInput,
  ): Promise<ConfidentialWalletBackupMetadataV2>;
  importConfidentialWalletBackup(
    input: ImportConfidentialWalletBackupInput,
  ): Promise<void>;
  registerAccount(
    input: RegisterAccountInput,
  ): Promise<TransactionSubmissionResultView>;
  transferAsset(
    input: TransferAssetInput,
  ): Promise<TransactionSubmissionResultView>;
  setIrohaConnectContext(input: IrohaConnectWalletContext): void;
  resetIrohaConnectBoundary(): void;
  prepareIrohaConnectSession(
    input: Parameters<IrohaConnectBoundary["prepareSession"]>[0],
  ): ReturnType<IrohaConnectBoundary["prepareSession"]>;
  approveIrohaConnectSession(
    input: Parameters<IrohaConnectBoundary["approveSession"]>[0],
  ): ReturnType<IrohaConnectBoundary["approveSession"]>;
  processIrohaConnectFrame(input: {
    sessionToken: string;
    frameBase64: string;
  }): IrohaConnectProcessedFrame;
  approveIrohaConnectRequest(
    input: Parameters<IrohaConnectBoundary["approveRequest"]>[0],
  ): ReturnType<IrohaConnectBoundary["approveRequest"]>;
  rejectIrohaConnectRequest(
    input: Parameters<IrohaConnectBoundary["rejectRequest"]>[0],
  ): ReturnType<IrohaConnectBoundary["rejectRequest"]>;
  closeIrohaConnectSession(input: { sessionToken: string }): void;
  /** Take the pending `iroha://connect?...` link opened from another app. */
  takePendingIrohaConnectDeepLink(): Promise<string | null>;
  getConfidentialAssetPolicy(input: {
    toriiUrl: string;
    accountId: string;
    assetDefinitionId: string;
  }): Promise<ConfidentialAssetPolicyView>;
  getConfidentialAssetBalance(input: {
    toriiUrl: string;
    chainId: string;
    networkPrefix: number;
    accountId: string;
    assetDefinitionId: string;
  }): Promise<ConfidentialAssetBalanceResponse>;
  scanConfidentialWallet(input: {
    toriiUrl: string;
    chainId: string;
    networkPrefix: number;
    accountId: string;
    assetDefinitionId: string;
  }): Promise<ConfidentialAssetBalanceResponse>;
  fetchAccountAssets(input: {
    toriiUrl: string;
    accountId: string;
    networkPrefix: number;
    assetDefinitionId?: string;
    limit?: number;
    offset?: number;
  }): Promise<AssetsResponse>;
  fetchAccountTransactions(input: {
    toriiUrl: string;
    accountId: string;
    networkPrefix: number;
    limit?: number;
    offset?: number;
  }): Promise<TransactionsResponse>;
  listAccountPermissions(
    input: AccountPermissionsInput,
  ): Promise<AccountPermissionsResponse>;
  getGovernanceCapabilities(
    input: ToriiConfig,
  ): Promise<GovernanceCapabilitiesV1>;
  getGovernanceCitizenStatus(
    input: GovernanceCitizenStatusInput,
  ): Promise<GovernanceCitizenStatusResponse>;
  getGovernanceCitizenCount(
    config: ToriiConfig,
  ): Promise<GovernanceCitizenCountResponse>;
  getGovernanceUnlockStats(input: {
    toriiUrl: string;
    chainId: string;
    networkPrefix: number;
    accountId: string;
  }): Promise<GovernanceUnlockStatsResponse>;
  getGovernanceCouncilCurrent(
    config: ToriiConfig,
  ): Promise<GovernanceCouncilResponse>;
  listGovernanceProposals(
    input: GovernanceProposalListInput,
  ): Promise<GovernanceProposalList>;
  getGovernanceProposalDetail(
    input: GovernanceProposalDetailInput,
  ): Promise<GovernanceProposalDetail>;
  getGovernanceCurrentValidationFeePolicy(input: {
    toriiUrl: string;
    chainId: string;
    networkPrefix: number;
  }): Promise<GovernanceValidationFeePolicyView>;
  prepareGovernanceCitizenRegistration(
    input: GovernanceCitizenRegistrationPrepareInput,
  ): Promise<GovernancePreparedActionView>;
  prepareGovernanceProposal(
    input: GovernanceProposalPrepareInput,
  ): Promise<GovernancePreparedActionView>;
  confirmGovernanceAction(input: {
    reviewId: string;
    accountId: string;
  }): Promise<GovernanceFinalizedActionView>;
  getExplorerMetrics(
    config: ToriiConfig,
  ): Promise<ExplorerMetricsResponse | null>;
  getNetworkStats(input: {
    toriiUrl: string;
    assetDefinitionId: string;
    networkPrefix: number;
  }): Promise<NetworkStatsResponse>;
  getExplorerAccountQr(input: {
    toriiUrl: string;
    accountId: string;
    networkPrefix: number;
  }): Promise<ExplorerAccountQrResponse>;
  getVpnAvailability(
    input: VpnAvailabilityInput,
  ): Promise<VpnAvailabilityResponse>;
  getVpnProfile(input: VpnAvailabilityInput): Promise<VpnProfileResponse>;
  getVpnStatus(input?: VpnStatusInput): Promise<VpnStatusResponse>;
  connectVpn(input: VpnConnectInput): Promise<VpnStatusResponse>;
  disconnectVpn(input?: VpnDisconnectInput): Promise<VpnStatusResponse>;
  repairVpn(): Promise<VpnStatusResponse>;
  listVpnReceipts(input?: VpnStatusInput): Promise<VpnReceiptResponse[]>;
  onboardAccount(input: {
    toriiUrl: string;
    chainId: string;
    networkPrefix: number;
    alias: string;
    accountId: string;
    identity?: Record<string, unknown>;
  }): Promise<AccountOnboardingResponse>;
  requestFaucetFunds(
    input: {
      toriiUrl: string;
      chainId: string;
      accountId: string;
      networkPrefix: number;
      requestId: string;
    },
    onStatus?: FaucetStatusCallback,
  ): Promise<AccountFaucetResult>;
  cancelFaucetRequest(input: { requestId: string }): Promise<{
    canceled: boolean;
  }>;
  createKaigiMeeting(
    input: KaigiCreateMeetingInput,
  ): Promise<TransactionSubmissionResultView>;
  getKaigiCall(input: KaigiGetMeetingInput): Promise<KaigiMeetingView>;
  joinKaigiMeeting(
    input: KaigiJoinMeetingInput,
  ): Promise<TransactionSubmissionResultView>;
  watchKaigiCallEvents(
    input: KaigiWatchCallEventsInput,
    onEvent: KaigiCallEventCallback,
  ): Promise<string>;
  stopWatchingKaigiCallEvents(input: { subscriptionId: string }): void;
  pollKaigiMeetingSignals(
    input: KaigiPollMeetingSignalsInput,
  ): Promise<KaigiMeetingSignalRecord[]>;
  endKaigiMeeting(
    input: KaigiEndMeetingInput,
  ): Promise<TransactionSubmissionResultView>;
  getSumeragiStatus(config: ToriiConfig): Promise<Record<string, unknown>>;
  getNexusLifecycle(config: ToriiConfig): Promise<NexusLifecycleView>;
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
  listSubscriptionPlans(
    input: SubscriptionListPlansInput,
  ): Promise<SubscriptionPlanListResponseView>;
  listSubscriptions(
    input: SubscriptionListInput,
  ): Promise<SubscriptionListResponseView>;
  getSubscription(
    input: SubscriptionGetInput,
  ): Promise<SubscriptionListItemView>;
  createSubscription(
    input: SubscriptionCreateInput,
  ): Promise<SubscriptionActionResponseView>;
  pauseSubscription(
    input: SubscriptionActionInput,
  ): Promise<SubscriptionActionResponseView>;
  resumeSubscription(
    input: SubscriptionActionInput,
  ): Promise<SubscriptionActionResponseView>;
  cancelSubscription(
    input: SubscriptionActionInput,
  ): Promise<SubscriptionActionResponseView>;
  keepSubscription(
    input: SubscriptionActionInput,
  ): Promise<SubscriptionActionResponseView>;
  chargeSubscriptionNow(
    input: SubscriptionActionInput,
  ): Promise<SubscriptionActionResponseView>;
  reconcileSubscriptionMutation(
    input: SubscriptionReconcileInput,
  ): Promise<SubscriptionActionResponseView>;
  getSoraCloudStatus(input: SoraCloudStatusInput): Promise<SoraCloudStatusView>;
  getSoraCloudHfSharedLeaseStatus(
    input: SoraCloudHfSharedLeaseStatusInput,
  ): Promise<SoraCloudHfStatusView>;
  getParameters(input: ToriiConfig): Promise<Record<string, unknown>>;
  bondPublicLaneStake(
    input: BondPublicLaneStakeInput,
  ): Promise<TransactionSubmissionResultView>;
  registerPublicLaneValidator(
    input: RegisterPublicLaneValidatorInput,
  ): Promise<TransactionSubmissionResultView>;
  schedulePublicLaneUnbond(
    input: SchedulePublicLaneUnbondInput,
  ): Promise<TransactionSubmissionResultView>;
  finalizePublicLaneUnbond(
    input: FinalizePublicLaneUnbondInput,
  ): Promise<TransactionSubmissionResultView>;
  claimPublicLaneRewards(
    input: ClaimPublicLaneRewardsInput,
  ): Promise<TransactionSubmissionResultView>;
};

class ApiRequestError extends Error {
  status: number;
  statusText: string;
  detail: string;
  label: string;
  retryAfterMs: number | null;

  constructor(input: {
    label: string;
    status: number;
    statusText: string;
    detail?: string;
    retryAfterMs?: number | null;
  }) {
    const detail = String(input.detail ?? "").trim();
    const statusSummary = formatHttpStatus(input.status, input.statusText);
    const redundantDetail = isRedundantHttpErrorDetail(
      detail,
      input.status,
      input.statusText,
    );
    const unavailableStatus = isToriiUnavailableStatus(input.status);
    super(
      unavailableStatus
        ? redundantDetail
          ? `${input.label} request failed because the Torii endpoint is unavailable (${statusSummary}).`
          : `${input.label} request failed because the Torii endpoint is unavailable (${statusSummary}). Detail: ${detail}`
        : detail
          ? `${input.label} request failed with status ${input.status} (${input.statusText}): ${detail}`
          : `${input.label} request failed with status ${input.status} (${input.statusText})`,
    );
    this.name = "ApiRequestError";
    this.status = input.status;
    this.statusText = input.statusText;
    this.detail = detail;
    this.label = input.label;
    this.retryAfterMs = input.retryAfterMs ?? null;
  }
}

const createApiRequestError = async (
  response: Pick<Response, "status" | "statusText" | "headers" | "arrayBuffer">,
  label: string,
) =>
  new ApiRequestError({
    label,
    status: response.status,
    statusText: response.statusText,
    detail: await readBoundedApiErrorDetail(response),
    retryAfterMs: parseRetryAfterMs(response.headers.get("retry-after")),
  });

const isApiRequestError = (error: unknown): error is ApiRequestError =>
  error instanceof ApiRequestError;

const TORII_UNAVAILABLE_STATUSES = new Set([502, 503, 504]);

const isToriiUnavailableStatus = (status: number) =>
  TORII_UNAVAILABLE_STATUSES.has(status);

const formatHttpStatus = (status: number, statusText?: string) => {
  const trimmedStatusText = String(statusText ?? "").trim();
  return trimmedStatusText ? `${status} ${trimmedStatusText}` : String(status);
};

const normalizeHttpErrorDetail = (value: string) =>
  value.trim().replace(/\.+$/, "").toLowerCase();

const isRedundantHttpErrorDetail = (
  detail: string,
  status: number,
  statusText?: string,
) => {
  const normalizedDetail = normalizeHttpErrorDetail(detail);
  if (!normalizedDetail) {
    return true;
  }
  const normalizedStatusText = normalizeHttpErrorDetail(statusText ?? "");
  return (
    normalizedDetail === normalizedStatusText ||
    normalizedDetail === normalizeHttpErrorDetail(String(status)) ||
    normalizedDetail ===
      normalizeHttpErrorDetail(formatHttpStatus(status, statusText))
  );
};

const MAX_ACTIVE_KAIGI_CALL_WATCHERS = 8;
const kaigiCallWatchers = new Map<string, AbortController>();
const faucetRequestControllers = new Map<string, AbortController>();

const createFaucetAbortError = () => {
  const error = new Error("Faucet request canceled.");
  error.name = "AbortError";
  return error;
};

const readAbortReason = (signal: AbortSignal) =>
  signal.reason instanceof Error ? signal.reason : createFaucetAbortError();

const throwIfAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) {
    throw readAbortReason(signal);
  }
};

const waitForMs = (delayMs: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(readAbortReason(signal));
      return;
    }
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let onAbort: (() => void) | null = null;
    const cleanup = () => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (onAbort) {
        signal?.removeEventListener("abort", onAbort);
      }
    };
    onAbort = () => {
      cleanup();
      reject(signal ? readAbortReason(signal) : createFaucetAbortError());
    };
    timeoutId = setTimeout(() => {
      cleanup();
      resolve();
    }, delayMs);
    signal?.addEventListener("abort", onAbort, { once: true });
  });

const toHex = (buffer: Buffer) => buffer.toString("hex");

const hexToBuffer = (hex: string, label: string) => {
  if (
    typeof hex !== "string" ||
    hex.length === 0 ||
    hex.length > FIRST_RELEASE_CRYPTO_KEY_MATERIAL_MAX_BYTES * 2 ||
    hex.length % 2 !== 0 ||
    !/^[0-9a-f]+$/u.test(hex)
  ) {
    throw new Error(
      `${label} must be a bounded canonical lowercase hex string`,
    );
  }
  return Buffer.from(hex, "hex");
};

const withPrivateKeyBuffer = <T>(
  privateKeyHex: string,
  label: string,
  operation: (privateKey: Buffer) => T,
): T => {
  const privateKey = hexToBuffer(privateKeyHex, label);
  try {
    return operation(privateKey);
  } finally {
    privateKey.fill(0);
  }
};

const withPrivateKeyBufferAsync = async <T>(
  privateKeyHex: string,
  label: string,
  operation: (privateKey: Buffer) => Promise<T>,
): Promise<T> => {
  const privateKey = hexToBuffer(privateKeyHex, label);
  try {
    return await operation(privateKey);
  } finally {
    privateKey.fill(0);
  }
};

const normalizePrivateKeyHex = (privateKeyHex: string) =>
  withPrivateKeyBuffer(privateKeyHex, "privateKeyHex", (privateKey) =>
    privateKey.toString("hex"),
  );

const normalizeBridgeSigningAlgorithm = (value?: unknown): CryptoAlgorithm => {
  const candidate = trimString(value) || DEFAULT_SIGNING_ALGORITHM;
  try {
    return normalizeCryptoAlgorithm(candidate);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Unsupported signing algorithm "${candidate}": ${detail}`);
  }
};

const normalizeRequiredBridgeSigningAlgorithm = (
  value: unknown,
): CryptoAlgorithm => {
  if (typeof value !== "string" || !value || value.trim() !== value) {
    throw new Error("signingAlgorithm must be an explicit canonical string.");
  }
  const normalized = normalizeBridgeSigningAlgorithm(value);
  if (normalized !== value) {
    throw new Error("signingAlgorithm must use a canonical SDK algorithm ID.");
  }
  return normalized;
};

const toSigningAlgorithmOption = (
  algorithm: string,
): SigningAlgorithmOption => {
  const id = normalizeBridgeSigningAlgorithm(algorithm);
  return {
    id,
    label: signingAlgorithmLabel(id),
    isDefault: id === DEFAULT_SIGNING_ALGORITHM,
  };
};

const dedupeSigningAlgorithms = (algorithms: Iterable<unknown>): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const algorithm of algorithms) {
    try {
      const id = normalizeBridgeSigningAlgorithm(algorithm);
      if (!seen.has(id)) {
        seen.add(id);
        result.push(id);
      }
    } catch {
      // Ignore malformed endpoint capability entries and rely on local support.
    }
  }
  return result;
};

const resolveSigningAlgorithmOptions = async (
  _config: ToriiConfig,
): Promise<SigningAlgorithmOption[]> => {
  void _config;
  const localAlgorithms = dedupeSigningAlgorithms(supportedCryptoAlgorithms());
  return localAlgorithms.map(toSigningAlgorithmOption);
};

const CONNECT_SIGNING_ALGORITHM_CODES = new Map<string, number>([
  ["ed25519", 0],
  ["secp256k1", 1],
  ["ml-dsa", 4],
]);

const getConnectSigningAlgorithmCode = (algorithm: string): number => {
  const normalized = normalizeBridgeSigningAlgorithm(algorithm);
  const code = CONNECT_SIGNING_ALGORITHM_CODES.get(normalized);
  if (code === undefined) {
    throw new Error(
      `IrohaConnect does not support ${signingAlgorithmLabel(normalized)} signatures yet.`,
    );
  }
  return code;
};

type SigningMaterial = {
  privateKeyHex: string;
  signingAlgorithm: CryptoAlgorithm;
};

const normalizeSigningMaterial = (
  material: AccountSecretMaterial,
): SigningMaterial => ({
  privateKeyHex: normalizePrivateKeyHex(material.privateKeyHex),
  signingAlgorithm: normalizeBridgeSigningAlgorithm(material.signingAlgorithm),
});

const resolveOptionalSigningMaterial = async (input: {
  accountId: string;
  networkPrefix: number;
}): Promise<SigningMaterial | null> => {
  const accountId = normalizeCanonicalAccountIdLiteral(
    input.accountId,
    "accountId",
    input.networkPrefix,
  );
  const storedSecret = await getAccountSecretMaterialFromVault(accountId);
  if (!storedSecret) {
    return null;
  }
  const signingMaterial = normalizeSigningMaterial(storedSecret);
  const publicKeyHex = withPrivateKeyBuffer(
    signingMaterial.privateKeyHex,
    "privateKeyHex",
    (privateKey) =>
      toHex(
        publicKeyFromPrivate(privateKey, {
          algorithm: signingMaterial.signingAlgorithm,
        }),
      ),
  );
  requireAccountIdBoundToPublicKey({
    accountId,
    publicKeyHex,
    networkPrefix: input.networkPrefix,
    signingAlgorithm: signingMaterial.signingAlgorithm,
  });
  return signingMaterial;
};

const resolveSigningMaterial = async (input: {
  accountId: string;
  networkPrefix: number;
  operationLabel: string;
}): Promise<SigningMaterial> => {
  const resolved = await resolveOptionalSigningMaterial(input);
  if (resolved) {
    return resolved;
  }
  throw new Error(
    `${input.operationLabel} requires a stored wallet secret. Restore or save this wallet again.`,
  );
};

const assertEd25519SigningMaterial = (
  material: SigningMaterial,
  operationLabel: string,
) => {
  const normalized = normalizeSigningMaterial(material);
  if (normalized.signingAlgorithm !== DEFAULT_SIGNING_ALGORITHM) {
    throw new Error(
      `${operationLabel} currently requires an Ed25519 wallet because confidential wallet material is Ed25519-only.`,
    );
  }
  return normalized;
};

const resolveConfidentialWalletDecryptionContext = async (input: {
  accountId: string;
  networkPrefix: number;
  operationLabel: string;
}) => {
  const accountId = normalizeCanonicalAccountIdLiteral(
    input.accountId,
    "accountId",
    input.networkPrefix,
  );
  const signingMaterial = assertEd25519SigningMaterial(
    await resolveSigningMaterial({
      accountId,
      networkPrefix: input.networkPrefix,
      operationLabel: input.operationLabel,
    }),
    input.operationLabel,
  );
  const privateKeyHex = signingMaterial.privateKeyHex;
  const receiveKeys = await listConfidentialReceiveKeysForAccount(accountId);
  return {
    accountId,
    privateKeyHex,
    receiveKeys,
  };
};

const createStoredConfidentialReceiveDescriptor = async (input: {
  accountId: string;
  networkPrefix: number;
  operationLabel: string;
}) => {
  await assertSecureVaultAvailable(input.operationLabel);
  const { accountId, privateKeyHex } =
    await resolveConfidentialWalletDecryptionContext({
      accountId: input.accountId,
      networkPrefix: input.networkPrefix,
      operationLabel: input.operationLabel,
    });
  const shieldedAddress = deriveWalletConfidentialReceiveAddress({
    privateKeyHex,
  });
  const receiveKeys = generateKaigiX25519KeyPair();
  const keyId = randomBytes(18).toString("base64url");
  const storedKey: ConfidentialReceiveKeyRecord = {
    keyId,
    accountId,
    ownerTagHex: shieldedAddress.ownerTagHex,
    diversifierHex: shieldedAddress.diversifierHex,
    publicKeyBase64Url: receiveKeys.publicKeyBase64Url,
    privateKeyBase64Url: receiveKeys.privateKeyBase64Url,
    createdAtMs: Date.now(),
  };
  await storeConfidentialReceiveKeysInVault([storedKey]);
  return {
    receiveKeyId: storedKey.keyId,
    receivePublicKeyBase64Url: storedKey.publicKeyBase64Url,
    ownerTagHex: storedKey.ownerTagHex,
    diversifierHex: storedKey.diversifierHex,
  };
};

const normalizeLaneId = (laneId: number) => {
  if (
    !Number.isSafeInteger(laneId) ||
    Object.is(laneId, -0) ||
    laneId < 0 ||
    laneId > 0xffff_ffff
  ) {
    throw new Error("laneId must be an exact unsigned 32-bit integer.");
  }
  return laneId;
};

const normalizePositiveEpoch = (value: number, label: string) => {
  if (!Number.isSafeInteger(value) || Object.is(value, -0) || value < 0) {
    throw new Error(`${label} must be an exact non-negative safe integer.`);
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

const normalizeNonEmptyString = (value: string, label: string) => {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${label} is required.`);
  }
  return normalized;
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

const normalizeRequestId = (value: string) => {
  const requestId = value.trim();
  if (!requestId) {
    throw new Error("requestId must be a non-empty string.");
  }
  return requestId;
};

const CONFIDENTIAL_WALLET_BACKUP_ACCOUNT_TX_PAGE_SIZE = 200;
const CONFIDENTIAL_TX_FINALITY_INTERVAL_MS = 500;
const CONFIDENTIAL_TX_FINALITY_TIMEOUT_MS = 600_000;
const CONFIDENTIAL_WALLET_SHADOW_SCHEMA =
  "iroha-demo-confidential-wallet-shadow/v1" as const;
const CONFIDENTIAL_WALLET_SHADOW_STORAGE_PREFIX =
  "iroha-demo:confidential-wallet:";
const RETIRED_CONFIDENTIAL_WALLET_SHADOW_STORAGE_NAMESPACE =
  "iroha-demo:confidential-wallet";
const CONFIDENTIAL_WALLET_SHADOW_STORAGE_NAMESPACE =
  "iroha-demo:confidential-wallet:v1";
const SHADOW_STATE_MAX_BYTES = 2 * 1024 * 1024;

const binaryToBuffer = (
  value: Buffer | ArrayBuffer | ArrayBufferView,
): Buffer => {
  if (Buffer.isBuffer(value)) {
    return value;
  }
  if (value instanceof ArrayBuffer) {
    return Buffer.from(value);
  }
  return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
};

const VERSIONED_TRANSACTION_PAYLOAD_VERSION = 0x01;
const PIPELINE_TRANSACTION_RECEIPT_MAX_BYTES = 1024 * 1024;

type IrohaNativeTransactionCodec = {
  encodeSignedTransactionVersioned?: (
    payload: Buffer,
  ) => Buffer | Uint8Array | ArrayBuffer | ArrayBufferView;
  decodeTransactionReceiptJson?: (payload: Buffer) => string;
};

const nativeCodecBytesToBuffer = (
  value: Buffer | Uint8Array | ArrayBuffer | ArrayBufferView,
  label: string,
): Buffer => {
  try {
    return binaryToBuffer(value);
  } catch (error) {
    throw new Error(
      `${label} returned bytes that could not be normalized: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
};

const encodeSignedTransactionForPipeline = (
  signedTransaction: Buffer,
  options: {
    nativeBinding?: unknown;
  } = {},
): Buffer => {
  const native = options.nativeBinding as
    | IrohaNativeTransactionCodec
    | undefined;
  if (typeof native?.encodeSignedTransactionVersioned !== "function") {
    throw new Error(
      "Canonical VersionedSignedTransaction V1 validation requires native encodeSignedTransactionVersioned.",
    );
  }
  const input = Buffer.from(signedTransaction);
  const encoded = nativeCodecBytesToBuffer(
    native.encodeSignedTransactionVersioned(input),
    "encodeSignedTransactionVersioned",
  );
  if (
    encoded.length === 0 ||
    encoded[0] !== VERSIONED_TRANSACTION_PAYLOAD_VERSION
  ) {
    throw new Error(
      "Native signed transaction encoder did not return VersionedSignedTransaction V1 bytes.",
    );
  }
  if (!encoded.equals(input)) {
    throw new Error(
      "Signed transaction input was not the exact canonical VersionedSignedTransaction V1 encoding.",
    );
  }
  return encoded;
};

const confidentialWalletShadowStateCache = new Map<
  string,
  PendingConfidentialWalletShadowState
>();

type EndpointScopedStorageKeys = {
  current: string | null;
  retired: readonly string[];
};

const deleteEndpointDerivedStateKeys = (
  keys: readonly string[],
  cache: Map<string, unknown>,
) => {
  for (const key of new Set(keys)) {
    cache.delete(key);
    try {
      globalThis.localStorage?.removeItem(key);
    } catch {
      // Retired endpoint-derived state remains unusable even when storage is
      // unavailable for deletion.
    }
  }
};

const deleteInvalidCurrentShadowState = (
  key: string,
  cache: Map<string, unknown>,
) => {
  cache.delete(key);
  try {
    globalThis.localStorage?.removeItem(key);
  } catch {
    // Invalid state is never read again during this renderer run.
  }
};

const newConfidentialWalletShadowState =
  (): PendingConfidentialWalletShadowState => ({
    schema: CONFIDENTIAL_WALLET_SHADOW_SCHEMA,
    transactions: [],
  });

const getConfidentialWalletShadowKeys = (input: {
  toriiUrl: string;
  accountId: string;
  endpointScope?: EndpointIdentityScopeInput | null;
}): EndpointScopedStorageKeys => ({
  current: input.endpointScope
    ? buildEndpointDerivedStorageKey(
        CONFIDENTIAL_WALLET_SHADOW_STORAGE_NAMESPACE,
        input.endpointScope,
        [input.accountId],
      )
    : null,
  retired: [
    ...(input.endpointScope
      ? [
          buildEndpointDerivedStorageKey(
            RETIRED_CONFIDENTIAL_WALLET_SHADOW_STORAGE_NAMESPACE,
            input.endpointScope,
            [input.accountId],
          ),
        ]
      : []),
    [
      CONFIDENTIAL_WALLET_SHADOW_STORAGE_PREFIX,
      normalizeBaseUrl(input.toriiUrl),
      input.accountId.trim().toLowerCase(),
    ].join(""),
  ],
});

const FORBIDDEN_SHADOW_SECRET_FIELDS = new Set([
  "invitesecret",
  "mnemonic",
  "passphrase",
  "password",
  "privatekey",
  "privatekeybase64url",
  "privatekeyhex",
  "receiveprivatekeybase64url",
  "recoveryphrase",
  "secret",
  "seedphrase",
  "x25519privatekey",
]);

const assertPublicShadowJsonValue = (
  value: unknown,
  label: string,
  depth = 0,
): void => {
  if (depth > 32) {
    throw new Error(`${label} exceeds the shadow JSON nesting limit.`);
  }
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`${label} contains a non-finite number.`);
    }
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > 2048) {
      throw new Error(`${label} exceeds the shadow JSON array limit.`);
    }
    value.forEach((entry, index) =>
      assertPublicShadowJsonValue(entry, `${label}[${index}]`, depth + 1),
    );
    return;
  }
  if (!isPlainRecord(value) || Object.keys(value).length > 256) {
    throw new Error(`${label} must contain bounded plain JSON objects.`);
  }
  for (const [key, entry] of Object.entries(value)) {
    if (
      !key ||
      key.trim() !== key ||
      ["__proto__", "constructor", "prototype"].includes(key) ||
      FORBIDDEN_SHADOW_SECRET_FIELDS.has(
        key.replace(/[^a-z0-9]/giu, "").toLowerCase(),
      )
    ) {
      throw new Error(`${label} contains a forbidden or invalid field.`);
    }
    assertPublicShadowJsonValue(entry, `${label}.${key}`, depth + 1);
  }
};

const clonePublicShadowRecord = (
  value: Record<string, unknown>,
  label: string,
): Record<string, unknown> => {
  const cloned = requireFirstReleaseJsonObject(value, label);
  assertPublicShadowJsonValue(cloned, label);
  return cloned;
};

const parsePendingConfidentialWalletShadowTransaction = (
  value: unknown,
  label = "Confidential wallet shadow transaction",
): PendingConfidentialWalletShadowTransaction => {
  if (!isPlainRecord(value)) {
    throw new Error(`${label} must be an object.`);
  }
  assertExactObjectKeys(
    value,
    ["hash", "createdAtMs", "authority", "metadata", "instructions"],
    label,
  );
  if (typeof value.hash !== "string" || !/^[0-9a-f]{64}$/u.test(value.hash)) {
    throw new Error(`${label}.hash must be canonical lowercase hex.`);
  }
  if (
    typeof value.createdAtMs !== "number" ||
    !Number.isSafeInteger(value.createdAtMs) ||
    value.createdAtMs < 0
  ) {
    throw new Error(`${label}.createdAtMs must be a non-negative integer.`);
  }
  if (
    typeof value.authority !== "string" ||
    !value.authority ||
    value.authority.trim() !== value.authority ||
    Buffer.byteLength(value.authority, "utf8") > 2048
  ) {
    throw new Error(`${label}.authority must be canonical bounded text.`);
  }
  if (value.metadata !== null && !isPlainRecord(value.metadata)) {
    throw new Error(`${label}.metadata must be an object or null.`);
  }
  let instructions: readonly unknown[];
  try {
    instructions = requireFirstReleaseInputArray(
      value.instructions,
      `${label}.instructions`,
      256,
    );
  } catch {
    throw new Error(`${label}.instructions must be a bounded object array.`);
  }
  if (!instructions.every(isPlainRecord)) {
    throw new Error(`${label}.instructions must be a bounded object array.`);
  }
  return {
    hash: value.hash,
    createdAtMs: value.createdAtMs,
    authority: value.authority,
    metadata:
      value.metadata === null
        ? null
        : clonePublicShadowRecord(value.metadata, `${label}.metadata`),
    instructions: instructions.map((entry, index) =>
      clonePublicShadowRecord(entry, `${label}.instructions[${index}]`),
    ),
  };
};

const parseStoredConfidentialWalletShadowState = (
  raw: string,
): PendingConfidentialWalletShadowState => {
  if (Buffer.byteLength(raw, "utf8") > SHADOW_STATE_MAX_BYTES) {
    throw new Error("Confidential wallet shadow state exceeds its byte limit.");
  }
  const parsed = parseStrictJson(raw, "Confidential wallet shadow state");
  if (!isPlainRecord(parsed)) {
    throw new Error("Confidential wallet shadow state must be an object.");
  }
  assertExactObjectKeys(
    parsed,
    ["schema", "transactions"],
    "Confidential wallet shadow state",
  );
  if (parsed.schema !== CONFIDENTIAL_WALLET_SHADOW_SCHEMA) {
    throw new Error("Confidential wallet shadow state schema is unsupported.");
  }
  if (!Array.isArray(parsed.transactions) || parsed.transactions.length > 128) {
    throw new Error(
      "Confidential wallet shadow transactions must be a bounded array.",
    );
  }
  const transactions = parsed.transactions.map((entry, index) =>
    parsePendingConfidentialWalletShadowTransaction(
      entry,
      `Confidential wallet shadow transactions[${index}]`,
    ),
  );
  if (
    new Set(transactions.map((entry) => entry.hash)).size !==
    transactions.length
  ) {
    throw new Error(
      "Confidential wallet shadow transaction hashes must be unique.",
    );
  }
  for (let index = 1; index < transactions.length; index += 1) {
    const previous = transactions[index - 1];
    const current = transactions[index];
    if (
      previous.createdAtMs > current.createdAtMs ||
      (previous.createdAtMs === current.createdAtMs &&
        previous.hash.localeCompare(current.hash) >= 0)
    ) {
      throw new Error(
        "Confidential wallet shadow transactions are not canonically ordered.",
      );
    }
  }
  const state: PendingConfidentialWalletShadowState = {
    schema: CONFIDENTIAL_WALLET_SHADOW_SCHEMA,
    transactions,
  };
  if (JSON.stringify(state) !== raw) {
    throw new Error("Confidential wallet shadow state is not canonical JSON.");
  }
  return state;
};

const readConfidentialWalletShadowState = (
  keys: EndpointScopedStorageKeys,
  options: Readonly<{ requireDurable?: boolean }> = {},
): PendingConfidentialWalletShadowState => {
  deleteEndpointDerivedStateKeys(
    keys.retired,
    confidentialWalletShadowStateCache,
  );
  if (!keys.current) {
    if (options.requireDurable === true) {
      throw new Error(
        "Confidential wallet shadow state requires a trusted endpoint identity scope.",
      );
    }
    return newConfidentialWalletShadowState();
  }
  const key = keys.current;
  const cached = confidentialWalletShadowStateCache.get(key);
  if (cached && options.requireDurable !== true) {
    return {
      schema: CONFIDENTIAL_WALLET_SHADOW_SCHEMA,
      transactions: cached.transactions.map((entry) => ({
        ...entry,
        metadata: entry.metadata ? { ...entry.metadata } : null,
        instructions: entry.instructions.map((instruction) => ({
          ...instruction,
        })),
      })),
    };
  }
  const storage = globalThis.localStorage;
  if (!storage) {
    if (options.requireDurable === true) {
      throw new Error("Confidential wallet shadow storage is unavailable.");
    }
    const empty = newConfidentialWalletShadowState();
    confidentialWalletShadowStateCache.set(key, empty);
    return {
      schema: CONFIDENTIAL_WALLET_SHADOW_SCHEMA,
      transactions: [],
    };
  }
  try {
    const raw = storage.getItem(key);
    if (raw === null) {
      const empty = newConfidentialWalletShadowState();
      confidentialWalletShadowStateCache.set(key, empty);
      return {
        schema: CONFIDENTIAL_WALLET_SHADOW_SCHEMA,
        transactions: [],
      };
    }
    const state = parseStoredConfidentialWalletShadowState(raw);
    confidentialWalletShadowStateCache.set(key, state);
    return {
      schema: CONFIDENTIAL_WALLET_SHADOW_SCHEMA,
      transactions: state.transactions.map((entry) => ({
        ...entry,
        metadata: entry.metadata ? { ...entry.metadata } : null,
        instructions: entry.instructions.map((instruction) => ({
          ...instruction,
        })),
      })),
    };
  } catch (error) {
    if (options.requireDurable === true) {
      throw new Error(
        `Confidential wallet shadow state could not be read durably: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    deleteInvalidCurrentShadowState(key, confidentialWalletShadowStateCache);
    const empty = newConfidentialWalletShadowState();
    confidentialWalletShadowStateCache.set(key, empty);
    return {
      schema: CONFIDENTIAL_WALLET_SHADOW_SCHEMA,
      transactions: [],
    };
  }
};

const prepareConfidentialWalletShadowState = (
  state: PendingConfidentialWalletShadowState,
): Readonly<{
  normalized: PendingConfidentialWalletShadowState;
  encoded: string;
}> => {
  const dedupedTransactions = new Map<
    string,
    PendingConfidentialWalletShadowTransaction
  >();
  state.transactions
    .map((entry, index) =>
      parsePendingConfidentialWalletShadowTransaction(
        entry,
        `Confidential wallet shadow transactions[${index}]`,
      ),
    )
    .forEach((entry) => {
      const existing = dedupedTransactions.get(entry.hash);
      if (existing && JSON.stringify(existing) !== JSON.stringify(entry)) {
        throw new Error(
          "Confidential wallet shadow merge contains conflicting records for one transaction hash; no records were stored.",
        );
      }
      dedupedTransactions.set(entry.hash, entry);
    });
  const canonicalTransactions = [...dedupedTransactions.values()].sort(
    (left, right) =>
      left.createdAtMs - right.createdAtMs ||
      left.hash.localeCompare(right.hash),
  );
  if (canonicalTransactions.length > 128) {
    throw new Error(
      "Confidential wallet shadow merge exceeds its transaction capacity; no records were stored.",
    );
  }
  const normalized: PendingConfidentialWalletShadowState = {
    schema: CONFIDENTIAL_WALLET_SHADOW_SCHEMA,
    transactions: canonicalTransactions,
  };
  const encoded = JSON.stringify(normalized);
  if (Buffer.byteLength(encoded, "utf8") > SHADOW_STATE_MAX_BYTES) {
    throw new Error("Confidential wallet shadow state exceeds its byte limit.");
  }
  return { normalized, encoded };
};

const writeConfidentialWalletShadowState = (
  keys: EndpointScopedStorageKeys,
  state: PendingConfidentialWalletShadowState,
) => {
  deleteEndpointDerivedStateKeys(
    keys.retired,
    confidentialWalletShadowStateCache,
  );
  if (!keys.current) {
    throw new Error(
      "Confidential wallet shadow state requires a trusted endpoint identity scope.",
    );
  }
  const key = keys.current;
  const { normalized, encoded } = prepareConfidentialWalletShadowState(state);
  const storage = globalThis.localStorage;
  if (!storage) {
    throw new Error(
      "Confidential wallet shadow storage is unavailable; backup restore was not completed.",
    );
  }
  try {
    storage.setItem(key, encoded);
  } catch (error) {
    throw new Error(
      `Confidential wallet shadow state could not be stored durably: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  confidentialWalletShadowStateCache.set(key, normalized);
};

const deriveConfidentialWalletBackupKey = (mnemonic: string, salt: Buffer) => {
  const normalizedMnemonic = normalizeMnemonicPhrase(mnemonic);
  if (!normalizedMnemonic) {
    throw new Error("Backup file is missing a valid recovery phrase.");
  }
  return Buffer.from(
    hkdfSync(
      "sha256",
      Buffer.from(normalizedMnemonic, "utf8"),
      salt,
      Buffer.from(CONFIDENTIAL_WALLET_BACKUP_KDF_INFO, "utf8"),
      32,
    ),
  );
};

const encryptConfidentialWalletBackupState = (
  state: ConfidentialWalletBackupStatePayload,
  mnemonic: string,
): ConfidentialWalletBackupStateBoxV2 => {
  const salt = randomBytes(32);
  const iv = randomBytes(12);
  const key = deriveConfidentialWalletBackupKey(mnemonic, salt);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(state), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    kdf: "HKDF-SHA256",
    cipher: "AES-256-GCM",
    saltBase64Url: salt.toString("base64url"),
    ivBase64Url: iv.toString("base64url"),
    ciphertextBase64Url: ciphertext.toString("base64url"),
    authTagBase64Url: cipher.getAuthTag().toString("base64url"),
  };
};

const parseConfidentialWalletBackupStatePayload = (
  value: unknown,
): ConfidentialWalletBackupStatePayload => {
  if (!isPlainRecord(value)) {
    throw new Error("Confidential wallet backup state is invalid.");
  }
  assertExactObjectKeys(
    value,
    ["schema", "receiveKeys", "shadowTransactions"],
    "Confidential wallet backup state",
  );
  if (value.schema !== "iroha-demo-confidential-wallet-state/v1") {
    throw new Error("Unsupported confidential wallet backup state schema.");
  }
  if (
    !Array.isArray(value.receiveKeys) ||
    value.receiveKeys.length > SECURE_VAULT_MAX_RECEIVE_KEYS_PER_ACCOUNT
  ) {
    throw new Error("Confidential wallet backup receive keys are invalid.");
  }
  const seenKeyIds = new Set<string>();
  const receiveKeys = value.receiveKeys.map((entry, index) => {
    const label = `confidentialWallet.receiveKeys[${index}]`;
    if (!isPlainRecord(entry)) {
      throw new Error(`${label} must be an object.`);
    }
    assertExactObjectKeys(
      entry,
      [
        "keyId",
        "ownerTagHex",
        "diversifierHex",
        "publicKeyBase64Url",
        "privateKeyBase64Url",
        "createdAtMs",
      ],
      label,
    );
    const keyId = trimString(entry.keyId);
    if (
      typeof entry.keyId !== "string" ||
      entry.keyId !== keyId ||
      !isCanonicalBase64UrlBytes(keyId, 18) ||
      seenKeyIds.has(keyId)
    ) {
      throw new Error(`${label}.keyId is invalid or duplicated.`);
    }
    seenKeyIds.add(keyId);
    const ownerTagHex = trimString(entry.ownerTagHex);
    const diversifierHex = trimString(entry.diversifierHex);
    if (
      entry.ownerTagHex !== ownerTagHex ||
      entry.diversifierHex !== diversifierHex ||
      !/^[0-9a-f]{64}$/u.test(ownerTagHex) ||
      !/^[0-9a-f]{64}$/u.test(diversifierHex)
    ) {
      throw new Error(`${label} contains invalid canonical key material.`);
    }
    const publicKeyBase64Url = normalizeBase64UrlString(
      entry.publicKeyBase64Url,
      `${label}.publicKeyBase64Url`,
    );
    const privateKeyBase64Url = normalizeBase64UrlString(
      entry.privateKeyBase64Url,
      `${label}.privateKeyBase64Url`,
    );
    if (
      entry.publicKeyBase64Url !== publicKeyBase64Url ||
      entry.privateKeyBase64Url !== privateKeyBase64Url ||
      !isCanonicalBase64UrlBytes(publicKeyBase64Url, 32) ||
      !isCanonicalBase64UrlBytes(privateKeyBase64Url, 32)
    ) {
      throw new Error(`${label} contains noncanonical X25519 key material.`);
    }
    if (
      typeof entry.createdAtMs !== "number" ||
      !Number.isSafeInteger(entry.createdAtMs) ||
      entry.createdAtMs < 0
    ) {
      throw new Error(`${label}.createdAtMs is invalid.`);
    }
    return {
      keyId,
      ownerTagHex,
      diversifierHex,
      publicKeyBase64Url,
      privateKeyBase64Url,
      createdAtMs: entry.createdAtMs,
    };
  });
  if (
    !Array.isArray(value.shadowTransactions) ||
    value.shadowTransactions.length > 128
  ) {
    throw new Error(
      "Confidential wallet backup shadow transactions are invalid.",
    );
  }
  const seenTransactionHashes = new Set<string>();
  const shadowTransactions = value.shadowTransactions.map((entry, index) => {
    const label = `confidentialWallet.shadowTransactions[${index}]`;
    const parsed = parsePendingConfidentialWalletShadowTransaction(
      entry,
      label,
    );
    if (seenTransactionHashes.has(parsed.hash)) {
      throw new Error(`${label}.hash is invalid or duplicated.`);
    }
    seenTransactionHashes.add(parsed.hash);
    return parsed;
  });
  return {
    schema: "iroha-demo-confidential-wallet-state/v1",
    receiveKeys,
    shadowTransactions,
  };
};

const parseConfidentialWalletBackupMetadataInput = (
  value: unknown,
): ConfidentialWalletBackupMetadataV2 => {
  const metadata = requireFirstReleaseIpcInputObject<Record<string, unknown>>(
    value,
    {
      label: "Confidential wallet backup metadata",
      required: [
        "schema",
        "chainId",
        "accountId",
        "scanWatermarkBlock",
        "stateBox",
      ],
    },
  );
  if (metadata.schema !== CONFIDENTIAL_WALLET_BACKUP_SCHEMA_V2) {
    throw new Error("Unsupported confidential wallet backup schema.");
  }
  const scanWatermarkBlock = metadata.scanWatermarkBlock;
  if (
    scanWatermarkBlock !== null &&
    (typeof scanWatermarkBlock !== "number" ||
      !Number.isSafeInteger(scanWatermarkBlock) ||
      Object.is(scanWatermarkBlock, -0) ||
      scanWatermarkBlock < 0)
  ) {
    throw new Error(
      "Confidential wallet backup scan watermark must be null or an exact non-negative integer.",
    );
  }
  const stateBox = requireFirstReleaseIpcInputObject<Record<string, unknown>>(
    metadata.stateBox,
    {
      label: "Confidential wallet backup state box",
      required: [
        "kdf",
        "cipher",
        "saltBase64Url",
        "ivBase64Url",
        "ciphertextBase64Url",
        "authTagBase64Url",
      ],
    },
  );
  if (stateBox.kdf !== "HKDF-SHA256" || stateBox.cipher !== "AES-256-GCM") {
    throw new Error(
      "Confidential wallet backup state box uses an unsupported cryptographic contract.",
    );
  }
  return {
    schema: CONFIDENTIAL_WALLET_BACKUP_SCHEMA_V2,
    chainId: requireFirstReleaseInputText(
      metadata.chainId,
      "confidentialWallet.chainId",
      256,
    ),
    accountId: requireFirstReleaseInputText(
      metadata.accountId,
      "confidentialWallet.accountId",
      1_024,
    ),
    scanWatermarkBlock,
    stateBox: {
      kdf: "HKDF-SHA256",
      cipher: "AES-256-GCM",
      saltBase64Url: requireFirstReleaseInputText(
        stateBox.saltBase64Url,
        "confidentialWallet.stateBox.saltBase64Url",
        43,
      ),
      ivBase64Url: requireFirstReleaseInputText(
        stateBox.ivBase64Url,
        "confidentialWallet.stateBox.ivBase64Url",
        16,
      ),
      ciphertextBase64Url: requireFirstReleaseInputText(
        stateBox.ciphertextBase64Url,
        "confidentialWallet.stateBox.ciphertextBase64Url",
        CONFIDENTIAL_WALLET_BACKUP_CIPHERTEXT_MAX_CHARACTERS,
      ),
      authTagBase64Url: requireFirstReleaseInputText(
        stateBox.authTagBase64Url,
        "confidentialWallet.stateBox.authTagBase64Url",
        22,
      ),
    },
  };
};

const decryptConfidentialWalletBackupState = (
  stateBox: ConfidentialWalletBackupStateBoxV2,
  mnemonic: string,
): ConfidentialWalletBackupStatePayload => {
  if (stateBox.kdf !== "HKDF-SHA256" || stateBox.cipher !== "AES-256-GCM") {
    throw new Error(
      "Confidential wallet backup state box uses an unsupported cryptographic contract.",
    );
  }
  const decodeCanonicalBase64Url = (
    value: unknown,
    label: string,
    options: Readonly<{
      expectedBytes?: number;
      maximumCharacters: number;
    }>,
  ): Buffer => {
    if (
      typeof value !== "string" ||
      value.length === 0 ||
      value.length > options.maximumCharacters ||
      !/^[A-Za-z0-9_-]+$/u.test(value)
    ) {
      throw new Error(`${label} must be bounded canonical base64url.`);
    }
    const decoded = Buffer.from(value, "base64url");
    if (
      decoded.length === 0 ||
      (options.expectedBytes !== undefined &&
        decoded.length !== options.expectedBytes) ||
      decoded.toString("base64url") !== value
    ) {
      throw new Error(`${label} must be bounded canonical base64url.`);
    }
    return decoded;
  };
  const salt = decodeCanonicalBase64Url(
    stateBox.saltBase64Url,
    "confidentialWallet.stateBox.saltBase64Url",
    { expectedBytes: 32, maximumCharacters: 43 },
  );
  const iv = decodeCanonicalBase64Url(
    stateBox.ivBase64Url,
    "confidentialWallet.stateBox.ivBase64Url",
    { expectedBytes: 12, maximumCharacters: 16 },
  );
  const ciphertext = decodeCanonicalBase64Url(
    stateBox.ciphertextBase64Url,
    "confidentialWallet.stateBox.ciphertextBase64Url",
    {
      maximumCharacters: CONFIDENTIAL_WALLET_BACKUP_CIPHERTEXT_MAX_CHARACTERS,
    },
  );
  const authTag = decodeCanonicalBase64Url(
    stateBox.authTagBase64Url,
    "confidentialWallet.stateBox.authTagBase64Url",
    { expectedBytes: 16, maximumCharacters: 22 },
  );
  const key = deriveConfidentialWalletBackupKey(mnemonic, salt);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
  let parsed: unknown;
  try {
    parsed = parseJsonWithoutDuplicateObjectKeys(
      plaintext,
      "Confidential wallet backup state",
    );
  } catch {
    throw new Error("Confidential wallet backup could not be decrypted.");
  }
  return parseConfidentialWalletBackupStatePayload(parsed);
};

const mergeConfidentialWalletShadowTransactions = (input: {
  toriiUrl: string;
  accountId: string;
  endpointScope?: EndpointIdentityScopeInput | null;
  transactions: Array<WalletConfidentialTransactionLike | null | undefined>;
  includeUnmatchedShadowTransactions?: boolean;
}): WalletConfidentialTransactionLike[] => {
  const baseTransactions = input.transactions.filter(
    (transaction): transaction is WalletConfidentialTransactionLike =>
      Boolean(transaction),
  );
  if (input.includeUnmatchedShadowTransactions === false) {
    return baseTransactions;
  }
  const keys = getConfidentialWalletShadowKeys({
    toriiUrl: input.toriiUrl,
    accountId: input.accountId,
    endpointScope: input.endpointScope,
  });
  const shadowState = readConfidentialWalletShadowState(keys);
  if (!shadowState.transactions.length) {
    return baseTransactions;
  }
  const shadowByHash = new Map(
    shadowState.transactions.map((transaction) => [
      transaction.hash,
      transaction,
    ]),
  );
  const mergedHashes = new Set<string>();
  const merged = baseTransactions.map((transaction) => {
    const txHash = trimString(transaction.entrypoint_hash).toLowerCase();
    const shadow = shadowByHash.get(txHash);
    if (!shadow || transaction.result_ok === false) {
      return transaction;
    }
    mergedHashes.add(txHash);
    const hasDirectMetadata =
      transaction.metadata !== undefined &&
      transaction.metadata !== null &&
      !(
        isPlainRecord(transaction.metadata) &&
        !Object.keys(transaction.metadata).length
      );
    const hasInstructions =
      Array.isArray(transaction.instructions) &&
      transaction.instructions.length > 0;
    return {
      ...transaction,
      entrypoint_hash: txHash || shadow.hash,
      authority:
        trimString((transaction as { authority?: unknown }).authority) ||
        shadow.authority,
      metadata: hasDirectMetadata ? transaction.metadata : shadow.metadata,
      instructions: hasInstructions
        ? transaction.instructions
        : shadow.instructions,
    };
  });
  for (const shadow of shadowState.transactions) {
    if (mergedHashes.has(shadow.hash)) {
      continue;
    }
    merged.push({
      entrypoint_hash: shadow.hash,
      result_ok: true,
      authority: shadow.authority,
      metadata: shadow.metadata,
      instructions: shadow.instructions,
    });
  }
  return merged;
};

const normalizeReleaseAtMs = (value: number) => {
  if (!Number.isSafeInteger(value) || Object.is(value, -0) || value < 0) {
    throw new Error("releaseAtMs must be an exact non-negative safe integer.");
  }
  return value;
};

const normalizeTimestampMs = (value: unknown, label: string): number => {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    Object.is(value, -0) ||
    value <= 0
  ) {
    throw new Error(`${label} must be an exact positive safe integer.`);
  }
  return value;
};

const normalizeKaigiCallId = (value: string, label: string) => {
  return requireKaigiCallId(value, label);
};

const normalizeBase64UrlString = (value: unknown, label: string): string => {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} is required.`);
  }
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) {
    throw new Error(`${label} must be base64url.`);
  }
  return value;
};

const resolveKaigiMeetingView = (
  callPayload: FirstReleaseKaigiCallView,
  callId: string,
  inviteSecretBase64Url: string,
  networkPrefix: number,
): KaigiMeetingView => {
  const normalizedCallId = normalizeKaigiCallId(callId, "callId");
  if (callPayload.call_id !== normalizedCallId) {
    throw new Error("Kaigi call response is cross-wired.");
  }
  const scheduledStartMs = normalizeTimestampMs(
    callPayload.scheduled_start_ms,
    "kaigi call.scheduled_start_ms",
  );
  const createdAtMs = normalizeTimestampMs(
    callPayload.created_at_ms,
    "kaigi call.created_at_ms",
  );
  const live = callPayload.status === "active";
  const privacyMode = requireFirstReleaseKaigiMeetingPrivacy(
    callPayload.privacy_mode,
    "kaigi call.privacy_mode",
  );
  const callMetadata = normalizeFirstReleaseKaigiCallMetadata(
    callPayload.metadata.kaigi_call,
    {
      callId: normalizedCallId,
      privacyMode,
      scheduledStartMs,
      live,
    },
  );
  if (typeof callPayload.host_account_id !== "string") {
    throw new Error(
      "Transparent Kaigi call response is missing its host account.",
    );
  }
  const expectedHostAccountId = normalizeCanonicalAccountIdLiteral(
    callPayload.host_account_id,
    "kaigi call.host_account_id",
    networkPrefix,
  );
  const offerPayload = normalizeFirstReleaseKaigiCallOfferPayload(
    decryptKaigiPayloadWithSecret<unknown>(
      callMetadata.encryptedOffer,
      inviteSecretBase64Url,
    ),
    {
      callId: normalizedCallId,
      privacyMode,
      hostAccountId: expectedHostAccountId,
      createdAtMs,
      networkPrefix,
    },
  );
  const endedAtMs =
    callPayload.status === "ended"
      ? normalizeTimestampMs(callPayload.ended_at_ms, "kaigi call.ended_at_ms")
      : undefined;

  return {
    callId: normalizedCallId,
    meetingCode: callMetadata.meetingCode,
    ...(callPayload.title ? { title: callPayload.title } : {}),
    hostAccountId: offerPayload.hostAccountId,
    hostDisplayName: offerPayload.hostDisplayName,
    hostParticipantId: offerPayload.hostParticipantId,
    hostKaigiPublicKeyBase64Url: offerPayload.hostKaigiPublicKeyBase64Url,
    scheduledStartMs,
    expiresAtMs: callMetadata.expiresAtMs,
    createdAtMs,
    live,
    ended: callPayload.status === "ended",
    ...(endedAtMs === undefined ? {} : { endedAtMs }),
    privacyMode: callMetadata.privacyMode,
    offerDescription: offerPayload.description,
  };
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

const APPLICATION_JSON_CONTENT_TYPE = /^application\/json(?:\s*;|$)/iu;
const BINARY_ERROR_CONTENT_TYPE =
  /^(?:application\/x-norito|application\/octet-stream)(?:\s*;|$)/iu;
const API_ERROR_DETAIL_MAX_BYTES = 64 * 1024;

const decodeCanonicalUtf8ResponseBytes = (
  bytes: Buffer,
  label: string,
): string => {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new Error(`${label} is not valid UTF-8.`, { cause: error });
  }
  if (!Buffer.from(text, "utf8").equals(bytes)) {
    throw new Error(`${label} is not canonical UTF-8.`);
  }
  return text;
};

const readBoundedApiErrorDetail = async (
  response: Pick<Response, "headers" | "arrayBuffer">,
): Promise<string> => {
  const rejectCode = extractApiErrorDetail(
    response.headers.get("x-iroha-reject-code") ?? "",
  );
  if (rejectCode) {
    return rejectCode;
  }
  const contentType = response.headers.get("content-type")?.trim() ?? "";
  if (BINARY_ERROR_CONTENT_TYPE.test(contentType)) {
    return "";
  }
  try {
    const bytes = await readBoundedResponseBytes(response, {
      label: "Torii error detail",
      maximumBytes: API_ERROR_DETAIL_MAX_BYTES,
      allowEmpty: true,
    });
    if (bytes.length === 0) {
      return "";
    }
    const text = decodeCanonicalUtf8ResponseBytes(bytes, "Torii error detail");
    if (APPLICATION_JSON_CONTENT_TYPE.test(contentType)) {
      return extractApiErrorDetail(parseStrictJson(text, "Torii error detail"));
    }
    return extractApiErrorDetail(text);
  } catch {
    return "";
  }
};

const readBoundedJsonObjectResponse = async (
  response: Pick<Response, "headers" | "arrayBuffer">,
  label: string,
): Promise<Record<string, unknown>> =>
  ensureObjectResponse(
    await readBoundedJsonResponse(response, {
      label,
      maximumBytes: MAX_TORII_JSON_RESPONSE_BYTES,
      requireApplicationJson: true,
    }),
    label,
  );

const readBoundedExactJsonTextResponse = async (
  response: Pick<Response, "headers" | "arrayBuffer">,
  label: string,
  maximumBytes = MAX_TORII_JSON_RESPONSE_BYTES,
): Promise<string> => {
  const contentType = response.headers.get("content-type")?.trim() ?? "";
  if (!APPLICATION_JSON_CONTENT_TYPE.test(contentType)) {
    throw new Error(`${label} did not return application/json.`);
  }
  const bytes = await readBoundedResponseBytes(response, {
    label: `${label} JSON`,
    maximumBytes,
  });
  const text = decodeCanonicalUtf8ResponseBytes(bytes, `${label} JSON body`);
  parseStrictJson(text, label);
  return text;
};

const fetchGetResponse = async (
  endpoint: string,
  label: string,
  headers?: Record<string, string>,
  signal?: AbortSignal,
): Promise<Response> =>
  withBoundedHttpGetRetry(
    async () => {
      const response = await nodeFetch(endpoint, {
        method: "GET",
        signal,
        headers: {
          Accept: "application/json",
          ...(headers ?? {}),
        },
      });
      if (response.status === 429) {
        throw await createApiRequestError(response, label);
      }
      return response;
    },
    { signal },
  );

const fetchJson = async (
  endpoint: string,
  label: string,
  headers?: Record<string, string>,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> => {
  const response = await fetchGetResponse(endpoint, label, headers, signal);
  if (!response.ok) {
    throw await createApiRequestError(response, label);
  }
  return readBoundedJsonObjectResponse(response, label);
};

type FirstReleaseCanonicalAuth = Readonly<{
  accountId: string;
  networkId: NetworkId;
  privateKey: Buffer;
}>;

const canonicalToriiJsonRequest = async (input: {
  toriiUrl: string;
  path: string;
  method: "GET" | "POST";
  label: string;
  auth: FirstReleaseCanonicalAuth;
  query?: URLSearchParams;
  body?: unknown;
  signal?: AbortSignal;
}): Promise<Response> => {
  const toriiUrl = normalizeBaseUrl(input.toriiUrl);
  if (!input.path.startsWith("/") || input.path.startsWith("//")) {
    throw new Error(`${input.label} path is invalid.`);
  }
  const request = await buildCanonicalJsonRequest({
    accountId: input.auth.accountId,
    networkId: input.auth.networkId,
    privateKey: input.auth.privateKey,
    method: input.method,
    path: input.path,
    baseUrl: toriiUrl,
    query: input.query,
    ...(input.body === undefined ? {} : { body: input.body }),
  });
  const query = input.query?.toString() ?? "";
  return nodeFetch(`${toriiUrl}${input.path}${query ? `?${query}` : ""}`, {
    method: request.method,
    headers: request.headers,
    ...(input.method === "POST" ? { body: request.body } : {}),
    redirect: "error",
    signal: input.signal,
  });
};

const fetchFirstReleaseHealth = async (
  toriiUrl: string,
  signal?: AbortSignal,
): Promise<HealthResponse> => {
  const response = await fetchGetResponse(
    buildNexusEndpoint(toriiUrl, "/v1/health"),
    "Torii health",
    undefined,
    signal,
  );
  if ([404, 503].includes(response.status)) return null;
  if (!response.ok) throw await createApiRequestError(response, "Torii health");
  const payload = await readBoundedJsonObjectResponse(response, "Torii health");
  assertExactObjectKeys(payload, ["status"], "Torii health");
  return {
    status: requireCanonicalResponseText(payload.status, "Torii health.status"),
  };
};

const fetchFirstReleaseConfiguration = async (
  toriiUrl: string,
): Promise<Record<string, unknown> | null> => {
  const response = await fetchGetResponse(
    buildNexusEndpoint(toriiUrl, "/v1/configuration"),
    "Torii configuration",
  );
  if ([404, 503].includes(response.status)) return null;
  if (!response.ok) {
    throw await createApiRequestError(response, "Torii configuration");
  }
  return readBoundedJsonObjectResponse(response, "Torii configuration");
};

const readExplorerDurationMs = (
  value: unknown,
  label: string,
): number | null => {
  if (value === null) return null;
  if (!isPlainRecord(value)) {
    throw new Error(`${label} must be null or an exact duration object.`);
  }
  assertExactObjectKeys(value, ["ms"], label);
  return requireExactJsonUnsignedInteger(value.ms, `${label}.ms`);
};

const normalizeFirstReleaseExplorerMetrics = (
  payload: Record<string, unknown>,
): ExplorerMetricsResponse => {
  assertExactObjectKeys(
    payload,
    [
      "peers",
      "domains",
      "accounts",
      "assets",
      "transactions_accepted",
      "transactions_rejected",
      "block",
      "block_created_at",
      "finalized_block",
      "avg_commit_time",
      "avg_block_time",
    ],
    "Explorer metrics",
  );
  const blockCreatedAt =
    payload.block_created_at === null
      ? null
      : requireCanonicalResponseText(
          payload.block_created_at,
          "Explorer metrics.block_created_at",
          64,
        );
  if (
    blockCreatedAt !== null &&
    new Date(blockCreatedAt).toISOString() !== blockCreatedAt
  ) {
    throw new Error(
      "Explorer metrics.block_created_at must be a canonical ISO timestamp.",
    );
  }
  return {
    peers: requireExactJsonUnsignedInteger(
      payload.peers,
      "Explorer metrics.peers",
    ),
    domains: requireExactJsonUnsignedInteger(
      payload.domains,
      "Explorer metrics.domains",
    ),
    accounts: requireExactJsonUnsignedInteger(
      payload.accounts,
      "Explorer metrics.accounts",
    ),
    assets: requireExactJsonUnsignedInteger(
      payload.assets,
      "Explorer metrics.assets",
    ),
    transactionsAccepted: requireExactJsonUnsignedInteger(
      payload.transactions_accepted,
      "Explorer metrics.transactions_accepted",
    ),
    transactionsRejected: requireExactJsonUnsignedInteger(
      payload.transactions_rejected,
      "Explorer metrics.transactions_rejected",
    ),
    blockHeight: requireExactJsonUnsignedInteger(
      payload.block,
      "Explorer metrics.block",
    ),
    blockCreatedAt,
    finalizedBlockHeight: requireExactJsonUnsignedInteger(
      payload.finalized_block,
      "Explorer metrics.finalized_block",
    ),
    averageCommitTimeMs: readExplorerDurationMs(
      payload.avg_commit_time,
      "Explorer metrics.avg_commit_time",
    ),
    averageBlockTimeMs: readExplorerDurationMs(
      payload.avg_block_time,
      "Explorer metrics.avg_block_time",
    ),
  };
};

const fetchFirstReleaseExplorerMetrics = async (
  toriiUrl: string,
  signal?: AbortSignal,
): Promise<ExplorerMetricsResponse | null> => {
  const response = await fetchGetResponse(
    buildNexusEndpoint(toriiUrl, "/v1/explorer/metrics"),
    "Explorer metrics",
    undefined,
    signal,
  );
  if ([403, 404, 503].includes(response.status)) return null;
  if (!response.ok) {
    throw await createApiRequestError(response, "Explorer metrics");
  }
  return normalizeFirstReleaseExplorerMetrics(
    await readBoundedJsonObjectResponse(response, "Explorer metrics"),
  );
};

const fetchFirstReleaseExplorerAccountQr = (
  toriiUrl: string,
  accountId: string,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> =>
  fetchJson(
    buildNexusEndpoint(
      toriiUrl,
      `/v1/explorer/accounts/${encodeURIComponent(accountId)}/qr`,
    ),
    "Explorer account QR",
    undefined,
    signal,
  );

const fetchFirstReleaseAliasResolution = async (
  toriiUrl: string,
  alias: string,
): Promise<Record<string, unknown> | null> => {
  const canonicalAlias = requireCanonicalResponseText(alias, "Account alias");
  const response = await nodeFetch(
    buildNexusEndpoint(toriiUrl, "/v1/aliases/resolve"),
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ alias: canonicalAlias }),
      redirect: "error",
    },
  );
  if (response.status === 404) return null;
  if (!response.ok) {
    throw await createApiRequestError(response, "Account alias resolution");
  }
  const payload = await readBoundedJsonObjectResponse(
    response,
    "Account alias resolution",
  );
  assertRequiredAndOptionalObjectKeys(
    payload,
    ["alias", "account_id"],
    ["index", "source"],
    "Account alias resolution",
  );
  if (payload.alias !== canonicalAlias) {
    throw new Error(
      "Account alias resolution did not bind the requested alias.",
    );
  }
  requireCanonicalResponseText(
    payload.account_id,
    "Account alias resolution.account_id",
  );
  if (payload.index !== undefined) {
    requireExactJsonUnsignedInteger(
      payload.index,
      "Account alias resolution.index",
    );
  }
  if (payload.source !== undefined) {
    requireCanonicalResponseText(
      payload.source,
      "Account alias resolution.source",
      256,
    );
  }
  return payload;
};

const fetchFirstReleaseTransactionStatus = async (
  toriiUrl: string,
  hashHex: string,
  options: {
    scope?: "local" | "global";
    signal?: AbortSignal;
  } = {},
): Promise<ToriiPipelineTransactionStatus | null> => {
  if (!/^[0-9a-f]{64}$/u.test(hashHex)) {
    throw new Error("Transaction hash must be exactly 32 lowercase hex bytes.");
  }
  const scope = options.scope ?? "local";
  const response = await fetchGetResponse(
    buildNexusEndpoint(toriiUrl, "/v1/pipeline/transactions/status", {
      hash: hashHex,
      scope,
    }),
    "Transaction status",
    undefined,
    options.signal,
  );
  if (response.status === 404) return null;
  if (!response.ok) {
    throw await createApiRequestError(response, "Transaction status");
  }
  const payload = await readBoundedJsonObjectResponse(
    response,
    "Transaction status",
  );
  assertExactObjectKeys(
    payload,
    ["hash", "status", "scope", "resolved_from"],
    "Transaction status",
  );
  if (payload.hash !== hashHex || payload.scope !== scope) {
    throw new Error(
      "Transaction status did not bind the requested hash and scope.",
    );
  }
  if (
    payload.resolved_from !== "cache" &&
    payload.resolved_from !== "queue" &&
    payload.resolved_from !== "state"
  ) {
    throw new Error("Transaction status resolved_from is unsupported.");
  }
  if (!isPlainRecord(payload.status)) {
    throw new Error("Transaction status.status must be an object.");
  }
  assertRequiredAndOptionalObjectKeys(
    payload.status,
    ["kind"],
    ["block_height"],
    "Transaction status.status",
  );
  if (
    ![
      "Queued",
      "Approved",
      "Committed",
      "Applied",
      "Rejected",
      "Expired",
    ].includes(String(payload.status.kind))
  ) {
    throw new Error("Transaction status kind is unsupported.");
  }
  if (payload.status.block_height !== undefined) {
    requireExactJsonUnsignedInteger(
      payload.status.block_height,
      "Transaction status.status.block_height",
      { allowZero: false },
    );
  }
  return payload as unknown as ToriiPipelineTransactionStatus;
};

const normalizeFirstReleaseTransactionPage = (
  payload: Record<string, unknown>,
  networkPrefix: number,
  maximumItems: number,
): TransactionsResponse => {
  assertExactObjectKeys(
    payload,
    ["items", "total", "has_more", "count_mode"],
    "Account transactions",
  );
  if (typeof payload.has_more !== "boolean") {
    throw new Error("Account transactions.has_more must be a boolean.");
  }
  if (payload.count_mode !== "exact") {
    throw new Error('Account transactions.count_mode must be "exact".');
  }
  if (!Array.isArray(payload.items) || payload.items.length > maximumItems) {
    throw new Error(
      "Account transactions.items exceeds the requested page limit.",
    );
  }
  const items = payload.items.map((value, index) => {
    const label = `Account transactions.items[${index}]`;
    if (!isPlainRecord(value)) throw new Error(`${label} must be an object.`);
    assertRequiredAndOptionalObjectKeys(
      value,
      ["entrypoint_hash", "result_ok"],
      ["authority", "timestamp_ms", "memo"],
      label,
    );
    const entrypointHash = requireCanonicalResponseText(
      value.entrypoint_hash,
      `${label}.entrypoint_hash`,
      256,
    );
    if (typeof value.result_ok !== "boolean") {
      throw new Error(`${label}.result_ok must be a boolean.`);
    }
    const normalized: TransactionsResponse["items"][number] = {
      entrypoint_hash: entrypointHash,
      result_ok: value.result_ok,
    };
    if (value.authority !== undefined) {
      normalized.authority = normalizeCanonicalAccountIdLiteral(
        requireCanonicalResponseText(
          value.authority,
          `${label}.authority`,
          1_024,
        ),
        `${label}.authority`,
        networkPrefix,
      );
    }
    if (value.timestamp_ms !== undefined) {
      normalized.timestamp_ms = requireExactJsonUnsignedInteger(
        value.timestamp_ms,
        `${label}.timestamp_ms`,
      );
    }
    if (value.memo !== undefined) {
      normalized.memo = requireCanonicalResponseText(
        value.memo,
        `${label}.memo`,
        16 * 1_024,
      );
    }
    return normalized;
  });
  const total = requireExactJsonUnsignedInteger(
    payload.total,
    "Account transactions.total",
  );
  if (total < items.length) {
    throw new Error(
      "Account transactions.total cannot be less than items.length.",
    );
  }
  return { items, total };
};

const fetchFirstReleaseAccountTransactions = async (input: {
  toriiUrl: string;
  accountId: string;
  networkPrefix: number;
  limit: number;
  offset?: number;
}): Promise<TransactionsResponse> => {
  const pageRequest = requireFirstReleasePagination(input, {
    defaultLimit: 20,
    label: "Account transactions",
  });
  const endpoint = new URL(
    `${normalizeBaseUrl(input.toriiUrl)}/v1/accounts/${encodeURIComponent(input.accountId)}/transactions`,
  );
  endpoint.searchParams.set("limit", String(pageRequest.limit));
  endpoint.searchParams.set("offset", String(pageRequest.offset));
  endpoint.searchParams.set("count_mode", "exact");
  const response = await fetchGetResponse(
    endpoint.toString(),
    "Account transactions",
  );
  if (!response.ok) {
    throw await createApiRequestError(response, "Account transactions");
  }
  const payload = await readBoundedJsonObjectResponse(
    response,
    "Account transactions",
  );
  const page = normalizeFirstReleaseTransactionPage(
    payload,
    input.networkPrefix,
    pageRequest.limit,
  );
  assertFirstReleasePageWindow(page, pageRequest, "Account transactions");
  assertFirstReleaseHasMore(
    payload.has_more,
    page,
    pageRequest,
    "Account transactions",
  );
  return page;
};

const fetchFirstReleaseAccountPermissions = async (input: {
  toriiUrl: string;
  accountId: string;
  limit: number;
  offset?: number;
}): Promise<AccountPermissionsResponse> => {
  const pageRequest = requireFirstReleasePagination(input, {
    defaultLimit: 200,
    label: "Account permissions",
  });
  const endpoint = new URL(
    `${normalizeBaseUrl(input.toriiUrl)}/v1/accounts/${encodeURIComponent(input.accountId)}/permissions`,
  );
  endpoint.searchParams.set("limit", String(pageRequest.limit));
  endpoint.searchParams.set("offset", String(pageRequest.offset));
  endpoint.searchParams.set("count_mode", "exact");
  const response = await fetchGetResponse(
    endpoint.toString(),
    "Account permissions",
  );
  if (!response.ok) {
    throw await createApiRequestError(response, "Account permissions");
  }
  const payload = await readBoundedJsonObjectResponse(
    response,
    "Account permissions",
  );
  assertExactObjectKeys(
    payload,
    ["items", "total", "has_more", "count_mode"],
    "Account permissions",
  );
  if (typeof payload.has_more !== "boolean") {
    throw new Error("Account permissions.has_more must be a boolean.");
  }
  if (payload.count_mode !== "exact") {
    throw new Error('Account permissions.count_mode must be "exact".');
  }
  if (
    !Array.isArray(payload.items) ||
    payload.items.length > pageRequest.limit
  ) {
    throw new Error(
      "Account permissions.items exceeds the requested page limit.",
    );
  }
  const items = payload.items.map((value, index) => {
    const label = `Account permissions.items[${index}]`;
    if (!isPlainRecord(value)) throw new Error(`${label} must be an object.`);
    assertExactObjectKeys(value, ["name", "payload"], label);
    const name = requireCanonicalResponseText(value.name, `${label}.name`, 512);
    if (value.payload !== null && !isPlainRecord(value.payload)) {
      throw new Error(`${label}.payload must be an object or null.`);
    }
    return { name, payload: value.payload as Record<string, unknown> | null };
  });
  const total = requireExactJsonUnsignedInteger(
    payload.total,
    "Account permissions.total",
  );
  if (total < items.length) {
    throw new Error(
      "Account permissions.total cannot be less than items.length.",
    );
  }
  const page = { items, total };
  assertFirstReleasePageWindow(page, pageRequest, "Account permissions");
  assertFirstReleaseHasMore(
    payload.has_more,
    page,
    pageRequest,
    "Account permissions",
  );
  return page;
};

const fetchFirstReleaseGovernanceUnlockStats = async (input: {
  toriiUrl: string;
  auth: FirstReleaseCanonicalAuth;
}): Promise<Record<string, unknown>> => {
  const response = await canonicalToriiJsonRequest({
    toriiUrl: input.toriiUrl,
    path: "/v1/gov/unlocks/stats",
    method: "GET",
    label: "Governance unlock statistics",
    auth: input.auth,
  });
  if (!response.ok) {
    throw await createApiRequestError(response, "Governance unlock statistics");
  }
  return readBoundedJsonObjectResponse(
    response,
    "Governance unlock statistics",
  );
};

const fetchFirstReleaseAuthorityFeeQuote = async (input: {
  toriiUrl: string;
  networkPrefix: number;
  payload: object;
  auth: FirstReleaseCanonicalAuth;
}): Promise<FirstReleaseAuthorityFeeQuoteResponse> => {
  const response = await canonicalToriiJsonRequest({
    toriiUrl: input.toriiUrl,
    path: "/v1/fees/quote",
    method: "POST",
    label: "Transaction fee quote",
    auth: input.auth,
    body: { payload: input.payload },
  });
  if (response.status !== 200) {
    throw await createApiRequestError(response, "Transaction fee quote");
  }
  return parseFirstReleaseAuthorityFeeQuoteResponse(
    await readBoundedExactJsonTextResponse(
      response,
      "Transaction fee quote",
      FIRST_RELEASE_FEE_QUOTE_RESPONSE_MAX_BYTES,
    ),
    {
      expectedAuthority: input.auth.accountId,
      networkPrefix: input.networkPrefix,
    },
  );
};

const fetchFirstReleaseKaigiCall = async (
  toriiUrl: string,
  callId: string,
  signal?: AbortSignal,
): Promise<FirstReleaseKaigiCallView | null> => {
  const response = await fetchGetResponse(
    buildNexusEndpoint(
      toriiUrl,
      `/v1/kaigi/calls/${encodeURIComponent(callId)}`,
    ),
    "Kaigi call",
    undefined,
    signal,
  );
  if (response.status === 404) return null;
  if (!response.ok) throw await createApiRequestError(response, "Kaigi call");
  return normalizeFirstReleaseKaigiCall(
    await readBoundedJsonObjectResponse(response, "Kaigi call"),
    callId,
  );
};

const fetchFirstReleaseKaigiSignals = async (input: {
  toriiUrl: string;
  callId: string;
  auth: FirstReleaseCanonicalAuth;
  afterTimestampMs?: number;
  limit: number;
}) => {
  const query = new URLSearchParams();
  if (input.afterTimestampMs !== undefined) {
    query.set("after_timestamp_ms", String(input.afterTimestampMs));
  }
  query.set("limit", String(input.limit));
  const path = `/v1/kaigi/calls/${encodeURIComponent(input.callId)}/signals`;
  const response = await canonicalToriiJsonRequest({
    toriiUrl: input.toriiUrl,
    path,
    method: "GET",
    label: "Kaigi call signals",
    auth: input.auth,
    query,
  });
  if (!response.ok) {
    throw await createApiRequestError(response, "Kaigi call signals");
  }
  return normalizeFirstReleaseKaigiCallSignals(
    await readBoundedJsonObjectResponse(response, "Kaigi call signals"),
    input.callId,
  );
};

const fetchNexusLifecycle = async (
  toriiUrl: string,
  signal?: AbortSignal,
): Promise<NexusLifecycleView> => {
  const response = await fetchGetResponse(
    buildNexusEndpoint(toriiUrl, "/v1/nexus/lifecycle"),
    "Nexus lifecycle",
    undefined,
    signal,
  );
  if (!response.ok) {
    throw await createApiRequestError(response, "Nexus lifecycle");
  }
  return parseNexusLifecycleJson(
    await readBoundedExactJsonTextResponse(response, "Nexus lifecycle"),
  );
};

const NETWORK_STATS_REQUEST_TIMEOUT_MS = 3_500;

const withNetworkStatsTimeout = async <T>(
  label: string,
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T> => {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      const error = new Error(`${label} request timed out.`);
      controller.abort(error);
      reject(error);
    }, NETWORK_STATS_REQUEST_TIMEOUT_MS);
  });

  try {
    return await Promise.race([run(controller.signal), timeoutPromise]);
  } finally {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
  }
};

const fetchRuntimeStatusSnapshot = async (
  toriiUrlRaw: string,
  signal: AbortSignal,
): Promise<unknown> => {
  return fetchJson(
    buildNexusEndpoint(toriiUrlRaw, "/status"),
    "Runtime status telemetry",
    undefined,
    signal,
  );
};

const postJson = async (
  endpoint: string,
  label: string,
  body: Record<string, unknown>,
  headers?: Record<string, string>,
): Promise<Record<string, unknown>> => {
  const response = await nodeFetch(endpoint, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(headers ?? {}),
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw await createApiRequestError(response, label);
  }
  return readBoundedJsonObjectResponse(response, label);
};

const parseJsonIfAvailable = async (
  response: Response,
  label: string,
): Promise<unknown> => {
  const contentType = response.headers.get("content-type") ?? "";
  if (!APPLICATION_JSON_CONTENT_TYPE.test(contentType.trim())) {
    return null;
  }
  return readBoundedJsonResponse(response, {
    label,
    maximumBytes: MAX_TORII_JSON_RESPONSE_BYTES,
    requireApplicationJson: true,
  });
};

const fetchChainMetadata = async (
  toriiUrlRaw: string,
): Promise<ChainMetadataResponse> => {
  const baseUrl = normalizeBaseUrl(toriiUrlRaw);
  const response = await fetchGetResponse(
    `${baseUrl}/v1/chain/metadata`,
    "Chain metadata",
  );
  if (!response.ok) {
    throw await createApiRequestError(response, "Chain metadata");
  }
  const payload = await parseJsonIfAvailable(response, "Chain metadata");
  if (payload === null) {
    throw new Error("Chain metadata did not return JSON.");
  }
  return parseFirstReleaseChainMetadataPayload(payload);
};

const normalizeOptionalAccountNetworkPrefix = (value: unknown) => {
  if (value === undefined) {
    return undefined;
  }
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > 0x3fff
  ) {
    throw new Error("networkPrefix must be an integer between 0 and 16383.");
  }
  return value;
};

const normalizeRequiredChainId = (value: unknown): string => {
  if (
    typeof value !== "string" ||
    !value ||
    value.trim() !== value ||
    value.length > 128 ||
    Array.from(value).some((character) => {
      const code = character.charCodeAt(0);
      return code <= 0x1f || code === 0x7f;
    })
  ) {
    throw new Error("chainId must be canonical non-empty text.");
  }
  return value;
};

const readNetworkIdentityPinResponse = (
  value: unknown,
): NetworkIdentityPin | null => {
  if (value === null) {
    return null;
  }
  if (!isNetworkIdentityPin(value)) {
    throw new Error("The network identity pin store returned a malformed pin.");
  }
  return value;
};

/** Main-owned identity trust, automatically refreshed after TAIRA resets. */
const preloadIdentityPins: EndpointIdentityPins = {
  async read(toriiUrl) {
    return readNetworkIdentityPinResponse(
      await ipcRenderer.invoke(NETWORK_IDENTITY_PIN_READ_CHANNEL, {
        toriiUrl,
      }),
    );
  },
  async pinFirstUse(toriiUrl, identity) {
    const pin = readNetworkIdentityPinResponse(
      await ipcRenderer.invoke(NETWORK_IDENTITY_PIN_FIRST_USE_CHANNEL, {
        toriiUrl,
        networkId: identity.networkId,
        networkPrefix: identity.networkPrefix,
      }),
    );
    if (!pin) {
      throw new Error(
        "The endpoint network identity could not be pinned on first use.",
      );
    }
    return pin;
  },
};

const inspectEndpointIdentity = (input: EndpointNetworkContext) =>
  inspectEndpoint(input, { identityPins: preloadIdentityPins });

/** Pinned, two-source-verified transaction NetworkId for a write endpoint. */
const resolveTrustedEndpointNetworkId = async (
  input: EndpointNetworkContext,
): Promise<NetworkId> =>
  NetworkId.parse(
    await resolvePinnedEndpointNetworkId(
      {
        toriiUrl: normalizeBaseUrl(input.toriiUrl),
        chainId: input.chainId,
        networkPrefix: input.networkPrefix,
      },
      { identityPins: preloadIdentityPins },
    ),
  );

const confirmEndpointNetworkIdentityChange = async (input: {
  toriiUrl: string;
  networkId: string;
}): Promise<NetworkIdentityPin | null> =>
  readNetworkIdentityPinResponse(
    await ipcRenderer.invoke(NETWORK_IDENTITY_CONFIRM_CHANGE_CHANNEL, {
      toriiUrl: normalizeBaseUrl(input.toriiUrl),
      networkId: input.networkId,
    }),
  );

const assertWriteConnectionMatchesEndpoint = async (input: {
  toriiUrl: string;
  chainId: string;
  networkPrefix: number;
  feature?: EndpointFeature;
  operation?: string;
}) => {
  const configuredChainId = normalizeRequiredChainId(input.chainId);
  const configuredNetworkPrefix = normalizeOptionalAccountNetworkPrefix(
    input.networkPrefix,
  );
  if (configuredNetworkPrefix === undefined) {
    throw new Error("networkPrefix is required before writing.");
  }
  const inspection = await assertEndpointWriteAuthorized(
    {
      toriiUrl: input.toriiUrl,
      chainId: configuredChainId,
      networkPrefix: configuredNetworkPrefix,
    },
    { identityPins: preloadIdentityPins },
  );
  if (input.feature && input.operation) {
    assertEndpointFeatureOperationSupported(
      inspection,
      input.feature,
      input.operation,
    );
  } else if (input.feature) {
    assertEndpointFeatureSupported(inspection, input.feature);
  } else if (input.operation) {
    throw new Error("Endpoint operation checks require a feature.");
  }
  const endpointScope = getTrustedEndpointIdentityScope(inspection);
  if (!endpointScope) {
    throw new Error(
      "Endpoint identity is not trusted for endpoint-derived storage.",
    );
  }

  return {
    chainId: inspection.expected.chainId,
    networkPrefix: inspection.expected.networkPrefix,
    networkId: NetworkId.parse(requireTrustedInspectionNetworkId(inspection)),
    endpointScope,
  };
};

const assertFaucetChallengeConnectionAvailable = async (input: {
  toriiUrl: string;
  chainId: string;
  networkPrefix: number;
}) => {
  const configuredChainId = normalizeRequiredChainId(input.chainId);
  const configuredNetworkPrefix = normalizeOptionalAccountNetworkPrefix(
    input.networkPrefix,
  );
  if (configuredNetworkPrefix === undefined) {
    throw new Error(
      "networkPrefix is required before requesting faucet funds.",
    );
  }
  const inspection = await assertEndpointFaucetChallengeAvailable(
    {
      toriiUrl: input.toriiUrl,
      chainId: configuredChainId,
      networkPrefix: configuredNetworkPrefix,
    },
    { identityPins: preloadIdentityPins },
  );
  const observedNetworkId = inspection.observed?.networkId;
  if (!observedNetworkId) {
    throw new Error(
      "The faucet challenge requires an endpoint NetworkId attested by both public identity sources.",
    );
  }
  return {
    chainId: inspection.expected.chainId,
    networkPrefix: inspection.expected.networkPrefix,
    networkId: NetworkId.parse(observedNetworkId),
  };
};

const inspectEndpointDerivedScope = async (
  input: EndpointNetworkContext,
): Promise<EndpointIdentityScopeInput | null> =>
  getTrustedEndpointIdentityScope(
    await inspectEndpointIdentity({
      toriiUrl: input.toriiUrl,
      chainId: input.chainId,
      networkPrefix: input.networkPrefix,
    }),
  );

const tryNormalizeCanonicalAccountIdLiteral = (
  value: string,
  label: string,
  networkPrefix: number,
) => {
  try {
    return normalizeCanonicalAccountIdLiteral(value, label, networkPrefix);
  } catch {
    return "";
  }
};

const normalizeFirstAccountIdCandidate = (
  candidates: string[],
  label: string,
  networkPrefix: number,
) => {
  let lastError: unknown = null;
  for (const candidate of candidates) {
    const literal = trimString(candidate);
    if (!literal) {
      continue;
    }
    try {
      return normalizeCanonicalAccountIdLiteral(literal, label, networkPrefix);
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError) {
    throw lastError;
  }
  throw new Error(`${label} must be a non-empty string.`);
};

const resolveAccountAliasSelector = async (
  input: ResolveAccountAliasInput,
): Promise<AccountAliasResolutionResponse> => {
  const selector = requireFirstReleaseInputText(input.alias, "alias", 1_024);
  const networkPrefix = normalizeOptionalAccountNetworkPrefix(
    input.networkPrefix,
  );
  if (networkPrefix === undefined) {
    throw new Error("networkPrefix is required to resolve an account alias.");
  }
  const literalAccountId = tryNormalizeCanonicalAccountIdLiteral(
    selector,
    "accountId",
    networkPrefix,
  );
  if (literalAccountId) {
    return {
      alias: "",
      accountId: literalAccountId,
      resolved: false,
    };
  }

  const resolved = await fetchFirstReleaseAliasResolution(
    input.toriiUrl,
    selector,
  );
  if (!resolved) {
    throw new Error(`Account alias "${selector}" was not found.`);
  }
  const accountId = normalizeFirstAccountIdCandidate(
    [
      requireCanonicalResponseText(
        resolved.account_id,
        "Account alias resolution.account_id",
        1_024,
      ),
    ],
    "alias account_id",
    networkPrefix,
  );
  const source = trimString(resolved.source);
  return {
    alias: selector,
    accountId,
    resolved: true,
    ...(source ? { source } : {}),
  };
};

const fetchKaigiMeetingView = async (
  input: KaigiGetMeetingInput,
): Promise<KaigiMeetingView> => {
  const normalizedCallId = normalizeKaigiCallId(input.callId, "callId");
  const payload = await fetchFirstReleaseKaigiCall(
    input.toriiUrl,
    normalizedCallId,
  );
  if (!payload) {
    throw new Error("Kaigi meeting was not found.");
  }
  return resolveKaigiMeetingView(
    payload,
    normalizedCallId,
    requireKaigiInviteSecretBase64Url(
      input.inviteSecretBase64Url,
      "inviteSecretBase64Url",
    ),
    input.networkPrefix,
  );
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

const normalizeOptionalPositiveInteger = (
  value: unknown,
  label: string,
): number | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    Object.is(value, -0) ||
    value <= 0
  ) {
    throw new Error(`${label} must be an exact positive safe integer.`);
  }
  return value;
};

const normalizeFirstReleaseSubscriptionId = (value: unknown): string => {
  const literal = requireFirstReleaseInputText(value, "subscriptionId", 1_024);
  const separator = literal.indexOf("$");
  if (
    separator <= 0 ||
    separator !== literal.lastIndexOf("$") ||
    separator === literal.length - 1 ||
    /\s/u.test(literal)
  ) {
    throw new Error("subscriptionId must use the exact name$domain form.");
  }
  return literal;
};

const buildSubscriptionActionDraftBody = (
  input: SubscriptionActionInput,
  action: SubscriptionActionDraftName,
  authority: string,
) => {
  const chargeAtMs = normalizeOptionalPositiveInteger(
    input.chargeAtMs,
    "chargeAtMs",
  );
  const cancelMode = input.cancelMode;
  if (
    cancelMode !== undefined &&
    cancelMode !== "immediate" &&
    cancelMode !== "period_end"
  ) {
    throw new Error("cancelMode must be immediate or period_end.");
  }
  if (action === "cancel") {
    if (!cancelMode) {
      throw new Error("Cancel subscription requires an explicit cancelMode.");
    }
    if (chargeAtMs !== undefined) {
      throw new Error("Cancel subscription does not accept chargeAtMs.");
    }
    return {
      authority,
      cancel_mode: { mode: cancelMode, value: null },
    };
  }
  if (cancelMode !== undefined) {
    throw new Error(`${action} subscription does not accept cancelMode.`);
  }
  if (action === "resume" || action === "charge_now") {
    const body: Record<string, unknown> = { authority };
    if (chargeAtMs !== undefined) {
      body.charge_at_ms = chargeAtMs;
    }
    return body;
  }
  if (chargeAtMs !== undefined) {
    throw new Error(`${action} subscription does not accept chargeAtMs.`);
  }
  return { authority };
};

const listSubscriptionPlansFromTorii = async (
  input: SubscriptionListPlansInput,
): Promise<SubscriptionPlanListResponseView> => {
  const pageRequest = requireFirstReleasePagination(input, {
    defaultLimit: 100,
    label: "Subscription plans",
  });
  const provider = requireOptionalFirstReleaseFilter(
    input.provider,
    "Subscription plans provider",
  );
  const endpoint = buildNexusEndpoint(
    input.toriiUrl,
    "/v1/subscriptions/plans",
    {
      provider,
      limit: pageRequest.limit,
      offset: pageRequest.offset,
      count_mode: "exact",
    },
  );
  const payload = await fetchJson(endpoint, "Subscription plans");
  requireFirstReleaseInputArray(
    payload.items,
    "Subscription plans response.items",
    pageRequest.limit,
  );
  const page = decodeSubscriptionPlanListResponse(payload);
  assertFirstReleasePageWindow(page, pageRequest, "Subscription plans");
  assertFirstReleaseHasMore(
    payload.has_more,
    page,
    pageRequest,
    "Subscription plans",
  );
  return page;
};

const listSubscriptionsFromTorii = async (
  input: SubscriptionListInput,
): Promise<SubscriptionListResponseView> => {
  const pageRequest = requireFirstReleasePagination(input, {
    defaultLimit: 100,
    label: "Subscriptions",
  });
  const ownedBy = requireOptionalFirstReleaseFilter(
    input.ownedBy,
    "Subscriptions owner",
  );
  const provider = requireOptionalFirstReleaseFilter(
    input.provider,
    "Subscriptions provider",
  );
  const status = requireOptionalFirstReleaseFilter(
    input.status,
    "Subscriptions status",
    32,
  );
  if (
    status !== undefined &&
    !["active", "paused", "past_due", "canceled", "suspended"].includes(status)
  ) {
    throw new Error("Subscriptions status is unsupported.");
  }
  const endpoint = buildNexusEndpoint(input.toriiUrl, "/v1/subscriptions", {
    owned_by: ownedBy,
    provider,
    status,
    limit: pageRequest.limit,
    offset: pageRequest.offset,
    count_mode: "exact",
  });
  const payload = await fetchJson(endpoint, "Subscriptions");
  requireFirstReleaseInputArray(
    payload.items,
    "Subscriptions response.items",
    pageRequest.limit,
  );
  const page = decodeSubscriptionListResponse(payload);
  assertFirstReleasePageWindow(page, pageRequest, "Subscriptions");
  assertFirstReleaseHasMore(
    payload.has_more,
    page,
    pageRequest,
    "Subscriptions",
  );
  return page;
};

const getSubscriptionFromTorii = async (
  input: SubscriptionGetInput,
): Promise<SubscriptionListItemView> => {
  const subscriptionId = normalizeFirstReleaseSubscriptionId(
    input.subscriptionId,
  );
  const endpoint = buildNexusEndpoint(
    input.toriiUrl,
    `/v1/subscriptions/${encodeURIComponent(subscriptionId)}`,
  );
  const payload = await fetchJson(endpoint, "Subscription");
  const item = decodeSubscriptionListItemResponse(payload);
  if (item.subscription_id !== subscriptionId) {
    throw new Error(
      "Subscription response does not match the requested subscription.",
    );
  }
  return item;
};

const SUBSCRIPTION_PLAN_LOOKUP_PAGE_SIZE = 100;
const SUBSCRIPTION_PLAN_LOOKUP_MAX_ITEMS = 10_000;
const SUBSCRIPTION_PLAN_LOOKUP_MAX_PAGES =
  SUBSCRIPTION_PLAN_LOOKUP_MAX_ITEMS / SUBSCRIPTION_PLAN_LOOKUP_PAGE_SIZE;
const SUBSCRIPTION_STATE_CONFIRM_INTERVAL_MS = 500;
const SUBSCRIPTION_STATE_CONFIRM_TIMEOUT_MS = 20_000;
const SUBSCRIPTION_RESOLVED_TIME_CLOCK_SKEW_MS = 30_000;
const POSITIVE_DECIMAL_U64 = /^[1-9][0-9]*$/u;
const MAX_U64 = (1n << 64n) - 1n;

const getSubscriptionIvmMaxCyclesFromTorii = async (
  toriiUrl: string,
): Promise<string> => {
  const preflight = ensureObjectResponse(
    await fetchJson(
      buildNexusEndpoint(toriiUrl, "/v1/pipeline/preflight"),
      "Pipeline preflight",
    ),
    "Pipeline preflight",
  );
  const pipeline = ensureObjectResponse(
    preflight.pipeline,
    "Pipeline preflight pipeline",
  );
  const raw = pipeline.ivm_admission_cycle_limit;
  const literal =
    typeof raw === "number" && Number.isSafeInteger(raw) && raw > 0
      ? String(raw)
      : typeof raw === "string" && raw.trim() === raw
        ? raw
        : "";
  if (!POSITIVE_DECIMAL_U64.test(literal) || BigInt(literal) > MAX_U64) {
    throw new Error(
      "Pipeline preflight pipeline.ivm_admission_cycle_limit must be a canonical positive u64 before subscription signing.",
    );
  }
  return literal;
};

const getSubscriptionPlanFromTorii = async (
  toriiUrl: string,
  planId: string,
): Promise<Record<string, unknown>> => {
  let offset = 0;
  let pages = 0;
  while (offset < SUBSCRIPTION_PLAN_LOOKUP_MAX_ITEMS) {
    if (pages >= SUBSCRIPTION_PLAN_LOOKUP_MAX_PAGES) {
      throw new Error(
        "Subscription plan lookup exceeded the first-release page bound.",
      );
    }
    const page = await listSubscriptionPlansFromTorii({
      toriiUrl,
      limit: Math.min(
        SUBSCRIPTION_PLAN_LOOKUP_PAGE_SIZE,
        SUBSCRIPTION_PLAN_LOOKUP_MAX_ITEMS - offset,
      ),
      offset,
    });
    pages += 1;
    const match = page.items.find((item) => item.plan_id === planId);
    if (match) {
      return match.plan;
    }
    if (offset + page.items.length >= page.total) {
      break;
    }
    if (page.items.length === 0) {
      throw new Error(
        "Subscription plan pagination stopped before the selected plan could be verified.",
      );
    }
    offset += page.items.length;
  }
  if (offset >= SUBSCRIPTION_PLAN_LOOKUP_MAX_ITEMS) {
    throw new Error(
      "Subscription plan lookup exceeded the first-release verification bound.",
    );
  }
  throw new Error(
    `Subscription plan ${planId} is not present in the live plan registry.`,
  );
};

const subscriptionDraftInstructionDecoder =
  (networkPrefix: number) =>
  (payloadHex: string): unknown =>
    decodeFirstReleaseInstruction(
      Buffer.from(payloadHex, "hex"),
      networkPrefix,
    );

const subscriptionDraftTriggerActionInspector =
  (networkPrefix: number) =>
  (encodedAction: string): unknown =>
    inspectFirstReleaseSubscriptionTriggerAction(encodedAction, networkPrefix);

const confirmSubscriptionResultingState = async (input: {
  toriiUrl: string;
  subscriptionId: string;
  networkPrefix: number;
  expected: SubscriptionStateDraft;
  plan: Record<string, unknown> | null;
}): Promise<{
  stateStatus: "confirmed" | "advanced" | "indexing";
  reconciliationMessage?: string;
}> => {
  const deadline = Date.now() + SUBSCRIPTION_STATE_CONFIRM_TIMEOUT_MS;
  let lastError: unknown = null;
  while (Date.now() <= deadline) {
    try {
      const record = await getSubscriptionFromTorii({
        toriiUrl: input.toriiUrl,
        subscriptionId: input.subscriptionId,
      });
      const confirmation = classifySubscriptionStateConfirmation({
        actual: record.subscription,
        expected: input.expected,
        plan: input.plan,
        invoice: record.invoice,
        subscriptionId: input.subscriptionId,
        networkPrefix: input.networkPrefix,
      });
      if (confirmation !== null) {
        return {
          stateStatus: confirmation === "exact" ? "confirmed" : "advanced",
        };
      }
      lastError = new Error(
        "The indexed subscription state is neither the signed draft nor an invoice-proven immediate billing successor.",
      );
    } catch (error) {
      lastError = error;
    }
    if (Date.now() + SUBSCRIPTION_STATE_CONFIRM_INTERVAL_MS > deadline) {
      break;
    }
    await waitForMs(SUBSCRIPTION_STATE_CONFIRM_INTERVAL_MS);
  }
  const detail =
    lastError instanceof Error && lastError.message
      ? ` Last read: ${lastError.message}`
      : "";
  console.warn(
    `The subscription transaction is proven in a finalized block, but its draft state or an invoice-proven immediate successor was not indexed within ${SUBSCRIPTION_STATE_CONFIRM_TIMEOUT_MS / 1000} seconds.${detail}`,
  );
  return {
    stateStatus: "indexing",
    reconciliationMessage: `The transaction is proven in a finalized block, but authoritative subscription state is still indexing. Do not resubmit; refresh subscriptions to reconcile the finalized transaction.${detail}`,
  };
};

const buildSubscriptionMutationReceipt = (
  draft: SubscriptionCreateMutationDraft | SubscriptionActionMutationDraft,
  submission: {
    hash: string;
    feeQuote?: TransactionFeeQuoteView;
    finality: TransactionFinalityProof;
  },
  confirmation: {
    stateStatus: "confirmed" | "advanced" | "indexing";
    reconciliationMessage?: string;
  },
): SubscriptionActionResponseView => ({
  ok: true,
  action: draft.action,
  subscription_id: draft.subscription_id,
  tx_hash_hex: submission.hash,
  finality: submission.finality,
  state_status: confirmation.stateStatus,
  ...(confirmation.reconciliationMessage
    ? { reconciliation_message: confirmation.reconciliationMessage }
    : {}),
  ...(submission.feeQuote ? { feeQuote: submission.feeQuote } : {}),
  ...(draft.action === "create"
    ? {
        billing_trigger_id: draft.billing_trigger_id,
        usage_trigger_id: draft.usage_trigger_id,
        first_charge_ms: draft.first_charge_ms,
      }
    : {}),
});

const beginSubscriptionMutation = (scopeKey: string) => {
  if (pendingSubscriptionReconciliations.has(scopeKey)) {
    throw new Error(
      "A finalized subscription transaction for this subscription is still indexing. Reconcile it before submitting another action.",
    );
  }
  if (inFlightSubscriptionMutations.has(scopeKey)) {
    throw new Error(
      "A subscription transaction for this subscription is already in progress.",
    );
  }
  inFlightSubscriptionMutations.add(scopeKey);
};

const rememberSubscriptionReconciliation = (input: {
  scopeKey: string;
  toriiUrl: string;
  chainId: string;
  networkPrefix: number;
  accountId: string;
  draft: SubscriptionCreateMutationDraft | SubscriptionActionMutationDraft;
  plan: Record<string, unknown> | null;
  receipt: SubscriptionActionResponseView;
}) => {
  if (input.receipt.state_status !== "indexing") {
    pendingSubscriptionReconciliations.delete(input.scopeKey);
    return;
  }
  pendingSubscriptionReconciliations.set(input.scopeKey, {
    toriiUrl: normalizeBaseUrl(input.toriiUrl),
    chainId: input.chainId,
    networkPrefix: input.networkPrefix,
    accountId: input.accountId,
    subscriptionId: input.draft.subscription_id,
    action: input.draft.action,
    transactionHash: input.receipt.tx_hash_hex,
    expected:
      input.draft.action === "create"
        ? input.draft.resulting_subscription
        : input.draft.details.resulting_subscription,
    plan: input.plan,
    receipt: input.receipt,
  });
};

const normalizeSubscriptionMutationAction = (
  value: unknown,
): SubscriptionMutationActionView => {
  if (
    value === "create" ||
    value === "pause" ||
    value === "resume" ||
    value === "cancel" ||
    value === "keep" ||
    value === "charge_now"
  ) {
    return value;
  }
  throw new Error("Subscription reconciliation action is invalid.");
};

const createSubscriptionOnTorii = async (
  input: SubscriptionCreateInput,
): Promise<SubscriptionActionResponseView> => {
  let mutationScopeKey: string | null = null;
  try {
    return await executeSubscriptionMutationBoundary({
      prepareDraft: async () => {
        const writeConnection = await assertWriteConnectionMatchesEndpoint({
          toriiUrl: input.toriiUrl,
          chainId: input.chainId,
          networkPrefix: input.networkPrefix,
          feature: "subscriptionWrites",
          operation: "POST /v1/subscriptions",
        });
        const accountId = normalizeCanonicalAccountIdLiteral(
          input.accountId,
          "accountId",
          writeConnection.networkPrefix,
        );
        const subscriptionId = normalizeFirstReleaseSubscriptionId(
          input.subscriptionId,
        );
        mutationScopeKey = subscriptionMutationScopeKey({
          toriiUrl: input.toriiUrl,
          chainId: writeConnection.chainId,
          networkPrefix: writeConnection.networkPrefix,
          accountId,
          subscriptionId,
        });
        beginSubscriptionMutation(mutationScopeKey);
        const planId = normalizeFirstReleaseAssetDefinitionId(input.planId);
        const firstChargeMs = normalizeOptionalPositiveInteger(
          input.firstChargeMs,
          "firstChargeMs",
        );
        const [plan, ivmMaxCycles] = await Promise.all([
          getSubscriptionPlanFromTorii(input.toriiUrl, planId),
          getSubscriptionIvmMaxCyclesFromTorii(input.toriiUrl),
        ]);
        const body: Record<string, unknown> = {
          authority: accountId,
          subscription_id: subscriptionId,
          plan_id: planId,
        };
        if (firstChargeMs !== undefined) {
          body.first_charge_ms = firstChargeMs;
        }
        const requestStartedAtMs = Date.now();
        const payload = await postJson(
          buildNexusEndpoint(input.toriiUrl, "/v1/subscriptions"),
          "Create subscription draft",
          body,
        );
        const responseReceivedAtMs = Date.now();
        const draft = decodeSubscriptionCreateMutationDraft(
          payload,
          {
            authority: accountId,
            subscriptionId,
            planId,
            plan,
            firstChargeMs,
            resolvedChargeWindow:
              firstChargeMs === undefined
                ? {
                    requestStartedAtMs,
                    responseReceivedAtMs,
                    clockSkewMs: SUBSCRIPTION_RESOLVED_TIME_CLOCK_SKEW_MS,
                  }
                : undefined,
            ivmMaxCycles,
            networkPrefix: writeConnection.networkPrefix,
          },
          subscriptionDraftInstructionDecoder(writeConnection.networkPrefix),
          subscriptionDraftTriggerActionInspector(
            writeConnection.networkPrefix,
          ),
        );
        const [freshPlan, freshIvmMaxCycles] = await Promise.all([
          getSubscriptionPlanFromTorii(input.toriiUrl, planId),
          getSubscriptionIvmMaxCyclesFromTorii(input.toriiUrl),
        ]);
        if (
          !subscriptionPlanSnapshotsMatch(
            plan,
            freshPlan,
            writeConnection.networkPrefix,
          )
        ) {
          throw new Error(
            "The live subscription plan changed while its unsigned draft was being reviewed.",
          );
        }
        if (freshIvmMaxCycles !== ivmMaxCycles) {
          throw new Error(
            "The live IVM admission limit changed while the subscription draft was being reviewed.",
          );
        }
        return {
          draft,
          plan: freshPlan,
          accountId,
          chainId: writeConnection.chainId,
          networkPrefix: writeConnection.networkPrefix,
        };
      },
      resolveSigningMaterial: ({ accountId, networkPrefix }) =>
        resolveSigningMaterial({
          accountId,
          networkPrefix,
          operationLabel: "Create subscription",
        }),
      quoteAndSign: async (prepared, signingMaterial) =>
        quoteAndSignInstructionTransaction({
          toriiUrl: input.toriiUrl,
          chainId: prepared.chainId,
          authority: prepared.accountId,
          networkPrefix: prepared.networkPrefix,
          instructions: prepared.draft.decoded_instructions,
          metadata: {},
          privateKey: hexToBuffer(
            signingMaterial.privateKeyHex,
            "privateKeyHex",
          ),
          privateKeyAlgorithm: signingMaterial.signingAlgorithm,
        }),
      submit: (_prepared, tx) =>
        submitSignedTransactionAndWaitForFinalizedBlock(
          input.toriiUrl,
          tx.signedTransaction,
          { feeQuote: tx.feeQuote },
        ),
      confirmResultingState: (prepared) =>
        confirmSubscriptionResultingState({
          toriiUrl: input.toriiUrl,
          subscriptionId: prepared.draft.subscription_id,
          networkPrefix: prepared.networkPrefix,
          expected: prepared.draft.resulting_subscription,
          plan: prepared.plan,
        }),
      buildReceipt: (prepared, submission, confirmation) => {
        const receipt = buildSubscriptionMutationReceipt(
          prepared.draft,
          submission,
          confirmation,
        );
        rememberSubscriptionReconciliation({
          scopeKey: mutationScopeKey!,
          toriiUrl: input.toriiUrl,
          chainId: prepared.chainId,
          networkPrefix: prepared.networkPrefix,
          accountId: prepared.accountId,
          draft: prepared.draft,
          plan: prepared.plan,
          receipt,
        });
        return receipt;
      },
    });
  } finally {
    if (mutationScopeKey) {
      inFlightSubscriptionMutations.delete(mutationScopeKey);
    }
  }
};

const postSubscriptionActionToTorii = async (
  input: SubscriptionActionInput,
  routeAction: "pause" | "resume" | "cancel" | "keep" | "charge-now",
  operationLabel: string,
): Promise<SubscriptionActionResponseView> => {
  const draftAction: SubscriptionActionDraftName =
    routeAction === "charge-now" ? "charge_now" : routeAction;
  let mutationScopeKey: string | null = null;
  try {
    return await executeSubscriptionMutationBoundary({
      prepareDraft: async () => {
        const writeConnection = await assertWriteConnectionMatchesEndpoint({
          toriiUrl: input.toriiUrl,
          chainId: input.chainId,
          networkPrefix: input.networkPrefix,
          feature: "subscriptionWrites",
          operation: `POST /v1/subscriptions/{subscription_id}/${routeAction}`,
        });
        const accountId = normalizeCanonicalAccountIdLiteral(
          input.accountId,
          "accountId",
          writeConnection.networkPrefix,
        );
        const subscriptionId = normalizeFirstReleaseSubscriptionId(
          input.subscriptionId,
        );
        mutationScopeKey = subscriptionMutationScopeKey({
          toriiUrl: input.toriiUrl,
          chainId: writeConnection.chainId,
          networkPrefix: writeConnection.networkPrefix,
          accountId,
          subscriptionId,
        });
        beginSubscriptionMutation(mutationScopeKey);
        const [current, ivmMaxCycles] = await Promise.all([
          getSubscriptionFromTorii({
            toriiUrl: input.toriiUrl,
            subscriptionId,
          }),
          getSubscriptionIvmMaxCyclesFromTorii(input.toriiUrl),
        ]);
        const chargeAtMs = normalizeOptionalPositiveInteger(
          input.chargeAtMs,
          "chargeAtMs",
        );
        const body = buildSubscriptionActionDraftBody(
          input,
          draftAction,
          accountId,
        );
        const requestStartedAtMs = Date.now();
        const payload = await postJson(
          buildNexusEndpoint(
            input.toriiUrl,
            `/v1/subscriptions/${encodeURIComponent(subscriptionId)}/${routeAction}`,
          ),
          `${operationLabel} draft`,
          body,
        );
        const responseReceivedAtMs = Date.now();
        const draft = decodeSubscriptionActionMutationDraft(
          payload,
          {
            authority: accountId,
            subscriptionId,
            action: draftAction,
            currentSubscription: current.subscription,
            currentPlan: current.plan,
            chargeAtMs,
            resolvedChargeWindow:
              chargeAtMs === undefined &&
              (draftAction === "resume" || draftAction === "charge_now")
                ? {
                    requestStartedAtMs,
                    responseReceivedAtMs,
                    clockSkewMs: SUBSCRIPTION_RESOLVED_TIME_CLOCK_SKEW_MS,
                  }
                : undefined,
            cancelMode: input.cancelMode,
            ivmMaxCycles,
            networkPrefix: writeConnection.networkPrefix,
          },
          subscriptionDraftInstructionDecoder(writeConnection.networkPrefix),
          subscriptionDraftTriggerActionInspector(
            writeConnection.networkPrefix,
          ),
        );
        const [freshCurrent, freshIvmMaxCycles] = await Promise.all([
          getSubscriptionFromTorii({
            toriiUrl: input.toriiUrl,
            subscriptionId,
          }),
          getSubscriptionIvmMaxCyclesFromTorii(input.toriiUrl),
        ]);
        if (
          !subscriptionStateSnapshotsMatch(
            current.subscription,
            freshCurrent.subscription,
            writeConnection.networkPrefix,
          )
        ) {
          throw new Error(
            "The live subscription state changed while its unsigned action draft was being reviewed.",
          );
        }
        const planUnchanged =
          current.plan === null || freshCurrent.plan === null
            ? current.plan === freshCurrent.plan
            : subscriptionPlanSnapshotsMatch(
                current.plan,
                freshCurrent.plan,
                writeConnection.networkPrefix,
              );
        if (!planUnchanged) {
          throw new Error(
            "The live subscription plan changed while its unsigned action draft was being reviewed.",
          );
        }
        if (freshIvmMaxCycles !== ivmMaxCycles) {
          throw new Error(
            "The live IVM admission limit changed while the subscription action draft was being reviewed.",
          );
        }
        return {
          draft,
          plan: freshCurrent.plan,
          accountId,
          chainId: writeConnection.chainId,
          networkPrefix: writeConnection.networkPrefix,
        };
      },
      resolveSigningMaterial: ({ accountId, networkPrefix }) =>
        resolveSigningMaterial({
          accountId,
          networkPrefix,
          operationLabel,
        }),
      quoteAndSign: async (prepared, signingMaterial) =>
        quoteAndSignInstructionTransaction({
          toriiUrl: input.toriiUrl,
          chainId: prepared.chainId,
          authority: prepared.accountId,
          networkPrefix: prepared.networkPrefix,
          instructions: prepared.draft.decoded_instructions,
          metadata: {},
          privateKey: hexToBuffer(
            signingMaterial.privateKeyHex,
            "privateKeyHex",
          ),
          privateKeyAlgorithm: signingMaterial.signingAlgorithm,
        }),
      submit: (_prepared, tx) =>
        submitSignedTransactionAndWaitForFinalizedBlock(
          input.toriiUrl,
          tx.signedTransaction,
          { feeQuote: tx.feeQuote },
        ),
      confirmResultingState: (prepared) =>
        confirmSubscriptionResultingState({
          toriiUrl: input.toriiUrl,
          subscriptionId: prepared.draft.subscription_id,
          networkPrefix: prepared.networkPrefix,
          expected: prepared.draft.details.resulting_subscription,
          plan: prepared.plan,
        }),
      buildReceipt: (prepared, submission, confirmation) => {
        const receipt = buildSubscriptionMutationReceipt(
          prepared.draft,
          submission,
          confirmation,
        );
        rememberSubscriptionReconciliation({
          scopeKey: mutationScopeKey!,
          toriiUrl: input.toriiUrl,
          chainId: prepared.chainId,
          networkPrefix: prepared.networkPrefix,
          accountId: prepared.accountId,
          draft: prepared.draft,
          plan: prepared.plan,
          receipt,
        });
        return receipt;
      },
    });
  } finally {
    if (mutationScopeKey) {
      inFlightSubscriptionMutations.delete(mutationScopeKey);
    }
  }
};

const reconcileSubscriptionMutationOnTorii = async (
  input: SubscriptionReconcileInput,
): Promise<SubscriptionActionResponseView> => {
  const writeConnection = await assertWriteConnectionMatchesEndpoint({
    toriiUrl: input.toriiUrl,
    chainId: input.chainId,
    networkPrefix: input.networkPrefix,
    feature: "subscriptionWrites",
  });
  const accountId = normalizeCanonicalAccountIdLiteral(
    input.accountId,
    "accountId",
    writeConnection.networkPrefix,
  );
  const subscriptionId = normalizeFirstReleaseSubscriptionId(
    input.subscriptionId,
  );
  const action = normalizeSubscriptionMutationAction(input.action);
  const transactionHash = trimString(input.transactionHash);
  if (!/^[0-9a-f]{64}$/u.test(transactionHash)) {
    throw new Error(
      "Subscription reconciliation transaction hash must be canonical lowercase 32-byte hex.",
    );
  }
  const scopeKey = subscriptionMutationScopeKey({
    toriiUrl: input.toriiUrl,
    chainId: writeConnection.chainId,
    networkPrefix: writeConnection.networkPrefix,
    accountId,
    subscriptionId,
  });
  const pending = pendingSubscriptionReconciliations.get(scopeKey);
  if (
    !pending ||
    pending.action !== action ||
    pending.transactionHash !== transactionHash
  ) {
    throw new Error(
      "No pending subscription reconciliation matches this endpoint, wallet, action, subscription, and finalized transaction.",
    );
  }

  const record = await getSubscriptionFromTorii({
    toriiUrl: input.toriiUrl,
    subscriptionId,
  });
  const confirmation = classifySubscriptionStateConfirmation({
    actual: record.subscription,
    expected: pending.expected,
    plan: pending.plan,
    invoice: record.invoice,
    subscriptionId,
    networkPrefix: writeConnection.networkPrefix,
  });
  if (confirmation === null) {
    return {
      ...pending.receipt,
      state_status: "indexing",
      reconciliation_message:
        "The transaction remains proven in a finalized block, but the live subscription projection does not yet match its exact reviewed result or an invoice-proven successor. Do not resubmit; refresh again to reconcile it.",
    };
  }

  const reconciled: SubscriptionActionResponseView = {
    ...pending.receipt,
    state_status: confirmation === "exact" ? "confirmed" : "advanced",
  };
  delete reconciled.reconciliation_message;
  pendingSubscriptionReconciliations.delete(scopeKey);
  return reconciled;
};

const validateSoraCloudAccountId = (accountId: string): string =>
  normalizeCanonicalI105AccountIdLiteral(accountId, "SoraCloud account ID");

const fetchSoraCloudHfSharedLeaseStatusPayload = (
  input: SoraCloudHfSharedLeaseStatusInput,
): Promise<Record<string, unknown>> =>
  fetchJson(
    buildNexusEndpoint(
      input.toriiUrl,
      "/v1/soracloud/hf/lease/status",
      buildSoraCloudHfStatusQuery(input, validateSoraCloudAccountId),
    ),
    "SoraCloud HF shared-lease status",
  );

const getSoraCloudStatusFromTorii = async (
  input: SoraCloudStatusInput,
): Promise<SoraCloudStatusView> => {
  try {
    const payload = await fetchJson(
      buildNexusEndpoint(input.toriiUrl, "/v1/soracloud/status"),
      "SoraCloud status",
    );
    return normalizeSoraCloudStatusPayload(payload);
  } catch (error) {
    if (
      error instanceof ApiRequestError &&
      [404, 405, 501].includes(error.status)
    ) {
      return unavailableSoraCloudStatus(
        "This Torii endpoint does not expose the SoraCloud API yet.",
        error.status,
      );
    }
    throw error;
  }
};

const getParametersFromTorii = (input: ToriiConfig) =>
  fetchJson(
    buildNexusEndpoint(input.toriiUrl, "/v1/parameters"),
    "Network parameters",
  );

const getSoraCloudHfSharedLeaseStatusFromTorii = async (
  input: SoraCloudHfSharedLeaseStatusInput,
): Promise<SoraCloudHfStatusView> => {
  try {
    const payload = await fetchSoraCloudHfSharedLeaseStatusPayload(input);
    return normalizeSoraCloudHfStatusPayload(
      payload,
      input,
      validateSoraCloudAccountId,
    );
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) {
      return missingSoraCloudHfStatus(
        "The requested Hugging Face source was not found in the shared-lease state.",
        error.status,
      );
    }
    throw error;
  }
};

const fetchExplorerAssetDefinitionSnapshot = async (
  toriiUrlRaw: string,
  assetDefinitionId: string,
  networkPrefix: number,
  signal?: AbortSignal,
) => {
  const endpoint = buildNexusEndpoint(
    toriiUrlRaw,
    `/v1/explorer/asset-definitions/${encodeURIComponent(assetDefinitionId)}/snapshot`,
  );
  const payload = await fetchJson(
    endpoint,
    "Explorer asset definition snapshot",
    undefined,
    signal,
  );
  return normalizeExplorerAssetDefinitionSnapshotPayload(payload, {
    expectedDefinitionId: assetDefinitionId,
    networkPrefix,
  });
};

const fetchExplorerAssetDefinitionEconometrics = async (
  toriiUrlRaw: string,
  assetDefinitionId: string,
  networkPrefix: number,
  signal?: AbortSignal,
) => {
  const endpoint = buildNexusEndpoint(
    toriiUrlRaw,
    `/v1/explorer/asset-definitions/${encodeURIComponent(assetDefinitionId)}/econometrics`,
  );
  const payload = await fetchJson(
    endpoint,
    "Explorer asset definition econometrics",
    undefined,
    signal,
  );
  return normalizeExplorerAssetDefinitionEconometricsPayload(payload, {
    expectedDefinitionId: assetDefinitionId,
    networkPrefix,
  });
};

const normalizeRejectionReasonValue = (value: unknown): string | null => {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === "string" || typeof value === "number") {
    const normalized = trimString(value);
    return normalized && normalized !== "[object Object]" ? normalized : null;
  }
  if (isPlainRecord(value)) {
    for (const key of [
      "message",
      "detail",
      "details",
      "reason",
      "code",
      "reject_code",
      "rejectCode",
    ]) {
      const normalized = normalizeRejectionReasonValue(value[key]);
      if (normalized) {
        return normalized;
      }
    }
  }
  return null;
};

const extractTransactionRejectionReason = (payload: unknown): string | null => {
  if (!isPlainRecord(payload)) {
    return null;
  }
  for (const key of [
    "rejection_reason",
    "rejectionReason",
    "reason",
    "reject_code",
    "rejectCode",
  ]) {
    const normalized = normalizeRejectionReasonValue(payload[key]);
    if (normalized) {
      return normalized;
    }
  }
  return (
    extractTransactionRejectionReason(payload.content) ??
    normalizeRejectionReasonValue(payload.status)
  );
};

const fetchExplorerTransactionRejectionReason = async (
  toriiUrl: string,
  hashHex: string,
) => {
  const endpoint = buildNexusEndpoint(
    toriiUrl,
    `/v1/explorer/transactions/${encodeURIComponent(hashHex)}`,
  );
  try {
    const payload = await fetchJson(
      endpoint,
      `Explorer transaction ${hashHex}`,
    );
    return extractTransactionRejectionReason(payload);
  } catch (error) {
    if (isApiRequestError(error) && error.status === 404) {
      return null;
    }
    return null;
  }
};

const buildTransactionFinalityFailureError = async (
  toriiUrl: string,
  hashHex: string,
  statusKind: string,
  payload?: unknown,
) => {
  const reason =
    extractTransactionRejectionReason(payload) ??
    (await fetchExplorerTransactionRejectionReason(toriiUrl, hashHex));
  return new Error(
    `Transaction ${hashHex} ${statusKind.toLowerCase()} before finalized success.${
      reason ? ` ${reason}` : ""
    }`,
  );
};

const transactionSubmissionResult = (submission: {
  hash: string;
  feeQuote?: TransactionFeeQuoteView;
  finality: TransactionFinalityProof;
}): TransactionSubmissionResultView => ({
  hash: submission.hash,
  ...(submission.feeQuote ? { feeQuote: submission.feeQuote } : {}),
  finality: submission.finality,
});

const waitForTransactionFinalizedInBlock = async (
  toriiUrl: string,
  hashHex: string,
  options: {
    timeoutMs?: number;
    signal?: AbortSignal;
  } = {},
) => {
  const signal = options.signal;
  const evidence = await waitForFinalizedTransaction({
    hashHex,
    timeoutMs: options.timeoutMs ?? CONFIDENTIAL_TX_FINALITY_TIMEOUT_MS,
    intervalMs: CONFIDENTIAL_TX_FINALITY_INTERVAL_MS,
    getGlobalStatus: () =>
      fetchFirstReleaseTransactionStatus(toriiUrl, hashHex, {
        scope: "global",
        signal,
      }),
    getExplorerTransaction: () =>
      fetchJson(
        buildNexusEndpoint(
          toriiUrl,
          `/v1/explorer/transactions/${encodeURIComponent(hashHex)}`,
        ),
        `Explorer transaction ${hashHex}`,
        undefined,
        signal,
      ),
    getExplorerBlock: (blockHeight) =>
      fetchJson(
        buildNexusEndpoint(
          toriiUrl,
          `/v1/explorer/blocks/${encodeURIComponent(String(blockHeight))}`,
        ),
        `Explorer block ${blockHeight}`,
        undefined,
        signal,
      ),
    getExplorerMetrics: () =>
      fetchJson(
        buildNexusEndpoint(toriiUrl, "/v1/explorer/metrics"),
        "Explorer finality metrics",
        undefined,
        signal,
      ),
    wait: (delayMs) => waitForMs(delayMs, signal),
    buildTerminalFailure: (statusKind, payload) =>
      buildTransactionFinalityFailureError(
        toriiUrl,
        hashHex,
        statusKind,
        payload,
      ),
  });
  return {
    finality: evidence.proof,
  };
};

const submitSignedTransactionAndWaitForFinalizedBlock = async (
  toriiUrl: string,
  signedTransaction: Buffer,
  options: {
    feeQuote?: TransactionFeeQuoteView;
  } = {},
) => {
  const { feeQuote } = options;
  const submission = await submitSignedTransactionAsVersioned(
    toriiUrl,
    signedTransaction,
  );
  const finalized = await waitForTransactionFinalizedInBlock(
    toriiUrl,
    submission.hash,
  );
  return {
    ...submission,
    ...(feeQuote ? { feeQuote } : {}),
    finality: finalized.finality,
  };
};

const hashSignedTransactionHex = (signedTransaction: Buffer) => {
  return hashFirstReleaseSignedTransaction(signedTransaction).toString("hex");
};

const readPipelineSubmissionRoute = (
  response: Pick<Response, "headers">,
): Record<string, number> | null => {
  const laneRaw = response.headers.get("x-iroha-route-lane-id");
  const dataspaceRaw = response.headers.get("x-iroha-route-dataspace-id");
  const laneId =
    laneRaw !== null && laneRaw.trim() !== "" ? Number(laneRaw) : null;
  const dataspaceId =
    dataspaceRaw !== null && dataspaceRaw.trim() !== ""
      ? Number(dataspaceRaw)
      : null;
  const route: Record<string, number> = {};
  if (Number.isSafeInteger(laneId)) {
    route.lane_id = Number(laneId);
  }
  if (Number.isSafeInteger(dataspaceId)) {
    route.dataspace_id = Number(dataspaceId);
  }
  return Object.keys(route).length ? route : null;
};

const attachPipelineSubmissionRoute = (
  value: unknown,
  route: Record<string, number> | null,
) => {
  if (!route) {
    return value ?? null;
  }
  if (isPlainRecord(value)) {
    return { ...value, route };
  }
  if (value === null || value === undefined) {
    return { route };
  }
  return { value, route };
};

const parseNativeTransactionReceiptJson = (value: unknown): unknown => {
  if (typeof value !== "string") {
    throw new Error(
      "Native transaction receipt decoder did not return JSON text.",
    );
  }
  const bytes = Buffer.from(value, "utf8");
  if (
    bytes.length < 1 ||
    bytes.length > PIPELINE_TRANSACTION_RECEIPT_MAX_BYTES
  ) {
    throw new Error(
      "Native transaction receipt JSON is outside its byte limit.",
    );
  }
  if (bytes.toString("utf8") !== value) {
    throw new Error(
      "Native transaction receipt JSON is not canonical UTF-8 text.",
    );
  }
  return parseStrictJson(value, "Native transaction receipt");
};

const readPipelineSubmissionResponse = async (
  response: Pick<Response, "status" | "headers" | "arrayBuffer">,
  options: {
    nativeBinding?: unknown;
    route: Record<string, number> | null;
  },
) => {
  if (response.status === 204) {
    return attachPipelineSubmissionRoute(null, options.route);
  }
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.includes("application/x-norito")) {
    const body = await readBoundedResponseBytes(response, {
      label: "Transaction submission receipt",
      maximumBytes: PIPELINE_TRANSACTION_RECEIPT_MAX_BYTES,
      allowEmpty: true,
    });
    if (body.length === 0) {
      return attachPipelineSubmissionRoute(null, options.route);
    }
    const native = options.nativeBinding as
      | IrohaNativeTransactionCodec
      | undefined;
    if (typeof native?.decodeTransactionReceiptJson !== "function") {
      throw new Error(
        "Cannot decode a non-empty Norito transaction receipt: the native binding does not expose decodeTransactionReceiptJson.",
      );
    }
    let decoded: string;
    try {
      decoded = native.decodeTransactionReceiptJson(body);
    } catch (cause) {
      throw new Error(
        "Failed to decode the non-empty Norito transaction receipt.",
        { cause },
      );
    }
    try {
      return attachPipelineSubmissionRoute(
        parseNativeTransactionReceiptJson(decoded),
        options.route,
      );
    } catch (cause) {
      throw new Error(
        "Native transaction receipt decoder returned invalid JSON.",
        { cause },
      );
    }
  }
  const payload = await readBoundedJsonResponse(response, {
    label: "Transaction submission receipt",
    maximumBytes: PIPELINE_TRANSACTION_RECEIPT_MAX_BYTES,
    requireApplicationJson: true,
    allowEmpty: true,
  });
  return attachPipelineSubmissionRoute(payload, options.route);
};

const submitSignedTransactionAsVersioned = async (
  toriiUrl: string,
  signedTransaction: Buffer,
) => {
  const signedTransactionBuffer = binaryToBuffer(signedTransaction);
  const pipelinePayload = encodeSignedTransactionForPipeline(
    signedTransactionBuffer,
    { nativeBinding: irohaNativeBinding },
  );
  const response = await nodeFetch(
    buildNexusEndpoint(toriiUrl, "/v1/pipeline/transactions"),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-norito",
        Accept: "application/x-norito, application/json",
      },
      body: pipelinePayload as unknown as BodyInit,
      redirect: "error",
    },
  );
  if (![200, 201, 202, 204].includes(response.status)) {
    throw await createApiRequestError(response, "Transaction submission");
  }
  const route = readPipelineSubmissionRoute(response);
  const submission = await readPipelineSubmissionResponse(response, {
    nativeBinding: irohaNativeBinding,
    route,
  });
  return {
    hash: hashSignedTransactionHex(signedTransactionBuffer),
    submission,
  };
};

const fetchConfidentialAssetPolicy = async (
  toriiUrlRaw: string,
  assetDefinitionId: string,
): Promise<ConfidentialAssetPolicyView> => {
  const normalizedAssetDefinitionId =
    extractAssetDefinitionId(assetDefinitionId).trim() ||
    assetDefinitionId.trim();
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

const fetchAccountAssetsList = async (input: {
  toriiUrl: string;
  accountId: string;
  networkPrefix: number;
  assetDefinitionId?: string;
  limit?: number;
  offset?: number;
}) => {
  const pageRequest = requireFirstReleasePagination(input, {
    defaultLimit: 50,
    label: "Account assets",
  });
  const normalizedBaseUrl = `${normalizeBaseUrl(input.toriiUrl)}/`;
  const normalizedAccountId = normalizeCanonicalAccountIdLiteral(
    input.accountId,
    "accountId",
    input.networkPrefix,
  );
  const endpoint = new URL(
    `v1/accounts/${encodeURIComponent(normalizedAccountId)}/assets`,
    normalizedBaseUrl,
  );
  endpoint.searchParams.set("limit", String(pageRequest.limit));
  endpoint.searchParams.set("offset", String(pageRequest.offset));
  endpoint.searchParams.set("count_mode", "exact");
  if (input.assetDefinitionId !== undefined) {
    const assetDefinitionId = normalizeFirstReleaseAssetDefinitionId(
      input.assetDefinitionId,
      "assetDefinitionId",
    );
    endpoint.searchParams.set("asset", assetDefinitionId);
  }
  const response = await fetchGetResponse(
    endpoint.toString(),
    "Account assets",
  );
  if (!response.ok) {
    throw await createApiRequestError(response, "Account assets");
  }
  const payload = await readBoundedJsonObjectResponse(
    response,
    "Account assets",
  );
  const page = normalizeAccountAssetListPayload(payload, {
    expectedAccountId: normalizedAccountId,
    expectedAssetDefinitionId: input.assetDefinitionId,
    networkPrefix: input.networkPrefix,
    maximumItems: pageRequest.limit,
  });
  assertFirstReleasePageWindow(page, pageRequest, "Account assets");
  assertFirstReleaseHasMore(
    payload.has_more,
    page,
    pageRequest,
    "Account assets",
  );
  return page;
};

const fetchGovernanceCouncilCurrent = async (
  toriiUrlRaw: string,
): Promise<GovernanceCouncilResponse> => {
  const payload = await fetchJson(
    buildNexusEndpoint(toriiUrlRaw, "/v1/gov/council/current"),
    "Governance council current",
  );
  return normalizeGovernanceCouncilCurrentPayload(payload);
};

const fetchGovernanceCitizenCount = async (
  toriiUrlRaw: string,
): Promise<GovernanceCitizenCountResponse> => {
  try {
    const payload = await fetchJson(
      buildNexusEndpoint(toriiUrlRaw, "/v1/gov/citizens"),
      "Governance citizen count",
    );
    return normalizeGovernanceCitizenCountPayload(payload, true);
  } catch (error) {
    if (isApiRequestError(error) && error.status === 404) {
      return normalizeGovernanceCitizenCountPayload(null, false);
    }
    throw error;
  }
};

const GOVERNANCE_CITIZEN_READ_TIMEOUT_MS = 10_000;

const fetchGovernanceCitizenStatus = async (
  toriiUrlRaw: string,
  accountId: string,
  networkPrefix: number,
): Promise<GovernanceCitizenStatusResponse> => {
  const normalizedNetworkPrefix =
    normalizeGovernanceNetworkPrefix(networkPrefix);
  const normalizedAccountId = normalizeCanonicalAccountIdLiteral(
    accountId,
    "accountId",
    normalizedNetworkPrefix,
  );
  const endpoint = buildNexusEndpoint(
    toriiUrlRaw,
    `/v1/gov/citizens/${encodeURIComponent(normalizedAccountId)}`,
  );
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(
      new Error("Governance citizenship status request timed out."),
    );
  }, GOVERNANCE_CITIZEN_READ_TIMEOUT_MS);
  try {
    const payload = await fetchJson(
      endpoint,
      "Governance citizenship status",
      undefined,
      controller.signal,
    );
    return decodeGovernanceCitizenStatus(payload, {
      expectedAccountId: normalizedAccountId,
      networkPrefix: normalizedNetworkPrefix,
    });
  } catch (error) {
    if (isApiRequestError(error) && error.status === 404) {
      return unavailableGovernanceCitizenStatus({
        expectedAccountId: normalizedAccountId,
        networkPrefix: normalizedNetworkPrefix,
      });
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};

const fetchConfidentialAssetPolicyForAccount = async (input: {
  toriiUrl: string;
  accountId: string;
  assetDefinitionId: string;
}) => {
  const requestedAssetDefinitionId = normalizeFirstReleaseAssetDefinitionId(
    input.assetDefinitionId,
  );
  const policy = await fetchConfidentialAssetPolicy(
    input.toriiUrl,
    requestedAssetDefinitionId,
  );
  const returnedAssetDefinitionId = extractAssetDefinitionId(
    trimString(policy.asset_id),
  ).trim();
  if (returnedAssetDefinitionId !== requestedAssetDefinitionId) {
    throw new Error(
      "Confidential asset policy returned a different asset definition.",
    );
  }
  return {
    policy,
    requestedAssetDefinitionId,
    resolvedAssetDefinitionId: returnedAssetDefinitionId,
  };
};

const listAllAccountTransactionsForConfidentialBackup = async (input: {
  toriiUrl: string;
  accountId: string;
  networkPrefix: number;
}) => {
  const normalizedAccountId = normalizeCanonicalAccountIdLiteral(
    input.accountId,
    "accountId",
    input.networkPrefix,
  );
  const items: Array<Record<string, unknown>> = [];
  let offset = 0;
  let total = Number.POSITIVE_INFINITY;
  let pages = 0;

  while (offset < total) {
    if (
      offset >= FIRST_RELEASE_ACCOUNT_TRANSACTION_SCAN_MAX_ITEMS ||
      pages >= FIRST_RELEASE_ACCOUNT_TRANSACTION_SCAN_MAX_PAGES
    ) {
      throw new Error(
        "Account transaction history exceeded its finite first-release scan budget.",
      );
    }
    const page = await fetchFirstReleaseAccountTransactions({
      toriiUrl: input.toriiUrl,
      accountId: normalizedAccountId,
      networkPrefix: input.networkPrefix,
      limit: CONFIDENTIAL_WALLET_BACKUP_ACCOUNT_TX_PAGE_SIZE,
      offset,
    });
    pages += 1;
    if (
      !page ||
      typeof page !== "object" ||
      !Array.isArray(page.items) ||
      page.items.some((item) => !isPlainRecord(item)) ||
      typeof page.total !== "number" ||
      !Number.isSafeInteger(page.total) ||
      page.total < 0 ||
      page.total < offset + page.items.length
    ) {
      throw new Error(
        "Account transaction response did not match the first-release page contract.",
      );
    }
    if (page.total > FIRST_RELEASE_ACCOUNT_TRANSACTION_SCAN_MAX_ITEMS) {
      throw new Error(
        "Account transaction history exceeded its finite first-release scan budget.",
      );
    }
    const pageItems: Array<Record<string, unknown>> = page.items.map(
      (item) => ({
        ...item,
      }),
    );
    items.push(...pageItems);
    total = page.total;
    offset += pageItems.length;
    if (pageItems.length === 0 && offset < total) {
      throw new Error(
        "Account transaction pagination stopped before the exact history was complete.",
      );
    }
  }

  return items;
};

const listAllAccountTransactions = async (input: {
  toriiUrl: string;
  accountId: string;
  networkPrefix: number;
}) =>
  listAllAccountTransactionsForConfidentialBackup({
    toriiUrl: input.toriiUrl,
    accountId: input.accountId,
    networkPrefix: input.networkPrefix,
  });

const fetchAssetDefinition = async (
  toriiUrlRaw: string,
  assetDefinitionId: string,
  label = "Asset definition",
) =>
  fetchJson(
    buildNexusEndpoint(
      toriiUrlRaw,
      `/v1/assets/definitions/${encodeURIComponent(assetDefinitionId.trim())}`,
    ),
    label,
  );

const fetchConfidentialAssetDefinition = async (
  toriiUrlRaw: string,
  assetDefinitionId: string,
) =>
  fetchAssetDefinition(
    toriiUrlRaw,
    assetDefinitionId,
    "Confidential asset definition",
  );

const fetchConfidentialNoteIndexTransactions = async (input: {
  toriiUrl: string;
  assetDefinitionIds: string[];
}): Promise<WalletConfidentialTransactionLike[]> => {
  assertFirstReleaseConfidentialScanTargets(input.assetDefinitionIds);
  const byHash = new Map<string, WalletConfidentialTransactionLike>();
  let noteIndexOrder = 0;
  for (const assetDefinitionId of input.assetDefinitionIds) {
    let budget = { pages: 0, items: 0 };
    let cursor: string | null = "";
    const seenCursors = new Set<string>();
    while (cursor !== null) {
      if (cursor) {
        if (seenCursors.has(cursor)) {
          throw new Error(
            "Confidential note index returned a repeated cursor.",
          );
        }
        seenCursors.add(cursor);
      }
      const endpoint = buildNexusEndpoint(
        input.toriiUrl,
        "/v1/confidential/notes",
        {
          asset_definition_id: assetDefinitionId,
          limit: FIRST_RELEASE_CONFIDENTIAL_NOTE_PAGE_SIZE,
          ...(cursor ? { cursor } : {}),
        },
      );
      const response = await fetchGetResponse(
        endpoint,
        "Confidential note index",
      );
      if (!response.ok) {
        const detail = await readBoundedApiErrorDetail(response);
        throw new Error(
          detail ||
            `Confidential note index request failed with status ${response.status} (${response.statusText})`,
        );
      }
      const page = parseConfidentialNoteIndexPage(
        await readBoundedJsonResponse(response, {
          label: "Confidential note index",
          maximumBytes: MAX_TORII_JSON_RESPONSE_BYTES,
          requireApplicationJson: true,
        }),
      );
      budget = consumeFirstReleaseConfidentialNotePage(
        budget,
        page.items.length,
      );
      for (const item of page.items) {
        const normalized = {
          ...item,
          note_index_order: noteIndexOrder,
        };
        noteIndexOrder += 1;
        byHash.set(normalized.entrypoint_hash ?? "", normalized);
      }
      assertFirstReleaseConfidentialNoteContinuation(
        budget,
        page.nextCursor !== null,
      );
      cursor = page.nextCursor;
    }
  }
  return [...byHash.values()];
};

const resolveTrackedConfidentialAssetIds = (input: {
  requestedAssetDefinitionId: string;
  resolvedAssetId: string;
}) => {
  const seen = new Set<string>();
  return [input.requestedAssetDefinitionId, input.resolvedAssetId]
    .map((value) => extractAssetDefinitionId(String(value ?? "")).trim())
    .filter((value) => {
      if (!value || seen.has(value)) {
        return false;
      }
      seen.add(value);
      return true;
    });
};

const resolveConfidentialAssetBalance = async (input: {
  toriiUrl: string;
  chainId: string;
  networkPrefix: number;
  accountId: string;
  assetDefinitionId: string;
  endpointScope?: EndpointIdentityScopeInput | null;
}): Promise<ConfidentialAssetBalanceResponse> => {
  const networkId = await resolveTrustedEndpointNetworkId({
    toriiUrl: input.toriiUrl,
    chainId: input.chainId,
    networkPrefix: input.networkPrefix,
  });
  const endpointScope =
    input.endpointScope ??
    (await inspectEndpointDerivedScope({
      toriiUrl: input.toriiUrl,
      chainId: input.chainId,
      networkPrefix: input.networkPrefix,
    }));
  const decryptionContext = await resolveConfidentialWalletDecryptionContext({
    accountId: input.accountId,
    networkPrefix: input.networkPrefix,
    operationLabel: "Confidential balance lookup",
  });
  const { requestedAssetDefinitionId, resolvedAssetDefinitionId } =
    await fetchConfidentialAssetPolicyForAccount({
      toriiUrl: input.toriiUrl,
      accountId: decryptionContext.accountId,
      assetDefinitionId: input.assetDefinitionId,
    });
  const resolvedAssetId = resolvedAssetDefinitionId;
  const trackedAssetIds = resolveTrackedConfidentialAssetIds({
    requestedAssetDefinitionId,
    resolvedAssetId,
  });
  const noteIndexTransactions = await fetchConfidentialNoteIndexTransactions({
    toriiUrl: input.toriiUrl,
    assetDefinitionIds: trackedAssetIds,
  });
  const committedTransactions = noteIndexTransactions;
  const scanSource = "global-note-index" as const;
  const displayTransactions = mergeConfidentialWalletShadowTransactions({
    toriiUrl: input.toriiUrl,
    accountId: decryptionContext.accountId,
    endpointScope,
    transactions: committedTransactions as WalletConfidentialTransactionLike[],
  });
  const ledger = collectWalletConfidentialLedger(displayTransactions, {
    privateKeyHex: decryptionContext.privateKeyHex,
    networkId,
    assetDefinitionIds: trackedAssetIds,
    receiveKeys: decryptionContext.receiveKeys,
    markUnrecognizedTransfersInexact: false,
  });
  const scanWatermarkBlock = displayTransactions.reduce<number | null>(
    (maxBlock, transaction) => {
      const block = Number(transaction.block);
      if (!Number.isFinite(block) || block < 0) {
        return maxBlock;
      }
      const normalizedBlock = Math.trunc(block);
      return maxBlock === null
        ? normalizedBlock
        : Math.max(maxBlock, normalizedBlock);
    },
    null,
  );
  const committedLedger = collectWalletConfidentialLedger(
    committedTransactions,
    {
      privateKeyHex: decryptionContext.privateKeyHex,
      networkId,
      assetDefinitionIds: trackedAssetIds,
      receiveKeys: decryptionContext.receiveKeys,
      markUnrecognizedTransfersInexact: false,
    },
  );
  const onChainBalance = {
    quantity: committedLedger.spendableQuantity,
    exact: committedLedger.exact,
  };
  return {
    resolvedAssetId,
    quantity: ledger.spendableQuantity,
    onChainQuantity: onChainBalance.quantity,
    spendableQuantity: ledger.spendableQuantity,
    exact: ledger.exact,
    scanSource,
    scanStatus: ledger.exact ? "complete" : "incomplete",
    scanWatermarkBlock,
    recoveredNoteCount: ledger.notes.length,
    trackedAssetIds,
  };
};

const quoteAndSignInstructionTransaction = async (input: {
  toriiUrl: string;
  chainId: string;
  authority: string;
  networkPrefix: number;
  instructions: object[];
  privateKey: Buffer;
  privateKeyAlgorithm: CryptoAlgorithm;
  metadata?: Record<string, unknown>;
  creationTimeMs?: number;
  ttlMs?: number;
  nonce?: number;
}) => {
  try {
    const networkId = await resolveTrustedEndpointNetworkId({
      toriiUrl: input.toriiUrl,
      chainId: input.chainId,
      networkPrefix: input.networkPrefix,
    });
    const request = buildCanonicalInstructionFeeQuoteRequest({
      networkId,
      authority: input.authority,
      networkPrefix: input.networkPrefix,
      instructions: input.instructions,
      privateKey: input.privateKey,
      metadata: input.metadata,
      creationTimeMs: input.creationTimeMs,
      ttlMs: input.ttlMs,
      nonce: input.nonce,
    });
    const quote = await fetchFirstReleaseAuthorityFeeQuote({
      toriiUrl: input.toriiUrl,
      networkPrefix: input.networkPrefix,
      payload: request.payload,
      auth: {
        accountId: request.canonicalAuth.accountId,
        networkId,
        privateKey: request.canonicalAuth.privateKey,
      },
    });
    const signed = signFirstReleaseAuthorityTransaction({
      networkId,
      draft: request.draft,
      quote,
      privateKey: input.privateKey,
      privateKeyAlgorithm: input.privateKeyAlgorithm,
    });
    return {
      ...signed,
      feeQuote: transactionFeeQuoteView(quote),
    };
  } finally {
    // This helper owns the caller-created transient key for the complete
    // authenticated quote/sign sequence.
    input.privateKey.fill(0);
  }
};

const submitInstructionTransaction = async (input: {
  toriiUrl: string;
  chainId: string;
  authorityAccountId: string;
  networkPrefix: number;
  instruction:
    | Record<string, unknown>
    | ((authority: string) => Record<string, unknown>);
}) => {
  const chainId = input.chainId.trim();
  if (!chainId) {
    throw new Error("chainId is required.");
  }
  const writeConnection = await assertWriteConnectionMatchesEndpoint({
    toriiUrl: input.toriiUrl,
    chainId,
    networkPrefix: input.networkPrefix,
    feature: "stakingWrites",
  });
  const wireInput = resolveCanonicalInstructionWireInput({
    authorityAccountId: input.authorityAccountId,
    networkPrefix: writeConnection.networkPrefix,
    instruction: input.instruction,
  });
  const signingMaterial = await resolveSigningMaterial({
    accountId: wireInput.authority,
    networkPrefix: writeConnection.networkPrefix,
    operationLabel: "Transaction submission",
  });
  const privateKey = hexToBuffer(
    signingMaterial.privateKeyHex,
    "privateKeyHex",
  );
  const tx = await quoteAndSignInstructionTransaction({
    toriiUrl: input.toriiUrl,
    chainId: writeConnection.chainId,
    authority: wireInput.authority,
    networkPrefix: writeConnection.networkPrefix,
    instructions: [wireInput.instruction],
    metadata: {},
    privateKey,
    privateKeyAlgorithm: signingMaterial.signingAlgorithm,
  });
  const submission = await submitSignedTransactionAndWaitForFinalizedBlock(
    input.toriiUrl,
    tx.signedTransaction,
    { feeQuote: tx.feeQuote },
  );
  return transactionSubmissionResult(submission);
};

const GOVERNANCE_REVIEW_TTL_MS = 2 * 60 * 1000;
const GOVERNANCE_REVIEW_LIMIT = 24;

type BondedGovernanceCitizenSnapshot = Readonly<{
  accountId: string;
  amount: string;
  bondedHeight: string;
}>;

type PreparedGovernanceAction = {
  view: GovernancePreparedActionView;
  toriiUrl: string;
  chainId: string;
  networkPrefix: number;
  networkId: NetworkId;
  accountId: string;
  signingAlgorithm: CryptoAlgorithm;
  governanceCapabilitiesFingerprint: string;
  draft: FirstReleaseAuthorityTransactionDraft;
  quote: FirstReleaseAuthorityFeeQuoteResponse;
};

type GovernancePrepareAuthentication = Readonly<{
  accountId: string;
  networkId: NetworkId;
  privateKey: Buffer;
  signingAlgorithm: CryptoAlgorithm;
}>;

const preparedGovernanceActions = new Map<string, PreparedGovernanceAction>();

const governanceEndpoint = (toriiUrl: string, path: string) =>
  new URL(
    path.replace(/^\//u, ""),
    `${normalizeBaseUrl(toriiUrl)}/`,
  ).toString();

const governanceRequestJson = async (
  toriiUrl: string,
  path: string,
  options: {
    method?: "GET" | "POST";
    body?: Record<string, unknown>;
    allowNotFound?: boolean;
  } = {},
): Promise<Record<string, unknown> | null> => {
  const method = options.method ?? "GET";
  const endpoint = governanceEndpoint(toriiUrl, path);
  const response =
    method === "GET"
      ? await fetchGetResponse(endpoint, `Governance ${path}`)
      : await nodeFetch(endpoint, {
          method,
          headers: {
            Accept: "application/json",
            ...(options.body ? { "Content-Type": "application/json" } : {}),
          },
          ...(options.body ? { body: JSON.stringify(options.body) } : {}),
        });
  if (options.allowNotFound && response.status === 404) return null;
  if (!response.ok) {
    throw await createApiRequestError(response, `Governance ${path}`);
  }
  return readBoundedJsonObjectResponse(response, `Governance ${path}`);
};

const fetchGovernanceCapabilities = async (
  toriiUrl: string,
): Promise<GovernanceCapabilitiesV1> => {
  const pin = await preloadIdentityPins.read(normalizeBaseUrl(toriiUrl));
  if (!pin) {
    throw new Error(
      "Governance capabilities require a pinned endpoint network identity. Check the endpoint in Settings first.",
    );
  }
  const payload = await governanceRequestJson(
    toriiUrl,
    GOVERNANCE_CAPABILITIES_PATH,
  );
  if (!payload) {
    throw new Error("Governance capabilities endpoint returned no contract.");
  }
  return parseGovernanceCapabilitiesV1(payload, pin.networkId);
};

const assertGovernanceWriteCapabilities = async (
  context: GovernancePrepareContext,
): Promise<GovernanceCapabilitiesV1> => {
  await assertWriteConnectionMatchesEndpoint({
    toriiUrl: context.toriiUrl,
    chainId: context.chainId,
    networkPrefix: context.networkPrefix,
    feature: "governanceWrites",
  });
  const capabilities = await fetchGovernanceCapabilities(context.toriiUrl);
  if (
    context.chainId.trim() !== TAIRA_GOVERNANCE_CHAIN_ID ||
    (context.networkPrefix !== undefined &&
      context.networkPrefix !== capabilities.networkPrefix) ||
    capabilities.networkPrefix !== TAIRA_GOVERNANCE_NETWORK_PREFIX
  ) {
    throw new Error(
      "The active wallet connection does not match the reviewed Taira governance capabilities.",
    );
  }
  return capabilities;
};

const assertCurrentBondedGovernanceCitizen = async (
  context: GovernancePrepareContext,
  capabilities: GovernanceCapabilitiesV1,
  expected?: BondedGovernanceCitizenSnapshot,
): Promise<BondedGovernanceCitizenSnapshot> => {
  const status = await fetchGovernanceCitizenStatus(
    context.toriiUrl,
    context.accountId,
    capabilities.networkPrefix,
  );
  if (status.state !== "citizen") {
    throw new Error(
      "A current bonded Taira citizen is required for this governance action.",
    );
  }
  if (
    status.accountId !== context.accountId ||
    typeof status.amount !== "string" ||
    !/^(?:0|[1-9]\d*)$/u.test(status.amount) ||
    typeof status.bondedHeight !== "string" ||
    !/^[1-9]\d*$/u.test(status.bondedHeight)
  ) {
    throw new Error(
      "The live Taira citizen identity, exact bond, or bonded height is malformed.",
    );
  }
  const snapshot: BondedGovernanceCitizenSnapshot = Object.freeze({
    accountId: status.accountId,
    amount: status.amount,
    bondedHeight: status.bondedHeight,
  });
  if (
    expected &&
    (snapshot.accountId !== expected.accountId ||
      snapshot.amount !== expected.amount ||
      snapshot.bondedHeight !== expected.bondedHeight)
  ) {
    throw new Error(
      "The live citizen account, bond amount, or bonded height changed after the immutable electorate snapshot.",
    );
  }
  return snapshot;
};

const resolveValidationFeeProposalFingerprint: GovernanceProposalIdResolver = ({
  proposer,
  kind,
}) => {
  if (kind.type === "ValidationFeePolicy") {
    return computeFirstReleaseValidationFeePolicyFingerprint({
      proposalOperator: proposer,
      networkPrefix: TAIRA_GOVERNANCE_NETWORK_PREFIX,
      policy: kind.policy as unknown as Record<string, unknown>,
    });
  }
  return computeFirstReleaseValidationFeePayoutLifecycleFingerprint({
    proposalOperator: proposer,
    networkPrefix: TAIRA_GOVERNANCE_NETWORK_PREFIX,
    payoutBinding: kind.payoutBinding as unknown as Record<string, unknown>,
  });
};

const fetchGovernanceProposalList = async (
  input: GovernanceProposalListInput,
): Promise<GovernanceProposalList> => {
  const { limit } = requireFirstReleasePagination(
    { limit: input.limit },
    {
      defaultLimit: 20,
      maximumLimit: 100,
      label: "Governance proposals",
    },
  );
  const cursor = input.cursor ?? null;
  if (
    cursor !== null &&
    (typeof cursor !== "string" || !/^[0-9a-f]{96}$/u.test(cursor))
  ) {
    throw new Error(
      "Governance proposal cursor must be the exact 96-character lowercase V1 token.",
    );
  }
  const query = new URLSearchParams({ limit: String(limit) });
  if (cursor !== null) query.set("cursor", cursor);
  const payload = await governanceRequestJson(
    input.toriiUrl,
    `${VALIDATION_FEE_PROPOSALS_PATH}?${query.toString()}`,
    { allowNotFound: true },
  );
  if (!payload) {
    throw new Error(
      "This Torii endpoint does not expose the typed validation-fee proposal catalog. Load a proposal with its exact 32-byte ID instead.",
    );
  }
  const normalized = normalizeGovernanceProposalList(
    payload,
    resolveValidationFeeProposalFingerprint,
  );
  return normalized;
};

const fetchGovernanceProposalDetail = async (
  input: GovernanceProposalDetailInput,
): Promise<GovernanceProposalDetail> => {
  const proposalId = canonicalGovernanceProposalId(input.proposalId);
  if (!proposalId) {
    throw new Error("proposalId must be 32-byte hex.");
  }
  if (input.networkPrefix !== TAIRA_GOVERNANCE_NETWORK_PREFIX) {
    throw new Error(
      "Typed validation-fee proposal reads require the exact Taira network prefix.",
    );
  }
  const rawId = proposalId.slice(2);
  const typedDetail = await governanceRequestJson(
    input.toriiUrl,
    validationFeeProposalPath(rawId),
    { allowNotFound: true },
  );
  if (!typedDetail) {
    throw new Error(
      `Typed validation-fee proposal ${proposalId} was not found.`,
    );
  }
  return normalizeGovernanceProposalDetail(
    typedDetail,
    proposalId,
    resolveValidationFeeProposalFingerprint,
  );
};

const fetchGovernanceValidationFeePolicy = async (input: {
  toriiUrl: string;
  chainId: string;
  networkPrefix: number;
}): Promise<GovernanceValidationFeePolicyView> => {
  const endpoint = trimString(input.toriiUrl);
  if (!endpoint) {
    throw new Error(
      "The active Taira endpoint is required for validation fees.",
    );
  }
  const chainId = trimString(input.chainId);
  const networkPrefix = normalizeOptionalAccountNetworkPrefix(
    input.networkPrefix,
  );
  if (
    chainId !== TAIRA_GOVERNANCE_CHAIN_ID ||
    networkPrefix !== TAIRA_GOVERNANCE_NETWORK_PREFIX
  ) {
    throw new Error(
      "Validation-fee policy reads require the exact Taira governance chain identity.",
    );
  }
  const capabilities = await fetchGovernanceCapabilities(endpoint);
  if (capabilities.networkPrefix !== networkPrefix) {
    throw new Error(
      "Validation-fee policy proof does not match the active endpoint governance identity.",
    );
  }
  return parseGovernanceValidationFeePolicyView(
    await ipcRenderer.invoke(GOVERNANCE_VALIDATION_FEE_POLICY_IPC_CHANNEL),
  );
};

const normalizeGovernanceWireId = normalizeGovernanceDraftWireId;

const governanceInstructionVariant = (
  instruction: Record<string, unknown>,
): { variant: string; payload: Record<string, unknown> } => {
  const entries = Object.entries(instruction);
  if (entries.length !== 1 || !isPlainRecord(entries[0][1])) {
    throw new Error(
      "Governance draft must decode to exactly one typed instruction variant.",
    );
  }
  return {
    variant: entries[0][0],
    payload: entries[0][1] as Record<string, unknown>,
  };
};

const normalizeComparableGovernanceValue = (value: unknown): unknown => {
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return `0x${Buffer.from(value).toString("hex")}`;
  }
  if (
    Array.isArray(value) &&
    value.length === 32 &&
    value.every(
      (entry) =>
        Number.isInteger(entry) && Number(entry) >= 0 && Number(entry) <= 255,
    )
  ) {
    return `0x${Buffer.from(value as number[]).toString("hex")}`;
  }
  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }
  if (typeof value === "string") {
    const hash = canonicalGovernanceProposalId(value);
    if (hash) return hash;
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(normalizeComparableGovernanceValue);
  }
  if (isPlainRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [
          key,
          normalizeComparableGovernanceValue(entry),
        ]),
    );
  }
  return value;
};

const governanceValuesEqual = (left: unknown, right: unknown) =>
  JSON.stringify(normalizeComparableGovernanceValue(left)) ===
  JSON.stringify(normalizeComparableGovernanceValue(right));

const assertGovernanceDecodedVariant = (
  decoded: Record<string, unknown>,
  expectedVariant: string,
  expectedPayload: Record<string, unknown>,
) => {
  const { variant, payload } = governanceInstructionVariant(decoded);
  if (variant !== expectedVariant) {
    throw new Error(
      `Governance draft decoded as ${variant}; expected ${expectedVariant}.`,
    );
  }
  assertGovernanceExactKeys(
    payload,
    Object.keys(expectedPayload),
    `Decoded ${expectedVariant} payload`,
  );
  if (!governanceValuesEqual(payload, expectedPayload)) {
    throw new Error(
      `Decoded ${expectedVariant} payload changed the exact reviewed fields.`,
    );
  }
};

/**
 * Torii drafts carry the registered concrete instruction frame, so the
 * wallet admits one only when it is byte-identical to the native encoding of
 * the exact instruction it reviewed, and reviews that native decoding.
 */
const decodeGovernanceDraftInstruction = (
  draft: Record<string, unknown>,
  expectedInstruction: Record<string, unknown>,
  networkPrefix: number,
): Record<string, unknown> => {
  const instructions = draft.tx_instructions;
  if (!Array.isArray(instructions) || instructions.length !== 1) {
    throw new Error("Governance draft must contain exactly one instruction.");
  }
  const item = ensureObjectResponse(
    instructions[0],
    "Governance draft instruction",
  );
  assertGovernanceExactKeys(
    item,
    ["payload_hex", "wire_id"],
    "Governance draft instruction",
  );
  const wireId = normalizeGovernanceWireId(item.wire_id);
  const expectedVariant =
    governanceInstructionVariant(expectedInstruction).variant;
  const expectedWireId = reviewedGovernanceDraftWireId(expectedVariant);
  if (!expectedWireId || wireId !== expectedWireId) {
    throw new Error(
      `Governance draft returned ${wireId}; expected exact wire id ${expectedWireId ?? "unsupported"}.`,
    );
  }
  const payloadHex = normalizeGovernanceDraftPayloadHex(item.payload_hex);
  const decoded = decodeReviewedFirstReleaseInstructionDraft({
    wireId,
    frame: Buffer.from(payloadHex, "hex"),
    expectedInstruction,
    networkPrefix,
  });
  const variant = governanceInstructionVariant(decoded);
  if (variant.variant !== expectedVariant) {
    throw new Error(
      `Governance payload decoded as ${variant.variant}; expected ${expectedVariant}.`,
    );
  }
  return decoded;
};

const prunePreparedGovernanceActions = () => {
  const now = Date.now();
  for (const [reviewId, prepared] of preparedGovernanceActions) {
    if (prepared.view.expiresAtMs <= now) {
      preparedGovernanceActions.delete(reviewId);
    }
  }
  while (preparedGovernanceActions.size >= GOVERNANCE_REVIEW_LIMIT) {
    const oldest = preparedGovernanceActions.keys().next().value;
    if (typeof oldest !== "string") break;
    preparedGovernanceActions.delete(oldest);
  }
};

const prepareGovernanceDecodedAction = async (input: {
  context: GovernancePrepareContext;
  operation: GovernanceWriteOperation;
  title: string;
  proposalId?: string | null;
  draft: Record<string, unknown>;
  expectedInstruction: Record<string, unknown>;
  validate: (decoded: Record<string, unknown>) => void;
  authentication?: GovernancePrepareAuthentication;
}): Promise<GovernancePreparedActionView> => {
  const chainId = normalizeNonEmptyString(input.context.chainId, "chainId");
  const governanceCapabilities = await assertGovernanceWriteCapabilities(
    input.context,
  );
  const governanceCapabilitiesFingerprint =
    governanceCapabilitiesContractFingerprintV1(governanceCapabilities);
  const writeConnection = await assertWriteConnectionMatchesEndpoint({
    toriiUrl: input.context.toriiUrl,
    chainId,
    networkPrefix: input.context.networkPrefix,
  });
  const accountId = normalizeCanonicalAccountIdLiteral(
    input.context.accountId,
    "accountId",
    writeConnection.networkPrefix,
  );
  const decoded = decodeGovernanceDraftInstruction(
    input.draft,
    input.expectedInstruction,
    writeConnection.networkPrefix,
  );
  input.validate(decoded);
  const networkId = writeConnection.networkId;
  const authentication = input.authentication;
  if (
    authentication &&
    (authentication.accountId !== accountId ||
      !authentication.networkId.equals(networkId) ||
      !Buffer.isBuffer(authentication.privateKey) ||
      authentication.privateKey.length === 0)
  ) {
    throw new Error(
      "Governance draft authentication differs from the reviewed account or network.",
    );
  }
  const signingMaterial = authentication
    ? null
    : await resolveSigningMaterial({
        accountId,
        networkPrefix: writeConnection.networkPrefix,
        operationLabel: input.title,
      });
  const signingAlgorithm =
    authentication?.signingAlgorithm ?? signingMaterial!.signingAlgorithm;
  const privateKey = authentication
    ? authentication.privateKey
    : hexToBuffer(signingMaterial!.privateKeyHex, "privateKeyHex");
  let draft: FirstReleaseAuthorityTransactionDraft;
  let quote: FirstReleaseAuthorityFeeQuoteResponse;
  try {
    draft = buildFirstReleaseAuthorityTransactionDraft({
      networkId,
      networkPrefix: writeConnection.networkPrefix,
      authority: accountId,
      instructions: [decoded],
      metadata: {},
    });
    quote = await fetchFirstReleaseAuthorityFeeQuote({
      toriiUrl: input.context.toriiUrl,
      networkPrefix: writeConnection.networkPrefix,
      payload: draft.payload,
      auth: { accountId, networkId, privateKey },
    });
  } finally {
    if (!authentication) privateKey.fill(0);
  }
  const reviewId = randomBytes(24).toString("base64url");
  const proposalId =
    canonicalGovernanceProposalId(
      input.proposalId ?? input.draft.proposal_id,
    ) ?? null;
  const expiresAtMs = Date.now() + GOVERNANCE_REVIEW_TTL_MS;
  const view: GovernancePreparedActionView = {
    reviewId,
    operation: input.operation,
    title: input.title,
    proposalId,
    decodedInstruction: decoded,
    fee: transactionFeeQuoteView(quote),
    expiresAtMs,
  };
  prunePreparedGovernanceActions();
  preparedGovernanceActions.set(reviewId, {
    view,
    toriiUrl: input.context.toriiUrl,
    chainId,
    networkPrefix: writeConnection.networkPrefix,
    networkId,
    accountId,
    signingAlgorithm,
    governanceCapabilitiesFingerprint,
    draft,
    quote,
  });
  return view;
};

const assertGovernanceExactKeys = (
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
): void => {
  const ownKeys = Reflect.ownKeys(value);
  if (
    ownKeys.some((key) => typeof key !== "string") ||
    ownKeys.some((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return !descriptor?.enumerable || !("value" in descriptor);
    })
  ) {
    throw new Error(`${label} must contain enumerable JSON data fields.`);
  }
  const actual = (ownKeys as string[]).sort();
  const sortedExpected = [...expected].sort();
  if (
    actual.length !== sortedExpected.length ||
    actual.some((key, index) => key !== sortedExpected[index])
  ) {
    throw new Error(`${label} contains missing or unknown fields.`);
  }
};

const prepareGovernanceCitizenRegistrationAction = async (
  input: GovernanceCitizenRegistrationPrepareInput,
) => {
  const capabilities = await assertGovernanceWriteCapabilities(input);
  const owner = normalizeCanonicalAccountIdLiteral(
    input.accountId,
    "accountId",
    capabilities.networkPrefix,
  );
  const amount = normalizeIntegerAmount(input.amount, "amount");
  if (amount !== capabilities.citizenshipBondAmount) {
    throw new Error(
      "The reviewed citizenship bond differs from the endpoint capabilities.",
    );
  }
  const draft = await governanceRequestJson(
    input.toriiUrl,
    GOVERNANCE_CITIZEN_DRAFT_PATH,
    {
      method: "POST",
      body: { version: 1, owner },
    },
  );
  if (!draft) {
    throw new Error("Governance citizenship endpoint returned no draft.");
  }
  assertGovernanceCitizenDraftResponse(draft, { owner, amount });
  return prepareGovernanceDecodedAction({
    context: input,
    operation: "register-citizen",
    title: "Register bonded citizen",
    draft,
    expectedInstruction: { RegisterCitizen: { owner, amount } },
    validate(decoded) {
      assertGovernanceDecodedVariant(decoded, "RegisterCitizen", {
        owner,
        amount,
      });
    },
  });
};

const prepareGovernanceProposalAction = async (
  input: GovernanceProposalPrepareInput,
) => {
  // The pinned native codec has no reviewable JSON form for
  // ProposeValidationFeePayoutLifecycle, so the policy is the only kind this
  // wallet can decode, review, and sign. Refuse anything else before any
  // endpoint request or vault access.
  if (input.kind !== "ValidationFeePolicy") {
    throw new Error(
      "This wallet can prepare only validation-fee policy proposals.",
    );
  }
  const capabilities = await assertGovernanceWriteCapabilities(input);
  await assertCurrentBondedGovernanceCitizen(input, capabilities);
  const proposalOperator = normalizeCanonicalAccountIdLiteral(
    input.accountId,
    "accountId",
    capabilities.networkPrefix,
  );
  // Capabilities were parsed against the endpoint's pinned NetworkId.
  const networkId = NetworkId.parse(capabilities.networkId);
  if (!isPlainRecord(input.payload)) {
    throw new Error("Governance proposal payload must be an object.");
  }
  const validationFeeRequest = buildValidationFeePolicyDraftRequest(
    input.payload,
    proposalOperator,
    networkId.toString(),
    capabilities.networkPrefix,
  );
  const expectedValidationFeeProposalId =
    computeFirstReleaseValidationFeePolicyFingerprint({
      proposalOperator,
      networkPrefix: capabilities.networkPrefix,
      policy: validationFeeRequest.proposal.payload.policy,
    });
  // The explicit renderer "Decode and quote" action authorizes only these
  // route-scoped authenticated reads. Transaction signing still happens only
  // after the separate review confirmation below.
  const signingMaterial = await resolveSigningMaterial({
    accountId: proposalOperator,
    networkPrefix: capabilities.networkPrefix,
    operationLabel: `Authenticate ${input.kind} draft`,
  });
  const privateKey = hexToBuffer(
    signingMaterial.privateKeyHex,
    "privateKeyHex",
  );
  try {
    const response = await canonicalToriiJsonRequest({
      toriiUrl: input.toriiUrl,
      path: VALIDATION_FEE_POLICY_DRAFT_PATH,
      method: "POST",
      label: "Governance validation-fee proposal draft",
      auth: {
        accountId: proposalOperator,
        networkId,
        privateKey,
      },
      body: validationFeeRequest,
    });
    if (!response.ok) {
      throw await createApiRequestError(
        response,
        "Governance validation-fee proposal draft",
      );
    }
    const draft = await readBoundedJsonObjectResponse(
      response,
      "Governance validation-fee proposal draft",
    );
    assertValidationFeePolicyDraftResponse(
      draft,
      validationFeeRequest,
      expectedValidationFeeProposalId,
    );
    return await prepareGovernanceDecodedAction({
      context: input,
      operation: "propose",
      title: `Propose ${input.kind}`,
      proposalId: trimString(draft.proposal_id),
      draft,
      expectedInstruction:
        validationFeePolicyDraftInstruction(validationFeeRequest),
      authentication: {
        accountId: proposalOperator,
        networkId,
        privateKey,
        signingAlgorithm: signingMaterial.signingAlgorithm,
      },
      validate(decoded) {
        assertValidationFeePolicyDecodedInstruction(
          decoded,
          validationFeeRequest,
        );
      },
    });
  } finally {
    privateKey.fill(0);
  }
};

const confirmPreparedGovernanceAction = async (input: {
  reviewId: string;
  accountId: string;
}): Promise<GovernanceFinalizedActionView> => {
  prunePreparedGovernanceActions();
  const reviewId = normalizeNonEmptyString(input.reviewId, "reviewId");
  const prepared = preparedGovernanceActions.get(reviewId);
  if (!prepared) {
    throw new Error(
      "Governance review expired or is no longer available. Prepare it again.",
    );
  }
  const governanceCapabilities = await assertGovernanceWriteCapabilities({
    toriiUrl: prepared.toriiUrl,
    chainId: prepared.chainId,
    networkPrefix: prepared.networkPrefix,
    accountId: prepared.accountId,
  });
  const governanceCapabilitiesFingerprint =
    governanceCapabilitiesContractFingerprintV1(governanceCapabilities);
  if (
    governanceCapabilitiesFingerprint !==
    prepared.governanceCapabilitiesFingerprint
  ) {
    preparedGovernanceActions.delete(reviewId);
    throw new Error(
      "Governance capabilities changed after review. Prepare the action again.",
    );
  }
  const accountId = normalizeCanonicalAccountIdLiteral(
    input.accountId,
    "accountId",
    governanceCapabilities.networkPrefix,
  );
  if (accountId !== prepared.accountId) {
    preparedGovernanceActions.delete(reviewId);
    throw new Error("Active account changed after governance review.");
  }
  const signingMaterial = await resolveSigningMaterial({
    accountId,
    networkPrefix: prepared.networkPrefix,
    operationLabel: prepared.view.title,
  });
  if (signingMaterial.signingAlgorithm !== prepared.signingAlgorithm) {
    preparedGovernanceActions.delete(reviewId);
    throw new Error(
      "Wallet signing algorithm changed after governance review.",
    );
  }
  preparedGovernanceActions.delete(reviewId);
  const signed = withPrivateKeyBuffer(
    signingMaterial.privateKeyHex,
    "privateKeyHex",
    (privateKey) =>
      signFirstReleaseAuthorityTransaction({
        networkId: prepared.networkId,
        draft: prepared.draft,
        quote: prepared.quote,
        privateKey,
        privateKeyAlgorithm: signingMaterial.signingAlgorithm,
      }),
  );
  const submission = await submitSignedTransactionAndWaitForFinalizedBlock(
    prepared.toriiUrl,
    signed.signedTransaction,
    { feeQuote: transactionFeeQuoteView(prepared.quote) },
  );
  return {
    ...transactionSubmissionResult(submission),
    operation: prepared.view.operation,
    proposalId: prepared.view.proposalId,
    status: "finalized",
  };
};

const assertIrohaConnectWalletContext = async (
  context: IrohaConnectWalletContext,
): Promise<IrohaConnectWalletContext> => {
  const writeConnection = await assertWriteConnectionMatchesEndpoint({
    toriiUrl: context.toriiUrl,
    chainId: context.chainId,
    networkPrefix: context.networkPrefix,
    feature: "irohaConnectSessions",
  });
  return {
    toriiUrl: normalizeBaseUrl(context.toriiUrl),
    chainId: writeConnection.chainId,
    networkPrefix: writeConnection.networkPrefix,
    networkId: writeConnection.networkId.toString(),
    accountId: normalizeCanonicalAccountIdLiteral(
      context.accountId,
      "accountId",
      writeConnection.networkPrefix,
    ),
  };
};

const signExactIrohaConnectMessage = async (
  context: IrohaConnectWalletContext,
  message: Uint8Array,
) => {
  const verifiedContext = await assertIrohaConnectWalletContext(context);
  if (message.length === 0) {
    throw new Error("IrohaConnect signing message is empty.");
  }
  const signingMaterial = await resolveSigningMaterial({
    accountId: verifiedContext.accountId,
    networkPrefix: verifiedContext.networkPrefix,
    operationLabel: "IrohaConnect signing",
  });
  const algorithmCode = getConnectSigningAlgorithmCode(
    signingMaterial.signingAlgorithm,
  );
  if (algorithmCode !== 0) {
    throw new Error(
      "IrohaConnect current v1 wallet signatures require Ed25519.",
    );
  }
  return withPrivateKeyBuffer(
    signingMaterial.privateKeyHex,
    "privateKeyHex",
    (privateKey) => {
      const signature = Buffer.from(
        sign(Buffer.from(message), privateKey, {
          algorithm: signingMaterial.signingAlgorithm,
        }),
      );
      return {
        algorithmCode,
        algorithmLabel: signingAlgorithmLabel(signingMaterial.signingAlgorithm),
        signatureHex: toHex(signature),
        signatureBase64: signature.toString("base64"),
      };
    },
  );
};

const irohaConnectBoundary = new IrohaConnectBoundary({
  assertContext: assertIrohaConnectWalletContext,
  authorize: async (confirmation) =>
    (await ipcRenderer.invoke(
      IROHA_CONNECT_CONFIRMATION_CHANNEL,
      confirmation,
    )) === true,
  reviewTransaction: (context, payloadBytes) =>
    reviewConnectTransactionPayload({
      payloadBytes,
      expectedAuthority: context.accountId,
      expectedNetworkId: context.networkId,
      networkPrefix: context.networkPrefix,
    }),
  // Raw requests sign the exact message; transaction requests sign the
  // reviewed `HashOf<TransactionPayload>` derived by the boundary.
  sign: signExactIrohaConnectMessage,
});

const api: IrohaBridge = {
  async ping(config) {
    const { toriiUrl } = requireFirstReleaseIpcInput(config, "toriiConfig");
    return fetchFirstReleaseHealth(toriiUrl).catch(() => null);
  },
  async getChainMetadata(config) {
    const { toriiUrl } = requireFirstReleaseIpcInput(config, "toriiConfig");
    return fetchChainMetadata(toriiUrl);
  },
  async inspectEndpoint(config) {
    return inspectEndpointIdentity(
      requireFirstReleaseIpcInput(config, "endpointInspection"),
    );
  },
  async confirmEndpointNetworkIdentity(input) {
    const { toriiUrl, networkId } = requireFirstReleaseIpcInput(
      input,
      "endpointNetworkIdentityConfirm",
    );
    const pin = await confirmEndpointNetworkIdentityChange({
      toriiUrl,
      networkId,
    });
    return { confirmed: pin !== null && pin.networkId === networkId };
  },
  async getSigningAlgorithms(config) {
    return resolveSigningAlgorithmOptions(
      requireFirstReleaseIpcInput(config, "toriiConfig"),
    );
  },
  generateKeyPair(input) {
    const exactInput = requireFirstReleaseIpcInput(input, "generateKeyPair");
    const signingAlgorithm = normalizeRequiredBridgeSigningAlgorithm(
      exactInput.signingAlgorithm,
    );
    const seedHex = exactInput.seedHex;
    const seed = seedHex === undefined ? null : hexToBuffer(seedHex, "seedHex");
    try {
      const { publicKey, privateKey } = generateSdkKeyPair({
        algorithm: signingAlgorithm,
        ...(seed === null ? {} : { seed }),
      });
      try {
        return {
          publicKeyHex: toHex(publicKey),
          privateKeyHex: toHex(privateKey),
          signingAlgorithm,
        };
      } finally {
        privateKey.fill(0);
      }
    } finally {
      seed?.fill(0);
    }
  },
  generateKaigiSignalKeyPair() {
    return generateKaigiX25519KeyPair();
  },
  async isSecureVaultAvailable() {
    return await isSecureVaultAvailable();
  },
  async storeAccountSecret(input) {
    const { accountId, networkPrefix, privateKeyHex, signingAlgorithm } =
      requireFirstReleaseIpcInput(input, "storeAccountSecret");
    const normalizedPrivateKeyHex = normalizePrivateKeyHex(privateKeyHex);
    const normalizedSigningAlgorithm =
      normalizeRequiredBridgeSigningAlgorithm(signingAlgorithm);
    const publicKeyHex = withPrivateKeyBuffer(
      normalizedPrivateKeyHex,
      "privateKeyHex",
      (privateKey) =>
        toHex(
          publicKeyFromPrivate(privateKey, {
            algorithm: normalizedSigningAlgorithm,
          }),
        ),
    );
    const boundAccountId = requireAccountIdBoundToPublicKey({
      accountId,
      networkPrefix,
      publicKeyHex,
      signingAlgorithm: normalizedSigningAlgorithm,
    });
    await storeAccountSecretInVault({
      accountId: boundAccountId,
      privateKeyHex: normalizedPrivateKeyHex,
      signingAlgorithm: normalizedSigningAlgorithm,
    });
  },
  async listAccountSecretFlags(input) {
    const { accountIds, networkPrefix } = requireFirstReleaseIpcInput(
      input,
      "listAccountSecretFlags",
    );
    const accountIdInputs = requireFirstReleaseInputArray(
      accountIds,
      "accountIds",
      256,
    );
    return await listAccountSecretFlagsFromVault(
      accountIdInputs.map((accountId) =>
        normalizeCanonicalAccountIdLiteral(
          requireFirstReleaseInputText(accountId, "accountIds entry", 1_024),
          "accountId",
          networkPrefix,
        ),
      ),
    );
  },
  async copyTextToClipboard(input) {
    const { text } = requireFirstReleaseIpcInput(input, "copyTextToClipboard");
    if (typeof text !== "string" || text.length === 0) {
      throw new Error("Clipboard text is required.");
    }
    if (
      Buffer.byteLength(text, "utf8") > FIRST_RELEASE_CLIPBOARD_TEXT_MAX_BYTES
    ) {
      throw new Error("Clipboard text exceeds the first-release byte limit.");
    }
    await ipcRenderer.invoke("clipboard:writeText", text);
  },
  deriveAccountAddress(input) {
    const { domain, publicKeyHex, networkPrefix, signingAlgorithm } =
      requireFirstReleaseIpcInput(input, "deriveAccountAddress");
    hexToBuffer(publicKeyHex, "publicKeyHex");
    return deriveAccountAddressView({
      domain,
      publicKeyHex,
      networkPrefix,
      signingAlgorithm:
        normalizeRequiredBridgeSigningAlgorithm(signingAlgorithm),
    });
  },
  validateCanonicalAccountId(input) {
    const { accountId, networkPrefix } = requireFirstReleaseIpcInput(
      input,
      "validateCanonicalAccountId",
    );
    const literal = requireFirstReleaseInputText(
      accountId,
      "accountId",
      16_384,
    );
    if (literal.length > 4_096) {
      throw new Error("accountId must be at most 4096 characters.");
    }
    if (
      networkPrefix !== undefined &&
      (typeof networkPrefix !== "number" ||
        !Number.isInteger(networkPrefix) ||
        networkPrefix < 0 ||
        networkPrefix > 0x3fff)
    ) {
      throw new Error("networkPrefix must be an integer between 0 and 16383.");
    }
    return networkPrefix === undefined
      ? normalizeCanonicalI105AccountIdLiteral(literal, "accountId")
      : normalizeCanonicalAccountIdLiteral(literal, "accountId", networkPrefix);
  },
  derivePublicKey(input) {
    const { privateKeyHex, signingAlgorithm: signingAlgorithmInput } =
      requireFirstReleaseIpcInput(input, "derivePublicKey");
    const signingAlgorithm = normalizeRequiredBridgeSigningAlgorithm(
      signingAlgorithmInput,
    );
    const publicKey = withPrivateKeyBuffer(
      privateKeyHex,
      "privateKeyHex",
      (privateKey) =>
        publicKeyFromPrivate(privateKey, { algorithm: signingAlgorithm }),
    );
    return { publicKeyHex: toHex(publicKey), signingAlgorithm };
  },
  async resolveAccountAlias(input) {
    return resolveAccountAliasSelector(
      requireFirstReleaseIpcInput(input, "resolveAccountAlias"),
    );
  },
  async createConfidentialPaymentAddress(input) {
    const { accountId, networkPrefix } = requireFirstReleaseIpcInput(
      input,
      "createConfidentialPaymentAddress",
    );
    await assertSecureVaultAvailable("Confidential payment address creation");
    const descriptor = await createStoredConfidentialReceiveDescriptor({
      accountId,
      networkPrefix,
      operationLabel: "Confidential payment address creation",
    });
    return {
      schema: "iroha-confidential-payment-address/v3",
      receiveKeyId: descriptor.receiveKeyId,
      receivePublicKeyBase64Url: descriptor.receivePublicKeyBase64Url,
      shieldedOwnerTagHex: descriptor.ownerTagHex,
      shieldedDiversifierHex: descriptor.diversifierHex,
      recoveryHint: "one-time-receive-key",
    };
  },
  async exportConfidentialWalletBackup(input) {
    const { toriiUrl, chainId, networkPrefix, accountId, mnemonic } =
      requireFirstReleaseIpcInput(input, "exportConfidentialWalletBackup");
    await assertSecureVaultAvailable("Confidential wallet backup export");
    const normalizedAccountId = normalizeCanonicalAccountIdLiteral(
      accountId,
      "accountId",
      networkPrefix,
    );
    if (normalizedAccountId !== accountId) {
      throw new Error(
        "accountId must be the canonical active-network I105 literal.",
      );
    }
    const normalizedChainId = trimString(chainId);
    if (!normalizedChainId) {
      throw new Error("chainId is required.");
    }
    const endpointScope = await inspectEndpointDerivedScope({
      toriiUrl,
      chainId: normalizedChainId,
      networkPrefix,
    });
    if (!endpointScope) {
      throw new Error(
        "Confidential wallet backup export requires verified endpoint identity so shadow state cannot be omitted.",
      );
    }
    const receiveKeys =
      await listConfidentialReceiveKeysForAccount(normalizedAccountId);
    const shadowState = readConfidentialWalletShadowState(
      getConfidentialWalletShadowKeys({
        toriiUrl,
        accountId: normalizedAccountId,
        endpointScope,
      }),
      { requireDurable: true },
    );
    const accountTransactions = await listAllAccountTransactions({
      toriiUrl,
      accountId: normalizedAccountId,
      networkPrefix,
    }).catch(() => [] as Array<Record<string, unknown>>);
    const scanWatermarkBlock = accountTransactions.reduce<number | null>(
      (highest, transaction) => {
        const block = Number(transaction.block);
        if (!Number.isFinite(block) || block < 0) {
          return highest;
        }
        const normalizedBlock = Math.trunc(block);
        return highest === null || normalizedBlock > highest
          ? normalizedBlock
          : highest;
      },
      null,
    );
    return {
      schema: CONFIDENTIAL_WALLET_BACKUP_SCHEMA_V2,
      chainId: normalizedChainId,
      accountId: normalizedAccountId,
      scanWatermarkBlock,
      stateBox: encryptConfidentialWalletBackupState(
        {
          schema: "iroha-demo-confidential-wallet-state/v1",
          receiveKeys: receiveKeys.map((record) => ({
            keyId: record.keyId,
            ownerTagHex: record.ownerTagHex,
            diversifierHex: record.diversifierHex,
            publicKeyBase64Url: record.publicKeyBase64Url,
            privateKeyBase64Url: record.privateKeyBase64Url,
            createdAtMs: record.createdAtMs,
          })),
          shadowTransactions: shadowState.transactions,
        },
        mnemonic,
      ),
    };
  },
  async importConfidentialWalletBackup(input) {
    const {
      toriiUrl,
      chainId,
      networkPrefix,
      accountId,
      mnemonic,
      confidentialWallet,
    } = requireFirstReleaseIpcInput(input, "importConfidentialWalletBackup");
    const backup =
      parseConfidentialWalletBackupMetadataInput(confidentialWallet);
    await assertSecureVaultAvailable("Confidential wallet backup restore");
    const normalizedAccountId = normalizeCanonicalAccountIdLiteral(
      accountId,
      "accountId",
      networkPrefix,
    );
    if (normalizedAccountId !== accountId) {
      throw new Error(
        "accountId must be the canonical active-network I105 literal.",
      );
    }
    const backupAccountId = normalizeCanonicalAccountIdLiteral(
      backup.accountId,
      "confidentialWallet.accountId",
      networkPrefix,
    );
    if (backupAccountId !== backup.accountId) {
      throw new Error(
        "Confidential wallet backup account must use canonical active-network I105.",
      );
    }
    if (backupAccountId !== normalizedAccountId) {
      throw new Error(
        "Confidential wallet backup does not match the restored account.",
      );
    }
    const normalizedChainId = trimString(chainId);
    if (!normalizedChainId) {
      throw new Error("chainId is required.");
    }
    if (backup.chainId !== normalizedChainId) {
      throw new Error(
        "Confidential wallet backup does not match the active chain.",
      );
    }
    const endpointScope = await inspectEndpointDerivedScope({
      toriiUrl,
      chainId: normalizedChainId,
      networkPrefix,
    });
    if (!endpointScope) {
      throw new Error(
        "Confidential wallet backup restore requires verified endpoint identity so shadow state can be retained.",
      );
    }
    const decryptedState = decryptConfidentialWalletBackupState(
      backup.stateBox,
      mnemonic,
    );
    const existingReceiveKeys =
      await listConfidentialReceiveKeysForAccount(normalizedAccountId);
    const existingReceiveKeysById = new Map(
      existingReceiveKeys.map((record) => [record.keyId, record]),
    );
    const mergedReceiveKeyIds = new Set(existingReceiveKeysById.keys());
    for (const receiveKey of decryptedState.receiveKeys) {
      const existing = existingReceiveKeysById.get(receiveKey.keyId);
      if (
        existing &&
        (existing.ownerTagHex !== receiveKey.ownerTagHex ||
          existing.diversifierHex !== receiveKey.diversifierHex ||
          existing.publicKeyBase64Url !== receiveKey.publicKeyBase64Url ||
          existing.privateKeyBase64Url !== receiveKey.privateKeyBase64Url ||
          existing.createdAtMs !== receiveKey.createdAtMs)
      ) {
        throw new Error(
          "Confidential wallet backup conflicts with an existing receive key; no new keys were stored.",
        );
      }
      mergedReceiveKeyIds.add(receiveKey.keyId);
    }
    if (mergedReceiveKeyIds.size > SECURE_VAULT_MAX_RECEIVE_KEYS_PER_ACCOUNT) {
      throw new Error(
        "Confidential wallet backup exceeds the per-account receive-key capacity; no new keys were stored.",
      );
    }
    const shadowKeys = getConfidentialWalletShadowKeys({
      toriiUrl,
      accountId: normalizedAccountId,
      endpointScope,
    });
    const existingShadowState = readConfidentialWalletShadowState(shadowKeys, {
      requireDurable: true,
    });
    const mergedShadowState = prepareConfidentialWalletShadowState({
      schema: CONFIDENTIAL_WALLET_SHADOW_SCHEMA,
      transactions: [
        ...existingShadowState.transactions,
        ...decryptedState.shadowTransactions,
      ],
    }).normalized;
    await storeConfidentialReceiveKeysInVault(
      decryptedState.receiveKeys.map((receiveKey) => ({
        ...receiveKey,
        accountId: normalizedAccountId,
      })),
    );
    writeConfidentialWalletShadowState(shadowKeys, mergedShadowState);
  },
  async registerAccount(input) {
    const exactInput = requireFirstReleaseIpcInput(input, "registerAccount");
    const registrationMetadata = requireFirstReleaseJsonObject(
      exactInput.metadata ?? {},
      "Account registration metadata",
    );
    const requestedAccountId = normalizeCanonicalAccountIdLiteral(
      exactInput.accountId,
      "accountId",
      exactInput.networkPrefix,
    );
    const authorityAccountId = normalizeCanonicalAccountIdLiteral(
      exactInput.authorityAccountId,
      "authorityAccountId",
      exactInput.networkPrefix,
    );
    const writeConnection = await assertWriteConnectionMatchesEndpoint({
      toriiUrl: exactInput.toriiUrl,
      chainId: exactInput.chainId,
      networkPrefix: exactInput.networkPrefix,
      feature: "accountRegistration",
    });
    const authoritySigningMaterial = await resolveSigningMaterial({
      accountId: authorityAccountId,
      networkPrefix: writeConnection.networkPrefix,
      operationLabel: "Create on-chain account",
    });
    const tx = await quoteAndSignInstructionTransaction({
      toriiUrl: exactInput.toriiUrl,
      chainId: writeConnection.chainId,
      networkPrefix: writeConnection.networkPrefix,
      authority: authorityAccountId,
      instructions: [
        buildFirstReleaseRegisterAccountInstruction({
          accountId: requestedAccountId,
          networkPrefix: writeConnection.networkPrefix,
          metadata: registrationMetadata,
        }),
      ],
      metadata: withRequiredGasAssetMetadata(undefined, exactInput.toriiUrl),
      privateKey: hexToBuffer(
        authoritySigningMaterial.privateKeyHex,
        "authorityPrivateKeyHex",
      ),
      privateKeyAlgorithm: authoritySigningMaterial.signingAlgorithm,
    });
    const submission = await submitSignedTransactionAndWaitForFinalizedBlock(
      exactInput.toriiUrl,
      tx.signedTransaction,
      { feeQuote: tx.feeQuote },
    );
    return transactionSubmissionResult(submission);
  },
  async transferAsset(rendererInput) {
    const input = requireFirstReleaseIpcInput(rendererInput, "transferAsset");
    const transferMemo =
      input.memo === undefined
        ? undefined
        : requireFirstReleaseInputText(input.memo, "memo", 1_024);
    if (transferMemo && transferMemo.normalize("NFC") !== transferMemo) {
      throw new Error("memo must be NFC-normalized canonical text.");
    }
    const accountId = normalizeCanonicalAccountIdLiteral(
      input.accountId,
      "accountId",
      input.networkPrefix,
    );
    const destinationLiteral = requireFirstReleaseInputText(
      input.destinationAccountId,
      "destinationAccountId",
      2_048,
    );
    const assetDefinitionId = normalizeFirstReleaseAssetDefinitionId(
      input.assetDefinitionId,
    );
    const quantity = requireFirstReleaseTransferQuantity(input.quantity);
    const writeConnection = await assertWriteConnectionMatchesEndpoint({
      toriiUrl: input.toriiUrl,
      chainId: input.chainId,
      networkPrefix: input.networkPrefix,
      feature: "assetTransfers",
    });
    const destinationAccountId = (
      await resolveAccountAliasSelector({
        toriiUrl: input.toriiUrl,
        alias: destinationLiteral,
        networkPrefix: writeConnection.networkPrefix,
      })
    ).accountId;
    const sourceAssetHoldingLiteral = buildAssetHoldingIdLiteral({
      assetDefinitionId,
      accountId,
    });
    if (!sourceAssetHoldingLiteral) {
      throw new Error(
        `Unable to build the source holding for canonical asset definition "${assetDefinitionId}".`,
      );
    }
    const sourceAssetHoldingId = normalizeAssetHoldingId(
      sourceAssetHoldingLiteral,
      "sourceAssetHoldingId",
    );
    const signingMaterial = await resolveSigningMaterial({
      accountId,
      networkPrefix: writeConnection.networkPrefix,
      operationLabel: "Transfer",
    });
    const tx = await quoteAndSignInstructionTransaction({
      toriiUrl: input.toriiUrl,
      chainId: writeConnection.chainId,
      networkPrefix: writeConnection.networkPrefix,
      authority: accountId,
      instructions: [
        buildFirstReleaseTransferAssetInstruction({
          sourceAssetHoldingId,
          quantity,
          destinationAccountId,
          networkPrefix: writeConnection.networkPrefix,
        }),
      ],
      metadata: withRequiredGasAssetMetadata(
        transferMemo === undefined ? undefined : { memo: transferMemo },
        input.toriiUrl,
      ),
      privateKey: hexToBuffer(signingMaterial.privateKeyHex, "privateKeyHex"),
      privateKeyAlgorithm: signingMaterial.signingAlgorithm,
    });
    const submission = await submitSignedTransactionAndWaitForFinalizedBlock(
      input.toriiUrl,
      tx.signedTransaction,
      { feeQuote: tx.feeQuote },
    );
    return transactionSubmissionResult(submission);
  },
  setIrohaConnectContext(input) {
    const context = requireFirstReleaseIpcInput(input, "irohaConnectContext");
    irohaConnectBoundary.setContext(context);
  },
  resetIrohaConnectBoundary() {
    irohaConnectBoundary.reset();
  },
  prepareIrohaConnectSession(input) {
    const exactInput = requireFirstReleaseIpcInput(
      input,
      "irohaConnectPrepareSession",
    );
    const context = requireFirstReleaseIpcInput(
      exactInput.context,
      "irohaConnectContext",
    );
    return irohaConnectBoundary.prepareSession({
      ...exactInput,
      context,
    });
  },
  approveIrohaConnectSession(input) {
    const exactInput = requireFirstReleaseIpcInput(
      input,
      "irohaConnectApproveSession",
    );
    return irohaConnectBoundary.approveSession(exactInput);
  },
  processIrohaConnectFrame(input) {
    const exactInput = requireFirstReleaseIpcInput(
      input,
      "irohaConnectProcessFrame",
    );
    return irohaConnectBoundary.processFrame(exactInput);
  },
  approveIrohaConnectRequest(input) {
    const exactInput = requireFirstReleaseIpcInput(
      input,
      "irohaConnectApproveRequest",
    );
    return irohaConnectBoundary.approveRequest(exactInput);
  },
  rejectIrohaConnectRequest(input) {
    const exactInput = requireFirstReleaseIpcInput(
      input,
      "irohaConnectRejectRequest",
    );
    return irohaConnectBoundary.rejectRequest(exactInput);
  },
  closeIrohaConnectSession(input) {
    const { sessionToken } = requireFirstReleaseIpcInput(
      input,
      "irohaConnectCloseSession",
    );
    irohaConnectBoundary.closeSession(sessionToken);
  },
  async takePendingIrohaConnectDeepLink() {
    const uri: unknown = await ipcRenderer.invoke(
      IROHA_CONNECT_TAKE_DEEP_LINK_CHANNEL,
    );
    if (uri === null) {
      return null;
    }
    if (typeof uri !== "string" || parseIrohaConnectDeepLink(uri) !== uri) {
      throw new Error("The pending IrohaConnect link is not canonical.");
    }
    return uri;
  },
  async getConfidentialAssetPolicy(input) {
    const { toriiUrl, accountId, assetDefinitionId } =
      requireFirstReleaseIpcInput(input, "confidentialAssetPolicy");
    const { policy, resolvedAssetDefinitionId } =
      await fetchConfidentialAssetPolicyForAccount({
        toriiUrl,
        accountId,
        assetDefinitionId,
      });
    const assetDefinition = await fetchConfidentialAssetDefinition(
      toriiUrl,
      resolvedAssetDefinitionId,
    );
    return assertConfidentialPolicyProjectionAgreement(policy, assetDefinition);
  },
  getConfidentialAssetBalance(input) {
    const { toriiUrl, chainId, networkPrefix, accountId, assetDefinitionId } =
      requireFirstReleaseIpcInput(input, "confidentialAssetBalance");
    return resolveConfidentialAssetBalance({
      toriiUrl,
      chainId,
      networkPrefix,
      accountId,
      assetDefinitionId,
    });
  },
  scanConfidentialWallet(input) {
    const { toriiUrl, chainId, networkPrefix, accountId, assetDefinitionId } =
      requireFirstReleaseIpcInput(input, "confidentialAssetBalance");
    return resolveConfidentialAssetBalance({
      toriiUrl,
      chainId,
      networkPrefix,
      accountId,
      assetDefinitionId,
    });
  },
  fetchAccountAssets(input) {
    const {
      toriiUrl,
      accountId,
      networkPrefix,
      assetDefinitionId,
      limit = 50,
      offset,
    } = requireFirstReleaseIpcInput(input, "accountAssets");
    return fetchAccountAssetsList({
      toriiUrl,
      accountId,
      networkPrefix,
      assetDefinitionId,
      limit,
      offset,
    });
  },
  async fetchAccountTransactions(input) {
    const {
      toriiUrl,
      accountId,
      networkPrefix,
      limit = 20,
      offset,
    } = requireFirstReleaseIpcInput(input, "accountTransactions");
    const normalizedAccountId = normalizeCanonicalAccountIdLiteral(
      accountId,
      "accountId",
      networkPrefix,
    );
    return fetchFirstReleaseAccountTransactions({
      toriiUrl,
      accountId: normalizedAccountId,
      networkPrefix,
      limit,
      offset,
    });
  },
  listAccountPermissions(input) {
    const {
      toriiUrl,
      networkPrefix,
      accountId,
      limit = 200,
      offset,
    } = requireFirstReleaseIpcInput(input, "accountPermissions");
    return fetchFirstReleaseAccountPermissions({
      toriiUrl,
      accountId: normalizeCanonicalAccountIdLiteral(
        accountId,
        "accountId",
        networkPrefix,
      ),
      limit,
      offset,
    });
  },
  getGovernanceCapabilities(input) {
    const { toriiUrl } = requireFirstReleaseIpcInput(
      input,
      "governanceCapabilities",
    );
    return fetchGovernanceCapabilities(toriiUrl);
  },
  getGovernanceCitizenStatus(input) {
    const { toriiUrl, accountId, networkPrefix } = requireFirstReleaseIpcInput(
      input,
      "governanceCitizenStatus",
    );
    return fetchGovernanceCitizenStatus(toriiUrl, accountId, networkPrefix);
  },
  getGovernanceCitizenCount(input) {
    const { toriiUrl } = requireFirstReleaseIpcInput(
      input,
      "governanceCitizenCount",
    );
    return fetchGovernanceCitizenCount(toriiUrl);
  },
  async getGovernanceUnlockStats(input) {
    const { toriiUrl, chainId, networkPrefix, accountId } =
      requireFirstReleaseIpcInput(input, "governanceUnlockStats");
    const networkId = await resolveTrustedEndpointNetworkId({
      toriiUrl,
      chainId,
      networkPrefix,
    });
    const authority = normalizeCanonicalAccountIdLiteral(
      accountId,
      "accountId",
      networkPrefix,
    );
    const signingMaterial = await resolveSigningMaterial({
      accountId: authority,
      networkPrefix,
      operationLabel: "Governance unlock statistics",
    });
    const payload = await withPrivateKeyBufferAsync(
      signingMaterial.privateKeyHex,
      "privateKeyHex",
      (privateKey) =>
        fetchFirstReleaseGovernanceUnlockStats({
          toriiUrl,
          auth: {
            accountId: authority,
            networkId,
            privateKey,
          },
        }),
    );
    return normalizeGovernanceUnlockStatsPayload(payload);
  },
  getGovernanceCouncilCurrent(input) {
    const { toriiUrl } = requireFirstReleaseIpcInput(
      input,
      "governanceCouncilCurrent",
    );
    return fetchGovernanceCouncilCurrent(toriiUrl);
  },
  listGovernanceProposals(input) {
    return fetchGovernanceProposalList(
      requireFirstReleaseIpcInput(input, "governanceProposalList"),
    );
  },
  getGovernanceProposalDetail(input) {
    return fetchGovernanceProposalDetail(
      requireFirstReleaseIpcInput(input, "governanceProposalDetail"),
    );
  },
  getGovernanceCurrentValidationFeePolicy(input) {
    return fetchGovernanceValidationFeePolicy(
      requireFirstReleaseIpcInput(input, "governanceValidationFeePolicy"),
    );
  },
  prepareGovernanceCitizenRegistration(input) {
    return prepareGovernanceCitizenRegistrationAction(
      requireFirstReleaseIpcInput(input, "governanceCitizenRegistration"),
    );
  },
  prepareGovernanceProposal(input) {
    return prepareGovernanceProposalAction(
      requireFirstReleaseIpcInput(input, "governanceProposalPrepare"),
    );
  },
  confirmGovernanceAction(input) {
    return confirmPreparedGovernanceAction(
      requireFirstReleaseIpcInput(input, "governanceConfirm"),
    );
  },
  getExplorerMetrics(config) {
    const { toriiUrl } = requireFirstReleaseIpcInput(config, "toriiConfig");
    return fetchFirstReleaseExplorerMetrics(toriiUrl).catch(() => null);
  },
  async getNetworkStats(input) {
    const { toriiUrl, assetDefinitionId, networkPrefix } =
      requireFirstReleaseIpcInput(input, "networkStats");
    const normalizedAssetDefinitionId = normalizeFirstReleaseAssetDefinitionId(
      assetDefinitionId,
      "assetDefinitionId",
    );

    const warnings: string[] = [];
    const [
      explorerResult,
      statusResult,
      sumeragiResult,
      lifecycleResult,
      supplyResult,
      econometricsResult,
    ] = await Promise.allSettled([
      withNetworkStatsTimeout("Explorer metrics", (signal) =>
        fetchFirstReleaseExplorerMetrics(toriiUrl, signal),
      ),
      withNetworkStatsTimeout("Runtime status telemetry", (signal) =>
        fetchRuntimeStatusSnapshot(toriiUrl, signal),
      ),
      withNetworkStatsTimeout(
        "Sumeragi consensus telemetry",
        async (signal) => {
          const payload = await fetchJson(
            buildNexusEndpoint(toriiUrl, "/v1/sumeragi/status"),
            "Sumeragi status",
            undefined,
            signal,
          );
          normalizeCurrentSumeragiTelemetry(payload);
          return payload;
        },
      ),
      withNetworkStatsTimeout("Nexus lifecycle telemetry", (signal) =>
        fetchNexusLifecycle(toriiUrl, signal),
      ),
      withNetworkStatsTimeout("XOR supply snapshot", (signal) =>
        fetchExplorerAssetDefinitionSnapshot(
          toriiUrl,
          normalizedAssetDefinitionId,
          networkPrefix,
          signal,
        ),
      ),
      withNetworkStatsTimeout("XOR flow econometrics", (signal) =>
        fetchExplorerAssetDefinitionEconometrics(
          toriiUrl,
          normalizedAssetDefinitionId,
          networkPrefix,
          signal,
        ),
      ),
    ]);

    const explorer =
      explorerResult.status === "fulfilled" ? explorerResult.value : null;
    if (explorerResult.status === "rejected" || explorer === null) {
      warnings.push("Explorer metrics are unavailable.");
    }

    const statusSnapshot =
      statusResult.status === "fulfilled" ? statusResult.value : null;
    if (statusResult.status === "rejected") {
      warnings.push("Runtime status telemetry is unavailable.");
    }

    const sumeragiStatus =
      sumeragiResult.status === "fulfilled" ? sumeragiResult.value : null;
    if (sumeragiResult.status === "rejected") {
      warnings.push("Sumeragi consensus telemetry is unavailable.");
    }

    const nexusLifecycle =
      lifecycleResult.status === "fulfilled" ? lifecycleResult.value : null;
    if (lifecycleResult.status === "rejected") {
      warnings.push("Nexus lifecycle telemetry is unavailable.");
    }

    const supply =
      supplyResult.status === "fulfilled" ? supplyResult.value : null;
    if (supplyResult.status === "rejected") {
      warnings.push("XOR supply snapshot is unavailable.");
    }

    const econometrics =
      econometricsResult.status === "fulfilled"
        ? econometricsResult.value
        : null;
    if (econometricsResult.status === "rejected") {
      warnings.push("XOR flow econometrics are unavailable.");
    }

    return {
      collectedAtMs: Date.now(),
      xorAssetDefinitionId: normalizedAssetDefinitionId,
      explorer,
      supply,
      econometrics,
      runtime: extractRuntimeStatsFromStatusSnapshot(
        statusSnapshot,
        explorer,
        sumeragiStatus,
      ),
      governance: extractGovernanceStats(sumeragiStatus, nexusLifecycle),
      warnings,
      partial: warnings.length > 0,
    };
  },
  async getExplorerAccountQr(input) {
    const { toriiUrl, accountId, networkPrefix } = requireFirstReleaseIpcInput(
      input,
      "explorerAccountQr",
    );
    const normalizedAccountId = normalizeCanonicalAccountIdLiteral(
      accountId,
      "accountId",
      networkPrefix,
    );
    const payload = await fetchFirstReleaseExplorerAccountQr(
      toriiUrl,
      normalizedAccountId,
    );
    return assertExplorerAccountQrMatchesRequestedAccount(
      payload as unknown as Record<string, unknown>,
      normalizedAccountId,
    );
  },
  getVpnAvailability(input) {
    const exactInput = requireFirstReleaseIpcInput(input, "vpnAvailability");
    return ipcRenderer
      .invoke("vpn:getAvailability", exactInput)
      .then(parseFirstReleaseVpnAvailabilityIpcResponse);
  },
  getVpnProfile(input) {
    const exactInput = requireFirstReleaseIpcInput(input, "vpnAvailability");
    return ipcRenderer
      .invoke("vpn:getProfile", exactInput)
      .then(parseFirstReleaseVpnProfileIpcResponse);
  },
  async getVpnStatus(input) {
    if (input === undefined) {
      return parseFirstReleaseVpnStatusIpcResponse(
        await ipcRenderer.invoke("vpn:getStatus"),
      );
    }
    const exactInput = requireFirstReleaseIpcInput(
      input,
      "vpnAuthenticatedContext",
    );
    const signingMaterial = await resolveOptionalSigningMaterial({
      accountId: exactInput.accountId,
      networkPrefix: exactInput.networkPrefix,
    });
    return parseFirstReleaseVpnStatusIpcResponse(
      await ipcRenderer.invoke("vpn:getStatus", {
        ...exactInput,
        ...(signingMaterial ?? {}),
      }),
    );
  },
  async connectVpn(input) {
    const exactInput = requireFirstReleaseIpcInput(input, "vpnConnect");
    const writeConnection = await assertWriteConnectionMatchesEndpoint({
      toriiUrl: exactInput.toriiUrl,
      chainId: exactInput.chainId,
      networkPrefix: exactInput.networkPrefix,
      feature: "vpnSessions",
    });
    const accountId = normalizeCanonicalAccountIdLiteral(
      exactInput.accountId,
      "accountId",
      writeConnection.networkPrefix,
    );
    return await runVpnConnectAfterProfileCheck({
      loadProfile: async () =>
        parseFirstReleaseVpnProfileIpcResponse(
          await ipcRenderer.invoke("vpn:getProfile", {
            toriiUrl: exactInput.toriiUrl,
          }),
        ),
      resolveSigningMaterial: () =>
        resolveSigningMaterial({
          accountId,
          networkPrefix: writeConnection.networkPrefix,
          operationLabel: "VPN connect",
        }),
      invokeController: async (signingMaterial) =>
        parseFirstReleaseVpnStatusIpcResponse(
          await ipcRenderer.invoke("vpn:connect", {
            ...exactInput,
            accountId,
            ...signingMaterial,
          }),
        ),
    });
  },
  async disconnectVpn(input) {
    if (input === undefined) {
      return parseFirstReleaseVpnStatusIpcResponse(
        await ipcRenderer.invoke("vpn:disconnectLocal"),
      );
    }
    const exactInput = requireFirstReleaseIpcInput(
      input,
      "vpnAuthenticatedContext",
    );
    return await runVpnDisconnectWithLocalFallback({
      resolveAuthenticatedInput: async () => {
        const writeConnection = await assertWriteConnectionMatchesEndpoint({
          toriiUrl: exactInput.toriiUrl,
          chainId: exactInput.chainId,
          networkPrefix: exactInput.networkPrefix,
          feature: "vpnSessions",
        });
        const accountId = normalizeCanonicalAccountIdLiteral(
          exactInput.accountId,
          "accountId",
          writeConnection.networkPrefix,
        );
        const signingMaterial = await resolveSigningMaterial({
          accountId,
          networkPrefix: writeConnection.networkPrefix,
          operationLabel: "VPN disconnect",
        });
        return {
          ...exactInput,
          accountId,
          ...signingMaterial,
        };
      },
      invokeAuthenticatedController: async (authenticatedInput) =>
        parseFirstReleaseVpnStatusIpcResponse(
          await ipcRenderer.invoke("vpn:disconnect", authenticatedInput),
        ),
      invokeLocalController: async () =>
        parseFirstReleaseVpnStatusIpcResponse(
          await ipcRenderer.invoke("vpn:disconnectLocal"),
        ),
    });
  },
  async repairVpn() {
    return await runLocalVpnRepair({
      invokeController: async () =>
        parseFirstReleaseVpnStatusIpcResponse(
          await ipcRenderer.invoke("vpn:repair"),
        ),
    });
  },
  async listVpnReceipts(input) {
    if (input === undefined) {
      return parseFirstReleaseVpnReceiptListIpcResponse(
        await ipcRenderer.invoke("vpn:listReceipts"),
      );
    }
    const exactInput = requireFirstReleaseIpcInput(
      input,
      "vpnAuthenticatedContext",
    );
    const signingMaterial = await resolveOptionalSigningMaterial({
      accountId: exactInput.accountId,
      networkPrefix: exactInput.networkPrefix,
    });
    return parseFirstReleaseVpnReceiptListIpcResponse(
      await ipcRenderer.invoke("vpn:listReceipts", {
        ...exactInput,
        ...(signingMaterial ?? {}),
      }),
    );
  },
  async onboardAccount(input) {
    const { toriiUrl, chainId, networkPrefix, alias, accountId, identity } =
      requireFirstReleaseIpcInput(input, "onboardAccount");
    const writeConnection = await assertWriteConnectionMatchesEndpoint({
      toriiUrl,
      chainId,
      networkPrefix,
      feature: "accountOnboarding",
    });
    const baseUrl = normalizeBaseUrl(toriiUrl);
    const normalizedAccountId = normalizeCanonicalAccountIdLiteral(
      accountId,
      "accountId",
      writeConnection.networkPrefix,
    );
    const normalizedAlias = requireFirstReleaseInputText(alias, "alias", 256);
    const response = await nodeFetch(`${baseUrl}/v1/accounts/onboard`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        alias: normalizedAlias,
        account_id: normalizedAccountId,
        ...(identity === undefined
          ? {}
          : {
              identity: requireFirstReleaseJsonObject(
                identity,
                "Account onboarding identity",
              ),
            }),
      }),
    });
    if (!response.ok) {
      const detail = await readBoundedApiErrorDetail(response);
      throw new Error(
        formatOnboardingError({
          status: response.status,
          statusText: response.statusText,
          detail,
        }),
      );
    }
    const payload = await readBoundedJsonObjectResponse(
      response,
      "Account onboarding",
    );
    const responseAccountId = normalizeCanonicalAccountIdLiteral(
      trimString(payload.account_id),
      "Account onboarding account_id",
      writeConnection.networkPrefix,
    );
    if (responseAccountId !== normalizedAccountId) {
      throw new Error(
        "Account onboarding response does not match the requested account.",
      );
    }
    const txHashHex = trimString(payload.tx_hash_hex);
    if (!/^[0-9a-f]{64}$/u.test(txHashHex)) {
      throw new Error(
        "Account onboarding did not return a canonical transaction hash for finality verification.",
      );
    }
    const finalized = await waitForTransactionFinalizedInBlock(
      baseUrl,
      txHashHex,
    );
    return {
      account_id: responseAccountId,
      tx_hash_hex: txHashHex,
      status: "FINALIZED",
      finality: finalized.finality,
    };
  },
  async requestFaucetFunds(input, onStatus) {
    const { toriiUrl, chainId, accountId, networkPrefix, requestId } =
      requireFirstReleaseIpcInput(input, "faucetRequest");
    const reservation = reserveFirstReleaseFaucetRequest(
      faucetRequestControllers,
      requestId,
    );
    try {
      const faucetConnection = await assertFaucetChallengeConnectionAvailable({
        toriiUrl,
        chainId,
        networkPrefix,
      });
      const baseUrl = normalizeBaseUrl(toriiUrl);
      const normalizedAccountId = normalizeCanonicalAccountIdLiteral(
        accountId,
        "accountId",
        faucetConnection.networkPrefix,
      );
      const signal = reservation.controller.signal;
      throwIfAborted(signal);
      // Prepared-transaction flow; success requires a global pipeline status
      // of Applied resolved from committed state.
      const result = await requestFaucetFundsWithPuzzle({
        baseUrl,
        accountId: normalizedAccountId,
        chainId: faucetConnection.chainId,
        networkPrefix: faucetConnection.networkPrefix,
        networkId: faucetConnection.networkId,
        fetchImpl: nodeFetch,
        getGlobalStatus: (hashHex, statusSignal) =>
          fetchFirstReleaseTransactionStatus(baseUrl, hashHex, {
            scope: "global",
            signal: statusSignal,
          }),
        finalityTimeoutMs: FAUCET_CLAIM_STATUS_TIMEOUT_MS,
        signal,
        onStatus,
      });
      throwIfAborted(signal);
      return result;
    } finally {
      reservation.release();
    }
  },
  async cancelFaucetRequest(input) {
    const { requestId } = requireFirstReleaseIpcInput(input, "faucetCancel");
    const normalizedRequestId = requireFirstReleaseFaucetRequestId(requestId);
    const controller = faucetRequestControllers.get(normalizedRequestId);
    if (!controller) {
      return { canceled: false };
    }
    controller.abort(createFaucetAbortError());
    faucetRequestControllers.delete(normalizedRequestId);
    return { canceled: true };
  },
  async createKaigiMeeting(input) {
    const {
      toriiUrl,
      chainId,
      networkPrefix,
      hostAccountId,
      callId,
      title,
      scheduledStartMs,
      meetingCode,
      inviteSecretBase64Url,
      hostDisplayName,
      hostParticipantId,
      hostKaigiPublicKeyBase64Url,
      offerDescription,
      privacyMode,
    } = requireFirstReleaseIpcInput(input, "kaigiCreate");
    const resolvedPrivacyMode =
      requireFirstReleaseKaigiMeetingPrivacy(privacyMode);
    const writeConnection = await assertWriteConnectionMatchesEndpoint({
      toriiUrl,
      chainId,
      networkPrefix,
      feature: "kaigiMeetings",
    });
    const authority = normalizeCanonicalAccountIdLiteral(
      hostAccountId,
      "hostAccountId",
      writeConnection.networkPrefix,
    );
    const normalizedCallId = normalizeKaigiCallId(callId, "callId");
    const normalizedScheduledStartMs = normalizeTimestampMs(
      scheduledStartMs,
      "scheduledStartMs",
    );
    const createdAtMs = Date.now();
    const expiresAtMs = normalizedScheduledStartMs + 24 * 60 * 60 * 1000;
    if (!Number.isSafeInteger(expiresAtMs)) {
      throw new Error("Kaigi meeting expiry exceeds the safe timestamp range.");
    }
    const inviteSecret = requireKaigiInviteSecretBase64Url(
      inviteSecretBase64Url,
      "inviteSecretBase64Url",
    );
    const offerPayload = normalizeFirstReleaseKaigiCallOfferPayload(
      {
        schema: KAIGI_CALL_OFFER_SCHEMA,
        callId: normalizedCallId,
        hostAccountId: authority,
        hostDisplayName,
        hostParticipantId,
        hostKaigiPublicKeyBase64Url,
        createdAtMs,
        description: offerDescription,
      },
      {
        callId: normalizedCallId,
        privacyMode: resolvedPrivacyMode,
        hostAccountId: authority,
        createdAtMs,
        networkPrefix: writeConnection.networkPrefix,
      },
    );
    const encryptedOffer = encryptKaigiPayloadWithSecret(
      offerPayload,
      inviteSecret,
    );
    const signingMaterial = await resolveSigningMaterial({
      accountId: authority,
      networkPrefix: writeConnection.networkPrefix,
      operationLabel: "Kaigi meeting creation",
    });
    const resolvedPrivateKeyHex = signingMaterial.privateKeyHex;
    const callMetadata = {
      kaigi_call: normalizeFirstReleaseKaigiCallMetadata(
        {
          schema: KAIGI_CALL_METADATA_SCHEMA,
          meetingCode,
          expiresAtMs,
          live: true,
          privacyMode: resolvedPrivacyMode,
          encryptedOffer,
        },
        {
          callId: normalizedCallId,
          privacyMode: resolvedPrivacyMode,
          scheduledStartMs: normalizedScheduledStartMs,
          live: true,
        },
      ),
    };

    const tx = await quoteAndSignInstructionTransaction({
      toriiUrl,
      chainId: chainId.trim(),
      networkPrefix: writeConnection.networkPrefix,
      authority,
      instructions: [
        buildFirstReleaseCreateKaigiInstruction({
          callId: normalizedCallId,
          host: authority,
          networkPrefix: writeConnection.networkPrefix,
          title: title ?? null,
          scheduledStartMs: normalizedScheduledStartMs,
          metadata: callMetadata,
        }),
      ],
      metadata: withRequiredGasAssetMetadata(undefined, toriiUrl),
      privateKey: hexToBuffer(resolvedPrivateKeyHex, "privateKeyHex"),
      privateKeyAlgorithm: signingMaterial.signingAlgorithm,
    });
    const submission = await submitSignedTransactionAndWaitForFinalizedBlock(
      toriiUrl,
      tx.signedTransaction,
      { feeQuote: tx.feeQuote },
    );
    return transactionSubmissionResult(submission);
  },
  async getKaigiCall(input) {
    const { toriiUrl, networkPrefix, callId, inviteSecretBase64Url } =
      requireFirstReleaseIpcInput(input, "kaigiGet");
    return fetchKaigiMeetingView({
      toriiUrl,
      networkPrefix,
      callId,
      inviteSecretBase64Url,
    });
  },
  async joinKaigiMeeting(input) {
    const {
      toriiUrl,
      chainId,
      networkPrefix,
      participantAccountId,
      callId,
      inviteSecretBase64Url,
      participantId,
      participantName,
      answerDescription,
    } = requireFirstReleaseIpcInput(input, "kaigiJoin");
    const writeConnection = await assertWriteConnectionMatchesEndpoint({
      toriiUrl,
      chainId,
      networkPrefix,
      feature: "kaigiMeetings",
    });
    const authority = normalizeCanonicalAccountIdLiteral(
      participantAccountId,
      "participantAccountId",
      writeConnection.networkPrefix,
    );
    const normalizedCallId = normalizeKaigiCallId(callId, "callId");
    const inviteSecret = requireKaigiInviteSecretBase64Url(
      inviteSecretBase64Url,
      "inviteSecretBase64Url",
    );
    const liveMeeting = await fetchKaigiMeetingView({
      toriiUrl,
      networkPrefix: writeConnection.networkPrefix,
      callId: normalizedCallId,
      inviteSecretBase64Url: inviteSecret,
    });
    if (liveMeeting.callId !== normalizedCallId) {
      throw new Error(
        "The live Kaigi meeting does not match the requested call.",
      );
    }
    if (
      !liveMeeting.live ||
      liveMeeting.ended ||
      liveMeeting.expiresAtMs <= Date.now()
    ) {
      throw new Error("The live Kaigi meeting is no longer joinable.");
    }
    const liveHostAccountId = normalizeCanonicalAccountIdLiteral(
      liveMeeting.hostAccountId,
      "liveMeeting.hostAccountId",
      writeConnection.networkPrefix,
    );
    const signingMaterial = await resolveSigningMaterial({
      accountId: authority,
      networkPrefix: writeConnection.networkPrefix,
      operationLabel: "Kaigi meeting join",
    });
    const resolvedPrivateKeyHex = signingMaterial.privateKeyHex;
    const createdAtMs = Date.now();
    const answerPayload = normalizeFirstReleaseKaigiChainAnswerPayload(
      {
        schema: KAIGI_CHAIN_ANSWER_SCHEMA,
        callId: normalizedCallId,
        kind: "answer",
        participantAccountId: authority,
        participantId,
        participantName,
        walletIdentity: authority,
        roomId: normalizedCallId,
        createdAtMs,
        description: answerDescription,
      },
      {
        callId: normalizedCallId,
        createdAtMs,
        participantAccountId: authority,
        networkPrefix: writeConnection.networkPrefix,
      },
    );
    const signalMetadata = normalizeFirstReleaseKaigiChainSignalMetadata(
      {
        schema: KAIGI_CHAIN_SIGNAL_SCHEMA,
        callId: answerPayload.callId,
        signalKind: "answer",
        hostAccountId: liveHostAccountId,
        participantAccountId: authority,
        createdAtMs,
        encryptedSignal: encryptKaigiPayload(
          answerPayload,
          liveMeeting.hostKaigiPublicKeyBase64Url,
        ),
      },
      {
        callId: normalizedCallId,
        createdAtMs,
        networkPrefix: writeConnection.networkPrefix,
      },
    );
    const metadata: Record<string, unknown> = {
      kaigi_signal: signalMetadata,
    };
    const tx = await quoteAndSignInstructionTransaction({
      toriiUrl,
      chainId: chainId.trim(),
      networkPrefix: writeConnection.networkPrefix,
      authority,
      instructions: [
        buildFirstReleaseJoinKaigiInstruction({
          callId: answerPayload.callId,
          participant: authority,
          networkPrefix: writeConnection.networkPrefix,
        }),
      ],
      metadata: withRequiredGasAssetMetadata(metadata, toriiUrl),
      privateKey: hexToBuffer(resolvedPrivateKeyHex, "privateKeyHex"),
      privateKeyAlgorithm: signingMaterial.signingAlgorithm,
    });
    const submission = await submitSignedTransactionAndWaitForFinalizedBlock(
      toriiUrl,
      tx.signedTransaction,
      { feeQuote: tx.feeQuote },
    );
    return transactionSubmissionResult(submission);
  },
  async watchKaigiCallEvents(input, onEvent) {
    const { toriiUrl, callId } = requireFirstReleaseIpcInput(
      input,
      "kaigiWatch",
    );
    const normalizedCallId = normalizeKaigiCallId(callId, "callId");
    if (kaigiCallWatchers.size >= MAX_ACTIVE_KAIGI_CALL_WATCHERS) {
      throw new Error("Too many active Kaigi call watchers.");
    }
    const subscriptionId = randomBytes(16).toString("hex");
    const controller = new AbortController();
    kaigiCallWatchers.set(subscriptionId, controller);

    void (async () => {
      let terminalEventSeen = false;
      try {
        for await (const event of streamFirstReleaseSseJson({
          url: buildNexusEndpoint(
            toriiUrl,
            `/v1/kaigi/calls/${encodeURIComponent(normalizedCallId)}/events`,
          ),
          signal: controller.signal,
        })) {
          if (controller.signal.aborted) {
            break;
          }
          const normalizedEvent = toFirstReleaseKaigiUiEvent(
            normalizeFirstReleaseKaigiCallEvent(event, normalizedCallId),
          );
          terminalEventSeen = normalizedEvent.kind === "ended";
          await onEvent(normalizedEvent);
        }
      } catch (_error) {
        // The renderer receives stream_closed below and can reconnect.
      } finally {
        if (!controller.signal.aborted && !terminalEventSeen) {
          try {
            await onEvent({
              kind: "stream_closed",
              callId: normalizedCallId,
            });
          } catch {
            // Renderer teardown can race with the final stream notification.
          }
        }
        if (kaigiCallWatchers.get(subscriptionId) === controller) {
          kaigiCallWatchers.delete(subscriptionId);
        }
      }
    })();

    return subscriptionId;
  },
  stopWatchingKaigiCallEvents(input) {
    const { subscriptionId } = requireFirstReleaseIpcInput(
      input,
      "kaigiStopWatch",
    );
    if (
      typeof subscriptionId !== "string" ||
      !/^[0-9a-f]{32}$/u.test(subscriptionId)
    ) {
      throw new Error("Kaigi watcher ID must be canonical lowercase hex.");
    }
    const watcher = kaigiCallWatchers.get(subscriptionId);
    if (!watcher) {
      return;
    }
    watcher.abort();
    kaigiCallWatchers.delete(subscriptionId);
  },
  async pollKaigiMeetingSignals(input) {
    const {
      toriiUrl,
      chainId,
      networkPrefix,
      accountId,
      callId,
      hostKaigiKeys,
      afterTimestampMs,
      limit = 50,
    } = requireFirstReleaseIpcInput(input, "kaigiPoll");
    const pageLimit = requireFirstReleasePagination(
      { limit },
      {
        defaultLimit: 50,
        maximumLimit: 500,
        label: "Kaigi meeting signals",
      },
    ).limit;
    const normalizedCallId = normalizeKaigiCallId(callId, "callId");
    const authority = normalizeCanonicalAccountIdLiteral(
      accountId,
      "accountId",
      networkPrefix,
    );
    const networkId = await resolveTrustedEndpointNetworkId({
      toriiUrl,
      chainId,
      networkPrefix,
    });
    const signingMaterial = await resolveSigningMaterial({
      accountId: authority,
      networkPrefix,
      operationLabel: "Kaigi meeting signal polling",
    });
    const signalsResponse = await withPrivateKeyBufferAsync(
      signingMaterial.privateKeyHex,
      "privateKeyHex",
      (privateKey) =>
        fetchFirstReleaseKaigiSignals({
          toriiUrl,
          callId: normalizedCallId,
          auth: {
            accountId: authority,
            networkId,
            privateKey,
          },
          ...(afterTimestampMs === undefined
            ? {}
            : {
                afterTimestampMs: normalizeTimestampMs(
                  afterTimestampMs,
                  "afterTimestampMs",
                ),
              }),
          limit: pageLimit,
        }),
    );
    if (signalsResponse.items.length > pageLimit) {
      throw new Error("Kaigi call signals returned more items than requested.");
    }
    const signals = signalsResponse.items
      .map((record) => {
        const createdAtMs = normalizeTimestampMs(
          record.created_at_ms,
          "Kaigi signal.created_at_ms",
        );
        const chainSignal = normalizeFirstReleaseKaigiChainSignalMetadata(
          record.metadata,
          {
            callId: normalizedCallId,
            createdAtMs,
            networkPrefix,
          },
        );
        if (typeof record.authority !== "string") {
          throw new Error("Kaigi signal.authority must be an account ID.");
        }
        const carrierAuthority = normalizeCanonicalAccountIdLiteral(
          record.authority,
          "Kaigi signal.authority",
          networkPrefix,
        );
        if (carrierAuthority !== chainSignal.participantAccountId) {
          throw new Error("Kaigi signal authority is cross-wired.");
        }
        const decrypted = normalizeFirstReleaseKaigiChainAnswerPayload(
          decryptKaigiPayload<unknown>(
            chainSignal.encryptedSignal,
            hostKaigiKeys,
          ),
          {
            callId: normalizedCallId,
            createdAtMs,
            participantAccountId: chainSignal.participantAccountId,
            networkPrefix,
          },
        );
        return {
          entrypointHash: record.entrypoint_hash,
          authority: carrierAuthority,
          timestampMs: normalizeTimestampMs(
            record.timestamp_ms,
            "Kaigi signal.timestamp_ms",
          ),
          callId: decrypted.callId,
          participantAccountId: decrypted.participantAccountId,
          participantId: decrypted.participantId,
          participantName: decrypted.participantName,
          ...(decrypted.walletIdentity === undefined
            ? {}
            : { walletIdentity: decrypted.walletIdentity }),
          roomId: decrypted.roomId,
          createdAtMs: decrypted.createdAtMs,
          answerDescription: decrypted.description,
        } satisfies KaigiMeetingSignalRecord;
      })
      .sort((left, right) => left.createdAtMs - right.createdAtMs);
    return signals;
  },
  async endKaigiMeeting(input) {
    const {
      toriiUrl,
      chainId,
      networkPrefix,
      hostAccountId,
      callId,
      endedAtMs,
    } = requireFirstReleaseIpcInput(input, "kaigiEnd");
    const writeConnection = await assertWriteConnectionMatchesEndpoint({
      toriiUrl,
      chainId,
      networkPrefix,
      feature: "kaigiMeetings",
    });
    const authority = normalizeCanonicalAccountIdLiteral(
      hostAccountId,
      "hostAccountId",
      writeConnection.networkPrefix,
    );
    const normalizedCallId = normalizeKaigiCallId(callId, "callId");
    const resolvedEndedAtMs =
      endedAtMs === undefined
        ? Date.now()
        : normalizeTimestampMs(endedAtMs, "endedAtMs");
    const callPayload = await fetchFirstReleaseKaigiCall(
      toriiUrl,
      normalizedCallId,
    );
    if (!callPayload) {
      throw new Error("Kaigi meeting was not found.");
    }
    requireFirstReleaseKaigiMeetingPrivacy(
      callPayload.privacy_mode,
      "kaigi call.privacy_mode",
    );
    const signingMaterial = await resolveSigningMaterial({
      accountId: authority,
      networkPrefix: writeConnection.networkPrefix,
      operationLabel: "Kaigi meeting end",
    });
    const resolvedPrivateKeyHex = signingMaterial.privateKeyHex;
    const tx = await quoteAndSignInstructionTransaction({
      toriiUrl,
      chainId: chainId.trim(),
      networkPrefix: writeConnection.networkPrefix,
      authority,
      instructions: [
        buildFirstReleaseEndKaigiInstruction({
          callId: normalizedCallId,
          endedAtMs: resolvedEndedAtMs,
        }),
      ],
      metadata: withRequiredGasAssetMetadata(undefined, toriiUrl),
      privateKey: hexToBuffer(resolvedPrivateKeyHex, "privateKeyHex"),
      privateKeyAlgorithm: signingMaterial.signingAlgorithm,
    });
    const submission = await submitSignedTransactionAndWaitForFinalizedBlock(
      toriiUrl,
      tx.signedTransaction,
      { feeQuote: tx.feeQuote },
    );
    return transactionSubmissionResult(submission);
  },
  getSumeragiStatus(config) {
    const { toriiUrl } = requireFirstReleaseIpcInput(config, "toriiConfig");
    return fetchJson(
      buildNexusEndpoint(toriiUrl, "/v1/sumeragi/status"),
      "Sumeragi status",
    );
  },
  async getNexusLifecycle(config) {
    const { toriiUrl } = requireFirstReleaseIpcInput(config, "toriiConfig");
    return fetchNexusLifecycle(toriiUrl);
  },
  async getNexusPublicLaneValidators(input) {
    const { toriiUrl, laneId } = requireFirstReleaseIpcInput(
      input,
      "publicLaneValidators",
    );
    const endpoint = buildNexusEndpoint(
      toriiUrl,
      `/v1/nexus/public-lanes/${normalizeLaneId(laneId)}/validators`,
    );
    const payload = await fetchJson(endpoint, "Public lane validators");
    return normalizePublicLaneValidatorsPayload(payload);
  },
  async getNexusPublicLaneStake(input) {
    const { toriiUrl, networkPrefix, laneId, validator } =
      requireFirstReleaseIpcInput(input, "publicLaneStake");
    const endpoint = buildNexusEndpoint(
      toriiUrl,
      `/v1/nexus/public-lanes/${normalizeLaneId(laneId)}/stake`,
      {
        validator: validator
          ? normalizeCanonicalAccountIdLiteral(
              validator,
              "validator",
              networkPrefix,
            )
          : undefined,
      },
    );
    const payload = await fetchJson(endpoint, "Public lane stake");
    return normalizePublicLaneStakePayload(payload);
  },
  async getNexusPublicLaneRewards(input) {
    const { toriiUrl, networkPrefix, laneId, account, assetId, uptoEpoch } =
      requireFirstReleaseIpcInput(input, "publicLaneRewards");
    const endpoint = buildNexusEndpoint(
      toriiUrl,
      `/v1/nexus/public-lanes/${normalizeLaneId(laneId)}/rewards/pending`,
      {
        account: normalizeCanonicalAccountIdLiteral(
          account,
          "account",
          networkPrefix,
        ),
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
    const { toriiUrl } = requireFirstReleaseIpcInput(config, "toriiConfig");
    try {
      const payload = await fetchFirstReleaseConfiguration(toriiUrl);
      const configuration = ensureObjectResponse(payload, "Configuration");
      return {
        unbondingDelayMs: readNexusUnbondingDelayMs(configuration),
      };
    } catch {
      return { unbondingDelayMs: null };
    }
  },
  listSubscriptionPlans(input) {
    return listSubscriptionPlansFromTorii(
      requireFirstReleaseIpcInput(input, "subscriptionListPlans"),
    );
  },
  listSubscriptions(input) {
    return listSubscriptionsFromTorii(
      requireFirstReleaseIpcInput(input, "subscriptionList"),
    );
  },
  getSubscription(input) {
    return getSubscriptionFromTorii(
      requireFirstReleaseIpcInput(input, "subscriptionGet"),
    );
  },
  createSubscription(input) {
    return createSubscriptionOnTorii(
      requireFirstReleaseIpcInput(input, "subscriptionCreate"),
    );
  },
  pauseSubscription(input) {
    return postSubscriptionActionToTorii(
      requireFirstReleaseIpcInput(input, "subscriptionPause"),
      "pause",
      "Pause subscription",
    );
  },
  resumeSubscription(input) {
    return postSubscriptionActionToTorii(
      requireFirstReleaseIpcInput(input, "subscriptionResume"),
      "resume",
      "Resume subscription",
    );
  },
  cancelSubscription(input) {
    return postSubscriptionActionToTorii(
      requireFirstReleaseIpcInput(input, "subscriptionCancel"),
      "cancel",
      "Cancel subscription",
    );
  },
  keepSubscription(input) {
    return postSubscriptionActionToTorii(
      requireFirstReleaseIpcInput(input, "subscriptionKeep"),
      "keep",
      "Keep subscription",
    );
  },
  chargeSubscriptionNow(input) {
    return postSubscriptionActionToTorii(
      requireFirstReleaseIpcInput(input, "subscriptionChargeNow"),
      "charge-now",
      "Charge subscription",
    );
  },
  reconcileSubscriptionMutation(input) {
    return reconcileSubscriptionMutationOnTorii(
      requireFirstReleaseIpcInput(input, "subscriptionReconcile"),
    );
  },
  getSoraCloudStatus(input) {
    return getSoraCloudStatusFromTorii(
      requireFirstReleaseIpcInput(input, "soraCloudStatus"),
    );
  },
  getSoraCloudHfSharedLeaseStatus(input) {
    return getSoraCloudHfSharedLeaseStatusFromTorii(
      requireFirstReleaseIpcInput(input, "soraCloudHfSharedLeaseStatus"),
    );
  },
  getParameters(input) {
    const { toriiUrl } = requireFirstReleaseIpcInput(input, "toriiConfig");
    return getParametersFromTorii({ toriiUrl });
  },
  bondPublicLaneStake(input) {
    const {
      toriiUrl,
      chainId,
      networkPrefix,
      stakeAccountId,
      validator,
      amount,
    } = requireFirstReleaseIpcInput(input, "stakingBond");
    const normalizedStakeAccount = normalizeCanonicalAccountIdLiteral(
      stakeAccountId,
      "stakeAccountId",
      networkPrefix,
    );
    return submitInstructionTransaction({
      toriiUrl,
      chainId,
      networkPrefix,
      authorityAccountId: normalizedStakeAccount,
      instruction: {
        BondPublicLaneStake: {
          stake_account: normalizedStakeAccount,
          validator: normalizeCanonicalAccountIdLiteral(
            validator,
            "validator",
            networkPrefix,
          ),
          amount: normalizeAmount(amount, "amount"),
        },
      },
    });
  },
  registerPublicLaneValidator(input) {
    const {
      toriiUrl,
      chainId,
      networkPrefix,
      laneId,
      validatorAccountId,
      stakeAccountId,
      peerId,
      selfStake,
      metadata,
    } = requireFirstReleaseIpcInput(input, "stakingRegisterValidator");
    const normalizedValidator = normalizeCanonicalAccountIdLiteral(
      validatorAccountId,
      "validatorAccountId",
      networkPrefix,
    );
    const normalizedStakeAccount = normalizeCanonicalAccountIdLiteral(
      stakeAccountId || validatorAccountId,
      "stakeAccountId",
      networkPrefix,
    );
    return submitInstructionTransaction({
      toriiUrl,
      chainId,
      networkPrefix,
      authorityAccountId: normalizedValidator,
      instruction: {
        RegisterPublicLaneValidator: {
          lane_id: normalizeLaneId(laneId),
          validator: normalizedValidator,
          stake_account: normalizedStakeAccount,
          peer_id: normalizeNonEmptyString(peerId, "peerId"),
          initial_stake: normalizeAmount(selfStake, "selfStake"),
          metadata: requireFirstReleaseJsonObject(
            metadata ?? {},
            "Register validator metadata",
          ),
        },
      },
    });
  },
  schedulePublicLaneUnbond(input) {
    const {
      toriiUrl,
      chainId,
      networkPrefix,
      stakeAccountId,
      validator,
      amount,
      requestId,
      releaseAtMs,
    } = requireFirstReleaseIpcInput(input, "stakingScheduleUnbond");
    const normalizedStakeAccount = normalizeCanonicalAccountIdLiteral(
      stakeAccountId,
      "stakeAccountId",
      networkPrefix,
    );
    return submitInstructionTransaction({
      toriiUrl,
      chainId,
      networkPrefix,
      authorityAccountId: normalizedStakeAccount,
      instruction: {
        SchedulePublicLaneUnbond: {
          stake_account: normalizedStakeAccount,
          validator: normalizeCanonicalAccountIdLiteral(
            validator,
            "validator",
            networkPrefix,
          ),
          amount: normalizeAmount(amount, "amount"),
          request_id: normalizeRequestId(requestId),
          release_at_ms: normalizeReleaseAtMs(releaseAtMs),
        },
      },
    });
  },
  finalizePublicLaneUnbond(input) {
    const {
      toriiUrl,
      chainId,
      networkPrefix,
      stakeAccountId,
      validator,
      requestId,
    } = requireFirstReleaseIpcInput(input, "stakingFinalizeUnbond");
    const normalizedStakeAccount = normalizeCanonicalAccountIdLiteral(
      stakeAccountId,
      "stakeAccountId",
      networkPrefix,
    );
    return submitInstructionTransaction({
      toriiUrl,
      chainId,
      networkPrefix,
      authorityAccountId: normalizedStakeAccount,
      instruction: {
        FinalizePublicLaneUnbond: {
          stake_account: normalizedStakeAccount,
          validator: normalizeCanonicalAccountIdLiteral(
            validator,
            "validator",
            networkPrefix,
          ),
          request_id: normalizeRequestId(requestId),
        },
      },
    });
  },
  claimPublicLaneRewards(input) {
    const { toriiUrl, chainId, networkPrefix, stakeAccountId, validator } =
      requireFirstReleaseIpcInput(input, "stakingClaimRewards");
    const normalizedStakeAccount = normalizeCanonicalAccountIdLiteral(
      stakeAccountId,
      "stakeAccountId",
      networkPrefix,
    );
    return submitInstructionTransaction({
      toriiUrl,
      chainId,
      networkPrefix,
      authorityAccountId: normalizedStakeAccount,
      instruction: {
        ClaimPublicLaneRewards: {
          stake_account: normalizedStakeAccount,
          validator: normalizeCanonicalAccountIdLiteral(
            validator,
            "validator",
            networkPrefix,
          ),
        },
      },
    });
  },
};

const SETUP_SECRET_INPUT_METHODS = new Set<keyof IrohaBridge>([
  "storeAccountSecret",
  "derivePublicKey",
]);

contextBridge.exposeInMainWorld(
  "iroha",
  wrapRendererSigningBoundary(api, SETUP_SECRET_INPUT_METHODS),
);

// Main signals that an `iroha://connect` pairing link is waiting; the
// renderer pulls it with takePendingIrohaConnectDeepLink(). Only a payload-
// free DOM event crosses into the page.
ipcRenderer.on(IROHA_CONNECT_DEEP_LINK_AVAILABLE_CHANNEL, () => {
  window.dispatchEvent(new Event(IROHA_CONNECT_DEEP_LINK_DOM_EVENT));
});

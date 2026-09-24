import {
  mnemonicToPrivateKeyHex,
  normalizeMnemonicPhrase,
  type MnemonicWordCount,
} from "./mnemonic";
import { parseJsonWithoutDuplicateObjectKeys } from "./json";
import { normalizeStoredSigningAlgorithm } from "./signingAlgorithms";

export type WalletBackupTarget = "manual" | "icloud" | "google";
export const WALLET_BACKUP_SCHEMA = "iroha-demo-wallet-backup/v1";
export const CONFIDENTIAL_WALLET_BACKUP_SCHEMA_V2 =
  "iroha-demo-confidential-wallet-backup/v2";
export const CONFIDENTIAL_WALLET_BACKUP_KDF_INFO =
  "iroha-demo:confidential-wallet-backup:v2";
export const MAX_WALLET_BACKUP_JSON_BYTES = 6 * 1024 * 1024;
export const CONFIDENTIAL_WALLET_BACKUP_CIPHERTEXT_MAX_CHARACTERS = 5_600_000;

export type WalletBackupPayload = {
  schema: typeof WALLET_BACKUP_SCHEMA;
  mnemonic: string;
  wordCount: MnemonicWordCount;
  signingAlgorithm: string;
  createdAt: string;
  target: WalletBackupTarget;
  displayName?: string;
  domain?: string;
  confidentialWallet: ConfidentialWalletBackupMetadataV2;
};

export type ConfidentialWalletBackupStateBoxV2 = {
  kdf: "HKDF-SHA256";
  cipher: "AES-256-GCM";
  saltBase64Url: string;
  ivBase64Url: string;
  ciphertextBase64Url: string;
  authTagBase64Url: string;
};

export type ConfidentialWalletBackupMetadataV2 = {
  schema: typeof CONFIDENTIAL_WALLET_BACKUP_SCHEMA_V2;
  chainId: string;
  accountId: string;
  scanWatermarkBlock: number | null;
  stateBox: ConfidentialWalletBackupStateBoxV2;
};

export type ConfidentialWalletBackupMetadata =
  ConfidentialWalletBackupMetadataV2;

const trimString = (value: unknown): string => String(value ?? "").trim();

const normalizeWordCount = (value: unknown): MnemonicWordCount | null => {
  if (value === 12 || value === 24) {
    return value;
  }
  return null;
};

const normalizeNonNegativeInteger = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return value;
  }
  return null;
};

const BASE64URL_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

const isCanonicalBase64Url = (value: string): boolean => {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) {
    return false;
  }
  const lastValue = BASE64URL_ALPHABET.indexOf(value[value.length - 1] ?? "");
  if (lastValue < 0) {
    return false;
  }
  if (value.length % 4 === 2) {
    return lastValue % 16 === 0;
  }
  if (value.length % 4 === 3) {
    return lastValue % 4 === 0;
  }
  return true;
};

const hasExactKeys = (
  record: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean => {
  const keys = Object.keys(record);
  const allowed = new Set([...required, ...optional]);
  return (
    required.every((key) =>
      Object.prototype.hasOwnProperty.call(record, key),
    ) && keys.every((key) => allowed.has(key))
  );
};

const readCanonicalText = (
  value: unknown,
  label: string,
  maxLength: number,
): string => {
  if (typeof value !== "string") {
    throw new Error(`${label} must be text.`);
  }
  const normalized = value.trim();
  if (
    !normalized ||
    normalized !== value ||
    normalized.length > maxLength ||
    normalized.normalize("NFC") !== normalized ||
    Array.from(normalized).some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 0x1f || codePoint === 0x7f;
    })
  ) {
    throw new Error(`${label} is invalid.`);
  }
  return normalized;
};

const requireCanonicalIsoTimestamp = (
  value: unknown,
  label: string,
): string => {
  const timestamp = readCanonicalText(value, label, 64);
  let canonical: string;
  try {
    canonical = new Date(timestamp).toISOString();
  } catch {
    throw new Error(`${label} is invalid.`);
  }
  if (canonical !== timestamp) {
    throw new Error(`${label} is invalid.`);
  }
  return timestamp;
};

const parseConfidentialWalletBackupMetadata = (
  value: unknown,
): ConfidentialWalletBackupMetadataV2 => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Confidential wallet backup metadata is invalid.");
  }
  const record = value as Record<string, unknown>;
  if (
    !hasExactKeys(record, [
      "schema",
      "chainId",
      "accountId",
      "scanWatermarkBlock",
      "stateBox",
    ]) ||
    record.schema !== CONFIDENTIAL_WALLET_BACKUP_SCHEMA_V2
  ) {
    throw new Error("Confidential wallet backup metadata is invalid.");
  }
  const chainId = readCanonicalText(record.chainId, "Backup chain ID", 256);
  const accountId = readCanonicalText(
    record.accountId,
    "Backup account ID",
    512,
  );
  const stateBox =
    record.stateBox &&
    typeof record.stateBox === "object" &&
    !Array.isArray(record.stateBox)
      ? (record.stateBox as Record<string, unknown>)
      : null;
  if (!stateBox) {
    throw new Error("Confidential wallet backup state box is invalid.");
  }
  if (
    !hasExactKeys(stateBox, [
      "kdf",
      "cipher",
      "saltBase64Url",
      "ivBase64Url",
      "ciphertextBase64Url",
      "authTagBase64Url",
    ])
  ) {
    throw new Error("Confidential wallet backup state box is invalid.");
  }
  const saltBase64Url = readCanonicalText(
    stateBox.saltBase64Url,
    "Backup salt",
    43,
  );
  const ivBase64Url = readCanonicalText(stateBox.ivBase64Url, "Backup IV", 16);
  const ciphertextBase64Url = readCanonicalText(
    stateBox.ciphertextBase64Url,
    "Backup ciphertext",
    CONFIDENTIAL_WALLET_BACKUP_CIPHERTEXT_MAX_CHARACTERS,
  );
  const authTagBase64Url = readCanonicalText(
    stateBox.authTagBase64Url,
    "Backup authentication tag",
    22,
  );
  if (
    stateBox.kdf !== "HKDF-SHA256" ||
    stateBox.cipher !== "AES-256-GCM" ||
    saltBase64Url.length !== 43 ||
    !isCanonicalBase64Url(saltBase64Url) ||
    ivBase64Url.length !== 16 ||
    !isCanonicalBase64Url(ivBase64Url) ||
    ciphertextBase64Url.length === 0 ||
    ciphertextBase64Url.length >
      CONFIDENTIAL_WALLET_BACKUP_CIPHERTEXT_MAX_CHARACTERS ||
    !isCanonicalBase64Url(ciphertextBase64Url) ||
    authTagBase64Url.length !== 22 ||
    !isCanonicalBase64Url(authTagBase64Url)
  ) {
    throw new Error("Confidential wallet backup state box is invalid.");
  }
  const scanWatermarkBlock =
    record.scanWatermarkBlock === null
      ? null
      : normalizeNonNegativeInteger(record.scanWatermarkBlock);
  if (record.scanWatermarkBlock !== null && scanWatermarkBlock === null) {
    throw new Error("Confidential wallet backup watermark is invalid.");
  }
  return {
    schema: CONFIDENTIAL_WALLET_BACKUP_SCHEMA_V2,
    chainId,
    accountId,
    scanWatermarkBlock,
    stateBox: {
      kdf: "HKDF-SHA256",
      cipher: "AES-256-GCM",
      saltBase64Url,
      ivBase64Url,
      ciphertextBase64Url,
      authTagBase64Url,
    },
  };
};

export const buildWalletBackupPayload = (input: {
  mnemonic: string;
  wordCount: MnemonicWordCount;
  signingAlgorithm?: string;
  target: WalletBackupTarget;
  createdAt?: string;
  displayName?: string;
  domain?: string;
  confidentialWallet: ConfidentialWalletBackupMetadataV2;
}): WalletBackupPayload => {
  const mnemonic = normalizeMnemonicPhrase(input.mnemonic);
  mnemonicToPrivateKeyHex(mnemonic);
  const wordCount = normalizeWordCount(input.wordCount);
  if (!wordCount || mnemonic.split(" ").length !== wordCount) {
    throw new Error("Backup word count does not match its recovery phrase.");
  }
  if (!(["manual", "icloud", "google"] as const).includes(input.target)) {
    throw new Error("Backup target is invalid.");
  }
  const createdAt = requireCanonicalIsoTimestamp(
    trimString(input.createdAt) || new Date().toISOString(),
    "Backup creation timestamp",
  );
  const confidentialWallet = parseConfidentialWalletBackupMetadata(
    input.confidentialWallet,
  );
  const payload: WalletBackupPayload = {
    schema: WALLET_BACKUP_SCHEMA,
    mnemonic,
    wordCount,
    signingAlgorithm: normalizeStoredSigningAlgorithm(input.signingAlgorithm),
    createdAt,
    target: input.target,
    confidentialWallet,
  };

  const displayName = trimString(input.displayName);
  if (displayName) {
    if (displayName.length > 128) {
      throw new Error("Backup display name is invalid.");
    }
    payload.displayName = displayName;
  }

  const domain = trimString(input.domain);
  if (domain) {
    if (domain.length > 255) {
      throw new Error("Backup domain is invalid.");
    }
    payload.domain = domain;
  }

  return payload;
};

export const parseWalletBackupPayload = (raw: string) => {
  if (
    typeof raw !== "string" ||
    new TextEncoder().encode(raw).byteLength > MAX_WALLET_BACKUP_JSON_BYTES
  ) {
    throw new Error("Invalid backup file.");
  }
  let parsed: unknown;
  try {
    parsed = parseJsonWithoutDuplicateObjectKeys(raw, "Wallet backup");
  } catch (_error) {
    throw new Error("Invalid backup file.");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Invalid backup file.");
  }

  const payload = parsed as Record<string, unknown>;
  if (
    !hasExactKeys(
      payload,
      [
        "schema",
        "mnemonic",
        "wordCount",
        "signingAlgorithm",
        "createdAt",
        "target",
        "confidentialWallet",
      ],
      ["displayName", "domain"],
    ) ||
    payload.schema !== WALLET_BACKUP_SCHEMA
  ) {
    throw new Error("Invalid backup file schema.");
  }
  if (typeof payload.mnemonic !== "string") {
    throw new Error("Backup file is missing a recovery phrase.");
  }
  const mnemonic = normalizeMnemonicPhrase(payload.mnemonic);
  if (!mnemonic || mnemonic !== payload.mnemonic) {
    throw new Error("Backup recovery phrase is not canonical.");
  }
  mnemonicToPrivateKeyHex(mnemonic);

  const derivedWordCount = normalizeWordCount(
    mnemonic.split(" ").filter(Boolean).length,
  );

  const wordCount = normalizeWordCount(payload.wordCount);
  if (!wordCount || wordCount !== derivedWordCount) {
    throw new Error("Backup word count does not match its recovery phrase.");
  }
  let signingAlgorithm: string;
  try {
    signingAlgorithm = normalizeStoredSigningAlgorithm(
      payload.signingAlgorithm,
    );
  } catch {
    throw new Error("Backup signing algorithm is invalid.");
  }
  const createdAt = requireCanonicalIsoTimestamp(
    payload.createdAt,
    "Backup creation timestamp",
  );
  if (!new Set<unknown>(["manual", "icloud", "google"]).has(payload.target)) {
    throw new Error("Backup target is invalid.");
  }
  const displayName =
    payload.displayName === undefined
      ? ""
      : readCanonicalText(payload.displayName, "Backup display name", 128);
  const domain =
    payload.domain === undefined
      ? ""
      : readCanonicalText(payload.domain, "Backup domain", 255);
  const confidentialWallet = parseConfidentialWalletBackupMetadata(
    payload.confidentialWallet,
  );
  const target = payload.target as WalletBackupTarget;
  return {
    schema: WALLET_BACKUP_SCHEMA,
    mnemonic,
    wordCount,
    signingAlgorithm,
    createdAt,
    target,
    ...(displayName ? { displayName } : {}),
    ...(domain ? { domain } : {}),
    confidentialWallet,
  } satisfies WalletBackupPayload;
};

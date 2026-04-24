import { normalizeMnemonicPhrase, type MnemonicWordCount } from "./mnemonic";

export type WalletBackupTarget = "manual" | "icloud" | "google";
export const CONFIDENTIAL_WALLET_BACKUP_SCHEMA_V1 =
  "iroha-demo-confidential-wallet-backup/v1";
export const CONFIDENTIAL_WALLET_BACKUP_SCHEMA_V2 =
  "iroha-demo-confidential-wallet-backup/v2";
export const CONFIDENTIAL_WALLET_BACKUP_KDF_INFO =
  "iroha-demo:confidential-wallet-backup:v2";

export type WalletBackupPayload = {
  mnemonic: string;
  wordCount: MnemonicWordCount;
  createdAt: string;
  target: WalletBackupTarget;
  displayName?: string;
  domain?: string;
  confidentialWallet?: ConfidentialWalletBackupMetadata;
};

export type ConfidentialWalletBackupMetadataV1 = {
  schema: typeof CONFIDENTIAL_WALLET_BACKUP_SCHEMA_V1;
  chainId: string;
  accountId: string;
  addressCursor: number;
  scanWatermarkBlock: number | null;
  encryptedNotes: unknown[];
  spentNullifiers: string[];
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
  | ConfidentialWalletBackupMetadataV1
  | ConfidentialWalletBackupMetadataV2;

type ConfidentialWalletBackupMetadataDraft =
  | ConfidentialWalletBackupMetadata
  | {
      chainId?: string;
      accountId?: string;
      addressCursor?: number;
      scanWatermarkBlock?: number | null;
      encryptedNotes?: unknown[];
      spentNullifiers?: string[];
    };

const trimString = (value: unknown): string => String(value ?? "").trim();

const normalizeWordCount = (value: unknown): MnemonicWordCount | null => {
  const count = Number(value);
  if (count === 12 || count === 24) {
    return count;
  }
  return null;
};

const normalizeNonNegativeInteger = (value: unknown): number | null => {
  const normalized = Number(value);
  if (Number.isInteger(normalized) && normalized >= 0) {
    return normalized;
  }
  return null;
};

const isBase64Url = (value: string): boolean => /^[A-Za-z0-9_-]+$/.test(value);

const parseConfidentialWalletBackupMetadata = (
  value: unknown,
): ConfidentialWalletBackupMetadata | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const chainId = trimString(record.chainId);
  const accountId = trimString(record.accountId);
  if (!chainId || !accountId) {
    return undefined;
  }
  if (record.schema === CONFIDENTIAL_WALLET_BACKUP_SCHEMA_V1) {
    return {
      schema: CONFIDENTIAL_WALLET_BACKUP_SCHEMA_V1,
      chainId,
      accountId,
      addressCursor: normalizeNonNegativeInteger(record.addressCursor) ?? 0,
      scanWatermarkBlock:
        record.scanWatermarkBlock === null
          ? null
          : normalizeNonNegativeInteger(record.scanWatermarkBlock),
      encryptedNotes: Array.isArray(record.encryptedNotes)
        ? [...record.encryptedNotes]
        : [],
      spentNullifiers: Array.isArray(record.spentNullifiers)
        ? record.spentNullifiers
            .map((entry) => trimString(entry))
            .filter((entry) => /^[0-9a-f]{64}$/i.test(entry))
        : [],
    };
  }
  if (record.schema !== CONFIDENTIAL_WALLET_BACKUP_SCHEMA_V2) {
    return undefined;
  }
  const stateBox =
    record.stateBox &&
    typeof record.stateBox === "object" &&
    !Array.isArray(record.stateBox)
      ? (record.stateBox as Record<string, unknown>)
      : null;
  if (!stateBox) {
    return undefined;
  }
  const saltBase64Url = trimString(stateBox.saltBase64Url);
  const ivBase64Url = trimString(stateBox.ivBase64Url);
  const ciphertextBase64Url = trimString(stateBox.ciphertextBase64Url);
  const authTagBase64Url = trimString(stateBox.authTagBase64Url);
  if (
    trimString(stateBox.kdf) !== "HKDF-SHA256" ||
    trimString(stateBox.cipher) !== "AES-256-GCM" ||
    !isBase64Url(saltBase64Url) ||
    !isBase64Url(ivBase64Url) ||
    !isBase64Url(ciphertextBase64Url) ||
    !isBase64Url(authTagBase64Url)
  ) {
    return undefined;
  }
  return {
    schema: CONFIDENTIAL_WALLET_BACKUP_SCHEMA_V2,
    chainId,
    accountId,
    scanWatermarkBlock:
      record.scanWatermarkBlock === null
        ? null
        : normalizeNonNegativeInteger(record.scanWatermarkBlock),
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
  target: WalletBackupTarget;
  createdAt?: string;
  displayName?: string;
  domain?: string;
  confidentialWallet?: ConfidentialWalletBackupMetadataDraft;
}): WalletBackupPayload => {
  const payload: WalletBackupPayload = {
    mnemonic: normalizeMnemonicPhrase(input.mnemonic),
    wordCount: input.wordCount,
    createdAt: trimString(input.createdAt) || new Date().toISOString(),
    target: input.target,
  };

  const displayName = trimString(input.displayName);
  if (displayName) {
    payload.displayName = displayName;
  }

  const domain = trimString(input.domain);
  if (domain) {
    payload.domain = domain;
  }

  const parsedConfidentialWallet = parseConfidentialWalletBackupMetadata(
    input.confidentialWallet,
  );
  if (parsedConfidentialWallet) {
    payload.confidentialWallet = parsedConfidentialWallet;
    return payload;
  }

  const confidentialWalletDraft = (input.confidentialWallet ?? {}) as Record<
    string,
    unknown
  >;
  const confidentialChainId = trimString(confidentialWalletDraft.chainId);
  const confidentialAccountId = trimString(confidentialWalletDraft.accountId);
  if (confidentialChainId && confidentialAccountId) {
    payload.confidentialWallet = {
      schema: CONFIDENTIAL_WALLET_BACKUP_SCHEMA_V1,
      chainId: confidentialChainId,
      accountId: confidentialAccountId,
      addressCursor:
        normalizeNonNegativeInteger(confidentialWalletDraft.addressCursor) ?? 0,
      scanWatermarkBlock:
        confidentialWalletDraft.scanWatermarkBlock === null
          ? null
          : (normalizeNonNegativeInteger(
              confidentialWalletDraft.scanWatermarkBlock,
            ) ?? null),
      encryptedNotes: Array.isArray(confidentialWalletDraft.encryptedNotes)
        ? [...confidentialWalletDraft.encryptedNotes]
        : [],
      spentNullifiers: Array.isArray(confidentialWalletDraft.spentNullifiers)
        ? confidentialWalletDraft.spentNullifiers
            .map((entry: unknown) => trimString(entry))
            .filter((entry: string) => /^[0-9a-f]{64}$/i.test(entry))
        : [],
    };
  }

  return payload;
};

export const parseWalletBackupPayload = (raw: string) => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (_error) {
    throw new Error("Invalid backup file.");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Invalid backup file.");
  }

  const payload = parsed as Record<string, unknown>;
  const mnemonic = normalizeMnemonicPhrase(trimString(payload.mnemonic));
  if (!mnemonic) {
    throw new Error("Backup file is missing a recovery phrase.");
  }

  const derivedWordCount = normalizeWordCount(
    mnemonic.split(" ").filter(Boolean).length,
  );

  const confidentialWallet = parseConfidentialWalletBackupMetadata(
    payload.confidentialWallet,
  );
  return {
    mnemonic,
    wordCount: normalizeWordCount(payload.wordCount) ?? derivedWordCount,
    displayName: trimString(payload.displayName),
    domain: trimString(payload.domain),
    ...(confidentialWallet ? { confidentialWallet } : {}),
  };
};

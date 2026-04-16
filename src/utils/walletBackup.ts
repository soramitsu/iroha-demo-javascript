import {
  normalizeMnemonicPhrase,
  type MnemonicWordCount,
} from "@/utils/mnemonic";

export type WalletBackupTarget = "manual" | "icloud" | "google";

export type WalletBackupPayload = {
  mnemonic: string;
  wordCount: MnemonicWordCount;
  createdAt: string;
  target: WalletBackupTarget;
  displayName?: string;
  domain?: string;
  confidentialWallet?: ConfidentialWalletBackupMetadata;
};

export type ConfidentialWalletBackupMetadata = {
  schema: "iroha-demo-confidential-wallet-backup/v1";
  chainId: string;
  accountId: string;
  addressCursor: number;
  scanWatermarkBlock: number | null;
  encryptedNotes: unknown[];
  spentNullifiers: string[];
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

const parseConfidentialWalletBackupMetadata = (
  value: unknown,
): ConfidentialWalletBackupMetadata | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  if (record.schema !== "iroha-demo-confidential-wallet-backup/v1") {
    return undefined;
  }
  const chainId = trimString(record.chainId);
  const accountId = trimString(record.accountId);
  if (!chainId || !accountId) {
    return undefined;
  }
  return {
    schema: "iroha-demo-confidential-wallet-backup/v1",
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
};

export const buildWalletBackupPayload = (input: {
  mnemonic: string;
  wordCount: MnemonicWordCount;
  target: WalletBackupTarget;
  createdAt?: string;
  displayName?: string;
  domain?: string;
  confidentialWallet?: {
    chainId?: string;
    accountId?: string;
    addressCursor?: number;
    scanWatermarkBlock?: number | null;
    encryptedNotes?: unknown[];
    spentNullifiers?: string[];
  };
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

  const confidentialChainId = trimString(input.confidentialWallet?.chainId);
  const confidentialAccountId = trimString(input.confidentialWallet?.accountId);
  if (confidentialChainId && confidentialAccountId) {
    payload.confidentialWallet = {
      schema: "iroha-demo-confidential-wallet-backup/v1",
      chainId: confidentialChainId,
      accountId: confidentialAccountId,
      addressCursor:
        normalizeNonNegativeInteger(input.confidentialWallet?.addressCursor) ??
        0,
      scanWatermarkBlock:
        input.confidentialWallet?.scanWatermarkBlock === null
          ? null
          : (normalizeNonNegativeInteger(
              input.confidentialWallet?.scanWatermarkBlock,
            ) ?? null),
      encryptedNotes: Array.isArray(input.confidentialWallet?.encryptedNotes)
        ? [...input.confidentialWallet.encryptedNotes]
        : [],
      spentNullifiers: Array.isArray(input.confidentialWallet?.spentNullifiers)
        ? input.confidentialWallet.spentNullifiers
            .map((entry) => trimString(entry))
            .filter((entry) => /^[0-9a-f]{64}$/i.test(entry))
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

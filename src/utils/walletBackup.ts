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
};

const trimString = (value: unknown): string => String(value ?? "").trim();

const normalizeWordCount = (value: unknown): MnemonicWordCount | null => {
  const count = Number(value);
  if (count === 12 || count === 24) {
    return count;
  }
  return null;
};

export const buildWalletBackupPayload = (input: {
  mnemonic: string;
  wordCount: MnemonicWordCount;
  target: WalletBackupTarget;
  createdAt?: string;
  displayName?: string;
  domain?: string;
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

  return {
    mnemonic,
    wordCount: normalizeWordCount(payload.wordCount) ?? derivedWordCount,
    displayName: trimString(payload.displayName),
    domain: trimString(payload.domain),
  };
};

import { validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";

const PRIVATE_KEY_PEM_PATTERN =
  /-----BEGIN(?: [A-Z0-9]+)* PRIVATE KEY-----[\s\S]*?-----END(?: [A-Z0-9]+)* PRIVATE KEY-----/iu;
const BIP39_WORD_COUNTS = new Set([12, 15, 18, 21, 24]);

export const isSecretLikeTextValue = (value: unknown): value is string => {
  if (typeof value !== "string") {
    return false;
  }
  const normalized = value.trim().replace(/\s+/gu, " ");
  if (!normalized) {
    return false;
  }
  if (PRIVATE_KEY_PEM_PATTERN.test(normalized)) {
    return true;
  }
  const words = normalized.toLowerCase().split(" ");
  if (!BIP39_WORD_COUNTS.has(words.length)) {
    return false;
  }
  return validateMnemonic(words.join(" "), wordlist);
};

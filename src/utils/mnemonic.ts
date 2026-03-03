import {
  generateMnemonic,
  mnemonicToSeedSync,
  validateMnemonic,
} from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";

export type MnemonicWordCount = 12 | 24;

const WORD_COUNT_TO_STRENGTH: Record<MnemonicWordCount, 128 | 256> = {
  12: 128,
  24: 256,
};

const bytesToHex = (bytes: Uint8Array) =>
  Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();

const cleanPhrase = (phrase: string) => phrase.trim().replace(/\s+/g, " ");

export const generateMnemonicWords = (
  wordCount: MnemonicWordCount,
  randomBytes?: (bytes: number) => Uint8Array,
) => {
  const strength = WORD_COUNT_TO_STRENGTH[wordCount];
  const generator = generateMnemonic as unknown as (
    wl: string[],
    strength?: number,
    rng?: (bytes: number) => Uint8Array,
  ) => string;
  const words = generator(wordlist, strength, randomBytes);
  return words.trim().split(/\s+/);
};

export const mnemonicToPrivateKeyHex = (phrase: string) => {
  const normalized = cleanPhrase(phrase);
  if (!validateMnemonic(normalized, wordlist)) {
    throw new Error("Invalid recovery phrase");
  }
  const seed = mnemonicToSeedSync(normalized);
  const keyBytes = seed.slice(0, 32);
  return bytesToHex(keyBytes);
};

export const normalizeMnemonicPhrase = (phrase: string) => cleanPhrase(phrase);

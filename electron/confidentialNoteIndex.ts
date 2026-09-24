import type { WalletConfidentialTransactionLike } from "./confidentialWallet";
import {
  FIRST_RELEASE_CONFIDENTIAL_NOTE_PAGE_SIZE,
  requireFirstReleaseJsonObject,
} from "./firstReleaseResourceLimits";

const PAGE_KEYS = ["items", "next_cursor", "scanned_to_block"].sort();
const ITEM_KEYS = [
  "authority",
  "block",
  "entrypoint_hash",
  "instructions",
  "metadata",
  "result_ok",
  "transaction_hash",
].sort();
const MAX_AUTHORITY_BYTES = 2_048;
const MAX_INSTRUCTIONS_PER_TRANSACTION = 64;
const MAX_UINT64 = 0xffff_ffff_ffff_ffffn;

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype;

const assertExactKeys = (
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
) => {
  const expectedKeys = new Set(expected);
  let count = 0;
  for (const key in value) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      continue;
    }
    count += 1;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      count > expected.length ||
      !expectedKeys.has(key) ||
      !descriptor?.enumerable ||
      !("value" in descriptor)
    ) {
      throw new TypeError(`${label} contains missing or unknown fields.`);
    }
  }
  if (count !== expected.length) {
    throw new TypeError(`${label} contains missing or unknown fields.`);
  }
};

const requireCanonicalText = (
  value: unknown,
  label: string,
  maximumBytes: number,
) => {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value ||
    value.normalize("NFC") !== value ||
    Buffer.byteLength(value, "utf8") > maximumBytes
  ) {
    throw new TypeError(`${label} must be canonical bounded text.`);
  }
  for (const character of value) {
    const codePoint = character.codePointAt(0)!;
    if (
      codePoint <= 0x1f ||
      codePoint === 0x7f ||
      (codePoint >= 0xd800 && codePoint <= 0xdfff) ||
      (codePoint >= 0x202a && codePoint <= 0x202e) ||
      (codePoint >= 0x2066 && codePoint <= 0x2069)
    ) {
      throw new TypeError(`${label} must be canonical bounded text.`);
    }
  }
  return value;
};

const requireDenseArray = (
  value: unknown,
  label: string,
  maximumItems: number,
): readonly unknown[] => {
  if (
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    value.length > maximumItems
  ) {
    throw new TypeError(`${label} exceeds its array limit.`);
  }
  let count = 0;
  for (const key in value) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      continue;
    }
    if (!/^(?:0|[1-9]\d*)$/u.test(key) || Number(key) >= value.length) {
      throw new TypeError(`${label} contains unsupported array fields.`);
    }
    count += 1;
  }
  if (count !== value.length) {
    throw new TypeError(`${label} must be a dense data-field array.`);
  }
  const snapshot: unknown[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor?.enumerable || !("value" in descriptor)) {
      throw new TypeError(`${label} must be a dense data-field array.`);
    }
    snapshot.push(descriptor.value);
  }
  return snapshot;
};

const canonicalHash = (value: unknown, label: string) => {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/u.test(value)) {
    throw new TypeError(`${label} must be lowercase 32-byte hex.`);
  }
  return value;
};

const safeBlockHeight = (value: unknown, label: string, allowZero: boolean) => {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < (allowZero ? 0 : 1)
  ) {
    throw new TypeError(`${label} must be a safe block height.`);
  }
  return value;
};

const parseItem = (
  value: unknown,
  index: number,
): WalletConfidentialTransactionLike => {
  const label = `Confidential note index items[${index}]`;
  if (!isPlainRecord(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
  assertExactKeys(value, ITEM_KEYS, label);
  const entrypointHash = canonicalHash(
    value.entrypoint_hash,
    `${label}.entrypoint_hash`,
  );
  const transactionHash = canonicalHash(
    value.transaction_hash,
    `${label}.transaction_hash`,
  );
  if (transactionHash !== entrypointHash) {
    throw new TypeError(`${label} transaction hashes must match.`);
  }
  if (value.result_ok !== true) {
    throw new TypeError(`${label}.result_ok must be true.`);
  }
  const authority = requireCanonicalText(
    value.authority,
    `${label}.authority`,
    MAX_AUTHORITY_BYTES,
  );
  const metadata = requireFirstReleaseJsonObject(
    value.metadata,
    `${label}.metadata`,
  );
  const rawInstructions = requireDenseArray(
    value.instructions,
    `${label}.instructions`,
    MAX_INSTRUCTIONS_PER_TRANSACTION,
  );
  if (rawInstructions.length === 0) {
    throw new TypeError(
      `${label}.instructions must be a non-empty array of objects.`,
    );
  }
  const instructions = rawInstructions.map((instruction, instructionIndex) =>
    requireFirstReleaseJsonObject(
      instruction,
      `${label}.instructions[${instructionIndex}]`,
    ),
  );
  return {
    entrypoint_hash: entrypointHash,
    result_ok: true,
    authority,
    block: safeBlockHeight(value.block, `${label}.block`, false),
    metadata,
    instructions,
  };
};

export type ConfidentialNoteIndexPage = {
  items: WalletConfidentialTransactionLike[];
  nextCursor: string | null;
  scannedToBlock: number;
};

export const parseConfidentialNoteIndexPage = (
  value: unknown,
): ConfidentialNoteIndexPage => {
  if (!isPlainRecord(value)) {
    throw new TypeError("Confidential note index page must be an object.");
  }
  assertExactKeys(value, PAGE_KEYS, "Confidential note index page");
  let items: readonly unknown[];
  try {
    items = requireDenseArray(
      value.items,
      "Confidential note index page.items",
      FIRST_RELEASE_CONFIDENTIAL_NOTE_PAGE_SIZE,
    );
  } catch {
    throw new TypeError(
      "Confidential note index page.items exceeds the requested page limit.",
    );
  }
  let nextCursor: string | null = null;
  if (value.next_cursor !== null) {
    if (
      typeof value.next_cursor !== "string" ||
      value.next_cursor.length > 20 ||
      !/^[1-9]\d*$/u.test(value.next_cursor) ||
      BigInt(value.next_cursor) > MAX_UINT64
    ) {
      throw new TypeError(
        "Confidential note index page.next_cursor must be null or a canonical positive block cursor.",
      );
    }
    nextCursor = value.next_cursor;
  }
  const parsedItems = items.map(parseItem);
  const transactionHashes = new Set<string>();
  const scannedToBlock = safeBlockHeight(
    value.scanned_to_block,
    "Confidential note index page.scanned_to_block",
    true,
  );
  for (const parsedItem of parsedItems) {
    if (transactionHashes.has(parsedItem.entrypoint_hash!)) {
      throw new TypeError(
        "Confidential note index page contains duplicate transaction hashes.",
      );
    }
    transactionHashes.add(parsedItem.entrypoint_hash!);
    if (parsedItem.block! > scannedToBlock) {
      throw new TypeError(
        "Confidential note index item block exceeds scanned_to_block.",
      );
    }
  }
  return {
    items: parsedItems,
    nextCursor,
    scannedToBlock,
  };
};

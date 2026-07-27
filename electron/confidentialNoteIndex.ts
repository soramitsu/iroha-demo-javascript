import type { WalletConfidentialTransactionLike } from "./confidentialWallet";

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

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const assertExactKeys = (
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
) => {
  const actual = Object.keys(value).sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw new TypeError(`${label} contains missing or unknown fields.`);
  }
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
  if (
    typeof value.authority !== "string" ||
    !value.authority ||
    value.authority.trim() !== value.authority
  ) {
    throw new TypeError(`${label}.authority must be canonical text.`);
  }
  if (!isPlainRecord(value.metadata)) {
    throw new TypeError(`${label}.metadata must be an object.`);
  }
  if (
    !Array.isArray(value.instructions) ||
    value.instructions.length === 0 ||
    value.instructions.some((instruction) => !isPlainRecord(instruction))
  ) {
    throw new TypeError(
      `${label}.instructions must be a non-empty array of objects.`,
    );
  }
  return {
    entrypoint_hash: entrypointHash,
    result_ok: true,
    authority: value.authority,
    block: safeBlockHeight(value.block, `${label}.block`, false),
    metadata: value.metadata,
    instructions: value.instructions as Array<Record<string, unknown>>,
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
  if (!Array.isArray(value.items)) {
    throw new TypeError("Confidential note index page.items must be an array.");
  }
  let nextCursor: string | null = null;
  if (value.next_cursor !== null) {
    if (
      typeof value.next_cursor !== "string" ||
      !/^[1-9]\d*$/u.test(value.next_cursor)
    ) {
      throw new TypeError(
        "Confidential note index page.next_cursor must be null or a canonical positive block cursor.",
      );
    }
    nextCursor = value.next_cursor;
  }
  return {
    items: value.items.map(parseItem),
    nextCursor,
    scannedToBlock: safeBlockHeight(
      value.scanned_to_block,
      "Confidential note index page.scanned_to_block",
      true,
    ),
  };
};

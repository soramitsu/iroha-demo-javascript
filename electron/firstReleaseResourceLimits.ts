import { Buffer } from "node:buffer";

export const FIRST_RELEASE_JSON_OBJECT_MAX_BYTES = 64 * 1024;
export const FIRST_RELEASE_JSON_OBJECT_MAX_DEPTH = 16;
export const FIRST_RELEASE_JSON_OBJECT_MAX_NODES = 2_048;
export const FIRST_RELEASE_JSON_OBJECT_MAX_PROPERTIES = 128;
export const FIRST_RELEASE_JSON_ARRAY_MAX_ITEMS = 512;
export const FIRST_RELEASE_JSON_TEXT_MAX_BYTES = 16 * 1024;
export const FIRST_RELEASE_JSON_KEY_MAX_BYTES = 128;
export const FIRST_RELEASE_CLIPBOARD_TEXT_MAX_BYTES = 64 * 1024;
export const FIRST_RELEASE_CRYPTO_KEY_MATERIAL_MAX_BYTES = 16 * 1024;

export const FIRST_RELEASE_CONFIDENTIAL_NOTE_PAGE_SIZE = 500;
export const FIRST_RELEASE_CONFIDENTIAL_NOTE_MAX_PAGES_PER_ASSET = 16;
export const FIRST_RELEASE_CONFIDENTIAL_NOTE_MAX_ASSETS = 2;
export const FIRST_RELEASE_CONFIDENTIAL_NOTE_MAX_ITEMS_PER_ASSET =
  FIRST_RELEASE_CONFIDENTIAL_NOTE_PAGE_SIZE *
  FIRST_RELEASE_CONFIDENTIAL_NOTE_MAX_PAGES_PER_ASSET;
export const FIRST_RELEASE_ACCOUNT_TRANSACTION_SCAN_MAX_ITEMS = 10_000;
export const FIRST_RELEASE_ACCOUNT_TRANSACTION_SCAN_MAX_PAGES = 50;

export const FIRST_RELEASE_MAX_ACTIVE_FAUCET_REQUESTS = 2;
export const FIRST_RELEASE_FAUCET_REQUEST_ID_MAX_BYTES = 128;

type JsonContainer = Record<string, unknown> | unknown[];

type JsonSnapshotTarget = Record<PropertyKey, unknown> | unknown[];

type JsonWorkItem = Readonly<{
  value: unknown;
  depth: number;
  label: string;
  target: JsonSnapshotTarget;
  key: PropertyKey;
}>;

const isPlainRecord = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const assertBoundedJsonText = (value: string, label: string): void => {
  if (
    value.length > FIRST_RELEASE_JSON_TEXT_MAX_BYTES ||
    Buffer.byteLength(value, "utf8") > FIRST_RELEASE_JSON_TEXT_MAX_BYTES
  ) {
    throw new Error(`${label} contains oversized text.`);
  }
};

/** Return the exact UTF-8 byte length of this string's JSON representation. */
const jsonStringByteLength = (value: string): number => {
  let bytes = 2; // Opening and closing quotes.
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit === 0x22 || codeUnit === 0x5c) {
      bytes += 2;
      continue;
    }
    if (codeUnit <= 0x1f) {
      bytes +=
        codeUnit === 0x08 ||
        codeUnit === 0x09 ||
        codeUnit === 0x0a ||
        codeUnit === 0x0c ||
        codeUnit === 0x0d
          ? 2
          : 6;
      continue;
    }
    if (codeUnit <= 0x7f) {
      bytes += 1;
      continue;
    }
    if (codeUnit <= 0x7ff) {
      bytes += 2;
      continue;
    }
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const trailing = value.charCodeAt(index + 1);
      if (trailing >= 0xdc00 && trailing <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else {
        bytes += 6;
      }
      continue;
    }
    bytes += codeUnit >= 0xdc00 && codeUnit <= 0xdfff ? 6 : 3;
  }
  return bytes;
};

const setJsonSnapshotValue = (
  target: JsonSnapshotTarget,
  key: PropertyKey,
  value: unknown,
): void => {
  Object.defineProperty(target, key, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
};

/**
 * Snapshot one renderer-supplied JSON object before it reaches a signer or an
 * HTTP request. This rejects cyclic, sparse, accessor-backed, non-JSON, and
 * structurally expensive values rather than relying on JSON.stringify's lossy
 * coercions or the transport's much larger generic byte ceiling.
 */
export const requireFirstReleaseJsonObject = (
  value: unknown,
  label: string,
  maximumBytes = FIRST_RELEASE_JSON_OBJECT_MAX_BYTES,
): Record<string, unknown> => {
  if (
    !isPlainRecord(value) ||
    !Number.isSafeInteger(maximumBytes) ||
    maximumBytes < 2
  ) {
    throw new Error(`${label} must be a bounded JSON object.`);
  }

  const snapshotHolder: Record<PropertyKey, unknown> = {};
  const pending: JsonWorkItem[] = [
    { value, depth: 0, label, target: snapshotHolder, key: "value" },
  ];
  const seen = new Set<JsonContainer>();
  let discoveredNodeCount = 1;
  let encodedBytes = 0;
  const addEncodedBytes = (amount: number): void => {
    if (amount > maximumBytes - encodedBytes) {
      throw new Error(`${label} exceeds its JSON byte limit.`);
    }
    encodedBytes += amount;
  };
  const enqueue = (entry: JsonWorkItem): void => {
    discoveredNodeCount += 1;
    if (discoveredNodeCount > FIRST_RELEASE_JSON_OBJECT_MAX_NODES) {
      throw new Error(`${label} exceeds its JSON node limit.`);
    }
    pending.push(entry);
  };

  while (pending.length > 0) {
    const current = pending.pop()!;
    if (current.depth > FIRST_RELEASE_JSON_OBJECT_MAX_DEPTH) {
      throw new Error(`${label} exceeds its JSON depth limit.`);
    }

    const candidate = current.value;
    if (candidate === null) {
      addEncodedBytes(4);
      setJsonSnapshotValue(current.target, current.key, null);
      continue;
    }
    if (typeof candidate === "boolean") {
      addEncodedBytes(candidate ? 4 : 5);
      setJsonSnapshotValue(current.target, current.key, candidate);
      continue;
    }
    if (typeof candidate === "string") {
      assertBoundedJsonText(candidate, current.label);
      addEncodedBytes(jsonStringByteLength(candidate));
      setJsonSnapshotValue(current.target, current.key, candidate);
      continue;
    }
    if (typeof candidate === "number") {
      if (!Number.isFinite(candidate) || Object.is(candidate, -0)) {
        throw new Error(`${current.label} contains a noncanonical number.`);
      }
      addEncodedBytes(String(candidate).length);
      setJsonSnapshotValue(current.target, current.key, candidate);
      continue;
    }
    if (typeof candidate !== "object") {
      throw new Error(`${current.label} contains a non-JSON value.`);
    }
    if (seen.has(candidate as JsonContainer)) {
      throw new Error(`${label} must not contain cyclic or shared objects.`);
    }
    seen.add(candidate as JsonContainer);

    if (Array.isArray(candidate)) {
      if (
        Object.getPrototypeOf(candidate) !== Array.prototype ||
        candidate.length > FIRST_RELEASE_JSON_ARRAY_MAX_ITEMS
      ) {
        throw new Error(`${current.label} exceeds its JSON array limit.`);
      }
      addEncodedBytes(2 + Math.max(0, candidate.length - 1));
      const snapshot: unknown[] = new Array(candidate.length);
      setJsonSnapshotValue(current.target, current.key, snapshot);
      let enumerableItemCount = 0;
      for (const key in candidate) {
        if (!Object.prototype.hasOwnProperty.call(candidate, key)) continue;
        if (!/^(?:0|[1-9]\d*)$/u.test(key) || Number(key) >= candidate.length) {
          throw new Error(
            `${current.label} contains unsupported array fields.`,
          );
        }
        enumerableItemCount += 1;
        if (enumerableItemCount > candidate.length) {
          throw new Error(
            `${current.label} contains unsupported array fields.`,
          );
        }
      }
      if (Object.getOwnPropertySymbols(candidate).length !== 0) {
        throw new Error(`${current.label} contains unsupported array fields.`);
      }
      for (let index = 0; index < candidate.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(
          candidate,
          String(index),
        );
        if (!descriptor?.enumerable || !("value" in descriptor)) {
          throw new Error(
            `${current.label} must be a dense JSON data-field array.`,
          );
        }
        enqueue({
          value: descriptor.value,
          depth: current.depth + 1,
          label: `${current.label}[${index}]`,
          target: snapshot,
          key: index,
        });
      }
      if (enumerableItemCount !== candidate.length) {
        throw new Error(
          `${current.label} must be a dense JSON data-field array.`,
        );
      }
      continue;
    }

    if (!isPlainRecord(candidate)) {
      throw new Error(`${current.label} contains a non-JSON object.`);
    }
    addEncodedBytes(2);
    const snapshot: Record<string, unknown> = {};
    setJsonSnapshotValue(current.target, current.key, snapshot);
    let propertyCount = 0;
    for (const key in candidate) {
      if (!Object.prototype.hasOwnProperty.call(candidate, key)) continue;
      propertyCount += 1;
      if (propertyCount > FIRST_RELEASE_JSON_OBJECT_MAX_PROPERTIES) {
        throw new Error(`${current.label} exceeds its JSON property limit.`);
      }
      if (
        key.length === 0 ||
        key.length > FIRST_RELEASE_JSON_KEY_MAX_BYTES ||
        Buffer.byteLength(key, "utf8") > FIRST_RELEASE_JSON_KEY_MAX_BYTES
      ) {
        throw new Error(`${current.label} contains an invalid JSON key.`);
      }
      addEncodedBytes(
        (propertyCount === 1 ? 0 : 1) + jsonStringByteLength(key) + 1,
      );
      const descriptor = Object.getOwnPropertyDescriptor(candidate, key);
      if (!descriptor?.enumerable || !("value" in descriptor)) {
        throw new Error(`${current.label}.${key} must be a JSON data field.`);
      }
      // Establish string-key insertion order while walking the source. Work
      // items are processed LIFO, but canonical JSON consumers must observe
      // the source data-field order rather than that implementation detail.
      setJsonSnapshotValue(snapshot, key, undefined);
      enqueue({
        value: descriptor.value,
        depth: current.depth + 1,
        label: `${current.label}.${key}`,
        target: snapshot,
        key,
      });
    }
    if (Object.getOwnPropertySymbols(candidate).length !== 0) {
      throw new Error(`${current.label} exceeds its JSON property limit.`);
    }
  }

  const snapshot = snapshotHolder.value;
  if (!isPlainRecord(snapshot)) {
    throw new Error(`${label} must encode as a JSON object.`);
  }
  return snapshot;
};

export type FirstReleaseConfidentialNoteScanBudget = Readonly<{
  pages: number;
  items: number;
}>;

export const consumeFirstReleaseConfidentialNotePage = (
  budget: FirstReleaseConfidentialNoteScanBudget,
  pageItemCount: number,
): FirstReleaseConfidentialNoteScanBudget => {
  if (
    !Number.isSafeInteger(budget.pages) ||
    budget.pages < 0 ||
    !Number.isSafeInteger(budget.items) ||
    budget.items < 0 ||
    !Number.isSafeInteger(pageItemCount) ||
    pageItemCount < 0 ||
    pageItemCount > FIRST_RELEASE_CONFIDENTIAL_NOTE_PAGE_SIZE
  ) {
    throw new Error("Confidential note index exceeded its page contract.");
  }
  const pages = budget.pages + 1;
  const items = budget.items + pageItemCount;
  if (
    pages > FIRST_RELEASE_CONFIDENTIAL_NOTE_MAX_PAGES_PER_ASSET ||
    items > FIRST_RELEASE_CONFIDENTIAL_NOTE_MAX_ITEMS_PER_ASSET
  ) {
    throw new Error("Confidential note index exceeded its finite scan budget.");
  }
  return { pages, items };
};

export const assertFirstReleaseConfidentialNoteContinuation = (
  budget: FirstReleaseConfidentialNoteScanBudget,
  hasNextPage: boolean,
): void => {
  if (
    !Number.isSafeInteger(budget.pages) ||
    budget.pages < 0 ||
    budget.pages > FIRST_RELEASE_CONFIDENTIAL_NOTE_MAX_PAGES_PER_ASSET ||
    !Number.isSafeInteger(budget.items) ||
    budget.items < 0 ||
    budget.items > FIRST_RELEASE_CONFIDENTIAL_NOTE_MAX_ITEMS_PER_ASSET ||
    typeof hasNextPage !== "boolean"
  ) {
    throw new Error("Confidential note index exceeded its page contract.");
  }
  if (
    hasNextPage &&
    budget.pages >= FIRST_RELEASE_CONFIDENTIAL_NOTE_MAX_PAGES_PER_ASSET
  ) {
    throw new Error("Confidential note index exceeded its finite scan budget.");
  }
};

export const assertFirstReleaseConfidentialScanTargets = (
  assetDefinitionIds: readonly unknown[],
): void => {
  if (
    !Array.isArray(assetDefinitionIds) ||
    assetDefinitionIds.length === 0 ||
    assetDefinitionIds.length > FIRST_RELEASE_CONFIDENTIAL_NOTE_MAX_ASSETS
  ) {
    throw new Error(
      "Confidential note index exceeded its tracked-asset limit.",
    );
  }
  const seen = new Set<string>();
  for (let index = 0; index < assetDefinitionIds.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(assetDefinitionIds, index)) {
      throw new Error("Confidential note index asset list must be dense.");
    }
    const assetDefinitionId = assetDefinitionIds[index];
    if (
      typeof assetDefinitionId !== "string" ||
      assetDefinitionId.length === 0 ||
      assetDefinitionId.trim() !== assetDefinitionId ||
      Buffer.byteLength(assetDefinitionId, "utf8") > 256 ||
      seen.has(assetDefinitionId)
    ) {
      throw new Error(
        "Confidential note index requires unique bounded asset definitions.",
      );
    }
    seen.add(assetDefinitionId);
  }
};

export const requireFirstReleaseFaucetRequestId = (value: unknown): string => {
  if (
    typeof value !== "string" ||
    Buffer.byteLength(value, "utf8") >
      FIRST_RELEASE_FAUCET_REQUEST_ID_MAX_BYTES ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(value)
  ) {
    throw new Error("Faucet requestId must be bounded canonical text.");
  }
  return value;
};

export type FirstReleaseFaucetReservation = Readonly<{
  requestId: string;
  controller: AbortController;
  release: () => void;
}>;

export const reserveFirstReleaseFaucetRequest = (
  controllers: Map<string, AbortController>,
  requestIdValue: unknown,
): FirstReleaseFaucetReservation => {
  const requestId = requireFirstReleaseFaucetRequestId(requestIdValue);
  if (controllers.has(requestId)) {
    throw new Error("A faucet request with this requestId is already active.");
  }
  if (controllers.size >= FIRST_RELEASE_MAX_ACTIVE_FAUCET_REQUESTS) {
    throw new Error("The faucet request concurrency limit has been reached.");
  }
  const controller = new AbortController();
  controllers.set(requestId, controller);
  return {
    requestId,
    controller,
    release: () => {
      if (controllers.get(requestId) === controller) {
        controllers.delete(requestId);
      }
    },
  };
};

import { Buffer } from "node:buffer";

export const FIRST_RELEASE_PAGE_LIMIT_MAX = 500;
export const FIRST_RELEASE_PAGE_OFFSET_MAX = 10_000;

export type FirstReleasePagination = Readonly<{
  limit: number;
  offset: number;
}>;

export const requireFirstReleaseInputArray = (
  value: unknown,
  label: string,
  maximumItems: number,
): readonly unknown[] => {
  let prototype: object | null;
  try {
    prototype = Array.isArray(value) ? Object.getPrototypeOf(value) : null;
  } catch {
    throw new Error(`${label} must be an exact array.`);
  }
  if (
    !Array.isArray(value) ||
    prototype !== Array.prototype ||
    !Number.isSafeInteger(maximumItems) ||
    maximumItems < 0
  ) {
    throw new Error(`${label} must be an exact array.`);
  }
  let lengthDescriptor: PropertyDescriptor | undefined;
  try {
    lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  } catch {
    throw new Error(`${label} must be an exact array.`);
  }
  if (
    !lengthDescriptor ||
    !("value" in lengthDescriptor) ||
    !Number.isSafeInteger(lengthDescriptor.value) ||
    lengthDescriptor.value < 0 ||
    lengthDescriptor.value > maximumItems
  ) {
    throw new Error(`${label} exceeds its exact item limit.`);
  }
  const length = lengthDescriptor.value;
  const snapshot: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    } catch {
      throw new Error(`${label} must be a dense array.`);
    }
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
      throw new Error(`${label} must be a dense array.`);
    }
    snapshot.push(descriptor.value);
  }
  let enumerableItemCount = 0;
  try {
    // The length cap above is deliberately checked before walking keys. This
    // loop rejects an expando after its first named field without allocating a
    // complete attacker-sized own-key array.
    for (const key in value as unknown[]) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
      if (!/^(?:0|[1-9]\d*)$/u.test(key) || Number(key) >= length) {
        throw new Error(`${label} must not contain named fields.`);
      }
      enumerableItemCount += 1;
      if (enumerableItemCount > length) {
        throw new Error(`${label} must not contain named fields.`);
      }
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith(label)) throw error;
    throw new Error(`${label} must be an exact array.`);
  }
  if (enumerableItemCount !== length) {
    throw new Error(`${label} must be a dense array.`);
  }
  if (Object.getOwnPropertySymbols(value).length !== 0) {
    throw new Error(`${label} must not contain named fields.`);
  }
  return Object.freeze(snapshot);
};

const requireExactInteger = (
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): number => {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    Object.is(value, -0) ||
    value < minimum ||
    value > maximum
  ) {
    throw new Error(
      `${label} must be an exact integer between ${minimum} and ${maximum}.`,
    );
  }
  return value;
};

/**
 * Normalize one renderer-supplied offset page without coercing compatibility
 * forms such as numeric strings, null, or floating-point values.
 */
export const requireFirstReleasePagination = (
  input: Readonly<{ limit?: unknown; offset?: unknown }>,
  options: Readonly<{
    defaultLimit: number;
    maximumLimit?: number;
    maximumOffset?: number;
    label: string;
  }>,
): FirstReleasePagination => {
  const maximumLimit = options.maximumLimit ?? FIRST_RELEASE_PAGE_LIMIT_MAX;
  const maximumOffset = options.maximumOffset ?? FIRST_RELEASE_PAGE_OFFSET_MAX;
  const defaultLimit = requireExactInteger(
    options.defaultLimit,
    `${options.label} default limit`,
    1,
    maximumLimit,
  );
  return {
    limit:
      input.limit === undefined
        ? defaultLimit
        : requireExactInteger(
            input.limit,
            `${options.label} limit`,
            1,
            maximumLimit,
          ),
    offset:
      input.offset === undefined
        ? 0
        : requireExactInteger(
            input.offset,
            `${options.label} offset`,
            0,
            maximumOffset,
          ),
  };
};

/** Bind an exact-count Torii page to the request that selected it. */
export const assertFirstReleasePageWindow = (
  page: Readonly<{ items: readonly unknown[]; total: number }>,
  request: FirstReleasePagination,
  label: string,
): void => {
  if (
    !Array.isArray(page.items) ||
    typeof page.total !== "number" ||
    !Number.isSafeInteger(page.total) ||
    Object.is(page.total, -0) ||
    page.total < 0
  ) {
    throw new Error(`${label} returned invalid exact-count pagination.`);
  }
  if (page.items.length > request.limit) {
    throw new Error(`${label} returned more items than requested.`);
  }
  if (
    page.items.length > 0 &&
    request.offset + page.items.length > page.total
  ) {
    throw new Error(`${label} returned items outside its exact-count window.`);
  }
};

export const assertFirstReleaseHasMore = (
  value: unknown,
  page: Readonly<{ items: readonly unknown[]; total: number }>,
  request: FirstReleasePagination,
  label: string,
): void => {
  const expected = request.offset + page.items.length < page.total;
  if (typeof value !== "boolean" || value !== expected) {
    throw new Error(`${label} returned inconsistent has_more pagination.`);
  }
};

export const requireFirstReleaseInputText = (
  value: unknown,
  label: string,
  maximumBytes = 1_024,
): string => {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value ||
    Buffer.byteLength(value, "utf8") > maximumBytes ||
    /[\p{Cc}\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(value)
  ) {
    throw new Error(`${label} must be bounded canonical text.`);
  }
  return value;
};

export const requireOptionalFirstReleaseFilter = (
  value: unknown,
  label: string,
  maximumBytes = 1_024,
): string | undefined => {
  if (value === undefined || value === null) return undefined;
  return requireFirstReleaseInputText(value, label, maximumBytes);
};

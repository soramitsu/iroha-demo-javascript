import { Buffer } from "node:buffer";

import { parseStrictJson } from "./secureBoundedJson";

const CANONICAL_DECIMAL = /^(?:0|[1-9]\d*)$/u;
const APPLICATION_JSON = /^application\/json(?:\s*;|$)/iu;

export const MAX_TORII_JSON_RESPONSE_BYTES = 4 * 1024 * 1024;

export type BoundedResponseOptions = Readonly<{
  label: string;
  maximumBytes: number;
  allowEmpty?: boolean;
}>;

export type BoundedJsonResponseOptions = BoundedResponseOptions &
  Readonly<{
    requireApplicationJson?: boolean;
  }>;

const requireOptions = <T extends BoundedResponseOptions>(options: T): T => {
  const label = String(options.label ?? "").trim();
  if (
    !label ||
    !Number.isSafeInteger(options.maximumBytes) ||
    options.maximumBytes < 1
  ) {
    throw new TypeError("Bounded JSON response options are invalid.");
  }
  return { ...options, label };
};

export const readBoundedResponseBytes = async (
  response: Pick<Response, "arrayBuffer" | "headers">,
  rawOptions: BoundedResponseOptions,
): Promise<Buffer> => {
  const options = requireOptions(rawOptions);
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null) {
    const normalized = contentLength.trim();
    if (
      !CANONICAL_DECIMAL.test(normalized) ||
      BigInt(normalized) > BigInt(options.maximumBytes)
    ) {
      throw new Error(
        `${options.label} advertised an invalid or oversized body.`,
      );
    }
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0 && options.allowEmpty === true) {
    return bytes;
  }
  if (bytes.length < 1 || bytes.length > options.maximumBytes) {
    throw new Error(`${options.label} body is outside its byte limit.`);
  }
  return bytes;
};

/**
 * Decode one network JSON response through an explicit byte limit, fatal UTF-8
 * decoding, and duplicate-key-aware strict JSON parsing.
 */
export const readBoundedJsonResponse = async (
  response: Pick<Response, "arrayBuffer" | "headers">,
  rawOptions: BoundedJsonResponseOptions,
): Promise<unknown> => {
  const options = requireOptions(rawOptions);
  const contentType = response.headers.get("content-type")?.trim() ?? "";
  if (
    options.requireApplicationJson === true &&
    !APPLICATION_JSON.test(contentType)
  ) {
    throw new Error(`${options.label} did not return application/json.`);
  }

  const bytes = await readBoundedResponseBytes(response, {
    ...options,
    label: `${options.label} JSON`,
  });
  if (bytes.length === 0 && options.allowEmpty === true) {
    return null;
  }
  if (bytes.length < 1 || bytes.length > options.maximumBytes) {
    throw new Error(`${options.label} JSON body is outside its byte limit.`);
  }

  let serialized: string;
  try {
    serialized = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new Error(`${options.label} JSON body is not valid UTF-8.`, {
      cause: error,
    });
  }
  if (!Buffer.from(serialized, "utf8").equals(bytes)) {
    throw new Error(`${options.label} JSON body is not canonical UTF-8.`);
  }
  return parseStrictJson(serialized, options.label);
};

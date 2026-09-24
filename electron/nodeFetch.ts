import * as http from "node:http";
import * as https from "node:https";
import type { IncomingHttpHeaders } from "node:http";
import { sanitizeFetchInit } from "./preload-utils";
import { isLoopbackEndpointUrl } from "../src/utils/endpoint";

const RAW_UTF8_HEADERS_INIT_KEY = "__irohaRawUtf8Headers";
export const NODE_FETCH_MAX_BODY_BYTES = 8 * 1024 * 1024;
export const NODE_FETCH_MAX_URL_CHARACTERS = 8 * 1024;
export const NODE_FETCH_TIMEOUT_MS = 120_000;
const FORBIDDEN_REQUEST_HEADERS = new Set([
  "connection",
  "content-length",
  "host",
  "proxy-authorization",
  "proxy-connection",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);
type RawUtf8FetchInit = RequestInit & {
  [RAW_UTF8_HEADERS_INIT_KEY]?: Record<string, string>;
};

const normalizeResponseHeaders = (headers: IncomingHttpHeaders) => {
  const normalized = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        normalized.append(key, item);
      }
      continue;
    }
    normalized.set(key, value);
  }
  return normalized;
};

const createAbortError = () => {
  if (typeof DOMException !== "undefined") {
    return new DOMException("The operation was aborted.", "AbortError");
  }
  const error = new Error("The operation was aborted.");
  error.name = "AbortError";
  return error;
};

const isRequestInput = (input: unknown): input is Request =>
  typeof Request !== "undefined" && input instanceof Request;

const normalizeUrl = (input: Parameters<typeof fetch>[0]) => {
  if (input instanceof URL) {
    return input.toString();
  }
  if (isRequestInput(input)) {
    return input.url;
  }
  return String(input);
};

const normalizeMethod = (
  input: Parameters<typeof fetch>[0],
  init?: RequestInit,
) => {
  const candidate =
    init?.method ?? (isRequestInput(input) ? input.method : "GET");
  return String(candidate || "GET").toUpperCase();
};

const appendHeadersToRecord = (
  target: Record<string, string>,
  headers?: HeadersInit,
) => {
  if (!headers) {
    return;
  }
  if (typeof Headers !== "undefined" && headers instanceof Headers) {
    for (const [key, value] of headers.entries()) {
      target[key] = value;
    }
    return;
  }
  if (Array.isArray(headers)) {
    for (const [key, value] of headers) {
      if (key === undefined || value === undefined || value === null) {
        continue;
      }
      target[String(key)] = String(value);
    }
    return;
  }
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined || value === null) {
      continue;
    }
    target[key] = String(value);
  }
};

const resolveAbortSignal = (
  input: Parameters<typeof fetch>[0],
  init?: RequestInit,
) => init?.signal ?? (isRequestInput(input) ? input.signal : undefined);

const requireRequestBodyWithinLimit = (byteLength: number): void => {
  if (byteLength > NODE_FETCH_MAX_BODY_BYTES) {
    throw new Error(
      `nodeFetch request body exceeds ${NODE_FETCH_MAX_BODY_BYTES} bytes.`,
    );
  }
};

const normalizeBodyBuffer = async (body: unknown): Promise<Buffer | null> => {
  if (body == null) {
    return null;
  }
  if (Buffer.isBuffer(body)) {
    requireRequestBodyWithinLimit(body.byteLength);
    return body;
  }
  if (typeof body === "string") {
    requireRequestBodyWithinLimit(Buffer.byteLength(body, "utf8"));
    return Buffer.from(body, "utf8");
  }
  if (body instanceof ArrayBuffer) {
    requireRequestBodyWithinLimit(body.byteLength);
    return Buffer.from(body);
  }
  if (ArrayBuffer.isView(body)) {
    requireRequestBodyWithinLimit(body.byteLength);
    return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
  }
  if (
    typeof URLSearchParams !== "undefined" &&
    body instanceof URLSearchParams
  ) {
    const encoded = body.toString();
    requireRequestBodyWithinLimit(Buffer.byteLength(encoded, "utf8"));
    return Buffer.from(encoded, "utf8");
  }
  if (typeof Blob !== "undefined" && body instanceof Blob) {
    requireRequestBodyWithinLimit(body.size);
    return Buffer.from(await body.arrayBuffer());
  }
  if (typeof ReadableStream !== "undefined" && body instanceof ReadableStream) {
    throw new Error(
      "nodeFetch does not support ReadableStream request bodies.",
    );
  }
  throw new TypeError("nodeFetch received an unsupported request body type.");
};

const readBoundedRequestStream = async (
  stream: ReadableStream<Uint8Array>,
  signal?: AbortSignal | null,
): Promise<Buffer> => {
  const reader = stream.getReader();
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  let deadline: ReturnType<typeof setTimeout> | null = null;
  let abortListener: (() => void) | null = null;

  const consume = async () => {
    let complete = false;
    while (!complete) {
      const { done, value } = await reader.read();
      if (done) {
        complete = true;
        continue;
      }
      if (!ArrayBuffer.isView(value)) {
        throw new Error("nodeFetch Request bodies must yield byte chunks.");
      }
      const bytes = Buffer.from(
        value.buffer,
        value.byteOffset,
        value.byteLength,
      );
      totalBytes += bytes.byteLength;
      if (totalBytes > NODE_FETCH_MAX_BODY_BYTES) {
        throw new Error(
          `nodeFetch request body exceeds ${NODE_FETCH_MAX_BODY_BYTES} bytes.`,
        );
      }
      chunks.push(bytes);
    }
    return Buffer.concat(chunks, totalBytes);
  };

  const deadlinePromise = new Promise<never>((_resolve, reject) => {
    deadline = setTimeout(
      () =>
        reject(
          new Error(
            `nodeFetch request body exceeded its ${NODE_FETCH_TIMEOUT_MS} ms deadline.`,
          ),
        ),
      NODE_FETCH_TIMEOUT_MS,
    );
    deadline.unref?.();
  });
  const abortPromise = new Promise<never>((_resolve, reject) => {
    if (!signal) {
      return;
    }
    abortListener = () => reject(createAbortError());
    if (signal.aborted) {
      abortListener();
      return;
    }
    signal.addEventListener("abort", abortListener, { once: true });
  });

  try {
    return await Promise.race([consume(), deadlinePromise, abortPromise]);
  } catch (error) {
    void reader.cancel(error).catch(() => undefined);
    throw error;
  } finally {
    if (deadline !== null) {
      clearTimeout(deadline);
    }
    if (signal && abortListener) {
      signal.removeEventListener("abort", abortListener);
    }
    try {
      reader.releaseLock();
    } catch {
      // Cancellation settles the outstanding read; the cloned Request stream
      // is discarded even if its tee branch has not released synchronously.
    }
  }
};

const readRequestBody = async (
  input: Parameters<typeof fetch>[0],
  init: RequestInit | undefined,
  method: string,
  signal?: AbortSignal | null,
) => {
  if (method === "GET" || method === "HEAD") {
    return null;
  }
  if (init && "body" in init) {
    return normalizeBodyBuffer(init.body);
  }
  if (isRequestInput(input)) {
    const body = input.clone().body;
    return body ? readBoundedRequestStream(body, signal) : null;
  }
  return null;
};

const normalizeRawUtf8Headers = (
  init?: RequestInit,
): Record<string, string> | undefined => {
  const candidate = (init as RawUtf8FetchInit | undefined)?.[
    RAW_UTF8_HEADERS_INIT_KEY
  ];
  if (!candidate || typeof candidate !== "object") {
    return undefined;
  }

  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(candidate)) {
    const headerName = String(key).trim();
    if (!headerName || value === undefined || value === null) {
      continue;
    }
    normalized[headerName] = String(value);
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined;
};

const omitRawUtf8Headers = (
  headers: HeadersInit | undefined,
  rawUtf8Headers: Record<string, string> | undefined,
): HeadersInit | undefined => {
  if (!headers || !rawUtf8Headers) {
    return headers;
  }

  const rawHeaderNames = new Set(
    Object.keys(rawUtf8Headers).map((header) => header.toLowerCase()),
  );

  if (typeof Headers !== "undefined" && headers instanceof Headers) {
    return Array.from(headers.entries()).filter(
      ([name]) => !rawHeaderNames.has(name.toLowerCase()),
    );
  }

  if (Array.isArray(headers)) {
    return headers
      .filter(
        (entry): entry is [string, string] =>
          Array.isArray(entry) &&
          entry.length >= 2 &&
          !rawHeaderNames.has(String(entry[0]).toLowerCase()),
      )
      .map<[string, string]>(([key, value]) => [String(key), String(value)]);
  }

  const filtered: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined || value === null) {
      continue;
    }
    if (rawHeaderNames.has(key.toLowerCase())) {
      continue;
    }
    filtered[key] = String(value);
  }
  return filtered;
};

const encodeUtf8HeaderValueForNode = (value: string) =>
  Buffer.from(value, "utf8").toString("latin1");

const normalizeRequestHeaders = (
  input: Parameters<typeof fetch>[0],
  initHeaders: HeadersInit | undefined,
  rawUtf8Headers: Record<string, string> | undefined,
) => {
  const headers: Record<string, string> = {};
  if (isRequestInput(input)) {
    appendHeadersToRecord(headers, input.headers);
  }
  appendHeadersToRecord(
    headers,
    omitRawUtf8Headers(initHeaders, rawUtf8Headers),
  );
  if (rawUtf8Headers) {
    for (const [key, value] of Object.entries(rawUtf8Headers)) {
      headers[key] = encodeUtf8HeaderValueForNode(value);
    }
  }
  return headers;
};

export const nodeFetch = async (
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
): Promise<Response> => {
  const sanitizedInit = sanitizeFetchInit(init) as RawUtf8FetchInit | undefined;
  const rawUtf8Headers = normalizeRawUtf8Headers(sanitizedInit);
  const method = normalizeMethod(input, sanitizedInit);
  const signal = resolveAbortSignal(input, sanitizedInit);
  const urlText = normalizeUrl(input);
  if (urlText.length > NODE_FETCH_MAX_URL_CHARACTERS) {
    throw new Error("nodeFetch URL exceeds its first-release length limit.");
  }
  const url = new URL(urlText);

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("nodeFetch only supports http and https URLs.");
  }
  if (url.username || url.password) {
    throw new Error("nodeFetch URLs must not include credentials.");
  }
  if (url.hash) {
    throw new Error("nodeFetch URLs must not include fragments.");
  }
  if (url.protocol === "http:" && !isLoopbackEndpointUrl(url)) {
    throw new Error("nodeFetch requires HTTPS for non-loopback URLs.");
  }

  const body = await readRequestBody(input, sanitizedInit, method, signal);
  if (body && body.byteLength > NODE_FETCH_MAX_BODY_BYTES) {
    throw new Error(
      `nodeFetch request body exceeds ${NODE_FETCH_MAX_BODY_BYTES} bytes.`,
    );
  }
  const headers = normalizeRequestHeaders(
    input,
    sanitizedInit?.headers,
    rawUtf8Headers,
  );
  for (const key of Object.keys(headers)) {
    if (FORBIDDEN_REQUEST_HEADERS.has(key.toLowerCase())) {
      delete headers[key];
    }
  }
  if (body) {
    headers["content-length"] = String(body.byteLength);
  }

  return await new Promise<Response>((resolve, reject) => {
    const transport = url.protocol === "https:" ? https.request : http.request;
    let settled = false;
    let deadline: ReturnType<typeof setTimeout> | null = null;

    const clearDeadline = () => {
      if (deadline !== null) {
        clearTimeout(deadline);
        deadline = null;
      }
    };

    const finishResolve = (response: Response) => {
      if (settled) {
        return;
      }
      settled = true;
      clearDeadline();
      resolve(response);
    };

    const finishReject = (error: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      clearDeadline();
      reject(error);
    };

    const nodeRequest = transport(
      url,
      {
        method,
        headers,
      },
      (response) => {
        const chunks: Buffer[] = [];
        let responseBodyBytes = 0;
        response.on("error", finishReject);

        const declaredLength = response.headers["content-length"];
        const declaredLengthText = Array.isArray(declaredLength)
          ? declaredLength[0]
          : declaredLength;
        if (
          declaredLengthText &&
          /^\d+$/u.test(declaredLengthText) &&
          Number(declaredLengthText) > NODE_FETCH_MAX_BODY_BYTES
        ) {
          const error = new Error(
            `nodeFetch response body exceeds ${NODE_FETCH_MAX_BODY_BYTES} bytes.`,
          );
          finishReject(error);
          response.destroy(error);
          return;
        }

        response.on("data", (chunk) => {
          const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          responseBodyBytes += bytes.byteLength;
          if (responseBodyBytes > NODE_FETCH_MAX_BODY_BYTES) {
            const error = new Error(
              `nodeFetch response body exceeds ${NODE_FETCH_MAX_BODY_BYTES} bytes.`,
            );
            finishReject(error);
            response.destroy(error);
            return;
          }
          chunks.push(bytes);
        });
        response.on("end", () => {
          const status = response.statusCode ?? 500;
          const responseBody =
            method === "HEAD" ||
            status === 204 ||
            status === 205 ||
            status === 304
              ? null
              : Buffer.concat(chunks);
          finishResolve(
            new Response(responseBody, {
              status,
              statusText: response.statusMessage ?? "",
              headers: normalizeResponseHeaders(response.headers),
            }),
          );
        });
      },
    );

    nodeRequest.on("error", finishReject);
    nodeRequest.setTimeout(NODE_FETCH_TIMEOUT_MS, () => {
      const error = new Error(
        `nodeFetch socket was idle for ${NODE_FETCH_TIMEOUT_MS} ms.`,
      );
      finishReject(error);
      nodeRequest.destroy(error);
    });
    deadline = setTimeout(() => {
      const error = new Error(
        `nodeFetch exceeded its ${NODE_FETCH_TIMEOUT_MS} ms deadline.`,
      );
      finishReject(error);
      nodeRequest.destroy(error);
    }, NODE_FETCH_TIMEOUT_MS);
    deadline.unref?.();

    const abortSignal = signal;
    const onAbort = () => {
      nodeRequest.destroy(createAbortError());
    };

    if (abortSignal?.aborted) {
      onAbort();
      return;
    }

    abortSignal?.addEventListener("abort", onAbort, { once: true });
    nodeRequest.on("close", () => {
      abortSignal?.removeEventListener("abort", onAbort);
    });

    nodeRequest.end(body ?? undefined);
  });
};

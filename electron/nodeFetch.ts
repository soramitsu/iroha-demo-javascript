import * as http from "node:http";
import * as https from "node:https";
import type { IncomingHttpHeaders } from "node:http";
import { sanitizeFetchInit } from "./preload-utils";

const RAW_UTF8_HEADERS_INIT_KEY = "__irohaRawUtf8Headers";
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

const normalizeBodyBuffer = async (body: unknown): Promise<Buffer | null> => {
  if (body == null) {
    return null;
  }
  if (Buffer.isBuffer(body)) {
    return body;
  }
  if (typeof body === "string") {
    return Buffer.from(body);
  }
  if (body instanceof ArrayBuffer) {
    return Buffer.from(body);
  }
  if (ArrayBuffer.isView(body)) {
    return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
  }
  if (
    typeof URLSearchParams !== "undefined" &&
    body instanceof URLSearchParams
  ) {
    return Buffer.from(body.toString());
  }
  if (typeof Blob !== "undefined" && body instanceof Blob) {
    return Buffer.from(await body.arrayBuffer());
  }
  if (typeof ReadableStream !== "undefined" && body instanceof ReadableStream) {
    throw new Error(
      "nodeFetch does not support ReadableStream request bodies.",
    );
  }
  return Buffer.from(String(body));
};

const readRequestBody = async (
  input: Parameters<typeof fetch>[0],
  init: RequestInit | undefined,
  method: string,
) => {
  if (method === "GET" || method === "HEAD") {
    return null;
  }
  if (init && "body" in init) {
    return normalizeBodyBuffer(init.body);
  }
  if (isRequestInput(input)) {
    return normalizeBodyBuffer(await input.clone().arrayBuffer());
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
  const url = new URL(normalizeUrl(input));

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("nodeFetch only supports http and https URLs.");
  }

  const body = await readRequestBody(input, sanitizedInit, method);
  const headers = normalizeRequestHeaders(
    input,
    sanitizedInit?.headers,
    rawUtf8Headers,
  );
  if (
    body &&
    !Object.keys(headers).some((key) => key.toLowerCase() === "content-length")
  ) {
    headers["content-length"] = String(body.byteLength);
  }

  return await new Promise<Response>((resolve, reject) => {
    const transport = url.protocol === "https:" ? https.request : http.request;
    let settled = false;

    const finishResolve = (response: Response) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(response);
    };

    const finishReject = (error: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
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

        response.on("data", (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        response.on("error", finishReject);
        response.on("end", () => {
          finishResolve(
            new Response(Buffer.concat(chunks), {
              status: response.statusCode ?? 500,
              statusText: response.statusMessage ?? "",
              headers: normalizeResponseHeaders(response.headers),
            }),
          );
        });
      },
    );

    nodeRequest.on("error", finishReject);

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

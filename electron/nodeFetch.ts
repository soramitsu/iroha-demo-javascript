import * as http from "node:http";
import * as https from "node:https";
import type { IncomingHttpHeaders } from "node:http";
import { sanitizeFetchInit } from "./preload-utils";

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

const readRequestBody = async (request: Request) => {
  if (request.method === "GET" || request.method === "HEAD") {
    return null;
  }
  const body = await request.arrayBuffer();
  return Buffer.from(body);
};

export const nodeFetch = async (
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
): Promise<Response> => {
  const request = new Request(input, sanitizeFetchInit(init));
  const url = new URL(request.url);

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("nodeFetch only supports http and https URLs.");
  }

  const body = await readRequestBody(request);
  const headers = new Headers(request.headers);
  if (body && !headers.has("content-length")) {
    headers.set("content-length", String(body.byteLength));
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
        method: request.method,
        headers: Object.fromEntries(headers.entries()),
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

    const abortSignal = request.signal;
    const onAbort = () => {
      nodeRequest.destroy(createAbortError());
    };

    if (abortSignal.aborted) {
      onAbort();
      return;
    }

    abortSignal.addEventListener("abort", onAbort, { once: true });
    nodeRequest.on("close", () => {
      abortSignal.removeEventListener("abort", onAbort);
    });

    nodeRequest.end(body ?? undefined);
  });
};

import * as http from "node:http";
import * as https from "node:https";
import type { IncomingMessage } from "node:http";

import { isLoopbackEndpointUrl } from "../src/utils/endpoint";
import { parseStrictJson } from "./secureBoundedJson";

export const FIRST_RELEASE_SSE_EVENT_MAX_BYTES = 256 * 1024;
const FIRST_RELEASE_SSE_LINE_MAX_BYTES = 64 * 1024;
const FIRST_RELEASE_SSE_IDLE_TIMEOUT_MS = 120_000;
const EVENT_STREAM_CONTENT_TYPE = /^text\/event-stream(?:\s*;|$)/iu;

type FirstReleaseSseOptions = Readonly<{
  url: string;
  signal?: AbortSignal;
  headers?: Readonly<Record<string, string>>;
  maximumEventBytes?: number;
}>;

const createAbortError = (): Error => {
  const error = new Error("The event stream was aborted.");
  error.name = "AbortError";
  return error;
};

const validateStreamUrl = (literal: string): URL => {
  const url = new URL(literal);
  if (url.username || url.password || url.hash) {
    throw new Error(
      "Event stream URLs must not contain credentials or fragments.",
    );
  }
  if (
    url.protocol !== "https:" &&
    !(url.protocol === "http:" && isLoopbackEndpointUrl(url))
  ) {
    throw new Error("Event streams require HTTPS outside loopback.");
  }
  return url;
};

const openEventStream = (
  url: URL,
  options: FirstReleaseSseOptions,
): Promise<IncomingMessage> =>
  new Promise((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(createAbortError());
      return;
    }
    const transport = url.protocol === "https:" ? https : http;
    const request = transport.request(
      url,
      {
        method: "GET",
        headers: {
          Accept: "text/event-stream",
          "Cache-Control": "no-cache",
          ...(options.headers ?? {}),
        },
      },
      (response) => {
        if (response.statusCode !== 200) {
          const status = response.statusCode ?? 500;
          response.resume();
          reject(
            new Error(`Event stream request failed with status ${status}.`),
          );
          return;
        }
        const contentType = String(response.headers["content-type"] ?? "");
        if (!EVENT_STREAM_CONTENT_TYPE.test(contentType)) {
          response.resume();
          reject(new Error("Event stream did not return text/event-stream."));
          return;
        }
        resolve(response);
      },
    );
    const onAbort = () => request.destroy(createAbortError());
    options.signal?.addEventListener("abort", onAbort, { once: true });
    request.once("close", () =>
      options.signal?.removeEventListener("abort", onAbort),
    );
    request.once("error", reject);
    request.setTimeout(FIRST_RELEASE_SSE_IDLE_TIMEOUT_MS, () => {
      request.destroy(new Error("Event stream timed out while idle."));
    });
    request.end();
  });

/**
 * Stream exact JSON SSE events without routing the response through the
 * buffering Node fetch shim. Each event is independently bounded and parsed
 * with duplicate-key detection before it crosses the preload boundary.
 */
export async function* streamFirstReleaseSseJson(
  options: FirstReleaseSseOptions,
): AsyncGenerator<unknown, void, unknown> {
  const maximumEventBytes =
    options.maximumEventBytes ?? FIRST_RELEASE_SSE_EVENT_MAX_BYTES;
  if (!Number.isSafeInteger(maximumEventBytes) || maximumEventBytes < 1) {
    throw new Error("Event stream byte limit is invalid.");
  }
  const response = await openEventStream(
    validateStreamUrl(options.url),
    options,
  );
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let pendingText = "";
  let dataLines: string[] = [];

  const appendLine = (line: string): string | null => {
    if (Buffer.byteLength(line, "utf8") > FIRST_RELEASE_SSE_LINE_MAX_BYTES) {
      throw new Error("Event stream line exceeds its byte limit.");
    }
    if (line === "") {
      if (dataLines.length === 0) return null;
      const data = dataLines.join("\n");
      dataLines = [];
      if (Buffer.byteLength(data, "utf8") > maximumEventBytes) {
        throw new Error("Event stream JSON exceeds its byte limit.");
      }
      return data;
    }
    if (line.startsWith(":")) return null;
    const separator = line.indexOf(":");
    const field = separator < 0 ? line : line.slice(0, separator);
    let value = separator < 0 ? "" : line.slice(separator + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "data") {
      dataLines.push(value);
      const currentBytes = Buffer.byteLength(dataLines.join("\n"), "utf8");
      if (currentBytes > maximumEventBytes) {
        throw new Error("Event stream JSON exceeds its byte limit.");
      }
      return null;
    }
    if (field === "event" || field === "id" || field === "retry") {
      if (Buffer.byteLength(value, "utf8") > 1024) {
        throw new Error(`Event stream ${field} field exceeds its byte limit.`);
      }
      return null;
    }
    throw new Error(`Event stream contains unsupported field ${field}.`);
  };

  try {
    for await (const chunk of response) {
      if (options.signal?.aborted) throw createAbortError();
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      pendingText += decoder.decode(bytes, { stream: true });
      if (
        Buffer.byteLength(pendingText, "utf8") >
        maximumEventBytes + FIRST_RELEASE_SSE_LINE_MAX_BYTES
      ) {
        throw new Error("Event stream buffer exceeds its byte limit.");
      }
      let newline = pendingText.indexOf("\n");
      while (newline >= 0) {
        const rawLine = pendingText.slice(0, newline);
        pendingText = pendingText.slice(newline + 1);
        const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
        const serialized = appendLine(line);
        if (serialized !== null) {
          yield parseStrictJson(serialized, "Event stream data");
        }
        newline = pendingText.indexOf("\n");
      }
    }
    pendingText += decoder.decode();
    if (pendingText) {
      const serialized = appendLine(
        pendingText.endsWith("\r") ? pendingText.slice(0, -1) : pendingText,
      );
      if (serialized !== null) {
        yield parseStrictJson(serialized, "Event stream data");
      }
    }
    const finalSerialized = appendLine("");
    if (finalSerialized !== null) {
      yield parseStrictJson(finalSerialized, "Event stream data");
    }
  } finally {
    response.destroy();
  }
}

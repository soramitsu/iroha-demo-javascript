import { describe, expect, it, vi } from "vitest";
import {
  parseRetryAfterMs,
  withBoundedHttpGetFetchRetry,
  withBoundedHttpGetRetry,
} from "../electron/httpReadRetry";

describe("bounded HTTP GET retry", () => {
  it("honors delta-seconds and HTTP-date Retry-After values", () => {
    expect(parseRetryAfterMs("1", 1_000)).toBe(1_000);
    expect(parseRetryAfterMs("Thu, 01 Jan 1970 00:00:03 GMT", 1_000)).toBe(
      2_000,
    );
    expect(parseRetryAfterMs("not-a-delay", 1_000)).toBeNull();
  });

  it("retries a rate-limited read and returns the real response", async () => {
    const rateLimited = Object.assign(new Error("rate limited"), {
      status: 429,
      retryAfterMs: 1_000,
    });
    const request = vi
      .fn<() => Promise<{ is_citizen: boolean }>>()
      .mockRejectedValueOnce(rateLimited)
      .mockResolvedValueOnce({ is_citizen: true });
    const wait = vi.fn(async () => {});

    await expect(withBoundedHttpGetRetry(request, { wait })).resolves.toEqual({
      is_citizen: true,
    });
    expect(request).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledWith(1_000, undefined);
  });

  it("stops after the bounded attempt count", async () => {
    const rateLimited = Object.assign(new Error("temporarily banned"), {
      status: 429,
      retryAfterMs: 1_000,
    });
    const request = vi
      .fn<() => Promise<never>>()
      .mockRejectedValue(rateLimited);
    const wait = vi.fn(async () => {});

    await expect(
      withBoundedHttpGetRetry(request, { maxAttempts: 3, wait }),
    ).rejects.toBe(rateLimited);
    expect(request).toHaveBeenCalledTimes(3);
    expect(wait).toHaveBeenCalledTimes(2);
  });

  it("uses the fallback delay when Retry-After is absent", async () => {
    const rateLimited = Object.assign(new Error("rate limited"), {
      status: 429,
      retryAfterMs: null,
    });
    const request = vi
      .fn<() => Promise<{ is_citizen: boolean }>>()
      .mockRejectedValueOnce(rateLimited)
      .mockResolvedValueOnce({ is_citizen: true });
    const wait = vi.fn(async () => {});

    await expect(withBoundedHttpGetRetry(request, { wait })).resolves.toEqual({
      is_citizen: true,
    });
    expect(wait).toHaveBeenCalledWith(1_000, undefined);
  });

  it("does not retry non-rate-limit failures", async () => {
    const badRequest = Object.assign(new Error("bad request"), {
      status: 400,
      retryAfterMs: null,
    });
    const request = vi.fn<() => Promise<never>>().mockRejectedValue(badRequest);
    const wait = vi.fn(async () => {});

    await expect(withBoundedHttpGetRetry(request, { wait })).rejects.toBe(
      badRequest,
    );
    expect(request).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
  });

  it("aborts during the retry wait without issuing another read", async () => {
    const controller = new AbortController();
    const rateLimited = Object.assign(new Error("rate limited"), {
      status: 429,
      retryAfterMs: 1_000,
    });
    const request = vi
      .fn<() => Promise<never>>()
      .mockRejectedValue(rateLimited);
    const wait = vi.fn(async (_delayMs: number, signal?: AbortSignal) => {
      controller.abort(new Error("context changed"));
      throw signal?.reason;
    });

    await expect(
      withBoundedHttpGetRetry(request, {
        signal: controller.signal,
        wait,
      }),
    ).rejects.toThrow("context changed");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("retries GET fetches but never replays a write", async () => {
    const readFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response("rate limited", {
          status: 429,
          headers: { "Retry-After": "0" },
        }),
      )
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));

    const response = await withBoundedHttpGetFetchRetry(
      readFetch,
      "https://torii.example/v1/vpn/profile",
      { method: "GET" },
    );
    expect(response.status).toBe(200);
    expect(readFetch).toHaveBeenCalledTimes(2);

    const writeFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("rate limited", { status: 429 }));
    const writeResponse = await withBoundedHttpGetFetchRetry(
      writeFetch,
      "https://torii.example/v1/vpn/sessions",
      { method: "POST", body: "{}" },
    );
    expect(writeResponse.status).toBe(429);
    expect(writeFetch).toHaveBeenCalledTimes(1);
  });
});

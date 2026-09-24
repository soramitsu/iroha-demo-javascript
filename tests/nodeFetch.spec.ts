import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const httpRequestMock = vi.fn();
const httpsRequestMock = vi.fn();

vi.mock("node:http", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:http")>();
  return {
    ...actual,
    default: actual,
    request: httpRequestMock,
  };
});

vi.mock("node:https", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:https")>();
  return {
    ...actual,
    default: actual,
    request: httpsRequestMock,
  };
});

type MockRequest = EventEmitter & {
  end: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  setTimeout: ReturnType<typeof vi.fn>;
};

type MockResponse = EventEmitter & {
  statusCode: number;
  statusMessage: string;
  headers: Record<string, string | string[] | undefined>;
  destroy: ReturnType<typeof vi.fn>;
};

const createMockRequest = (): MockRequest => {
  const request = new EventEmitter() as MockRequest;
  request.end = vi.fn();
  request.destroy = vi.fn((error?: unknown) => {
    if (error) {
      request.emit("error", error);
    }
    request.emit("close");
  });
  request.setTimeout = vi.fn();
  return request;
};

const createMockResponse = (input: {
  statusCode: number;
  statusMessage: string;
  headers?: Record<string, string | string[] | undefined>;
}) => {
  const response = new EventEmitter() as MockResponse;
  response.statusCode = input.statusCode;
  response.statusMessage = input.statusMessage;
  response.headers = input.headers ?? {};
  response.destroy = vi.fn((error?: unknown) => {
    if (error) {
      response.emit("error", error);
    }
  });
  return response;
};

describe("nodeFetch", () => {
  beforeEach(() => {
    httpRequestMock.mockReset();
    httpsRequestMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects plaintext transport to non-loopback hosts", async () => {
    const { nodeFetch } = await import("../electron/nodeFetch");

    await expect(nodeFetch("http://torii.example/health")).rejects.toThrow(
      "requires HTTPS for non-loopback URLs",
    );
    expect(httpRequestMock).not.toHaveBeenCalled();
  });

  it("rejects URL credentials and fragments before opening a socket", async () => {
    const { nodeFetch } = await import("../electron/nodeFetch");

    await expect(
      nodeFetch("https://user:secret@torii.example/health"),
    ).rejects.toThrow("must not include credentials");
    await expect(
      nodeFetch("https://torii.example/health#unexpected"),
    ).rejects.toThrow("must not include fragments");
    expect(httpsRequestMock).not.toHaveBeenCalled();
  });

  it("rejects oversized URLs before parsing or opening a socket", async () => {
    const { NODE_FETCH_MAX_URL_CHARACTERS, nodeFetch } = await import(
      "../electron/nodeFetch"
    );

    await expect(
      nodeFetch(
        `https://torii.example/${"a".repeat(NODE_FETCH_MAX_URL_CHARACTERS)}`,
      ),
    ).rejects.toThrow("URL exceeds its first-release length limit");
    expect(httpsRequestMock).not.toHaveBeenCalled();
  });

  it("performs GET requests and returns JSON responses", async () => {
    httpRequestMock.mockImplementation(
      (
        _url: URL,
        _options: unknown,
        callback: (response: MockResponse) => void,
      ) => {
        const request = createMockRequest();
        const response = createMockResponse({
          statusCode: 200,
          statusMessage: "OK",
          headers: {
            "content-type": "application/json",
          },
        });
        queueMicrotask(() => {
          callback(response);
          queueMicrotask(() => {
            response.emit(
              "data",
              Buffer.from(JSON.stringify({ status: "ok" })),
            );
            response.emit("end");
            request.emit("close");
          });
        });
        return request;
      },
    );

    const { nodeFetch } = await import("../electron/nodeFetch");
    const response = await nodeFetch("http://127.0.0.1/health", {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    expect(response.ok).toBe(true);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
    expect(httpRequestMock).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        method: "GET",
      }),
      expect.any(Function),
    );
  });

  it("sends POST bodies and request headers over Node HTTP", async () => {
    const request = createMockRequest();
    httpRequestMock.mockImplementation(
      (
        _url: URL,
        _options: unknown,
        callback: (response: MockResponse) => void,
      ) => {
        const response = createMockResponse({
          statusCode: 201,
          statusMessage: "Created",
          headers: {
            "content-type": "application/json",
          },
        });
        queueMicrotask(() => {
          callback(response);
          queueMicrotask(() => {
            response.emit("data", Buffer.from(JSON.stringify({ ok: true })));
            response.emit("end");
            request.emit("close");
          });
        });
        return request;
      },
    );

    const { nodeFetch } = await import("../electron/nodeFetch");
    const response = await nodeFetch("http://127.0.0.1/submit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ hello: "world" }),
    });

    expect(response.status).toBe(201);
    expect(request.end).toHaveBeenCalledWith(
      Buffer.from('{"hello":"world"}', "utf8"),
    );
    const [url, options, callback] = httpRequestMock.mock.calls[0] ?? [];
    expect(String(url)).toBe("http://127.0.0.1/submit");
    expect(options).toMatchObject({
      method: "POST",
      headers: {
        "content-length": "17",
        "Content-Type": "application/json",
      },
    });
    expect(callback).toEqual(expect.any(Function));
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("replaces caller-supplied framing headers with the exact body length", async () => {
    const request = createMockRequest();
    httpRequestMock.mockImplementation(
      (
        _url: URL,
        _options: unknown,
        callback: (response: MockResponse) => void,
      ) => {
        const response = createMockResponse({
          statusCode: 204,
          statusMessage: "No Content",
        });
        queueMicrotask(() => {
          callback(response);
          queueMicrotask(() => response.emit("end"));
        });
        return request;
      },
    );

    const { nodeFetch } = await import("../electron/nodeFetch");
    await nodeFetch("http://127.0.0.1/submit", {
      method: "POST",
      headers: {
        Host: "internal.invalid",
        "Content-Length": "999999",
        "Transfer-Encoding": "chunked",
      },
      body: "safe",
    });

    const [, options] = httpRequestMock.mock.calls[0] ?? [];
    expect(options).toMatchObject({
      headers: { "content-length": "4" },
    });
    expect(options.headers).not.toHaveProperty("Host");
    expect(options.headers).not.toHaveProperty("Content-Length");
    expect(options.headers).not.toHaveProperty("Transfer-Encoding");
  });

  it("rejects oversized responses before buffering their body", async () => {
    const request = createMockRequest();
    const { NODE_FETCH_MAX_BODY_BYTES, nodeFetch } = await import(
      "../electron/nodeFetch"
    );
    const response = createMockResponse({
      statusCode: 200,
      statusMessage: "OK",
      headers: { "content-length": String(NODE_FETCH_MAX_BODY_BYTES + 1) },
    });
    httpRequestMock.mockImplementation(
      (
        _url: URL,
        _options: unknown,
        callback: (value: MockResponse) => void,
      ) => {
        queueMicrotask(() => callback(response));
        return request;
      },
    );

    await expect(nodeFetch("http://127.0.0.1/oversized")).rejects.toThrow(
      "nodeFetch response body exceeds",
    );
    expect(response.destroy).toHaveBeenCalled();
  });

  it("rejects oversized Blob request bodies before copying or opening a socket", async () => {
    const { NODE_FETCH_MAX_BODY_BYTES, nodeFetch } = await import(
      "../electron/nodeFetch"
    );
    const oversized = new Blob([new Uint8Array(NODE_FETCH_MAX_BODY_BYTES + 1)]);

    await expect(
      nodeFetch("http://127.0.0.1/oversized-request", {
        method: "POST",
        body: oversized,
      }),
    ).rejects.toThrow("nodeFetch request body exceeds");
    expect(httpRequestMock).not.toHaveBeenCalled();
  });

  it("rejects oversized strings and unsupported body types before opening a socket", async () => {
    const { NODE_FETCH_MAX_BODY_BYTES, nodeFetch } = await import(
      "../electron/nodeFetch"
    );

    await expect(
      nodeFetch("http://127.0.0.1/oversized-string", {
        method: "POST",
        body: "x".repeat(NODE_FETCH_MAX_BODY_BYTES + 1),
      }),
    ).rejects.toThrow("nodeFetch request body exceeds");
    await expect(
      nodeFetch("http://127.0.0.1/unsupported-body", {
        method: "POST",
        body: { compatibility: "forbidden" } as never,
      }),
    ).rejects.toThrow("unsupported request body type");
    expect(httpRequestMock).not.toHaveBeenCalled();
  });

  it("bounds Request-object bodies while reading instead of copying them first", async () => {
    const { NODE_FETCH_MAX_BODY_BYTES, nodeFetch } = await import(
      "../electron/nodeFetch"
    );
    const request = new Request("http://127.0.0.1/oversized-request-object", {
      method: "POST",
      body: new Uint8Array(NODE_FETCH_MAX_BODY_BYTES + 1),
    });
    const arrayBufferSpy = vi.spyOn(Request.prototype, "arrayBuffer");

    await expect(nodeFetch(request)).rejects.toThrow(
      "nodeFetch request body exceeds",
    );
    expect(arrayBufferSpy).not.toHaveBeenCalled();
    expect(httpRequestMock).not.toHaveBeenCalled();
  });

  it("can abort while a Request-object body stream is still being read", async () => {
    const { nodeFetch } = await import("../electron/nodeFetch");
    const stream = new ReadableStream<Uint8Array>({
      pull() {
        // Leave the body pending until the caller aborts it.
      },
    });
    const request = new Request("http://127.0.0.1/pending-request-object", {
      method: "POST",
      body: stream,
      duplex: "half",
    } as RequestInit);
    const controller = new AbortController();
    const pending = nodeFetch(request, { signal: controller.signal });

    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(httpRequestMock).not.toHaveBeenCalled();
  });

  it("encodes account IDs in JSON request bodies as UTF-8 bytes", async () => {
    const request = createMockRequest();
    httpRequestMock.mockImplementation(
      (
        _url: URL,
        _options: unknown,
        callback: (response: MockResponse) => void,
      ) => {
        const response = createMockResponse({
          statusCode: 200,
          statusMessage: "OK",
          headers: {
            "content-type": "application/json",
          },
        });
        queueMicrotask(() => {
          callback(response);
          queueMicrotask(() => {
            response.emit("data", Buffer.from(JSON.stringify({ ok: true })));
            response.emit("end");
            request.emit("close");
          });
        });
        return request;
      },
    );

    const accountId = "testuロ1NtルaFbdカ";
    const body = JSON.stringify({ account_id: accountId });
    const { nodeFetch } = await import("../electron/nodeFetch");
    const response = await nodeFetch("http://127.0.0.1/onboard", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body,
    });

    expect(response.ok).toBe(true);
    expect(request.end).toHaveBeenCalledWith(Buffer.from(body, "utf8"));
    expect(httpRequestMock).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        headers: expect.objectContaining({
          "content-length": String(Buffer.from(body, "utf8").length),
        }),
      }),
      expect.any(Function),
    );
  });

  it("supports abort signals", async () => {
    const request = createMockRequest();
    httpRequestMock.mockReturnValue(request);

    const { nodeFetch } = await import("../electron/nodeFetch");
    const controller = new AbortController();
    const promise = nodeFetch("http://127.0.0.1/slow", {
      signal: controller.signal,
    });

    controller.abort();

    await expect(promise).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(request.destroy).toHaveBeenCalled();
  });

  it("enforces a wall-clock deadline even when a peer could keep the socket active", async () => {
    vi.useFakeTimers();
    try {
      const request = createMockRequest();
      httpRequestMock.mockReturnValue(request);
      const { NODE_FETCH_TIMEOUT_MS, nodeFetch } = await import(
        "../electron/nodeFetch"
      );
      const pending = nodeFetch("http://127.0.0.1/drip");
      const rejection = expect(pending).rejects.toThrow(
        `exceeded its ${NODE_FETCH_TIMEOUT_MS} ms deadline`,
      );

      await vi.advanceTimersByTimeAsync(NODE_FETCH_TIMEOUT_MS);

      await rejection;
      expect(request.destroy).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("encodes raw UTF-8 headers for Node transport without passing them through Request", async () => {
    const request = createMockRequest();
    httpRequestMock.mockImplementation(
      (
        _url: URL,
        _options: unknown,
        callback: (response: MockResponse) => void,
      ) => {
        const response = createMockResponse({
          statusCode: 200,
          statusMessage: "OK",
          headers: {
            "content-type": "application/json",
          },
        });
        queueMicrotask(() => {
          callback(response);
          queueMicrotask(() => {
            response.emit("data", Buffer.from(JSON.stringify({ ok: true })));
            response.emit("end");
            request.emit("close");
          });
        });
        return request;
      },
    );

    const { nodeFetch } = await import("../electron/nodeFetch");
    expect(
      (
        nodeFetch as typeof nodeFetch & {
          __irohaSupportsRawUtf8Headers?: boolean;
        }
      ).__irohaSupportsRawUtf8Headers,
    ).not.toBe(true);
    const accountId = "testuロ1NtルaFbdカ";
    const response = await nodeFetch("http://127.0.0.1/v1/vpn/profile", {
      method: "GET",
      headers: {
        "X-Iroha-Account": accountId,
        Accept: "application/json",
      },
      __irohaRawUtf8Headers: {
        "X-Iroha-Account": accountId,
      },
    } as RequestInit & {
      __irohaRawUtf8Headers: Record<string, string>;
    });

    expect(response.ok).toBe(true);
    const [url, options, callback] = httpRequestMock.mock.calls[0] ?? [];
    expect(String(url)).toBe("http://127.0.0.1/v1/vpn/profile");
    expect(options).toMatchObject({
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-Iroha-Account": Buffer.from(accountId, "utf8").toString("latin1"),
      },
    });
    expect(callback).toEqual(expect.any(Function));
  });

  it("supports Request inputs without reconstructing them through WHATWG fetch", async () => {
    const request = createMockRequest();
    httpRequestMock.mockImplementation(
      (
        _url: URL,
        _options: unknown,
        callback: (response: MockResponse) => void,
      ) => {
        const response = createMockResponse({
          statusCode: 202,
          statusMessage: "Accepted",
          headers: {
            "content-type": "application/json",
          },
        });
        queueMicrotask(() => {
          callback(response);
          queueMicrotask(() => {
            response.emit("data", Buffer.from(JSON.stringify({ ok: true })));
            response.emit("end");
            request.emit("close");
          });
        });
        return request;
      },
    );

    const { nodeFetch } = await import("../electron/nodeFetch");
    const input = new Request("http://127.0.0.1/v1/vpn/sessions", {
      method: "POST",
      headers: {
        Accept: "application/json",
      },
      body: JSON.stringify({ exit_class: "standard" }),
    });

    const response = await nodeFetch(input);

    expect(response.status).toBe(202);
    expect(request.end).toHaveBeenCalledWith(
      Buffer.from('{"exit_class":"standard"}', "utf8"),
    );
    expect(httpRequestMock).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          accept: "application/json",
          "content-length": "25",
        }),
      }),
      expect.any(Function),
    );
  });
});

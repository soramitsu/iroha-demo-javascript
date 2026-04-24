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
};

type MockResponse = EventEmitter & {
  statusCode: number;
  statusMessage: string;
  headers: Record<string, string | string[] | undefined>;
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
    const response = await nodeFetch("http://taira.sora.org/health", {
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
    const response = await nodeFetch("http://taira.sora.org/submit", {
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
    expect(String(url)).toBe("http://taira.sora.org/submit");
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
    const response = await nodeFetch("http://taira.sora.org/onboard", {
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
    const promise = nodeFetch("http://taira.sora.org/slow", {
      signal: controller.signal,
    });

    controller.abort();

    await expect(promise).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(request.destroy).toHaveBeenCalled();
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
    const response = await nodeFetch("http://taira.sora.org/v1/vpn/profile", {
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
    expect(String(url)).toBe("http://taira.sora.org/v1/vpn/profile");
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
    const input = new Request("http://taira.sora.org/v1/vpn/sessions", {
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

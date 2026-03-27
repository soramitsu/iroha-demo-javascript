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
    expect(httpRequestMock).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "content-length": "17",
          "content-type": "application/json",
        }),
      }),
      expect.any(Function),
    );
    await expect(response.json()).resolves.toEqual({ ok: true });
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
});

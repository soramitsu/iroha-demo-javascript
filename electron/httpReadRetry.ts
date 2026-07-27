const DEFAULT_RETRY_DELAY_MS = 1_000;
const MAX_RETRY_DELAY_MS = 10_000;
const DEFAULT_MAX_ATTEMPTS = 3;

type HttpReadError = {
  status?: unknown;
  retryAfterMs?: unknown;
};

type RetryWait = (delayMs: number, signal?: AbortSignal) => Promise<void>;
type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

const createAbortError = (signal?: AbortSignal) => {
  if (signal?.reason instanceof Error) {
    return signal.reason;
  }
  const error = new Error("The operation was aborted.");
  error.name = "AbortError";
  return error;
};

const defaultWait: RetryWait = (delayMs, signal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(createAbortError(signal));
      return;
    }
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const onAbort = () => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
      reject(createAbortError(signal));
    };
    timeoutId = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    signal?.addEventListener("abort", onAbort, { once: true });
  });

export const parseRetryAfterMs = (
  value: string | null | undefined,
  nowMs = Date.now(),
): number | null => {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return null;
  }
  const seconds = Number(normalized);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(
      MAX_RETRY_DELAY_MS,
      Math.max(0, Math.ceil(seconds * 1_000)),
    );
  }
  const retryAtMs = Date.parse(normalized);
  if (!Number.isFinite(retryAtMs)) {
    return null;
  }
  return Math.min(
    MAX_RETRY_DELAY_MS,
    Math.max(0, Math.ceil(retryAtMs - nowMs)),
  );
};

const retryDelayFromError = (error: unknown) => {
  if (!error || typeof error !== "object") {
    return null;
  }
  const candidate = error as HttpReadError;
  if (candidate.status !== 429) {
    return null;
  }
  if (candidate.retryAfterMs === null || candidate.retryAfterMs === undefined) {
    return DEFAULT_RETRY_DELAY_MS;
  }
  const retryAfterMs = Number(candidate.retryAfterMs);
  if (!Number.isFinite(retryAfterMs) || retryAfterMs < 0) {
    return DEFAULT_RETRY_DELAY_MS;
  }
  return Math.min(MAX_RETRY_DELAY_MS, Math.ceil(retryAfterMs));
};

export const withBoundedHttpGetRetry = async <T>(
  request: () => Promise<T>,
  options: {
    maxAttempts?: number;
    signal?: AbortSignal;
    wait?: RetryWait;
  } = {},
): Promise<T> => {
  const maxAttempts = Math.max(
    1,
    Math.floor(options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS),
  );
  const wait = options.wait ?? defaultWait;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await request();
    } catch (error) {
      const delayMs = retryDelayFromError(error);
      if (
        delayMs === null ||
        attempt === maxAttempts ||
        options.signal?.aborted
      ) {
        throw error;
      }
      await wait(delayMs, options.signal);
    }
  }
  throw new Error("HTTP GET retry loop exhausted unexpectedly.");
};

export const withBoundedHttpGetFetchRetry = async (
  fetchImpl: FetchLike,
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> => {
  const inputMethod =
    input &&
    typeof input === "object" &&
    "method" in input &&
    typeof input.method === "string"
      ? input.method
      : "GET";
  const method = String(init?.method ?? inputMethod)
    .trim()
    .toUpperCase();
  if (method !== "GET") {
    return fetchImpl(input, init);
  }
  return withBoundedHttpGetRetry(
    async () => {
      const response = await fetchImpl(input, init);
      if (response.status !== 429) {
        return response;
      }
      await response.body?.cancel().catch(() => {});
      throw Object.assign(new Error("HTTP GET was rate limited."), {
        status: 429,
        retryAfterMs: parseRetryAfterMs(response.headers.get("retry-after")),
      });
    },
    { signal: init?.signal ?? undefined },
  );
};

type FaucetRetryDelayInput = {
  queueSize?: number | null;
  commitTimeMs?: number | null;
  saturated?: boolean | null;
};

const BASE_RETRY_DELAY_MS = 2_000;
const MAX_RETRY_DELAY_MS = 20_000;
const MIN_SATURATED_DELAY_MS = 8_000;
const QUEUE_BUCKET_SIZE = 50;
const MAX_QUEUE_BUCKETS = 12;

const normalizeNonNegativeInteger = (value: unknown) => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.trunc(Number(value)));
};

export const computeFaucetClaimRetryDelayMs = (
  attempt: number,
  input: FaucetRetryDelayInput = {},
) => {
  const normalizedAttempt = Math.max(1, normalizeNonNegativeInteger(attempt));
  const baseDelayMs = Math.min(
    BASE_RETRY_DELAY_MS * 2 ** (normalizedAttempt - 1),
    MAX_RETRY_DELAY_MS,
  );
  if (!input.saturated) {
    return baseDelayMs;
  }

  const queueSize = normalizeNonNegativeInteger(input.queueSize);
  const queueBuckets = Math.min(
    Math.max(1, Math.ceil(queueSize / QUEUE_BUCKET_SIZE)),
    MAX_QUEUE_BUCKETS,
  );
  const commitTimeMs = Math.max(
    1_000,
    normalizeNonNegativeInteger(input.commitTimeMs),
  );
  const queueAwareDelayMs = Math.min(
    Math.max(queueBuckets * commitTimeMs, MIN_SATURATED_DELAY_MS),
    MAX_RETRY_DELAY_MS,
  );
  return Math.max(baseDelayMs, queueAwareDelayMs);
};

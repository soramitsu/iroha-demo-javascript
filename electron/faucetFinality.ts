export type FaucetCommittedHeightObservation = {
  ledgerHeight: number | null;
  sumeragiHeight: number | null;
};

type AssertFaucetCommittedHeightAdvancesInput = {
  initial: FaucetCommittedHeightObservation;
  observationWindowMs: number;
  observe: (signal?: AbortSignal) => Promise<FaucetCommittedHeightObservation>;
  wait: (delayMs: number, signal?: AbortSignal) => Promise<void>;
  signal?: AbortSignal;
};

const createAbortError = () => {
  const error = new Error("Faucet finality observation canceled.");
  error.name = "AbortError";
  return error;
};

const throwIfAborted = (signal?: AbortSignal) => {
  if (!signal?.aborted) {
    return;
  }
  throw signal.reason instanceof Error ? signal.reason : createAbortError();
};

const normalizedHeight = (value: number | null) =>
  value !== null && Number.isFinite(value) && value >= 0
    ? Math.trunc(value)
    : null;

const highestCommittedHeight = (
  observation: FaucetCommittedHeightObservation,
) => {
  const heights = [
    normalizedHeight(observation.ledgerHeight),
    normalizedHeight(observation.sumeragiHeight),
  ].filter((value): value is number => value !== null);
  return heights.length ? Math.max(...heights) : null;
};

export class FaucetCommittedHeightStalledError extends Error {
  readonly initial: FaucetCommittedHeightObservation;
  readonly latest: FaucetCommittedHeightObservation;

  constructor(
    initial: FaucetCommittedHeightObservation,
    latest: FaucetCommittedHeightObservation,
  ) {
    super("The committed block height did not advance.");
    this.name = "FaucetCommittedHeightStalledError";
    this.initial = initial;
    this.latest = latest;
  }
}

export const assertFaucetCommittedHeightAdvances = async ({
  initial,
  observationWindowMs,
  observe,
  wait,
  signal,
}: AssertFaucetCommittedHeightAdvancesInput) => {
  throwIfAborted(signal);

  const initialLedgerHeight = normalizedHeight(initial.ledgerHeight);
  const initialSumeragiHeight = normalizedHeight(initial.sumeragiHeight);
  if (
    initialLedgerHeight !== null &&
    initialSumeragiHeight !== null &&
    initialSumeragiHeight > initialLedgerHeight
  ) {
    return initial;
  }

  await wait(observationWindowMs, signal);
  throwIfAborted(signal);
  const latest = await observe(signal);
  throwIfAborted(signal);

  const initialHeight = highestCommittedHeight(initial);
  const latestHeight = highestCommittedHeight(latest);
  if (
    initialHeight === null ||
    latestHeight === null ||
    latestHeight <= initialHeight
  ) {
    throw new FaucetCommittedHeightStalledError(initial, latest);
  }
  return latest;
};

export const readSumeragiCommittedHeight = (
  payload: unknown,
): number | null => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const record = payload as Record<string, unknown>;
  const height = record.last_committed_height;
  if (
    record.protocol_version !== 4 ||
    typeof height !== "number" ||
    !Number.isSafeInteger(height) ||
    height < 0
  ) {
    return null;
  }
  return height;
};

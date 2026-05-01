import { normalizeCanonicalAccountIdLiteral } from "./accountAddress";
import { solveFaucetPowPuzzle, type FaucetPowPuzzle } from "./faucetPow";
import {
  normalizeAccountAssetListPayload,
  readApiErrorDetail,
} from "./preload-utils";

export type AccountFaucetResponse = {
  account_id: string;
  asset_definition_id: string;
  asset_id: string;
  amount: string;
  tx_hash_hex: string;
  status: string;
};

export type FaucetRequestPhase =
  | "requestingPuzzle"
  | "waitingForPuzzleRetry"
  | "solvingPuzzle"
  | "submittingClaim"
  | "waitingForClaimRetry"
  | "claimAccepted"
  | "waitingForCommit"
  | "claimCommitted";

export type FaucetRequestProgress = {
  phase: FaucetRequestPhase;
  attempt?: number;
  attempts?: number;
  txHashHex?: string;
};

type SolvedFaucetPow = Awaited<ReturnType<typeof solveFaucetPowPuzzle>>;

type RequestFaucetFundsWithPowInput = {
  baseUrl: string;
  accountId: string;
  networkPrefix?: number;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  sleep?: (delayMs: number, signal?: AbortSignal) => Promise<void>;
  solvePuzzle?: (
    accountId: string,
    puzzle: FaucetPowPuzzle,
    options?: { signal?: AbortSignal },
  ) => Promise<SolvedFaucetPow>;
  puzzleRetryAttempts?: number;
  puzzleRetryDelayMs?: number;
  onStatus?: (progress: FaucetRequestProgress) => void | Promise<void>;
};

const DEFAULT_PUZZLE_RETRY_ATTEMPTS = 8;
const DEFAULT_PUZZLE_RETRY_DELAY_MS = 750;
const PUZZLE_VRF_UNAVAILABLE_DETAIL = "faucet pow vrf seed unavailable";
const NORITO_CONTENT_TYPE = "application/x-norito";
const TAIRA_PUBLIC_HOST = "taira.sora.org";
const TAIRA_FAUCET_AUTHORITY =
  "testuﾛ1PﾉｳﾇmEｴWｵebHﾑ6ﾔﾙｲヰiwuCWErJ7uｽoPGｱﾔnjﾑKﾋTCW2PV";
const TAIRA_FAUCET_ASSET_DEFINITION_ID = "6TEAJqbb8oEPmLncoNiMRbLEK6tw";
const TAIRA_FAUCET_CLAIM_AMOUNT = "25000";

const createAbortError = () => {
  const error = new Error("Faucet request canceled.");
  error.name = "AbortError";
  return error;
};

const readAbortReason = (signal: AbortSignal) =>
  signal.reason instanceof Error ? signal.reason : createAbortError();

const throwIfAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) {
    throw readAbortReason(signal);
  }
};

const sleepFor = (delayMs: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(readAbortReason(signal));
      return;
    }
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let onAbort: (() => void) | null = null;
    const cleanup = () => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (onAbort) {
        signal?.removeEventListener("abort", onAbort);
      }
    };
    onAbort = () => {
      cleanup();
      reject(signal ? readAbortReason(signal) : createAbortError());
    };
    timeoutId = setTimeout(() => {
      cleanup();
      resolve();
    }, delayMs);
    signal?.addEventListener("abort", onAbort, { once: true });
  });

const emitStatus = async (
  onStatus: RequestFaucetFundsWithPowInput["onStatus"],
  progress: FaucetRequestProgress,
) => {
  if (!onStatus) {
    return;
  }
  try {
    await onStatus(progress);
  } catch {
    // Renderer-side status hooks must not break the faucet request itself.
  }
};

export const shouldRetryFaucetPuzzle = (status: number, detail: string) =>
  status === 403 &&
  detail.toLowerCase().includes(PUZZLE_VRF_UNAVAILABLE_DETAIL);

const readResponseHeader = (
  response: Pick<Response, "headers">,
  name: string,
) => response.headers.get(name)?.trim().toLowerCase() ?? "";

const isNoritoResponse = (response: Pick<Response, "headers">) =>
  readResponseHeader(response, "content-type").includes(NORITO_CONTENT_TYPE);

type DecimalParts = {
  sign: 1 | -1;
  units: bigint;
  scale: number;
};

const parseDecimalParts = (value: string): DecimalParts | null => {
  const trimmed = value.trim();
  const match = /^([+-])?(\d+)(?:\.(\d+))?$/.exec(trimmed);
  if (!match) {
    return null;
  }
  const [, rawSign, whole, fraction = ""] = match;
  const digits = `${whole}${fraction}`.replace(/^0+/, "") || "0";
  return {
    sign: rawSign === "-" ? -1 : 1,
    units: BigInt(digits),
    scale: fraction.length,
  };
};

export const isDecimalLessThan = (left: string, right: string): boolean => {
  const leftParts = parseDecimalParts(left);
  const rightParts = parseDecimalParts(right);
  if (!leftParts || !rightParts) {
    return false;
  }
  if (leftParts.sign !== rightParts.sign) {
    return leftParts.sign < rightParts.sign;
  }
  const scale = Math.max(leftParts.scale, rightParts.scale);
  const leftUnits =
    leftParts.units *
    10n ** BigInt(scale - leftParts.scale) *
    BigInt(leftParts.sign);
  const rightUnits =
    rightParts.units *
    10n ** BigInt(scale - rightParts.scale) *
    BigInt(rightParts.sign);
  return leftUnits < rightUnits;
};

const isKnownTairaPublicEndpoint = (baseUrl: string): boolean => {
  try {
    return new URL(baseUrl).hostname.toLowerCase() === TAIRA_PUBLIC_HOST;
  } catch {
    return false;
  }
};

const readKnownTairaFaucetBalance = async (
  baseUrl: string,
  fetchImpl: typeof fetch,
  signal?: AbortSignal,
): Promise<string | null> => {
  if (!isKnownTairaPublicEndpoint(baseUrl)) {
    return null;
  }
  try {
    throwIfAborted(signal);
    const response = await fetchImpl(
      `${baseUrl}/v1/accounts/${encodeURIComponent(TAIRA_FAUCET_AUTHORITY)}/assets`,
      {
        method: "GET",
        signal,
        headers: {
          Accept: "application/json",
        },
      },
    );
    throwIfAborted(signal);
    if (!response.ok) {
      return null;
    }
    const payload = normalizeAccountAssetListPayload(await response.json());
    const holding = payload.items.find((item) => {
      const assetDefinitionId = item.asset_definition_id?.trim() ?? "";
      return (
        assetDefinitionId === TAIRA_FAUCET_ASSET_DEFINITION_ID ||
        item.asset_id.startsWith(`${TAIRA_FAUCET_ASSET_DEFINITION_ID}#`)
      );
    });
    return holding?.quantity.trim() || null;
  } catch {
    throwIfAborted(signal);
    return null;
  }
};

const readKnownFaucetRejectionDetail = async (
  baseUrl: string,
  fetchImpl: typeof fetch,
  signal?: AbortSignal,
): Promise<string | null> => {
  const balance = await readKnownTairaFaucetBalance(baseUrl, fetchImpl, signal);
  if (!balance || !isDecimalLessThan(balance, TAIRA_FAUCET_CLAIM_AMOUNT)) {
    return null;
  }
  return `TAIRA faucet is out of funds. The faucet authority has ${balance} XOR available, but each claim requires ${TAIRA_FAUCET_CLAIM_AMOUNT} XOR. Ask a TAIRA operator to refill the faucet, then try again.`;
};

const buildFaucetRequestErrorMessage = (
  response: Pick<Response, "headers" | "status" | "statusText">,
  detail: string,
) => {
  if (detail) {
    return detail;
  }
  if (response.status === 400 && isNoritoResponse(response)) {
    return "The network rejected this faucet claim. This endpoint returned a generic validation error; possible causes include a depleted faucet, an ineligible account, or a stale proof challenge.";
  }
  return response.statusText || "Faucet request failed.";
};

export const requestFaucetFundsWithPuzzle = async ({
  baseUrl,
  accountId,
  networkPrefix,
  fetchImpl = fetch,
  signal,
  sleep = sleepFor,
  solvePuzzle = solveFaucetPowPuzzle,
  puzzleRetryAttempts = DEFAULT_PUZZLE_RETRY_ATTEMPTS,
  puzzleRetryDelayMs = DEFAULT_PUZZLE_RETRY_DELAY_MS,
  onStatus,
}: RequestFaucetFundsWithPowInput): Promise<AccountFaucetResponse> => {
  const normalizedAccountId = normalizeCanonicalAccountIdLiteral(
    accountId,
    "accountId",
    networkPrefix,
  );
  const retryAttempts = Math.max(1, Math.trunc(puzzleRetryAttempts));
  const retryDelayMs = Math.max(0, Math.trunc(puzzleRetryDelayMs));
  let puzzleStatus = 0;
  let puzzleStatusText = "";
  let puzzleDetail = "";

  for (let attempt = 1; attempt <= retryAttempts; attempt += 1) {
    throwIfAborted(signal);
    await emitStatus(onStatus, {
      phase: "requestingPuzzle",
      attempt,
      attempts: retryAttempts,
    });
    const puzzleResponse = await fetchImpl(
      `${baseUrl}/v1/accounts/faucet/puzzle`,
      {
        method: "GET",
        signal,
        headers: {
          Accept: "application/json",
        },
      },
    );
    throwIfAborted(signal);
    if (!puzzleResponse.ok) {
      puzzleStatus = puzzleResponse.status;
      puzzleStatusText = puzzleResponse.statusText;
      puzzleDetail = await readApiErrorDetail(puzzleResponse);
      if (
        attempt < retryAttempts &&
        shouldRetryFaucetPuzzle(puzzleStatus, puzzleDetail)
      ) {
        await emitStatus(onStatus, {
          phase: "waitingForPuzzleRetry",
          attempt,
          attempts: retryAttempts,
        });
        await (signal ? sleep(retryDelayMs, signal) : sleep(retryDelayMs));
        continue;
      }
      break;
    }

    const puzzle = (await puzzleResponse.json()) as FaucetPowPuzzle;
    throwIfAborted(signal);
    const powPayload =
      puzzle.difficulty_bits > 0
        ? (await emitStatus(onStatus, {
            phase: "solvingPuzzle",
            attempt,
            attempts: retryAttempts,
          }),
          await (signal
            ? solvePuzzle(normalizedAccountId, puzzle, { signal })
            : solvePuzzle(normalizedAccountId, puzzle)))
        : null;
    throwIfAborted(signal);
    await emitStatus(onStatus, {
      phase: "submittingClaim",
      attempt,
      attempts: retryAttempts,
    });
    const response = await fetchImpl(`${baseUrl}/v1/accounts/faucet`, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        account_id: normalizedAccountId,
        ...(powPayload
          ? {
              pow_anchor_height: powPayload.anchorHeight,
              pow_nonce_hex: powPayload.nonceHex,
            }
          : {}),
      }),
    });
    throwIfAborted(signal);
    if (!response.ok) {
      const detail = await readApiErrorDetail(response);
      const genericNoritoRejection =
        response.status === 400 && isNoritoResponse(response) && !detail;
      const diagnosticDetail = genericNoritoRejection
        ? await readKnownFaucetRejectionDetail(baseUrl, fetchImpl, signal)
        : null;
      const message =
        diagnosticDetail ?? buildFaucetRequestErrorMessage(response, detail);
      if (
        response.status === 400 &&
        !diagnosticDetail &&
        (genericNoritoRejection ||
          /stale faucet proof challenges|faucet pow anchor is stale/i.test(
            message,
          )) &&
        attempt < retryAttempts
      ) {
        await emitStatus(onStatus, {
          phase: "waitingForPuzzleRetry",
          attempt,
          attempts: retryAttempts,
        });
        await (signal ? sleep(retryDelayMs, signal) : sleep(retryDelayMs));
        continue;
      }
      throw new Error(`Faucet request failed (${response.status}): ${message}`);
    }
    const payload = (await response.json()) as AccountFaucetResponse;
    return payload;
  }

  const message = shouldRetryFaucetPuzzle(puzzleStatus, puzzleDetail)
    ? "Faucet puzzle is not ready yet because finalized VRF seed data is unavailable on this Torii endpoint. Please retry in a few seconds."
    : puzzleDetail || puzzleStatusText || "Faucet puzzle failed.";
  throw new Error(`Faucet puzzle failed (${puzzleStatus}): ${message}`);
};

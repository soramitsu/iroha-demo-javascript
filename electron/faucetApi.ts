import { normalizeCanonicalAccountIdLiteral } from "./accountAddress";
import { solveFaucetPowPuzzle, type FaucetPowPuzzle } from "./faucetPow";
import { readApiErrorDetail } from "./preload-utils";

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
  | "claimAccepted";

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
  sleep?: (delayMs: number) => Promise<void>;
  solvePuzzle?: (
    accountId: string,
    puzzle: FaucetPowPuzzle,
  ) => Promise<SolvedFaucetPow>;
  puzzleRetryAttempts?: number;
  puzzleRetryDelayMs?: number;
  onStatus?: (progress: FaucetRequestProgress) => void | Promise<void>;
};

const DEFAULT_PUZZLE_RETRY_ATTEMPTS = 8;
const DEFAULT_PUZZLE_RETRY_DELAY_MS = 750;
const PUZZLE_VRF_UNAVAILABLE_DETAIL = "faucet pow vrf seed unavailable";
const NORITO_CONTENT_TYPE = "application/x-norito";

const sleepFor = (delayMs: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
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

const buildFaucetRequestErrorMessage = (
  response: Pick<Response, "headers" | "status" | "statusText">,
  detail: string,
) => {
  if (detail) {
    return detail;
  }
  if (response.status === 400 && isNoritoResponse(response)) {
    return "TAIRA rejected this faucet claim. Repeated claims usually fail once the account already holds starter XOR, and stale faucet proof challenges can also trigger this response.";
  }
  return response.statusText || "Faucet request failed.";
};

export const requestFaucetFundsWithPuzzle = async ({
  baseUrl,
  accountId,
  networkPrefix,
  fetchImpl = fetch,
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
    await emitStatus(onStatus, {
      phase: "requestingPuzzle",
      attempt,
      attempts: retryAttempts,
    });
    const puzzleResponse = await fetchImpl(
      `${baseUrl}/v1/accounts/faucet/puzzle`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      },
    );
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
        await sleep(retryDelayMs);
        continue;
      }
      break;
    }

    const puzzle = (await puzzleResponse.json()) as FaucetPowPuzzle;
    const powPayload =
      puzzle.difficulty_bits > 0
        ? (await emitStatus(onStatus, {
            phase: "solvingPuzzle",
            attempt,
            attempts: retryAttempts,
          }),
          await solvePuzzle(normalizedAccountId, puzzle))
        : null;
    await emitStatus(onStatus, {
      phase: "submittingClaim",
      attempt,
      attempts: retryAttempts,
    });
    const response = await fetchImpl(`${baseUrl}/v1/accounts/faucet`, {
      method: "POST",
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
    if (!response.ok) {
      const detail = await readApiErrorDetail(response);
      const message = buildFaucetRequestErrorMessage(response, detail);
      throw new Error(`Faucet request failed (${response.status}): ${message}`);
    }
    const payload = (await response.json()) as AccountFaucetResponse;
    await emitStatus(onStatus, {
      phase: "claimAccepted",
      attempt,
      attempts: retryAttempts,
      txHashHex: payload.tx_hash_hex,
    });
    return payload;
  }

  const message = shouldRetryFaucetPuzzle(puzzleStatus, puzzleDetail)
    ? "Faucet puzzle is not ready yet because finalized VRF seed data is unavailable on this Torii endpoint. Please retry in a few seconds."
    : puzzleDetail || puzzleStatusText || "Faucet puzzle failed.";
  throw new Error(`Faucet puzzle failed (${puzzleStatus}): ${message}`);
};

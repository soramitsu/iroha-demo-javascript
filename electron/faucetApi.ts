import { normalizeAccountId } from "@iroha/iroha-js";
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

type SolvedFaucetPow = Awaited<ReturnType<typeof solveFaucetPowPuzzle>>;

type RequestFaucetFundsWithPowInput = {
  baseUrl: string;
  accountId: string;
  fetchImpl?: typeof fetch;
  sleep?: (delayMs: number) => Promise<void>;
  solvePuzzle?: (
    accountId: string,
    puzzle: FaucetPowPuzzle,
  ) => Promise<SolvedFaucetPow>;
  puzzleRetryAttempts?: number;
  puzzleRetryDelayMs?: number;
};

const DEFAULT_PUZZLE_RETRY_ATTEMPTS = 8;
const DEFAULT_PUZZLE_RETRY_DELAY_MS = 750;
const PUZZLE_VRF_UNAVAILABLE_DETAIL = "faucet pow vrf seed unavailable";

const sleepFor = (delayMs: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
  });

export const shouldRetryFaucetPuzzle = (status: number, detail: string) =>
  status === 403 &&
  detail.toLowerCase().includes(PUZZLE_VRF_UNAVAILABLE_DETAIL);

export const requestFaucetFundsWithPuzzle = async ({
  baseUrl,
  accountId,
  fetchImpl = fetch,
  sleep = sleepFor,
  solvePuzzle = solveFaucetPowPuzzle,
  puzzleRetryAttempts = DEFAULT_PUZZLE_RETRY_ATTEMPTS,
  puzzleRetryDelayMs = DEFAULT_PUZZLE_RETRY_DELAY_MS,
}: RequestFaucetFundsWithPowInput): Promise<AccountFaucetResponse> => {
  const normalizedAccountId = normalizeAccountId(accountId, "accountId");
  const retryAttempts = Math.max(1, Math.trunc(puzzleRetryAttempts));
  const retryDelayMs = Math.max(0, Math.trunc(puzzleRetryDelayMs));
  let puzzleStatus = 0;
  let puzzleStatusText = "";
  let puzzleDetail = "";

  for (let attempt = 1; attempt <= retryAttempts; attempt += 1) {
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
        await sleep(retryDelayMs);
        continue;
      }
      break;
    }

    const puzzle = (await puzzleResponse.json()) as FaucetPowPuzzle;
    const powPayload =
      puzzle.difficulty_bits > 0
        ? await solvePuzzle(normalizedAccountId, puzzle)
        : null;
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
      const message = detail || response.statusText || "Faucet request failed.";
      throw new Error(`Faucet request failed (${response.status}): ${message}`);
    }
    return (await response.json()) as AccountFaucetResponse;
  }

  const message = shouldRetryFaucetPuzzle(puzzleStatus, puzzleDetail)
    ? "Faucet puzzle is not ready yet because finalized VRF seed data is unavailable on this Torii endpoint. Please retry in a few seconds."
    : puzzleDetail || puzzleStatusText || "Faucet puzzle failed.";
  throw new Error(`Faucet puzzle failed (${puzzleStatus}): ${message}`);
};

import { normalizeAssetDefinitionId } from "@iroha/iroha-js";
import { normalizeCanonicalAccountIdLiteral } from "./accountAddress";
import { solveFaucetPowPuzzle, type FaucetPowPuzzle } from "./faucetPow";
import {
  normalizeAccountAssetListPayload,
  readApiErrorDetail,
} from "./preload-utils";
import type { TransactionFinalityProof } from "./transactionFinality";

export type AccountFaucetResponseDto = {
  account_id: string;
  asset_definition_id: string;
  asset_id: string;
  amount: string;
  tx_hash_hex: string;
  status: "QUEUED";
};

export type AccountFaucetResponse = Omit<AccountFaucetResponseDto, "status"> & {
  status: string;
  finality: TransactionFinalityProof;
  fee?: unknown;
};

const ACCOUNT_FAUCET_RESPONSE_KEYS = Object.freeze(
  [
    "account_id",
    "amount",
    "asset_definition_id",
    "asset_id",
    "status",
    "tx_hash_hex",
  ].sort(),
);
const MAX_QUANTITY_SCALE = 28;
const MAX_QUANTITY_MANTISSA = (1n << 511n) - 1n;

export type FaucetRequestPhase =
  | "requestingPuzzle"
  | "waitingForPuzzleRetry"
  | "solvingPuzzle"
  | "submittingClaim"
  | "waitingForClaimRetry"
  | "waitingForFinality"
  | "claimFinalized";

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
  chainId: string;
  networkPrefix: number;
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
const MINAMOTO_PUBLIC_HOST = "minamoto.sora.org";
const MINAMOTO_CHAIN_ID = "00000000-0000-0000-0000-000000000000";
const TAIRA_NETWORK_PREFIX = 369;
const MINAMOTO_NETWORK_PREFIX = 753;
const TAIRA_FAUCET_AUTHORITY =
  "testuﾛ1PﾉｳﾇmEｴWｵebHﾑ6ﾔﾙｲヰiwuCWErJ7uｽoPGｱﾔnjﾑKﾋTCW2PV";
const TAIRA_FAUCET_ASSET_DEFINITION_ID = "6TEAJqbb8oEPmLncoNiMRbLEK6tw";
const TAIRA_FAUCET_CLAIM_AMOUNT = "25000";

const exactFaucetResponseRecord = (value: unknown): Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Account faucet response must be an object.");
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (
    keys.length !== ACCOUNT_FAUCET_RESPONSE_KEYS.length ||
    keys.some((key, index) => key !== ACCOUNT_FAUCET_RESPONSE_KEYS[index])
  ) {
    throw new Error(
      "Account faucet response must contain exactly the six first-release snake_case fields.",
    );
  }
  return record;
};

const exactFaucetResponseText = (value: unknown, field: string): string => {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value
  ) {
    throw new Error(
      `Account faucet response.${field} must be canonical non-empty text.`,
    );
  }
  return value;
};

const positiveCanonicalFaucetAmount = (value: unknown): string => {
  const literal = exactFaucetResponseText(value, "amount");
  const match = /^(?:([1-9]\d*)|(0|[1-9]\d*)\.(\d*[1-9]))$/u.exec(literal);
  if (!match) {
    throw new Error(
      "Account faucet response.amount must be a positive canonical Quantity string.",
    );
  }
  const fraction = match[3] ?? "";
  const mantissa = BigInt(literal.replace(".", ""));
  if (
    fraction.length > MAX_QUANTITY_SCALE ||
    mantissa > MAX_QUANTITY_MANTISSA
  ) {
    throw new Error(
      "Account faucet response.amount is outside the canonical Quantity range.",
    );
  }
  return literal;
};

export const decodeAccountFaucetResponse = (
  value: unknown,
  input: {
    requestedAccountId: string;
    networkPrefix: number;
    baseUrl: string;
  },
): AccountFaucetResponseDto => {
  const response = exactFaucetResponseRecord(value);
  const requestedAccountId = normalizeCanonicalAccountIdLiteral(
    input.requestedAccountId,
    "requestedAccountId",
    input.networkPrefix,
  );
  const accountId = exactFaucetResponseText(response.account_id, "account_id");
  if (accountId !== requestedAccountId) {
    throw new Error(
      "Account faucet response.account_id does not exactly match the requested canonical account.",
    );
  }

  const rawAssetDefinitionId = exactFaucetResponseText(
    response.asset_definition_id,
    "asset_definition_id",
  );
  let assetDefinitionId: string;
  try {
    assetDefinitionId = normalizeAssetDefinitionId(
      rawAssetDefinitionId,
      "Account faucet response.asset_definition_id",
    );
  } catch {
    throw new Error(
      "Account faucet response.asset_definition_id must be a canonical Base58 asset definition ID.",
    );
  }
  if (assetDefinitionId !== rawAssetDefinitionId) {
    throw new Error(
      "Account faucet response.asset_definition_id must be a canonical Base58 asset definition ID.",
    );
  }

  const assetId = exactFaucetResponseText(response.asset_id, "asset_id");
  if (assetId !== `${assetDefinitionId}#${accountId}`) {
    throw new Error(
      "Account faucet response.asset_id does not exactly bind its asset definition to the requested account.",
    );
  }

  const amount = positiveCanonicalFaucetAmount(response.amount);
  if (isKnownTairaPublicEndpoint(input.baseUrl)) {
    if (assetDefinitionId !== TAIRA_FAUCET_ASSET_DEFINITION_ID) {
      throw new Error(
        "The public TAIRA faucet response did not fund the canonical XOR asset definition.",
      );
    }
    if (amount !== TAIRA_FAUCET_CLAIM_AMOUNT) {
      throw new Error(
        `The public TAIRA faucet response amount must be exactly ${TAIRA_FAUCET_CLAIM_AMOUNT} XOR.`,
      );
    }
  }

  const txHashHex = exactFaucetResponseText(
    response.tx_hash_hex,
    "tx_hash_hex",
  );
  if (!/^[0-9a-f]{64}$/u.test(txHashHex)) {
    throw new Error(
      "Account faucet response.tx_hash_hex must be exactly 64 lowercase hexadecimal characters.",
    );
  }
  if (response.status !== "QUEUED") {
    throw new Error("Account faucet response.status must be exactly QUEUED.");
  }

  return {
    account_id: accountId,
    asset_definition_id: assetDefinitionId,
    asset_id: assetId,
    amount,
    tx_hash_hex: txHashHex,
    status: "QUEUED",
  };
};

const createAbortError = () => {
  const error = new Error("Faucet request canceled.");
  error.name = "AbortError";
  return error;
};

const normalizeFaucetNetworkPrefix = (value: unknown): number | undefined => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const parsed =
    typeof value === "string" ? Number(value.trim()) : Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 0x3fff) {
    return undefined;
  }
  return parsed;
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

const isKnownMinamotoPublicEndpoint = (baseUrl: string): boolean => {
  try {
    return new URL(baseUrl).hostname.toLowerCase() === MINAMOTO_PUBLIC_HOST;
  } catch {
    return false;
  }
};

const isFaucetDisabledDetail = (detail: string): boolean =>
  /account faucet disabled|faucet disabled|account faucet is disabled/i.test(
    detail,
  );

const buildFaucetDisabledMessage = (baseUrl: string): string =>
  isKnownMinamotoPublicEndpoint(baseUrl)
    ? "Minamoto mainnet must not expose a faucet. Switch Settings to the TAIRA testnet preset to request starter XOR."
    : isKnownTairaPublicEndpoint(baseUrl)
      ? "The TAIRA endpoint has its account faucet disabled. This is an endpoint/operator configuration problem, not a wallet problem; ask a TAIRA operator to enable the faucet."
      : "This endpoint does not provide starter funds. Minamoto mainnet has no faucet; switch Settings to the TAIRA testnet preset or use an already-funded account.";

const readFaucetPuzzleNetworkPrefix = (puzzle: FaucetPowPuzzle): number => {
  const networkPrefix = normalizeFaucetNetworkPrefix(puzzle.chain_discriminant);
  if (networkPrefix === undefined) {
    throw new Error(
      "Faucet puzzle is missing a valid chain_discriminant network prefix.",
    );
  }
  return networkPrefix;
};

const readFaucetPuzzleChainId = (puzzle: FaucetPowPuzzle): string => {
  const chainId = String(puzzle.chain_id ?? "").trim();
  if (!chainId) {
    throw new Error("Faucet puzzle is missing its chain_id.");
  }
  return chainId;
};

const assertFaucetPuzzleMatchesConfiguredNetwork = (
  puzzle: FaucetPowPuzzle,
  expectedChainId: string,
  expectedNetworkPrefix: number,
) => {
  const actualNetworkPrefix = readFaucetPuzzleNetworkPrefix(puzzle);
  const actualChainId = readFaucetPuzzleChainId(puzzle);
  if (actualNetworkPrefix !== expectedNetworkPrefix) {
    throw new Error(
      `Faucet endpoint network prefix mismatch: expected ${expectedNetworkPrefix}, got ${actualNetworkPrefix}. TAIRA must use ${TAIRA_NETWORK_PREFIX} and Minamoto must use ${MINAMOTO_NETWORK_PREFIX}; redeploy the faucet endpoint with the correct chain profile before claiming.`,
    );
  }
  if (actualChainId.toLowerCase() !== expectedChainId.toLowerCase()) {
    throw new Error(
      `Faucet endpoint chain id mismatch: expected ${expectedChainId}, got ${actualChainId}. TAIRA must use ${TAIRA_NETWORK_PREFIX} and Minamoto must not expose a faucet; redeploy the faucet endpoint with the correct chain profile before claiming.`,
    );
  }
};

const normalizeExpectedFaucetIdentity = (
  chainId: string,
  networkPrefix: number,
) => {
  const normalizedChainId = String(chainId ?? "").trim();
  if (!normalizedChainId) {
    throw new Error("chainId is required before requesting faucet funds.");
  }
  const normalizedNetworkPrefix = normalizeFaucetNetworkPrefix(networkPrefix);
  if (normalizedNetworkPrefix === undefined) {
    throw new Error(
      "networkPrefix must be an integer between 0 and 16383 before requesting faucet funds.",
    );
  }
  if (normalizedChainId.toLowerCase() === MINAMOTO_CHAIN_ID) {
    throw new Error(
      "Minamoto mainnet must not expose a faucet. Switch Settings to the TAIRA testnet preset to request starter XOR.",
    );
  }
  return {
    chainId: normalizedChainId,
    networkPrefix: normalizedNetworkPrefix,
  };
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

export const readKnownTairaFaucetFundingIssue = async (
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
  baseUrl: string,
) => {
  if (detail) {
    return isFaucetDisabledDetail(detail)
      ? buildFaucetDisabledMessage(baseUrl)
      : detail;
  }
  if (response.status === 400 && isNoritoResponse(response)) {
    return isKnownTairaPublicEndpoint(baseUrl)
      ? "TAIRA rejected this faucet claim but did not return a readable reason. Common operator-side causes are a depleted faucet authority, stale finality, or a stale proof challenge."
      : "The network rejected this faucet claim but did not return a readable reason. The endpoint may not support this faucet, or the proof challenge may be stale.";
  }
  return response.statusText || "Faucet request failed.";
};

const buildFaucetPuzzleFailureMessage = (
  baseUrl: string,
  status: number,
  statusText: string,
  detail: string,
): string => {
  if (shouldRetryFaucetPuzzle(status, detail)) {
    return "Faucet puzzle is not ready yet because finalized VRF seed data is unavailable on this Torii endpoint. Please retry in a few seconds.";
  }
  if (detail && isFaucetDisabledDetail(detail)) {
    return buildFaucetDisabledMessage(baseUrl);
  }
  return detail || statusText || "Faucet puzzle failed.";
};

export const requestFaucetFundsWithPuzzle = async ({
  baseUrl,
  accountId,
  chainId,
  networkPrefix,
  fetchImpl = fetch,
  signal,
  sleep = sleepFor,
  solvePuzzle = solveFaucetPowPuzzle,
  puzzleRetryAttempts = DEFAULT_PUZZLE_RETRY_ATTEMPTS,
  puzzleRetryDelayMs = DEFAULT_PUZZLE_RETRY_DELAY_MS,
  onStatus,
}: RequestFaucetFundsWithPowInput): Promise<AccountFaucetResponseDto> => {
  if (isKnownMinamotoPublicEndpoint(baseUrl)) {
    throw new Error(buildFaucetDisabledMessage(baseUrl));
  }
  const expectedIdentity = normalizeExpectedFaucetIdentity(
    chainId,
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
    assertFaucetPuzzleMatchesConfiguredNetwork(
      puzzle,
      expectedIdentity.chainId,
      expectedIdentity.networkPrefix,
    );
    const normalizedAccountId = normalizeCanonicalAccountIdLiteral(
      accountId,
      "accountId",
      expectedIdentity.networkPrefix,
    );
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
        ? await readKnownTairaFaucetFundingIssue(baseUrl, fetchImpl, signal)
        : null;
      const message =
        diagnosticDetail ??
        buildFaucetRequestErrorMessage(response, detail, baseUrl);
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
    const payload = (await response.json()) as unknown;
    return decodeAccountFaucetResponse(payload, {
      requestedAccountId: normalizedAccountId,
      networkPrefix: expectedIdentity.networkPrefix,
      baseUrl,
    });
  }

  const message = buildFaucetPuzzleFailureMessage(
    baseUrl,
    puzzleStatus,
    puzzleStatusText,
    puzzleDetail,
  );
  throw new Error(`Faucet puzzle failed (${puzzleStatus}): ${message}`);
};

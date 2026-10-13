import { readBoundedJsonResponse } from "./boundedJsonResponse";
import { parseRetryAfterMs, withBoundedHttpGetRetry } from "./httpReadRetry";
import { nodeFetch } from "./nodeFetch";
import { normalizeEndpointUrl } from "../src/utils/endpoint";
import {
  ACCOUNT_CAPABILITIES_PATH,
  GENESIS_BLOCK_PATH,
  combineNetworkIdentitySources,
  parseAccountCapabilitiesIdentity,
  parseGenesisBlockIdentity,
  type ObservedNetworkIdentity,
} from "../src/utils/networkIdentity";

export type FetchLike = (
  input: Parameters<typeof fetch>[0],
  init?: RequestInit,
) => Promise<Response>;

export type NetworkIdentitySourceResult =
  | { reached: false }
  | { reached: true; identity: null; detail: string }
  | {
      reached: true;
      identity: Pick<ObservedNetworkIdentity, "networkId"> &
        Partial<Pick<ObservedNetworkIdentity, "networkPrefix">>;
    };

export type NetworkIdentityDiscovery =
  | {
      status: "verified";
      identity: ObservedNetworkIdentity;
      capabilities: NetworkIdentitySourceResult;
      genesis: NetworkIdentitySourceResult;
    }
  | {
      status: "conflicting" | "incomplete" | "unreachable";
      identity: null;
      capabilities: NetworkIdentitySourceResult;
      genesis: NetworkIdentitySourceResult;
      detail: string;
    };

export type NetworkIdentityDiscoveryOptions = {
  fetchImpl?: FetchLike;
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 5_000;
const MAX_IDENTITY_JSON_BYTES = 64 * 1024;

const fetchJsonWithTimeout = async (
  fetchImpl: FetchLike,
  url: string,
  timeoutMs: number,
  label: string,
): Promise<{ ok: true; payload: unknown } | { ok: false; detail: string }> => {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new Error(`${label} timed out.`)),
    timeoutMs,
  );
  try {
    const response = await withBoundedHttpGetRetry(
      async () => {
        const candidate = await fetchImpl(url, {
          method: "GET",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });
        if (candidate.status === 429) {
          throw Object.assign(new Error(`${label} was rate limited.`), {
            status: 429,
            retryAfterMs: parseRetryAfterMs(
              candidate.headers.get("retry-after"),
            ),
          });
        }
        return candidate;
      },
      { signal: controller.signal },
    );
    if (!response.ok) {
      return {
        ok: false,
        detail: `${label} returned HTTP ${response.status}.`,
      };
    }
    return {
      ok: true,
      payload: await readBoundedJsonResponse(response, {
        label,
        maximumBytes: MAX_IDENTITY_JSON_BYTES,
        requireApplicationJson: true,
      }),
    };
  } finally {
    clearTimeout(timeout);
  }
};

const readSource = async <T>(
  fetchImpl: FetchLike,
  url: string,
  timeoutMs: number,
  label: string,
  parse: (payload: unknown) => T,
): Promise<
  | { reached: false }
  | { reached: true; identity: null; detail: string }
  | { reached: true; identity: T }
> => {
  let result: Awaited<ReturnType<typeof fetchJsonWithTimeout>>;
  try {
    result = await fetchJsonWithTimeout(fetchImpl, url, timeoutMs, label);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      (error as { status?: unknown }).status === 429
    ) {
      return {
        reached: true,
        identity: null,
        detail: `${label} was rate limited.`,
      };
    }
    return { reached: false };
  }
  if (!result.ok) {
    return { reached: true, identity: null, detail: result.detail };
  }
  try {
    return { reached: true, identity: parse(result.payload) };
  } catch (error) {
    return {
      reached: true,
      identity: null,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
};

/**
 * Read the endpoint's network identity from two independent public sources
 * and require them to agree. No source is trusted on its own.
 */
export const discoverEndpointNetworkIdentity = async (
  toriiUrlInput: string,
  options: NetworkIdentityDiscoveryOptions = {},
): Promise<NetworkIdentityDiscovery> => {
  const toriiUrl = normalizeEndpointUrl(toriiUrlInput);
  const fetchImpl = options.fetchImpl ?? nodeFetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const [capabilities, genesis] = await Promise.all([
    readSource(
      fetchImpl,
      `${toriiUrl}${ACCOUNT_CAPABILITIES_PATH}`,
      timeoutMs,
      "Account capabilities",
      parseAccountCapabilitiesIdentity,
    ),
    readSource(
      fetchImpl,
      `${toriiUrl}${GENESIS_BLOCK_PATH}`,
      timeoutMs,
      "Genesis block",
      parseGenesisBlockIdentity,
    ),
  ]);
  if (!capabilities.reached && !genesis.reached) {
    return {
      status: "unreachable",
      identity: null,
      capabilities,
      genesis,
      detail: "The endpoint did not answer either network identity source.",
    };
  }
  if (
    !capabilities.reached ||
    !genesis.reached ||
    capabilities.identity === null ||
    genesis.identity === null
  ) {
    const details = [capabilities, genesis]
      .map((source) =>
        !source.reached
          ? "source unreachable"
          : source.identity === null
            ? source.detail
            : null,
      )
      .filter(Boolean);
    return {
      status: "incomplete",
      identity: null,
      capabilities,
      genesis,
      detail: `Network identity needs both ${ACCOUNT_CAPABILITIES_PATH} and ${GENESIS_BLOCK_PATH}: ${details.join("; ")}`,
    };
  }
  const identity = combineNetworkIdentitySources(
    capabilities.identity,
    genesis.identity,
  );
  if (!identity) {
    return {
      status: "conflicting",
      identity: null,
      capabilities,
      genesis,
      detail: `Account capabilities report ${capabilities.identity.networkId} but the genesis block is ${genesis.identity.networkId}.`,
    };
  }
  return { status: "verified", identity, capabilities, genesis };
};

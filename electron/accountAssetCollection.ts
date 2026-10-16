import { ToriiClient, field } from "@iroha/iroha-js";
import { normalizeCanonicalAccountIdLiteral } from "./accountAddress";
import { normalizeFirstReleaseAssetDefinitionId } from "./assetDefinitionId";
import {
  MAX_TORII_JSON_RESPONSE_BYTES,
  readBoundedJsonResponse,
} from "./boundedJsonResponse";
import { requireFirstReleasePagination } from "./firstReleaseReadInput";
import { nodeFetch } from "./nodeFetch";
import {
  normalizeAccountAssetListPayload,
  normalizeBaseUrl,
  type AccountAssetListResponseView,
} from "./preload-utils";

/** The renderer uses a bounded row window; Torii uses only the current cursor collection API. */
export async function fetchAccountAssetCollection(
  input: {
    toriiUrl: string;
    accountId: string;
    networkPrefix: number;
    assetDefinitionId?: string;
    limit?: number;
    offset?: number;
  },
  fetchImpl: typeof fetch = nodeFetch,
): Promise<AccountAssetListResponseView> {
  const window = requireFirstReleasePagination(input, {
    defaultLimit: 50,
    label: "Account assets",
  });
  const accountId = normalizeCanonicalAccountIdLiteral(
    input.accountId,
    "accountId",
    input.networkPrefix,
  );
  const assetDefinitionId =
    input.assetDefinitionId === undefined
      ? undefined
      : normalizeFirstReleaseAssetDefinitionId(
          input.assetDefinitionId,
          "assetDefinitionId",
        );
  const pageLimit = Math.min(500, window.offset + window.limit);
  const client = new ToriiClient(normalizeBaseUrl(input.toriiUrl), {
    timeoutMs: 20_000,
    // Keep the wallet's stricter byte, UTF-8 and duplicate-key boundary around the SDK transport.
    fetchImpl: async (url, init) => {
      const response = await fetchImpl(url, { ...init, redirect: "error" });
      if (!response.ok) return response;
      const payload = await readBoundedJsonResponse(response, {
        label: "Account assets",
        maximumBytes: MAX_TORII_JSON_RESPONSE_BYTES,
        requireApplicationJson: true,
      });
      // Validate before serialization can erase wire distinctions such as -0.
      normalizeAccountAssetListPayload(payload, {
        expectedAccountId: accountId,
        expectedAssetDefinitionId: assetDefinitionId,
        networkPrefix: input.networkPrefix,
        maximumItems: pageLimit,
      });
      return new Response(JSON.stringify(payload), {
        status: response.status,
        headers: { "content-type": "application/json" },
      });
    },
  });
  const collection = client.accountAssets(accountId);
  const signal = AbortSignal.timeout(60_000);
  const seenCursors = new Set<string>();
  const seenHoldings = new Set<string>();
  const items: AccountAssetListResponseView["items"] = [];
  let cursor: string | undefined;
  let total: number | undefined;
  let scanned = 0;
  for (let pages = 0; pages < 100; pages += 1) {
    const result = await collection.list(
      {
        limit: pageLimit,
        includeTotal: true,
        ...(cursor === undefined ? {} : { cursor }),
        ...(assetDefinitionId === undefined
          ? {}
          : { filter: field("asset").eq(assetDefinitionId) }),
      },
      { signal },
    );
    const page = normalizeAccountAssetListPayload(
      {
        items: result.items,
        total: result.total,
        next_cursor: result.nextCursor,
      },
      {
        expectedAccountId: accountId,
        expectedAssetDefinitionId: assetDefinitionId,
        networkPrefix: input.networkPrefix,
        maximumItems: pageLimit,
      },
    );
    if (total !== undefined && total !== page.total)
      throw new Error(
        "Account assets total changed while reading pages; refresh balances.",
      );
    total = page.total;
    for (const item of page.items) {
      if (seenHoldings.has(item.asset_id))
        throw new Error("Account assets repeated a holding across pages.");
      seenHoldings.add(item.asset_id);
      if (scanned >= window.offset && items.length < window.limit)
        items.push(item);
      scanned += 1;
    }
    if (
      scanned > total ||
      (result.nextCursor === null && scanned !== total) ||
      (result.nextCursor !== null && scanned >= total)
    ) {
      throw new Error("Account assets cursor disagrees with the exact total.");
    }
    if (result.nextCursor !== null) {
      if (seenCursors.has(result.nextCursor))
        throw new Error("Account assets repeated a cursor.");
      seenCursors.add(result.nextCursor);
    }
    if (items.length === window.limit || result.nextCursor === null)
      return { items, total };
    cursor = result.nextCursor;
  }
  throw new Error("Account assets exceeded the bounded page scan.");
}

import {
  assertTransactionFinalityProof,
  waitForFinalizedTransaction,
} from "../electron/transactionFinality.ts";

const CANONICAL_IROHA_HASH_HEX = /^[0-9a-f]{63}[13579bdf]$/u;

const sleep = (delayMs) =>
  new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });

const requireCanonicalHash = (value, label) => {
  if (typeof value !== "string" || !CANONICAL_IROHA_HASH_HEX.test(value)) {
    throw new Error(
      `${label} must be a canonical lowercase 32-byte Iroha hash with its marker set.`,
    );
  }
  return value;
};

const defaultReadJson = async (url, fetchImpl) => {
  const response = await fetchImpl(url, {
    headers: {
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `${response.status} ${response.statusText}${detail ? `: ${detail.slice(0, 240)}` : ""}`,
    );
  }
  return response.json();
};

export const assertFinalizedMutationReceipt = (
  receipt,
  { label = "Mutation receipt", hashFields = ["tx_hash_hex"] } = {},
) => {
  if (
    receipt === null ||
    typeof receipt !== "object" ||
    Array.isArray(receipt)
  ) {
    throw new Error(`${label} must be an object.`);
  }
  if (
    !Array.isArray(hashFields) ||
    hashFields.length !== 1 ||
    typeof hashFields[0] !== "string" ||
    !/^[a-z][a-z0-9_]*$/u.test(hashFields[0])
  ) {
    throw new Error(`${label} must select exactly one canonical hash field.`);
  }
  const [hashField] = hashFields;
  if (!Object.prototype.hasOwnProperty.call(receipt, hashField)) {
    throw new Error(`${label} did not include a transaction hash.`);
  }
  const hashHex = requireCanonicalHash(
    receipt[hashField],
    `${label}.${hashField}`,
  );
  return {
    hashHex,
    finality: assertTransactionFinalityProof(receipt.finality, hashHex),
  };
};

export const waitForToriiTransactionFinality = async ({
  toriiUrl,
  hashHex,
  timeoutMs = 180_000,
  intervalMs = 1_500,
  readJson,
  fetchImpl = fetch,
  wait = sleep,
  now,
}) => {
  const normalizedHash = requireCanonicalHash(
    hashHex,
    "Submitted transaction hash",
  );
  const baseUrl = new URL(
    String(toriiUrl ?? "").endsWith("/")
      ? String(toriiUrl)
      : `${String(toriiUrl ?? "").trim()}/`,
  );
  const read =
    typeof readJson === "function"
      ? readJson
      : (url) => defaultReadJson(url, fetchImpl);
  const statusUrl = new URL(
    `/v1/pipeline/transactions/status?hash=${encodeURIComponent(normalizedHash)}&scope=global`,
    baseUrl,
  );
  const transactionUrl = new URL(
    `/v1/explorer/transactions/${encodeURIComponent(normalizedHash)}`,
    baseUrl,
  );
  const metricsUrl = new URL("/v1/explorer/metrics", baseUrl);

  const evidence = await waitForFinalizedTransaction({
    hashHex: normalizedHash,
    timeoutMs,
    intervalMs,
    getGlobalStatus: () => read(statusUrl),
    getExplorerTransaction: () => read(transactionUrl),
    getExplorerBlock: (blockHeight) =>
      read(
        new URL(
          `/v1/explorer/blocks/${encodeURIComponent(String(blockHeight))}`,
          baseUrl,
        ),
      ),
    getExplorerMetrics: () => read(metricsUrl),
    wait,
    ...(typeof now === "function" ? { now } : {}),
  });

  return {
    hashHex: normalizedHash,
    finality: evidence.proof,
    statusPayload: evidence.statusPayload,
    transactionPayload: evidence.transactionPayload,
  };
};

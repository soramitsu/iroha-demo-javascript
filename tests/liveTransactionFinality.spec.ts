import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  assertFinalizedMutationReceipt,
  waitForToriiTransactionFinality,
} from "../scripts/live-transaction-finality.mjs";

const HASH = "ab".repeat(32);
const BLOCK_HASH = "cd".repeat(32);

const appliedStatus = () => ({
  hash: HASH,
  scope: "global",
  resolved_from: "state",
  status: {
    kind: "Applied",
    block_height: 17,
  },
});

describe("live-script transaction finality", () => {
  it("reads exact global Applied and matching explorer/finalized-block evidence", async () => {
    const reads: string[] = [];
    const readJson = vi.fn(async (url: URL) => {
      reads.push(url.pathname + url.search);
      if (url.pathname === "/v1/pipeline/transactions/status") {
        return appliedStatus();
      }
      if (url.pathname === `/v1/explorer/transactions/${HASH}`) {
        return {
          authority: "testu-finality-authority",
          hash: HASH,
          block: 17,
          created_at: "2026-07-27T01:02:03Z",
          executable: "Instructions",
          status: "Committed",
          rejection_reason: null,
          executable_payload: { instruction_count: 1 },
          metadata: {},
          nonce: null,
          signature: "11".repeat(64),
          time_to_live: null,
        };
      }
      if (url.pathname === "/v1/explorer/blocks/17") {
        return {
          hash: BLOCK_HASH,
          height: 17,
          created_at: "2026-07-27T01:02:04Z",
          prev_block_hash: "ef".repeat(32),
          transactions_hash: "ef".repeat(32),
          transactions_rejected: 0,
          transactions_total: 2,
        };
      }
      if (url.pathname === "/v1/explorer/metrics") {
        return {
          peers: 4,
          domains: 7,
          accounts: 360,
          assets: 169,
          transactions_accepted: 359,
          transactions_rejected: 16,
          block: 19,
          block_created_at: "2026-07-27T01:02:06Z",
          finalized_block: 18,
          avg_commit_time: { ms: 500 },
          avg_block_time: { ms: 1_000 },
        };
      }
      throw new Error(`unexpected read ${url}`);
    });

    await expect(
      waitForToriiTransactionFinality({
        toriiUrl: "https://taira.sora.org",
        hashHex: HASH,
        readJson,
        timeoutMs: 1_000,
        intervalMs: 0,
      }),
    ).resolves.toMatchObject({
      hashHex: HASH,
      finality: {
        status: "finalized",
        transactionHash: HASH,
        blockHeight: 17,
        blockHash: BLOCK_HASH,
        finalizedBlockHeight: 18,
      },
    });

    expect(reads).toEqual([
      `/v1/pipeline/transactions/status?hash=${HASH}&scope=global`,
      `/v1/explorer/transactions/${HASH}`,
      "/v1/explorer/blocks/17",
      "/v1/explorer/metrics",
      `/v1/pipeline/transactions/status?hash=${HASH}&scope=global`,
      `/v1/explorer/transactions/${HASH}`,
      "/v1/explorer/blocks/17",
      "/v1/explorer/metrics",
    ]);
  });

  it("times out without explorer reads when pipeline state remains Committed", async () => {
    let nowMs = 0;
    const readJson = vi.fn(async (url: URL) => {
      if (url.pathname !== "/v1/pipeline/transactions/status") {
        throw new Error("explorer evidence must not be read before Applied");
      }
      return {
        hash: HASH,
        scope: "global",
        resolved_from: "cache",
        status: {
          kind: "Committed",
          block_height: 17,
        },
      };
    });

    await expect(
      waitForToriiTransactionFinality({
        toriiUrl: "https://taira.sora.org",
        hashHex: HASH,
        readJson,
        timeoutMs: 20,
        intervalMs: 10,
        now: () => nowMs,
        wait: async (delayMs: number) => {
          nowMs += delayMs;
        },
      }),
    ).rejects.toThrow(
      `Transaction ${HASH} stayed in Committed and was not proven in a finalized block`,
    );
    expect(
      vi
        .mocked(readJson)
        .mock.calls.every(
          ([url]) =>
            (url as URL).pathname === "/v1/pipeline/transactions/status",
        ),
    ).toBe(true);
  });

  it("rejects an accepted receipt without an exact finalized-block proof", () => {
    expect(() =>
      assertFinalizedMutationReceipt(
        {
          accepted: true,
          tx_hash_hex: HASH,
        },
        { label: "Faucet claim", hashFields: ["tx_hash_hex"] },
      ),
    ).toThrow("Transaction finality proof must be an object");

    expect(() =>
      assertFinalizedMutationReceipt(
        {
          tx_hash_hex: HASH,
          hash: HASH,
          finality: {
            status: "finalized",
            transactionHash: HASH,
            blockHeight: 17,
            blockHash: BLOCK_HASH,
            finalizedBlockHeight: 18,
          },
        },
        {
          label: "Ambiguous mutation",
          hashFields: ["tx_hash_hex", "hash"],
        },
      ),
    ).toThrow("must select exactly one canonical hash field");
  });

  it("wires retained live mutations through the finalized-block boundary", () => {
    const tradeScript = readFileSync(
      resolve(process.cwd(), "scripts/connect-soraswap-live-trade.mjs"),
      "utf8",
    );
    expect(tradeScript).not.toContain("waitForPipelineStatus");
    expect(tradeScript).not.toContain('kind === "Committed"');
    expect(tradeScript).toContain('postJsonOnce(new URL("/v1/contracts/call"');
    expect(tradeScript).toContain('postJsonOnce(new URL("/v1/accounts/faucet"');
    expect(
      tradeScript.match(/waitForToriiTransactionFinality/gu)?.length ?? 0,
    ).toBeGreaterThanOrEqual(3);

    const electronLiveScript = readFileSync(
      resolve(process.cwd(), "scripts/e2e/electron-live.mjs"),
      "utf8",
    );
    expect(electronLiveScript).toContain(
      'String(faucetReceipt?.status ?? "").trim() !== "FINALIZED"',
    );
    expect(electronLiveScript).not.toContain("selfShield");
    expect(electronLiveScript).not.toContain("recipientTransfer");
    expect(electronLiveScript).not.toContain("Unshield transaction");
    expect(electronLiveScript).toContain('name: "Sign and commit"');
    expect(electronLiveScript).not.toContain('kind: "committed"');
    expect(electronLiveScript).not.toContain("Faucet probe queued");
  });
});

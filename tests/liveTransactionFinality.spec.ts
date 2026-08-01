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
          hash: HASH,
          block: 17,
          status: "Committed",
        };
      }
      if (url.pathname === "/v1/explorer/blocks/17") {
        return {
          hash: BLOCK_HASH,
          height: 17,
          transactions_hash: "ef".repeat(32),
          transactions_total: 1,
        };
      }
      if (url.pathname === "/v1/explorer/metrics") {
        return {
          block: 19,
          finalized_block: 18,
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
  });

  it("wires both mutating live harnesses through the finalized-block boundary", () => {
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
    expect(electronLiveScript).toContain(
      "assertFinalizedSubmission(selfShield",
    );
    expect(electronLiveScript).toContain(
      "assertFinalizedSubmission(\n        recipientTransfer",
    );
    expect(electronLiveScript).toContain(
      'assertFinalizedSubmission(unshield, "Unshield transaction")',
    );
    expect(electronLiveScript).toContain('name: "Sign and commit"');
    expect(electronLiveScript).not.toContain('kind: "committed"');
    expect(electronLiveScript).not.toContain("Faucet probe queued");
  });
});

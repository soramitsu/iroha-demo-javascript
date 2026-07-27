import { describe, expect, it, vi } from "vitest";

import {
  TransactionFinalityIntegrityError,
  waitForFinalizedTransaction,
} from "../electron/transactionFinality";

const HASH = "ab".repeat(32);
const BLOCK_HASH = "cd".repeat(32);

const status = (
  kind: string,
  options: {
    resolvedFrom?: "queue" | "cache" | "state";
    blockHeight?: number | null;
    hash?: string;
  } = {},
) => ({
  hash: options.hash ?? HASH,
  status: {
    kind,
    block_height: options.blockHeight ?? null,
  },
  scope: "global",
  resolved_from: options.resolvedFrom ?? "state",
});

const transaction = {
  hash: HASH,
  block: 17,
  status: "Committed",
};

const block = {
  hash: BLOCK_HASH,
  height: 17,
  transactions_hash: HASH,
  transactions_total: 1,
};

const metrics = {
  block: 19,
  finalized_block: 17,
};

const dependencies = (
  getGlobalStatus: () => Promise<unknown>,
  overrides: Partial<{
    getExplorerTransaction: () => Promise<unknown>;
    getExplorerBlock: (height: number) => Promise<unknown>;
    getExplorerMetrics: () => Promise<unknown>;
    wait: (delayMs: number) => Promise<void>;
    now: () => number;
  }> = {},
) => ({
  hashHex: HASH,
  timeoutMs: 1_000,
  intervalMs: 1,
  getGlobalStatus,
  getExplorerTransaction:
    overrides.getExplorerTransaction ?? (async () => transaction),
  getExplorerBlock: overrides.getExplorerBlock ?? (async () => block),
  getExplorerMetrics: overrides.getExplorerMetrics ?? (async () => metrics),
  wait: overrides.wait ?? (async () => undefined),
  ...(overrides.now ? { now: overrides.now } : {}),
});

describe("transaction finalized-block boundary", () => {
  it("does not accept Committed and resolves only after stable Applied state plus finalized block evidence", async () => {
    const getGlobalStatus = vi
      .fn()
      .mockResolvedValueOnce(
        status("Committed", { resolvedFrom: "cache", blockHeight: 17 }),
      )
      .mockResolvedValue(
        status("Applied", { resolvedFrom: "state", blockHeight: 17 }),
      );

    await expect(
      waitForFinalizedTransaction(dependencies(getGlobalStatus)),
    ).resolves.toEqual({
      proof: {
        status: "finalized",
        transactionHash: HASH,
        blockHeight: 17,
        blockHash: BLOCK_HASH,
        finalizedBlockHeight: 17,
      },
      statusPayload: status("Applied", {
        resolvedFrom: "state",
        blockHeight: 17,
      }),
      transactionPayload: transaction,
    });
    expect(getGlobalStatus).toHaveBeenCalledTimes(3);
  });

  it("times out rather than treating accepted or Committed as success", async () => {
    let clock = 0;
    const getGlobalStatus = vi
      .fn()
      .mockResolvedValue(
        status("Committed", { resolvedFrom: "cache", blockHeight: 17 }),
      );

    await expect(
      waitForFinalizedTransaction({
        ...dependencies(getGlobalStatus, {
          now: () => clock,
          wait: async (delayMs) => {
            clock += Math.max(1, delayMs);
          },
        }),
        timeoutMs: 2,
      }),
    ).rejects.toThrow(
      `Transaction ${HASH} stayed in Committed and was not proven in a finalized block`,
    );
  });

  it("waits until finalized height covers the exact transaction block", async () => {
    const getGlobalStatus = vi
      .fn()
      .mockResolvedValue(
        status("Applied", { resolvedFrom: "state", blockHeight: 17 }),
      );
    const getExplorerMetrics = vi
      .fn()
      .mockResolvedValueOnce({ block: 19, finalized_block: 16 })
      .mockResolvedValue(metrics);

    await expect(
      waitForFinalizedTransaction(
        dependencies(getGlobalStatus, { getExplorerMetrics }),
      ),
    ).resolves.toMatchObject({
      proof: {
        blockHeight: 17,
        finalizedBlockHeight: 17,
      },
    });
    expect(getExplorerMetrics).toHaveBeenCalledTimes(2);
  });

  it("fails closed when Applied is not resolved from authoritative state", async () => {
    await expect(
      waitForFinalizedTransaction(
        dependencies(async () =>
          status("Applied", {
            resolvedFrom: "cache",
            blockHeight: 17,
          }),
        ),
      ),
    ).rejects.toBeInstanceOf(TransactionFinalityIntegrityError);
  });

  it("fails closed when explorer inclusion points at a different hash", async () => {
    await expect(
      waitForFinalizedTransaction(
        dependencies(
          async () =>
            status("Applied", {
              resolvedFrom: "state",
              blockHeight: 17,
            }),
          {
            getExplorerTransaction: async () => ({
              ...transaction,
              hash: "ef".repeat(32),
            }),
          },
        ),
      ),
    ).rejects.toThrow(
      "Explorer transaction hash does not match the submitted transaction.",
    );
  });

  it("rejects a block summary that does not expose its transaction root", async () => {
    await expect(
      waitForFinalizedTransaction(
        dependencies(
          async () =>
            status("Applied", {
              resolvedFrom: "state",
              blockHeight: 17,
            }),
          {
            getExplorerBlock: async () => ({
              ...block,
              transactions_hash: null,
            }),
          },
        ),
      ),
    ).rejects.toThrow(
      "Explorer block.transactions_hash must be a canonical lowercase 32-byte hash.",
    );
  });
});

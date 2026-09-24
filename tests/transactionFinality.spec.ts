import { describe, expect, it, vi } from "vitest";

import {
  assertTransactionFinalityProof,
  parseGlobalPipelineStatus,
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
  authority: "testu-finality-authority",
  hash: HASH,
  block: 17,
  created_at: "2026-07-27T01:02:03.456Z",
  executable: "Instructions",
  status: "Committed",
  rejection_reason: null,
  executable_payload: { instruction_count: 1 },
  metadata: {},
  nonce: null,
  signature: "11".repeat(64),
  time_to_live: { ms: 60_000 },
};

const block = {
  hash: BLOCK_HASH,
  height: 17,
  created_at: "2026-07-27T01:02:04Z",
  prev_block_hash: "ef".repeat(32),
  transactions_hash: HASH,
  transactions_rejected: 0,
  transactions_total: 1,
};

const metrics = {
  peers: 4,
  domains: 7,
  accounts: 360,
  assets: 169,
  transactions_accepted: 359,
  transactions_rejected: 16,
  block: 19,
  block_created_at: "2026-07-27T01:02:06Z",
  finalized_block: 17,
  avg_commit_time: { ms: 500 },
  avg_block_time: { ms: 1_000 },
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
      .mockResolvedValueOnce({ ...metrics, finalized_block: 16 })
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
    expect(getExplorerMetrics).toHaveBeenCalledTimes(3);
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
      "Explorer block.transactions_hash must be a canonical lowercase 32-byte Iroha hash with its marker set.",
    );
  });

  it("rejects unknown fields in every closed first-release evidence envelope", async () => {
    await expect(
      waitForFinalizedTransaction(
        dependencies(async () => ({
          ...status("Applied", {
            resolvedFrom: "state",
            blockHeight: 17,
          }),
          statusKind: "Applied",
        })),
      ),
    ).rejects.toThrow(
      "Global pipeline status contains missing or unknown fields.",
    );

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
              block_height: 17,
            }),
          },
        ),
      ),
    ).rejects.toThrow(
      "Explorer transaction contains missing or unknown fields.",
    );

    await expect(
      waitForFinalizedTransaction(
        dependencies(
          async () =>
            status("Applied", {
              resolvedFrom: "state",
              blockHeight: 17,
            }),
          {
            getExplorerBlock: async () => ({ ...block, blockHash: BLOCK_HASH }),
          },
        ),
      ),
    ).rejects.toThrow("Explorer block contains missing or unknown fields.");

    await expect(
      waitForFinalizedTransaction(
        dependencies(
          async () =>
            status("Applied", {
              resolvedFrom: "state",
              blockHeight: 17,
            }),
          {
            getExplorerMetrics: async () => ({
              ...metrics,
              finalizedBlockHeight: 17,
            }),
          },
        ),
      ),
    ).rejects.toThrow("Explorer metrics contains missing or unknown fields.");

    expect(() =>
      assertTransactionFinalityProof(
        {
          status: "finalized",
          transactionHash: HASH,
          blockHeight: 17,
          blockHash: BLOCK_HASH,
          finalizedBlockHeight: 17,
          finalized: true,
        },
        HASH,
      ),
    ).toThrow("Transaction finality proof contains missing or unknown fields.");
  });

  it("rejects proxies and accessors without invoking attacker-controlled enumeration or getters", () => {
    let ownKeysCalls = 0;
    const pipelineStatus = status("Applied", {
      resolvedFrom: "state",
      blockHeight: 17,
    });
    const proxiedStatus = new Proxy(pipelineStatus, {
      ownKeys: (target) => {
        ownKeysCalls += 1;
        return Reflect.ownKeys(target);
      },
    });

    expect(() => parseGlobalPipelineStatus(proxiedStatus, HASH)).toThrow(
      "Global pipeline status must be an object.",
    );
    expect(ownKeysCalls).toBe(0);

    let getterCalls = 0;
    const accessorStatus = status("Applied", {
      resolvedFrom: "state",
      blockHeight: 17,
    });
    Object.defineProperty(accessorStatus, "status", {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        return pipelineStatus.status;
      },
    });

    expect(() => parseGlobalPipelineStatus(accessorStatus, HASH)).toThrow(
      "Global pipeline status contains missing or unknown fields.",
    );
    expect(getterCalls).toBe(0);
  });

  it("rejects cyclic, non-finite, and oversized JSON before invoking JSON hooks", () => {
    let toJsonCalls = 0;
    const hookedKind = {
      toJSON: () => {
        toJsonCalls += 1;
        return "Applied";
      },
    };
    const hookedStatus = status("Applied", {
      resolvedFrom: "state",
      blockHeight: 17,
    });
    hookedStatus.status.kind = hookedKind as unknown as string;
    expect(() => parseGlobalPipelineStatus(hookedStatus, HASH)).toThrow(
      "Global pipeline status must be finite JSON data.",
    );
    expect(toJsonCalls).toBe(0);

    const cyclicValue: Record<string, unknown> = {};
    cyclicValue.self = cyclicValue;
    const cyclicStatus = status("Applied", {
      resolvedFrom: "state",
      blockHeight: 17,
    });
    cyclicStatus.status.kind = cyclicValue as unknown as string;
    expect(() => parseGlobalPipelineStatus(cyclicStatus, HASH)).toThrow(
      "Global pipeline status must be finite JSON data.",
    );

    const nonFiniteStatus = status("Applied", {
      resolvedFrom: "state",
      blockHeight: 17,
    });
    nonFiniteStatus.status.kind = Number.NaN as unknown as string;
    expect(() => parseGlobalPipelineStatus(nonFiniteStatus, HASH)).toThrow(
      "Global pipeline status must be finite JSON data.",
    );

    const oversizedStatus = status("Applied", {
      resolvedFrom: "state",
      blockHeight: 17,
    });
    oversizedStatus.status.kind = "x".repeat(64 * 1024);
    expect(() => parseGlobalPipelineStatus(oversizedStatus, HASH)).toThrow(
      "Global pipeline status exceeds the 65536-byte first-release limit.",
    );
  });

  it("returns an immutable JSON snapshot rather than caller-owned status objects", () => {
    const pipelineStatus = status("Applied", {
      resolvedFrom: "state",
      blockHeight: 17,
    });
    const parsed = parseGlobalPipelineStatus(pipelineStatus, HASH);

    pipelineStatus.hash = BLOCK_HASH;
    pipelineStatus.status.kind = "Rejected";

    expect(parsed.payload.hash).toBe(HASH);
    expect((parsed.payload.status as Record<string, unknown>).kind).toBe(
      "Applied",
    );
    expect(Object.isFrozen(parsed.payload)).toBe(true);
    expect(Object.isFrozen(parsed.payload.status)).toBe(true);
  });

  it("rejects mutation when an Explorer dependency reuses one response object", async () => {
    const sharedTransaction = structuredClone(transaction);
    const getExplorerTransaction = vi.fn(async () => {
      if (getExplorerTransaction.mock.calls.length === 2) {
        sharedTransaction.metadata = { changed: true };
      }
      return sharedTransaction;
    });

    await expect(
      waitForFinalizedTransaction(
        dependencies(
          async () =>
            status("Applied", {
              resolvedFrom: "state",
              blockHeight: 17,
            }),
          { getExplorerTransaction },
        ),
      ),
    ).rejects.toThrow(
      "The Explorer transaction changed across finality evidence reads.",
    );
  });

  it("rejects sparse or over-budget nested arrays without walking their declared length", async () => {
    const sparseExecutable: unknown[] = [];
    sparseExecutable.length = 65_537;

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
              executable_payload: sparseExecutable,
            }),
          },
        ),
      ),
    ).rejects.toThrow("Explorer transaction must be finite JSON data.");
  });

  it("does not treat a cache-resolved terminal status as authoritative", async () => {
    let clock = 0;
    const getGlobalStatus = vi.fn().mockResolvedValue(
      status("Rejected", {
        resolvedFrom: "cache",
        blockHeight: 17,
      }),
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
    ).rejects.toThrow(`Transaction ${HASH} stayed in Rejected`);
    expect(getGlobalStatus).toHaveBeenCalledTimes(3);
  });

  it("propagates a custom authoritative terminal failure during confirmation", async () => {
    const terminalFailure = new Error("exact rejection detail");
    const getGlobalStatus = vi
      .fn()
      .mockResolvedValueOnce(
        status("Applied", { resolvedFrom: "state", blockHeight: 17 }),
      )
      .mockResolvedValueOnce(
        status("Rejected", { resolvedFrom: "state", blockHeight: 17 }),
      );

    await expect(
      waitForFinalizedTransaction({
        ...dependencies(getGlobalStatus),
        buildTerminalFailure: async () => terminalFailure,
      }),
    ).rejects.toBe(terminalFailure);
  });

  it("rejects block replacement and finality-height rollback across evidence reads", async () => {
    const getGlobalStatus = vi
      .fn()
      .mockResolvedValue(
        status("Applied", { resolvedFrom: "state", blockHeight: 17 }),
      );
    const getExplorerBlock = vi
      .fn()
      .mockResolvedValueOnce(block)
      .mockResolvedValueOnce({ ...block, hash: "ef".repeat(32) });
    await expect(
      waitForFinalizedTransaction(
        dependencies(getGlobalStatus, { getExplorerBlock }),
      ),
    ).rejects.toThrow(
      "The transaction block changed across finality evidence reads.",
    );

    const getExplorerMetrics = vi
      .fn()
      .mockResolvedValueOnce({ ...metrics, finalized_block: 18 })
      .mockResolvedValueOnce(metrics);
    await expect(
      waitForFinalizedTransaction(
        dependencies(getGlobalStatus, { getExplorerMetrics }),
      ),
    ).rejects.toThrow(
      "Explorer finality metrics rolled back across evidence reads.",
    );
  });

  it("rejects immutable transaction drift and cross-attempt block replacement", async () => {
    const getGlobalStatus = vi
      .fn()
      .mockResolvedValue(
        status("Applied", { resolvedFrom: "state", blockHeight: 17 }),
      );
    const getExplorerTransaction = vi
      .fn()
      .mockResolvedValueOnce(transaction)
      .mockResolvedValueOnce({ ...transaction, metadata: { changed: true } });
    await expect(
      waitForFinalizedTransaction(
        dependencies(getGlobalStatus, { getExplorerTransaction }),
      ),
    ).rejects.toThrow(
      "The Explorer transaction changed across finality evidence reads.",
    );

    const getExplorerBlock = vi
      .fn()
      .mockResolvedValueOnce(block)
      .mockResolvedValue({ ...block, hash: "ef".repeat(32) });
    const getExplorerMetrics = vi
      .fn()
      .mockResolvedValueOnce({ ...metrics, finalized_block: 16 })
      .mockResolvedValue(metrics);
    await expect(
      waitForFinalizedTransaction(
        dependencies(getGlobalStatus, {
          getExplorerBlock,
          getExplorerMetrics,
        }),
      ),
    ).rejects.toThrow(
      "The transaction block changed across finality evidence reads.",
    );
  });

  it("rejects authoritative Applied rollback after a pending finality read", async () => {
    const getGlobalStatus = vi
      .fn()
      .mockResolvedValueOnce(
        status("Applied", { resolvedFrom: "state", blockHeight: 17 }),
      )
      .mockResolvedValueOnce(
        status("Committed", { resolvedFrom: "cache", blockHeight: 17 }),
      );
    const getExplorerMetrics = vi.fn().mockResolvedValue({
      ...metrics,
      finalized_block: 16,
    });

    await expect(
      waitForFinalizedTransaction(
        dependencies(getGlobalStatus, { getExplorerMetrics }),
      ),
    ).rejects.toThrow(
      "Authoritative transaction state rolled back after Applied was observed.",
    );
  });

  it("enforces a finite attempt budget even when the injected clock never advances", async () => {
    const getGlobalStatus = vi
      .fn()
      .mockResolvedValue(
        status("Committed", { resolvedFrom: "cache", blockHeight: 17 }),
      );

    await expect(
      waitForFinalizedTransaction({
        ...dependencies(getGlobalStatus, {
          now: () => 0,
          wait: async () => undefined,
        }),
        timeoutMs: 2,
        intervalMs: 1,
      }),
    ).rejects.toThrow("3-attempt safety limit");
    expect(getGlobalStatus).toHaveBeenCalledTimes(3);
  });

  it("rejects whitespace and unmarked values instead of normalizing transaction hashes", async () => {
    await expect(
      waitForFinalizedTransaction({
        ...dependencies(async () => null),
        hashHex: ` ${HASH}`,
      }),
    ).rejects.toBeInstanceOf(TransactionFinalityIntegrityError);
    expect(() =>
      assertTransactionFinalityProof(
        {
          status: "finalized",
          transactionHash: "aa".repeat(32),
          blockHeight: 17,
          blockHash: BLOCK_HASH,
          finalizedBlockHeight: 17,
        },
        "aa".repeat(32),
      ),
    ).toThrow("Iroha hash with its marker set");
  });
});

import { describe, expect, it } from "vitest";
import { assertFinalizedTransactionResult } from "@/utils/transactionFinality";

const HASH = "a".repeat(64);
const proof = {
  status: "finalized",
  transactionHash: HASH,
  blockHeight: 17,
  blockHash: "b".repeat(64),
  finalizedBlockHeight: 19,
};

describe("renderer transaction finality boundary", () => {
  it("accepts an exact finalized-block proof", () => {
    expect(
      assertFinalizedTransactionResult({
        hash: HASH,
        finality: proof,
      }),
    ).toEqual({
      hash: HASH,
      finality: proof,
    });
  });

  it("rejects acceptance without finalized-block proof", () => {
    expect(() =>
      assertFinalizedTransactionResult({
        hash: HASH,
        accepted: true,
      }),
    ).toThrow("Transaction finality proof must be an object");
  });

  it("rejects a proof for a different transaction", () => {
    expect(() =>
      assertFinalizedTransactionResult({
        hash: "c".repeat(64),
        finality: proof,
      }),
    ).toThrow("does not match the submitted transaction");
  });

  it("rejects a transaction block above finality", () => {
    expect(() =>
      assertFinalizedTransactionResult(
        {
          tx_hash_hex: HASH,
          finality: {
            ...proof,
            finalizedBlockHeight: 16,
          },
        },
        "tx_hash_hex",
      ),
    ).toThrow("above the finalized ledger height");
  });
});

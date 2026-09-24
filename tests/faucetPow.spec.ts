import { describe, expect, it } from "vitest";
import { NetworkId } from "@iroha/iroha-js";

import {
  buildFaucetPowDigest,
  decodeFaucetPowPuzzle,
  leadingZeroBits,
  solveFaucetPowPuzzle,
  type FaucetPowPuzzle,
} from "../electron/faucetPow";

const NETWORK_ID = NetworkId.parse(
  "hash:77FB29D14745ADCCFDC14350E1A6FE6A10265798CC936A1DAFA7D2552AC3B9F7#EBDD",
);

const basePuzzle: FaucetPowPuzzle = {
  algorithm: "scrypt-leading-zero-bits-v2",
  network_id: NETWORK_ID.toString(),
  chain_discriminant: 369,
  difficulty_bits: 4,
  anchor_height: 42,
  anchor_block_hash_hex:
    "4d7a5660c7f3f5fb9f0df1f6ee9ce4d2a0b8df4cb4aa9bb2f7cfbc4cb03e2b85",
  challenge_salt_hex:
    "abababababababababababababababababababababababababababababababab",
  scrypt_log_n: 4,
  scrypt_r: 1,
  scrypt_p: 1,
  max_anchor_age_blocks: 6,
};

describe("faucetPow", () => {
  it("decodes only the exact bounded v2 puzzle contract", () => {
    expect(decodeFaucetPowPuzzle(basePuzzle, NETWORK_ID, 369)).toEqual(
      basePuzzle,
    );

    for (const invalid of [
      { ...basePuzzle, difficulty_bits: 21 },
      { ...basePuzzle, difficulty_bits: 4.5 },
      { ...basePuzzle, scrypt_log_n: 16 },
      { ...basePuzzle, scrypt_r: 9 },
      { ...basePuzzle, scrypt_p: 3 },
      { ...basePuzzle, max_anchor_age_blocks: 10_001 },
      { ...basePuzzle, anchor_block_hash_hex: "AA".repeat(32) },
      { ...basePuzzle, extra: true },
    ]) {
      expect(() => decodeFaucetPowPuzzle(invalid, NETWORK_ID, 369)).toThrow();
    }
  });

  it("counts leading zero bits", () => {
    expect(leadingZeroBits(Uint8Array.from([0x00, 0x00, 0x10]))).toBe(19);
    expect(leadingZeroBits(Uint8Array.from([0xff]))).toBe(0);
  });

  it("builds a stable digest for the faucet challenge", () => {
    const digest = buildFaucetPowDigest(
      "alice@test",
      basePuzzle.anchor_height,
      basePuzzle.anchor_block_hash_hex,
      "0000000000000001",
      {
        networkId: NETWORK_ID,
        challengeSaltHex: basePuzzle.challenge_salt_hex,
        scryptLogN: basePuzzle.scrypt_log_n,
        scryptR: basePuzzle.scrypt_r,
        scryptP: basePuzzle.scrypt_p,
      },
    );
    expect(digest).toHaveLength(32);
    expect(digest.toString("hex")).toBe(
      "6481ebe9ad80954bd7629414f5a95123f52d6f14fbde40bc48a6bdac301fe9a4",
    );
  });

  it("solves a faucet proof-of-work puzzle asynchronously", async () => {
    const solved = await solveFaucetPowPuzzle("alice@test", basePuzzle, {
      maxAttempts: 512,
      concurrency: 2,
    });
    const digest = buildFaucetPowDigest(
      "alice@test",
      solved.anchorHeight,
      basePuzzle.anchor_block_hash_hex,
      solved.nonceHex,
      {
        networkId: NETWORK_ID,
        challengeSaltHex: basePuzzle.challenge_salt_hex,
        scryptLogN: basePuzzle.scrypt_log_n,
        scryptR: basePuzzle.scrypt_r,
        scryptP: basePuzzle.scrypt_p,
      },
    );
    expect(solved.attempts).toBeGreaterThan(0);
    expect(leadingZeroBits(digest)).toBeGreaterThanOrEqual(
      basePuzzle.difficulty_bits,
    );
  });

  it("stops solving when the request is canceled", async () => {
    const controller = new AbortController();
    controller.abort(new Error("Faucet request canceled."));

    await expect(
      solveFaucetPowPuzzle("alice@test", basePuzzle, {
        maxAttempts: 512,
        concurrency: 2,
        signal: controller.signal,
      }),
    ).rejects.toThrow("Faucet request canceled.");
  });

  it("rejects unsupported puzzle algorithms", async () => {
    await expect(
      solveFaucetPowPuzzle("alice@test", {
        ...basePuzzle,
        algorithm:
          "sha256-leading-zero-bits-v1" as FaucetPowPuzzle["algorithm"],
      }),
    ).rejects.toThrow("Unsupported faucet PoW algorithm");
  });

  it("fails when the max attempt budget is too small", async () => {
    await expect(
      solveFaucetPowPuzzle(
        "alice@test",
        {
          ...basePuzzle,
          difficulty_bits: 8,
        },
        { maxAttempts: 1, concurrency: 1 },
      ),
    ).rejects.toThrow(
      "Failed to solve the faucet proof-of-work puzzle in time.",
    );
  });

  it("rejects caller budgets above the local resource ceiling", async () => {
    await expect(
      solveFaucetPowPuzzle("alice@test", basePuzzle, {
        maxAttempts: 1_048_577,
      }),
    ).rejects.toThrow("max attempts");
    await expect(
      solveFaucetPowPuzzle("alice@test", basePuzzle, { concurrency: 5 }),
    ).rejects.toThrow("concurrency");
  });

  it("accepts puzzles without a VRF salt", () => {
    const digest = buildFaucetPowDigest(
      "alice@test",
      basePuzzle.anchor_height,
      basePuzzle.anchor_block_hash_hex,
      "0000000000000001",
      {
        networkId: NETWORK_ID,
        challengeSaltHex: null,
        scryptLogN: basePuzzle.scrypt_log_n,
        scryptR: basePuzzle.scrypt_r,
        scryptP: basePuzzle.scrypt_p,
      },
    );
    expect(digest).toHaveLength(32);
    expect(digest.toString("hex")).not.toBe(
      "6481ebe9ad80954bd7629414f5a95123f52d6f14fbde40bc48a6bdac301fe9a4",
    );
  });
});

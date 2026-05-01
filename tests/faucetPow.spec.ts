import { describe, expect, it } from "vitest";

import {
  buildFaucetPowDigest,
  leadingZeroBits,
  solveFaucetPowPuzzle,
  type FaucetPowPuzzle,
} from "../electron/faucetPow";

const basePuzzle: FaucetPowPuzzle = {
  algorithm: "scrypt-leading-zero-bits-v1",
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
        challengeSaltHex: basePuzzle.challenge_salt_hex,
        scryptLogN: basePuzzle.scrypt_log_n,
        scryptR: basePuzzle.scrypt_r,
        scryptP: basePuzzle.scrypt_p,
      },
    );
    expect(digest).toHaveLength(32);
    expect(digest.toString("hex")).toBe(
      "eb063260e99b7b31c7fdd0f6039c1df778c52bdd55d214d302f2ed8954024bc1",
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
        algorithm: "sha256-leading-zero-bits-v1",
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

  it("accepts puzzles without a VRF salt", () => {
    const digest = buildFaucetPowDigest(
      "alice@test",
      basePuzzle.anchor_height,
      basePuzzle.anchor_block_hash_hex,
      "0000000000000001",
      {
        scryptLogN: basePuzzle.scrypt_log_n,
        scryptR: basePuzzle.scrypt_r,
        scryptP: basePuzzle.scrypt_p,
      },
    );
    expect(digest).toHaveLength(32);
    expect(digest.toString("hex")).not.toBe(
      "eb063260e99b7b31c7fdd0f6039c1df778c52bdd55d214d302f2ed8954024bc1",
    );
  });
});

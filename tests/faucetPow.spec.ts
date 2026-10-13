import { describe, expect, it } from "vitest";
import { NetworkId } from "@iroha/iroha-js";

import {
  buildFaucetPowChallenge,
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
  algorithm: "scrypt-leading-zero-bits-v1",
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
  it("decodes only the exact bounded v1 puzzle contract", () => {
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
      // The pre-release v2 label is not served by current Torii.
      { ...basePuzzle, algorithm: "scrypt-leading-zero-bits-v2" },
    ]) {
      expect(() => decodeFaucetPowPuzzle(invalid, NETWORK_ID, 369)).toThrow();
    }
  });

  it("matches the Torii/iroha_wallet v1 challenge preimage vector", () => {
    // crates/iroha_wallet/src/faucet_pow.rs faucet_challenge_matches_v1_preimage_vector
    const challenge = buildFaucetPowChallenge(
      "sorauﾛ1NｲﾘｳdPBeｼRoｸQ2ﾔgｼQqeｶﾍｽﾁhRW2ｺｿZ9ﾕｦUﾅRX5NJYH53",
      NetworkId.fromBytes(
        Buffer.from(
          "32c903e5b3497e34c2b844ebfe8a39c19e6cf8f95d44c1ffb8ba9dcb42f91149",
          "hex",
        ),
      ),
      68,
      "d5c0016a6345e8ea379da42aab1fdc16ba82756e19e0b63c48c14735e8caf7ef",
      null,
    );
    expect(challenge.toString("hex")).toBe(
      "21e547302359214b28f0d1e0b04b6aeaf62a0e597dbad018d93ab0ce6af81a05",
    );
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
      "651c3411aeadf70d44b6bffa97c40c667695c1e48b37c732e0c3f8e0db08a61b",
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
      "651c3411aeadf70d44b6bffa97c40c667695c1e48b37c732e0c3f8e0db08a61b",
    );
  });
});

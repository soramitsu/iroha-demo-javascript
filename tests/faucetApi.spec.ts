import { describe, expect, it, vi } from "vitest";
import { AccountAddress } from "@iroha/iroha-js";

import {
  type FaucetRequestProgress,
  requestFaucetFundsWithPuzzle,
  shouldRetryFaucetPuzzle,
} from "../electron/faucetApi";
import type { FaucetPowPuzzle } from "../electron/faucetPow";

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

const SAMPLE_PUBLIC_KEY_HEX =
  "CE7FA46C9DCE7EA4B125E2E36BDB63EA33073E7590AC92816AE1E861B7048B03";
const testnetAccountId = AccountAddress.fromAccount({
  publicKey: Buffer.from(SAMPLE_PUBLIC_KEY_HEX, "hex"),
}).toI105(369);
const soraAccountId = AccountAddress.fromAccount({
  publicKey: Buffer.from(SAMPLE_PUBLIC_KEY_HEX, "hex"),
}).toI105();

describe("faucetApi", () => {
  it("canonicalizes the account literal onto the active network before solving and posting the faucet proof", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            NotPermitted: "faucet pow vrf seed unavailable",
          }),
          {
            status: 403,
            statusText: "Forbidden",
            headers: {
              "content-type": "application/json",
            },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(basePuzzle), {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            account_id: testnetAccountId,
            asset_definition_id: "xor#sora",
            asset_id: `xor#sora#${testnetAccountId}`,
            amount: "25000",
            tx_hash_hex: "0xabc",
            status: "QUEUED",
          }),
          {
            status: 202,
            headers: {
              "content-type": "application/json",
            },
          },
        ),
      );
    const sleep = vi.fn().mockResolvedValue(undefined);
    const solvePuzzle = vi.fn().mockResolvedValue({
      anchorHeight: basePuzzle.anchor_height,
      nonceHex: "0000000000000001",
      attempts: 2,
    });

    const result = await requestFaucetFundsWithPuzzle({
      baseUrl: "https://taira.sora.org",
      accountId: soraAccountId,
      networkPrefix: 369,
      fetchImpl,
      sleep,
      solvePuzzle,
      puzzleRetryAttempts: 2,
      puzzleRetryDelayMs: 125,
    });

    expect(sleep).toHaveBeenCalledWith(125);
    expect(solvePuzzle).toHaveBeenCalledWith(testnetAccountId, basePuzzle);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      "https://taira.sora.org/v1/accounts/faucet/puzzle",
      expect.objectContaining({
        method: "GET",
      }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      3,
      "https://taira.sora.org/v1/accounts/faucet",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          account_id: testnetAccountId,
          pow_anchor_height: 42,
          pow_nonce_hex: "0000000000000001",
        }),
      }),
    );
    expect(result.tx_hash_hex).toBe("0xabc");
  });

  it("reports faucet progress while retrying, solving, and submitting", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            NotPermitted: "faucet pow vrf seed unavailable",
          }),
          {
            status: 403,
            statusText: "Forbidden",
            headers: {
              "content-type": "application/json",
            },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(basePuzzle), {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            account_id: testnetAccountId,
            asset_definition_id: "xor#sora",
            asset_id: `xor#sora#${testnetAccountId}`,
            amount: "25000",
            tx_hash_hex: "0xdef",
            status: "QUEUED",
          }),
          {
            status: 202,
            headers: {
              "content-type": "application/json",
            },
          },
        ),
      );
    const onStatus =
      vi.fn<(progress: FaucetRequestProgress) => void | Promise<void>>();

    await requestFaucetFundsWithPuzzle({
      baseUrl: "https://taira.sora.org",
      accountId: testnetAccountId,
      networkPrefix: 369,
      fetchImpl,
      sleep: vi.fn().mockResolvedValue(undefined),
      solvePuzzle: vi.fn().mockResolvedValue({
        anchorHeight: basePuzzle.anchor_height,
        nonceHex: "0000000000000002",
        attempts: 4,
      }),
      puzzleRetryAttempts: 2,
      onStatus,
    });

    expect(onStatus.mock.calls.map(([progress]) => progress.phase)).toEqual([
      "requestingPuzzle",
      "waitingForPuzzleRetry",
      "requestingPuzzle",
      "solvingPuzzle",
      "submittingClaim",
    ]);
  });

  it("maps Norito faucet validation failures to a readable stale-proof message", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(basePuzzle), {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          new Uint8Array([0x4e, 0x52, 0x54, 0x30, 0x00, 0x00, 0x00, 0x00]),
          {
            status: 400,
            statusText: "Bad Request",
            headers: {
              "content-type": "application/x-norito",
            },
          },
        ),
      );

    await expect(
      requestFaucetFundsWithPuzzle({
        baseUrl: "https://taira.sora.org",
        accountId: testnetAccountId,
        networkPrefix: 369,
        fetchImpl,
        solvePuzzle: vi.fn().mockResolvedValue({
          anchorHeight: basePuzzle.anchor_height,
          nonceHex: "0000000000000003",
          attempts: 1,
        }),
      }),
    ).rejects.toThrow(
      "Faucet request failed (400): The network rejected this faucet claim. Stale faucet proof challenges can trigger this response; request a fresh puzzle and try again.",
    );
  });

  it("does not retry non-retryable faucet puzzle failures and preserves the detail", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          NotPermitted: "Account faucet disabled",
        }),
        {
          status: 403,
          statusText: "Forbidden",
          headers: {
            "content-type": "application/json",
          },
        },
      ),
    );
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(
      requestFaucetFundsWithPuzzle({
        baseUrl: "https://taira.sora.org",
        accountId: testnetAccountId,
        networkPrefix: 369,
        fetchImpl,
        sleep,
        puzzleRetryAttempts: 3,
      }),
    ).rejects.toThrow("Faucet puzzle failed (403): Account faucet disabled");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("prefers nested faucet puzzle details over generic wrapper messages", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          message: "Faucet puzzle failed.",
          details: {
            NotPermitted: "Account faucet disabled",
          },
        }),
        {
          status: 403,
          statusText: "Forbidden",
          headers: {
            "content-type": "application/json",
          },
        },
      ),
    );

    await expect(
      requestFaucetFundsWithPuzzle({
        baseUrl: "https://taira.sora.org",
        accountId: testnetAccountId,
        networkPrefix: 369,
        fetchImpl,
      }),
    ).rejects.toThrow("Faucet puzzle failed (403): Account faucet disabled");
  });

  it("identifies retryable faucet puzzle failures", () => {
    expect(
      shouldRetryFaucetPuzzle(403, "faucet pow vrf seed unavailable"),
    ).toBe(true);
    expect(shouldRetryFaucetPuzzle(403, "Account faucet disabled")).toBe(false);
    expect(
      shouldRetryFaucetPuzzle(400, "faucet pow vrf seed unavailable"),
    ).toBe(false);
  });
});

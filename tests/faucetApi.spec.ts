import { describe, expect, it, vi } from "vitest";
import { AccountAddress } from "@iroha/iroha-js";

import {
  type FaucetRequestProgress,
  isDecimalLessThan,
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

  it("aborts an in-flight faucet puzzle request when canceled", async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(
      async (_input: Parameters<typeof fetch>[0], init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(init.signal?.reason),
            { once: true },
          );
        }),
    );

    const requestPromise = requestFaucetFundsWithPuzzle({
      baseUrl: "https://taira.sora.org",
      accountId: testnetAccountId,
      networkPrefix: 369,
      fetchImpl,
      signal: controller.signal,
    });
    await Promise.resolve();

    controller.abort(new Error("Faucet request canceled."));

    await expect(requestPromise).rejects.toThrow("Faucet request canceled.");
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://taira.sora.org/v1/accounts/faucet/puzzle",
      expect.objectContaining({
        signal: controller.signal,
      }),
    );
  });

  it("maps generic Norito faucet validation failures to a readable message", async () => {
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
        baseUrl: "https://faucet.example",
        accountId: testnetAccountId,
        networkPrefix: 369,
        fetchImpl,
        puzzleRetryAttempts: 1,
        solvePuzzle: vi.fn().mockResolvedValue({
          anchorHeight: basePuzzle.anchor_height,
          nonceHex: "0000000000000003",
          attempts: 1,
        }),
      }),
    ).rejects.toThrow(
      "Faucet request failed (400): The network rejected this faucet claim but did not return a readable reason. The endpoint may not support this faucet, or the proof challenge may be stale.",
    );
  });

  it("reports the known TAIRA faucet as depleted when its authority balance cannot cover a claim", async () => {
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
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [
              {
                account_id: "faucet",
                asset: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
                quantity: "8427.65210",
              },
            ],
          }),
          {
            status: 200,
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
        puzzleRetryAttempts: 3,
        solvePuzzle: vi.fn().mockResolvedValue({
          anchorHeight: basePuzzle.anchor_height,
          nonceHex: "0000000000000003",
          attempts: 1,
        }),
      }),
    ).rejects.toThrow(
      "Faucet request failed (400): TAIRA faucet is out of funds. The faucet authority has 8427.65210 XOR available, but each claim requires 25000 XOR.",
    );
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(fetchImpl).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("/v1/accounts/"),
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("requests a fresh puzzle when a solved faucet proof is rejected as stale", async () => {
    const refreshedPuzzle = {
      ...basePuzzle,
      anchor_height: basePuzzle.anchor_height + 1,
    };
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
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(refreshedPuzzle), {
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
            tx_hash_hex: "0xretry",
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
    const solvePuzzle = vi
      .fn()
      .mockResolvedValueOnce({
        anchorHeight: basePuzzle.anchor_height,
        nonceHex: "0000000000000004",
        attempts: 1,
      })
      .mockResolvedValueOnce({
        anchorHeight: refreshedPuzzle.anchor_height,
        nonceHex: "0000000000000005",
        attempts: 2,
      });
    const onStatus =
      vi.fn<(progress: FaucetRequestProgress) => void | Promise<void>>();

    const result = await requestFaucetFundsWithPuzzle({
      baseUrl: "https://faucet.example",
      accountId: testnetAccountId,
      networkPrefix: 369,
      fetchImpl,
      sleep,
      solvePuzzle,
      puzzleRetryAttempts: 2,
      puzzleRetryDelayMs: 250,
      onStatus,
    });

    expect(result.tx_hash_hex).toBe("0xretry");
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(solvePuzzle).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(250);
    expect(onStatus.mock.calls.map(([progress]) => progress.phase)).toEqual([
      "requestingPuzzle",
      "solvingPuzzle",
      "submittingClaim",
      "waitingForPuzzleRetry",
      "requestingPuzzle",
      "solvingPuzzle",
      "submittingClaim",
    ]);
  });

  it("also retries stale-proof text returned as JSON", async () => {
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
          JSON.stringify({
            detail:
              "Stale faucet proof challenges can trigger this response; request a fresh puzzle and try again.",
          }),
          {
            status: 400,
            statusText: "Bad Request",
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
            tx_hash_hex: "0xjson-retry",
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

    const result = await requestFaucetFundsWithPuzzle({
      baseUrl: "https://taira.sora.org",
      accountId: testnetAccountId,
      networkPrefix: 369,
      fetchImpl,
      sleep: vi.fn().mockResolvedValue(undefined),
      solvePuzzle: vi.fn().mockResolvedValue({
        anchorHeight: basePuzzle.anchor_height,
        nonceHex: "0000000000000006",
        attempts: 1,
      }),
      puzzleRetryAttempts: 2,
    });

    expect(result.tx_hash_hex).toBe("0xjson-retry");
    expect(fetchImpl).toHaveBeenCalledTimes(4);
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
    ).rejects.toThrow(
      "Faucet puzzle failed (403): The TAIRA endpoint has its account faucet disabled. This is an endpoint/operator configuration problem, not a wallet problem; ask a TAIRA operator to enable the faucet.",
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("preserves readable faucet details embedded in Norito puzzle failures", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        new Uint8Array([
          ...Buffer.from("NRT0", "utf8"),
          0x00,
          0x00,
          0xff,
          0x18,
          0x17,
          ...Buffer.from("Account faucet disabled", "utf8"),
        ]),
        {
          status: 403,
          statusText: "Forbidden",
          headers: {
            "content-type": "application/x-norito",
          },
        },
      ),
    );

    await expect(
      requestFaucetFundsWithPuzzle({
        baseUrl: "https://minamoto.sora.org",
        accountId: soraAccountId,
        networkPrefix: 753,
        fetchImpl,
      }),
    ).rejects.toThrow(
      "Faucet puzzle failed (403): This endpoint does not provide starter funds. Minamoto mainnet has no faucet; switch Settings to the TAIRA testnet preset or use an already-funded account.",
    );
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
    ).rejects.toThrow(
      "Faucet puzzle failed (403): The TAIRA endpoint has its account faucet disabled. This is an endpoint/operator configuration problem, not a wallet problem; ask a TAIRA operator to enable the faucet.",
    );
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

  it("compares decimal faucet balances without losing precision", () => {
    expect(isDecimalLessThan("8427.65210", "25000")).toBe(true);
    expect(isDecimalLessThan("25000.00000", "25000")).toBe(false);
    expect(isDecimalLessThan("25000.00001", "25000")).toBe(false);
    expect(isDecimalLessThan("not a number", "25000")).toBe(false);
  });
});

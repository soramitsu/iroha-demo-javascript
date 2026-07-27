import { describe, expect, it, vi } from "vitest";
import { AccountAddress } from "@iroha/iroha-js";

import {
  type FaucetRequestProgress,
  decodeAccountFaucetResponse,
  isDecimalLessThan,
  requestFaucetFundsWithPuzzle,
  shouldRetryFaucetPuzzle,
} from "../electron/faucetApi";
import type { FaucetPowPuzzle } from "../electron/faucetPow";

const TAIRA_CHAIN_ID = "fc56984b-2be7-431d-840e-21514d1883f0";
const MINAMOTO_CHAIN_ID = "00000000-0000-0000-0000-000000000000";
const TAIRA_XOR_ASSET_DEFINITION_ID = "6TEAJqbb8oEPmLncoNiMRbLEK6tw";
const OTHER_ASSET_DEFINITION_ID = "61CtjvNd9T3THAR65GsMVHr82Bjc";
const FAUCET_TX_HASH = "ab".repeat(32);
const RETRY_TX_HASH = "cd".repeat(32);
const JSON_RETRY_TX_HASH = "ef".repeat(32);

const basePuzzle: FaucetPowPuzzle = {
  algorithm: "scrypt-leading-zero-bits-v1",
  chain_id: TAIRA_CHAIN_ID,
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

const SAMPLE_PUBLIC_KEY_HEX =
  "CE7FA46C9DCE7EA4B125E2E36BDB63EA33073E7590AC92816AE1E861B7048B03";
const testnetAccountId = AccountAddress.fromAccount({
  publicKey: Buffer.from(SAMPLE_PUBLIC_KEY_HEX, "hex"),
}).toI105(369);
const soraAccountId = AccountAddress.fromAccount({
  publicKey: Buffer.from(SAMPLE_PUBLIC_KEY_HEX, "hex"),
}).toI105();

const accountFaucetResponse = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  account_id: testnetAccountId,
  asset_definition_id: TAIRA_XOR_ASSET_DEFINITION_ID,
  asset_id: `${TAIRA_XOR_ASSET_DEFINITION_ID}#${testnetAccountId}`,
  amount: "25000",
  tx_hash_hex: FAUCET_TX_HASH,
  status: "QUEUED",
  ...overrides,
});

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
        new Response(JSON.stringify(accountFaucetResponse()), {
          status: 202,
          headers: {
            "content-type": "application/json",
          },
        }),
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
      chainId: TAIRA_CHAIN_ID,
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
    expect(result.tx_hash_hex).toBe(FAUCET_TX_HASH);
  });

  it("decodes only the exact first-release faucet success contract", () => {
    const decode = (value: unknown, baseUrl = "https://taira.sora.org") =>
      decodeAccountFaucetResponse(value, {
        requestedAccountId: testnetAccountId,
        networkPrefix: 369,
        baseUrl,
      });

    expect(decode(accountFaucetResponse())).toEqual(accountFaucetResponse());

    const missingStatus = accountFaucetResponse();
    delete missingStatus.status;
    expect(() => decode(missingStatus)).toThrow(
      "exactly the six first-release snake_case fields",
    );
    expect(() =>
      decode({ ...accountFaucetResponse(), fee: "not part of the DTO" }),
    ).toThrow("exactly the six first-release snake_case fields");
    expect(() =>
      decode(
        accountFaucetResponse({
          account_id: soraAccountId,
          asset_id: `${TAIRA_XOR_ASSET_DEFINITION_ID}#${soraAccountId}`,
        }),
      ),
    ).toThrow("does not exactly match the requested canonical account");
    expect(() =>
      decode(
        accountFaucetResponse({
          asset_definition_id: "xor#sora",
          asset_id: `xor#sora#${testnetAccountId}`,
        }),
      ),
    ).toThrow("must be a canonical Base58 asset definition ID");
    expect(() =>
      decode(
        accountFaucetResponse({
          asset_definition_id: "1".repeat(28),
          asset_id: `${"1".repeat(28)}#${testnetAccountId}`,
        }),
      ),
    ).toThrow("must be a canonical Base58 asset definition ID");
    expect(() =>
      decode(
        accountFaucetResponse({
          asset_id: `${TAIRA_XOR_ASSET_DEFINITION_ID}#${soraAccountId}`,
        }),
      ),
    ).toThrow("does not exactly bind");

    for (const amount of ["0", "025000", "25000.0"]) {
      expect(() =>
        decode(accountFaucetResponse({ amount }), "https://faucet.example"),
      ).toThrow("positive canonical Quantity string");
    }
    for (const txHashHex of ["0xabc", "AB".repeat(32), "a".repeat(63)]) {
      expect(() =>
        decode(accountFaucetResponse({ tx_hash_hex: txHashHex })),
      ).toThrow("exactly 64 lowercase hexadecimal characters");
    }
    expect(() => decode(accountFaucetResponse({ status: "Queued" }))).toThrow(
      "status must be exactly QUEUED",
    );
    expect(() => decode(accountFaucetResponse({ amount: "24999" }))).toThrow(
      "must be exactly 25000 XOR",
    );
    expect(() =>
      decode(
        accountFaucetResponse({
          asset_definition_id: OTHER_ASSET_DEFINITION_ID,
          asset_id: `${OTHER_ASSET_DEFINITION_ID}#${testnetAccountId}`,
        }),
      ),
    ).toThrow("did not fund the canonical XOR asset definition");
  });

  it("rejects TAIRA faucet puzzle metadata that advertises the wrong network", async () => {
    const puzzle = {
      ...basePuzzle,
      chain_discriminant: 753,
    };
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(JSON.stringify(puzzle), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      }),
    );
    const solvePuzzle = vi.fn().mockResolvedValue({
      anchorHeight: puzzle.anchor_height,
      nonceHex: "0000000000000007",
      attempts: 3,
    });

    await expect(
      requestFaucetFundsWithPuzzle({
        baseUrl: "https://taira.sora.org",
        accountId: testnetAccountId,
        chainId: TAIRA_CHAIN_ID,
        networkPrefix: 369,
        fetchImpl,
        solvePuzzle,
      }),
    ).rejects.toThrow(
      "Faucet endpoint network prefix mismatch: expected 369, got 753.",
    );
    expect(solvePuzzle).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects a custom endpoint puzzle whose chain id differs from the verified write connection", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ...basePuzzle,
          chain_id: "809574f5-fee7-5e69-bfcf-52451e42d50f",
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      ),
    );
    const solvePuzzle = vi.fn();

    await expect(
      requestFaucetFundsWithPuzzle({
        baseUrl: "https://custom-torii.example",
        accountId: testnetAccountId,
        chainId: TAIRA_CHAIN_ID,
        networkPrefix: 369,
        fetchImpl,
        solvePuzzle,
      }),
    ).rejects.toThrow(
      `Faucet endpoint chain id mismatch: expected ${TAIRA_CHAIN_ID}, got 809574f5-fee7-5e69-bfcf-52451e42d50f.`,
    );
    expect(solvePuzzle).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("fails closed when a puzzle omits the exact first-release identity fields", async () => {
    const puzzle = { ...basePuzzle };
    delete puzzle.chain_id;
    delete puzzle.chain_discriminant;
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ...puzzle,
          chainId: TAIRA_CHAIN_ID,
          networkPrefix: 369,
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      ),
    );
    const solvePuzzle = vi.fn();

    await expect(
      requestFaucetFundsWithPuzzle({
        baseUrl: "https://custom-torii.example",
        accountId: testnetAccountId,
        chainId: TAIRA_CHAIN_ID,
        networkPrefix: 369,
        fetchImpl,
        solvePuzzle,
      }),
    ).rejects.toThrow(
      "Faucet puzzle is missing a valid chain_discriminant network prefix.",
    );
    expect(solvePuzzle).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects an invalid verified network identity before any request", async () => {
    const fetchImpl = vi.fn<typeof fetch>();

    await expect(
      requestFaucetFundsWithPuzzle({
        baseUrl: "https://custom-torii.example",
        accountId: testnetAccountId,
        chainId: TAIRA_CHAIN_ID,
        networkPrefix: Number.NaN,
        fetchImpl,
      }),
    ).rejects.toThrow(
      "networkPrefix must be an integer between 0 and 16383 before requesting faucet funds.",
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("blocks Minamoto by verified identity before using a faucet route", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ...basePuzzle,
          chain_id: "00000000-0000-0000-0000-000000000000",
          chain_discriminant: 753,
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      ),
    );
    const solvePuzzle = vi.fn().mockResolvedValue({
      anchorHeight: basePuzzle.anchor_height,
      nonceHex: "0000000000000008",
      attempts: 1,
    });

    await expect(
      requestFaucetFundsWithPuzzle({
        baseUrl: "https://custom-mainnet.example",
        accountId: soraAccountId,
        chainId: MINAMOTO_CHAIN_ID,
        networkPrefix: 753,
        fetchImpl,
        solvePuzzle,
      }),
    ).rejects.toThrow("Minamoto mainnet must not expose a faucet.");
    expect(solvePuzzle).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("blocks the public Minamoto endpoint even when the requested identity claims TAIRA", async () => {
    const fetchImpl = vi.fn<typeof fetch>();

    await expect(
      requestFaucetFundsWithPuzzle({
        baseUrl: "https://minamoto.sora.org",
        accountId: testnetAccountId,
        chainId: TAIRA_CHAIN_ID,
        networkPrefix: 369,
        fetchImpl,
      }),
    ).rejects.toThrow("Minamoto mainnet must not expose a faucet.");
    expect(fetchImpl).not.toHaveBeenCalled();
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
          JSON.stringify(
            accountFaucetResponse({ tx_hash_hex: "bc".repeat(32) }),
          ),
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
      chainId: TAIRA_CHAIN_ID,
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
      chainId: TAIRA_CHAIN_ID,
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
        chainId: TAIRA_CHAIN_ID,
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
            total: 1,
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
        chainId: TAIRA_CHAIN_ID,
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
          JSON.stringify(accountFaucetResponse({ tx_hash_hex: RETRY_TX_HASH })),
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
      chainId: TAIRA_CHAIN_ID,
      networkPrefix: 369,
      fetchImpl,
      sleep,
      solvePuzzle,
      puzzleRetryAttempts: 2,
      puzzleRetryDelayMs: 250,
      onStatus,
    });

    expect(result.tx_hash_hex).toBe(RETRY_TX_HASH);
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
          JSON.stringify(
            accountFaucetResponse({ tx_hash_hex: JSON_RETRY_TX_HASH }),
          ),
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
      chainId: TAIRA_CHAIN_ID,
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

    expect(result.tx_hash_hex).toBe(JSON_RETRY_TX_HASH);
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
        chainId: TAIRA_CHAIN_ID,
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
        chainId: MINAMOTO_CHAIN_ID,
        networkPrefix: 753,
        fetchImpl,
      }),
    ).rejects.toThrow(
      "Minamoto mainnet must not expose a faucet. Switch Settings to the TAIRA testnet preset to request starter XOR.",
    );
    expect(fetchImpl).not.toHaveBeenCalled();
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
        chainId: TAIRA_CHAIN_ID,
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

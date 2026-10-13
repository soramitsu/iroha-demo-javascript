// @vitest-environment node

import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { AccountAddress } from "@iroha/iroha-js/address";
import { NetworkId } from "@iroha/iroha-js/canonical-request";

import {
  buildFaucetPrepareRequest,
  decodeFaucetPolicy,
  decodePreparedFaucetEnvelope,
  faucetClaimSemanticHashHex,
  requestFaucetFundsWithPuzzle,
  waitForFaucetClaimApplied,
  type FaucetClaim,
  type FaucetRequestProgress,
  type RequestFaucetFundsInput,
} from "../electron/faucetApi";
import type { FaucetPowPuzzle } from "../electron/faucetPow";
import {
  TEST_PREVIOUS_TAIRA_NETWORK_ID,
  TEST_TAIRA_NETWORK_ID,
} from "./helpers/networkIdentityFixture";

const NETWORK_ID = NetworkId.parse(TEST_TAIRA_NETWORK_ID);
const XOR = "6TEAJqbb8oEPmLncoNiMRbLEK6tw";
const ACCOUNT = AccountAddress.fromAccount({
  publicKey: Buffer.from(
    "CE7FA46C9DCE7EA4B125E2E36BDB63EA33073E7590AC92816AE1E861B7048B03",
    "hex",
  ),
}).toI105(369);
// Live TAIRA faucet authority on 2026-10-13.
const FAUCET_AUTHORITY =
  "testuﾛ1Pｷﾁﾉﾛｶﾋ2rﾃﾏjﾑtﾒﾛヱﾑ6783ｸwoZPi5ﾑﾇfM5JﾌｼzﾕT5VTX6";
const REQUEST_ID = "22".repeat(32);
const TX_HASH =
  "78387d0684fa2ce1c5850bdd9e773141edd990aa30b289d4451a4bbd944ef5c5";
const WIRE_HEX = "01020304";
const NOW = 1_791_860_000_000;

const livePolicy = (overrides: Record<string, unknown> = {}) => ({
  schema_version: 1,
  network_id: TEST_TAIRA_NETWORK_ID,
  network_prefix: 369,
  authority: FAUCET_AUTHORITY,
  asset_definition_id: XOR,
  amount: "25000",
  ...overrides,
});

const livePuzzle = (overrides: Partial<FaucetPowPuzzle> = {}) => ({
  algorithm: "scrypt-leading-zero-bits-v1",
  network_id: TEST_TAIRA_NETWORK_ID,
  chain_discriminant: 369,
  difficulty_bits: 8,
  anchor_height: 69,
  anchor_block_hash_hex:
    "2ef9f606725572558c77b225664a0b96a62f34c44562280fc87270a303f6b4c3",
  challenge_salt_hex: null,
  scrypt_log_n: 13,
  scrypt_r: 8,
  scrypt_p: 1,
  max_anchor_age_blocks: 6,
  ...overrides,
});

const jsonResponse = (payload: unknown, status = 200) =>
  new Response(
    typeof payload === "string" ? payload : JSON.stringify(payload),
    {
      status,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    },
  );

const preparedEnvelope = (
  request: ReturnType<typeof buildFaucetPrepareRequest>,
  overrides: Record<string, unknown> = {},
) => ({
  schema: "iroha.prepared-transaction.v1",
  binding: request.binding,
  operation: "faucet",
  claim: request.claim,
  semantic_hash_hex: request.binding.semantic_hash_hex,
  account_id: request.claim.account_id,
  asset_definition_id: XOR,
  asset_id: `${XOR}#${request.claim.account_id}`,
  amount: "25000",
  transaction_hash_hex: TX_HASH,
  signed_transaction_wire_hex: WIRE_HEX,
  signed_transaction_wire_sha256: createHash("sha256")
    .update(Buffer.from(WIRE_HEX, "hex"))
    .digest("hex"),
  fee_payment: {
    payer: "authority",
    value: { charge_limits: [], gas_limit: null },
  },
  server_signature: "AA".repeat(64),
  ...overrides,
});

const submitResponse = (
  request: ReturnType<typeof buildFaucetPrepareRequest>,
  outcome: string,
) => ({
  schema: "iroha.prepared-transaction-submit.v1",
  binding: request.binding,
  operation: "faucet",
  transaction_hash_hex: TX_HASH,
  outcome,
});

const appliedStatus = (height = 70) => ({
  hash: TX_HASH,
  status: { kind: "Applied", block_height: height },
  scope: "global",
  resolved_from: "state",
});

type Harness = {
  input: RequestFaucetFundsInput;
  fetchImpl: ReturnType<typeof vi.fn>;
  calls: Array<{ path: string; method: string; body?: string }>;
  progress: FaucetRequestProgress["phase"][];
};

/** A scripted Torii: policy, puzzle, prepare and submit handlers per test. */
const harness = (routes: {
  policy?: () => Response;
  puzzle?: (attempt: number) => Response;
  prepare?: (body: string, attempt: number) => Response;
  submit?: (body: string, attempt: number) => Response;
  statuses?: unknown[];
}): Harness => {
  const calls: Harness["calls"] = [];
  const counters = { puzzle: 0, prepare: 0, submit: 0 };
  const fetchImpl = vi.fn(
    async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const path = new URL(String(input)).pathname;
      const body = typeof init?.body === "string" ? init.body : undefined;
      calls.push({ path, method: init?.method ?? "GET", body });
      switch (path) {
        case "/v1/accounts/faucet/policy":
          return (routes.policy ?? (() => jsonResponse(livePolicy())))();
        case "/v1/accounts/faucet/puzzle":
          counters.puzzle += 1;
          return (routes.puzzle ?? (() => jsonResponse(livePuzzle())))(
            counters.puzzle,
          );
        case "/v1/accounts/faucet/prepare": {
          counters.prepare += 1;
          if (routes.prepare) return routes.prepare(body!, counters.prepare);
          const request = JSON.parse(body!);
          return jsonResponse(JSON.stringify(preparedEnvelope(request)));
        }
        case "/v1/accounts/faucet": {
          counters.submit += 1;
          if (routes.submit) return routes.submit(body!, counters.submit);
          const envelope = JSON.parse(body!);
          return jsonResponse(
            submitResponse({ binding: envelope.binding } as never, "Pending"),
            202,
          );
        }
        default:
          return jsonResponse({ code: "route_not_found" }, 404);
      }
    },
  );
  const statuses = [
    ...(routes.statuses ?? [null, appliedStatus(), appliedStatus()]),
  ];
  const progress: Harness["progress"] = [];
  return {
    fetchImpl,
    calls,
    progress,
    input: {
      baseUrl: "https://taira.sora.org",
      accountId: ACCOUNT,
      chainId: "fc56984b-2be7-431d-840e-21514d1883f0",
      networkPrefix: 369,
      networkId: NETWORK_ID,
      fetchImpl,
      getGlobalStatus: vi.fn(async () =>
        statuses.length > 1 ? statuses.shift() : statuses[0],
      ),
      sleep: vi.fn(async () => {}),
      now: () => NOW,
      randomRequestId: () => REQUEST_ID,
      solvePuzzle: vi.fn(async () => ({
        anchorHeight: 69,
        nonceHex: "00000000000000ab",
        attempts: 1,
      })),
      onStatus: (status) => {
        progress.push(status.phase);
      },
    },
  };
};

describe("faucet prepared-transaction protocol values", () => {
  it("matches the Torii faucet semantic-hash vector", () => {
    // fixtures/prepared_transactions/prepared_transaction_signature_v1.json
    // (faucet_prepared) in the Iroha repository.
    expect(
      faucetClaimSemanticHashHex({
        account_id: "sorauﾛ1Prﾇuﾉﾉ4ﾒdﾛﾑｲﾄn5tﾆﾒrsR9ﾋ2Gｷ7gWeFzyﾁﾋﾁAHﾌTJQQ4L",
        pow_anchor_height: 42,
        pow_nonce_hex: "0001020304050607",
      }),
    ).toBe("58e15f1263d14c63ae86a489499b6106e9f8b4a4ec8251ba7bdf5e729cdf3169");
  });

  it("builds the exact prepare request contract", () => {
    const claim: FaucetClaim = {
      account_id: ACCOUNT,
      pow_anchor_height: 69,
      pow_nonce_hex: "00000000000000ab",
    };
    expect(
      buildFaucetPrepareRequest({
        claim,
        requestId: REQUEST_ID,
        executionExpiresAtUnixMs: NOW + 300_000,
      }),
    ).toEqual({
      schema: "iroha.accounts.faucet.prepare.v1",
      binding: {
        schema: "iroha.prepared-operation.binding.v1",
        semantic_hash_hex: faucetClaimSemanticHashHex(claim),
        kind: "faucet",
        request_id: REQUEST_ID,
        execution_expires_at_unix_ms: NOW + 300_000,
      },
      claim,
      fee_payment: {
        payer: "authority",
        value: { charge_limits: [], gas_limit: null },
      },
    });
    expect(() =>
      buildFaucetPrepareRequest({
        claim,
        requestId: "not-hex",
        executionExpiresAtUnixMs: NOW,
      }),
    ).toThrow("request_id");
  });

  it("binds the faucet policy to the attested endpoint identity", () => {
    expect(
      decodeFaucetPolicy(livePolicy(), {
        networkId: NETWORK_ID,
        networkPrefix: 369,
      }),
    ).toEqual({
      networkId: TEST_TAIRA_NETWORK_ID,
      networkPrefix: 369,
      authority: FAUCET_AUTHORITY,
      assetDefinitionId: XOR,
      amount: "25000",
    });
    for (const [policy, message] of [
      [
        livePolicy({ network_id: TEST_PREVIOUS_TAIRA_NETWORK_ID }),
        "attested NetworkId",
      ],
      [livePolicy({ network_prefix: 753 }), "network prefix"],
      [livePolicy({ amount: "0" }), "positive canonical"],
      [{ ...livePolicy(), extra: 1 }, "unsupported shape"],
    ] as const) {
      expect(() =>
        decodeFaucetPolicy(policy, {
          networkId: NETWORK_ID,
          networkPrefix: 369,
        }),
      ).toThrow(message);
    }
  });

  it("rejects prepared envelopes that do not bind the claim, policy, or wire", () => {
    const claim: FaucetClaim = {
      account_id: ACCOUNT,
      pow_anchor_height: 69,
      pow_nonce_hex: "00000000000000ab",
    };
    const request = buildFaucetPrepareRequest({
      claim,
      requestId: REQUEST_ID,
      executionExpiresAtUnixMs: NOW + 300_000,
    });
    const policy = decodeFaucetPolicy(livePolicy(), {
      networkId: NETWORK_ID,
      networkPrefix: 369,
    });
    const decode = (overrides: Record<string, unknown>) =>
      decodePreparedFaucetEnvelope(
        JSON.stringify(preparedEnvelope(request, overrides)),
        { binding: request.binding, claim, policy },
      );
    expect(decode({})).toMatchObject({
      transactionHashHex: TX_HASH,
      assetId: `${XOR}#${ACCOUNT}`,
      amount: "25000",
    });
    for (const [overrides, message] of [
      [{ amount: "50000" }, "advertised faucet policy"],
      [
        { asset_definition_id: "7ZepsJTHCVLKsrFFNZGSRGZgvBhv" },
        "advertised faucet policy",
      ],
      [{ asset_id: `${XOR}#${FAUCET_AUTHORITY}` }, "asset_id"],
      [{ signed_transaction_wire_sha256: "00".repeat(32) }, "SHA-256"],
      [
        { binding: { ...request.binding, request_id: "33".repeat(32) } },
        "binding",
      ],
      [{ claim: { ...claim, pow_nonce_hex: "01" } }, "solved claim"],
      [{ operation: "onboarding" }, "operation"],
    ] as const) {
      expect(() => decode(overrides as Record<string, unknown>)).toThrow(
        message,
      );
    }
  });

  it("waits for a confirmed Applied status resolved from state", async () => {
    const statuses: unknown[] = [
      null,
      {
        hash: TX_HASH,
        status: { kind: "Committed", block_height: 70 },
        scope: "global",
        resolved_from: "cache",
      },
      appliedStatus(70),
      appliedStatus(70),
    ];
    const sleep = vi.fn(async () => {});
    await expect(
      waitForFaucetClaimApplied({
        hashHex: TX_HASH,
        getGlobalStatus: async () => statuses.shift() ?? null,
        sleep,
        now: () => NOW,
        timeoutMs: 10_000,
        intervalMs: 1,
      }),
    ).resolves.toEqual({ blockHeight: 70 });
    expect(sleep).toHaveBeenCalledTimes(2);

    await expect(
      waitForFaucetClaimApplied({
        hashHex: TX_HASH,
        getGlobalStatus: async () => ({
          hash: TX_HASH,
          status: { kind: "Rejected" },
          scope: "global",
          resolved_from: "state",
        }),
        sleep,
        now: () => NOW,
        timeoutMs: 10_000,
        intervalMs: 1,
      }),
    ).rejects.toThrow("rejected by the network");

    let clock = NOW;
    await expect(
      waitForFaucetClaimApplied({
        hashHex: TX_HASH,
        getGlobalStatus: async () => null,
        sleep: async () => {
          clock += 5_000;
        },
        now: () => clock,
        timeoutMs: 10_000,
        intervalMs: 5_000,
      }),
    ).rejects.toThrow("still unknown");
  });
});

describe("requestFaucetFundsWithPuzzle", () => {
  it("runs policy, puzzle, prepare, verbatim submit, and Applied wait", async () => {
    const { input, calls, progress } = harness({});
    const result = await requestFaucetFundsWithPuzzle(input);

    expect(result).toEqual({
      account_id: ACCOUNT,
      asset_definition_id: XOR,
      asset_id: `${XOR}#${ACCOUNT}`,
      amount: "25000",
      tx_hash_hex: TX_HASH,
      status: "APPLIED",
      blockHeight: 70,
    });
    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
      "GET /v1/accounts/faucet/policy",
      "GET /v1/accounts/faucet/puzzle",
      "POST /v1/accounts/faucet/prepare",
      "POST /v1/accounts/faucet",
    ]);
    const prepare = JSON.parse(calls[2]!.body!);
    expect(prepare).toEqual(
      buildFaucetPrepareRequest({
        claim: {
          account_id: ACCOUNT,
          pow_anchor_height: 69,
          pow_nonce_hex: "00000000000000ab",
        },
        requestId: REQUEST_ID,
        executionExpiresAtUnixMs: NOW + 300_000,
      }),
    );
    // The prepared envelope is re-posted byte-for-byte.
    expect(calls[3]!.body).toBe(JSON.stringify(preparedEnvelope(prepare)));
    expect(input.solvePuzzle).toHaveBeenCalledWith(
      ACCOUNT,
      expect.objectContaining({ algorithm: "scrypt-leading-zero-bits-v1" }),
      expect.anything(),
    );
    expect(progress).toEqual([
      "requestingPuzzle",
      "solvingPuzzle",
      "submittingClaim",
      "waitingForFinality",
      "claimFinalized",
    ]);
  });

  it("re-solves a stale anchor under the same request identity", async () => {
    const { input, calls } = harness({
      prepare: (body, attempt) =>
        attempt === 1
          ? jsonResponse(
              {
                code: "faucet_invalid_request",
                message: "faucet pow anchor is stale",
              },
              400,
            )
          : jsonResponse(JSON.stringify(preparedEnvelope(JSON.parse(body)))),
    });
    await expect(requestFaucetFundsWithPuzzle(input)).resolves.toMatchObject({
      status: "APPLIED",
    });
    const prepares = calls.filter((call) => call.path.endsWith("/prepare"));
    expect(prepares).toHaveLength(2);
    expect(
      prepares.map((call) => JSON.parse(call.body!).binding.request_id),
    ).toEqual([REQUEST_ID, REQUEST_ID]);
    expect(calls.filter((call) => call.path.endsWith("/puzzle"))).toHaveLength(
      2,
    );
  });

  it("re-posts the identical envelope after a transient submit failure", async () => {
    const { input, calls } = harness({
      submit: (body, attempt) =>
        attempt === 1
          ? jsonResponse({ code: "unavailable", message: "busy" }, 503)
          : jsonResponse(
              submitResponse(
                { binding: JSON.parse(body).binding } as never,
                "Applied",
              ),
            ),
    });
    await requestFaucetFundsWithPuzzle(input);
    const submits = calls.filter((call) => call.path === "/v1/accounts/faucet");
    expect(submits).toHaveLength(2);
    expect(submits[0]!.body).toBe(submits[1]!.body);
  });

  it("fails when Torii reports the submitted transaction as Rejected", async () => {
    const { input } = harness({
      submit: (body) =>
        jsonResponse(
          submitResponse(
            { binding: JSON.parse(body).binding } as never,
            "Rejected",
          ),
        ),
    });
    await expect(requestFaucetFundsWithPuzzle(input)).rejects.toThrow(
      "rejected the faucet transaction",
    );
  });

  it("rejects a puzzle for a different network before solving", async () => {
    const { input } = harness({
      puzzle: () =>
        jsonResponse(
          livePuzzle({ network_id: TEST_PREVIOUS_TAIRA_NETWORK_ID }),
        ),
    });
    await expect(requestFaucetFundsWithPuzzle(input)).rejects.toThrow(
      "attested NetworkId",
    );
    expect(input.solvePuzzle).not.toHaveBeenCalled();
  });

  it("never submits a tampered prepared envelope", async () => {
    const { input, calls } = harness({
      prepare: (body) =>
        jsonResponse(
          JSON.stringify(
            preparedEnvelope(JSON.parse(body), { amount: "999999" }),
          ),
        ),
    });
    await expect(requestFaucetFundsWithPuzzle(input)).rejects.toThrow(
      "advertised faucet policy",
    );
    expect(calls.some((call) => call.path === "/v1/accounts/faucet")).toBe(
      false,
    );
  });

  it("explains a disabled faucet and blocks Minamoto before any request", async () => {
    const disabled = harness({
      policy: () =>
        jsonResponse(
          {
            code: "account_faucet_disabled",
            message: "This network does not provide a testnet faucet.",
          },
          503,
        ),
    });
    await expect(requestFaucetFundsWithPuzzle(disabled.input)).rejects.toThrow(
      "does not provide starter funds",
    );

    const minamoto = harness({});
    await expect(
      requestFaucetFundsWithPuzzle({
        ...minamoto.input,
        baseUrl: "https://minamoto.sora.org",
      }),
    ).rejects.toThrow("Minamoto mainnet must not expose a faucet");
    expect(minamoto.fetchImpl).not.toHaveBeenCalled();
  });

  it("retries a beacon-seed-unavailable puzzle and stops when canceled", async () => {
    const { input, calls } = harness({
      puzzle: (attempt) =>
        attempt === 1
          ? jsonResponse(
              {
                code: "faucet_invalid_request",
                message: "faucet pow beacon seed unavailable",
              },
              403,
            )
          : jsonResponse(livePuzzle()),
    });
    await expect(requestFaucetFundsWithPuzzle(input)).resolves.toMatchObject({
      status: "APPLIED",
    });
    expect(calls.filter((call) => call.path.endsWith("/puzzle"))).toHaveLength(
      2,
    );

    const controller = new AbortController();
    controller.abort(new Error("Faucet request canceled."));
    const canceled = harness({});
    await expect(
      requestFaucetFundsWithPuzzle({
        ...canceled.input,
        signal: controller.signal,
      }),
    ).rejects.toThrow("Faucet request canceled.");
    expect(canceled.fetchImpl).not.toHaveBeenCalled();
  });
});

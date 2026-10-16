import { describe, expect, it, vi } from "vitest";
import { AccountAddress } from "@iroha/iroha-js/address";
import {
  assertConfidentialPolicyProjectionAgreement,
  assertExplorerAccountQrMatchesRequestedAccount,
  extractApiErrorDetail,
  formatOnboardingError,
  normalizeAccountAssetListPayload as decodeAccountAssetListPayload,
  normalizeAssetDefinitionConfidentialPolicy,
  normalizeBaseUrl,
  normalizeConfidentialAssetPolicyPayload,
  normalizeExplorerAccountQrPayload,
  normalizeGovernanceCitizenCountPayload,
  normalizeGovernanceCouncilCurrentPayload,
  normalizeGovernanceUnlockStatsPayload,
  normalizeNexusLifecyclePayload,
  normalizePublicLaneRewardsPayload,
  normalizePublicLaneStakePayload,
  normalizePublicLaneValidatorsPayload,
  parseNexusLifecycleJson,
  readApiErrorDetail,
  readNexusUnbondingDelayMs,
  sanitizeFetchHeaders,
  sanitizeFetchInit,
  stripConfidentialFeeSponsor,
} from "../electron/preload-utils";

const XOR_ASSET_DEFINITION_ID = "6TEAJqbb8oEPmLncoNiMRbLEK6tw";
const accountIdFor = (publicKeyHex: string) =>
  AccountAddress.fromAccount({
    publicKey: Uint8Array.from(
      publicKeyHex.match(/.{2}/gu)!.map((byte) => Number.parseInt(byte, 16)),
    ),
  }).toI105(753);
const ACCOUNT_ID = accountIdFor(
  "d04ab232742bb4ab3a1368bd4615e4e6d0224ab71a016baf8520a332c9778737",
);
const OTHER_ACCOUNT_ID = accountIdFor(
  "a09aa5f47a6759802ff955f8dc2d2a14a5c99d23be97f864127ff9383455a4f0",
);
const normalizeAccountAssetListPayload = (payload: unknown) =>
  decodeAccountAssetListPayload(payload, {
    expectedAccountId: ACCOUNT_ID,
    networkPrefix: 753,
    maximumItems: 500,
  });

describe("preload utils", () => {
  it("normalizes Torii base URLs", () => {
    expect(normalizeBaseUrl("https://torii.example/")).toBe(
      "https://torii.example",
    );
    expect(normalizeBaseUrl("http://127.0.0.1:8080")).toBe(
      "http://127.0.0.1:8080",
    );
    expect(() => normalizeBaseUrl("127.0.0.1:8080")).toThrow(
      "valid absolute URL",
    );
    expect(() => normalizeBaseUrl(" https://torii.example")).toThrow(
      "canonical non-empty text",
    );
    expect(() => normalizeBaseUrl("https://user:pass@torii.example")).toThrow(
      "without credentials",
    );
    expect(() => normalizeBaseUrl("https://torii.example?route=other")).toThrow(
      "without credentials",
    );
    expect(() => normalizeBaseUrl("http://torii.example")).toThrow(
      "must use HTTPS",
    );
    expect(() =>
      normalizeBaseUrl(`https://${"a".repeat(2_048)}.example`),
    ).toThrow("canonical non-empty text");
  });

  it("strips fee sponsorship from confidential relay metadata while preserving gas asset hints", () => {
    expect(
      stripConfidentialFeeSponsor({
        fee_sponsor: "testu123",
        gas_asset_id: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
        gas_limit: 123,
      }),
    ).toEqual({
      gas_asset_id: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
      gas_limit: 123,
    });
    expect(stripConfidentialFeeSponsor(undefined)).toBeUndefined();
    expect(
      stripConfidentialFeeSponsor({
        fee_sponsor: "testu123",
      }),
    ).toBeUndefined();
  });

  it("formats onboarding 403 errors with explicit UAID guidance", () => {
    expect(
      formatOnboardingError({
        status: 403,
        statusText: "Forbidden",
        detail: "torii.onboarding.enabled is false",
      }),
    ).toBe(
      "Alias registration failed with status 403 (Forbidden): UAID alias registration is disabled on this Torii endpoint. Save the wallet locally instead, or use authority registration if you need the account on-chain. Detail: torii.onboarding.enabled is false",
    );
    expect(
      formatOnboardingError({
        status: 403,
        statusText: "Forbidden",
      }),
    ).toBe(
      "Alias registration failed with status 403 (Forbidden): UAID alias registration is disabled on this Torii endpoint. Save the wallet locally instead, or use authority registration if you need the account on-chain.",
    );
  });

  it("formats non-403 onboarding errors using response details when present", () => {
    expect(
      formatOnboardingError({
        status: 500,
        statusText: "Internal Server Error",
        detail: "unexpected backend failure",
      }),
    ).toBe(
      "Alias registration failed with status 500 (Internal Server Error): unexpected backend failure",
    );
    expect(
      formatOnboardingError({
        status: 429,
        statusText: "Too Many Requests",
      }),
    ).toBe("Alias registration failed with status 429 (Too Many Requests)");
  });

  it("normalizes fetch headers from multiple input formats", () => {
    const fromHeaders = sanitizeFetchHeaders(
      new Headers({
        Accept: "application/json",
      }),
    );
    expect(Array.isArray(fromHeaders)).toBe(true);
    expect(fromHeaders).toContainEqual(["accept", "application/json"]);

    expect(
      sanitizeFetchHeaders([
        ["x-int", 42],
        ["x-bool", false],
      ]),
    ).toEqual([
      ["x-int", "42"],
      ["x-bool", "false"],
    ]);

    expect(
      sanitizeFetchHeaders({
        "x-ok": 123,
        "x-null": null,
        "x-undef": undefined,
      }),
    ).toEqual({
      "x-ok": "123",
    });
  });

  it("sanitizes fetch init headers without mutating passthroughs", () => {
    expect(sanitizeFetchInit(undefined)).toBeUndefined();

    const passthrough = { method: "GET" } as const;
    expect(sanitizeFetchInit(passthrough)).toBe(passthrough);

    const init = {
      method: "POST",
      headers: {
        Accept: "application/json",
        "x-version": 2,
        "x-ignored": undefined,
      },
    } as unknown as Parameters<typeof fetch>[1];
    const out = sanitizeFetchInit(init);
    expect(out).not.toBe(init);
    expect(out).toEqual({
      method: "POST",
      headers: {
        Accept: "application/json",
        "x-version": "2",
      },
    });
  });

  it("extracts enum-style API error details", () => {
    expect(
      extractApiErrorDetail({
        NotPermitted: "faucet pow vrf seed unavailable",
      }),
    ).toBe("faucet pow vrf seed unavailable");
    expect(
      extractApiErrorDetail({
        QueryFailed: {
          Conversion: "invalid account id literal",
        },
      }),
    ).toBe("invalid account id literal");
    expect(
      extractApiErrorDetail({
        message: "Faucet puzzle failed.",
        details: {
          NotPermitted: "faucet pow vrf seed unavailable",
        },
      }),
    ).toBe("faucet pow vrf seed unavailable");
  });

  it("reads API error details from JSON and plain-text responses", async () => {
    const jsonResponse = new Response(
      JSON.stringify({
        NotPermitted: "Account faucet disabled",
      }),
      {
        status: 403,
        headers: {
          "content-type": "application/json",
        },
      },
    );
    const wrappedJsonResponse = new Response(
      JSON.stringify({
        message: "Faucet puzzle failed.",
        details: {
          NotPermitted: "Account faucet disabled",
        },
      }),
      {
        status: 403,
        headers: {
          "content-type": "application/json",
        },
      },
    );
    const textResponse = new Response("plain failure", {
      status: 400,
    });

    await expect(readApiErrorDetail(jsonResponse)).resolves.toBe(
      "Account faucet disabled",
    );
    await expect(readApiErrorDetail(wrappedJsonResponse)).resolves.toBe(
      "Account faucet disabled",
    );
    await expect(readApiErrorDetail(textResponse)).resolves.toBe(
      "plain failure",
    );
  });

  it("does not buffer oversized API error bodies", async () => {
    const response = new Response("must not be read", {
      status: 502,
      headers: {
        "content-length": String(64 * 1024 + 1),
        "content-type": "text/plain",
      },
    });
    const arrayBuffer = vi.spyOn(response, "arrayBuffer");

    await expect(readApiErrorDetail(response)).resolves.toBe("");
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it("reads HTML gateway API errors without leaking markup", async () => {
    const htmlResponse = new Response(
      "<html><head><title>502 Bad Gateway</title></head><body><center><h1>502 Bad Gateway</h1></center><hr><center>nginx/1.29.8</center></body></html>",
      {
        status: 502,
        statusText: "Bad Gateway",
        headers: {
          "content-type": "text/html",
        },
      },
    );

    await expect(readApiErrorDetail(htmlResponse)).resolves.toBe(
      "502 Bad Gateway",
    );
  });

  it("uses reject-code headers and extracts readable Norito error details", async () => {
    const noritoResponse = new Response(
      new Uint8Array([0x4e, 0x52, 0x54, 0x30, 0x00, 0x00, 0x00, 0x00]),
      {
        status: 400,
        headers: {
          "content-type": "application/x-norito",
          "x-iroha-reject-code": "ERR_INVALID_SINGULAR_PARAMETERS",
        },
      },
    );
    const noritoResponseWithoutHeader = new Response(
      new Uint8Array([0x4e, 0x52, 0x54, 0x30, 0x00, 0x00, 0x00, 0x00]),
      {
        status: 400,
        headers: {
          "content-type": "application/x-norito",
        },
      },
    );
    const noritoResponseWithDetail = new Response(
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
        headers: {
          "content-type": "application/x-norito",
        },
      },
    );

    await expect(readApiErrorDetail(noritoResponse)).resolves.toBe(
      "ERR_INVALID_SINGULAR_PARAMETERS",
    );
    await expect(readApiErrorDetail(noritoResponseWithDetail)).resolves.toBe(
      "Account faucet disabled",
    );
    await expect(readApiErrorDetail(noritoResponseWithoutHeader)).resolves.toBe(
      "",
    );
  });

  it("strips unreadable prefixes from plain-text API errors", async () => {
    const textResponse = new Response(
      "ERR_UNEXPECTED_NETWORK_PREFIX — NRT0`\uFFFD6W\uFFFD5 invalid account_id `sorauExample` : ERR_UNEXPECTED_NETWORK_PREFIX",
      {
        status: 400,
      },
    );

    await expect(readApiErrorDetail(textResponse)).resolves.toBe(
      "ERR_UNEXPECTED_NETWORK_PREFIX — invalid account_id `sorauExample` : ERR_UNEXPECTED_NETWORK_PREFIX",
    );
  });

  it("accepts only the current SDK explorer QR response", () => {
    const normalized = normalizeExplorerAccountQrPayload({
      canonicalId: "testuSampleCanonical",
      literal: "testuSampleCanonical",
      networkPrefix: 369,
      errorCorrection: "M",
      modules: 192,
      qrVersion: 4,
      svg: "<svg/>",
    });

    expect(normalized).toEqual({
      canonicalId: "testuSampleCanonical",
      literal: "testuSampleCanonical",
      networkPrefix: 369,
      errorCorrection: "M",
      modules: 192,
      qrVersion: 4,
      svg: "<svg/>",
    });

    expect(() =>
      normalizeExplorerAccountQrPayload({
        canonical_id: "testuSampleCanonical",
        literal: "testuSampleCanonical",
        network_prefix: 369,
        error_correction: "M",
        modules: 192,
        qr_version: 4,
        svg: "<svg/>",
      }),
    ).toThrow(/must contain exactly/u);
    expect(() =>
      normalizeExplorerAccountQrPayload({
        ...normalized,
        errorCorrection: "H",
      }),
    ).toThrow("must be exactly M");
    expect(() =>
      normalizeExplorerAccountQrPayload({
        ...normalized,
        modules: 33,
      }),
    ).toThrow("must be exactly 192");
  });

  it("rejects explorer QR payloads for another account", () => {
    expect(() =>
      assertExplorerAccountQrMatchesRequestedAccount(
        {
          canonicalId: "testuOtherCanonical",
          literal: "testuOtherAccount",
          networkPrefix: 369,
          errorCorrection: "M",
          modules: 192,
          qrVersion: 4,
          svg: "<svg/>",
        },
        "testuRequestedAccount",
      ),
    ).toThrow(
      "Explorer QR response account did not match the requested account.",
    );
    expect(() =>
      assertExplorerAccountQrMatchesRequestedAccount(
        {
          canonicalId: "testuOtherCanonical",
          literal: "testuRequestedAccount",
          networkPrefix: 369,
          errorCorrection: "M",
          modules: 192,
          qrVersion: 4,
          svg: "<svg/>",
        },
        "testuRequestedAccount",
      ),
    ).toThrow(
      "Explorer QR response account did not match the requested account.",
    );
  });

  it("normalizes the exact current account asset response", () => {
    expect(
      normalizeAccountAssetListPayload({
        items: [
          {
            account_id: ACCOUNT_ID,
            asset: "5PeSrQmLNwwKtruJvDZrbrm9RuMw",
            asset_alias: null,
            asset_name: "Localnet Fee",
            scope: "global",
            quantity: "25000",
          },
        ],
        total: 1,
        next_cursor: null,
      }),
    ).toEqual({
      items: [
        {
          asset_id: `5PeSrQmLNwwKtruJvDZrbrm9RuMw#${ACCOUNT_ID}`,
          quantity: "25000",
          scope: "global",
          asset_name: "Localnet Fee",
          asset_definition_id: "5PeSrQmLNwwKtruJvDZrbrm9RuMw",
        },
      ],
      total: 1,
    });

    expect(() =>
      normalizeAccountAssetListPayload({
        items: [
          {
            account_id: ACCOUNT_ID,
            asset_definition_id: "61CtjvNd9T3THAR65GsMVHr82Bjc",
            asset_alias: null,
            asset_name: "XOR",
            scope: "global",
            quantity: "25000",
          },
        ],
        total: 1,
        next_cursor: null,
      }),
    ).toThrow("must contain exactly");
  });

  it("preserves account asset aliases for renderer labels", () => {
    expect(
      normalizeAccountAssetListPayload({
        items: [
          {
            account_id: ACCOUNT_ID,
            asset: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
            asset_alias: "xor#universal",
            asset_name: "XOR",
            scope: "dataspace:7",
            quantity: "42",
          },
        ],
        total: 1,
        next_cursor: null,
      }),
    ).toEqual({
      items: [
        {
          asset_id: `6TEAJqbb8oEPmLncoNiMRbLEK6tw#${ACCOUNT_ID}#dataspace:7`,
          quantity: "42",
          scope: "dataspace:7",
          asset_alias: "xor#universal",
          asset_name: "XOR",
          asset_definition_id: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
        },
      ],
      total: 1,
    });
  });

  it("binds account asset rows and limits to the exact request", () => {
    const response = {
      items: [
        {
          account_id: OTHER_ACCOUNT_ID,
          asset: XOR_ASSET_DEFINITION_ID,
          asset_alias: null,
          asset_name: "XOR",
          scope: "global",
          quantity: "1",
        },
      ],
      total: 1,
      next_cursor: null,
    };

    expect(() => normalizeAccountAssetListPayload(response)).toThrow(
      "does not match the requested account",
    );
    expect(() =>
      decodeAccountAssetListPayload(
        {
          ...response,
          items: [{ ...response.items[0], account_id: ACCOUNT_ID }],
        },
        {
          expectedAccountId: ACCOUNT_ID,
          networkPrefix: 753,
          maximumItems: 0,
        },
      ),
    ).toThrow("exceeds the requested item limit");

    expect(() =>
      decodeAccountAssetListPayload(
        {
          ...response,
          items: [{ ...response.items[0], account_id: ACCOUNT_ID }],
        },
        {
          expectedAccountId: ACCOUNT_ID,
          expectedAssetDefinitionId: "61CtjvNd9T3THAR65GsMVHr82Bjc",
          networkPrefix: 753,
          maximumItems: 1,
        },
      ),
    ).toThrow("does not match the requested asset definition");
  });

  it("rejects duplicate account holdings in one exact page", () => {
    const item = {
      account_id: ACCOUNT_ID,
      asset: XOR_ASSET_DEFINITION_ID,
      asset_alias: null,
      asset_name: "XOR",
      scope: "global",
      quantity: "1",
    };
    expect(() =>
      decodeAccountAssetListPayload(
        {
          items: [item, { ...item, quantity: "2" }],
          total: 2,
          next_cursor: null,
        },
        {
          expectedAccountId: ACCOUNT_ID,
          networkPrefix: 753,
          maximumItems: 2,
        },
      ),
    ).toThrow("duplicates an account asset holding");
  });

  it("rejects ambiguous and camelCase account asset response shapes", () => {
    expect(() =>
      normalizeAccountAssetListPayload({
        items: [
          {
            assetId: "xor#sora#alice",
            quantity: "1",
          },
        ],
        total: 1,
        next_cursor: null,
      }),
    ).toThrow("must contain exactly");

    expect(() =>
      normalizeAccountAssetListPayload({
        items: [
          {
            asset_id: "xor#sora#alice",
            quantity: "1",
          },
        ],
        total: 1,
        next_cursor: null,
      }),
    ).toThrow("must contain exactly");

    expect(() =>
      normalizeAccountAssetListPayload({
        items: [
          {
            asset: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
            quantity: "1",
          },
        ],
        total: 1,
        next_cursor: null,
      }),
    ).toThrow("must contain exactly");

    expect(() =>
      normalizeAccountAssetListPayload({
        items: [],
        total: 0,
        next_cursor: null,
        has_more: false,
      }),
    ).toThrow("account asset list response must contain exactly");

    expect(() =>
      normalizeAccountAssetListPayload({
        items: [],
        total: 0,
        next_cursor: "",
      }),
    ).toThrow("next_cursor must be canonical text or null");

    expect(() =>
      normalizeAccountAssetListPayload({
        items: [
          {
            account_id: ACCOUNT_ID,
            asset: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
            asset_alias: undefined,
            asset_name: "XOR",
            scope: "global",
            quantity: "1",
          },
        ],
        total: 1,
        next_cursor: null,
      }),
    ).toThrow(/asset_alias/u);
  });

  it("normalizes the exact current governance council payload", () => {
    expect(
      normalizeGovernanceCouncilCurrentPayload({
        epoch: 77,
        members: [{ account_id: "testuAlice" }, { account_id: "testuBob" }],
        alternates: [{ account_id: "testuCarol" }],
        candidate_count: 3,
        verified: 2,
        derived_by: "Vrf",
      }),
    ).toEqual({
      epoch: 77,
      members: [{ account_id: "testuAlice" }, { account_id: "testuBob" }],
      alternates: [{ account_id: "testuCarol" }],
      candidate_count: 3,
      verified: 2,
      derived_by: "Vrf",
    });
  });

  it("normalizes exact governance citizen count payloads", () => {
    expect(
      normalizeGovernanceCitizenCountPayload({
        total: "12",
      }),
    ).toEqual({
      total: 12,
      endpointAvailable: true,
    });
    expect(normalizeGovernanceCitizenCountPayload(null, false)).toEqual({
      total: null,
      endpointAvailable: false,
    });
    expect(() => normalizeGovernanceCitizenCountPayload({ total: 12 })).toThrow(
      /canonical decimal string/,
    );
    expect(() =>
      normalizeGovernanceCitizenCountPayload({ total: "12", count: "12" }),
    ).toThrow(/contain exactly total/);
  });

  it("rejects council aliases, omitted defaults, string counts, and extra fields", () => {
    const exact = {
      epoch: 1,
      members: [] as Array<{ account_id: string }>,
      alternates: [] as Array<{ account_id: string }>,
      candidate_count: 0,
      verified: 0,
      derived_by: "Fallback",
    };
    expect(() =>
      normalizeGovernanceCouncilCurrentPayload({
        epoch: 1,
        members: [],
      }),
    ).toThrow(/contain exactly/);
    expect(() =>
      normalizeGovernanceCouncilCurrentPayload({
        ...exact,
        epoch: "1",
      }),
    ).toThrow(/non-negative JSON integer/);
    expect(() =>
      normalizeGovernanceCouncilCurrentPayload({
        ...exact,
        members: [{ accountId: "testuAlice" }],
      }),
    ).toThrow(/contain exactly account_id/);
    for (const account_id of [123, " testuAlice", "testuAlice ", ""]) {
      expect(() =>
        normalizeGovernanceCouncilCurrentPayload({
          ...exact,
          members: [{ account_id }],
        }),
      ).toThrow(/account_id must be canonical non-empty text/);
    }
    expect(() =>
      normalizeGovernanceCouncilCurrentPayload({
        ...exact,
        derived_by: "VRF",
      }),
    ).toThrow(/must be Vrf or Fallback/);
    expect(() =>
      normalizeGovernanceCouncilCurrentPayload({
        ...exact,
        source: "cached",
      }),
    ).toThrow(/contain exactly/);
  });

  it("rejects contradictory council identities, counts, and derivation evidence", () => {
    const exact = {
      epoch: 7,
      members: [{ account_id: "testuAlice" }],
      alternates: [{ account_id: "testuBob" }],
      candidate_count: 2,
      verified: 0,
      derived_by: "Fallback",
    };
    for (const overrides of [
      { members: [{ account_id: "testuAlice" }, { account_id: "testuAlice" }] },
      { alternates: [{ account_id: "testuAlice" }] },
    ]) {
      expect(() =>
        normalizeGovernanceCouncilCurrentPayload({ ...exact, ...overrides }),
      ).toThrow(/unique and disjoint/);
    }
    expect(() =>
      normalizeGovernanceCouncilCurrentPayload({
        ...exact,
        candidate_count: 1,
      }),
    ).toThrow(/must not exceed candidate_count/);
    expect(() =>
      normalizeGovernanceCouncilCurrentPayload({
        ...exact,
        verified: 3,
      }),
    ).toThrow(/must not exceed candidate_count/);
    expect(() =>
      normalizeGovernanceCouncilCurrentPayload({
        ...exact,
        derived_by: "Vrf",
      }),
    ).toThrow(/must agree with the verified proof count/);
    expect(() =>
      normalizeGovernanceCouncilCurrentPayload({
        ...exact,
        verified: 1,
      }),
    ).toThrow(/must agree with the verified proof count/);
  });

  it("normalizes only the exact governance unlock stats payload", () => {
    expect(
      normalizeGovernanceUnlockStatsPayload({
        height_current: 51179,
        expired_locks_now: 2,
        referenda_with_expired: 1,
        last_sweep_height: 51100,
      }),
    ).toEqual({
      height_current: 51179,
      expired_locks_now: 2,
      referenda_with_expired: 1,
      last_sweep_height: 51100,
    });
    expect(() =>
      normalizeGovernanceUnlockStatsPayload({
        height_current: "51179",
        expired_locks_now: 2,
        referenda_with_expired: 1,
        last_sweep_height: 51100,
      }),
    ).toThrow(/non-negative JSON integer/);
    expect(() =>
      normalizeGovernanceUnlockStatsPayload({
        height_current: 51179,
        expired_locks_now: 2,
        referenda_with_expired: 1,
      }),
    ).toThrow(/contain exactly/);
    expect(() =>
      normalizeGovernanceUnlockStatsPayload({
        height_current: 51179,
        expired_locks_now: 2,
        referenda_with_expired: 1,
        last_sweep_height: 51100,
        lastSweepHeight: 51100,
      }),
    ).toThrow(/contain exactly/);
  });

  it("normalizes public lane validators payloads", () => {
    const payload = {
      lane_id: 7,
      total: 1,
      items: [
        {
          lane_id: 7,
          validator: "validator@wonderland",
          peer_id: "peer:validator",
          stake_account: "validator@wonderland",
          total_stake: "1000",
          self_stake: "250",
          status: {
            type: "Active",
            activates_at_epoch: null,
            reason: null,
            releases_at_ms: null,
            slash_id: null,
          },
          activation_epoch: 3,
          activation_height: 120,
          last_reward_epoch: 8,
          metadata: {
            endpoint: "https://node.example",
          },
        },
      ],
    };
    const normalized = normalizePublicLaneValidatorsPayload(payload);

    expect(normalized.lane_id).toBe(7);
    expect(normalized.items[0].validator).toBe("validator@wonderland");
    expect(normalized.items[0].peer_id).toBe("peer:validator");

    expect(() =>
      normalizePublicLaneValidatorsPayload({
        ...payload,
        items: [{ ...payload.items[0], peer_id: null }],
      }),
    ).toThrow(/peer_id/u);
    expect(normalized.items[0].status.type).toBe("Active");
    expect(normalized.items[0].activation_epoch).toBe(3);
  });

  it("normalizes public lane stake and rewards payloads", () => {
    const stake = normalizePublicLaneStakePayload({
      lane_id: 4,
      total: 1,
      items: [
        {
          lane_id: 4,
          validator: "validator@wonderland",
          staker: "alice@wonderland",
          bonded: "42",
          metadata: {},
          pending_unbonds: [
            {
              request_id: "abc123",
              amount: "10",
              release_at_ms: 170000,
            },
          ],
        },
      ],
    });
    const rewards = normalizePublicLaneRewardsPayload({
      lane_id: 4,
      total: 1,
      items: [
        {
          lane_id: 4,
          account: "alice@wonderland",
          asset: "xor#wonderland",
          last_claimed_epoch: 2,
          pending_through_epoch: 5,
          amount: "7.5",
        },
      ],
    });

    expect(stake.items[0].pending_unbonds[0].request_id).toBe("abc123");
    expect(stake.items[0].pending_unbonds[0].release_at_ms).toBe(170000);
    expect(rewards.items[0].asset).toBe("xor#wonderland");
    expect(rewards.items[0].pending_through_epoch).toBe(5);
  });

  it("rejects camelCase public lane compatibility payloads", () => {
    expect(() =>
      normalizePublicLaneValidatorsPayload({
        laneId: 7,
        total: 0,
        items: [],
      }),
    ).toThrow("validators must contain exactly");

    expect(() =>
      normalizePublicLaneStakePayload({
        lane_id: 4,
        total: 1,
        items: [
          {
            lane_id: 4,
            validator: "validator@wonderland",
            staker: "alice@wonderland",
            bonded: "42",
            metadata: {},
            pendingUnbonds: [],
          },
        ],
      }),
    ).toThrow("must contain exactly");

    expect(() =>
      normalizePublicLaneRewardsPayload({
        lane_id: 4,
        total: 1,
        items: [
          {
            lane_id: 4,
            account: "alice@wonderland",
            asset: "xor#wonderland",
            lastClaimedEpoch: 2,
            pending_through_epoch: 5,
            amount: "7.5",
          },
        ],
      }),
    ).toThrow("must contain exactly");
  });

  it("requires complete first-release public lane collection envelopes", () => {
    expect(() =>
      normalizePublicLaneValidatorsPayload({
        lane_id: 7,
        items: [],
      }),
    ).toThrow("validators must contain exactly");
    expect(() =>
      normalizePublicLaneValidatorsPayload({
        lane_id: 7,
        total: 0,
      }),
    ).toThrow("validators must contain exactly");

    expect(() =>
      normalizePublicLaneStakePayload({
        lane_id: 4,
        items: [],
      }),
    ).toThrow("stake must contain exactly");
    expect(() =>
      normalizePublicLaneStakePayload({
        lane_id: 4,
        total: 0,
      }),
    ).toThrow("stake must contain exactly");

    expect(() =>
      normalizePublicLaneRewardsPayload({
        lane_id: 4,
        items: [],
      }),
    ).toThrow("rewards must contain exactly");
    expect(() =>
      normalizePublicLaneRewardsPayload({
        lane_id: 4,
        total: 0,
      }),
    ).toThrow("rewards must contain exactly");
  });

  it("normalizes the current Nexus lifecycle lane catalog", () => {
    const lifecycle = normalizeNexusLifecyclePayload({
      version: 1,
      nexus_enabled: true,
      lane_count: 2,
      lanes: [
        {
          id: 0,
          dataspace_id: 0,
          alias: "core",
          description: "Primary execution lane",
          visibility: "public",
          governance: null,
          storage: "full_replica",
          proof_scheme: "merkle_sha256",
          metadata: { "scheduler.teu_capacity": "50000000" },
        },
        {
          id: 1,
          dataspace_id: 1,
          alias: "governance",
          description: "Governance traffic",
          visibility: "public",
          governance: "parliament",
          storage: "full_replica",
          proof_scheme: "merkle_sha256",
          metadata: {},
        },
      ],
    });

    expect(lifecycle.lanes.map((lane) => lane.alias)).toEqual([
      "core",
      "governance",
    ]);
    expect(lifecycle.lanes[1].dataspace_id).toBe("1");
    expect(() =>
      normalizeNexusLifecyclePayload({
        version: 1,
        nexus_enabled: true,
        lane_count: 2,
        lanes: [],
      }),
    ).toThrow("lane_count must match");
  });

  it("accepts only canonical non-negative safe integers in Nexus lifecycle", () => {
    const lifecycle = (laneId: unknown) => ({
      version: 1,
      nexus_enabled: true,
      lane_count: 1,
      lanes: [
        {
          id: laneId,
          dataspace_id: "0",
          alias: "core",
          description: "",
          visibility: "public",
          governance: null,
          storage: "full_replica",
          proof_scheme: "merkle_sha256",
          metadata: {},
        },
      ],
    });

    expect(normalizeNexusLifecyclePayload(lifecycle(0)).lanes[0].id).toBe(0);
    for (const invalid of [
      1.5,
      -1,
      Number.MAX_SAFE_INTEGER + 1,
      "0",
      "01",
      "1.0",
      "1e3",
      " 1 ",
      true,
    ]) {
      expect(() => normalizeNexusLifecyclePayload(lifecycle(invalid))).toThrow(
        "nexus lifecycle.lanes[0].id must be a non-negative JSON integer.",
      );
    }
  });

  it("preserves exact Nexus lifecycle dataspace integer lexemes", () => {
    const lifecycle = parseNexusLifecycleJson(
      JSON.stringify({
        version: 1,
        nexus_enabled: true,
        lane_count: 1,
        lanes: [
          {
            id: 0,
            dataspace_id: "6647857470246403404",
            alias: "taira",
            description: "",
            visibility: "public",
            governance: null,
            storage: "full_replica",
            proof_scheme: "merkle_sha256",
            metadata: {},
          },
        ],
      }).replace('"6647857470246403404"', "6647857470246403404"),
    );

    expect(lifecycle.lanes[0].dataspace_id).toBe("6647857470246403404");
    expect(() =>
      normalizeNexusLifecyclePayload({
        version: 1,
        nexus_enabled: true,
        lane_count: 1,
        lanes: [
          {
            id: 0,
            dataspace_id: Number("6647857470246403404"),
            alias: "taira",
            description: "",
            visibility: "public",
            governance: null,
            storage: "full_replica",
            proof_scheme: "merkle_sha256",
            metadata: {},
          },
        ],
      }),
    ).toThrow("must be a canonical non-negative decimal integer");
  });

  it("reads only the current top-level confidential policy", () => {
    expect(
      normalizeAssetDefinitionConfidentialPolicy({
        confidential_policy: {
          mode: "Convertible",
          allow_shield: true,
          allow_unshield: true,
          vk_transfer: "halo2/ipa::vk_transfer",
          vk_unshield: "halo2/ipa::vk_unshield",
          vk_shield: "halo2/ipa::vk_shield",
          vk_set_hash: null,
          poseidon_params_id: null,
          pedersen_params_id: null,
          pending_transition: null,
        },
        metadata: {
          "zk.policy": {
            mode: "TransparentOnly",
          },
        },
      }),
    ).toEqual({
      mode: "Convertible",
      allow_shield: true,
      allow_unshield: true,
      vk_transfer: "halo2/ipa::vk_transfer",
      vk_unshield: "halo2/ipa::vk_unshield",
      vk_shield: "halo2/ipa::vk_shield",
      vk_set_hash: null,
      poseidon_params_id: null,
      pedersen_params_id: null,
      pending_transition: null,
    });
    expect(
      normalizeAssetDefinitionConfidentialPolicy({
        metadata: { "zk.policy": { mode: "Convertible" } },
      }),
    ).toBeNull();
  });

  it("normalizes confidential asset policy payloads", () => {
    const normalized = normalizeConfidentialAssetPolicyPayload({
      asset_id: XOR_ASSET_DEFINITION_ID,
      block_height: 46,
      current_mode: "Convertible",
      effective_mode: "Convertible",
      allow_shield: true,
      allow_unshield: true,
      vk_transfer: "halo2/ipa::vk_transfer",
      vk_unshield: "halo2/ipa::vk_unshield",
      vk_shield: "halo2/ipa::vk_shield",
      vk_set_hash: "AA".repeat(32),
      poseidon_params_id: 7,
      pedersen_params_id: 9,
      pending_transition: {
        transition_id: "BB".repeat(32),
        previous_mode: "Convertible",
        new_mode: "ShieldedOnly",
        effective_height: 55,
        conversion_window: 10,
        window_open_height: 45,
      },
    });

    expect(normalized.asset_id).toBe(XOR_ASSET_DEFINITION_ID);
    expect(normalized.effective_mode).toBe("Convertible");
    expect(normalized.allow_shield).toBe(true);
    expect(normalized.allow_unshield).toBe(true);
    expect(normalized.vk_transfer).toBe("halo2/ipa::vk_transfer");
    expect(normalized.vk_unshield).toBe("halo2/ipa::vk_unshield");
    expect(normalized.vk_shield).toBe("halo2/ipa::vk_shield");
    expect(normalized.pending_transition?.effective_height).toBe(55);
    expect(normalized.pending_transition?.conversion_window).toBe(10);
    expect(
      assertConfidentialPolicyProjectionAgreement(normalized, {
        id: XOR_ASSET_DEFINITION_ID,
        confidential_policy: {
          mode: "Convertible",
          allow_shield: true,
          allow_unshield: true,
          vk_transfer: "halo2/ipa::vk_transfer",
          vk_unshield: "halo2/ipa::vk_unshield",
          vk_shield: "halo2/ipa::vk_shield",
          vk_set_hash: `hash:${"AA".repeat(32)}#1234`,
          poseidon_params_id: 7,
          pedersen_params_id: 9,
          pending_transition: {
            new_mode: "ShieldedOnly",
            effective_height: 55,
            previous_mode: "Convertible",
            transition_id: `hash:${"BB".repeat(32)}#5678`,
            conversion_window: 10,
          },
        },
      }),
    ).toBe(normalized);
  });

  it("rejects disagreement between the transition and asset-definition projections", () => {
    const policy = normalizeConfidentialAssetPolicyPayload({
      asset_id: XOR_ASSET_DEFINITION_ID,
      block_height: 41,
      current_mode: "Convertible",
      effective_mode: "Convertible",
      allow_shield: true,
      allow_unshield: true,
      vk_transfer: "halo2/ipa::vk_transfer",
      vk_unshield: "halo2/ipa::vk_unshield",
      vk_shield: "halo2/ipa::vk_shield",
      vk_set_hash: null,
      poseidon_params_id: 7,
      pedersen_params_id: 9,
      pending_transition: null,
    });
    expect(() =>
      assertConfidentialPolicyProjectionAgreement(policy, {
        id: XOR_ASSET_DEFINITION_ID,
        confidential_policy: {
          mode: "ShieldedOnly",
          allow_shield: true,
          allow_unshield: true,
          vk_transfer: "halo2/ipa::vk_transfer",
          vk_unshield: "halo2/ipa::vk_unshield",
          vk_shield: "halo2/ipa::vk_shield",
          vk_set_hash: null,
          poseidon_params_id: 7,
          pedersen_params_id: 9,
          pending_transition: null,
        },
      }),
    ).toThrow("does not exactly match");
    expect(() =>
      assertConfidentialPolicyProjectionAgreement(policy, {
        id: XOR_ASSET_DEFINITION_ID,
        confidential_policy: {
          mode: "Convertible",
          allow_shield: true,
          allow_unshield: false,
          vk_transfer: "halo2/ipa::vk_transfer",
          vk_unshield: "halo2/ipa::vk_unshield",
          vk_shield: "halo2/ipa::vk_shield",
          vk_set_hash: null,
          poseidon_params_id: 7,
          pedersen_params_id: 9,
          pending_transition: null,
        },
      }),
    ).toThrow("does not exactly match");
    expect(() =>
      assertConfidentialPolicyProjectionAgreement(policy, {}),
    ).toThrow("missing the top-level confidential_policy");
  });

  it("rejects noncanonical confidential policy fields and modes", () => {
    const exact = {
      asset_id: XOR_ASSET_DEFINITION_ID,
      block_height: 41,
      current_mode: "Convertible",
      effective_mode: "Convertible",
      allow_shield: true,
      allow_unshield: true,
      vk_transfer: "halo2/ipa::vk_transfer",
      vk_unshield: "halo2/ipa::vk_unshield",
      vk_shield: "halo2/ipa::vk_shield",
      vk_set_hash: null,
      poseidon_params_id: null,
      pedersen_params_id: null,
      pending_transition: null,
    };

    expect(() =>
      normalizeConfidentialAssetPolicyPayload({
        ...exact,
        allow_shield: null,
      }),
    ).toThrow("confidential.allow_shield must be an explicit boolean");
    expect(() =>
      normalizeConfidentialAssetPolicyPayload({
        ...exact,
        allowShield: true,
      }),
    ).toThrow("must contain exactly");
    expect(() =>
      normalizeConfidentialAssetPolicyPayload({
        ...exact,
        effective_mode: "convertible",
      }),
    ).toThrow("must be exactly TransparentOnly, ShieldedOnly, or Convertible");
  });

  it("extracts nexus unbonding delay from configuration payloads", () => {
    expect(
      readNexusUnbondingDelayMs({
        nexus: {
          staking: {
            unbonding_delay_ms: 60000,
          },
        },
      }),
    ).toBe(60000);

    expect(() =>
      readNexusUnbondingDelayMs({
        nexus: {
          staking: {},
        },
      }),
    ).toThrow("configuration.nexus.staking.unbonding_delay_ms");
  });
});

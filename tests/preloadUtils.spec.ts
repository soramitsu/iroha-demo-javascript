import { describe, expect, it } from "vitest";
import {
  assertExplorerAccountQrMatchesRequestedAccount,
  confidentialModeSupportsShield,
  extractApiErrorDetail,
  formatOnboardingError,
  isPositiveWholeAmount,
  normalizeAccountAssetListPayload,
  normalizeAssetDefinitionConfidentialPolicy,
  normalizeBaseUrl,
  normalizeConfidentialAssetPolicyPayload,
  normalizeExplorerAccountQrPayload,
  normalizeGovernanceCitizenCountPayload,
  normalizeGovernanceCouncilCurrentPayload,
  normalizeGovernanceUnlockStatsPayload,
  normalizeNexusLifecyclePayload,
  normalizeOfflineReadinessPayload,
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

const offlineReadinessPayload = (overrides: Record<string, unknown> = {}) => ({
  required_bridge_abi_version: 21,
  cash_handoff_capability: "cash_handoff_v1",
  max_hops: 8,
  asset_definition_id: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
  asset_scale: null,
  evaluated_block_height: 44_916,
  evaluated_block_hash: "2f".repeat(32),
  active_transfer_verifier: null,
  active_topup_shield_verifier: null,
  active_unshield_verifier: null,
  active_recursive_step_eq_verifier: null,
  active_recursive_step_ep_verifier: null,
  artifact_set: null,
  proof_backend_available: false,
  recursive_lineage_supported: false,
  ready: false,
  blockers: [
    {
      code: "proof_backend_unavailable",
      message: "The proof backend is unavailable.",
    },
  ],
  ...overrides,
});

describe("preload utils", () => {
  it("normalizes Torii base URLs", () => {
    expect(normalizeBaseUrl(" https://torii.example/ ")).toBe(
      "https://torii.example",
    );
    expect(normalizeBaseUrl("http://127.0.0.1:8080")).toBe(
      "http://127.0.0.1:8080",
    );
    expect(() => normalizeBaseUrl("127.0.0.1:8080")).toThrow(
      "Torii URL must include http or https scheme",
    );
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

  it("maps explorer QR snake_case payloads to renderer contract fields", () => {
    const normalized = normalizeExplorerAccountQrPayload({
      canonical_id: "testuSampleCanonical",
      literal: "testuSampleLiteral",
      network_prefix: 369,
      error_correction: "M",
      modules: 33,
      qr_version: 4,
      svg: "<svg/>",
    });

    expect(normalized).toEqual({
      canonicalId: "testuSampleCanonical",
      literal: "testuSampleLiteral",
      networkPrefix: 369,
      errorCorrection: "M",
      modules: 33,
      qrVersion: 4,
      svg: "<svg/>",
    });

    expect(() =>
      normalizeExplorerAccountQrPayload({
        canonical_id: "testuSampleCanonical",
        svg: "<svg/>",
      }),
    ).toThrow("Explorer QR response was missing required fields.");
  });

  it("rejects explorer QR payloads for another account", () => {
    expect(() =>
      assertExplorerAccountQrMatchesRequestedAccount(
        {
          canonical_id: "testuOtherCanonical",
          literal: "testuOtherAccount",
          network_prefix: 369,
          error_correction: "M",
          modules: 33,
          qr_version: 4,
          svg: "<svg/>",
        },
        "testuRequestedAccount",
      ),
    ).toThrow(
      "Explorer QR response account did not match the requested account.",
    );
  });

  it("normalizes account asset list payloads from legacy and split-field responses", () => {
    expect(
      normalizeAccountAssetListPayload({
        items: [
          {
            asset_id: "xor#sora#alice",
            quantity: "25000",
          },
        ],
        total: 1,
      }),
    ).toEqual({
      items: [
        {
          asset_id: "xor#sora#alice",
          quantity: "25000",
        },
      ],
      total: 1,
    });

    expect(
      normalizeAccountAssetListPayload({
        items: [
          {
            account_id: "sorauAlice",
            asset: "5PeSrQmLNwwKtruJvDZrbrm9RuMw",
            asset_alias: null,
            asset_name: "Localnet Fee",
            quantity: "25000",
          },
        ],
        total: 1,
      }),
    ).toEqual({
      items: [
        {
          asset_id: "5PeSrQmLNwwKtruJvDZrbrm9RuMw#sorauAlice",
          quantity: "25000",
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
            account_id: "testuAlice",
            asset_definition_id: "61CtjvNd9T3THAR65GsMVHr82Bjc",
            quantity: "25000",
          },
        ],
        total: 1,
      }),
    ).toThrow("outside the first-release account asset contract");
  });

  it("preserves account asset aliases for renderer labels", () => {
    expect(
      normalizeAccountAssetListPayload({
        items: [
          {
            account_id: "sorauAlice",
            asset: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
            asset_alias: "@xor",
            quantity: "42",
          },
        ],
        total: 1,
      }),
    ).toEqual({
      items: [
        {
          asset_id: "6TEAJqbb8oEPmLncoNiMRbLEK6tw#sorauAlice",
          quantity: "42",
          asset_alias: "xor",
          asset_definition_id: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
        },
      ],
      total: 1,
    });
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
      }),
    ).toThrow("outside the first-release account asset contract");

    expect(() =>
      normalizeAccountAssetListPayload({
        items: [
          {
            asset_id: "xor#sora#alice",
            asset: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
            account_id: "sorauAlice",
            quantity: "1",
          },
        ],
        total: 1,
      }),
    ).toThrow("must use exactly one first-release shape");

    expect(() =>
      normalizeAccountAssetListPayload({
        items: [
          {
            asset: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
            quantity: "1",
          },
        ],
        total: 1,
      }),
    ).toThrow("must use exactly one first-release shape");
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
    const normalized = normalizePublicLaneValidatorsPayload({
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
    });

    expect(normalized.lane_id).toBe(7);
    expect(normalized.items[0].validator).toBe("validator@wonderland");
    expect(normalized.items[0].peer_id).toBe("peer:validator");
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
    ).toThrow("validators.laneId is not part of the current contract");

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
    ).toThrow("contains fields outside the current contract");

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
    ).toThrow("contains fields outside the current contract");
  });

  it("requires complete first-release public lane collection envelopes", () => {
    expect(() =>
      normalizePublicLaneValidatorsPayload({
        lane_id: 7,
        items: [],
      }),
    ).toThrow("validators.total must be a non-negative integer");
    expect(() =>
      normalizePublicLaneValidatorsPayload({
        lane_id: 7,
        total: 0,
      }),
    ).toThrow("validators.items must be an array");

    expect(() =>
      normalizePublicLaneStakePayload({
        lane_id: 4,
        items: [],
      }),
    ).toThrow("stake.total must be a non-negative integer");
    expect(() =>
      normalizePublicLaneStakePayload({
        lane_id: 4,
        total: 0,
      }),
    ).toThrow("stake.items must be an array");

    expect(() =>
      normalizePublicLaneRewardsPayload({
        lane_id: 4,
        items: [],
      }),
    ).toThrow("rewards.total must be a non-negative integer");
    expect(() =>
      normalizePublicLaneRewardsPayload({
        lane_id: 4,
        total: 0,
      }),
    ).toThrow("rewards.items must be an array");
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
      version: "1",
      nexus_enabled: true,
      lane_count: "1",
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

    expect(normalizeNexusLifecyclePayload(lifecycle("0")).lanes[0].id).toBe(0);
    for (const invalid of [
      1.5,
      -1,
      Number.MAX_SAFE_INTEGER + 1,
      "01",
      "1.0",
      "1e3",
      " 1 ",
      true,
    ]) {
      expect(() => normalizeNexusLifecyclePayload(lifecycle(invalid))).toThrow(
        "nexus lifecycle.lanes[0].id must be a non-negative integer.",
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

  it("normalizes current offline readiness blockers", () => {
    const readiness = normalizeOfflineReadinessPayload(
      offlineReadinessPayload(),
    );

    expect(readiness.ready).toBe(false);
    expect(readiness.asset_scale).toBeNull();
    expect(readiness.blockers[0].code).toBe("proof_backend_unavailable");
    expect(readiness.active_transfer_verifier).toBeNull();
    expect(readiness.cash_handoff_capability).toBe("cash_handoff_v1");
  });

  it("requires the exact ABI 21 cash-handoff readiness shape", () => {
    const missingArtifactSet = offlineReadinessPayload();
    Reflect.deleteProperty(missingArtifactSet, "artifact_set");
    expect(() => normalizeOfflineReadinessPayload(missingArtifactSet)).toThrow(
      "offline readiness must contain exactly",
    );
    const missingCashHandoffCapability = offlineReadinessPayload();
    Reflect.deleteProperty(
      missingCashHandoffCapability,
      "cash_handoff_capability",
    );
    expect(() =>
      normalizeOfflineReadinessPayload(missingCashHandoffCapability),
    ).toThrow("offline readiness must contain exactly");
    expect(() =>
      normalizeOfflineReadinessPayload(
        offlineReadinessPayload({ compatibility_hint: "legacy" }),
      ),
    ).toThrow("offline readiness must contain exactly");
    expect(() =>
      normalizeOfflineReadinessPayload(
        offlineReadinessPayload({ required_bridge_abi_version: 20 }),
      ),
    ).toThrow(
      "offline readiness.required_bridge_abi_version must be exactly 21.",
    );
    expect(() =>
      normalizeOfflineReadinessPayload(
        offlineReadinessPayload({
          cash_handoff_capability: "cash_handoff_v0",
        }),
      ),
    ).toThrow(
      'offline readiness.cash_handoff_capability must be exactly "cash_handoff_v1".',
    );
    expect(() =>
      normalizeOfflineReadinessPayload(
        offlineReadinessPayload({ max_hops: 7 }),
      ),
    ).toThrow("offline readiness.max_hops must be exactly 8.");
  });

  it("rejects coerced integers and malformed readiness evidence", () => {
    expect(() =>
      normalizeOfflineReadinessPayload(
        offlineReadinessPayload({ evaluated_block_height: "44916" }),
      ),
    ).toThrow(
      "offline readiness.evaluated_block_height must be a non-negative JSON integer.",
    );
    expect(() =>
      normalizeOfflineReadinessPayload(
        offlineReadinessPayload({ asset_scale: "0" }),
      ),
    ).toThrow(
      "offline readiness.asset_scale must be a non-negative JSON integer.",
    );
    expect(() =>
      normalizeOfflineReadinessPayload(
        offlineReadinessPayload({ evaluated_block_hash: "2F".repeat(32) }),
      ),
    ).toThrow(
      "offline readiness.evaluated_block_hash must be a lowercase 32-byte hash.",
    );
    expect(() =>
      normalizeOfflineReadinessPayload(
        offlineReadinessPayload({ active_transfer_verifier: [] }),
      ),
    ).toThrow("offline readiness.active_transfer_verifier must be an object.");
  });

  it("cross-checks blocker shape and the ready invariant", () => {
    expect(() =>
      normalizeOfflineReadinessPayload(
        offlineReadinessPayload({
          blockers: [
            {
              code: "Not-Canonical",
              message: "The proof backend is unavailable.",
            },
          ],
        }),
      ),
    ).toThrow("offline readiness.blockers[0].code is malformed.");
    expect(() =>
      normalizeOfflineReadinessPayload(
        offlineReadinessPayload({
          ready: false,
          blockers: [],
        }),
      ),
    ).toThrow(
      "offline readiness.ready must be true exactly when blockers is empty.",
    );
    expect(() =>
      normalizeOfflineReadinessPayload(
        offlineReadinessPayload({
          asset_scale: null,
          ready: true,
          blockers: [],
        }),
      ),
    ).toThrow("A ready offline response must include a supported asset scale.");
  });

  it("rejects offline readiness for a different requested asset", () => {
    expect(() =>
      normalizeOfflineReadinessPayload(
        offlineReadinessPayload({
          asset_definition_id: "61CtjvNd9T3THAR65GsMVHr82Bjc",
        }),
        "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
      ),
    ).toThrow(
      "offline readiness.asset_definition_id must match the requested asset definition.",
    );
  });

  it("reads only the current top-level confidential policy", () => {
    expect(
      normalizeAssetDefinitionConfidentialPolicy({
        confidential_policy: {
          mode: "Convertible",
          vk_set_hash: null,
          poseidon_params_id: null,
          pedersen_params_id: null,
        },
        metadata: {
          "zk.policy": {
            mode: "TransparentOnly",
          },
        },
      }),
    ).toEqual({
      mode: "Convertible",
      allow_shield: null,
      allow_unshield: null,
      vk_transfer: null,
      vk_unshield: null,
      vk_shield: null,
      vk_set_hash: null,
      poseidon_params_id: null,
      pedersen_params_id: null,
    });
    expect(
      normalizeAssetDefinitionConfidentialPolicy({
        metadata: { "zk.policy": { mode: "Convertible" } },
      }),
    ).toBeNull();
  });

  it("normalizes confidential asset policy payloads", () => {
    const normalized = normalizeConfidentialAssetPolicyPayload({
      asset_id: "norito:abcdef0123456789",
      block_height: 41,
      current_mode: "TransparentOnly",
      effective_mode: "Convertible",
      allow_shield: true,
      allow_unshield: false,
      vk_transfer: "halo2/ipa::vk_transfer",
      vk_unshield: "halo2/ipa::vk_unshield",
      vk_shield: "halo2/ipa::vk_shield",
      vk_set_hash: "AA".repeat(32),
      poseidon_params_id: 7,
      pedersen_params_id: 9,
      pending_transition: {
        transition_id: "BB".repeat(32),
        previous_mode: "TransparentOnly",
        new_mode: "ShieldedOnly",
        effective_height: 55,
        conversion_window: 10,
        window_open_height: 45,
      },
    });

    expect(normalized.asset_id).toBe("norito:abcdef0123456789");
    expect(normalized.effective_mode).toBe("Convertible");
    expect(normalized.allow_shield).toBe(true);
    expect(normalized.allow_unshield).toBe(false);
    expect(normalized.vk_transfer).toBe("halo2/ipa::vk_transfer");
    expect(normalized.vk_unshield).toBe("halo2/ipa::vk_unshield");
    expect(normalized.vk_shield).toBe("halo2/ipa::vk_shield");
    expect(normalized.pending_transition?.effective_height).toBe(55);
    expect(normalized.pending_transition?.conversion_window).toBe(10);
  });

  it("rejects legacy or truthy confidential policy compatibility fields", () => {
    const exact = {
      asset_id: "norito:abcdef0123456789",
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
        allow_shield: "true",
      }),
    ).toThrow("confidential.allow_shield must be a boolean or null");
    expect(() =>
      normalizeConfidentialAssetPolicyPayload({
        ...exact,
        effectiveMode: "Convertible",
      }),
    ).toThrow("fields outside the first-release contract");
  });

  it("detects which confidential modes support shielding", () => {
    expect(confidentialModeSupportsShield("ShieldedOnly")).toBe(true);
    expect(confidentialModeSupportsShield("convertible")).toBe(true);
    expect(confidentialModeSupportsShield("zk_native")).toBe(true);
    expect(confidentialModeSupportsShield("TransparentOnly")).toBe(false);
    expect(confidentialModeSupportsShield(undefined)).toBe(false);
  });

  it("accepts only positive whole-number shielding amounts", () => {
    expect(isPositiveWholeAmount("1")).toBe(true);
    expect(isPositiveWholeAmount("25")).toBe(true);
    expect(isPositiveWholeAmount(" 7 ")).toBe(true);

    expect(isPositiveWholeAmount("0")).toBe(false);
    expect(isPositiveWholeAmount("10.5")).toBe(false);
    expect(isPositiveWholeAmount("-4")).toBe(false);
    expect(isPositiveWholeAmount("abc")).toBe(false);
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

import { describe, expect, it } from "vitest";
import {
  normalizeBaseUrl,
  normalizeExplorerAccountQrPayload,
  normalizePublicLaneRewardsPayload,
  normalizePublicLaneStakePayload,
  normalizePublicLaneValidatorsPayload,
  readNexusUnbondingDelayMs,
  sanitizeFetchHeaders,
  sanitizeFetchInit,
} from "../electron/preload-utils";

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

  it("maps explorer QR snake_case payloads to renderer contract fields", () => {
    const normalized = normalizeExplorerAccountQrPayload({
      canonical_id: "ed0120ABC@wonderland",
      literal: "ih58-literal",
      address_format: "ih58",
      network_prefix: 42,
      error_correction: "M",
      modules: 33,
      qr_version: 4,
      svg: "<svg/>",
    });

    expect(normalized).toEqual({
      canonicalId: "ed0120ABC@wonderland",
      literal: "ih58-literal",
      addressFormat: "ih58",
      networkPrefix: 42,
      errorCorrection: "M",
      modules: 33,
      qrVersion: 4,
      svg: "<svg/>",
    });

    expect(() =>
      normalizeExplorerAccountQrPayload({
        canonical_id: "ed0120ABC@wonderland",
        svg: "<svg/>",
      }),
    ).toThrow("Explorer QR response was missing required fields.");
  });

  it("normalizes public lane validators payloads", () => {
    const normalized = normalizePublicLaneValidatorsPayload({
      lane_id: 7,
      total: 1,
      items: [
        {
          lane_id: 7,
          validator: "validator@wonderland",
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
    expect(normalized.items[0].status.type).toBe("Active");
    expect(normalized.items[0].activation_epoch).toBe(3);
  });

  it("normalizes public lane stake and rewards payloads", () => {
    const stake = normalizePublicLaneStakePayload({
      laneId: 4,
      total: 1,
      items: [
        {
          laneId: 4,
          validator: "validator@wonderland",
          staker: "alice@wonderland",
          bonded: "42",
          metadata: {},
          pendingUnbonds: [
            {
              requestId: "abc123",
              amount: "10",
              releaseAtMs: 170000,
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

import { describe, expect, it } from "vitest";
import {
  confidentialModeSupportsShield,
  formatOnboardingError,
  isPositiveWholeAmount,
  normalizeBaseUrl,
  normalizeConfidentialAssetPolicyPayload,
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

  it("formats onboarding 403 errors with explicit UAID guidance", () => {
    expect(
      formatOnboardingError({
        status: 403,
        statusText: "Forbidden",
        detail: "torii.onboarding.enabled is false",
      }),
    ).toBe(
      "Onboarding failed with status 403 (Forbidden): UAID onboarding is disabled on this Torii endpoint. This TAIRA wallet build requires UAID onboarding enabled on the target Torii. Detail: torii.onboarding.enabled is false",
    );
    expect(
      formatOnboardingError({
        status: 403,
        statusText: "Forbidden",
      }),
    ).toBe(
      "Onboarding failed with status 403 (Forbidden): UAID onboarding is disabled on this Torii endpoint. This TAIRA wallet build requires UAID onboarding enabled on the target Torii.",
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
      "Onboarding failed with status 500 (Internal Server Error): unexpected backend failure",
    );
    expect(
      formatOnboardingError({
        status: 429,
        statusText: "Too Many Requests",
      }),
    ).toBe("Onboarding failed with status 429 (Too Many Requests)");
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
      canonical_id: "n42uSampleCanonical",
      literal: "n42uSampleLiteral",
      network_prefix: 42,
      error_correction: "M",
      modules: 33,
      qr_version: 4,
      svg: "<svg/>",
    });

    expect(normalized).toEqual({
      canonicalId: "n42uSampleCanonical",
      literal: "n42uSampleLiteral",
      networkPrefix: 42,
      errorCorrection: "M",
      modules: 33,
      qrVersion: 4,
      svg: "<svg/>",
    });

    expect(() =>
      normalizeExplorerAccountQrPayload({
        canonical_id: "n42uSampleCanonical",
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

  it("normalizes confidential asset policy payloads", () => {
    const normalized = normalizeConfidentialAssetPolicyPayload({
      asset_id: "norito:abcdef0123456789",
      block_height: 41,
      current_mode: "TransparentOnly",
      effective_mode: "Convertible",
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
    expect(normalized.pending_transition?.effective_height).toBe(55);
    expect(normalized.pending_transition?.conversion_window).toBe(10);
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

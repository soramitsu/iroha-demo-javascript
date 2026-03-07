import { describe, expect, it } from "vitest";
import {
  isOnboardingConflictError,
  isOnboardingDisabledError,
  isSupportedAccountIdLiteral,
  parseOnboardingEnvConfig,
  parseNetworkPrefix,
} from "../scripts/e2e/electron-live-utils.mjs";

describe("electron live e2e utils", () => {
  it("parses valid network prefixes with TAIRA default fallback", () => {
    expect(parseNetworkPrefix(undefined)).toBe(42);
    expect(parseNetworkPrefix("42")).toBe(42);
    expect(parseNetworkPrefix("0")).toBe(0);
    expect(parseNetworkPrefix("255")).toBe(255);
  });

  it("rejects invalid network prefixes", () => {
    expect(() => parseNetworkPrefix("-1")).toThrow(
      "E2E_NETWORK_PREFIX must be an integer from 0 to 255.",
    );
    expect(() => parseNetworkPrefix("256")).toThrow(
      "E2E_NETWORK_PREFIX must be an integer from 0 to 255.",
    );
    expect(() => parseNetworkPrefix("1.5")).toThrow(
      "E2E_NETWORK_PREFIX must be an integer from 0 to 255.",
    );
    expect(() => parseNetworkPrefix("abc")).toThrow(
      "E2E_NETWORK_PREFIX must be an integer from 0 to 255.",
    );
  });

  it("accepts account id formats supported by explorer qr flow", () => {
    expect(isSupportedAccountIdLiteral("ih58:xyz")).toBe(true);
    expect(isSupportedAccountIdLiteral("sora:xyz")).toBe(true);
    expect(isSupportedAccountIdLiteral("uaid:abc")).toBe(true);
    expect(isSupportedAccountIdLiteral("opaque:abc")).toBe(true);
    expect(isSupportedAccountIdLiteral("0xabc@wonderland")).toBe(true);
    expect(
      isSupportedAccountIdLiteral(
        "ed0120CE7FA46C9DCE7EA4B125E2E36BDB63EA33073E7590AC92816AE1E861B7048B03@wonderland",
      ),
    ).toBe(true);
  });

  it("rejects unsupported or malformed account id literals", () => {
    expect(isSupportedAccountIdLiteral("")).toBe(false);
    expect(isSupportedAccountIdLiteral("   ")).toBe(false);
    expect(isSupportedAccountIdLiteral(null)).toBe(false);
    expect(isSupportedAccountIdLiteral(undefined)).toBe(false);
    expect(isSupportedAccountIdLiteral("0xabc")).toBe(false);
    expect(isSupportedAccountIdLiteral("alice")).toBe(false);
    expect(isSupportedAccountIdLiteral("alice@")).toBe(false);
    expect(isSupportedAccountIdLiteral("@wonderland")).toBe(false);
  });

  it("detects onboarding-disabled responses from status text", () => {
    expect(
      isOnboardingDisabledError("Onboarding failed with status 403 ()"),
    ).toBe(true);
    expect(isOnboardingDisabledError("status403")).toBe(false);
    expect(isOnboardingDisabledError("status 404")).toBe(false);
    expect(isOnboardingDisabledError("")).toBe(false);
    expect(isOnboardingDisabledError(null)).toBe(false);
  });

  it("detects onboarding-conflict responses from status text", () => {
    expect(
      isOnboardingConflictError("Onboarding failed with status 409 (Conflict)"),
    ).toBe(true);
    expect(isOnboardingConflictError("status409")).toBe(false);
    expect(isOnboardingConflictError("status 403")).toBe(false);
    expect(isOnboardingConflictError("")).toBe(false);
    expect(isOnboardingConflictError(null)).toBe(false);
  });

  it("parses onboarding env defaults when vars are absent", () => {
    expect(parseOnboardingEnvConfig({})).toEqual({
      alias: "E2E Onboarding Shared",
      privateKeyHex:
        "c1f4e0837b224bf67dd4bd8fb94f8f78e6d1856e6f6a2f89f5cb9184160a95c7",
      offlineBalance: "100",
    });
  });

  it("parses explicit onboarding env vars", () => {
    expect(
      parseOnboardingEnvConfig({
        E2E_ONBOARDING_ALIAS: "  QA Shared Alias  ",
        E2E_ONBOARDING_PRIVATE_KEY_HEX:
          "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        E2E_ONBOARDING_OFFLINE_BALANCE: "2500",
      }),
    ).toEqual({
      alias: "QA Shared Alias",
      privateKeyHex:
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      offlineBalance: "2500",
    });
  });

  it("rejects deprecated onboarding env var names", () => {
    expect(() =>
      parseOnboardingEnvConfig({
        E2E_STATEFUL_PRIVATE_KEY_HEX:
          "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      }),
    ).toThrow("Deprecated onboarding env vars are no longer supported");
  });

  it("reports all deprecated onboarding env var names that are set", () => {
    expect(() =>
      parseOnboardingEnvConfig({
        E2E_STATEFUL_ALIAS: "legacy-alias",
        E2E_STATEFUL_OFFLINE_BALANCE: "50",
      }),
    ).toThrow("E2E_STATEFUL_ALIAS, E2E_STATEFUL_OFFLINE_BALANCE");
  });

  it("reports deprecated onboarding vars in stable declaration order", () => {
    expect(() =>
      parseOnboardingEnvConfig({
        E2E_STATEFUL_OFFLINE_BALANCE: "50",
        E2E_STATEFUL_PRIVATE_KEY_HEX:
          "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        E2E_STATEFUL_ALIAS: "legacy-alias",
      }),
    ).toThrow(
      "E2E_STATEFUL_ALIAS, E2E_STATEFUL_PRIVATE_KEY_HEX, E2E_STATEFUL_OFFLINE_BALANCE",
    );
    expect(() =>
      parseOnboardingEnvConfig({
        E2E_STATEFUL_OFFLINE_BALANCE: "50",
        E2E_STATEFUL_PRIVATE_KEY_HEX:
          "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        E2E_STATEFUL_ALIAS: "legacy-alias",
      }),
    ).toThrow(
      "E2E_STATEFUL_ALIAS -> E2E_ONBOARDING_ALIAS, E2E_STATEFUL_PRIVATE_KEY_HEX -> E2E_ONBOARDING_PRIVATE_KEY_HEX, E2E_STATEFUL_OFFLINE_BALANCE -> E2E_ONBOARDING_OFFLINE_BALANCE",
    );
  });

  it("ignores whitespace-only deprecated env var values", () => {
    expect(
      parseOnboardingEnvConfig({
        E2E_STATEFUL_ALIAS: "   ",
      }),
    ).toEqual({
      alias: "E2E Onboarding Shared",
      privateKeyHex:
        "c1f4e0837b224bf67dd4bd8fb94f8f78e6d1856e6f6a2f89f5cb9184160a95c7",
      offlineBalance: "100",
    });
  });

  it("rejects invalid onboarding private key values", () => {
    expect(() =>
      parseOnboardingEnvConfig({
        E2E_ONBOARDING_PRIVATE_KEY_HEX: "abc",
      }),
    ).toThrow(
      "E2E_ONBOARDING_PRIVATE_KEY_HEX must be a 64-character hexadecimal string.",
    );
  });

  it("rejects invalid onboarding offline balance values", () => {
    expect(() =>
      parseOnboardingEnvConfig({
        E2E_ONBOARDING_OFFLINE_BALANCE: "0",
      }),
    ).toThrow(
      "E2E_ONBOARDING_OFFLINE_BALANCE must be a positive numeric string.",
    );
  });
});

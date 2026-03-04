import { describe, expect, it } from "vitest";
import {
  isOnboardingConflictError,
  isOnboardingDisabledError,
  isSupportedAccountIdLiteral,
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
});

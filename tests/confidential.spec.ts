import { describe, expect, it } from "vitest";
import {
  confidentialModeSupportsShield,
  isPositiveWholeAmount,
} from "@/utils/confidential";

describe("confidential mode helpers", () => {
  it("accepts confidential modes that support shielding", () => {
    expect(confidentialModeSupportsShield("ShieldedOnly")).toBe(true);
    expect(confidentialModeSupportsShield("convertible")).toBe(true);
    expect(confidentialModeSupportsShield("hybrid")).toBe(true);
    expect(confidentialModeSupportsShield("zk_native")).toBe(true);
  });

  it("normalizes whitespace and punctuation around confidential modes", () => {
    expect(confidentialModeSupportsShield("  ZK-Native ")).toBe(true);
    expect(confidentialModeSupportsShield("Shielded Only")).toBe(true);
  });

  it("rejects unsupported or missing modes", () => {
    expect(confidentialModeSupportsShield("TransparentOnly")).toBe(false);
    expect(confidentialModeSupportsShield(null)).toBe(false);
    expect(confidentialModeSupportsShield(undefined)).toBe(false);
    expect(confidentialModeSupportsShield("")).toBe(false);
  });

  it("accepts only positive whole-number amounts for shielding", () => {
    expect(isPositiveWholeAmount("1")).toBe(true);
    expect(isPositiveWholeAmount("42")).toBe(true);
    expect(isPositiveWholeAmount(" 7 ")).toBe(true);
    expect(isPositiveWholeAmount(9)).toBe(true);

    expect(isPositiveWholeAmount("0")).toBe(false);
    expect(isPositiveWholeAmount("000")).toBe(false);
    expect(isPositiveWholeAmount("10.5")).toBe(false);
    expect(isPositiveWholeAmount("-1")).toBe(false);
    expect(isPositiveWholeAmount("abc")).toBe(false);
    expect(isPositiveWholeAmount("")).toBe(false);
    expect(isPositiveWholeAmount(null)).toBe(false);
    expect(isPositiveWholeAmount(undefined)).toBe(false);
  });
});

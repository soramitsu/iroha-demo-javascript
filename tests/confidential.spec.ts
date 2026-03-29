import { describe, expect, it } from "vitest";
import {
  confidentialModeSupportsShield,
  deriveOnChainShieldedBalance,
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

  it("derives shielded balance from committed shield and unshield instructions", () => {
    const result = deriveOnChainShieldedBalance(
      [
        {
          result_ok: true,
          authority: "alice@default",
          instructions: [
            {
              zk: {
                Shield: {
                  asset: "xor#universal",
                  from: "alice@default",
                  amount: "12",
                },
              },
            },
          ],
        },
        {
          result_ok: true,
          authority: "alice@default",
          instructions: [
            {
              zk: {
                Unshield: {
                  asset: "xor#universal",
                  to: "alice@default",
                  public_amount: "5",
                },
              },
            },
          ],
        },
        {
          result_ok: false,
          authority: "alice@default",
          instructions: [
            {
              zk: {
                Shield: {
                  asset: "xor#universal",
                  from: "alice@default",
                  amount: "99",
                },
              },
            },
          ],
        },
      ],
      {
        assetDefinitionId: "xor#universal",
        accountIds: ["alice@default"],
      },
    );

    expect(result).toEqual({
      quantity: "7",
      exact: true,
    });
  });

  it("returns unavailable once private zk transfers appear for the asset", () => {
    const result = deriveOnChainShieldedBalance(
      [
        {
          result_ok: true,
          authority: "alice@default",
          instructions: [
            {
              zk: {
                ZkTransfer: {
                  asset: "xor#universal",
                },
              },
            },
          ],
        },
      ],
      {
        assetDefinitionId: "xor#universal",
        accountIds: ["alice@default"],
      },
    );

    expect(result).toEqual({
      quantity: null,
      exact: false,
    });
  });

  it("matches committed confidential history against resolved on-chain asset ids", () => {
    const result = deriveOnChainShieldedBalance(
      [
        {
          result_ok: true,
          authority: "alice@default",
          instructions: [
            {
              zk: {
                Shield: {
                  asset: "norito:resolvedxorasset",
                  from: "alice@default",
                  amount: "9",
                },
              },
            },
          ],
        },
      ],
      {
        assetDefinitionId: "xor#universal",
        assetDefinitionIds: ["norito:resolvedxorasset"],
        accountIds: ["alice@default"],
      },
    );

    expect(result).toEqual({
      quantity: "9",
      exact: true,
    });
  });
});

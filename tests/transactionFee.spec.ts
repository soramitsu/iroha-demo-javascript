import { describe, expect, it } from "vitest";
import {
  appendTransactionFee,
  formatTransactionFee,
  formatTransactionFeeInline,
  type TransactionFeeQuoteView,
} from "@/utils/transactionFee";

const t = (key: string, params?: Record<string, string | number>) =>
  params
    ? key.replace(/\{([\w]+)\}/g, (_match, token) =>
        String(params[token] ?? `{${token}}`),
      )
    : key;

const quote = (
  overrides: Partial<TransactionFeeQuoteView> = {},
): TransactionFeeQuoteView => ({
  payer: "authority",
  components: [
    {
      kind: "pipeline_gas",
      assetDefinitionId: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
      maxAmount: "1.25",
    },
  ],
  nextBlockHeight: "42",
  ...overrides,
});

describe("transaction fee quote formatting", () => {
  it("labels signed charge limits as quoted maxima", () => {
    expect(formatTransactionFee(quote(), t)).toBe(
      "Quoted maximum network fee: 1.25 XOR (Pipeline gas) (paid by wallet).",
    );
    expect(formatTransactionFeeInline(quote(), t)).toBe(
      "Quoted maximum: 1.25 XOR (Pipeline gas)",
    );
  });

  it("formats every exact fee component", () => {
    const multi = quote({
      payer: "sponsor",
      components: [
        {
          kind: "nexus",
          assetDefinitionId: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
          maxAmount: "2",
        },
        {
          kind: "pipeline_gas",
          assetDefinitionId: "61CtjvNd9T3THAR65GsMVHr82Bjc",
          maxAmount: "3",
        },
      ],
    });

    expect(formatTransactionFee(multi, t)).toBe(
      "Quoted maximum network fee: 2 XOR (Nexus) + 3 61CtjvNd9T3THAR65GsMVHr82Bjc (Pipeline gas) (paid by sponsor).",
    );
  });

  it("distinguishes an explicit zero-component quote from no quote", () => {
    expect(formatTransactionFee(quote({ components: [] }), t)).toBe(
      "Quoted maximum network fee: none.",
    );
    expect(formatTransactionFee(null, t)).toBe(
      "Network fee quote unavailable.",
    );
    expect(formatTransactionFeeInline(undefined, t)).toBe(
      "Fee quote unavailable",
    );
  });

  it("appends only the exact quote DTO", () => {
    expect(
      appendTransactionFee("Transaction submitted: 0xabc", quote(), t),
    ).toBe(
      "Transaction submitted: 0xabc Quoted maximum network fee: 1.25 XOR (Pipeline gas) (paid by wallet).",
    );
  });
});

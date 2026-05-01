import { describe, expect, it } from "vitest";
import {
  appendTransactionFee,
  formatTransactionFee,
  formatTransactionFeeInline,
  readTransactionFee,
  transactionFeeHintForEndpoint,
} from "@/utils/transactionFee";

const t = (key: string, params?: Record<string, string | number>) =>
  params
    ? key.replace(/\{([\w]+)\}/g, (_match, token) =>
        String(params[token] ?? `{${token}}`),
      )
    : key;

describe("transaction fee formatting", () => {
  it("formats explicit fee amounts with the asset label", () => {
    const result = {
      fee: {
        amount: "1.25",
        assetId: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
      },
    };

    expect(formatTransactionFee(result, t)).toBe("Network fee: 1.25 XOR.");
    expect(formatTransactionFeeInline(result, t)).toBe("1.25 XOR");
  });

  it("marks estimated fees clearly", () => {
    expect(
      formatTransactionFee(
        {
          tx_fee: {
            amount: "2",
            asset: "xor#universal",
            source: "estimated",
          },
        },
        t,
      ),
    ).toBe("Network fee: 2 XOR (estimated).");
  });

  it("surfaces on-chain fees when the amount is unavailable", () => {
    expect(formatTransactionFee({ gas_asset_id: "xor#universal" }, t)).toBe(
      "Network fee: charged on-chain (XOR).",
    );
    expect(formatTransactionFee({}, t)).toBe(
      "Network fee: charged on-chain (amount unavailable).",
    );
  });

  it("does not treat transferred assets as fee assets", () => {
    expect(readTransactionFee({ asset_id: "xor#universal" })).toBeNull();
    expect(readTransactionFee({ assetId: "xor#universal" })).toBeNull();
    expect(
      readTransactionFee({ amount: "12", asset_id: "xor#universal" }),
    ).toBeNull();
    expect(formatTransactionFee({ asset_id: "xor#universal" }, t)).toBe(
      "Network fee: charged on-chain (amount unavailable).",
    );
  });

  it("appends fee copy to submit messages", () => {
    expect(
      appendTransactionFee(
        "Transaction submitted: 0xabc",
        { fee_amount: "3", fee_asset_id: "xor#universal" },
        t,
      ),
    ).toBe("Transaction submitted: 0xabc Network fee: 3 XOR.");
  });

  it("uses endpoint fee hints when submission results only include a hash", () => {
    expect(transactionFeeHintForEndpoint("https://taira.sora.org")).toEqual({
      fee_amount: "0.01",
      fee_asset_id: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
      source: "estimated",
    });
    expect(
      transactionFeeHintForEndpoint("https://minamoto.sora.org"),
    ).toEqual({
      fee_amount: "0.01",
      fee_asset_id: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
      source: "estimated",
    });
    expect(
      appendTransactionFee(
        "Transaction submitted: 0xabc",
        { hash: "0xabc" },
        t,
        transactionFeeHintForEndpoint("https://taira.sora.org"),
      ),
    ).toBe("Transaction submitted: 0xabc Network fee: 0.01 XOR (estimated).");
  });

  it("reads fee fields from common endpoint shapes", () => {
    expect(readTransactionFee({ network_fee: "4" })).toEqual({ amount: "4" });
    expect(readTransactionFee({ fee_amount: 5, gas_asset_id: "xor" })).toEqual(
      expect.objectContaining({ amount: 5, assetId: "xor" }),
    );
  });
});

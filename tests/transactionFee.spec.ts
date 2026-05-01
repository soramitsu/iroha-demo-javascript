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
    expect(transactionFeeHintForEndpoint("https://minamoto.sora.org")).toEqual({
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

  it("reads TAIRA committed pipeline status fee content", () => {
    const tairaStatusPayload = {
      hash: "8418e7ef3a1fa934d8a76a37d6db8c008b87a4f60c8efaebded9916bd8105c87",
      resolved_from: "state",
      scope: "global",
      status: {
        block_height: 12682,
        kind: "Applied",
        content: {
          block_height: 12682,
          fee: {
            amount: "0.01",
            asset_id: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
          },
        },
      },
      kind: "Transaction",
      content: {
        hash: "8418e7ef3a1fa934d8a76a37d6db8c008b87a4f60c8efaebded9916bd8105c87",
        status: {
          block_height: 12682,
          kind: "Applied",
          content: {
            block_height: 12682,
            fee: {
              amount: "0.01",
              asset_id: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
            },
          },
        },
      },
    };

    expect(readTransactionFee(tairaStatusPayload)).toEqual({
      amount: "0.01",
      asset_id: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
    });
    expect(formatTransactionFee(tairaStatusPayload, t)).toBe(
      "Network fee: 0.01 XOR.",
    );
  });

  it("reads TAIRA explorer transaction detail fees without treating metadata as the amount", () => {
    const tairaExplorerDetail = {
      authority: "testuﾛ1PCtﾅHﾁsﾊｺﾐ7aqﾛｶ3ｷｲﾁfWﾚUMFﾅBﾁFﾗUﾁ4yｶB9ﾕUNBQ4BL",
      hash: "ef56a586d530f5aaf03ccd37005025d4a6f9035b3c51514555e8802f37486a0d",
      block: 12673,
      created_at: "2026-04-30T17:53:53.123Z",
      executable: "Instructions",
      status: "Committed",
      rejection_reason: null,
      executable_payload: {
        instruction_count: 1,
      },
      metadata: {
        gas_asset_id: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
      },
      transaction_fee: {
        quantity: "0.01",
        gasAssetId: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
      },
      nonce: null,
      signature: "9ff763df39e338a4cc3cac7c29bb14a29d0d10ae6125f5ef",
      time_to_live: null,
    };

    expect(formatTransactionFee(tairaExplorerDetail, t)).toBe(
      "Network fee: 0.01 XOR.",
    );
    expect(
      formatTransactionFee(
        { ...tairaExplorerDetail, transaction_fee: undefined },
        t,
      ),
    ).toBe("Network fee: charged on-chain (amount unavailable).");
  });
});

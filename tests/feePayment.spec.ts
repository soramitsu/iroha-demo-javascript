import { describe, expect, it } from "vitest";
import {
  buildAuthorityFeePaymentIntent,
  extractIvmFeeContext,
  stripRetiredFeeMetadata,
} from "../electron/feePayment";

describe("transaction fee-payment intents", () => {
  it("uses an authority payer without inventing a fee asset", () => {
    expect(buildAuthorityFeePaymentIntent()).toEqual({
      payer: "authority",
      chargeLimits: [],
      gasLimit: null,
    });
  });

  it("binds a positive IVM gas limit", () => {
    expect(buildAuthorityFeePaymentIntent(50_000_000)).toEqual({
      payer: "authority",
      chargeLimits: [],
      gasLimit: 50_000_000,
    });
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid gas limit %s",
    (gasLimit) => {
      expect(() => buildAuthorityFeePaymentIntent(gasLimit)).toThrow(
        "feePayment.gasLimit must be a positive safe integer",
      );
    },
  );

  it("removes retired fee hints while preserving ordinary metadata", () => {
    const metadata = {
      memo: "keep me",
      fee_sponsor: "retired",
      gas_asset_id: "retired",
      gas_limit: 1000,
      application: { gas_limit: "nested application data" },
    };
    expect(stripRetiredFeeMetadata(metadata)).toEqual({
      memo: "keep me",
      application: { gas_limit: "nested application data" },
    });
    expect(metadata).toHaveProperty("gas_asset_id", "retired");
  });

  it("moves the governed IVM gas bound into the signed fee intent", () => {
    expect(
      extractIvmFeeContext(
        {
          gas_limit: 50_000_000,
          gas_asset_id: "must-not-reach-the-wire",
          contract_entrypoint: "burn_and_record",
        },
        "SCCP burn record",
      ),
    ).toEqual({
      feePayment: {
        payer: "authority",
        chargeLimits: [],
        gasLimit: 50_000_000,
      },
      gasLimit: 50_000_000,
      metadata: {
        contract_entrypoint: "burn_and_record",
      },
    });
  });

  it.each([
    undefined,
    {},
    { gas_limit: 0 },
    { gas_limit: "1000" },
    { gas_limit: "1.5" },
  ])("rejects missing or invalid governed IVM gas context %#", (metadata) => {
    expect(() => extractIvmFeeContext(metadata, "SCCP burn record")).toThrow(
      "requires a positive safe-integer gas_limit from governed material",
    );
  });
});

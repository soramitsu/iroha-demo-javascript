import { describe, expect, it } from "vitest";
import {
  palmatrixPaymentCents,
  palmatrixRehearsalSteps,
} from "./helpers/palmatrixRehearsal";

describe("Palmatrix rehearsal plan", () => {
  it("accepts pairing, the full lifecycle, whitespace, and duplicate steps", () => {
    expect([...palmatrixRehearsalSteps(" pair, pair, ")]).toEqual(["pair"]);
    expect(
      palmatrixRehearsalSteps(
        "pair,buy,subscribe,loan,repay,accelerated,claim,redeem",
      ).size,
    ).toBe(8);
  });
  it.each(["unknown", "loan", "repay", "claim", "accelerated,redeem"])(
    "refuses an incomplete or unknown plan: %s",
    (input) => {
      expect(() => palmatrixRehearsalSteps(input)).toThrow(/PALMATRIX_STEPS/u);
    },
  );
  it.each([
    ["0", 0n],
    ["1", 100n],
    ["3.5", 350n],
    ["9.75", 975n],
    ["9007199254740993.01", 900719925474099301n],
  ])("converts exact payment %s into cents", (input, expected) => {
    expect(palmatrixPaymentCents(input as string)).toBe(expected);
  });
  it.each(["-1", "1.001", "01", "1e2", "", "NaN"])(
    "rejects malformed or sub-cent amount %s",
    (input) => {
      expect(() => palmatrixPaymentCents(input)).toThrow(
        "Invalid EUR entitlement",
      );
    },
  );
});

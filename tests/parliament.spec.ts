import { describe, expect, it } from "vitest";
import {
  isRegisteredGovernanceCitizen,
  resolveGovernanceBondBalance,
  resolveGovernanceCitizenCount,
} from "@/utils/parliament";

describe("current Parliament utilities", () => {
  it("resolves the governance bond from only the configured citizenship asset", () => {
    expect(
      resolveGovernanceBondBalance(
        [
          {
            asset_id: "xor#universal##alice@wonderland",
            quantity: "1",
          },
          {
            asset_id: "5PgFjEiWr1iqE2a7Wp1R2gB4eVEB#alice@wonderland",
            quantity: "25000",
          },
        ],
        "5PgFjEiWr1iqE2a7Wp1R2gB4eVEB",
      ),
    ).toBe("25000");
    expect(
      resolveGovernanceBondBalance(
        [{ asset_id: "xor#universal", quantity: "25000" }],
        "5PgFjEiWr1iqE2a7Wp1R2gB4eVEB",
      ),
    ).toBe("0");
    expect(resolveGovernanceBondBalance([], null)).toBe("0");
  });

  it("keeps unavailable citizenship distinct from not-citizen", () => {
    expect(isRegisteredGovernanceCitizen({ state: "citizen" })).toBe(true);
    expect(isRegisteredGovernanceCitizen({ state: "not-citizen" })).toBe(false);
    expect(isRegisteredGovernanceCitizen({ state: "unavailable" })).toBe(false);
    expect(isRegisteredGovernanceCitizen(null)).toBe(false);
  });

  it("accepts only exact safe integer citizen counts", () => {
    expect(resolveGovernanceCitizenCount({ total: 12 })).toBe(12);
    expect(resolveGovernanceCitizenCount({ total: 0 })).toBe(0);
    expect(resolveGovernanceCitizenCount({ total: 12.9 })).toBeNull();
    expect(
      resolveGovernanceCitizenCount({ total: Number.MAX_VALUE }),
    ).toBeNull();
    expect(resolveGovernanceCitizenCount(null)).toBeNull();
  });
});

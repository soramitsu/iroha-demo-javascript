import { describe, expect, it } from "vitest";
import {
  advanceNextDate,
  applyAutoDeductions,
  formatAmount,
  type SubscriptionRecord,
} from "@/utils/subscriptions";

describe("subscription utilities", () => {
  it("advances to the next cadence date", () => {
    const base = "2025-01-15T12:00:00.000Z";
    expect(advanceNextDate(base, "monthly")).toBe("2025-02-15T12:00:00.000Z");
    expect(advanceNextDate(base, "quarterly")).toBe("2025-04-15T12:00:00.000Z");
  });

  it("formats fixed and variable amounts", () => {
    expect(formatAmount("fixed", 1500, null, "IRH")).toBe("IRH 1,500");
    expect(formatAmount("variable", null, 9000, "IRH")).toBe("Up to IRH 9,000");
  });

  it("auto-deducts and advances next charge", () => {
    const record: SubscriptionRecord = {
      id: "sub-1",
      merchant: "Netflix",
      amount: 1500,
      maxAmount: null,
      amountType: "fixed",
      cadence: "monthly",
      nextChargeAt: "2025-02-01T12:00:00.000Z",
      status: "active",
      cancelAtPeriodEnd: false,
      lastChargeAt: null,
      lastChargeAmount: null,
      note: null,
    };
    const updated = applyAutoDeductions(
      [record],
      new Date("2025-02-15T12:00:00.000Z"),
    );
    expect(updated[0].lastChargeAt).toBe("2025-02-01T12:00:00.000Z");
    expect(updated[0].nextChargeAt).toBe("2025-03-01T12:00:00.000Z");
  });

  it("cancels at period end and keeps usage-based amounts within range", () => {
    const canceling: SubscriptionRecord = {
      id: "sub-2",
      merchant: "News",
      amount: 500,
      maxAmount: null,
      amountType: "fixed",
      cadence: "monthly",
      nextChargeAt: "2025-03-01T12:00:00.000Z",
      status: "active",
      cancelAtPeriodEnd: true,
      lastChargeAt: null,
      lastChargeAmount: null,
      note: null,
    };
    const variable: SubscriptionRecord = {
      id: "sub-3",
      merchant: "AWS",
      amount: null,
      maxAmount: 1000,
      amountType: "variable",
      cadence: "monthly",
      nextChargeAt: "2025-04-01T12:00:00.000Z",
      status: "active",
      cancelAtPeriodEnd: false,
      lastChargeAt: null,
      lastChargeAmount: null,
      note: null,
    };
    const updated = applyAutoDeductions(
      [canceling, variable],
      new Date("2025-04-10T12:00:00.000Z"),
    );
    const updatedCanceling = updated[0];
    const updatedVariable = updated[1];
    expect(updatedCanceling.status).toBe("canceled");
    expect(updatedCanceling.cancelAtPeriodEnd).toBe(false);
    expect(updatedVariable.lastChargeAmount).toBeGreaterThanOrEqual(400);
    expect(updatedVariable.lastChargeAmount).toBeLessThanOrEqual(990);
  });
});

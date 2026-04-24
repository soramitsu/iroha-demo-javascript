import { describe, expect, it } from "vitest";
import {
  buildSubscriptionNftId,
  formatAmount,
  formatPlanCadence,
  formatPlanPricing,
  normalizeSubscriptionStatus,
  planChargeAssetDefinition,
  subscriptionCancelAtPeriodEnd,
  subscriptionNextChargeMs,
  subscriptionPeriodEndMs,
  subscriptionStatusFromItem,
} from "@/utils/subscriptions";

const localize = (key: string, params?: Record<string, string | number>) =>
  params
    ? key.replace(/\{([\w]+)\}/g, (_match, token: string) =>
        params[token] === undefined ? `{${token}}` : String(params[token]),
      )
    : key;

const formatNumber = (value: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);

describe("subscription utilities", () => {
  it("normalizes status values from Torii enum payloads", () => {
    expect(normalizeSubscriptionStatus("active")).toBe("active");
    expect(normalizeSubscriptionStatus({ status: "past_due", value: null })).toBe(
      "past_due",
    );
    expect(normalizeSubscriptionStatus({ status: "archived" })).toBe("unknown");
  });

  it("reads subscription timing and cancel flags from list items", () => {
    const item = {
      subscription_id: "sub-1$subscriptions.universal",
      subscription: {
        status: { status: "paused", value: null },
        next_charge_ms: 1_704_067_200_000,
        current_period_end_ms: 1_706_745_600_000,
        cancel_at_period_end: true,
      },
    };

    expect(subscriptionStatusFromItem(item)).toBe("paused");
    expect(subscriptionNextChargeMs(item)).toBe(1_704_067_200_000);
    expect(subscriptionPeriodEndMs(item)).toBe(1_706_745_600_000);
    expect(subscriptionCancelAtPeriodEnd(item)).toBe(true);
  });

  it("formats fixed and usage plan pricing from real plan metadata", () => {
    const fixedPlan = {
      pricing: {
        kind: "fixed",
        detail: {
          amount: "120",
          asset_definition: "usd#pay",
        },
      },
    };
    const usagePlan = {
      pricing: {
        kind: "usage",
        detail: {
          unit_price: "0.024",
          unit_key: "compute_ms",
          asset_definition: "usd#pay",
        },
      },
    };

    expect(planChargeAssetDefinition(fixedPlan)).toBe("usd#pay");
    expect(formatPlanPricing(fixedPlan, "XOR", localize, formatNumber)).toBe(
      "USD 120",
    );
    expect(formatPlanPricing(usagePlan, "XOR", localize, formatNumber)).toBe(
      "USD 0.02 per compute_ms",
    );
  });

  it("formats bare amount values and fixed-period cadences", () => {
    const plan = {
      billing: {
        cadence: {
          kind: "fixed_period",
          detail: {
            period_ms: 90 * 86_400_000,
          },
        },
      },
    };

    expect(formatAmount("9000", "XOR", localize, formatNumber)).toBe(
      "XOR 9,000",
    );
    expect(formatPlanCadence(plan, localize)).toBe("Quarterly");
  });

  it("builds deterministic TAIRA subscription NFT ids from a seed", () => {
    expect(
      buildSubscriptionNftId(
        "testuAlice",
        "aws_compute#commerce",
        1_704_067_200_000,
        0.5,
      ),
    ).toBe(
      "sub_testualice_aws_compute_comm_loxgzkqo_7fffffff$subscriptions.universal",
    );
  });
});

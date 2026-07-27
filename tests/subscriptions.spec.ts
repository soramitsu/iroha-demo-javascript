import { describe, expect, it } from "vitest";
import {
  buildSubscriptionNftId,
  formatAmount,
  formatPlanCadence,
  formatPlanPricing,
  formatSubscriptionQuantity,
  normalizeSubscriptionStatus,
  planIdFromPlanItem,
  planChargeAssetDefinition,
  subscriptionCancelAtPeriodEnd,
  subscriptionIdFromItem,
  subscriptionNextChargeMs,
  subscriptionPeriodEndMs,
  subscriptionPlanIdFromItem,
  subscriptionStatusFromItem,
} from "@/utils/subscriptions";

const ASSET_DEFINITION_ID = "6TEAJqbb8oEPmLncoNiMRbLEK6tw";

const localize = (key: string, params?: Record<string, string | number>) =>
  params
    ? key.replace(/\{([\w]+)\}/g, (_match, token: string) =>
        params[token] === undefined ? `{${token}}` : String(params[token]),
      )
    : key;

const formatNumber = (value: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);

describe("subscription utilities", () => {
  it("reads only exact Torii tagged status payloads", () => {
    expect(
      normalizeSubscriptionStatus({ status: "past_due", value: null }),
    ).toBe("past_due");
    expect(normalizeSubscriptionStatus("active")).toBe("unknown");
    expect(normalizeSubscriptionStatus({ status: "active" })).toBe("unknown");
    expect(
      normalizeSubscriptionStatus({ status: "archived", value: null }),
    ).toBe("unknown");
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
          asset_definition: ASSET_DEFINITION_ID,
        },
      },
    };
    const usagePlan = {
      pricing: {
        kind: "usage",
        detail: {
          unit_price: "0.024",
          unit_key: "compute_ms",
          asset_definition: ASSET_DEFINITION_ID,
        },
      },
    };

    expect(planChargeAssetDefinition(fixedPlan)).toBe(ASSET_DEFINITION_ID);
    expect(formatPlanPricing(fixedPlan, "XOR", localize, formatNumber)).toBe(
      "XOR 120",
    );
    expect(formatPlanPricing(usagePlan, "XOR", localize, formatNumber)).toBe(
      "XOR 0.02 per compute_ms",
    );
    expect(
      formatPlanPricing(
        {
          pricing: {
            kind: "fixed",
            detail: {
              amount: "1",
              asset_definition: "61CtjvNd9T3THAR65GsMVHr82Bjc",
            },
          },
        },
        "XOR",
        localize,
        formatNumber,
      ),
    ).toBe("61CtjvNd9T3THAR65GsMVHr82Bjc 1");
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

  it("does not read camelCase or generic id aliases", () => {
    expect(
      subscriptionIdFromItem({
        subscriptionId: "sub-1$subscriptions.universal",
        id: "sub-2$subscriptions.universal",
      }),
    ).toBe("");
    expect(planIdFromPlanItem({ planId: ASSET_DEFINITION_ID })).toBe("");
    expect(planIdFromPlanItem({ id: ASSET_DEFINITION_ID })).toBe("");
    expect(
      subscriptionPlanIdFromItem({
        subscription: { planId: ASSET_DEFINITION_ID },
      }),
    ).toBe("");
    expect(
      subscriptionNextChargeMs({
        subscription: { nextChargeMs: 1_704_067_200_000 },
      }),
    ).toBeNull();
    expect(
      subscriptionPeriodEndMs({
        subscription: { currentPeriodEndMs: 1_706_745_600_000 },
      }),
    ).toBeNull();
    expect(
      subscriptionCancelAtPeriodEnd({
        subscription: { cancelAtPeriodEnd: true },
      }),
    ).toBe(false);
    expect(
      planChargeAssetDefinition({
        pricing: {
          kind: "fixed",
          detail: { assetDefinition: ASSET_DEFINITION_ID },
        },
      }),
    ).toBe("");
    expect(
      formatPlanCadence(
        {
          billing: {
            cadence: {
              kind: "fixed_period",
              detail: { periodMs: 90 * 86_400_000 },
            },
          },
        },
        localize,
      ),
    ).toBe("Unknown");
  });

  it("does not coerce non-string quantities or string timestamps", () => {
    expect(formatAmount(9000, "XOR", localize, formatNumber)).toBe("XOR --");
    expect(
      subscriptionNextChargeMs({
        subscription: { next_charge_ms: "1704067200000" },
      }),
    ).toBeNull();
    expect(
      subscriptionCancelAtPeriodEnd({
        subscription: { cancel_at_period_end: "false" },
      }),
    ).toBe(false);
    expect(
      subscriptionNextChargeMs({
        subscription: { next_charge_ms: 0 },
      }),
    ).toBe(0);
  });

  it("does not round quantities that cannot be represented exactly as numbers", () => {
    expect(formatSubscriptionQuantity("9007199254740991.1", formatNumber)).toBe(
      "9007199254740991.1",
    );
    expect(formatSubscriptionQuantity("0.0000001", formatNumber)).toBe(
      "0.0000001",
    );
    expect(formatSubscriptionQuantity("0.024", formatNumber)).toBe("0.02");
    expect(formatSubscriptionQuantity("1.0", formatNumber)).toBe("");
    expect(formatSubscriptionQuantity(1, formatNumber)).toBe("");
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
      "sub_testualice_aws_compute_comme_lqu5m2o0_7fffffff$subscriptions.universal",
    );
  });
});

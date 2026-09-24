import { describe, expect, it } from "vitest";
import {
  decodeSubscriptionActionResponse,
  decodeSubscriptionCreateResponse,
  decodeSubscriptionListItemResponse,
  decodeSubscriptionListResponse,
  decodeSubscriptionPlanListResponse,
} from "../electron/subscriptionResponses";

const TX_HASH = "ab".repeat(32);
const SUBSCRIPTION_ID = "sub_demo$subscriptions.universal";
const PLAN_ID = "61CtjvNd9T3THAR65GsMVHr82Bjc";
const CHARGE_ASSET_ID = "6TEAJqbb8oEPmLncoNiMRbLEK6tw";
const PROVIDER_ID = "testuﾛ1PﾉｳﾇmEｴWｵebHﾑ6ﾔﾙｲヰiwuCWErJ7uｽoPGｱﾔnjﾑKﾋTCW2PV";
const SUBSCRIBER_ID = "testuﾛ1NﾐヱﾇCﾍUovﾏﾊｺｸﾛJbｵVtﾍykRﾗﾊhﾄﾏKqTjUｺwﾒrym3GS93U";
const INVOICE_TX_HASH =
  "hash:ABABABABABABABABABABABABABABABABABABABABABABABABABABABABABABABAB#B99E";

const fixedPlan = () => ({
  provider: PROVIDER_ID,
  billing: {
    cadence: {
      kind: "fixed_period",
      detail: { period_ms: 2_592_000_000 },
    },
    bill_for: { period: "next_period", value: null },
    retry_backoff_ms: 86_400_000,
    max_failures: 3,
    grace_ms: 604_800_000,
  },
  pricing: {
    kind: "fixed",
    detail: {
      amount: "120",
      asset_definition: CHARGE_ASSET_ID,
    },
  },
});

const usagePlan = () => ({
  provider: PROVIDER_ID,
  billing: {
    cadence: {
      kind: "monthly_calendar",
      detail: { anchor_day: 1, anchor_time_ms: 0 },
    },
    bill_for: { period: "previous_period", value: null },
    retry_backoff_ms: 86_400_000,
    max_failures: 3,
    grace_ms: 604_800_000,
  },
  pricing: {
    kind: "usage",
    detail: {
      unit_price: "0.024",
      unit_key: "compute_ms",
      asset_definition: CHARGE_ASSET_ID,
    },
  },
});

const subscriptionState = () => ({
  plan_id: PLAN_ID,
  provider: PROVIDER_ID,
  subscriber: SUBSCRIBER_ID,
  status: { status: "active", value: null },
  current_period_start_ms: 1_730_419_200_000,
  current_period_end_ms: 1_733_011_200_000,
  next_charge_ms: 1_733_011_200_000,
  cancel_at_period_end: false,
  cancel_at_ms: null as number | null,
  failure_count: 0,
  usage_accumulated: {
    compute_ms: "129600000",
  },
  billing_trigger_id: "sub_bill_demo",
});

const invoice = () => ({
  subscription_nft_id: SUBSCRIPTION_ID,
  period_start_ms: 1_730_419_200_000,
  period_end_ms: 1_733_011_200_000,
  attempted_at_ms: 1_733_011_200_000,
  amount: "31.104",
  asset_definition: CHARGE_ASSET_ID,
  status: { status: "paid", value: null },
  tx_hash: INVOICE_TX_HASH,
});

const subscriptionItem = () => ({
  subscription_id: SUBSCRIPTION_ID,
  subscription: subscriptionState(),
  invoice: invoice(),
  plan: usagePlan(),
});

describe("subscription response boundary", () => {
  it("accepts the exact empty payload served by live list routes", () => {
    const empty = {
      items: [],
      total: 0,
      has_more: false,
      count_mode: "exact",
    };
    expect(decodeSubscriptionPlanListResponse(empty)).toEqual({
      items: [],
      total: 0,
    });
    expect(decodeSubscriptionListResponse(empty)).toEqual({
      items: [],
      total: 0,
    });
  });

  it("decodes full exact first-release plan, state, and invoice payloads", () => {
    const plan = fixedPlan();
    expect(
      decodeSubscriptionPlanListResponse({
        items: [{ plan_id: PLAN_ID, plan }],
        total: 1,
        has_more: false,
        count_mode: "exact",
      }),
    ).toEqual({
      items: [{ plan_id: PLAN_ID, plan }],
      total: 1,
    });

    const item = subscriptionItem();
    expect(
      decodeSubscriptionListResponse({
        items: [item],
        total: 1,
        has_more: false,
        count_mode: "exact",
      }),
    ).toEqual({ items: [item], total: 1 });
  });

  it("accepts canonical nullable read fields but requires them to be present", () => {
    const item = subscriptionItem();
    item.invoice = null as never;
    item.plan = null as never;
    item.subscription.cancel_at_ms = 1_733_011_200_000;
    expect(decodeSubscriptionListItemResponse(item)).toEqual(item);

    const missingDefaultedField = subscriptionItem();
    delete (
      missingDefaultedField.subscription as Partial<
        ReturnType<typeof subscriptionState>
      >
    ).cancel_at_period_end;
    expect(() =>
      decodeSubscriptionListItemResponse(missingDefaultedField),
    ).toThrow("missing cancel_at_period_end");
  });

  it("rejects malformed-200 lists instead of converting them to healthy empties", () => {
    expect(() => decodeSubscriptionPlanListResponse({})).toThrow(
      "invalid fields",
    );
    expect(() =>
      decodeSubscriptionListResponse({
        items: [],
        total: 0,
        hasMore: false,
        count_mode: "exact",
      }),
    ).toThrow("invalid fields");
    expect(() =>
      decodeSubscriptionListResponse({
        items: [],
        total: 0,
        has_more: false,
        count_mode: "bounded",
      }),
    ).toThrow('count_mode must be "exact"');
    expect(() =>
      decodeSubscriptionListResponse({
        items: [subscriptionItem()],
        total: 0,
        has_more: false,
        count_mode: "exact",
      }),
    ).toThrow("pagination metadata");
  });

  it("bounds page items and accumulated usage before decoding them", () => {
    expect(() =>
      decodeSubscriptionPlanListResponse({
        items: Array.from({ length: 501 }, () => null),
        total: 501,
        has_more: false,
        count_mode: "exact",
      }),
    ).toThrow("first-release page limit of 500");

    const item = subscriptionItem();
    (item.subscription as Record<string, unknown>).usage_accumulated =
      Object.fromEntries(
        Array.from({ length: 257 }, (_, index) => [`meter_${index}`, "1"]),
      );
    expect(() => decodeSubscriptionListItemResponse(item)).toThrow(
      "first-release limit of 256 keys",
    );
  });

  it("accepts exact totals on a paginated final page", () => {
    const plan = fixedPlan();
    expect(
      decodeSubscriptionPlanListResponse({
        items: [{ plan_id: PLAN_ID, plan }],
        total: 101,
        has_more: false,
        count_mode: "exact",
      }),
    ).toEqual({
      items: [{ plan_id: PLAN_ID, plan }],
      total: 101,
    });

    const item = subscriptionItem();
    expect(
      decodeSubscriptionListResponse({
        items: [item],
        total: 101,
        has_more: false,
        count_mode: "exact",
      }),
    ).toEqual({ items: [item], total: 101 });
  });

  it("rejects missing, extra, and legacy nested fields", () => {
    const extraPlanField = fixedPlan() as ReturnType<typeof fixedPlan> & {
      currency?: string;
    };
    extraPlanField.currency = "XOR";
    expect(() =>
      decodeSubscriptionPlanListResponse({
        items: [{ plan_id: PLAN_ID, plan: extraPlanField }],
        total: 1,
        has_more: false,
        count_mode: "exact",
      }),
    ).toThrow("unexpected currency");

    expect(() =>
      decodeSubscriptionListItemResponse({
        subscriptionId: SUBSCRIPTION_ID,
        subscription: subscriptionState(),
        invoice: null,
        plan: null,
      }),
    ).toThrow("invalid fields");

    const camelCaseState = subscriptionState() as Record<string, unknown>;
    delete camelCaseState.next_charge_ms;
    camelCaseState.nextChargeMs = 1_733_011_200_000;
    expect(() =>
      decodeSubscriptionListItemResponse({
        ...subscriptionItem(),
        subscription: camelCaseState,
      }),
    ).toThrow("next_charge_ms");
  });

  it("requires exact enum tag/content objects and primitive field types", () => {
    expect(() =>
      decodeSubscriptionListItemResponse({
        ...subscriptionItem(),
        subscription: {
          ...subscriptionState(),
          status: "active",
        },
      }),
    ).toThrow("status must be an object");
    expect(() =>
      decodeSubscriptionListItemResponse({
        ...subscriptionItem(),
        subscription: {
          ...subscriptionState(),
          status: { status: "active", value: "None" },
        },
      }),
    ).toThrow("value must be null");
    expect(() =>
      decodeSubscriptionListItemResponse({
        ...subscriptionItem(),
        subscription: {
          ...subscriptionState(),
          cancel_at_period_end: "false",
        },
      }),
    ).toThrow("must be a boolean");
    expect(() =>
      decodeSubscriptionPlanListResponse({
        items: [
          {
            plan_id: PLAN_ID,
            plan: {
              ...fixedPlan(),
              billing: {
                ...fixedPlan().billing,
                max_failures: 4_294_967_296,
              },
            },
          },
        ],
        total: 1,
        has_more: false,
        count_mode: "exact",
      }),
    ).toThrow("must be at most");
  });

  it("rejects noncanonical quantities and identifier aliases", () => {
    for (const amount of [120, "0120", "120.0", "-1"]) {
      expect(() =>
        decodeSubscriptionPlanListResponse({
          items: [
            {
              plan_id: PLAN_ID,
              plan: {
                ...fixedPlan(),
                pricing: {
                  kind: "fixed",
                  detail: {
                    amount,
                    asset_definition: CHARGE_ASSET_ID,
                  },
                },
              },
            },
          ],
          total: 1,
          has_more: false,
          count_mode: "exact",
        }),
      ).toThrow("Quantity");
    }

    expect(() =>
      decodeSubscriptionPlanListResponse({
        items: [{ plan_id: "xor#universal", plan: fixedPlan() }],
        total: 1,
        has_more: false,
        count_mode: "exact",
      }),
    ).toThrow("Base58 asset definition ID");
    expect(() =>
      decodeSubscriptionPlanListResponse({
        items: [
          {
            plan_id: PLAN_ID,
            plan: { ...fixedPlan(), provider: "testuProvider" },
          },
        ],
        total: 1,
        has_more: false,
        count_mode: "exact",
      }),
    ).toThrow("canonical I105");
    expect(() =>
      decodeSubscriptionListItemResponse({
        ...subscriptionItem(),
        subscription_id: "sub_demo$subscriptions",
      }),
    ).toThrow("name$domain.dataspace");
    expect(() =>
      decodeSubscriptionListItemResponse({
        ...subscriptionItem(),
        subscription_id: "sub_demo$ab--cd.universal",
        invoice: null,
      }),
    ).toThrow("canonical Iroha domain label");
    expect(
      decodeSubscriptionListItemResponse({
        ...subscriptionItem(),
        subscription_id: "sub_demo$xn--r8jz45g.universal",
        invoice: null,
      }).subscription_id,
    ).toBe("sub_demo$xn--r8jz45g.universal");
    expect(
      decodeSubscriptionListItemResponse({
        ...subscriptionItem(),
        subscription_id: "sub_demo$provider_accounts.universal",
        invoice: null,
      }).subscription_id,
    ).toBe("sub_demo$provider_accounts.universal");
  });

  it("validates canonical optional invoice hash literals", () => {
    expect(
      decodeSubscriptionListItemResponse({
        ...subscriptionItem(),
        invoice: { ...invoice(), tx_hash: null },
      }).invoice,
    ).toMatchObject({ tx_hash: null });
    expect(() =>
      decodeSubscriptionListItemResponse({
        ...subscriptionItem(),
        invoice: {
          ...invoice(),
          tx_hash:
            "hash:ABABABABABABABABABABABABABABABABABABABABABABABABABABABABABABABAB#0000",
        },
      }),
    ).toThrow("checksum");
    expect(() =>
      decodeSubscriptionListItemResponse({
        ...subscriptionItem(),
        invoice: {
          ...invoice(),
          tx_hash: "ab".repeat(32),
        },
      }),
    ).toThrow("canonical hash literal");
    expect(() =>
      decodeSubscriptionListItemResponse({
        ...subscriptionItem(),
        invoice: {
          ...invoice(),
          subscription_nft_id: "sub_other$subscriptions.universal",
        },
      }),
    ).toThrow("does not match");
  });

  it("accepts only confirmed create and action receipts for the requested id", () => {
    expect(
      decodeSubscriptionCreateResponse(
        {
          ok: true,
          subscription_id: SUBSCRIPTION_ID,
          billing_trigger_id: "sub_bill_demo",
          usage_trigger_id: null,
          first_charge_ms: 1_800_000_000_000,
          tx_hash_hex: TX_HASH,
        },
        SUBSCRIPTION_ID,
      ),
    ).toMatchObject({
      ok: true,
      subscription_id: SUBSCRIPTION_ID,
      tx_hash_hex: TX_HASH,
    });
    expect(
      decodeSubscriptionActionResponse(
        {
          ok: true,
          subscription_id: SUBSCRIPTION_ID,
          tx_hash_hex: TX_HASH,
        },
        SUBSCRIPTION_ID,
      ),
    ).toEqual({
      ok: true,
      subscription_id: SUBSCRIPTION_ID,
      tx_hash_hex: TX_HASH,
    });
  });

  it("rejects false success, missing hashes, id mismatches, and camelCase aliases", () => {
    expect(() =>
      decodeSubscriptionActionResponse(
        {
          ok: false,
          subscription_id: SUBSCRIPTION_ID,
          tx_hash_hex: TX_HASH,
        },
        SUBSCRIPTION_ID,
      ),
    ).toThrow(".ok must be true");
    expect(() =>
      decodeSubscriptionActionResponse(
        {
          ok: true,
          subscription_id: SUBSCRIPTION_ID,
          tx_hash_hex: "",
        },
        SUBSCRIPTION_ID,
      ),
    ).toThrow("tx_hash_hex");
    expect(() =>
      decodeSubscriptionActionResponse(
        {
          ok: true,
          subscription_id: "other$subscriptions.universal",
          tx_hash_hex: TX_HASH,
        },
        SUBSCRIPTION_ID,
      ),
    ).toThrow("does not match");
    expect(() =>
      decodeSubscriptionActionResponse(
        {
          ok: true,
          subscriptionId: SUBSCRIPTION_ID,
          txHashHex: TX_HASH,
        },
        SUBSCRIPTION_ID,
      ),
    ).toThrow("invalid fields");
  });
});

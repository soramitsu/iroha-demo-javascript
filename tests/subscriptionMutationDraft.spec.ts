import { describe, expect, it, vi } from "vitest";
import {
  classifySubscriptionStateConfirmation,
  decodeSubscriptionActionMutationDraft,
  decodeSubscriptionCreateMutationDraft,
  subscriptionPlanSnapshotsMatch,
  subscriptionStateMatchesDraft,
} from "../electron/subscriptionMutationDraft";

const SUBSCRIPTION_ID = "sub_demo$subscriptions.universal";
const PLAN_ID = "61CtjvNd9T3THAR65GsMVHr82Bjc";
const CHARGE_ASSET_ID = "6TEAJqbb8oEPmLncoNiMRbLEK6tw";
const PROVIDER_ID = "testuﾛ1PﾉｳﾇmEｴWｵebHﾑ6ﾔﾙｲヰiwuCWErJ7uｽoPGｱﾔnjﾑKﾋTCW2PV";
const SUBSCRIBER_ID = "testuﾛ1NﾐヱﾇCﾍUovﾏﾊｺｸﾛJbｵVtﾍykRﾗﾊhﾄﾏKqTjUｺwﾒrym3GS93U";
const BILLING_TRIGGER_ID = "sub_bill_demo";
const CHARGE_AT_MS = 1_800_000_000_000;
const PERIOD_MS = 2_592_000_000;

const fixedPlan = () => ({
  provider: PROVIDER_ID,
  billing: {
    cadence: {
      kind: "fixed_period",
      detail: { period_ms: PERIOD_MS },
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
  ...fixedPlan(),
  pricing: {
    kind: "usage",
    detail: {
      unit_price: "0.024",
      unit_key: "compute_ms",
      asset_definition: CHARGE_ASSET_ID,
    },
  },
});

const state = (
  status:
    | "active"
    | "paused"
    | "past_due"
    | "canceled"
    | "suspended" = "active",
) => ({
  plan_id: PLAN_ID,
  provider: PROVIDER_ID,
  subscriber: SUBSCRIBER_ID,
  status: { status, value: null },
  current_period_start_ms: CHARGE_AT_MS,
  current_period_end_ms: CHARGE_AT_MS + PERIOD_MS,
  next_charge_ms: CHARGE_AT_MS,
  cancel_at_period_end: false,
  cancel_at_ms: null as number | null,
  failure_count: 0,
  usage_accumulated: {},
  billing_trigger_id: BILLING_TRIGGER_ID,
});

const createDraft = () => {
  const resulting = state();
  return {
    version: 1,
    authority: SUBSCRIBER_ID,
    action: "create",
    subscription_id: SUBSCRIPTION_ID,
    plan_id: PLAN_ID,
    billing_trigger_id: BILLING_TRIGGER_ID,
    usage_trigger_id: null,
    first_charge_ms: CHARGE_AT_MS,
    provider_usage_grant_included: false,
    resulting_subscription: resulting,
    tx_instructions: [
      { wire_id: "iroha.register", payload_hex: "aa" },
      { wire_id: "iroha.register", payload_hex: "bb" },
    ],
  };
};

const createDecoded = () => ({
  aa: {
    Register: {
      Nft: {
        id: SUBSCRIPTION_ID,
        content: { subscription: state() },
      },
    },
  },
  bb: {
    Register: {
      Trigger: {
        id: BILLING_TRIGGER_ID,
        action: "billing-action",
      },
    },
  },
});

const decodeFrom = (instructions: Record<string, unknown>) =>
  vi.fn((payloadHex: string) => {
    const instruction = instructions[payloadHex];
    if (!instruction) throw new Error("unknown instruction fixture");
    return instruction;
  });

const inspectBilling = vi.fn((encodedAction: string) => {
  if (encodedAction !== "billing-action") {
    throw new Error("unexpected action");
  }
  return {
    version: 1,
    kind: "billing",
    authority: SUBSCRIBER_ID,
    max_cycles: "100000",
    charge_at_ms: CHARGE_AT_MS,
    subscription_id: SUBSCRIPTION_ID,
  };
});

describe("subscription unsigned mutation drafts", () => {
  it("accepts a fully bound fixed-plan creation draft", () => {
    const decoded = decodeSubscriptionCreateMutationDraft(
      createDraft(),
      {
        authority: SUBSCRIBER_ID,
        subscriptionId: SUBSCRIPTION_ID,
        planId: PLAN_ID,
        plan: fixedPlan(),
        firstChargeMs: CHARGE_AT_MS,
        ivmMaxCycles: "100000",
        networkPrefix: 369,
      },
      decodeFrom(createDecoded()),
      inspectBilling,
    );

    expect(decoded.action).toBe("create");
    expect(decoded.decoded_instructions).toHaveLength(2);
    expect(inspectBilling).toHaveBeenCalledWith("billing-action");
  });

  it("binds provider, pricing kind, grant, period, and trigger behavior to the live plan", () => {
    const redirected = createDraft();
    redirected.resulting_subscription.provider = SUBSCRIBER_ID;
    const redirectedInstructions = createDecoded();
    (
      redirectedInstructions.aa as {
        Register: {
          Nft: { content: { subscription: ReturnType<typeof state> } };
        };
      }
    ).Register.Nft.content.subscription = redirected.resulting_subscription;
    expect(() =>
      decodeSubscriptionCreateMutationDraft(
        redirected,
        {
          authority: SUBSCRIBER_ID,
          subscriptionId: SUBSCRIPTION_ID,
          planId: PLAN_ID,
          plan: fixedPlan(),
          firstChargeMs: CHARGE_AT_MS,
          ivmMaxCycles: "100000",
          networkPrefix: 369,
        },
        decodeFrom(redirectedInstructions),
        inspectBilling,
      ),
    ).toThrow("provider");

    const wrongPeriod = createDraft();
    wrongPeriod.resulting_subscription.current_period_end_ms += 1;
    expect(() =>
      decodeSubscriptionCreateMutationDraft(
        wrongPeriod,
        {
          authority: SUBSCRIBER_ID,
          subscriptionId: SUBSCRIPTION_ID,
          planId: PLAN_ID,
          plan: fixedPlan(),
          firstChargeMs: CHARGE_AT_MS,
          ivmMaxCycles: "100000",
          networkPrefix: 369,
        },
        decodeFrom(createDecoded()),
        inspectBilling,
      ),
    ).toThrow("current_period_end_ms");

    expect(() =>
      decodeSubscriptionCreateMutationDraft(
        createDraft(),
        {
          authority: SUBSCRIBER_ID,
          subscriptionId: SUBSCRIPTION_ID,
          planId: PLAN_ID,
          plan: usagePlan(),
          firstChargeMs: CHARGE_AT_MS,
          ivmMaxCycles: "100000",
          networkPrefix: 369,
        },
        decodeFrom(createDecoded()),
        inspectBilling,
      ),
    ).toThrow("usage_trigger_id presence");
  });

  it("accepts only the exact usage trigger and provider permission required by a usage plan", () => {
    const usageTriggerId = "sub_usage_demo";
    const fixedDraft = createDraft();
    const payload = {
      ...fixedDraft,
      usage_trigger_id: usageTriggerId,
      provider_usage_grant_included: true,
      tx_instructions: [
        ...fixedDraft.tx_instructions,
        { wire_id: "iroha.register", payload_hex: "cc" },
        { wire_id: "iroha.grant", payload_hex: "dd" },
      ],
    };
    const decodedInstructions = {
      ...createDecoded(),
      cc: {
        Register: {
          Trigger: {
            id: usageTriggerId,
            action: "usage-action",
          },
        },
      },
      dd: {
        Grant: {
          Permission: {
            object: {
              name: "iroha_executor_data_model::permission::trigger::CanExecuteTrigger",
              payload: { trigger: usageTriggerId },
            },
            destination: PROVIDER_ID,
          },
        },
      },
    };
    const inspect = vi.fn((action: string) =>
      action === "billing-action"
        ? {
            version: 1,
            kind: "billing",
            authority: SUBSCRIBER_ID,
            max_cycles: "100000",
            charge_at_ms: CHARGE_AT_MS,
            subscription_id: SUBSCRIPTION_ID,
          }
        : {
            version: 1,
            kind: "usage",
            authority: SUBSCRIBER_ID,
            max_cycles: "100000",
            trigger_id: usageTriggerId,
          },
    );

    expect(() =>
      decodeSubscriptionCreateMutationDraft(
        payload,
        {
          authority: SUBSCRIBER_ID,
          subscriptionId: SUBSCRIPTION_ID,
          planId: PLAN_ID,
          plan: usagePlan(),
          firstChargeMs: CHARGE_AT_MS,
          ivmMaxCycles: "100000",
          networkPrefix: 369,
        },
        decodeFrom(decodedInstructions),
        inspect,
      ),
    ).not.toThrow();

    (
      decodedInstructions.dd as {
        Grant: { Permission: { destination: string } };
      }
    ).Grant.Permission.destination = SUBSCRIBER_ID;
    expect(() =>
      decodeSubscriptionCreateMutationDraft(
        payload,
        {
          authority: SUBSCRIBER_ID,
          subscriptionId: SUBSCRIPTION_ID,
          planId: PLAN_ID,
          plan: usagePlan(),
          firstChargeMs: CHARGE_AT_MS,
          ivmMaxCycles: "100000",
          networkPrefix: 369,
        },
        decodeFrom(decodedInstructions),
        inspect,
      ),
    ).toThrow("destination");
  });

  it("binds omitted charge times to the request window and triggers to the live IVM ceiling", () => {
    expect(() =>
      decodeSubscriptionCreateMutationDraft(
        createDraft(),
        {
          authority: SUBSCRIBER_ID,
          subscriptionId: SUBSCRIPTION_ID,
          planId: PLAN_ID,
          plan: fixedPlan(),
          resolvedChargeWindow: {
            requestStartedAtMs: CHARGE_AT_MS - 10,
            responseReceivedAtMs: CHARGE_AT_MS + 10,
            clockSkewMs: 30_000,
          },
          ivmMaxCycles: "100000",
          networkPrefix: 369,
        },
        decodeFrom(createDecoded()),
        inspectBilling,
      ),
    ).not.toThrow();

    expect(() =>
      decodeSubscriptionCreateMutationDraft(
        createDraft(),
        {
          authority: SUBSCRIBER_ID,
          subscriptionId: SUBSCRIPTION_ID,
          planId: PLAN_ID,
          plan: fixedPlan(),
          resolvedChargeWindow: {
            requestStartedAtMs: CHARGE_AT_MS + 60_000,
            responseReceivedAtMs: CHARGE_AT_MS + 60_100,
            clockSkewMs: 1_000,
          },
          ivmMaxCycles: "100000",
          networkPrefix: 369,
        },
        decodeFrom(createDecoded()),
        inspectBilling,
      ),
    ).toThrow("plan-bound request-time window");

    expect(() =>
      decodeSubscriptionCreateMutationDraft(
        createDraft(),
        {
          authority: SUBSCRIBER_ID,
          subscriptionId: SUBSCRIPTION_ID,
          planId: PLAN_ID,
          plan: fixedPlan(),
          firstChargeMs: CHARGE_AT_MS,
          ivmMaxCycles: "99999",
          networkPrefix: 369,
        },
        decodeFrom(createDecoded()),
        inspectBilling,
      ),
    ).toThrow("max_cycles");
  });

  it("rejects noncanonical, undecodable, reordered, and semantically substituted instructions", () => {
    const uppercase = createDraft();
    uppercase.tx_instructions[0]!.payload_hex = "AA";
    expect(() =>
      decodeSubscriptionCreateMutationDraft(
        uppercase,
        {
          authority: SUBSCRIBER_ID,
          subscriptionId: SUBSCRIPTION_ID,
          planId: PLAN_ID,
          plan: fixedPlan(),
          firstChargeMs: CHARGE_AT_MS,
          ivmMaxCycles: "100000",
          networkPrefix: 369,
        },
        decodeFrom(createDecoded()),
        inspectBilling,
      ),
    ).toThrow("lowercase canonical framed hex");

    expect(() =>
      decodeSubscriptionCreateMutationDraft(
        createDraft(),
        {
          authority: SUBSCRIBER_ID,
          subscriptionId: SUBSCRIPTION_ID,
          planId: PLAN_ID,
          plan: fixedPlan(),
          firstChargeMs: CHARGE_AT_MS,
          ivmMaxCycles: "100000",
          networkPrefix: 369,
        },
        () => {
          throw new Error("bad frame");
        },
        inspectBilling,
      ),
    ).toThrow("could not be decoded");

    const reordered = createDraft();
    reordered.tx_instructions.reverse();
    expect(() =>
      decodeSubscriptionCreateMutationDraft(
        reordered,
        {
          authority: SUBSCRIBER_ID,
          subscriptionId: SUBSCRIPTION_ID,
          planId: PLAN_ID,
          plan: fixedPlan(),
          firstChargeMs: CHARGE_AT_MS,
          ivmMaxCycles: "100000",
          networkPrefix: 369,
        },
        decodeFrom(createDecoded()),
        inspectBilling,
      ),
    ).toThrow("missing Nft");

    expect(() =>
      decodeSubscriptionCreateMutationDraft(
        createDraft(),
        {
          authority: SUBSCRIBER_ID,
          subscriptionId: SUBSCRIPTION_ID,
          planId: PLAN_ID,
          plan: fixedPlan(),
          firstChargeMs: CHARGE_AT_MS,
          ivmMaxCycles: "100000",
          networkPrefix: 369,
        },
        decodeFrom(createDecoded()),
        () => ({
          version: 1,
          kind: "usage",
          authority: SUBSCRIBER_ID,
          max_cycles: "100000",
          trigger_id: BILLING_TRIGGER_ID,
        }),
      ),
    ).toThrow("summary");
  });

  it("validates exact action transitions, tagged cancel mode, and instruction order", () => {
    const current = state("paused");
    const resulting = {
      ...current,
      status: { status: "active", value: null },
      current_period_start_ms: CHARGE_AT_MS,
      current_period_end_ms: CHARGE_AT_MS + PERIOD_MS,
      next_charge_ms: CHARGE_AT_MS,
      failure_count: 0,
    };
    const payload = {
      version: 1,
      authority: SUBSCRIBER_ID,
      action: "resume",
      subscription_id: SUBSCRIPTION_ID,
      details: {
        billing_trigger_id: BILLING_TRIGGER_ID,
        billing_trigger_operation: "register",
        effective_charge_ms: CHARGE_AT_MS,
        cancel_mode: null,
        resulting_subscription: resulting,
      },
      tx_instructions: [
        { wire_id: "iroha.set_key_value", payload_hex: "aa" },
        { wire_id: "iroha.register", payload_hex: "bb" },
      ],
    };
    const decoded = decodeSubscriptionActionMutationDraft(
      payload,
      {
        authority: SUBSCRIBER_ID,
        subscriptionId: SUBSCRIPTION_ID,
        action: "resume",
        currentSubscription: current,
        currentPlan: fixedPlan(),
        chargeAtMs: CHARGE_AT_MS,
        ivmMaxCycles: "100000",
        networkPrefix: 369,
      },
      decodeFrom({
        aa: {
          SetKeyValue: {
            Nft: {
              object: SUBSCRIPTION_ID,
              key: "subscription",
              value: resulting,
            },
          },
        },
        bb: createDecoded().bb,
      }),
      inspectBilling,
    );
    expect(decoded.details.resulting_subscription.status.status).toBe("active");

    const cancel = {
      ...payload,
      action: "cancel",
      details: {
        ...payload.details,
        billing_trigger_operation: "none",
        effective_charge_ms: null,
        cancel_mode: "period_end",
      },
      tx_instructions: [payload.tx_instructions[0]],
    };
    expect(() =>
      decodeSubscriptionActionMutationDraft(
        cancel,
        {
          authority: SUBSCRIBER_ID,
          subscriptionId: SUBSCRIPTION_ID,
          action: "cancel",
          currentSubscription: state(),
          currentPlan: fixedPlan(),
          cancelMode: "period_end",
          ivmMaxCycles: "100000",
          networkPrefix: 369,
        },
        decodeFrom({
          aa: {
            SetKeyValue: {
              Nft: {
                object: SUBSCRIPTION_ID,
                key: "subscription",
                value: cancel.details.resulting_subscription,
              },
            },
          },
        }),
        inspectBilling,
      ),
    ).toThrow("cancel_mode");
  });

  it("matches only the exact committed resulting state", () => {
    const expected = state();
    expect(subscriptionStateMatchesDraft(expected, expected, 369)).toBe(true);
    expect(
      subscriptionStateMatchesDraft(
        { ...expected, next_charge_ms: expected.next_charge_ms + 1 },
        expected,
        369,
      ),
    ).toBe(false);
  });

  it("accepts an immediate invoice-proven billing successor after the signed transaction commits", () => {
    const expected = state();
    const advanced = {
      ...expected,
      next_charge_ms: CHARGE_AT_MS + PERIOD_MS,
    };
    const invoice = {
      subscription_nft_id: SUBSCRIPTION_ID,
      period_start_ms: CHARGE_AT_MS,
      period_end_ms: CHARGE_AT_MS + PERIOD_MS,
      attempted_at_ms: CHARGE_AT_MS + 1,
      amount: "120",
      asset_definition: CHARGE_ASSET_ID,
      status: { status: "paid", value: null },
      tx_hash: null,
    };
    expect(
      classifySubscriptionStateConfirmation({
        actual: advanced,
        expected,
        plan: fixedPlan(),
        invoice,
        subscriptionId: SUBSCRIPTION_ID,
        networkPrefix: 369,
      }),
    ).toBe("advanced");
    expect(
      classifySubscriptionStateConfirmation({
        actual: advanced,
        expected,
        plan: fixedPlan(),
        invoice: { ...invoice, amount: "121" },
        subscriptionId: SUBSCRIPTION_ID,
        networkPrefix: 369,
      }),
    ).toBeNull();
  });

  it("compares the complete live plan snapshot, not only provider and cadence", () => {
    expect(subscriptionPlanSnapshotsMatch(fixedPlan(), fixedPlan(), 369)).toBe(
      true,
    );
    const changedPrice = fixedPlan();
    changedPrice.pricing.detail.amount = "121";
    expect(subscriptionPlanSnapshotsMatch(fixedPlan(), changedPrice, 369)).toBe(
      false,
    );
    const changedRetry = fixedPlan();
    changedRetry.billing.retry_backoff_ms += 1;
    expect(subscriptionPlanSnapshotsMatch(fixedPlan(), changedRetry, 369)).toBe(
      false,
    );
  });
});

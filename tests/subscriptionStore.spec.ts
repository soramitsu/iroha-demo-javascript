import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import {
  createSubscription,
  listSubscriptionPlans,
  listSubscriptions,
  pauseSubscription,
  reconcileSubscriptionMutation,
} from "@/services/iroha";
import { useSubscriptionStore } from "@/stores/subscriptions";
import type { SubscriptionListItemView } from "@/types/iroha";

vi.mock("@/services/iroha", () => ({
  listSubscriptionPlans: vi.fn(),
  listSubscriptions: vi.fn(),
  createSubscription: vi.fn(),
  pauseSubscription: vi.fn(),
  resumeSubscription: vi.fn(),
  cancelSubscription: vi.fn(),
  keepSubscription: vi.fn(),
  chargeSubscriptionNow: vi.fn(),
  reconcileSubscriptionMutation: vi.fn(),
}));

const finalizedBlockProof = (transactionHash: string) => ({
  status: "finalized" as const,
  transactionHash,
  blockHeight: 17,
  blockHash: "cd".repeat(32),
  finalizedBlockHeight: 17,
});

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const record = (
  subscriptionId: string,
  status = "active",
): SubscriptionListItemView =>
  ({
    subscription_id: subscriptionId,
    subscription: {
      status,
      plan_id: `${subscriptionId}-plan`,
    },
    invoice: null,
    plan: null,
  }) satisfies SubscriptionListItemView;

const subscriptionContext = (input: {
  toriiUrl: string;
  accountId: string;
  chainId?: string;
  networkPrefix?: number;
  observedChainId?: string;
  observedNetworkPrefix?: number | null;
  identityStatus?: string;
}) => ({
  toriiUrl: input.toriiUrl,
  accountId: input.accountId,
  chainId: input.chainId ?? "chain",
  networkPrefix: input.networkPrefix ?? 369,
  observedChainId: input.observedChainId ?? input.chainId ?? "chain",
  observedNetworkPrefix:
    input.observedNetworkPrefix === undefined
      ? (input.networkPrefix ?? 369)
      : input.observedNetworkPrefix,
  identityStatus: input.identityStatus ?? "matched",
});

describe("subscription store context ownership", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    vi.mocked(listSubscriptionPlans).mockReset();
    vi.mocked(listSubscriptions).mockReset();
    vi.mocked(pauseSubscription).mockReset();
    vi.mocked(createSubscription).mockReset();
    vi.mocked(reconcileSubscriptionMutation).mockReset();
  });

  it("does not let a slow endpoint/account response overwrite the latest context", async () => {
    const subscriptionsA = deferred<{
      items: SubscriptionListItemView[];
      total: number;
    }>();
    const plansA = deferred<{
      items: Array<{ plan_id: string; plan: Record<string, unknown> }>;
      total: number;
    }>();
    vi.mocked(listSubscriptions).mockImplementation(({ ownedBy }) =>
      ownedBy === "alice@wonderland"
        ? subscriptionsA.promise
        : Promise.resolve({
            items: [record("subscription-b")],
            total: 1,
          }),
    );
    vi.mocked(listSubscriptionPlans).mockImplementation(({ toriiUrl }) =>
      toriiUrl === "https://a.example"
        ? plansA.promise
        : Promise.resolve({
            items: [{ plan_id: "plan-b", plan: {} }],
            total: 1,
          }),
    );

    const store = useSubscriptionStore();
    const refreshA = store.refresh(
      subscriptionContext({
        toriiUrl: "https://a.example",
        accountId: "alice@wonderland",
      }),
    );
    const refreshB = store.refresh(
      subscriptionContext({
        toriiUrl: "https://b.example",
        accountId: "bob@wonderland",
      }),
    );
    await refreshB;

    expect(store.activeContext).toEqual(
      subscriptionContext({
        toriiUrl: "https://b.example",
        accountId: "bob@wonderland",
      }),
    );
    expect(store.records.map((item) => item.subscription_id)).toEqual([
      "subscription-b",
    ]);
    expect(store.plans.map((item) => item.plan_id)).toEqual(["plan-b"]);
    expect(store.loading).toBe(false);

    subscriptionsA.reject(new Error("stale A failure"));
    plansA.resolve({
      items: [{ plan_id: "plan-a", plan: {} }],
      total: 1,
    });
    await refreshA;

    expect(store.activeContext?.accountId).toBe("bob@wonderland");
    expect(store.records.map((item) => item.subscription_id)).toEqual([
      "subscription-b",
    ]);
    expect(store.plans.map((item) => item.plan_id)).toEqual(["plan-b"]);
    expect(store.error).toBe("");
    expect(store.loading).toBe(false);
  });

  it("clears state on context switch and rejects actions on an old record", async () => {
    const staleRecord = record("shared-subscription");
    const currentRecord = record("shared-subscription");
    vi.mocked(listSubscriptions)
      .mockResolvedValueOnce({ items: [staleRecord], total: 1 })
      .mockResolvedValueOnce({ items: [currentRecord], total: 1 });
    vi.mocked(listSubscriptionPlans).mockResolvedValue({
      items: [{ plan_id: "plan", plan: {} }],
      total: 1,
    });
    vi.mocked(pauseSubscription).mockResolvedValue({
      ok: true,
      action: "pause",
      subscription_id: "shared-subscription",
      tx_hash_hex: "ab".repeat(32),
      finality: finalizedBlockProof("ab".repeat(32)),
      state_status: "confirmed",
    });

    const store = useSubscriptionStore();
    await store.refresh(
      subscriptionContext({
        toriiUrl: "https://taira.example",
        accountId: "alice@wonderland",
      }),
    );
    store.activateContext(
      subscriptionContext({
        toriiUrl: "https://taira.example",
        accountId: "bob@wonderland",
      }),
    );

    expect(store.records).toEqual([]);
    expect(store.plans).toEqual([]);
    expect(store.total).toBe(0);
    expect(store.planTotal).toBe(0);
    expect(store.lastUpdatedAtMs).toBeNull();

    await store.refresh(
      subscriptionContext({
        toriiUrl: "https://taira.example",
        accountId: "bob@wonderland",
      }),
    );
    const input = {
      ...subscriptionContext({
        toriiUrl: "https://taira.example",
        accountId: "bob@wonderland",
      }),
      subscriptionId: "shared-subscription",
    };

    expect(() => store.pause(staleRecord, input)).toThrow(
      "Subscription record does not belong to the active endpoint and account context.",
    );
    expect(pauseSubscription).not.toHaveBeenCalled();

    await store.pause(store.records[0], input);
    expect(pauseSubscription).toHaveBeenCalledOnce();
  });

  it("clears records when observed endpoint identity changes at the same URL", async () => {
    vi.mocked(listSubscriptions).mockResolvedValue({
      items: [record("identity-bound-subscription")],
      total: 1,
    });
    vi.mocked(listSubscriptionPlans).mockResolvedValue({
      items: [{ plan_id: "identity-bound-plan", plan: {} }],
      total: 1,
    });

    const matchedContext = subscriptionContext({
      toriiUrl: "https://taira.example",
      accountId: "alice@wonderland",
    });
    const store = useSubscriptionStore();
    await store.refresh(matchedContext);
    const staleRecord = store.records[0];

    store.activateContext(
      subscriptionContext({
        toriiUrl: "https://taira.example",
        accountId: "alice@wonderland",
        observedChainId: "archived-chain",
        observedNetworkPrefix: 753,
        identityStatus: "mismatch",
      }),
    );

    expect(store.records).toEqual([]);
    expect(store.plans).toEqual([]);
    expect(store.total).toBe(0);
    expect(store.planTotal).toBe(0);
    expect(store.ownsRecord(staleRecord, matchedContext)).toBe(false);
  });

  it("loads every declared page for records and plans", async () => {
    const records = Array.from({ length: 101 }, (_, index) =>
      record(`subscription-${index.toString().padStart(3, "0")}`),
    );
    const plans = Array.from({ length: 101 }, (_, index) => ({
      plan_id: `plan-${index.toString().padStart(3, "0")}`,
      plan: {},
    }));
    vi.mocked(listSubscriptions).mockImplementation(({ offset = 0 }) =>
      Promise.resolve({
        items: records.slice(offset, offset + 100),
        total: records.length,
      }),
    );
    vi.mocked(listSubscriptionPlans).mockImplementation(({ offset = 0 }) =>
      Promise.resolve({
        items: plans.slice(offset, offset + 100),
        total: plans.length,
      }),
    );

    const store = useSubscriptionStore();
    await store.refresh(
      subscriptionContext({
        toriiUrl: "https://taira.example",
        accountId: "alice@wonderland",
      }),
    );

    expect(store.records).toHaveLength(101);
    expect(store.plans).toHaveLength(101);
    expect(store.total).toBe(101);
    expect(store.planTotal).toBe(101);
    expect(listSubscriptions).toHaveBeenNthCalledWith(1, {
      toriiUrl: "https://taira.example",
      ownedBy: "alice@wonderland",
      limit: 100,
      offset: 0,
    });
    expect(listSubscriptions).toHaveBeenNthCalledWith(2, {
      toriiUrl: "https://taira.example",
      ownedBy: "alice@wonderland",
      limit: 100,
      offset: 100,
    });
    expect(listSubscriptionPlans).toHaveBeenNthCalledWith(1, {
      toriiUrl: "https://taira.example",
      limit: 100,
      offset: 0,
    });
    expect(listSubscriptionPlans).toHaveBeenNthCalledWith(2, {
      toriiUrl: "https://taira.example",
      limit: 100,
      offset: 100,
    });
  });

  it("keeps plan and owned-record reads independent", async () => {
    vi.mocked(listSubscriptions)
      .mockRejectedValueOnce(new Error("owned records unavailable"))
      .mockResolvedValueOnce({
        items: [record("subscription-live")],
        total: 1,
      });
    vi.mocked(listSubscriptionPlans)
      .mockResolvedValueOnce({
        items: [{ plan_id: "plan-live", plan: {} }],
        total: 1,
      })
      .mockRejectedValueOnce(new Error("plan catalog unavailable"));

    const store = useSubscriptionStore();
    await store.refresh(
      subscriptionContext({
        toriiUrl: "https://taira.example",
        accountId: "alice@wonderland",
      }),
    );

    expect(store.records).toEqual([]);
    expect(store.recordsError).toBe("owned records unavailable");
    expect(store.plans.map((item) => item.plan_id)).toEqual(["plan-live"]);
    expect(store.plansError).toBe("");

    await store.refresh(
      subscriptionContext({
        toriiUrl: "https://taira.example",
        accountId: "alice@wonderland",
      }),
    );

    expect(store.records.map((item) => item.subscription_id)).toEqual([
      "subscription-live",
    ]);
    expect(store.recordsError).toBe("");
    expect(store.plans).toEqual([]);
    expect(store.plansError).toBe("plan catalog unavailable");
  });
});

describe("subscription finalized-state reconciliation", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    vi.mocked(createSubscription).mockReset();
    vi.mocked(reconcileSubscriptionMutation).mockReset();
  });

  it("retains an indexing finality receipt, blocks duplicate submits, and reconciles only the exact context", async () => {
    const context = subscriptionContext({
      toriiUrl: "https://taira.example",
      accountId: "alice@wonderland",
    });
    const subscriptionId = "pending$subscriptions.universal";
    const transactionHash = "ab".repeat(32);
    vi.mocked(createSubscription).mockResolvedValue({
      ok: true,
      action: "create",
      subscription_id: subscriptionId,
      tx_hash_hex: transactionHash,
      finality: finalizedBlockProof(transactionHash),
      state_status: "indexing",
      reconciliation_message:
        "Finalized transaction is waiting for the live subscription projection.",
    });

    const store = useSubscriptionStore();
    store.hydrate();
    store.activateContext(context);
    const input = {
      ...context,
      subscriptionId,
      planId: "plan$subscriptions.universal",
    };
    await store.create(input);

    expect(store.pendingForContext(context)).toHaveLength(1);
    expect(store.pendingForContext(context)[0]).toEqual({
      context,
      action: "create",
      subscriptionId,
      transactionHash,
      finality: finalizedBlockProof(transactionHash),
      message:
        "Finalized transaction is waiting for the live subscription projection.",
      recordedAtMs: expect.any(Number),
    });
    expect(JSON.stringify(store.pendingReconciliations)).not.toMatch(
      /private|secret|token/i,
    );
    expect(localStorage.getItem("iroha-demo:subscriptions")).toBeNull();

    await expect(store.create(input)).rejects.toThrow(
      "A finalized transaction for this subscription is still indexing.",
    );
    expect(createSubscription).toHaveBeenCalledOnce();

    const otherContext = subscriptionContext({
      toriiUrl: "https://taira.example",
      accountId: "bob@wonderland",
    });
    store.activateContext(otherContext);
    await expect(
      store.reconcilePending(store.pendingReconciliations[0], otherContext),
    ).rejects.toThrow(
      "Subscription reconciliation does not match the active endpoint and account context.",
    );
    expect(reconcileSubscriptionMutation).not.toHaveBeenCalled();

    store.activateContext(context);
    vi.mocked(reconcileSubscriptionMutation)
      .mockResolvedValueOnce({
        ok: true,
        action: "create",
        subscription_id: subscriptionId,
        tx_hash_hex: transactionHash,
        finality: finalizedBlockProof(transactionHash),
        state_status: "indexing",
        reconciliation_message:
          "The exact live subscription result is still indexing.",
      })
      .mockResolvedValueOnce({
        ok: true,
        action: "create",
        subscription_id: subscriptionId,
        tx_hash_hex: transactionHash,
        finality: finalizedBlockProof(transactionHash),
        state_status: "confirmed",
      });

    await store.reconcilePending(store.pendingForContext(context)[0], context);
    expect(store.pendingForContext(context)[0]?.message).toBe(
      "The exact live subscription result is still indexing.",
    );
    await store.reconcilePending(store.pendingForContext(context)[0], context);

    expect(store.pendingForContext(context)).toEqual([]);
    expect(reconcileSubscriptionMutation).toHaveBeenNthCalledWith(1, {
      toriiUrl: context.toriiUrl,
      chainId: context.chainId,
      networkPrefix: context.networkPrefix,
      accountId: context.accountId,
      subscriptionId,
      action: "create",
      transactionHash,
    });
  });

  it("blocks a concurrent duplicate before the first bridge call resolves", async () => {
    const context = subscriptionContext({
      toriiUrl: "https://taira.example",
      accountId: "alice@wonderland",
    });
    const subscriptionId = "inflight$subscriptions.universal";
    const transactionHash = "ef".repeat(32);
    const pendingResult = deferred<{
      ok: true;
      action: "create";
      subscription_id: string;
      tx_hash_hex: string;
      finality: ReturnType<typeof finalizedBlockProof>;
      state_status: "confirmed";
    }>();
    vi.mocked(createSubscription).mockReturnValue(pendingResult.promise);

    const store = useSubscriptionStore();
    store.activateContext(context);
    const input = {
      ...context,
      subscriptionId,
      planId: "plan$subscriptions.universal",
    };
    const first = store.create(input);
    await expect(store.create(input)).rejects.toThrow(
      "A subscription transaction for this subscription is already in progress.",
    );
    expect(createSubscription).toHaveBeenCalledOnce();

    pendingResult.resolve({
      ok: true,
      action: "create",
      subscription_id: subscriptionId,
      tx_hash_hex: transactionHash,
      finality: finalizedBlockProof(transactionHash),
      state_status: "confirmed",
    });
    await expect(first).resolves.toMatchObject({
      action: "create",
      state_status: "confirmed",
    });
    expect(store.mutationKeysInFlight).toEqual([]);
  });
});

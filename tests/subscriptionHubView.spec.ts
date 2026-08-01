import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import SubscriptionHubView from "@/views/SubscriptionHubView.vue";
import { useEndpointStore } from "@/stores/endpoint";
import { useSessionStore } from "@/stores/session";
import { useSubscriptionStore } from "@/stores/subscriptions";
import {
  createSubscription,
  listSubscriptionPlans,
  listSubscriptions,
  pauseSubscription,
  reconcileSubscriptionMutation,
} from "@/services/iroha";
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

const feature = (supported: boolean) => ({
  supported,
  source: "openapi" as const,
  requiredOperations: [],
  missingOperations: supported ? [] : ["POST /v1/subscriptions"],
});

const subscriptionWriteOperations = [
  "POST /v1/subscriptions",
  "POST /v1/subscriptions/{subscription_id}/pause",
  "POST /v1/subscriptions/{subscription_id}/resume",
  "POST /v1/subscriptions/{subscription_id}/cancel",
  "POST /v1/subscriptions/{subscription_id}/keep",
  "POST /v1/subscriptions/{subscription_id}/charge-now",
];

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

const subscriptionRecord = (subscriptionId: string): SubscriptionListItemView =>
  ({
    subscription_id: subscriptionId,
    subscription: {
      status: { status: "active", value: null },
      plan_id: `${subscriptionId}-plan`,
    },
    invoice: null,
    plan: null,
  }) satisfies SubscriptionListItemView;

const mountView = async (
  subscriptionWrites: boolean | { missingOperations: string[] },
) => {
  const missingOperations =
    typeof subscriptionWrites === "boolean"
      ? subscriptionWrites
        ? []
        : subscriptionWriteOperations
      : subscriptionWrites.missingOperations;
  const pinia = createPinia();
  setActivePinia(pinia);
  const session = useSessionStore();
  session.$patch({
    connection: {
      toriiUrl: "https://taira.sora.org",
      chainId: "chain",
      assetDefinitionId: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
      networkPrefix: 369,
    },
    accounts: [
      {
        displayName: "Alice",
        domain: "wonderland",
        accountId: "alice@wonderland",
        publicKeyHex: "ab".repeat(32),
        hasStoredSecret: true,
        localOnly: false,
      },
    ],
    activeAccountId: "alice@wonderland",
  });
  useEndpointStore().$patch({
    state: "ready",
    inspection: {
      schema: "iroha.wallet.endpoint-inspection.v1",
      toriiUrl: "https://taira.sora.org",
      expected: { chainId: "chain", networkPrefix: 369 },
      observed: { chainId: "chain", networkPrefix: 369 },
      identityStatus: "matched",
      accessMode: "read-write",
      checkedAtMs: 1,
      evidence: [],
      diagnostic: {
        code: "endpoint_identity_matched",
        message: "Endpoint identity matched.",
      },
      features: {
        faucetClaim: feature(true),
        confidentialTransfers: feature(true),
        kaigiMeetings: feature(true),
        governanceWrites: feature(true),
        stakingWrites: feature(true),
        subscriptionWrites: {
          supported: missingOperations.length === 0,
          source: "openapi",
          requiredOperations: subscriptionWriteOperations,
          missingOperations,
        },
        soraCloudDeploy: feature(true),
        vpnSessions: feature(true),
      },
    },
  });
  const wrapper = mount(SubscriptionHubView, {
    global: { plugins: [pinia] },
  });
  await flushPromises();
  return wrapper;
};

describe("SubscriptionHubView live capability gating", () => {
  beforeEach(() => {
    vi.mocked(listSubscriptionPlans).mockReset();
    vi.mocked(listSubscriptions).mockReset();
    vi.mocked(createSubscription).mockReset();
    vi.mocked(pauseSubscription).mockReset();
    vi.mocked(reconcileSubscriptionMutation).mockReset();
    vi.mocked(listSubscriptions).mockResolvedValue({ items: [], total: 0 });
  });

  it("renders a genuine empty state without a manual-plan write path", async () => {
    vi.mocked(listSubscriptionPlans).mockResolvedValue({
      items: [],
      total: 0,
    });
    const wrapper = await mountView(true);

    expect(wrapper.text()).toContain("No subscriptions yet");
    expect(wrapper.text()).not.toContain("Manual plan ID");
    expect(
      wrapper
        .findAll("button")
        .some((button) => button.text() === "Create subscription"),
    ).toBe(false);
  });

  it("does not report a create success when Torii returns ok false", async () => {
    vi.mocked(listSubscriptionPlans).mockResolvedValue({
      items: [{ plan_id: "plan-1", plan: { provider: "provider-1" } }],
      total: 1,
    });
    vi.mocked(createSubscription).mockResolvedValue({
      ok: false,
      action: "create",
      subscription_id: "unconfirmed$subscriptions.universal",
      tx_hash_hex: "ab".repeat(32),
      finality: finalizedBlockProof("ab".repeat(32)),
      state_status: "confirmed",
    });

    const wrapper = await mountView(true);
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "Subscribe to plan")
      ?.trigger("click");
    await flushPromises();
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(wrapper.text()).toContain(
      "Subscription response did not confirm success.",
    );
    expect(wrapper.text()).not.toContain("Subscription submitted:");
  });

  it("shows finalized indexing state, blocks a duplicate, and reconciles the exact transaction", async () => {
    const subscriptionId = "pending$subscriptions.universal";
    const transactionHash = "ab".repeat(32);
    vi.mocked(listSubscriptionPlans).mockResolvedValue({
      items: [{ plan_id: "plan-1", plan: { provider: "provider-1" } }],
      total: 1,
    });
    vi.mocked(createSubscription).mockResolvedValue({
      ok: true,
      action: "create",
      subscription_id: subscriptionId,
      tx_hash_hex: transactionHash,
      finality: finalizedBlockProof(transactionHash),
      state_status: "indexing",
      reconciliation_message:
        "The transaction is finalized; the live subscription projection is still indexing.",
    });
    vi.mocked(reconcileSubscriptionMutation).mockResolvedValue({
      ok: true,
      action: "create",
      subscription_id: subscriptionId,
      tx_hash_hex: transactionHash,
      finality: finalizedBlockProof(transactionHash),
      state_status: "confirmed",
    });

    const wrapper = await mountView(true);
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "Subscribe to plan")
      ?.trigger("click");
    await flushPromises();
    await wrapper.findAll("input")[0]!.setValue(subscriptionId);
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(wrapper.text()).toContain(
      "Transaction finalized; subscription state is still indexing",
    );
    expect(wrapper.text()).toContain(
      "Subscription creation finalized in block 17.",
    );
    expect(wrapper.text()).toContain(transactionHash);
    expect(wrapper.text()).toContain("Subscription finalized:");
    expect(wrapper.text()).not.toContain("Subscription submitted:");
    expect(
      wrapper.get("button.subscription-submit").attributes("disabled"),
    ).toBeDefined();
    expect(createSubscription).toHaveBeenCalledOnce();

    await wrapper
      .findAll("button")
      .find((button) => button.text() === "Refresh and reconcile")
      ?.trigger("click");
    await flushPromises();

    expect(reconcileSubscriptionMutation).toHaveBeenCalledWith({
      toriiUrl: "https://taira.sora.org",
      chainId: "chain",
      networkPrefix: 369,
      accountId: "alice@wonderland",
      subscriptionId,
      action: "create",
      transactionHash,
    });
    expect(wrapper.text()).not.toContain(
      "Transaction finalized; subscription state is still indexing",
    );
    expect(wrapper.text()).toContain(
      "Finalized subscription state reconciled:",
    );
    expect(wrapper.text()).toContain("Block 17");
  });

  it("disables creation when subscription writes are not advertised", async () => {
    vi.mocked(listSubscriptionPlans).mockResolvedValue({
      items: [
        {
          plan_id: "plan-1",
          plan: { provider: "provider-1" },
        },
      ],
      total: 1,
    });
    const wrapper = await mountView(false);
    const addTab = wrapper
      .findAll("button")
      .find((button) => button.text() === "Subscribe to plan");
    expect(addTab).toBeDefined();
    await addTab!.trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("Subscription writes unavailable");
    expect(wrapper.text()).toContain(
      "This endpoint does not advertise the required subscription write operations.",
    );
    expect(wrapper.find("form").exists()).toBe(false);
    expect(createSubscription).not.toHaveBeenCalled();
  });

  it("keeps supported subscription operations live when one action route is missing", async () => {
    vi.mocked(listSubscriptions).mockResolvedValue({
      items: [subscriptionRecord("subscription-live")],
      total: 1,
    });
    vi.mocked(listSubscriptionPlans).mockResolvedValue({
      items: [
        {
          plan_id: "plan-1",
          plan: { provider: "provider-1" },
        },
      ],
      total: 1,
    });

    const wrapper = await mountView({
      missingOperations: [
        "POST /v1/subscriptions/{subscription_id}/charge-now",
      ],
    });

    const pauseButton = wrapper
      .findAll("button")
      .find((button) => button.text() === "Pause");
    const chargeButton = wrapper
      .findAll("button")
      .find((button) => button.text() === "Charge now");
    expect(pauseButton?.attributes("disabled")).toBeUndefined();
    expect(chargeButton?.attributes("disabled")).toBeDefined();

    await wrapper
      .findAll("button")
      .find((button) => button.text() === "Subscribe to plan")
      ?.trigger("click");
    await flushPromises();

    expect(wrapper.find("form").exists()).toBe(true);
    expect(wrapper.text()).not.toContain("Subscription writes unavailable");
  });

  it("preserves exact invoice quantities and the Unix epoch", async () => {
    const record = subscriptionRecord("subscription-live");
    record.subscription.next_charge_ms = 0;
    record.invoice = {
      amount: "9007199254740991.1",
      asset_definition: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
      status: { status: "paid", value: null },
    };
    vi.mocked(listSubscriptions).mockResolvedValue({
      items: [record],
      total: 1,
    });
    vi.mocked(listSubscriptionPlans).mockResolvedValue({
      items: [],
      total: 0,
    });

    const wrapper = await mountView(true);

    expect(wrapper.text()).toContain("9007199254740991.1 XOR");
    expect(wrapper.text()).not.toContain("on —");
  });

  it("clears account A immediately and ignores its response after account B loads", async () => {
    const subscriptionsA = deferred<{
      items: SubscriptionListItemView[];
      total: number;
    }>();
    const subscriptionsB = deferred<{
      items: SubscriptionListItemView[];
      total: number;
    }>();
    vi.mocked(listSubscriptions).mockImplementation(({ ownedBy }) =>
      ownedBy === "alice@wonderland"
        ? subscriptionsA.promise
        : subscriptionsB.promise,
    );
    vi.mocked(listSubscriptionPlans).mockResolvedValue({
      items: [{ plan_id: "plan", plan: {} }],
      total: 1,
    });

    const wrapper = await mountView(true);
    const session = useSessionStore();
    session.$patch({
      accounts: [
        ...session.accounts,
        {
          displayName: "Bob",
          domain: "wonderland",
          accountId: "bob@wonderland",
          publicKeyHex: "cd".repeat(32),
          hasStoredSecret: true,
          localOnly: false,
        },
      ],
      activeAccountId: "bob@wonderland",
    });

    expect(useSubscriptionStore().records).toEqual([]);
    expect(useSubscriptionStore().activeContext?.accountId).toBe(
      "bob@wonderland",
    );

    subscriptionsB.resolve({
      items: [subscriptionRecord("subscription-b")],
      total: 1,
    });
    await flushPromises();
    expect(wrapper.text()).toContain("subscription-b");

    subscriptionsA.resolve({
      items: [subscriptionRecord("subscription-a")],
      total: 1,
    });
    await flushPromises();
    await flushPromises();

    expect(wrapper.text()).toContain("subscription-b");
    expect(wrapper.text()).not.toContain("subscription-a");
    expect(
      useSubscriptionStore().records.map((record) => record.subscription_id),
    ).toEqual(["subscription-b"]);
  });
});

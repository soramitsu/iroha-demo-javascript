import { defineStore } from "pinia";
import {
  cancelSubscription,
  chargeSubscriptionNow,
  createSubscription,
  keepSubscription,
  listSubscriptionPlans,
  listSubscriptions,
  pauseSubscription,
  resumeSubscription,
} from "@/services/iroha";
import type {
  SubscriptionListItemView,
  SubscriptionPlanListItemView,
} from "@/types/iroha";

export const SUBSCRIPTION_STORAGE_KEY = "iroha-demo:subscriptions";

type SubscriptionState = {
  hydrated: boolean;
  loading: boolean;
  records: SubscriptionListItemView[];
  plans: SubscriptionPlanListItemView[];
  total: number;
  planTotal: number;
  error: string;
  lastUpdatedAtMs: number | null;
};

type RefreshInput = {
  toriiUrl: string;
  accountId?: string;
};

type SignedSubscriptionInput = {
  toriiUrl: string;
  accountId: string;
  privateKeyHex?: string;
  subscriptionId: string;
};

type CreateSubscriptionInput = SignedSubscriptionInput & {
  planId: string;
  firstChargeMs?: number;
};

type CancelSubscriptionInput = SignedSubscriptionInput & {
  cancelMode?: "immediate" | "period_end";
};

type ChargeSubscriptionInput = SignedSubscriptionInput & {
  chargeAtMs?: number;
};

const defaultState = (): SubscriptionState => ({
  hydrated: false,
  loading: false,
  records: [],
  plans: [],
  total: 0,
  planTotal: 0,
  error: "",
  lastUpdatedAtMs: null,
});

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error ?? "Unknown error");

export const useSubscriptionStore = defineStore("subscriptions", {
  state: defaultState,
  actions: {
    hydrate() {
      if (this.hydrated) return;
      localStorage.removeItem(SUBSCRIPTION_STORAGE_KEY);
      this.hydrated = true;
    },
    async refresh({ toriiUrl, accountId }: RefreshInput) {
      this.loading = true;
      this.error = "";
      try {
        const [subscriptionsResult, plansResult] = await Promise.allSettled([
          accountId
            ? listSubscriptions({
                toriiUrl,
                ownedBy: accountId,
                limit: 100,
              })
            : Promise.resolve({ items: [], total: 0 }),
          listSubscriptionPlans({
            toriiUrl,
            limit: 100,
          }),
        ]);

        if (subscriptionsResult.status === "fulfilled") {
          this.records = subscriptionsResult.value.items;
          this.total = subscriptionsResult.value.total;
        } else {
          this.records = [];
          this.total = 0;
          this.error = errorMessage(subscriptionsResult.reason);
        }

        if (plansResult.status === "fulfilled") {
          this.plans = plansResult.value.items;
          this.planTotal = plansResult.value.total;
        } else {
          this.plans = [];
          this.planTotal = 0;
          this.error = this.error
            ? `${this.error} ${errorMessage(plansResult.reason)}`
            : errorMessage(plansResult.reason);
        }

        this.lastUpdatedAtMs = Date.now();
      } finally {
        this.loading = false;
      }
    },
    create(input: CreateSubscriptionInput) {
      return createSubscription(input);
    },
    pause(input: SignedSubscriptionInput) {
      return pauseSubscription(input);
    },
    resume(input: ChargeSubscriptionInput) {
      return resumeSubscription(input);
    },
    cancel(input: CancelSubscriptionInput) {
      return cancelSubscription(input);
    },
    keep(input: SignedSubscriptionInput) {
      return keepSubscription(input);
    },
    chargeNow(input: ChargeSubscriptionInput) {
      return chargeSubscriptionNow(input);
    },
  },
});

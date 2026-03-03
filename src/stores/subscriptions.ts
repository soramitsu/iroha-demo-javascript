import { defineStore } from "pinia";
import {
  advanceNextDate,
  applyAutoDeductions,
  type SubscriptionCadence,
  type SubscriptionRecord,
} from "@/utils/subscriptions";

export const SUBSCRIPTION_STORAGE_KEY = "iroha-demo:subscriptions";

type SubscriptionState = {
  hydrated: boolean;
  records: SubscriptionRecord[];
};

const defaultState = (): SubscriptionState => ({
  hydrated: false,
  records: [],
});

const createId = () =>
  `sub_${Date.now()}_${Math.random().toString(16).slice(2)}`;

const seedSubscriptions = (): SubscriptionRecord[] => {
  const now = new Date().toISOString();
  return [
    {
      id: createId(),
      merchant: "Netflix",
      amount: 1500,
      maxAmount: null,
      amountType: "fixed",
      cadence: "monthly",
      nextChargeAt: advanceNextDate(now, "monthly"),
      status: "active",
      cancelAtPeriodEnd: false,
      lastChargeAt: null,
      lastChargeAmount: null,
      note: "Streaming",
    },
    {
      id: createId(),
      merchant: "AWS",
      amount: null,
      maxAmount: 9000,
      amountType: "variable",
      cadence: "monthly",
      nextChargeAt: advanceNextDate(now, "monthly"),
      status: "active",
      cancelAtPeriodEnd: false,
      lastChargeAt: null,
      lastChargeAmount: null,
      note: "Usage based",
    },
    {
      id: createId(),
      merchant: "Duolingo",
      amount: 1200,
      maxAmount: null,
      amountType: "fixed",
      cadence: "yearly",
      nextChargeAt: advanceNextDate(now, "yearly"),
      status: "paused",
      cancelAtPeriodEnd: false,
      lastChargeAt: null,
      lastChargeAmount: null,
      note: null,
    },
  ];
};

export const useSubscriptionStore = defineStore("subscriptions", {
  state: defaultState,
  actions: {
    hydrate() {
      if (this.hydrated) return;
      const raw = localStorage.getItem(SUBSCRIPTION_STORAGE_KEY);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as Partial<SubscriptionState>;
          this.records = Array.isArray(parsed.records) ? parsed.records : [];
          this.hydrated = true;
          this.syncAutoDeductions();
          return;
        } catch (error) {
          console.warn("Failed to parse subscriptions", error);
        }
      }
      this.records = seedSubscriptions();
      this.hydrated = true;
      this.syncAutoDeductions();
    },
    persist() {
      const payload = JSON.stringify({ hydrated: true, records: this.records });
      localStorage.setItem(SUBSCRIPTION_STORAGE_KEY, payload);
    },
    syncAutoDeductions() {
      this.records = applyAutoDeductions(this.records);
      this.persist();
    },
    addSubscription(payload: {
      merchant: string;
      amount: number | null;
      maxAmount: number | null;
      cadence: SubscriptionCadence;
      note?: string | null;
    }) {
      const amountType = payload.amount != null ? "fixed" : "variable";
      const nextChargeAt = advanceNextDate(
        new Date().toISOString(),
        payload.cadence,
      );
      const record: SubscriptionRecord = {
        id: createId(),
        merchant: payload.merchant,
        amount: payload.amount,
        maxAmount: payload.maxAmount,
        amountType,
        cadence: payload.cadence,
        nextChargeAt,
        status: "active",
        cancelAtPeriodEnd: false,
        lastChargeAt: null,
        lastChargeAmount: null,
        note: payload.note ?? null,
      };
      this.records = [record, ...this.records];
      this.persist();
    },
    togglePause(id: string) {
      this.records = this.records.map((record) => {
        if (record.id !== id || record.status === "canceled") {
          return record;
        }
        return {
          ...record,
          status: record.status === "paused" ? "active" : "paused",
        };
      });
      this.persist();
    },
    toggleCancelAtPeriodEnd(id: string) {
      this.records = this.records.map((record) => {
        if (record.id !== id || record.status === "canceled") {
          return record;
        }
        return {
          ...record,
          cancelAtPeriodEnd: !record.cancelAtPeriodEnd,
        };
      });
      this.persist();
    },
    removeSubscription(id: string) {
      this.records = this.records.filter((record) => record.id !== id);
      this.persist();
    },
  },
});

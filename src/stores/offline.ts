import { defineStore } from "pinia";
import {
  applyAllowanceSnapshot,
  applyIncomingPayment,
  applyOutgoingPayment,
  applyWithdrawToOnline,
  emptyOfflineState,
  type OfflinePaymentPayload,
  type OfflineStateSnapshot,
} from "@/utils/offline";

export const OFFLINE_STORAGE_KEY = "iroha-demo:offline";

export type OfflineHardwareState = {
  supported: boolean;
  registered: boolean;
  credentialId: string | null;
  registeredAtMs: number | null;
};

export type OfflineStoreState = {
  hydrated: boolean;
  wallet: OfflineStateSnapshot;
  hardware: OfflineHardwareState;
};

const defaultHardware = (): OfflineHardwareState => ({
  supported: false,
  registered: false,
  credentialId: null,
  registeredAtMs: null,
});

const defaultState = (): OfflineStoreState => ({
  hydrated: false,
  wallet: emptyOfflineState(),
  hardware: defaultHardware(),
});

export const useOfflineStore = defineStore("offline", {
  state: defaultState,
  getters: {
    balance: (state) => state.wallet.balance,
    hasHardwareWallet: (state) => state.hardware.registered,
  },
  actions: {
    hydrate() {
      if (this.hydrated) return;
      const raw = localStorage.getItem(OFFLINE_STORAGE_KEY);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as Partial<OfflineStoreState>;
          this.$patch({
            hydrated: true,
            wallet: { ...emptyOfflineState(), ...(parsed.wallet ?? {}) },
            hardware: { ...defaultHardware(), ...(parsed.hardware ?? {}) },
          });
          return;
        } catch (error) {
          console.warn("Failed to parse offline state", error);
        }
      }
      this.hydrated = true;
      this.persist();
    },
    persist(snapshot?: OfflineStoreState) {
      const payload = JSON.stringify(snapshot ?? this.$state);
      localStorage.setItem(OFFLINE_STORAGE_KEY, payload);
    },
    reset() {
      const fresh = defaultState();
      this.$patch(fresh);
      this.persist();
    },
    setHardwareSupport(supported: boolean) {
      this.hardware.supported = supported;
    },
    registerHardware(credentialId: string | null) {
      this.hardware.registered = true;
      this.hardware.credentialId = credentialId;
      this.hardware.registeredAtMs = Date.now();
      this.persist();
    },
    updateAllowanceSnapshot(snapshot: {
      total: string;
      syncedAtMs: number;
      nextPolicyExpiryMs: number | null;
      nextRefreshMs?: number | null;
    }) {
      this.wallet = applyAllowanceSnapshot(this.wallet, snapshot);
      this.persist();
    },
    recordOutgoingPayment(payload: OfflinePaymentPayload) {
      this.wallet = applyOutgoingPayment(this.wallet, payload);
      this.persist();
    },
    recordIncomingPayment(payload: OfflinePaymentPayload) {
      this.wallet = applyIncomingPayment(this.wallet, payload);
      this.persist();
    },
    withdrawToOnline(params: {
      accountId: string;
      receiver: string;
      amount: string;
      memo?: string | null;
    }) {
      const { state, txId } = applyWithdrawToOnline(this.wallet, params);
      this.wallet = state;
      this.persist();
      return txId;
    },
  },
});

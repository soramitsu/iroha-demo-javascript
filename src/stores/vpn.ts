import { defineStore } from "pinia";
import type {
  VpnAvailability,
  VpnExitClass,
  VpnProfile,
  VpnReceipt,
} from "@/types/iroha";

export const VPN_STORAGE_KEY = "iroha-demo:vpn";

type VpnStoreState = {
  hydrated: boolean;
  selectedExitClass: VpnExitClass;
  lastProfile: VpnProfile | null;
  receipts: VpnReceipt[];
  helperHealth: VpnAvailability | null;
};

const defaultState = (): VpnStoreState => ({
  hydrated: false,
  selectedExitClass: "standard",
  lastProfile: null,
  receipts: [],
  helperHealth: null,
});

const normalizeExitClass = (value: unknown): VpnExitClass => {
  switch (value) {
    case "low-latency":
    case "high-security":
    case "standard":
      return value;
    default:
      return "standard";
  }
};

const normalizeReceipts = (value: unknown): VpnReceipt[] =>
  Array.isArray(value) ? (value as VpnReceipt[]) : [];

export const useVpnStore = defineStore("vpn", {
  state: defaultState,
  actions: {
    hydrate() {
      if (this.hydrated) {
        return;
      }
      const raw = localStorage.getItem(VPN_STORAGE_KEY);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as Partial<VpnStoreState>;
          this.selectedExitClass = normalizeExitClass(parsed.selectedExitClass);
          this.lastProfile = parsed.lastProfile ?? null;
          this.receipts = normalizeReceipts(parsed.receipts);
          this.helperHealth = parsed.helperHealth ?? null;
        } catch (error) {
          console.warn("Failed to parse VPN store", error);
        }
      }
      this.hydrated = true;
      this.persist();
    },
    persist() {
      const payload = JSON.stringify({
        hydrated: true,
        selectedExitClass: this.selectedExitClass,
        lastProfile: this.lastProfile,
        receipts: this.receipts,
        helperHealth: this.helperHealth,
      });
      localStorage.setItem(VPN_STORAGE_KEY, payload);
    },
    setSelectedExitClass(exitClass: VpnExitClass) {
      this.selectedExitClass = exitClass;
      this.persist();
    },
    setLastProfile(profile: VpnProfile | null) {
      this.lastProfile = profile;
      this.persist();
    },
    setReceipts(receipts: VpnReceipt[]) {
      this.receipts = receipts;
      this.persist();
    },
    setHelperHealth(health: VpnAvailability | null) {
      this.helperHealth = health;
      this.persist();
    },
  },
});

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

export const useVpnStore = defineStore("vpn", {
  state: defaultState,
  actions: {
    hydrate() {
      if (this.hydrated) {
        return;
      }
      localStorage.removeItem(VPN_STORAGE_KEY);
      this.$patch({
        ...defaultState(),
        hydrated: true,
      });
    },
    persist() {
      localStorage.removeItem(VPN_STORAGE_KEY);
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

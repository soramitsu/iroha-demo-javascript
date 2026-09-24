import { defineStore } from "pinia";

import {
  getSoraCloudHfSharedLeaseStatus,
  getSoraCloudStatus,
} from "@/services/iroha";
import type {
  SoraCloudHfSharedLeaseStatusResponseView,
  SoraCloudStatusResponseView,
  SoraCloudStorageClassView,
} from "@/types/iroha";
import type {
  SoraCloudAvailability,
  SoraCloudServiceSummary,
} from "@/utils/soracloud";

export const SORACLOUD_STORAGE_KEY = "iroha-demo:soracloud";

type RefreshInput = {
  toriiUrl: string;
  accountId?: string;
};

export type SoraCloudHfSharedLeaseStatusInput = RefreshInput & {
  repoId: string;
  revision: string;
  storageClass: SoraCloudStorageClassView;
  leaseTermMs: number;
};

type SoraCloudState = {
  hydrated: boolean;
  loading: boolean;
  hfSharedLeaseStatusLoading: boolean;
  availability: SoraCloudAvailability;
  status: SoraCloudStatusResponseView | null;
  hfSharedLeaseStatus: SoraCloudHfSharedLeaseStatusResponseView | null;
  services: SoraCloudServiceSummary[];
  error: string;
  hfSharedLeaseStatusError: string;
  lastUpdatedAtMs: number | null;
  activeToriiUrl: string;
  activeAccountId: string;
  contextGeneration: number;
  statusRequestGeneration: number;
  hfSharedLeaseStatusRequestGeneration: number;
};

const defaultState = (): SoraCloudState => ({
  hydrated: false,
  loading: false,
  hfSharedLeaseStatusLoading: false,
  availability: "unknown",
  status: null,
  hfSharedLeaseStatus: null,
  services: [],
  error: "",
  hfSharedLeaseStatusError: "",
  lastUpdatedAtMs: null,
  activeToriiUrl: "",
  activeAccountId: "",
  contextGeneration: 0,
  statusRequestGeneration: 0,
  hfSharedLeaseStatusRequestGeneration: 0,
});

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error ?? "Unknown error");

export const useSoraCloudStore = defineStore("soracloud", {
  state: defaultState,
  actions: {
    hydrate() {
      if (this.hydrated) return;
      localStorage.removeItem(SORACLOUD_STORAGE_KEY);
      this.hydrated = true;
    },
    activateContext(toriiUrlRaw: string, accountIdRaw = "") {
      const toriiUrl = toriiUrlRaw.trim();
      const accountId = accountIdRaw.trim();
      if (!toriiUrl) {
        throw new Error("Torii endpoint is required for SoraCloud.");
      }
      if (
        this.activeToriiUrl === toriiUrl &&
        this.activeAccountId === accountId
      ) {
        return;
      }
      this.activeToriiUrl = toriiUrl;
      this.activeAccountId = accountId;
      this.contextGeneration += 1;
      this.statusRequestGeneration += 1;
      this.hfSharedLeaseStatusRequestGeneration += 1;
      this.loading = false;
      this.hfSharedLeaseStatusLoading = false;
      this.availability = "unknown";
      this.status = null;
      this.hfSharedLeaseStatus = null;
      this.services = [];
      this.error = "";
      this.hfSharedLeaseStatusError = "";
      this.lastUpdatedAtMs = null;
    },
    clearHfSharedLeaseStatus() {
      this.hfSharedLeaseStatusRequestGeneration += 1;
      this.hfSharedLeaseStatusLoading = false;
      this.hfSharedLeaseStatus = null;
      this.hfSharedLeaseStatusError = "";
    },
    async refresh(input: RefreshInput) {
      this.activateContext(input.toriiUrl, input.accountId);
      const toriiUrl = input.toriiUrl.trim();
      const contextGeneration = this.contextGeneration;
      const requestGeneration = this.statusRequestGeneration + 1;
      this.statusRequestGeneration = requestGeneration;
      this.loading = true;
      this.error = "";
      const ownsRequest = () =>
        this.contextGeneration === contextGeneration &&
        this.statusRequestGeneration === requestGeneration &&
        this.activeToriiUrl === toriiUrl;
      try {
        const status = await getSoraCloudStatus({ toriiUrl });
        if (!ownsRequest()) return;
        this.status = status;
        this.services = status.services;
        this.availability = status.available ? "available" : "unavailable";
        this.error = status.available ? "" : status.message || "";
        this.lastUpdatedAtMs = Date.now();
      } catch (error) {
        if (!ownsRequest()) return;
        this.status = null;
        this.services = [];
        this.availability = "error";
        this.error = errorMessage(error);
        this.lastUpdatedAtMs = Date.now();
      } finally {
        if (ownsRequest()) {
          this.loading = false;
        }
      }
    },
    async refreshHfSharedLeaseStatus(input: SoraCloudHfSharedLeaseStatusInput) {
      this.activateContext(input.toriiUrl, input.accountId);
      const toriiUrl = input.toriiUrl.trim();
      const contextGeneration = this.contextGeneration;
      const requestGeneration = this.hfSharedLeaseStatusRequestGeneration + 1;
      this.hfSharedLeaseStatusRequestGeneration = requestGeneration;
      this.hfSharedLeaseStatusLoading = true;
      this.hfSharedLeaseStatusError = "";
      const ownsRequest = () =>
        this.contextGeneration === contextGeneration &&
        this.hfSharedLeaseStatusRequestGeneration === requestGeneration &&
        this.activeToriiUrl === toriiUrl;
      try {
        const status = await getSoraCloudHfSharedLeaseStatus({
          ...input,
          toriiUrl,
        });
        if (!ownsRequest()) return null;
        this.hfSharedLeaseStatus = status;
        return status;
      } catch (error) {
        if (ownsRequest()) {
          this.hfSharedLeaseStatus = null;
          this.hfSharedLeaseStatusError = errorMessage(error);
        }
        throw error;
      } finally {
        if (ownsRequest()) {
          this.hfSharedLeaseStatusLoading = false;
        }
      }
    },
  },
});

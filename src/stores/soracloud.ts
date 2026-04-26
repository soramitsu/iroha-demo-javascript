import { defineStore } from "pinia";
import {
  deploySoraCloudHf,
  getSoraCloudHfStatus,
  getSoraCloudStatus,
} from "@/services/iroha";
import type {
  SoraCloudHfDeployResponseView,
  SoraCloudStatusResponseView,
  SoraCloudStorageClassView,
} from "@/types/iroha";
import {
  validateSoraCloudLeaseAssetDefinitionId,
  type SoraCloudAvailability,
  type SoraCloudServiceSummary,
} from "@/utils/soracloud";

export const SORACLOUD_STORAGE_KEY = "iroha-demo:soracloud";

type RefreshInput = {
  toriiUrl: string;
  apiToken?: string;
};

export type SoraCloudHfLaunchInput = RefreshInput & {
  accountId: string;
  privateKeyHex?: string;
  repoId: string;
  revision?: string;
  modelName: string;
  serviceName: string;
  apartmentName?: string;
  storageClass: SoraCloudStorageClassView;
  leaseTermMs: number;
  leaseAssetDefinitionId: string;
  baseFeeNanos: string;
};

type SoraCloudState = {
  hydrated: boolean;
  loading: boolean;
  launching: boolean;
  availability: SoraCloudAvailability;
  status: SoraCloudStatusResponseView | null;
  hfStatus: Record<string, unknown> | null;
  services: SoraCloudServiceSummary[];
  error: string;
  launchError: string;
  lastUpdatedAtMs: number | null;
  launchResult: SoraCloudHfDeployResponseView | null;
};

const defaultState = (): SoraCloudState => ({
  hydrated: false,
  loading: false,
  launching: false,
  availability: "unknown",
  status: null,
  hfStatus: null,
  services: [],
  error: "",
  launchError: "",
  lastUpdatedAtMs: null,
  launchResult: null,
});

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error ?? "Unknown error");

const validateLaunchInput = (input: SoraCloudHfLaunchInput) => {
  if (!input.accountId.trim()) throw new Error("Active wallet is required.");
  if (!input.repoId.trim()) throw new Error("Hugging Face repo is required.");
  if (!input.modelName.trim()) throw new Error("Model name is required.");
  if (!input.serviceName.trim()) throw new Error("Service name is required.");
  if (!input.leaseAssetDefinitionId.trim()) {
    throw new Error("Settlement asset is required.");
  }
  if (!validateSoraCloudLeaseAssetDefinitionId(input.leaseAssetDefinitionId)) {
    throw new Error(
      "Settlement asset must be a canonical asset definition ID.",
    );
  }
  if (!/^\d+$/u.test(input.baseFeeNanos.trim())) {
    throw new Error("Base fee must be a whole number of nanos.");
  }
  if (BigInt(input.baseFeeNanos.trim()) <= 0n) {
    throw new Error("Base fee must be greater than zero.");
  }
  if (!Number.isSafeInteger(input.leaseTermMs) || input.leaseTermMs <= 0) {
    throw new Error("Lease duration must be greater than zero.");
  }
};

export const useSoraCloudStore = defineStore("soracloud", {
  state: defaultState,
  actions: {
    hydrate() {
      if (this.hydrated) return;
      localStorage.removeItem(SORACLOUD_STORAGE_KEY);
      this.hydrated = true;
    },
    async refresh(input: RefreshInput) {
      this.loading = true;
      this.error = "";
      try {
        const status = await getSoraCloudStatus(input);
        this.status = status;
        this.services = status.services;
        this.availability = status.available ? "available" : "unavailable";
        this.error = status.available ? "" : status.message || "";
        this.lastUpdatedAtMs = Date.now();
      } catch (error) {
        this.status = null;
        this.services = [];
        this.availability = "error";
        this.error = errorMessage(error);
        this.lastUpdatedAtMs = Date.now();
      } finally {
        this.loading = false;
      }
    },
    async refreshHfStatus(input: RefreshInput) {
      this.hfStatus = await getSoraCloudHfStatus(input);
      return this.hfStatus;
    },
    async launchHf(input: SoraCloudHfLaunchInput) {
      validateLaunchInput(input);
      this.launching = true;
      this.launchError = "";
      this.launchResult = null;
      try {
        const result = await deploySoraCloudHf(input);
        this.launchResult = result;
        await this.refresh({
          toriiUrl: input.toriiUrl,
          apiToken: input.apiToken,
        });
        return result;
      } catch (error) {
        this.launchError = errorMessage(error);
        throw error;
      } finally {
        this.launching = false;
      }
    },
  },
});

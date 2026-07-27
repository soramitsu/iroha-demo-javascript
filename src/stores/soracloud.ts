import { defineStore } from "pinia";
import {
  deploySoraCloudHf,
  getSoraCloudHfStatus,
  getSoraCloudStatus,
  reconcileSoraCloudHfLaunch,
} from "@/services/iroha";
import type {
  SoraCloudHfDeployResponseView,
  SoraCloudHfStatusResponseView,
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
  accountId?: string;
};

export type SoraCloudHfStatusInput = RefreshInput & {
  repoId: string;
  revision?: string;
  storageClass: SoraCloudStorageClassView;
  leaseTermMs: number;
  accountId?: string;
};

export type SoraCloudHfLaunchInput = RefreshInput & {
  chainId: string;
  networkPrefix: number;
  accountId: string;
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

export type SoraCloudHfReconcileInput = RefreshInput & {
  chainId: string;
  networkPrefix: number;
  accountId: string;
  transactionHash: string;
};

type SoraCloudState = {
  hydrated: boolean;
  loading: boolean;
  hfStatusLoading: boolean;
  launching: boolean;
  reconciling: boolean;
  availability: SoraCloudAvailability;
  status: SoraCloudStatusResponseView | null;
  hfStatus: SoraCloudHfStatusResponseView | null;
  services: SoraCloudServiceSummary[];
  error: string;
  hfStatusError: string;
  launchError: string;
  lastUpdatedAtMs: number | null;
  launchResult: SoraCloudHfDeployResponseView | null;
  activeToriiUrl: string;
  activeAccountId: string;
  contextGeneration: number;
  statusRequestGeneration: number;
  hfStatusRequestGeneration: number;
  launchRequestGeneration: number;
};

const defaultState = (): SoraCloudState => ({
  hydrated: false,
  loading: false,
  hfStatusLoading: false,
  launching: false,
  reconciling: false,
  availability: "unknown",
  status: null,
  hfStatus: null,
  services: [],
  error: "",
  hfStatusError: "",
  launchError: "",
  lastUpdatedAtMs: null,
  launchResult: null,
  activeToriiUrl: "",
  activeAccountId: "",
  contextGeneration: 0,
  statusRequestGeneration: 0,
  hfStatusRequestGeneration: 0,
  launchRequestGeneration: 0,
});

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error ?? "Unknown error");

const CANONICAL_QUANTITY_RE = /^(?:0|[1-9]\d*)(?:\.(?:\d{0,27}[1-9]))?$/u;

const compareQuantities = (left: string, right: string): number => {
  const parts = (value: string) => {
    const [whole, fraction = ""] = value.split(".");
    return { mantissa: BigInt(`${whole}${fraction}`), scale: fraction.length };
  };
  const leftParts = parts(left);
  const rightParts = parts(right);
  const scale = Math.max(leftParts.scale, rightParts.scale);
  const leftMantissa =
    leftParts.mantissa * 10n ** BigInt(scale - leftParts.scale);
  const rightMantissa =
    rightParts.mantissa * 10n ** BigInt(scale - rightParts.scale);
  return leftMantissa < rightMantissa
    ? -1
    : leftMantissa > rightMantissa
      ? 1
      : 0;
};

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

const assertSuccessfulLaunchResult = (
  result: SoraCloudHfDeployResponseView,
  expectedServiceName: string,
) => {
  if (result.ok !== true) {
    throw new Error("SoraCloud launch response did not confirm success.");
  }
  if (
    typeof result.service_name !== "string" ||
    result.service_name !== expectedServiceName
  ) {
    throw new Error(
      "SoraCloud launch response does not match the requested service.",
    );
  }
  if (
    result.settlement_status !== "confirmed" &&
    result.settlement_status !== "indexing"
  ) {
    throw new Error(
      "SoraCloud launch response did not include a canonical settlement status.",
    );
  }
  if (
    typeof result.tx_hash_hex !== "string" ||
    !/^[0-9a-f]{64}$/u.test(result.tx_hash_hex)
  ) {
    throw new Error(
      "SoraCloud launch response did not include a canonical transaction hash.",
    );
  }
  if (
    result.finality?.status !== "finalized" ||
    result.finality.transactionHash !== result.tx_hash_hex ||
    !Number.isSafeInteger(result.finality.blockHeight) ||
    result.finality.blockHeight < 1 ||
    !/^[0-9a-f]{64}$/u.test(result.finality.blockHash) ||
    !Number.isSafeInteger(result.finality.finalizedBlockHeight) ||
    result.finality.finalizedBlockHeight < result.finality.blockHeight
  ) {
    throw new Error(
      "SoraCloud launch response did not prove the transaction in a finalized block.",
    );
  }
  for (const field of [
    "storage_base_fee",
    "max_compute_reservation_fee",
  ] as const) {
    if (
      typeof result[field] !== "string" ||
      !CANONICAL_QUANTITY_RE.test(result[field])
    ) {
      throw new Error(
        `SoraCloud launch response did not include a canonical ${field}.`,
      );
    }
  }
  if (result.settlement_status === "confirmed") {
    if (
      typeof result.action !== "string" ||
      !result.action ||
      result.action.trim() !== result.action
    ) {
      throw new Error(
        "SoraCloud confirmed launch response did not include a canonical action.",
      );
    }
    if (!Number.isSafeInteger(result.sequence) || (result.sequence ?? -1) < 0) {
      throw new Error(
        "SoraCloud confirmed launch response did not include a valid sequence.",
      );
    }
    for (const field of [
      "actual_storage_charge",
      "actual_compute_charge",
    ] as const) {
      if (
        typeof result[field] !== "string" ||
        !CANONICAL_QUANTITY_RE.test(result[field])
      ) {
        throw new Error(
          `SoraCloud confirmed launch response did not include a canonical ${field}.`,
        );
      }
    }
    if (
      compareQuantities(
        result.actual_compute_charge as string,
        result.max_compute_reservation_fee,
      ) > 0
    ) {
      throw new Error(
        "SoraCloud actual compute charge exceeds the reviewed maximum.",
      );
    }
    if (
      compareQuantities(
        result.actual_storage_charge as string,
        result.storage_base_fee,
      ) > 0
    ) {
      throw new Error(
        "SoraCloud actual storage charge exceeds the reviewed base fee.",
      );
    }
  } else {
    if (
      result.action !== null ||
      result.sequence !== null ||
      result.actual_storage_charge !== null ||
      result.actual_compute_charge !== null
    ) {
      throw new Error(
        "SoraCloud indexing response must not claim authoritative settlement values.",
      );
    }
    if (
      typeof result.reconciliation_message !== "string" ||
      !result.reconciliation_message ||
      result.reconciliation_message.trim() !== result.reconciliation_message
    ) {
      throw new Error(
        "SoraCloud indexing response did not include reconciliation guidance.",
      );
    }
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
      this.hfStatusRequestGeneration += 1;
      this.launchRequestGeneration += 1;
      this.loading = false;
      this.hfStatusLoading = false;
      this.launching = false;
      this.reconciling = false;
      this.availability = "unknown";
      this.status = null;
      this.hfStatus = null;
      this.services = [];
      this.error = "";
      this.hfStatusError = "";
      this.launchError = "";
      this.lastUpdatedAtMs = null;
      this.launchResult = null;
    },
    clearHfStatus() {
      this.hfStatusRequestGeneration += 1;
      this.hfStatusLoading = false;
      this.hfStatus = null;
      this.hfStatusError = "";
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
    async refreshHfStatus(input: SoraCloudHfStatusInput) {
      this.activateContext(input.toriiUrl, input.accountId);
      const toriiUrl = input.toriiUrl.trim();
      const contextGeneration = this.contextGeneration;
      const requestGeneration = this.hfStatusRequestGeneration + 1;
      this.hfStatusRequestGeneration = requestGeneration;
      this.hfStatusLoading = true;
      this.hfStatusError = "";
      const ownsRequest = () =>
        this.contextGeneration === contextGeneration &&
        this.hfStatusRequestGeneration === requestGeneration &&
        this.activeToriiUrl === toriiUrl;
      try {
        const status = await getSoraCloudHfStatus({
          ...input,
          toriiUrl,
        });
        if (!ownsRequest()) return null;
        this.hfStatus = status;
        return status;
      } catch (error) {
        if (ownsRequest()) {
          this.hfStatus = null;
          this.hfStatusError = errorMessage(error);
        }
        throw error;
      } finally {
        if (ownsRequest()) {
          this.hfStatusLoading = false;
        }
      }
    },
    async launchHf(input: SoraCloudHfLaunchInput) {
      validateLaunchInput(input);
      this.activateContext(input.toriiUrl, input.accountId);
      const toriiUrl = input.toriiUrl.trim();
      if (this.launchResult?.settlement_status === "indexing") {
        throw new Error(
          "The previous transaction is finalized, but its SoraCloud settlement is still indexing. Reconcile it before submitting another launch.",
        );
      }
      const contextGeneration = this.contextGeneration;
      const requestGeneration = this.launchRequestGeneration + 1;
      this.launchRequestGeneration = requestGeneration;
      this.launching = true;
      this.launchError = "";
      this.launchResult = null;
      const ownsRequest = () =>
        this.contextGeneration === contextGeneration &&
        this.launchRequestGeneration === requestGeneration &&
        this.activeToriiUrl === toriiUrl;
      try {
        const result = await deploySoraCloudHf({
          ...input,
          toriiUrl,
        });
        assertSuccessfulLaunchResult(result, input.serviceName.trim());
        if (!ownsRequest()) {
          return result;
        }
        this.launchResult = result;
        await Promise.allSettled([
          this.refresh({ toriiUrl, accountId: input.accountId }),
          this.refreshHfStatus({
            toriiUrl,
            repoId: input.repoId,
            revision: input.revision,
            storageClass: input.storageClass,
            leaseTermMs: input.leaseTermMs,
            accountId: input.accountId,
          }),
        ]);
        return result;
      } catch (error) {
        if (ownsRequest()) {
          this.launchError = errorMessage(error);
        }
        throw error;
      } finally {
        if (ownsRequest()) {
          this.launching = false;
        }
      }
    },
    async reconcileHfLaunch(input: SoraCloudHfReconcileInput) {
      const toriiUrl = input.toriiUrl.trim();
      const accountId = input.accountId.trim();
      const transactionHash = input.transactionHash.trim();
      if (
        this.activeToriiUrl !== toriiUrl ||
        this.activeAccountId !== accountId
      ) {
        throw new Error(
          "SoraCloud reconciliation does not match the active endpoint and wallet.",
        );
      }
      if (
        this.launchResult?.settlement_status !== "indexing" ||
        this.launchResult.tx_hash_hex !== transactionHash
      ) {
        throw new Error(
          "There is no matching finalized SoraCloud settlement to reconcile.",
        );
      }
      const contextGeneration = this.contextGeneration;
      const requestGeneration = this.launchRequestGeneration + 1;
      this.launchRequestGeneration = requestGeneration;
      this.reconciling = true;
      this.launchError = "";
      const ownsRequest = () =>
        this.contextGeneration === contextGeneration &&
        this.launchRequestGeneration === requestGeneration &&
        this.activeToriiUrl === toriiUrl &&
        this.activeAccountId === accountId;
      try {
        const result = await reconcileSoraCloudHfLaunch({
          toriiUrl,
          chainId: input.chainId,
          networkPrefix: input.networkPrefix,
          accountId,
          transactionHash,
        });
        assertSuccessfulLaunchResult(result, this.launchResult.service_name);
        if (!ownsRequest()) return result;
        this.launchResult = result;
        if (result.settlement_status === "confirmed") {
          await Promise.allSettled([this.refresh({ toriiUrl, accountId })]);
        }
        return result;
      } catch (error) {
        if (ownsRequest()) {
          this.launchError = errorMessage(error);
        }
        throw error;
      } finally {
        if (ownsRequest()) {
          this.reconciling = false;
        }
      }
    },
  },
});

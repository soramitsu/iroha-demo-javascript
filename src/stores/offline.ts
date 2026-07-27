import { defineStore } from "pinia";
import {
  applyAllowanceSnapshot,
  applyIncomingPayment,
  applyOutgoingPayment,
  emptyOfflineState,
  type OfflinePaymentPayload,
  type OfflineStateSnapshot,
} from "@/utils/offline";
import {
  buildEndpointDerivedStorageKey,
  type EndpointIdentityScope,
} from "@/utils/endpointScope";

export const OFFLINE_STORAGE_KEY = "iroha-demo:offline";
export const OFFLINE_STORAGE_SCHEMA = "iroha-demo-offline-state/v2";

export type OfflinePersistenceScope = {
  endpointIdentity: EndpointIdentityScope;
  accountId: string;
  assetDefinitionId: string;
};

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
  persistenceScope: OfflinePersistenceScope | null;
  lockedPersistenceKeys: string[];
  quarantinedPersistenceKeys: string[];
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
  persistenceScope: null,
  lockedPersistenceKeys: [],
  quarantinedPersistenceKeys: [],
});

type PersistedOfflineState = {
  schema: typeof OFFLINE_STORAGE_SCHEMA;
  endpointStorageSegment: string;
  accountId: string;
  assetDefinitionId: string;
  wallet: OfflineStateSnapshot;
  hardware: OfflineHardwareState;
};

export const buildOfflineStorageKey = (scope: OfflinePersistenceScope) =>
  buildEndpointDerivedStorageKey(
    OFFLINE_STORAGE_KEY,
    {
      toriiUrl: scope.endpointIdentity.origin,
      observedChainId: scope.endpointIdentity.chainId,
      observedNetworkPrefix: scope.endpointIdentity.networkPrefix,
    },
    [scope.accountId, scope.assetDefinitionId],
  );

const normalizeScope = (
  scope: OfflinePersistenceScope,
): OfflinePersistenceScope | null => {
  const accountId = scope.accountId.trim();
  const assetDefinitionId = scope.assetDefinitionId.trim();
  if (!accountId || !assetDefinitionId) {
    return null;
  }
  return {
    endpointIdentity: scope.endpointIdentity,
    accountId,
    assetDefinitionId,
  };
};

const scopeMatches = (
  persisted: Partial<PersistedOfflineState>,
  scope: OfflinePersistenceScope,
) =>
  persisted.schema === OFFLINE_STORAGE_SCHEMA &&
  persisted.endpointStorageSegment === scope.endpointIdentity.storageSegment &&
  persisted.accountId === scope.accountId &&
  persisted.assetDefinitionId === scope.assetDefinitionId;

const restoreOfflineState = (
  persisted: Partial<PersistedOfflineState>,
): Pick<OfflineStoreState, "wallet" | "hardware"> => ({
  wallet: { ...emptyOfflineState(), ...(persisted.wallet ?? {}) },
  hardware: { ...defaultHardware(), ...(persisted.hardware ?? {}) },
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
      localStorage.removeItem(OFFLINE_STORAGE_KEY);
      this.$patch({
        ...defaultState(),
        hydrated: true,
      });
    },
    activatePersistenceScope(scope: OfflinePersistenceScope | null) {
      const normalized = scope ? normalizeScope(scope) : null;
      const currentKey = this.persistenceScope
        ? buildOfflineStorageKey(this.persistenceScope)
        : null;
      const nextKey = normalized ? buildOfflineStorageKey(normalized) : null;
      if (currentKey === nextKey) {
        return;
      }

      this.$patch({
        hydrated: true,
        wallet: emptyOfflineState(),
        hardware: defaultHardware(),
        persistenceScope: normalized,
      });
      if (!normalized || !nextKey) {
        return;
      }

      const raw = localStorage.getItem(nextKey);
      if (!raw) {
        return;
      }
      try {
        const persisted = JSON.parse(raw) as Partial<PersistedOfflineState>;
        if (!scopeMatches(persisted, normalized)) {
          localStorage.removeItem(nextKey);
          return;
        }
        this.$patch(restoreOfflineState(persisted));
      } catch (error) {
        console.warn("Failed to parse scoped offline state", error);
        localStorage.removeItem(nextKey);
      }
    },
    persist() {
      localStorage.removeItem(OFFLINE_STORAGE_KEY);
      const scope = this.persistenceScope;
      if (!scope) {
        return;
      }
      const payload: PersistedOfflineState = {
        schema: OFFLINE_STORAGE_SCHEMA,
        endpointStorageSegment: scope.endpointIdentity.storageSegment,
        accountId: scope.accountId,
        assetDefinitionId: scope.assetDefinitionId,
        wallet: this.wallet,
        hardware: this.hardware,
      };
      localStorage.setItem(
        buildOfflineStorageKey(scope),
        JSON.stringify(payload),
      );
    },
    isPersistenceScopeLocked(scope: OfflinePersistenceScope | null) {
      const normalized = scope ? normalizeScope(scope) : null;
      return normalized
        ? this.lockedPersistenceKeys.includes(
            buildOfflineStorageKey(normalized),
          )
        : false;
    },
    isPersistenceScopeQuarantined(scope: OfflinePersistenceScope | null) {
      const normalized = scope ? normalizeScope(scope) : null;
      return normalized
        ? this.quarantinedPersistenceKeys.includes(
            buildOfflineStorageKey(normalized),
          )
        : false;
    },
    lockPersistenceScope(scope: OfflinePersistenceScope) {
      const normalized = normalizeScope(scope);
      if (!normalized) {
        return false;
      }
      const key = buildOfflineStorageKey(normalized);
      if (
        this.lockedPersistenceKeys.includes(key) ||
        this.quarantinedPersistenceKeys.includes(key)
      ) {
        return false;
      }
      this.lockedPersistenceKeys.push(key);
      return true;
    },
    unlockPersistenceScope(scope: OfflinePersistenceScope) {
      const normalized = normalizeScope(scope);
      if (!normalized) {
        return;
      }
      const key = buildOfflineStorageKey(normalized);
      if (this.quarantinedPersistenceKeys.includes(key)) {
        return;
      }
      this.lockedPersistenceKeys = this.lockedPersistenceKeys.filter(
        (entry) => entry !== key,
      );
    },
    quarantinePersistenceScope(scope: OfflinePersistenceScope) {
      const normalized = normalizeScope(scope);
      if (!normalized) {
        return;
      }
      const key = buildOfflineStorageKey(normalized);
      try {
        localStorage.removeItem(key);
      } catch {
        // Keep the in-memory quarantine even if storage itself is unavailable.
      }
      if (!this.quarantinedPersistenceKeys.includes(key)) {
        this.quarantinedPersistenceKeys.push(key);
      }
      if (!this.lockedPersistenceKeys.includes(key)) {
        this.lockedPersistenceKeys.push(key);
      }
      const currentKey = this.persistenceScope
        ? buildOfflineStorageKey(this.persistenceScope)
        : null;
      if (currentKey === key) {
        this.wallet = emptyOfflineState();
      }
    },
    commitWalletForScope(input: {
      scope: OfflinePersistenceScope;
      expectedWallet: OfflineStateSnapshot;
      wallet: OfflineStateSnapshot;
      fallbackHardware: OfflineHardwareState;
    }) {
      const scope = normalizeScope(input.scope);
      if (!scope) {
        return false;
      }
      const key = buildOfflineStorageKey(scope);
      const currentKey = this.persistenceScope
        ? buildOfflineStorageKey(this.persistenceScope)
        : null;
      const quarantine = () => {
        this.quarantinePersistenceScope(scope);
        return false;
      };
      let hardware = { ...input.fallbackHardware };
      let raw: string | null;
      try {
        raw = localStorage.getItem(key);
      } catch {
        return quarantine();
      }
      if (raw) {
        try {
          const persisted = JSON.parse(raw) as Partial<PersistedOfflineState>;
          if (!scopeMatches(persisted, scope)) {
            return quarantine();
          }
          const restored = restoreOfflineState(persisted);
          if (
            JSON.stringify(restored.wallet) !==
            JSON.stringify(input.expectedWallet)
          ) {
            return quarantine();
          }
          hardware = restored.hardware;
        } catch {
          return quarantine();
        }
      }
      if (
        currentKey === key &&
        JSON.stringify(this.wallet) !== JSON.stringify(input.expectedWallet)
      ) {
        return quarantine();
      }
      if (currentKey === key) {
        hardware = this.hardware;
      }
      const payload: PersistedOfflineState = {
        schema: OFFLINE_STORAGE_SCHEMA,
        endpointStorageSegment: scope.endpointIdentity.storageSegment,
        accountId: scope.accountId,
        assetDefinitionId: scope.assetDefinitionId,
        wallet: input.wallet,
        hardware,
      };
      try {
        localStorage.setItem(key, JSON.stringify(payload));
      } catch {
        return quarantine();
      }
      if (currentKey === key) {
        this.wallet = input.wallet;
      }
      return true;
    },
    reset() {
      this.$patch({
        hydrated: true,
        wallet: emptyOfflineState(),
        hardware: defaultHardware(),
      });
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
      if (this.isPersistenceScopeLocked(this.persistenceScope)) {
        throw new Error(
          "Offline balance mutations are locked while an online move is pending reconciliation.",
        );
      }
      this.wallet = applyAllowanceSnapshot(this.wallet, snapshot);
      this.persist();
    },
    recordOutgoingPayment(payload: OfflinePaymentPayload) {
      if (this.isPersistenceScopeLocked(this.persistenceScope)) {
        throw new Error(
          "Offline balance mutations are locked while an online move is pending reconciliation.",
        );
      }
      this.wallet = applyOutgoingPayment(this.wallet, payload);
      this.persist();
    },
    recordIncomingPayment(payload: OfflinePaymentPayload) {
      if (this.isPersistenceScopeLocked(this.persistenceScope)) {
        throw new Error(
          "Offline balance mutations are locked while an online move is pending reconciliation.",
        );
      }
      this.wallet = applyIncomingPayment(this.wallet, payload);
      this.persist();
    },
  },
});

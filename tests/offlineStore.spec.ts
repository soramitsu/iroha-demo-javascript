import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import {
  buildOfflineStorageKey,
  OFFLINE_STORAGE_KEY,
  useOfflineStore,
  type OfflinePersistenceScope,
} from "@/stores/offline";
import { buildEndpointIdentityScope } from "@/utils/endpointScope";

describe("offline store persistence boundary", () => {
  const scope = (
    chainId = "chain-a",
    networkPrefix = 369,
    accountId = "testuAlice",
    assetDefinitionId = "xor-a",
  ): OfflinePersistenceScope => ({
    endpointIdentity: buildEndpointIdentityScope({
      toriiUrl: "https://taira.example/v1",
      observedChainId: chainId,
      observedNetworkPrefix: networkPrefix,
    }),
    accountId,
    assetDefinitionId,
  });

  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it("starts clean and removes the legacy global endpoint-derived snapshot", () => {
    localStorage.setItem(
      OFFLINE_STORAGE_KEY,
      JSON.stringify({
        wallet: {
          balance: "999",
        },
        hardware: {
          registered: true,
          credentialId: "legacy-credential",
        },
      }),
    );

    const store = useOfflineStore();
    store.hydrate();

    expect(store.balance).toBe("0");
    expect(store.hasHardwareWallet).toBe(false);
    expect(localStorage.getItem(OFFLINE_STORAGE_KEY)).toBeNull();
  });

  it("does not persist endpoint-derived state before a trusted scope is active", () => {
    const store = useOfflineStore();
    store.hydrate();

    store.updateAllowanceSnapshot({
      total: "25",
      syncedAtMs: 1,
      nextPolicyExpiryMs: null,
    });

    expect(store.balance).toBe("25");
    expect(localStorage.getItem(OFFLINE_STORAGE_KEY)).toBeNull();
    expect(localStorage.length).toBe(0);
  });

  it("persists and restores state only inside its endpoint/account/asset scope", () => {
    const activeScope = scope();
    const storageKey = buildOfflineStorageKey(activeScope);
    const store = useOfflineStore();
    store.hydrate();
    store.activatePersistenceScope(activeScope);
    store.updateAllowanceSnapshot({
      total: "25",
      syncedAtMs: 1,
      nextPolicyExpiryMs: null,
    });

    expect(JSON.parse(localStorage.getItem(storageKey) ?? "{}")).toMatchObject({
      schema: "iroha-demo-offline-state/v2",
      endpointStorageSegment: activeScope.endpointIdentity.storageSegment,
      accountId: activeScope.accountId,
      assetDefinitionId: activeScope.assetDefinitionId,
      wallet: { balance: "25" },
    });

    setActivePinia(createPinia());
    const restored = useOfflineStore();
    restored.hydrate();
    restored.activatePersistenceScope(activeScope);
    expect(restored.balance).toBe("25");
  });

  it.each([
    ["chain", scope("chain-b")],
    ["prefix", scope("chain-a", 753)],
    ["account", scope("chain-a", 369, "testuBob")],
    ["asset", scope("chain-a", 369, "testuAlice", "xor-b")],
  ])(
    "isolates state when the %s dimension changes",
    (_dimension, otherScope) => {
      const store = useOfflineStore();
      store.hydrate();
      store.activatePersistenceScope(scope());
      store.updateAllowanceSnapshot({
        total: "25",
        syncedAtMs: 1,
        nextPolicyExpiryMs: null,
      });

      store.activatePersistenceScope(otherScope);
      expect(store.balance).toBe("0");

      store.activatePersistenceScope(scope());
      expect(store.balance).toBe("25");
    },
  );

  it("locks only the exact endpoint/account/asset scope", () => {
    const store = useOfflineStore();
    const alice = scope();
    const bob = scope("chain-a", 369, "testuBob");
    store.hydrate();
    store.activatePersistenceScope(alice);

    expect(store.lockPersistenceScope(alice)).toBe(true);
    expect(store.lockPersistenceScope(alice)).toBe(false);
    expect(store.isPersistenceScopeLocked(alice)).toBe(true);
    expect(store.isPersistenceScopeLocked(bob)).toBe(false);
    expect(() =>
      store.updateAllowanceSnapshot({
        total: "25",
        syncedAtMs: 1,
        nextPolicyExpiryMs: null,
      }),
    ).toThrow("Offline balance mutations are locked");

    store.unlockPersistenceScope(alice);
    expect(store.isPersistenceScopeLocked(alice)).toBe(false);
  });

  it("atomically commits a wallet to an inactive scope without touching the active scope", () => {
    const store = useOfflineStore();
    const alice = scope();
    const bob = scope("chain-a", 369, "testuBob");
    const aliceWallet = {
      ...store.wallet,
      balance: "25",
    };
    store.hydrate();
    store.activatePersistenceScope(alice);
    store.$patch({ wallet: aliceWallet });
    store.persist();
    store.activatePersistenceScope(bob);
    store.$patch({
      wallet: {
        ...store.wallet,
        balance: "7",
      },
    });
    store.persist();

    const committed = store.commitWalletForScope({
      scope: alice,
      expectedWallet: aliceWallet,
      wallet: {
        ...aliceWallet,
        balance: "15",
        nextCounter: 1,
      },
      fallbackHardware: store.hardware,
    });

    expect(committed).toBe(true);
    expect(store.balance).toBe("7");
    expect(
      JSON.parse(localStorage.getItem(buildOfflineStorageKey(alice)) ?? "{}")
        .wallet,
    ).toMatchObject({ balance: "15", nextCounter: 1 });
  });

  it("quarantines a scoped commit when the persisted wallet changed", () => {
    const store = useOfflineStore();
    const alice = scope();
    store.hydrate();
    store.activatePersistenceScope(alice);
    const expectedWallet = { ...store.wallet, balance: "25" };
    store.$patch({ wallet: expectedWallet });
    store.persist();
    store.$patch({
      wallet: {
        ...store.wallet,
        balance: "20",
      },
    });
    store.persist();

    expect(
      store.commitWalletForScope({
        scope: alice,
        expectedWallet,
        wallet: { ...expectedWallet, balance: "15" },
        fallbackHardware: store.hardware,
      }),
    ).toBe(false);
    expect(store.balance).toBe("0");
    expect(store.isPersistenceScopeLocked(alice)).toBe(true);
    expect(store.isPersistenceScopeQuarantined(alice)).toBe(true);
    expect(localStorage.getItem(buildOfflineStorageKey(alice))).toBeNull();

    store.unlockPersistenceScope(alice);
    expect(store.isPersistenceScopeLocked(alice)).toBe(true);
  });
});

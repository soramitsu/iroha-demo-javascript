import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useSessionStore, SESSION_STORAGE_KEY } from "@/stores/session";
import {
  DEFAULT_CHAIN_PRESET,
  MINAMOTO_CHAIN_PRESET,
  TAIRA_CHAIN_PRESET,
} from "@/constants/chains";

const snapshot = () =>
  JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) ?? "{}");

describe("session store", () => {
  beforeEach(() => {
    localStorage.clear();
    delete (window as any).iroha;
    setActivePinia(createPinia());
  });

  it("initialises with defaults", () => {
    const store = useSessionStore();
    expect(store.connection.networkPrefix).toBe(
      DEFAULT_CHAIN_PRESET.connection.networkPrefix,
    );
    expect(store.connection.toriiUrl).toBe(
      DEFAULT_CHAIN_PRESET.connection.toriiUrl,
    );
    expect(store.connection.chainId).toBe(
      DEFAULT_CHAIN_PRESET.connection.chainId,
    );
    expect(store.accounts.length).toBe(0);
    expect(store.activeAccount).toBeNull();
    expect(store.hasAccount).toBe(false);
    expect(store.customChains.length).toBe(0);
  });

  it("adds accounts, switches active account, and persists", () => {
    const store = useSessionStore();
    store.updateConnection({ toriiUrl: "http://torii", chainId: "dev" });
    store.addAccount({
      displayName: "Alice",
      domain: "wonderland",
      accountId: "ed0120@wonderland",
      publicKeyHex: "pub",
      privateKeyHex: "aa",
      hasStoredSecret: true,
      localOnly: false,
    });
    store.addAccount({
      displayName: "Bob",
      domain: "wonderland",
      accountId: "ed0999@wonderland",
      publicKeyHex: "pub2",
      privateKeyHex: "bb",
      hasStoredSecret: true,
      localOnly: false,
    });
    store.setActiveAccount("ed0999@wonderland");
    store.updateAuthority({ accountId: "authority@wonderland" });
    store.persistState();

    const persisted = snapshot();
    expect(persisted.connection.toriiUrl).toBe("http://torii");
    expect(persisted.connection.chainId).toBe("dev");
    expect(persisted.accounts[0].accountId).toBe("ed0120@wonderland");
    expect(persisted.activeAccountId).toBe("ed0999@wonderland");
    expect(store.hasAccount).toBe(true);
    expect(store.activeAccount?.accountId).toBe("ed0999@wonderland");
  });

  it("hydrates from saved snapshot", () => {
    const payload = {
      connection: {
        toriiUrl: "https://torii",
        chainId: "chain",
        assetDefinitionId: "norito:abcdef0123456789",
        networkPrefix: 10,
      },
      accounts: [
        {
          displayName: "Alice",
          domain: "wonderland",
          accountId: "abc@wonderland",
          publicKeyHex: "abc",
          privateKeyHex: "def",
          hasStoredSecret: true,
          ih58: "IH58",
          compressed: "snx1x",
          compressedWarning: "",
        },
      ],
      activeAccountId: "abc@wonderland",
      authority: {
        accountId: "authority@wonderland",
        privateKeyHex: "deadbeef",
      },
      customChains: [
        {
          id: "nexus",
          label: "Nexus",
          toriiUrl: "https://nexus",
          chainId: "nexus",
          assetDefinitionId: "asset#nexus",
          networkPrefix: 24,
        },
      ],
    };
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(payload));

    const store = useSessionStore();
    store.hydrate();

    expect(store.connection.toriiUrl).toBe("https://torii");
    expect(store.connection.chainId).toBe("chain");
    expect(store.connection.networkPrefix).toBe(10);
    expect(store.connection.assetDefinitionId).toBe("norito:abcdef0123456789");
    expect(store.activeAccount?.displayName).toBe("Alice");
    expect(store.hasAccount).toBe(true);
    expect(store.customChains).toHaveLength(0);
  });

  it("migrates saved Minamoto sessions onto the deployed chain id", () => {
    localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({
        connection: {
          ...MINAMOTO_CHAIN_PRESET.connection,
          chainId: "sora nexus main net",
        },
      }),
    );

    const store = useSessionStore();
    store.hydrate();

    expect(store.connection.toriiUrl).toBe(
      MINAMOTO_CHAIN_PRESET.connection.toriiUrl,
    );
    expect(store.connection.chainId).toBe(
      MINAMOTO_CHAIN_PRESET.connection.chainId,
    );
    expect(store.connection.networkPrefix).toBe(
      MINAMOTO_CHAIN_PRESET.connection.networkPrefix,
    );
  });

  it("migrates legacy single-user snapshots", () => {
    const legacy = {
      connection: {
        toriiUrl: "https://legacy-torii",
        chainId: "legacy",
      },
      user: {
        displayName: "Legacy",
        domain: "wonderland",
        accountId: "legacy@wonderland",
        publicKeyHex: "pub",
        privateKeyHex: "priv",
        hasStoredSecret: true,
        ih58: "ih58",
        compressed: "cmp",
        compressedWarning: "",
      },
      authority: {
        accountId: "auth@wonderland",
        privateKeyHex: "beef",
      },
    };
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(legacy));

    const store = useSessionStore();
    store.hydrate();

    expect(store.activeAccount?.accountId).toBe("legacy@wonderland");
    expect(store.accounts).toHaveLength(1);
    expect(store.connection.chainId).toBe("legacy");
    expect(store.connection.toriiUrl).toBe("https://legacy-torii");
  });

  it("upgrades legacy account ids from stored canonical literals", () => {
    const canonical = "testu1234567890abcdef1234567890";
    const migratedCanonical = "sorau1234567890abcdef1234567890";
    const payload = {
      connection: {
        toriiUrl: "https://legacy-torii",
        chainId: "legacy",
      },
      accounts: [
        {
          displayName: "Alice",
          domain: "wonderland",
          accountId: "alice@wonderland",
          publicKeyHex: "pub",
          privateKeyHex: "priv",
          hasStoredSecret: true,
          ih58: canonical,
          compressed: "",
          compressedWarning: "",
        },
      ],
      activeAccountId: "alice@wonderland",
      authority: {
        accountId: "alice@wonderland",
        privateKeyHex: "beef",
      },
    };
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(payload));

    const store = useSessionStore();
    store.hydrate();

    expect(store.accounts).toHaveLength(1);
    expect(store.accounts[0]?.accountId).toBe(migratedCanonical);
    expect(store.activeAccountId).toBe(migratedCanonical);
    expect(store.authority.accountId).toBe(migratedCanonical);
  });

  it("derives canonical account ids from stored key material when bridge is available", () => {
    const canonical = "testuDerivedFromPublicKey1234567890";
    (window as any).iroha = {
      deriveAccountAddress: () => ({
        accountId: canonical,
        i105AccountId: "testuDerivedVisible1234567890",
        i105DefaultAccountId: "sorauDerivedDefault1234567890",
        publicKeyHex: "ab".repeat(32),
        accountIdWarning: "",
      }),
    };

    const payload = {
      connection: {
        toriiUrl: "https://legacy-torii",
        chainId: "legacy",
        networkPrefix: 369,
      },
      accounts: [
        {
          displayName: "Legacy",
          domain: "wonderland",
          accountId: "legacy@wonderland",
          publicKeyHex: "ab".repeat(32),
          privateKeyHex: "priv",
          hasStoredSecret: true,
          ih58: "",
          compressed: "",
          compressedWarning: "",
        },
      ],
      activeAccountId: "legacy@wonderland",
    };
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(payload));

    const store = useSessionStore();
    store.hydrate();

    expect(store.accounts[0]?.accountId).toBe(canonical);
    expect(store.accounts[0]?.i105AccountId).toBe(
      "testuDerivedVisible1234567890",
    );
    expect(store.activeAccountId).toBe(canonical);
  });

  it("rewrites stored native i105 ids back to the compatibility accountId field", () => {
    (window as any).iroha = {
      deriveAccountAddress: () => ({
        accountId: "URpZvCompatAccountId1234567890",
        i105AccountId: "testuVisibleNativeAccountId1234567890",
        i105DefaultAccountId: "sorauDefaultNativeAccountId1234567890",
        publicKeyHex: "ab".repeat(32),
        accountIdWarning: "",
      }),
    };

    const payload = {
      connection: {
        toriiUrl: "https://legacy-torii",
        chainId: "legacy",
        networkPrefix: 369,
      },
      accounts: [
        {
          displayName: "Native",
          domain: "default",
          accountId: "testuVisibleNativeAccountId1234567890",
          publicKeyHex: "ab".repeat(32),
          privateKeyHex: "priv",
          hasStoredSecret: true,
        },
      ],
      activeAccountId: "testuVisibleNativeAccountId1234567890",
    };
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(payload));

    const store = useSessionStore();
    store.hydrate();

    expect(store.accounts[0]?.accountId).toBe("URpZvCompatAccountId1234567890");
    expect(store.accounts[0]?.i105AccountId).toBe(
      "testuVisibleNativeAccountId1234567890",
    );
    expect(store.activeAccountId).toBe("URpZvCompatAccountId1234567890");
  });

  it("adopts a chain-reported network prefix and re-derives stored account literals", () => {
    (window as any).iroha = {
      deriveAccountAddress: ({ networkPrefix }: { networkPrefix: number }) => ({
        accountId:
          networkPrefix === 369
            ? "testuAliceCompat1234567890"
            : "n42uAliceCompat1234567890",
        i105AccountId:
          networkPrefix === 369
            ? "testuAliceCompat1234567890"
            : "n42uAliceCompat1234567890",
        i105DefaultAccountId: "sorauAliceDefault1234567890",
        publicKeyHex: "ab".repeat(32),
        accountIdWarning: "",
      }),
    };

    const store = useSessionStore();
    store.$patch({
      connection: {
        ...store.connection,
        networkPrefix: 42,
      },
      accounts: [
        {
          displayName: "Alice",
          domain: "default",
          accountId: "n42uAliceCompat1234567890",
          publicKeyHex: "ab".repeat(32),
          privateKeyHex: "cd".repeat(32),
          hasStoredSecret: true,
          localOnly: false,
        },
      ],
      activeAccountId: "n42uAliceCompat1234567890",
      authority: {
        accountId: "n42uAliceCompat1234567890",
        privateKeyHex: "deadbeef",
      },
    });

    expect(store.syncChainNetworkPrefix(369)).toBe(true);

    expect(store.connection.networkPrefix).toBe(369);
    expect(store.accounts[0]?.accountId).toBe("testuAliceCompat1234567890");
    expect(store.accounts[0]?.i105AccountId).toBe("testuAliceCompat1234567890");
    expect(store.activeAccountId).toBe("testuAliceCompat1234567890");
    expect(store.authority.accountId).toBe("testuAliceCompat1234567890");
  });

  it("re-derives stored account literals when connection metadata changes", () => {
    (window as any).iroha = {
      deriveAccountAddress: ({ networkPrefix }: { networkPrefix: number }) => ({
        accountId:
          networkPrefix === 42
            ? "n42uAliceCompat1234567890"
            : "testuAliceCompat1234567890",
        i105AccountId:
          networkPrefix === 42
            ? "n42uAliceCompat1234567890"
            : "testuAliceCompat1234567890",
        i105DefaultAccountId: "sorauAliceDefault1234567890",
        publicKeyHex: "ab".repeat(32),
        accountIdWarning: "",
      }),
    };

    const store = useSessionStore();
    store.$patch({
      accounts: [
        {
          displayName: "Alice",
          domain: "default",
          accountId: "testuAliceCompat1234567890",
          publicKeyHex: "ab".repeat(32),
          privateKeyHex: "cd".repeat(32),
          hasStoredSecret: true,
          localOnly: false,
        },
      ],
      activeAccountId: "testuAliceCompat1234567890",
      authority: {
        accountId: "testuAliceCompat1234567890",
        privateKeyHex: "deadbeef",
      },
    });

    store.updateConnection({
      toriiUrl: "http://localhost:8080",
      chainId: "local-chain",
      networkPrefix: 42,
    });

    expect(store.connection.chainId).toBe("local-chain");
    expect(store.connection.networkPrefix).toBe(42);
    expect(store.accounts[0]?.accountId).toBe("n42uAliceCompat1234567890");
    expect(store.activeAccountId).toBe("n42uAliceCompat1234567890");
    expect(store.authority.accountId).toBe("n42uAliceCompat1234567890");
  });

  it("ignores invalid chain-reported network prefixes", () => {
    const store = useSessionStore();
    const before = store.connection.networkPrefix;

    expect(store.syncChainNetworkPrefix(16384)).toBe(false);
    expect(store.connection.networkPrefix).toBe(before);
  });

  it("updates the active account in place", () => {
    const store = useSessionStore();
    store.addAccount({
      displayName: "First",
      domain: "wonderland",
      accountId: "first@wonderland",
      publicKeyHex: "pub",
      privateKeyHex: "priv",
      hasStoredSecret: true,
      localOnly: false,
    });

    store.updateActiveAccount({ displayName: "Renamed" });

    expect(store.activeAccount?.displayName).toBe("Renamed");
    expect(store.activeAccount?.accountId).toBe("first@wonderland");
  });

  it("normalizes the legacy wonderland example domain to default for canonical accounts", () => {
    const store = useSessionStore();
    store.addAccount({
      displayName: "Alice",
      domain: "wonderland",
      accountId: "6cmzPVPX8AmHxBYtL9tbVfEPntBHMDWKCn8NRwxRXGDMjz5QWhdyboK",
      publicKeyHex: "pub",
      privateKeyHex: "priv",
      localOnly: true,
    });

    expect(store.activeAccount?.domain).toBe("default");
  });

  it("rewrites stored SORA-native account literals onto the TAIRA prefix", () => {
    const store = useSessionStore();
    store.updateConnection(TAIRA_CHAIN_PRESET.connection);
    store.addAccount({
      displayName: "Alice",
      domain: "default",
      accountId: "sorauLegacyVisibleAccount1234567890",
      i105AccountId: "",
      i105DefaultAccountId: "sorauLegacyVisibleAccount1234567890",
      publicKeyHex: "",
      privateKeyHex: "priv",
      localOnly: true,
    });

    expect(store.activeAccount?.accountId).toBe(
      "testuLegacyVisibleAccount1234567890",
    );
    expect(store.activeAccount?.i105AccountId).toBe(
      "testuLegacyVisibleAccount1234567890",
    );
    expect(store.activeAccount?.i105DefaultAccountId).toBe(
      "sorauLegacyVisibleAccount1234567890",
    );
  });

  it("rewrites stored TAIRA-native account literals onto the mainnet prefix", () => {
    const store = useSessionStore();
    store.$patch({
      connection: {
        ...TAIRA_CHAIN_PRESET.connection,
      },
      accounts: [
        {
          displayName: "Alice",
          domain: "default",
          accountId: "testuLegacyVisibleAccount1234567890",
          i105AccountId: "testuLegacyVisibleAccount1234567890",
          i105DefaultAccountId: "",
          publicKeyHex: "",
          privateKeyHex: "priv",
          localOnly: true,
        },
      ],
      activeAccountId: "testuLegacyVisibleAccount1234567890",
      authority: {
        accountId: "testuLegacyVisibleAccount1234567890",
        privateKeyHex: "beef",
      },
    });

    store.updateConnection(MINAMOTO_CHAIN_PRESET.connection);

    expect(store.connection.networkPrefix).toBe(753);
    expect(store.activeAccount?.accountId).toBe(
      "sorauLegacyVisibleAccount1234567890",
    );
    expect(store.activeAccount?.i105AccountId).toBe(
      "sorauLegacyVisibleAccount1234567890",
    );
    expect(store.activeAccountId).toBe("sorauLegacyVisibleAccount1234567890");
    expect(store.authority.accountId).toBe(
      "sorauLegacyVisibleAccount1234567890",
    );
  });

  it("keeps custom chain profiles disabled while preserving the active connection", () => {
    const store = useSessionStore();
    store.updateConnection({
      toriiUrl: "http://127.0.0.1:8080",
      chainId: "testus",
      networkPrefix: 99,
    });
    store.addCustomChain({
      label: "Local devnet",
      chainId: "ignored-chain",
      toriiUrl: "http://127.0.0.1:9090",
      assetDefinitionId: "asset#local",
      networkPrefix: 123,
    });
    expect(store.customChains).toHaveLength(0);
    expect(store.connection.chainId).toBe("testus");
    expect(store.connection.toriiUrl).toBe("http://127.0.0.1:8080");
    expect(store.connection.networkPrefix).toBe(99);
    expect(store.connection.assetDefinitionId).toBe("asset#local");

    store.persistState();
    const persisted = snapshot();
    expect(persisted.customChains).toHaveLength(0);

    store.removeCustomChain("local-devnet");
    expect(store.customChains).toHaveLength(0);
  });

  it("normalizes custom Torii endpoints and accepts loaded chain metadata", () => {
    const store = useSessionStore();

    store.updateConnection({
      toriiUrl: " http://127.0.0.1:8080/ ",
      chainId: "custom-chain",
      networkPrefix: 99,
    });

    expect(store.connection.toriiUrl).toBe("http://127.0.0.1:8080");
    expect(store.connection.chainId).toBe("custom-chain");
    expect(store.connection.networkPrefix).toBe(99);
  });

  it("applies known preset metadata when only the endpoint changes", () => {
    const store = useSessionStore();
    store.updateConnection({
      toriiUrl: "http://127.0.0.1:8080",
      chainId: "00000000-0000-0000-0000-000000000000",
      networkPrefix: 1,
    });

    store.updateConnection({
      toriiUrl: TAIRA_CHAIN_PRESET.connection.toriiUrl,
    });

    expect(store.connection.toriiUrl).toBe(
      TAIRA_CHAIN_PRESET.connection.toriiUrl,
    );
    expect(store.connection.chainId).toBe(
      TAIRA_CHAIN_PRESET.connection.chainId,
    );
    expect(store.connection.networkPrefix).toBe(
      TAIRA_CHAIN_PRESET.connection.networkPrefix,
    );
  });

  it("keeps checked metadata when a preset endpoint reports different values", () => {
    const store = useSessionStore();

    store.updateConnection({
      toriiUrl: TAIRA_CHAIN_PRESET.connection.toriiUrl,
      chainId: "checked-live-chain",
      networkPrefix: 42,
    });

    expect(store.connection.toriiUrl).toBe(
      TAIRA_CHAIN_PRESET.connection.toriiUrl,
    );
    expect(store.connection.chainId).toBe("checked-live-chain");
    expect(store.connection.networkPrefix).toBe(42);
  });

  it("falls back to the default endpoint when a saved endpoint is invalid", () => {
    localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({
        connection: {
          toriiUrl: "ftp://not-supported",
          chainId: "custom-chain",
          networkPrefix: 99,
        },
      }),
    );

    const store = useSessionStore();
    store.hydrate();

    expect(store.connection.toriiUrl).toBe(
      DEFAULT_CHAIN_PRESET.connection.toriiUrl,
    );
    expect(store.connection.chainId).toBe(
      DEFAULT_CHAIN_PRESET.connection.chainId,
    );
    expect(store.connection.networkPrefix).toBe(
      DEFAULT_CHAIN_PRESET.connection.networkPrefix,
    );
  });
});

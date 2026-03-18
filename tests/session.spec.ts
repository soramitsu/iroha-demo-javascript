import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useSessionStore, SESSION_STORAGE_KEY } from "@/stores/session";
import { TAIRA_CHAIN_PRESET } from "@/constants/chains";

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
    expect(store.connection.networkPrefix).toBe(42);
    expect(store.connection.toriiUrl).toBe(
      TAIRA_CHAIN_PRESET.connection.toriiUrl,
    );
    expect(store.connection.chainId).toBe(
      TAIRA_CHAIN_PRESET.connection.chainId,
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
    });
    store.addAccount({
      displayName: "Bob",
      domain: "wonderland",
      accountId: "ed0999@wonderland",
      publicKeyHex: "pub2",
      privateKeyHex: "bb",
    });
    store.setActiveAccount("ed0999@wonderland");
    store.updateAuthority({ accountId: "authority@wonderland" });
    store.persistState();

    const persisted = snapshot();
    expect(persisted.connection.toriiUrl).toBe(
      TAIRA_CHAIN_PRESET.connection.toriiUrl,
    );
    expect(persisted.connection.chainId).toBe(
      TAIRA_CHAIN_PRESET.connection.chainId,
    );
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

    expect(store.connection.toriiUrl).toBe(
      TAIRA_CHAIN_PRESET.connection.toriiUrl,
    );
    expect(store.connection.chainId).toBe(
      TAIRA_CHAIN_PRESET.connection.chainId,
    );
    expect(store.connection.networkPrefix).toBe(
      TAIRA_CHAIN_PRESET.connection.networkPrefix,
    );
    expect(store.connection.assetDefinitionId).toBe("norito:abcdef0123456789");
    expect(store.activeAccount?.displayName).toBe("Alice");
    expect(store.hasAccount).toBe(true);
    expect(store.customChains).toHaveLength(0);
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
    expect(store.connection.chainId).toBe(
      TAIRA_CHAIN_PRESET.connection.chainId,
    );
    expect(store.connection.toriiUrl).toBe(
      TAIRA_CHAIN_PRESET.connection.toriiUrl,
    );
  });

  it("upgrades legacy account ids from stored canonical literals", () => {
    const canonical = "n42u1234567890abcdef1234567890";
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
    expect(store.accounts[0]?.accountId).toBe(canonical);
    expect(store.activeAccountId).toBe(canonical);
    expect(store.authority.accountId).toBe(canonical);
  });

  it("derives canonical account ids from stored key material when bridge is available", () => {
    const canonical = "n42uDerivedFromPublicKey1234567890";
    (window as any).iroha = {
      deriveAccountAddress: () => ({
        accountId: canonical,
        publicKeyHex: "ab".repeat(32),
        accountIdWarning: "",
      }),
    };

    const payload = {
      connection: {
        toriiUrl: "https://legacy-torii",
        chainId: "legacy",
        networkPrefix: 42,
      },
      accounts: [
        {
          displayName: "Legacy",
          domain: "wonderland",
          accountId: "legacy@wonderland",
          publicKeyHex: "ab".repeat(32),
          privateKeyHex: "priv",
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
    expect(store.activeAccountId).toBe(canonical);
  });

  it("updates the active account in place", () => {
    const store = useSessionStore();
    store.addAccount({
      displayName: "First",
      domain: "wonderland",
      accountId: "first@wonderland",
      publicKeyHex: "pub",
      privateKeyHex: "priv",
    });

    store.updateActiveAccount({ displayName: "Renamed" });

    expect(store.activeAccount?.displayName).toBe("Renamed");
    expect(store.activeAccount?.accountId).toBe("first@wonderland");
  });

  it("ignores custom chain network overrides in TAIRA-only mode", () => {
    const store = useSessionStore();
    store.addCustomChain({
      label: "Local devnet",
      chainId: "testus",
      toriiUrl: "http://127.0.0.1:8080",
      assetDefinitionId: "asset#local",
      networkPrefix: 99,
    });
    expect(store.customChains).toHaveLength(0);
    expect(store.connection.chainId).toBe(
      TAIRA_CHAIN_PRESET.connection.chainId,
    );
    expect(store.connection.toriiUrl).toBe(
      TAIRA_CHAIN_PRESET.connection.toriiUrl,
    );
    expect(store.connection.networkPrefix).toBe(
      TAIRA_CHAIN_PRESET.connection.networkPrefix,
    );
    expect(store.connection.assetDefinitionId).toBe("asset#local");

    store.persistState();
    const persisted = snapshot();
    expect(persisted.customChains).toHaveLength(0);

    store.removeCustomChain("local-devnet");
    expect(store.customChains).toHaveLength(0);
  });
});

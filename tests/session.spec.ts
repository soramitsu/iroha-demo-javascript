import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useSessionStore, SESSION_STORAGE_KEY } from "@/stores/session";

const snapshot = () =>
  JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) ?? "{}");

describe("session store", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it("initialises with defaults", () => {
    const store = useSessionStore();
    expect(store.connection.networkPrefix).toBe(42);
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
      ih58: "IH58",
      compressed: "cmp",
      compressedWarning: "",
    });
    store.addAccount({
      displayName: "Bob",
      domain: "wonderland",
      accountId: "ed0999@wonderland",
      publicKeyHex: "pub2",
      privateKeyHex: "bb",
      ih58: "IH58-2",
      compressed: "cmp2",
      compressedWarning: "",
    });
    store.setActiveAccount("ed0999@wonderland");
    store.updateAuthority({ accountId: "authority@wonderland" });
    store.persistState();

    const persisted = snapshot();
    expect(persisted.connection.toriiUrl).toBe("http://torii");
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
        assetDefinitionId: "rose#wonderland",
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

    expect(store.connection.toriiUrl).toBe("https://torii");
    expect(store.activeAccount?.displayName).toBe("Alice");
    expect(store.hasAccount).toBe(true);
    expect(store.customChains).toHaveLength(1);
    expect(store.customChains[0].id).toBe("nexus");
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
    expect(store.connection.chainId).toBe("legacy");
  });

  it("updates the active account in place", () => {
    const store = useSessionStore();
    store.addAccount({
      displayName: "First",
      domain: "wonderland",
      accountId: "first@wonderland",
      publicKeyHex: "pub",
      privateKeyHex: "priv",
      ih58: "",
      compressed: "",
      compressedWarning: "",
    });

    store.updateActiveAccount({ displayName: "Renamed", ih58: "IH58-updated" });

    expect(store.activeAccount?.displayName).toBe("Renamed");
    expect(store.activeAccount?.ih58).toBe("IH58-updated");
  });

  it("adds, uses, and removes custom chains", () => {
    const store = useSessionStore();
    store.addCustomChain({
      label: "Local devnet",
      chainId: "testus",
      toriiUrl: "http://127.0.0.1:8080",
      assetDefinitionId: "asset#local",
      networkPrefix: 99,
    });
    expect(store.customChains).toHaveLength(1);
    expect(store.connection.chainId).toBe("testus");
    expect(store.customChains[0].id).toBe("local-devnet");

    store.persistState();
    const persisted = snapshot();
    expect(persisted.customChains[0].chainId).toBe("testus");

    store.removeCustomChain("local-devnet");
    expect(store.customChains).toHaveLength(0);
  });
});

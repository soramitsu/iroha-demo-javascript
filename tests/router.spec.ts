import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import router from "@/router";
import { SESSION_STORAGE_KEY } from "@/stores/session";
import { TAIRA_CHAIN_PRESET } from "@/constants/chains";
import { useSessionStore } from "@/stores/session";

const savedSession = {
  hydrated: true,
  connection: { ...TAIRA_CHAIN_PRESET.connection },
  authority: {
    accountId: "",
    privateKeyHex: "",
    hasStoredSecret: false,
  },
  accounts: [
    {
      displayName: "Alice",
      domain: "wonderland",
      accountId: "alice@wonderland",
      publicKeyHex: "ab".repeat(32),
      privateKeyHex: "cd".repeat(32),
      hasStoredSecret: true,
    },
  ],
  activeAccountId: "alice@wonderland",
  customChains: [],
};

describe("router guard", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it("allows protected routes when a saved account is present", async () => {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(savedSession));

    await router.push("/vpn");

    expect(router.currentRoute.value.path).toBe("/vpn");
    expect(useSessionStore().hasAccount).toBe(true);
  });

  it("allows the SoraCloud route when a saved account is present", async () => {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(savedSession));

    await router.push("/soracloud");

    expect(router.currentRoute.value.path).toBe("/soracloud");
    expect(useSessionStore().hasAccount).toBe(true);
  });

  it("redirects protected routes to account when no saved account exists", async () => {
    await router.push("/wallet");

    expect(router.currentRoute.value.path).toBe("/account");
    expect(useSessionStore().hasAccount).toBe(false);
  });

  it("allows settings before a saved account exists", async () => {
    await router.push("/settings");

    expect(router.currentRoute.value.path).toBe("/settings");
    expect(useSessionStore().hasAccount).toBe(false);
  });
});

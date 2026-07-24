import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import router, { APP_NAV_ITEMS } from "@/router";
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

  it("opens the wallet from the root route when a saved account is present", async () => {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(savedSession));

    await router.push("/");

    expect(router.currentRoute.value.path).toBe("/wallet");
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

  it("derives protected-route behavior from route metadata", async () => {
    await router.push("/setup");

    expect(router.currentRoute.value.path).toBe("/account");
    expect(
      router.getRoutes().find((route) => route.path === "/setup")?.meta
        .requiresAccount,
    ).toBe(true);
    expect(
      router.getRoutes().find((route) => route.path === "/settings")?.meta
        .requiresAccount,
    ).toBe(false);
  });

  it("exposes one metadata-backed source for grouped navigation", () => {
    const labelsFor = (group: "daily" | "grow" | "services") =>
      APP_NAV_ITEMS.filter(
        (item) => item.navPlacement === "primary" && item.navGroup === group,
      )
        .sort((left, right) => left.navOrder - right.navOrder)
        .map((item) => item.navLabelKey);

    expect(labelsFor("daily")).toEqual(["Wallet", "Send", "Receive"]);
    expect(labelsFor("grow")).toEqual([
      "Staking",
      "Governance",
      "Subscriptions",
    ]);
    expect(labelsFor("services")).toEqual([
      "Stats",
      "Explore",
      "SoraCloud",
      "VPN",
      "Kaigi",
      "Offline",
    ]);
    expect(
      APP_NAV_ITEMS.filter((item) => item.navPlacement === "footer")
        .sort((left, right) => left.navOrder - right.navOrder)
        .map((item) => item.navLabelKey),
    ).toEqual(["Settings", "Advanced", "Saved Wallets"]);
    expect(
      APP_NAV_ITEMS.every(
        (item) =>
          item.titleKey &&
          item.subtitleKey &&
          item.icon &&
          typeof item.requiresAccount === "boolean",
      ),
    ).toBe(true);
  });

  it("keeps every navigable component route in metadata exactly once", () => {
    const navigableRoutes = router
      .getRoutes()
      .filter(
        (route) =>
          route.path !== "/" &&
          route.path !== "/parliament" &&
          Boolean(route.components?.default),
      )
      .map((route) => route.path)
      .sort();
    const metadataRoutes = APP_NAV_ITEMS.map((item) => item.to).sort();

    expect(new Set(metadataRoutes).size).toBe(metadataRoutes.length);
    expect(metadataRoutes).toEqual(navigableRoutes);
  });

  it("uses unique, finite ordering coordinates within every nav group", () => {
    const coordinates = APP_NAV_ITEMS.map(
      (item) => `${item.navPlacement}:${item.navGroup}:${item.navOrder}`,
    );

    expect(new Set(coordinates).size).toBe(coordinates.length);
    for (const item of APP_NAV_ITEMS) {
      expect(Number.isSafeInteger(item.navOrder)).toBe(true);
      expect(item.navOrder).toBeGreaterThan(0);
      if (item.navPlacement === "primary") {
        expect(["daily", "grow", "services"]).toContain(item.navGroup);
        expect(item.requiresAccount).toBe(true);
      } else {
        expect(item.navGroup).toBe("system");
      }
    }
  });

  it("keeps metadata and normalized router records in lockstep", () => {
    for (const item of APP_NAV_ITEMS) {
      const record = router.getRoutes().find((route) => route.path === item.to);
      expect(record, `missing route record for ${item.to}`).toBeTruthy();
      expect(record?.meta).toMatchObject({
        titleKey: item.titleKey,
        subtitleKey: item.subtitleKey,
        navLabelKey: item.navLabelKey,
        navGroup: item.navGroup,
        navOrder: item.navOrder,
        icon: item.icon,
        requiresAccount: item.requiresAccount,
        navPlacement: item.navPlacement,
      });
    }
  });

  it("redirects the legacy parliament URL to canonical governance", async () => {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(savedSession));

    await router.push("/parliament");

    expect(router.currentRoute.value.path).toBe("/governance");
  });

  it("does not pass through the root redirect when no saved wallet exists", async () => {
    await router.push("/");

    expect(router.currentRoute.value.path).toBe("/account");
    expect(useSessionStore().hasAccount).toBe(false);
  });
});

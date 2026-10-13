import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { AccountAddress } from "@iroha/iroha-js/address";
import router, { APP_NAV_ITEMS } from "@/router";
import {
  SESSION_SCHEMA,
  SESSION_STORAGE_KEY,
  SESSION_VERSION,
} from "@/stores/session";
import { TAIRA_CHAIN_PRESET } from "@/constants/chains";
import { useSessionStore } from "@/stores/session";
import {
  deriveAccountAddressView,
  normalizeCanonicalAccountIdLiteral,
} from "../electron/accountAddress";

const ALICE_PUBLIC_KEY_HEX =
  "d04ab232742bb4ab3a1368bd4615e4e6d0224ab71a016baf8520a332c9778737";
const ALICE_ACCOUNT_ID = AccountAddress.fromAccount({
  publicKey: Uint8Array.from(
    ALICE_PUBLIC_KEY_HEX.match(/.{2}/gu)!.map((byte) =>
      Number.parseInt(byte, 16),
    ),
  ),
}).toI105(TAIRA_CHAIN_PRESET.connection.networkPrefix);

const savedSession = {
  schema: SESSION_SCHEMA,
  version: SESSION_VERSION,
  connection: { ...TAIRA_CHAIN_PRESET.connection },
  authority: {
    accountId: "",
    signingAlgorithm: "ed25519",
    hasStoredSecret: false,
  },
  accounts: [
    {
      displayName: "Alice",
      domain: "default",
      accountId: ALICE_ACCOUNT_ID,
      publicKeyHex: ALICE_PUBLIC_KEY_HEX,
      signingAlgorithm: "ed25519",
      hasStoredSecret: true,
      localOnly: false,
    },
  ],
  activeAccountId: ALICE_ACCOUNT_ID,
};

describe("router guard", () => {
  beforeEach(() => {
    (window as unknown as { iroha: unknown }).iroha = {
      deriveAccountAddress: deriveAccountAddressView,
      validateCanonicalAccountId: ({
        accountId,
        networkPrefix,
      }: {
        accountId: string;
        networkPrefix: number;
      }) =>
        normalizeCanonicalAccountIdLiteral(
          accountId,
          "accountId",
          networkPrefix,
        ),
      isSecureVaultAvailable: async () => true,
      listAccountSecretFlags: async ({
        accountIds,
      }: {
        accountIds: string[];
      }) =>
        Object.fromEntries(accountIds.map((accountId) => [accountId, true])),
    };
    localStorage.clear();
    setActivePinia(createPinia());
  });

  afterEach(() => {
    delete (window as { iroha?: unknown }).iroha;
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
    ]);
    expect(APP_NAV_ITEMS.some((item) => item.to === "/offline")).toBe(false);
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
        (route) => route.path !== "/" && Boolean(route.components?.default),
      )
      .map((route) => route.path)
      .sort();
    const metadataRoutes = APP_NAV_ITEMS.map((item) => item.to).sort();

    expect(new Set(metadataRoutes).size).toBe(metadataRoutes.length);
    expect(metadataRoutes).toEqual(navigableRoutes);
    expect(router.getRoutes().some((route) => route.path === "/sccp")).toBe(
      false,
    );
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

  it("does not pass through the root redirect when no saved wallet exists", async () => {
    await router.push("/");

    expect(router.currentRoute.value.path).toBe("/account");
    expect(useSessionStore().hasAccount).toBe(false);
  });
});

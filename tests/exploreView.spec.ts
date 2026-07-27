import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import ExploreView from "@/views/ExploreView.vue";
import {
  MINAMOTO_CHAIN_PRESET,
  MINAMOTO_EXPLORER_URL,
  TAIRA_CHAIN_PRESET,
  TAIRA_EXPLORER_URL,
} from "@/constants/chains";
import { SESSION_STORAGE_KEY, useSessionStore } from "@/stores/session";

const getExplorerMetricsMock = vi.fn();
const getExplorerAccountQrMock = vi.fn();
const sessionSnapshot = () =>
  JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) ?? "{}");

vi.mock("@/services/iroha", () => ({
  getExplorerMetrics: (toriiUrl: string) => getExplorerMetricsMock(toriiUrl),
  getExplorerAccountQr: (input: unknown) => getExplorerAccountQrMock(input),
}));

describe("ExploreView", () => {
  it("keeps the named Taira smoke check on the Taira explorer by default", () => {
    const smoke = readFileSync(
      resolve(process.cwd(), "scripts/e2e/taira-explorer-smoke.mjs"),
      "utf8",
    );
    expect(smoke).toContain(
      'const DEFAULT_EXPLORER_ROOT = "https://taira-explorer.sora.org"',
    );
    expect(smoke).toContain(
      "process.env.TAIRA_EXPLORER_URL ?? DEFAULT_EXPLORER_ROOT",
    );
    expect(smoke).not.toContain("MINAMOTO_EXPLORER_URL");
  });

  beforeEach(() => {
    getExplorerMetricsMock.mockReset();
    getExplorerAccountQrMock.mockReset();
    getExplorerMetricsMock.mockResolvedValue({
      blockHeight: 1,
      finalizedBlockHeight: 1,
      transactionsAccepted: 1,
      transactionsRejected: 0,
      peers: 1,
      assets: 1,
      averageCommitTimeMs: 500,
      averageBlockTimeMs: 1000,
      blockCreatedAt: "2026-03-20T00:00:00.000Z",
    });
    setActivePinia(createPinia());
  });

  const mountView = (options?: {
    account?: Partial<{
      displayName: string;
      domain: string;
      accountId: string;
      i105AccountId: string;
      i105DefaultAccountId: string;
      publicKeyHex: string;
      privateKeyHex: string;
    }>;
    connection?: Partial<{
      toriiUrl: string;
      chainId: string;
      assetDefinitionId: string;
      networkPrefix: number;
    }>;
  }) => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const session = useSessionStore();
    const account = {
      displayName: "Alice",
      domain: "wonderland",
      accountId: "alice@wonderland",
      publicKeyHex: "ab".repeat(32),
      privateKeyHex: "cd".repeat(32),
      ...options?.account,
    };
    session.$patch({
      connection: {
        toriiUrl: "http://localhost:8080",
        chainId: "chain",
        assetDefinitionId: "xor#wonderland",
        networkPrefix: 369,
        ...options?.connection,
      },
      accounts: [account],
      activeAccountId: account.accountId,
    });
    return mount(ExploreView, {
      global: {
        plugins: [pinia],
      },
    });
  };

  it("opens only the explorer belonging to the exact active preset", async () => {
    getExplorerAccountQrMock.mockResolvedValue(null);
    const taira = mountView({
      connection: { ...TAIRA_CHAIN_PRESET.connection },
    });
    await flushPromises();
    expect(taira.get("a.explorer-link").attributes("href")).toBe(
      TAIRA_EXPLORER_URL,
    );
    taira.unmount();

    const minamoto = mountView({
      connection: { ...MINAMOTO_CHAIN_PRESET.connection },
    });
    await flushPromises();
    expect(minamoto.get("a.explorer-link").attributes("href")).toBe(
      MINAMOTO_EXPLORER_URL,
    );
  });

  it("does not offer an external explorer for a custom identity", async () => {
    getExplorerAccountQrMock.mockResolvedValue(null);
    const wrapper = mountView();
    await flushPromises();
    expect(wrapper.find("a.explorer-link").exists()).toBe(false);
  });

  const switchToBob = async () => {
    const session = useSessionStore();
    session.$patch({
      accounts: [
        ...session.accounts,
        {
          displayName: "Bob",
          domain: "wonderland",
          accountId: "bob@wonderland",
          publicKeyHex: "ef".repeat(32),
          privateKeyHex: "12".repeat(32),
        },
      ],
      activeAccountId: "bob@wonderland",
    });
    await flushPromises();
  };

  it("refreshes on active account switch and ignores stale explorer qr payloads", async () => {
    let resolveAliceQr: (value: unknown) => void = () => {};
    const aliceQrDeferred = new Promise((resolve) => {
      resolveAliceQr = resolve;
    });
    getExplorerAccountQrMock.mockReturnValueOnce(aliceQrDeferred);
    getExplorerAccountQrMock.mockResolvedValueOnce({
      canonicalId: "URpZvBobCompat",
      literal: "testuBobLiteral",
      networkPrefix: 369,
      errorCorrection: "M",
      modules: 29,
      qrVersion: 1,
      svg: "<svg />",
    });

    const wrapper = mountView();
    await flushPromises();

    await switchToBob();
    await flushPromises();

    expect(wrapper.text()).toContain("testuBobLiteral");

    resolveAliceQr({
      canonicalId: "URpZvAliceCompat",
      literal: "testuAliceLiteral",
      networkPrefix: 369,
      errorCorrection: "M",
      modules: 29,
      qrVersion: 1,
      svg: "<svg />",
    });
    await flushPromises();
    await flushPromises();

    expect(wrapper.text()).toContain("testuBobLiteral");
    expect(wrapper.text()).not.toContain("testuAliceLiteral");
  });

  it("rejects a mismatched QR prefix without retargeting the wallet", async () => {
    getExplorerAccountQrMock.mockResolvedValueOnce({
      canonicalId: "URpZvAliceCompat",
      literal: "testuAliceLiteral",
      networkPrefix: 369,
      errorCorrection: "M",
      modules: 29,
      qrVersion: 1,
      svg: "<svg />",
    });

    const pinia = createPinia();
    setActivePinia(pinia);
    const session = useSessionStore();
    session.$patch({
      connection: {
        toriiUrl: "http://localhost:8080",
        chainId: "chain",
        assetDefinitionId: "xor#wonderland",
        networkPrefix: 42,
      },
      accounts: [
        {
          displayName: "Alice",
          domain: "wonderland",
          accountId: "alice@wonderland",
          publicKeyHex: "ab".repeat(32),
          privateKeyHex: "cd".repeat(32),
        },
      ],
      activeAccountId: "alice@wonderland",
    });

    mount(ExploreView, {
      global: {
        plugins: [pinia],
      },
    });
    await flushPromises();

    expect(session.connection.networkPrefix).toBe(42);
    expect(sessionSnapshot().connection?.networkPrefix).not.toBe(369);
  });

  it("keeps metrics visible when explorer qr is temporarily unavailable", async () => {
    getExplorerAccountQrMock.mockResolvedValueOnce(null);

    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.text()).toContain("Block Height");
    expect(wrapper.text()).toContain("1");
    expect(wrapper.text()).toContain(
      "No QR yet. Connect to Torii and choose a wallet.",
    );
  });

  it("keeps metrics visible when explorer qr request fails", async () => {
    getExplorerAccountQrMock.mockRejectedValueOnce(new Error("qr down"));

    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.text()).toContain("Block Height");
    expect(wrapper.text()).toContain("1");
    expect(wrapper.text()).toContain(
      "No QR yet. Connect to Torii and choose a wallet.",
    );
  });

  it("keeps the route stable when the explorer bridge throws synchronously", async () => {
    getExplorerMetricsMock.mockImplementationOnce(() => {
      throw new Error("bridge unavailable");
    });
    getExplorerAccountQrMock.mockImplementationOnce(() => {
      throw new Error("bridge unavailable");
    });

    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.text()).toContain("Metrics unavailable");
    expect(wrapper.text()).toContain(
      "No QR yet. Connect to Torii and choose a wallet.",
    );
  });

  it("uses the TAIRA i105 literal for explorer qr requests when stored ids are stale", async () => {
    getExplorerAccountQrMock.mockResolvedValueOnce({
      canonicalId: "URpZvAliceCompat",
      literal: "testuLegacyVisibleAccount1234567890",
      networkPrefix: 369,
      errorCorrection: "M",
      modules: 29,
      qrVersion: 1,
      svg: "<svg />",
    });

    const wrapper = mountView({
      account: {
        accountId: "sorauLegacyVisibleAccount1234567890",
        i105AccountId: "",
        i105DefaultAccountId: "sorauLegacyVisibleAccount1234567890",
      },
    });
    await flushPromises();

    expect(getExplorerAccountQrMock).toHaveBeenCalledWith({
      toriiUrl: "http://localhost:8080",
      accountId: "testuLegacyVisibleAccount1234567890",
    });
    expect(wrapper.text()).toContain("testuLegacyVisibleAccount1234567890");
    expect(wrapper.text()).toContain("Block Height");
  });
});

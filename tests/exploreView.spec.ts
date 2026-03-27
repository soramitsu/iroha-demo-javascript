import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import ExploreView from "@/views/ExploreView.vue";
import { useSessionStore } from "@/stores/session";

const getExplorerMetricsMock = vi.fn();
const getExplorerAccountQrMock = vi.fn();

vi.mock("@/services/iroha", () => ({
  getExplorerMetrics: (toriiUrl: string) => getExplorerMetricsMock(toriiUrl),
  getExplorerAccountQr: (input: unknown) => getExplorerAccountQrMock(input),
}));

describe("ExploreView", () => {
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

  const mountView = () => {
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
    return mount(ExploreView, {
      global: {
        plugins: [pinia],
      },
    });
  };

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
      literal: "n42uBobLiteral",
      networkPrefix: 42,
      errorCorrection: "M",
      modules: 29,
      qrVersion: 1,
      svg: "<svg />",
    });

    const wrapper = mountView();
    await flushPromises();

    await switchToBob();
    await flushPromises();

    expect(wrapper.text()).toContain("n42uBobLiteral");

    resolveAliceQr({
      canonicalId: "URpZvAliceCompat",
      literal: "n42uAliceLiteral",
      networkPrefix: 42,
      errorCorrection: "M",
      modules: 29,
      qrVersion: 1,
      svg: "<svg />",
    });
    await flushPromises();
    await flushPromises();

    expect(wrapper.text()).toContain("n42uBobLiteral");
    expect(wrapper.text()).not.toContain("n42uAliceLiteral");
  });
});

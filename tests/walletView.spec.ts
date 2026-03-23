import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import WalletView from "@/views/WalletView.vue";
import { useSessionStore } from "@/stores/session";

const fetchAccountAssetsMock = vi.fn();
const fetchAccountTransactionsMock = vi.fn();

vi.mock("@/services/iroha", () => ({
  fetchAccountAssets: (input: unknown) => fetchAccountAssetsMock(input),
  fetchAccountTransactions: (input: unknown) =>
    fetchAccountTransactionsMock(input),
}));

describe("WalletView", () => {
  beforeEach(() => {
    fetchAccountAssetsMock.mockReset();
    fetchAccountTransactionsMock.mockReset();
    fetchAccountTransactionsMock.mockResolvedValue({
      items: [],
      total: 0,
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
    return mount(WalletView, {
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

  it("refreshes on active account switch and ignores stale wallet payloads", async () => {
    let resolveAliceAssets: (value: unknown) => void = () => {};
    const aliceAssetsDeferred = new Promise((resolve) => {
      resolveAliceAssets = resolve;
    });
    fetchAccountAssetsMock.mockReturnValueOnce(aliceAssetsDeferred);
    fetchAccountAssetsMock.mockResolvedValueOnce({
      items: [
        {
          asset_id: "xor#wonderland##bob@wonderland",
          quantity: "20",
        },
      ],
      total: 1,
    });

    const wrapper = mountView();
    await flushPromises();

    await switchToBob();
    await flushPromises();

    expect(wrapper.text()).toContain("xor#wonderland##bob@wonderland");
    expect(wrapper.text()).toContain("20");

    resolveAliceAssets({
      items: [
        {
          asset_id: "xor#wonderland##alice@wonderland",
          quantity: "10",
        },
      ],
      total: 1,
    });
    await flushPromises();
    await flushPromises();

    expect(wrapper.text()).toContain("xor#wonderland##bob@wonderland");
    expect(wrapper.text()).not.toContain("xor#wonderland##alice@wonderland");
  });
});

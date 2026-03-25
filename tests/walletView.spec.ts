import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import WalletView from "@/views/WalletView.vue";
import { useSessionStore } from "@/stores/session";

const fetchAccountAssetsMock = vi.fn();
const fetchAccountTransactionsMock = vi.fn();
const requestFaucetFundsMock = vi.fn();

vi.mock("@/services/iroha", () => ({
  fetchAccountAssets: (input: unknown) => fetchAccountAssetsMock(input),
  fetchAccountTransactions: (input: unknown) =>
    fetchAccountTransactionsMock(input),
  requestFaucetFunds: (input: unknown) => requestFaucetFundsMock(input),
}));

describe("WalletView", () => {
  beforeEach(() => {
    fetchAccountAssetsMock.mockReset();
    fetchAccountTransactionsMock.mockReset();
    requestFaucetFundsMock.mockReset();
    fetchAccountTransactionsMock.mockResolvedValue({
      items: [],
      total: 0,
    });
    setActivePinia(createPinia());
  });

  const mountView = (assetDefinitionId = "xor#wonderland") => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const session = useSessionStore();
    session.$patch({
      connection: {
        toriiUrl: "http://localhost:8080",
        chainId: "chain",
        assetDefinitionId,
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

  it("requests faucet funds and refreshes balances", async () => {
    const fundedAssets = {
      items: [
        {
          asset_id: "norito:abcdef0123456789",
          quantity: "25000",
        },
      ],
      total: 1,
    };
    fetchAccountAssetsMock
      .mockResolvedValueOnce({
        items: [],
        total: 0,
      })
      .mockResolvedValueOnce(fundedAssets)
      .mockResolvedValue(fundedAssets);
    requestFaucetFundsMock.mockResolvedValue({
      account_id: "alice@wonderland",
      asset_definition_id: "61CtjvNd9T3THAR65GsMVHr82Bjc",
      asset_id: "norito:abcdef0123456789",
      amount: "25000",
      tx_hash_hex: "0xabc",
      status: "QUEUED",
    });

    const wrapper = mountView("");
    await flushPromises();

    await wrapper
      .findAll("button.secondary")
      .find((button) => button.text().includes("Claim Testnet XOR"))!
      .trigger("click");
    await flushPromises();

    const session = useSessionStore();
    expect(requestFaucetFundsMock).toHaveBeenCalledWith({
      toriiUrl: "http://localhost:8080",
      accountId: "alice@wonderland",
    });
    expect(session.connection.assetDefinitionId).toBe(
      "norito:abcdef0123456789",
    );
    expect(wrapper.text()).toContain("Testnet XOR requested: 0xabc");
    expect(wrapper.text()).toContain("norito:abcdef0123456789");
    expect(wrapper.text()).toContain("25000");
  });
});

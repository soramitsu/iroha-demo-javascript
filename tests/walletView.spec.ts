import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import WalletView from "@/views/WalletView.vue";
import { translate } from "@/i18n/messages";
import { useSessionStore } from "@/stores/session";
import { formatAssetDefinitionLabel } from "@/utils/assetId";

const fetchAccountAssetsMock = vi.fn();
const fetchAccountTransactionsMock = vi.fn();
const getConfidentialAssetBalanceMock = vi.fn();
const requestFaucetFundsMock = vi.fn();
const getConfidentialAssetPolicyMock = vi.fn();
const transferAssetMock = vi.fn();

type FaucetResponseFixture = {
  account_id: string;
  asset_definition_id: string;
  asset_id: string;
  amount: string;
  tx_hash_hex: string;
  status: string;
};

vi.mock("@/services/iroha", () => ({
  fetchAccountAssets: (input: unknown) => fetchAccountAssetsMock(input),
  fetchAccountTransactions: (input: unknown) =>
    fetchAccountTransactionsMock(input),
  getConfidentialAssetBalance: (input: unknown) =>
    getConfidentialAssetBalanceMock(input),
  getConfidentialAssetPolicy: (input: unknown) =>
    getConfidentialAssetPolicyMock(input),
  requestFaucetFunds: (
    input: unknown,
    onProgress?: (progress: unknown) => void,
  ) => requestFaucetFundsMock(input, onProgress),
  transferAsset: (input: unknown) => transferAssetMock(input),
}));

const t = (key: string, params?: Record<string, string | number>) =>
  translate("en-US", key, params);

describe("WalletView", () => {
  beforeEach(() => {
    fetchAccountAssetsMock.mockReset();
    fetchAccountTransactionsMock.mockReset();
    getConfidentialAssetBalanceMock.mockReset();
    requestFaucetFundsMock.mockReset();
    getConfidentialAssetPolicyMock.mockReset();
    transferAssetMock.mockReset();
    fetchAccountTransactionsMock.mockResolvedValue({
      items: [],
      total: 0,
    });
    getConfidentialAssetBalanceMock.mockResolvedValue({
      resolvedAssetId: "xor#universal",
      quantity: "0",
      onChainQuantity: "0",
      spendableQuantity: "0",
      exact: true,
    });
    getConfidentialAssetPolicyMock.mockResolvedValue({
      asset_id: "xor#universal",
      block_height: 1,
      current_mode: "Convertible",
      effective_mode: "Convertible",
      vk_set_hash: null,
      poseidon_params_id: null,
      pedersen_params_id: null,
      pending_transition: null,
    });
    setActivePinia(createPinia());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const mountView = (
    assetDefinitionId = "xor#wonderland",
    options?: {
      localOnly?: boolean;
      account?: Partial<{
        displayName: string;
        domain: string;
        accountId: string;
        i105AccountId: string;
        i105DefaultAccountId: string;
        publicKeyHex: string;
        privateKeyHex: string;
        localOnly: boolean;
      }>;
    },
  ) => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const session = useSessionStore();
    const account = {
      displayName: "Alice",
      domain: "wonderland",
      accountId: "alice@wonderland",
      publicKeyHex: "ab".repeat(32),
      privateKeyHex: "cd".repeat(32),
      localOnly: Boolean(options?.localOnly),
      ...options?.account,
    };
    session.$patch({
      connection: {
        toriiUrl: "http://localhost:8080",
        chainId: "chain",
        assetDefinitionId,
        networkPrefix: 369,
      },
      accounts: [account],
      activeAccountId: account.accountId,
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

  it("shows on-chain shielded xor balance derived from committed history", async () => {
    fetchAccountAssetsMock.mockResolvedValueOnce({
      items: [
        {
          asset_id: "xor#universal##alice@wonderland",
          quantity: "22",
        },
      ],
      total: 1,
    });
    fetchAccountTransactionsMock.mockResolvedValueOnce({
      items: [
        {
          entrypoint_hash: "0x1",
          result_ok: true,
          authority: "alice@wonderland",
          instructions: [
            {
              zk: {
                Shield: {
                  asset: "xor#universal",
                  from: "alice@wonderland",
                  amount: "12",
                },
              },
            },
          ],
        },
        {
          entrypoint_hash: "0x2",
          result_ok: true,
          authority: "alice@wonderland",
          instructions: [
            {
              zk: {
                Unshield: {
                  asset: "xor#universal",
                  to: "alice@wonderland",
                  public_amount: "3",
                },
              },
            },
          ],
        },
      ],
      total: 2,
    });
    getConfidentialAssetBalanceMock.mockResolvedValueOnce({
      resolvedAssetId: "xor#universal",
      quantity: "9",
      onChainQuantity: "9",
      spendableQuantity: "9",
      exact: true,
    });

    const wrapper = mountView("xor#wonderland");
    await flushPromises();

    expect(wrapper.text()).toContain(t("Shielded balance"));
    expect(wrapper.text()).toContain("xor#universal");
    expect(wrapper.text()).toContain("22");
    expect(wrapper.text()).toContain("9");
  });

  it("keeps the faucet action ahead of shielding controls in the wallet summary", async () => {
    fetchAccountAssetsMock.mockResolvedValueOnce({
      items: [
        {
          asset_id: "xor#universal##alice@wonderland",
          quantity: "22",
        },
      ],
      total: 1,
    });

    const wrapper = mountView();
    await flushPromises();

    const summaryHtml = wrapper.get(".wallet-summary-card").html();
    expect(summaryHtml.indexOf("wallet-faucet-panel")).toBeGreaterThan(-1);
    expect(summaryHtml.indexOf("wallet-shield-panel")).toBeGreaterThan(-1);
    expect(summaryHtml.indexOf("wallet-faucet-panel")).toBeLessThan(
      summaryHtml.indexOf("wallet-shield-panel"),
    );
  });

  it("hides shield controls for unfunded wallets", async () => {
    fetchAccountAssetsMock.mockResolvedValueOnce({
      items: [],
      total: 0,
    });

    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.find(".wallet-shield-panel").exists()).toBe(false);
  });

  it("disables send until the wallet has a positive balance", async () => {
    fetchAccountAssetsMock.mockResolvedValueOnce({
      items: [],
      total: 0,
    });

    const wrapper = mountView();
    await flushPromises();

    const sendLink = wrapper
      .findAll("a.secondary")
      .find((link) => link.text().includes(t("Send Points")))!;
    expect(sendLink.attributes("aria-disabled")).toBe("true");
    expect(sendLink.attributes("href")).toBeUndefined();
  });

  it("shows the shielded-note warning when wallet balance is inexact", async () => {
    fetchAccountAssetsMock.mockResolvedValueOnce({
      items: [
        {
          asset_id: "xor#universal##alice@wonderland",
          quantity: "22",
        },
      ],
      total: 1,
    });
    getConfidentialAssetBalanceMock.mockResolvedValueOnce({
      resolvedAssetId: "xor#universal",
      quantity: "4",
      onChainQuantity: null,
      spendableQuantity: "4",
      exact: false,
    });

    const wrapper = mountView("xor#wonderland");
    await flushPromises();

    expect(wrapper.text()).toContain(
      t(
        "Showing spendable shielded balance from this wallet. Older or foreign confidential outputs may still be missing.",
      ),
    );
  });

  it("creates shielded xor balance and refreshes the on-chain amount", async () => {
    fetchAccountAssetsMock
      .mockResolvedValueOnce({
        items: [
          {
            asset_id: "xor#universal##alice@wonderland",
            quantity: "30",
          },
        ],
        total: 1,
      })
      .mockResolvedValueOnce({
        items: [
          {
            asset_id: "xor#universal##alice@wonderland",
            quantity: "25",
          },
        ],
        total: 1,
      });
    fetchAccountTransactionsMock
      .mockResolvedValueOnce({
        items: [],
        total: 0,
      })
      .mockResolvedValueOnce({
        items: [
          {
            entrypoint_hash: "0xshield",
            result_ok: true,
            authority: "alice@wonderland",
            instructions: [
              {
                zk: {
                  Shield: {
                    asset: "xor#universal",
                    from: "alice@wonderland",
                    amount: "5",
                  },
                },
              },
            ],
          },
        ],
        total: 1,
      });
    getConfidentialAssetBalanceMock
      .mockResolvedValueOnce({
        resolvedAssetId: "xor#universal",
        quantity: "0",
        onChainQuantity: "0",
        spendableQuantity: "0",
        exact: true,
      })
      .mockResolvedValueOnce({
        resolvedAssetId: "xor#universal",
        quantity: "5",
        onChainQuantity: "5",
        spendableQuantity: "5",
        exact: true,
      });
    transferAssetMock.mockResolvedValue({ hash: "0xshield" });

    const wrapper = mountView("xor#wonderland", { localOnly: true });
    await flushPromises();

    await wrapper.get(".wallet-shield-input input").setValue("5");
    await wrapper
      .findAll("button.secondary")
      .find((button) => button.text().includes(t("Create shielded balance")))!
      .trigger("click");
    await flushPromises();

    expect(transferAssetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        assetDefinitionId: "xor#universal",
        destinationAccountId: "alice@wonderland",
        quantity: "5",
        shielded: true,
      }),
    );
    expect(useSessionStore().activeAccount?.localOnly).toBe(false);
    expect(wrapper.text()).toContain(
      t("Shield transaction submitted: {hash}", { hash: "0xshield" }),
    );
    expect(wrapper.text()).toContain("5");
  });

  it("uses the resolved on-chain xor asset id for wallet matching and shielding", async () => {
    getConfidentialAssetPolicyMock.mockResolvedValueOnce({
      asset_id: "norito:resolvedxorasset",
      block_height: 1,
      current_mode: "Convertible",
      effective_mode: "Convertible",
      vk_set_hash: null,
      poseidon_params_id: null,
      pedersen_params_id: null,
      pending_transition: null,
    });
    fetchAccountAssetsMock.mockResolvedValue({
      items: [
        {
          asset_id: "norito:resolvedxorasset##alice@wonderland",
          quantity: "40",
        },
      ],
      total: 1,
    });
    fetchAccountTransactionsMock.mockResolvedValue({
      items: [
        {
          entrypoint_hash: "0xresolved",
          result_ok: true,
          authority: "alice@wonderland",
          instructions: [
            {
              zk: {
                Shield: {
                  asset: "norito:resolvedxorasset",
                  from: "alice@wonderland",
                  amount: "6",
                },
              },
            },
          ],
        },
      ],
      total: 1,
    });
    getConfidentialAssetBalanceMock.mockResolvedValue({
      resolvedAssetId: "norito:resolvedxorasset",
      quantity: "6",
      onChainQuantity: "6",
      spendableQuantity: "6",
      exact: true,
    });
    transferAssetMock.mockResolvedValue({ hash: "0xresolved" });

    const wrapper = mountView("xor#wonderland");
    await flushPromises();

    expect(wrapper.text()).toContain(
      formatAssetDefinitionLabel("norito:resolvedxorasset"),
    );
    expect(wrapper.text()).toContain("40");
    expect(wrapper.text()).toContain("6");
    expect(wrapper.text()).not.toContain("norito:resolvedxorasset");

    await wrapper.get(".wallet-shield-input input").setValue("2");
    await wrapper
      .findAll("button.secondary")
      .find((button) => button.text().includes(t("Create shielded balance")))!
      .trigger("click");
    await flushPromises();

    expect(transferAssetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        assetDefinitionId: "norito:resolvedxorasset",
        destinationAccountId: "alice@wonderland",
        quantity: "2",
        shielded: true,
      }),
    );
  });

  it("shows the live Torii XOR balance instead of the cached faucet asset bucket", async () => {
    fetchAccountAssetsMock.mockResolvedValue({
      items: [
        {
          asset_id: "norito:cachedbucket",
          quantity: "25000",
        },
        {
          asset_id: "xor#universal##alice@wonderland",
          quantity: "75000",
        },
      ],
      total: 2,
    });

    const wrapper = mountView("norito:cachedbucket");
    await flushPromises();

    expect(wrapper.get(".wallet-balance-value").text()).toBe("75000");
    expect(wrapper.get(".wallet-balance-asset").text()).toBe("xor#universal");
  });

  it("keeps the faucet action enabled while wallet refresh is still loading", async () => {
    let resolveAssets: (value: {
      items: Array<{ asset_id: string; quantity: string }>;
      total: number;
    }) => void = () => {};
    fetchAccountAssetsMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveAssets = resolve;
      }),
    );

    const wrapper = mountView("");
    await flushPromises();

    const faucetButton = wrapper
      .findAll("button")
      .find((button) => button.text().includes(t("Claim Testnet XOR")))!;

    expect(faucetButton.attributes("disabled")).toBeUndefined();

    resolveAssets({
      items: [],
      total: 0,
    });
    await flushPromises();
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
      .findAll("button")
      .find((button) => button.text().includes(t("Claim Testnet XOR")))!
      .trigger("click");
    await flushPromises();

    const session = useSessionStore();
    expect(requestFaucetFundsMock).toHaveBeenCalledWith(
      {
        toriiUrl: "http://localhost:8080",
        accountId: "alice@wonderland",
        networkPrefix: 369,
      },
      expect.any(Function),
    );
    expect(session.connection.assetDefinitionId).toBe(
      "61CtjvNd9T3THAR65GsMVHr82Bjc",
    );
    expect(session.activeAccount?.localOnly).toBe(false);
    expect(wrapper.text()).toContain(
      t("Testnet XOR requested: {hash}", { hash: "0xabc" }),
    );
    expect(wrapper.text()).toContain(
      formatAssetDefinitionLabel("norito:abcdef0123456789"),
    );
    expect(wrapper.text()).toContain("25000");
    expect(wrapper.text()).not.toContain("norito:abcdef0123456789");
  });

  it("falls back to the funded asset reference when faucet omits the definition id", async () => {
    const fundedAssets = {
      items: [
        {
          asset_id: "61CtjvNd9T3THAR65GsMVHr82Bjc##alice@wonderland",
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
      asset_definition_id: "",
      asset_id: "61CtjvNd9T3THAR65GsMVHr82Bjc##alice@wonderland",
      amount: "25000",
      tx_hash_hex: "0xabc",
      status: "QUEUED",
    });

    const wrapper = mountView("");
    await flushPromises();

    await wrapper
      .findAll("button")
      .find((button) => button.text().includes(t("Claim Testnet XOR")))!
      .trigger("click");
    await flushPromises();

    expect(useSessionStore().connection.assetDefinitionId).toBe(
      "61CtjvNd9T3THAR65GsMVHr82Bjc",
    );
  });

  it("uses the TAIRA i105 literal for faucet requests when stored ids are stale", async () => {
    fetchAccountAssetsMock
      .mockResolvedValueOnce({
        items: [],
        total: 0,
      })
      .mockResolvedValue({
        items: [],
        total: 0,
      });
    requestFaucetFundsMock.mockResolvedValue({
      account_id: "testuLegacyVisibleAccount1234567890",
      asset_definition_id: "61CtjvNd9T3THAR65GsMVHr82Bjc",
      asset_id: "norito:abcdef0123456789",
      amount: "25000",
      tx_hash_hex: "0xabc",
      status: "QUEUED",
    });

    const wrapper = mountView("", {
      account: {
        accountId: "sorauLegacyVisibleAccount1234567890",
        i105AccountId: "",
        i105DefaultAccountId: "sorauLegacyVisibleAccount1234567890",
      },
    });
    await flushPromises();

    expect(wrapper.text()).toContain("testuLegacyVisibleAccount1234567890");

    await wrapper
      .findAll("button")
      .find((button) => button.text().includes(t("Claim Testnet XOR")))!
      .trigger("click");
    await flushPromises();

    expect(requestFaucetFundsMock).toHaveBeenCalledWith(
      {
        toriiUrl: "http://localhost:8080",
        accountId: "testuLegacyVisibleAccount1234567890",
        networkPrefix: 369,
      },
      expect.any(Function),
    );
  });

  it("disables faucet claims after the configured faucet asset already has a positive balance", async () => {
    fetchAccountAssetsMock.mockResolvedValueOnce({
      items: [
        {
          asset_id: "norito:abcdef0123456789",
          quantity: "25000",
        },
      ],
      total: 1,
    });

    const wrapper = mountView("norito:abcdef0123456789");
    await flushPromises();

    const faucetButton = wrapper
      .findAll("button")
      .find((button) => button.text().includes(t("Claim Testnet XOR")))!;

    expect(faucetButton.attributes("disabled")).toBeDefined();
  });

  it("shows a blocking faucet status modal while a claim is in flight", async () => {
    vi.useFakeTimers();
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
      .mockResolvedValueOnce({
        items: [],
        total: 0,
      })
      .mockResolvedValueOnce(fundedAssets);

    let resolveFaucet: (value: FaucetResponseFixture) => void = () => {};
    requestFaucetFundsMock.mockImplementation(
      async (_input: unknown, onProgress?: (progress: any) => void) => {
        onProgress?.({ phase: "solvingPuzzle" });
        return new Promise<FaucetResponseFixture>((resolve) => {
          resolveFaucet = resolve;
        });
      },
    );

    const wrapper = mountView("");
    await flushPromises();

    await wrapper
      .findAll("button")
      .find((button) => button.text().includes(t("Claim Testnet XOR")))!
      .trigger("click");
    await flushPromises();

    expect(wrapper.find(".wallet-faucet-modal-backdrop").exists()).toBe(true);
    expect(wrapper.text()).toContain(t("Faucet request in progress"));
    expect(wrapper.text()).toContain(t("Solving faucet proof-of-work…"));

    resolveFaucet({
      account_id: "alice@wonderland",
      asset_definition_id: "61CtjvNd9T3THAR65GsMVHr82Bjc",
      asset_id: "norito:abcdef0123456789",
      amount: "25000",
      tx_hash_hex: "0xabc",
      status: "QUEUED",
    });
    await flushPromises();
    await vi.advanceTimersByTimeAsync(1_500);
    await flushPromises();

    expect(wrapper.find(".wallet-faucet-modal-backdrop").exists()).toBe(false);
  });

  it("keeps polling wallet refresh until the funded faucet asset appears", async () => {
    vi.useFakeTimers();
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
      .mockResolvedValueOnce({
        items: [],
        total: 0,
      })
      .mockResolvedValueOnce({
        items: [],
        total: 0,
      })
      .mockResolvedValueOnce(fundedAssets);
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
      .findAll("button")
      .find((button) => button.text().includes(t("Claim Testnet XOR")))!
      .trigger("click");
    await flushPromises();
    await vi.advanceTimersByTimeAsync(3_000);
    await flushPromises();
    await flushPromises();

    expect(fetchAccountAssetsMock).toHaveBeenCalledTimes(4);
    expect(wrapper.text()).toContain(
      formatAssetDefinitionLabel("norito:abcdef0123456789"),
    );
    expect(wrapper.text()).toContain("25000");
    expect(wrapper.text()).not.toContain("norito:abcdef0123456789");
  });

  it("shows a wallet error when local-only accounts are not live on-chain yet", async () => {
    fetchAccountAssetsMock.mockRejectedValueOnce(
      new Error("Account not found"),
    );

    const wrapper = mountView("xor#wonderland", { localOnly: true });
    await flushPromises();

    expect(wrapper.text()).toContain(
      t(
        "This wallet is saved locally. If the account is not live on-chain yet, balances and transfers can stay empty until it is funded or otherwise created on-chain.",
      ),
    );
    expect(wrapper.text()).toContain("Account not found");
  });

  it("clears the local-only flag once on-chain wallet data loads", async () => {
    fetchAccountAssetsMock.mockResolvedValueOnce({
      items: [],
      total: 0,
    });

    mountView("xor#wonderland", { localOnly: true });
    await flushPromises();

    expect(useSessionStore().activeAccount?.localOnly).toBe(false);
  });
});

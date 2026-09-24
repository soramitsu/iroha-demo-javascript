import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import WalletView from "@/views/WalletView.vue";
import { MINAMOTO_CHAIN_PRESET, TAIRA_CHAIN_PRESET } from "@/constants/chains";
import { translate } from "@/i18n/messages";
import { useEndpointStore } from "@/stores/endpoint";
import { useSessionStore } from "@/stores/session";
import type {
  EndpointFeature,
  EndpointFeatureMap,
} from "@/types/endpointInspection";
import { formatAssetDefinitionLabel } from "@/utils/assetId";

const fetchAccountAssetsMock = vi.fn();
const fetchAccountTransactionsMock = vi.fn();
const getConfidentialAssetBalanceMock = vi.fn();
const scanConfidentialWalletMock = vi.fn();
const requestFaucetFundsMock = vi.fn();
const cancelFaucetRequestMock = vi.fn();
const getGovernanceCitizenStatusMock = vi.fn();
const REKEYED_TAIRA_ACCOUNT_ID = "testuLegacyVisibleAccount1234567890";
const REKEYED_MINAMOTO_ACCOUNT_ID = "sorauLegacyVisibleAccount1234567890";
const ALICE_ACCOUNT_ID = "testuAliceCanonicalAccount1234567890";
const BOB_ACCOUNT_ID = "testuBobCanonicalAccount1234567890";
const XOR_ASSET_DEFINITION_ID = "6TEAJqbb8oEPmLncoNiMRbLEK6tw";
const OTHER_ASSET_DEFINITION_ID = "61CtjvNd9T3THAR65GsMVHr82Bjc";
const STALE_ASSET_DEFINITION_ID = "5PeSrQmLNwwKtruJvDZrbrm9RuMw";
const CACHED_ASSET_DEFINITION_ID = "62Fk4FPcMuLvW5QjDGNF2a4jAmjM";
const ALICE_XOR_HOLDING_ID = `${XOR_ASSET_DEFINITION_ID}#${ALICE_ACCOUNT_ID}`;
const BOB_XOR_HOLDING_ID = `${XOR_ASSET_DEFINITION_ID}#${BOB_ACCOUNT_ID}`;
const ALICE_OTHER_HOLDING_ID = `${OTHER_ASSET_DEFINITION_ID}#${ALICE_ACCOUNT_ID}`;

const installAccountAddressDeriver = () => {
  (window as unknown as { iroha: Record<string, unknown> }).iroha = {
    deriveAccountAddress: (input: { networkPrefix: number }) => {
      const accountId =
        input.networkPrefix === 369
          ? REKEYED_TAIRA_ACCOUNT_ID
          : REKEYED_MINAMOTO_ACCOUNT_ID;
      return {
        accountId,
        i105AccountId: accountId,
        i105DefaultAccountId: REKEYED_MINAMOTO_ACCOUNT_ID,
        publicKeyHex: "ab".repeat(32),
        accountIdWarning: "",
      };
    },
  };
};

type FaucetResponseFixture = {
  account_id: string;
  asset_definition_id: string;
  asset_id: string;
  amount: string;
  tx_hash_hex: string;
  status: string;
};

const finalityFor = (transactionHash: string) => ({
  status: "finalized" as const,
  transactionHash,
  blockHeight: 17,
  blockHash: "ef".repeat(32),
  finalizedBlockHeight: 17,
});

vi.mock("@/services/iroha", () => ({
  fetchAccountAssets: (input: unknown) => fetchAccountAssetsMock(input),
  fetchAccountTransactions: (input: unknown) =>
    fetchAccountTransactionsMock(input),
  getConfidentialAssetBalance: (input: unknown) =>
    getConfidentialAssetBalanceMock(input),
  scanConfidentialWallet: (input: unknown) => scanConfidentialWalletMock(input),
  getGovernanceCitizenStatus: (input: unknown) =>
    getGovernanceCitizenStatusMock(input),
  requestFaucetFunds: (
    input: unknown,
    onProgress?: (progress: unknown) => void,
  ) =>
    Promise.resolve(requestFaucetFundsMock(input, onProgress)).then(
      (result: FaucetResponseFixture & { finality?: unknown }) => ({
        ...result,
        status: "FINALIZED",
        finality: result.finality ?? finalityFor(result.tx_hash_hex),
      }),
    ),
  cancelFaucetRequest: (input: unknown) => cancelFaucetRequestMock(input),
}));

const t = (key: string, params?: Record<string, string | number>) =>
  translate("en-US", key, params);

const endpointFeatures = (supported: boolean): EndpointFeatureMap => {
  const features: EndpointFeature[] = [
    "accountRegistration",
    "accountOnboarding",
    "assetTransfers",
    "faucetClaim",
    "kaigiMeetings",
    "governanceWrites",
    "stakingWrites",
    "subscriptionWrites",
    "soraCloudHfSharedLease",
    "vpnSessions",
    "irohaConnectSessions",
  ];
  return Object.fromEntries(
    features.map((feature) => [
      feature,
      {
        supported,
        source: "openapi",
        requiredOperations: [],
        missingOperations: [],
      },
    ]),
  ) as unknown as EndpointFeatureMap;
};

const confidentialBalanceFixture = (
  overrides: Partial<{
    resolvedAssetId: string;
    quantity: string | null;
    onChainQuantity: string | null;
    spendableQuantity: string;
    exact: boolean;
    scanSource: "global-note-index" | "account-transactions";
    scanStatus: "complete" | "limited" | "incomplete";
    scanWatermarkBlock: number | null;
    recoveredNoteCount: number;
    trackedAssetIds: string[];
  }> = {},
) => ({
  resolvedAssetId: XOR_ASSET_DEFINITION_ID,
  quantity: "0",
  onChainQuantity: "0",
  spendableQuantity: "0",
  exact: true,
  scanSource: "global-note-index" as const,
  scanStatus: "complete" as const,
  scanWatermarkBlock: null,
  recoveredNoteCount: 0,
  trackedAssetIds: [XOR_ASSET_DEFINITION_ID],
  ...overrides,
});

describe("WalletView", () => {
  const getOpenDialog = () =>
    document.body.querySelector<HTMLDialogElement>("dialog.ui-dialog[open]");

  beforeEach(() => {
    delete (window as unknown as { iroha?: unknown }).iroha;
    document.body
      .querySelectorAll("dialog.ui-dialog")
      .forEach((dialog) => dialog.remove());
    fetchAccountAssetsMock.mockReset();
    fetchAccountTransactionsMock.mockReset();
    getConfidentialAssetBalanceMock.mockReset();
    scanConfidentialWalletMock.mockReset();
    requestFaucetFundsMock.mockReset();
    cancelFaucetRequestMock.mockReset();
    getGovernanceCitizenStatusMock.mockReset();
    cancelFaucetRequestMock.mockResolvedValue({ canceled: true });
    fetchAccountAssetsMock.mockResolvedValue({
      items: [],
      total: 0,
    });
    fetchAccountTransactionsMock.mockResolvedValue({
      items: [],
      total: 0,
    });
    getConfidentialAssetBalanceMock.mockResolvedValue(
      confidentialBalanceFixture(),
    );
    scanConfidentialWalletMock.mockResolvedValue(
      confidentialBalanceFixture({
        quantity: "7",
        spendableQuantity: "7",
        recoveredNoteCount: 1,
        scanWatermarkBlock: 42,
      }),
    );
    getGovernanceCitizenStatusMock.mockResolvedValue({
      state: "not-citizen",
      accountId: "testuAliceCanonicalAccount1234567890",
      amount: null,
      bondedHeight: null,
      seatsInEpoch: null,
      lastEpochSeen: null,
      cooldownUntil: null,
    });
    setActivePinia(createPinia());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const mountView = (
    assetDefinitionId = XOR_ASSET_DEFINITION_ID,
    options?: {
      localOnly?: boolean;
      connection?: Partial<{
        toriiUrl: string;
        chainId: string;
        assetDefinitionId: string;
        networkPrefix: number;
      }>;
      account?: Partial<{
        displayName: string;
        domain: string;
        accountId: string;
        i105AccountId: string;
        i105DefaultAccountId: string;
        publicKeyHex: string;
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
      accountId: "testuAliceCanonicalAccount1234567890",
      publicKeyHex: "ab".repeat(32),
      hasStoredSecret: true,
      localOnly: Boolean(options?.localOnly),
      ...options?.account,
    };
    session.$patch({
      connection: {
        toriiUrl: "http://localhost:8080",
        chainId: "chain",
        assetDefinitionId,
        networkPrefix: 369,
        ...options?.connection,
      },
    });
    session.addAccount(account);
    useEndpointStore().$patch({
      state: "ready",
      inspection: {
        schema: "iroha.wallet.endpoint-inspection.v1",
        toriiUrl: session.connection.toriiUrl,
        expected: {
          chainId: session.connection.chainId,
          networkPrefix: session.connection.networkPrefix,
        },
        observed: {
          chainId: session.connection.chainId,
          networkPrefix: session.connection.networkPrefix,
        },
        identityStatus: "matched",
        accessMode: "read-write",
        checkedAtMs: 1,
        evidence: [],
        features: endpointFeatures(true),
        diagnostic: {
          code: "endpoint_identity_matched",
          message: "Endpoint identity matches the configured network.",
        },
      },
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
          accountId: "testuBobCanonicalAccount1234567890",
          publicKeyHex: "ef".repeat(32),
          hasStoredSecret: true,
        },
      ],
      activeAccountId: "testuBobCanonicalAccount1234567890",
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
          asset_id: BOB_XOR_HOLDING_ID,
          quantity: "20",
        },
      ],
      total: 1,
    });

    const wrapper = mountView(XOR_ASSET_DEFINITION_ID);
    await flushPromises();

    await switchToBob();
    await flushPromises();

    expect(wrapper.text()).toContain(BOB_XOR_HOLDING_ID);
    expect(wrapper.text()).toContain("20");

    resolveAliceAssets({
      items: [
        {
          asset_id: ALICE_XOR_HOLDING_ID,
          quantity: "10",
        },
      ],
      total: 1,
    });
    await flushPromises();
    await flushPromises();

    expect(wrapper.text()).toContain(BOB_XOR_HOLDING_ID);
    expect(wrapper.text()).not.toContain(ALICE_XOR_HOLDING_ID);
  });

  it("ignores stale citizenship responses after the active account changes", async () => {
    let resolveAliceCitizenship: (value: unknown) => void = () => {};
    fetchAccountAssetsMock.mockImplementation(
      async (input: { accountId: string }) => ({
        items: [
          {
            asset_id: `${XOR_ASSET_DEFINITION_ID}#${input.accountId}`,
            quantity: "20",
          },
        ],
        total: 1,
      }),
    );
    getGovernanceCitizenStatusMock
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveAliceCitizenship = resolve;
        }),
      )
      .mockResolvedValueOnce({
        state: "not-citizen",
        accountId: "testuBobCanonicalAccount1234567890",
        amount: null,
        bondedHeight: null,
        seatsInEpoch: null,
        lastEpochSeen: null,
        cooldownUntil: null,
      });

    const wrapper = mountView();
    await flushPromises();
    expect(wrapper.text()).toContain(t("Checking citizenship…"));

    await switchToBob();
    await flushPromises();
    expect(wrapper.text()).toContain(t("Not a citizen yet"));

    resolveAliceCitizenship({
      state: "citizen",
      accountId: "testuAliceCanonicalAccount1234567890",
      amount: "10000",
      bondedHeight: "12",
      seatsInEpoch: "0",
      lastEpochSeen: "0",
      cooldownUntil: null,
    });
    await flushPromises();

    expect(wrapper.text()).toContain(t("Not a citizen yet"));
    expect(wrapper.text()).not.toContain(t("You are a citizen"));
  });

  it("signs wallet transaction history refreshes with the active account key", async () => {
    mountView();
    await flushPromises();

    expect(fetchAccountAssetsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: "testuAliceCanonicalAccount1234567890",
        networkPrefix: 369,
      }),
    );
    expect(fetchAccountTransactionsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: "testuAliceCanonicalAccount1234567890",
        networkPrefix: 369,
        limit: 25,
        offset: 0,
      }),
    );
    expect(fetchAccountTransactionsMock.mock.calls[0]?.[0]).not.toHaveProperty(
      "privateKeyHex",
    );
  });

  it("shows citizenship status without a network citizen count on the wallet screen", async () => {
    fetchAccountAssetsMock.mockResolvedValueOnce({
      items: [
        {
          asset_id: ALICE_XOR_HOLDING_ID,
          quantity: "42",
        },
      ],
      total: 1,
    });
    getGovernanceCitizenStatusMock.mockResolvedValueOnce({
      state: "citizen",
      accountId: "testuAliceCanonicalAccount1234567890",
      amount: "10000",
      bondedHeight: "12",
      seatsInEpoch: "0",
      lastEpochSeen: "0",
      cooldownUntil: null,
    });

    const wrapper = mountView();
    await flushPromises();

    const panel = wrapper.get(".wallet-citizenship-panel");
    expect(panel.classes()).toContain("wallet-citizenship-panel-positive");
    expect(panel.text()).toContain(t("You are a citizen"));
    expect(panel.text()).toContain(
      t("Bonded {amount} XOR", { amount: "10000" }),
    );
    expect(panel.find(".wallet-citizenship-count").exists()).toBe(false);
    expect(getGovernanceCitizenStatusMock).toHaveBeenCalledWith({
      toriiUrl: "http://localhost:8080",
      accountId: "testuAliceCanonicalAccount1234567890",
      networkPrefix: 369,
    });
  });

  it("does not present an unavailable citizen read as non-citizenship", async () => {
    fetchAccountAssetsMock.mockResolvedValueOnce({
      items: [
        {
          asset_id: ALICE_XOR_HOLDING_ID,
          quantity: "20",
        },
      ],
      total: 1,
    });
    getGovernanceCitizenStatusMock.mockResolvedValueOnce({
      state: "unavailable",
      accountId: "testuAliceCanonicalAccount1234567890",
      amount: null,
      bondedHeight: null,
      seatsInEpoch: null,
      lastEpochSeen: null,
      cooldownUntil: null,
    });

    const wrapper = mountView();
    await flushPromises();

    const panel = wrapper.get(".wallet-citizenship-panel");
    expect(panel.text()).toContain(t("Citizen status unavailable"));
    expect(panel.text()).not.toContain(t("Not a citizen yet"));
  });

  it("shows funding and citizenship independently for an empty wallet", async () => {
    const wrapper = mountView();
    await flushPromises();

    const balanceBand = wrapper.get(".wallet-balance-band");
    expect(balanceBand.find(".wallet-quick-actions").exists()).toBe(true);
    expect(balanceBand.findAll(".wallet-action-link")).toHaveLength(2);

    const nextSteps = wrapper.findAll(".wallet-next-step .ui-alert");
    expect(nextSteps).toHaveLength(2);
    expect(nextSteps[0]?.text()).toContain(t("Starter funds"));
    expect(nextSteps[1]?.text()).toContain(t("Not a citizen yet"));
  });

  it("does not suggest bonding when endpoint writes are blocked", async () => {
    const wrapper = mountView();
    const endpoint = useEndpointStore();
    endpoint.$patch({
      state: "ready",
      inspection: {
        ...endpoint.inspection!,
        observed: {
          chainId: "809574f5-fee7-5e69-bfcf-52451e42d50f",
          networkPrefix: 369,
        },
        identityStatus: "mismatched",
        accessMode: "read-only",
        diagnostic: {
          code: "endpoint_identity_mismatch",
          message: "Archived Taira deployment; writes are blocked.",
        },
      },
    });
    await flushPromises();

    const panel = wrapper.get(".wallet-citizenship-panel");
    expect(panel.text()).toContain(
      "Archived Taira deployment; writes are blocked.",
    );
    expect(panel.text()).not.toContain(
      t("Bond citizenship and vote in governance referenda"),
    );
    const faucetButton = wrapper
      .findAll("button")
      .find((button) => button.text().includes(t("Request XOR")));
    expect(faucetButton?.attributes("disabled")).toBeDefined();
  });

  it("keeps only the faucet challenge available when endpoint identity is unverified and its complete surface is advertised", async () => {
    const wrapper = mountView();
    const endpoint = useEndpointStore();
    endpoint.$patch({
      state: "ready",
      inspection: {
        ...endpoint.inspection!,
        observed: null,
        identityStatus: "unverified",
        accessMode: "read-only",
        diagnostic: {
          code: "endpoint_identity_unverified",
          message:
            "Endpoint identity is available only from its faucet puzzle.",
        },
      },
    });
    await flushPromises();

    expect(endpoint.writeAllowed).toBe(false);
    const faucetButton = wrapper
      .findAll("button")
      .find((button) => button.text().includes(t("Request XOR")));
    expect(faucetButton?.attributes("disabled")).toBeUndefined();
    expect(wrapper.get(".wallet-citizenship-panel").text()).toContain(
      "Endpoint identity is available only from its faucet puzzle.",
    );
  });

  it("does not expose the faucet challenge on an unverified endpoint with an incomplete advertised surface", async () => {
    const wrapper = mountView();
    const endpoint = useEndpointStore();
    const features = endpointFeatures(true);
    features.faucetClaim = {
      supported: false,
      source: "openapi",
      requiredOperations: ["GET /v1/accounts/faucet/puzzle"],
      missingOperations: ["GET /v1/accounts/faucet/puzzle"],
    };
    endpoint.$patch({
      state: "ready",
      inspection: {
        ...endpoint.inspection!,
        observed: null,
        identityStatus: "unverified",
        accessMode: "read-only",
        features,
        diagnostic: {
          code: "endpoint_identity_unverified",
          message: "Endpoint identity is unverified.",
        },
      },
    });
    await flushPromises();

    const faucetButton = wrapper
      .findAll("button")
      .find((button) => button.text().includes(t("Request XOR")));
    expect(faucetButton?.attributes("disabled")).toBeDefined();
  });

  it("updates the visible balance while transaction and private reads continue independently", async () => {
    let resolveTransactions: (value: unknown) => void = () => {};
    fetchAccountAssetsMock.mockResolvedValueOnce({
      items: [
        {
          asset_id: ALICE_XOR_HOLDING_ID,
          quantity: "42",
        },
      ],
      total: 1,
    });
    fetchAccountTransactionsMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveTransactions = resolve;
      }),
    );

    const wrapper = mountView(XOR_ASSET_DEFINITION_ID);
    await flushPromises();

    expect(wrapper.get(".wallet-balance-value").text()).toBe("42");
    expect(getConfidentialAssetBalanceMock).toHaveBeenCalled();

    resolveTransactions({ items: [], total: 0 });
    await flushPromises();

    expect(getConfidentialAssetBalanceMock).toHaveBeenCalled();
  });

  it("marks an account-assets failure unavailable instead of claiming zero or empty", async () => {
    fetchAccountAssetsMock.mockRejectedValueOnce(
      new Error("Account assets request timed out."),
    );

    const wrapper = mountView(XOR_ASSET_DEFINITION_ID);
    await flushPromises();

    expect(wrapper.get(".wallet-balance-value").text()).toBe(t("Unavailable"));
    expect(wrapper.text()).toContain("Account assets request timed out.");
    expect(wrapper.find('[data-testid="wallet-assets-empty"]').exists()).toBe(
      false,
    );
    const sendLink = wrapper
      .findAll("a.secondary")
      .find((link) => link.text().includes(t("Send")))!;
    expect(sendLink.attributes("aria-disabled")).toBe("true");
  });

  it("marks a failed transaction read unavailable instead of claiming no history", async () => {
    fetchAccountAssetsMock.mockResolvedValueOnce({
      items: [
        {
          asset_id: ALICE_XOR_HOLDING_ID,
          quantity: "20",
        },
      ],
      total: 1,
    });
    fetchAccountTransactionsMock.mockRejectedValueOnce(
      new Error("Transaction history request timed out."),
    );
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      const wrapper = mountView();
      await flushPromises();

      expect(
        wrapper.get('[data-testid="wallet-transactions-error"]').text(),
      ).toContain("Transaction history request timed out.");
      expect(
        wrapper.find('[data-testid="wallet-transactions-empty"]').exists(),
      ).toBe(false);
      expect(wrapper.text()).not.toContain(t("No transfers recorded yet."));
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("retains last-good assets and transactions with explicit refresh errors", async () => {
    fetchAccountAssetsMock
      .mockResolvedValueOnce({
        items: [
          {
            asset_id: ALICE_XOR_HOLDING_ID,
            quantity: "42",
          },
        ],
        total: 1,
      })
      .mockRejectedValueOnce(new Error("Asset refresh failed."));
    fetchAccountTransactionsMock
      .mockResolvedValueOnce({
        items: [
          {
            entrypoint_hash: "0xlast-good",
            timestamp_ms: 1_750_000_000_000,
            result_ok: true,
            instructions: [],
          },
        ],
        total: 1,
      })
      .mockRejectedValueOnce(new Error("Transaction refresh failed."));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const routeHeaderTarget = document.createElement("div");
    routeHeaderTarget.id = "route-header-actions";
    document.body.append(routeHeaderTarget);

    try {
      const wrapper = mountView(XOR_ASSET_DEFINITION_ID);
      await flushPromises();

      routeHeaderTarget.querySelector<HTMLButtonElement>("button")!.click();
      await flushPromises();

      expect(wrapper.get(".wallet-balance-value").text()).toBe("42");
      expect(wrapper.get(".wallet-table-wrap").text()).toContain("42");
      expect(wrapper.text()).toContain("Asset refresh failed.");
      expect(
        wrapper.get('[data-testid="wallet-transactions-error"]').text(),
      ).toContain("Transaction refresh failed.");
      expect(
        wrapper.find(".wallet-transactions-card .table-wrap").exists(),
      ).toBe(true);
    } finally {
      routeHeaderTarget.remove();
      warnSpy.mockRestore();
    }
  });

  it("retains the last-good private balance when a rescan refresh fails", async () => {
    fetchAccountAssetsMock.mockResolvedValue({
      items: [
        {
          asset_id: ALICE_XOR_HOLDING_ID,
          quantity: "42",
        },
      ],
      total: 1,
    });
    getConfidentialAssetBalanceMock
      .mockResolvedValueOnce(
        confidentialBalanceFixture({
          quantity: "7",
          onChainQuantity: "7",
          spendableQuantity: "7",
          recoveredNoteCount: 1,
        }),
      )
      .mockRejectedValueOnce(new Error("Private balance refresh failed."));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const routeHeaderTarget = document.createElement("div");
    routeHeaderTarget.id = "route-header-actions";
    document.body.append(routeHeaderTarget);

    try {
      const wrapper = mountView(XOR_ASSET_DEFINITION_ID);
      await flushPromises();

      routeHeaderTarget.querySelector<HTMLButtonElement>("button")!.click();
      await flushPromises();
      await flushPromises();

      expect(wrapper.get(".wallet-shield-balance").text()).toBe("7");
      expect(wrapper.text()).toContain("Private balance refresh failed.");
    } finally {
      routeHeaderTarget.remove();
      warnSpy.mockRestore();
    }
  });

  it("refreshes the primary balance with a narrow asset query before citizenship returns", async () => {
    let resolveCitizenship: (value: unknown) => void = () => {};
    getGovernanceCitizenStatusMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveCitizenship = resolve;
      }),
    );
    fetchAccountAssetsMock.mockResolvedValueOnce({
      items: [
        {
          asset_id: ALICE_XOR_HOLDING_ID,
          quantity: "42",
        },
      ],
      total: 1,
    });

    const wrapper = mountView(XOR_ASSET_DEFINITION_ID);
    await flushPromises();

    expect(fetchAccountAssetsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        assetDefinitionId: XOR_ASSET_DEFINITION_ID,
        limit: 8,
      }),
    );
    expect(wrapper.get(".wallet-balance-value").text()).toBe("42");

    resolveCitizenship({
      state: "citizen",
      accountId: "testuAliceCanonicalAccount1234567890",
      amount: "10000",
      bondedHeight: "12",
      seatsInEpoch: "0",
      lastEpochSeen: "0",
      cooldownUntil: null,
    });
    await flushPromises();

    expect(wrapper.text()).toContain(t("You are a citizen"));
  });

  it("does not relabel an unrelated holding when a stale filtered asset is missing", async () => {
    fetchAccountAssetsMock
      .mockRejectedValueOnce(new Error("Asset definition not found"))
      .mockResolvedValueOnce({
        items: [
          {
            asset_id: ALICE_OTHER_HOLDING_ID,
            quantity: "25000",
          },
        ],
        total: 1,
      });

    const wrapper = mountView(STALE_ASSET_DEFINITION_ID);
    await flushPromises();

    expect(fetchAccountAssetsMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        assetDefinitionId: STALE_ASSET_DEFINITION_ID,
        limit: 8,
      }),
    );
    expect(fetchAccountAssetsMock.mock.calls[1]?.[0]).not.toHaveProperty(
      "assetDefinitionId",
    );
    expect(wrapper.get(".wallet-balance-value").text()).toBe("0");
    expect(useSessionStore().connection.assetDefinitionId).toBe(
      STALE_ASSET_DEFINITION_ID,
    );
  });

  it("does not relabel an unrelated holding when the filtered asset page is empty", async () => {
    fetchAccountAssetsMock
      .mockResolvedValueOnce({
        items: [],
        total: 0,
      })
      .mockResolvedValueOnce({
        items: [
          {
            asset_id: ALICE_OTHER_HOLDING_ID,
            quantity: "25000",
          },
        ],
        total: 1,
      });

    const wrapper = mountView(STALE_ASSET_DEFINITION_ID);
    await flushPromises();

    expect(fetchAccountAssetsMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        assetDefinitionId: STALE_ASSET_DEFINITION_ID,
        limit: 8,
      }),
    );
    expect(fetchAccountAssetsMock.mock.calls[1]?.[0]).not.toHaveProperty(
      "assetDefinitionId",
    );
    expect(wrapper.get(".wallet-balance-value").text()).toBe("0");
    expect(useSessionStore().connection.assetDefinitionId).toBe(
      STALE_ASSET_DEFINITION_ID,
    );
  });

  it("shows the read-only private-note balance recovered by the wallet", async () => {
    fetchAccountAssetsMock.mockResolvedValue({
      items: [
        {
          asset_id: ALICE_XOR_HOLDING_ID,
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
          authority: ALICE_ACCOUNT_ID,
          instructions: [],
        },
      ],
      total: 1,
    });
    getConfidentialAssetBalanceMock.mockResolvedValue(
      confidentialBalanceFixture({
        resolvedAssetId: XOR_ASSET_DEFINITION_ID,
        quantity: "9",
        onChainQuantity: "9",
        spendableQuantity: "9",
        recoveredNoteCount: 1,
      }),
    );

    const wrapper = mountView(XOR_ASSET_DEFINITION_ID);
    await flushPromises();

    expect(wrapper.text()).toContain(t("Private balance"));
    expect(wrapper.text()).toContain(XOR_ASSET_DEFINITION_ID);
    expect(wrapper.text()).toContain("22");
    expect(wrapper.text()).toContain("9");
    const scrollableTables = wrapper.findAll(
      '.table-wrap[role="region"][tabindex="0"]',
    );
    expect(scrollableTables).toHaveLength(2);
    expect(
      scrollableTables.map((region) => region.attributes("aria-label")),
    ).toEqual([t("Assets"), t("Latest Transactions")]);
  });

  it("keeps the faucet action ahead of the private-balance reader in the wallet summary", async () => {
    fetchAccountAssetsMock.mockResolvedValue({
      items: [
        {
          asset_id: ALICE_XOR_HOLDING_ID,
          quantity: "22",
        },
      ],
      total: 1,
    });

    const wrapper = mountView(XOR_ASSET_DEFINITION_ID);
    await flushPromises();

    const summaryHtml = wrapper.get(".wallet-summary-card").html();
    expect(summaryHtml.indexOf("wallet-next-step")).toBeGreaterThan(-1);
    expect(summaryHtml.indexOf("wallet-shield-panel")).toBeGreaterThan(-1);
    expect(summaryHtml.indexOf("wallet-next-step")).toBeLessThan(
      summaryHtml.indexOf("wallet-shield-panel"),
    );
  });

  it("hides private-balance recovery for unfunded wallets", async () => {
    fetchAccountAssetsMock.mockResolvedValueOnce({
      items: [],
      total: 0,
    });

    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.find(".wallet-shield-panel").exists()).toBe(false);
  });

  it("skips confidential balance reads for unfunded local wallets without a funded asset id", async () => {
    fetchAccountAssetsMock.mockResolvedValueOnce({
      items: [],
      total: 0,
    });

    const wrapper = mountView("", { localOnly: true });
    await flushPromises();

    expect(getConfidentialAssetBalanceMock).not.toHaveBeenCalled();
    expect(wrapper.text()).not.toContain(
      t("Wallet data is unavailable until this account exists on-chain."),
    );
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
      .find((link) => link.text().includes(t("Send")))!;
    expect(sendLink.attributes("aria-disabled")).toBe("true");
    expect(sendLink.attributes("href")).toBeUndefined();
  });

  it("shows the private-note warning when wallet recovery is inexact", async () => {
    fetchAccountAssetsMock.mockResolvedValue({
      items: [
        {
          asset_id: ALICE_XOR_HOLDING_ID,
          quantity: "22",
        },
      ],
      total: 1,
    });
    getConfidentialAssetBalanceMock.mockResolvedValue(
      confidentialBalanceFixture({
        resolvedAssetId: XOR_ASSET_DEFINITION_ID,
        quantity: "4",
        onChainQuantity: null,
        spendableQuantity: "4",
        exact: false,
        recoveredNoteCount: 1,
      }),
    );

    const wrapper = mountView(XOR_ASSET_DEFINITION_ID);
    await flushPromises();

    expect(wrapper.text()).toContain(
      t(
        "Showing private notes recognized by this wallet. Older or foreign confidential outputs may be missing, so this total is not guaranteed complete or spendable in this release.",
      ),
    );
  });

  it("rescans recoverable private notes on demand", async () => {
    fetchAccountAssetsMock.mockResolvedValue({
      items: [
        {
          asset_id: ALICE_XOR_HOLDING_ID,
          quantity: "22",
        },
      ],
      total: 1,
    });

    const wrapper = mountView(XOR_ASSET_DEFINITION_ID);
    await flushPromises();

    await wrapper
      .findAll("button.secondary")
      .find((button) => button.text().includes(t("Rescan private balance")))!
      .trigger("click");
    await flushPromises();

    expect(scanConfidentialWalletMock).toHaveBeenCalledWith({
      toriiUrl: "http://localhost:8080",
      chainId: "chain",
      networkPrefix: 369,
      accountId: "testuAliceCanonicalAccount1234567890",
      assetDefinitionId: XOR_ASSET_DEFINITION_ID,
    });
    expect(scanConfidentialWalletMock.mock.calls[0]?.[0]).not.toHaveProperty(
      "privateKeyHex",
    );
    expect(wrapper.text()).toContain(t("Private note scan complete."));
    expect(wrapper.text()).toContain("7");
    expect(wrapper.text()).toContain("block 42");
  });

  it("keeps the exact configured asset instead of guessing from another positive holding", async () => {
    fetchAccountAssetsMock.mockResolvedValue({
      items: [
        {
          asset_id: CACHED_ASSET_DEFINITION_ID,
          quantity: "25000",
        },
        {
          asset_id: ALICE_XOR_HOLDING_ID,
          quantity: "75000",
        },
      ],
      total: 2,
    });

    const wrapper = mountView(CACHED_ASSET_DEFINITION_ID);
    await flushPromises();

    expect(wrapper.get(".wallet-balance-value").text()).toBe("25000");
    expect(wrapper.get(".wallet-balance-asset").text()).toBe(
      CACHED_ASSET_DEFINITION_ID,
    );
  });

  it("does not replace a configured asset with an unrelated positive bucket", async () => {
    fetchAccountAssetsMock.mockResolvedValue({
      items: [
        {
          asset_id: ALICE_OTHER_HOLDING_ID,
          quantity: "25000",
        },
      ],
      total: 1,
    });

    mountView(XOR_ASSET_DEFINITION_ID);
    await flushPromises();

    expect(useSessionStore().connection.assetDefinitionId).toBe(
      XOR_ASSET_DEFINITION_ID,
    );
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
      .find((button) => button.text().includes(t("Request XOR")))!;

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
          asset_id: "61CtjvNd9T3THAR65GsMVHr82Bjc",
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
      account_id: "testuAliceCanonicalAccount1234567890",
      asset_definition_id: "61CtjvNd9T3THAR65GsMVHr82Bjc",
      asset_id: "61CtjvNd9T3THAR65GsMVHr82Bjc",
      amount: "25000",
      tx_hash_hex: "0xabc",
      status: "QUEUED",
    });

    const wrapper = mountView("");
    await flushPromises();

    await wrapper
      .findAll("button")
      .find((button) => button.text().includes(t("Request XOR")))!
      .trigger("click");
    await flushPromises();

    const session = useSessionStore();
    expect(requestFaucetFundsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        toriiUrl: "http://localhost:8080",
        accountId: "testuAliceCanonicalAccount1234567890",
        networkPrefix: 369,
        requestId: expect.stringMatching(/^wallet-faucet-/),
      }),
      expect.any(Function),
    );
    expect(session.connection.assetDefinitionId).toBe(
      "61CtjvNd9T3THAR65GsMVHr82Bjc",
    );
    expect(session.activeAccount?.localOnly).toBe(false);
    expect(wrapper.text()).toContain(
      t("XOR requested: {hash}", { hash: "0xabc" }),
    );
    expect(wrapper.text()).toContain(
      formatAssetDefinitionLabel("61CtjvNd9T3THAR65GsMVHr82Bjc"),
    );
    expect(wrapper.text()).toContain("25000");
  });

  it("ignores a delayed faucet completion after endpoint, chain, prefix, and account switch", async () => {
    fetchAccountAssetsMock.mockImplementation(
      async (input: { accountId: string }) => {
        if (input.accountId === "testuBobCanonicalAccount1234567890") {
          throw new Error("Account not found");
        }
        return { items: [], total: 0 };
      },
    );
    let resolveFaucet!: (value: FaucetResponseFixture) => void;
    requestFaucetFundsMock.mockReturnValueOnce(
      new Promise<FaucetResponseFixture>((resolve) => {
        resolveFaucet = resolve;
      }),
    );

    const wrapper = mountView("", { localOnly: true });
    await flushPromises();
    await wrapper
      .findAll("button")
      .find((button) => button.text().includes(t("Request XOR")))!
      .trigger("click");
    await flushPromises();

    const session = useSessionStore();
    const alice = session.accounts[0];
    session.$patch({
      connection: {
        toriiUrl: "https://network-b.example",
        chainId: "chain-b",
        assetDefinitionId: CACHED_ASSET_DEFINITION_ID,
        networkPrefix: 753,
      },
      accounts: [
        { ...alice, localOnly: true },
        {
          displayName: "Bob",
          domain: "wonderland",
          accountId: "testuBobCanonicalAccount1234567890",
          publicKeyHex: "ef".repeat(32),
          hasStoredSecret: true,
          localOnly: true,
        },
      ],
      activeAccountId: "testuBobCanonicalAccount1234567890",
    });
    resolveFaucet({
      account_id: "testuAliceCanonicalAccount1234567890",
      asset_definition_id: OTHER_ASSET_DEFINITION_ID,
      asset_id: OTHER_ASSET_DEFINITION_ID,
      amount: "25000",
      tx_hash_hex: "0xalice-faucet",
      status: "Committed",
    });
    await flushPromises();
    await flushPromises();

    expect(session.connection).toMatchObject({
      toriiUrl: "https://network-b.example",
      chainId: "chain-b",
      networkPrefix: 753,
      assetDefinitionId: CACHED_ASSET_DEFINITION_ID,
    });
    expect(session.activeAccount?.accountId).toBe(
      "testuBobCanonicalAccount1234567890",
    );
    expect(session.activeAccount?.localOnly).toBe(true);
    expect(wrapper.text()).not.toContain("0xalice-faucet");
    expect(getOpenDialog()).toBeNull();
  });

  it("switches known Minamoto faucet clicks to TAIRA before claiming", async () => {
    installAccountAddressDeriver();
    const fundedAssets = {
      items: [
        {
          asset_id: "61CtjvNd9T3THAR65GsMVHr82Bjc",
          quantity: "25000",
        },
      ],
      total: 1,
    };
    fetchAccountAssetsMock.mockResolvedValue(fundedAssets);
    requestFaucetFundsMock.mockResolvedValue({
      account_id: "testuLegacyVisibleAccount1234567890",
      asset_definition_id: "61CtjvNd9T3THAR65GsMVHr82Bjc",
      asset_id: "61CtjvNd9T3THAR65GsMVHr82Bjc",
      amount: "25000",
      tx_hash_hex: "0xabc",
      status: "Committed",
    });

    const wrapper = mountView("", {
      connection: MINAMOTO_CHAIN_PRESET.connection,
      account: {
        accountId: "sorauLegacyVisibleAccount1234567890",
        i105AccountId: "",
        i105DefaultAccountId: "sorauLegacyVisibleAccount1234567890",
      },
    });
    await flushPromises();

    expect(wrapper.text()).toContain(
      t(
        "Minamoto mainnet has no faucet. Use TAIRA testnet to request starter XOR.",
      ),
    );

    await wrapper
      .findAll("button")
      .find((button) => button.text().includes(t("Use TAIRA faucet")))!
      .trigger("click");
    await flushPromises();
    await flushPromises();

    const session = useSessionStore();
    expect(session.connection.toriiUrl).toBe(
      TAIRA_CHAIN_PRESET.connection.toriiUrl,
    );
    expect(requestFaucetFundsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        toriiUrl: TAIRA_CHAIN_PRESET.connection.toriiUrl,
        accountId: "testuLegacyVisibleAccount1234567890",
        networkPrefix: TAIRA_CHAIN_PRESET.connection.networkPrefix,
        requestId: expect.stringMatching(/^wallet-faucet-/),
      }),
      expect.any(Function),
    );
  });

  it("does not classify a hostname-only Minamoto override as the mainnet preset", async () => {
    const wrapper = mountView("", {
      connection: {
        toriiUrl: MINAMOTO_CHAIN_PRESET.connection.toriiUrl,
        chainId: "different-chain",
        networkPrefix: 369,
        assetDefinitionId: "",
      },
    });
    await flushPromises();

    expect(wrapper.text()).not.toContain(
      t(
        "Minamoto mainnet has no faucet. Use TAIRA testnet to request starter XOR.",
      ),
    );
    expect(
      wrapper
        .findAll("button")
        .some((button) => button.text().includes(t("Request XOR"))),
    ).toBe(true);
  });

  it("falls back to the funded asset reference when faucet omits the definition id", async () => {
    const fundedAssets = {
      items: [
        {
          asset_id: ALICE_OTHER_HOLDING_ID,
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
      account_id: "testuAliceCanonicalAccount1234567890",
      asset_definition_id: "",
      asset_id: ALICE_OTHER_HOLDING_ID,
      amount: "25000",
      tx_hash_hex: "0xabc",
      status: "QUEUED",
    });

    const wrapper = mountView("");
    await flushPromises();

    await wrapper
      .findAll("button")
      .find((button) => button.text().includes(t("Request XOR")))!
      .trigger("click");
    await flushPromises();

    expect(useSessionStore().connection.assetDefinitionId).toBe(
      "61CtjvNd9T3THAR65GsMVHr82Bjc",
    );
  });

  it("recognizes TAIRA split-field balances after faucet claim", async () => {
    const fundedAssets = {
      items: [
        {
          asset_id:
            "61CtjvNd9T3THAR65GsMVHr82Bjc#testuLegacyVisibleAccount1234567890",
          asset_definition_id: "61CtjvNd9T3THAR65GsMVHr82Bjc",
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
      account_id: "testuLegacyVisibleAccount1234567890",
      asset_definition_id: "61CtjvNd9T3THAR65GsMVHr82Bjc",
      asset_id: "61CtjvNd9T3THAR65GsMVHr82Bjc",
      amount: "25000",
      tx_hash_hex: "0xabc",
      status: "Committed",
    });

    const wrapper = mountView("", {
      account: {
        accountId: "testuLegacyVisibleAccount1234567890",
        i105AccountId: "testuLegacyVisibleAccount1234567890",
      },
    });
    await flushPromises();

    await wrapper
      .findAll("button")
      .find((button) => button.text().includes(t("Request XOR")))!
      .trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("25000");
    expect(wrapper.text()).not.toContain(
      t(
        "Faucet transaction finalized, but wallet balances are still indexing. Refresh again in a few seconds.",
      ),
    );
  });

  it("replaces a stale configured asset definition from the faucet response before balances refresh", async () => {
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
      account_id: "testuAliceCanonicalAccount1234567890",
      asset_definition_id: "61CtjvNd9T3THAR65GsMVHr82Bjc",
      asset_id: "61CtjvNd9T3THAR65GsMVHr82Bjc",
      amount: "25000",
      tx_hash_hex: "0xabc",
      status: "QUEUED",
    });

    const wrapper = mountView(XOR_ASSET_DEFINITION_ID);
    await flushPromises();

    await wrapper
      .findAll("button")
      .find((button) => button.text().includes(t("Request XOR")))!
      .trigger("click");
    await flushPromises();

    expect(useSessionStore().connection.assetDefinitionId).toBe(
      "61CtjvNd9T3THAR65GsMVHr82Bjc",
    );
  });

  it("re-derives a runtime account through the SDK before a TAIRA faucet request", async () => {
    installAccountAddressDeriver();
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
      asset_id: "61CtjvNd9T3THAR65GsMVHr82Bjc",
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
      .find((button) => button.text().includes(t("Request XOR")))!
      .trigger("click");
    await flushPromises();

    expect(requestFaucetFundsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        toriiUrl: "http://localhost:8080",
        accountId: "testuLegacyVisibleAccount1234567890",
        networkPrefix: 369,
        requestId: expect.stringMatching(/^wallet-faucet-/),
      }),
      expect.any(Function),
    );
  });

  it("keeps faucet claims enabled after the configured faucet asset already has a positive balance", async () => {
    fetchAccountAssetsMock.mockResolvedValueOnce({
      items: [
        {
          asset_id: XOR_ASSET_DEFINITION_ID,
          quantity: "25000",
        },
      ],
      total: 1,
    });

    const wrapper = mountView(XOR_ASSET_DEFINITION_ID);
    await flushPromises();

    const faucetButton = wrapper
      .findAll("button")
      .find((button) => button.text().includes(t("Request XOR")))!;

    expect(faucetButton.attributes("disabled")).toBeUndefined();
  });

  it("shows a blocking faucet status modal while a claim is in flight", async () => {
    vi.useFakeTimers();
    const fundedAssets = {
      items: [
        {
          asset_id: "61CtjvNd9T3THAR65GsMVHr82Bjc",
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
      .find((button) => button.text().includes(t("Request XOR")))!
      .trigger("click");
    await flushPromises();

    expect(getOpenDialog()).not.toBeNull();
    expect(getOpenDialog()?.textContent).toContain(
      t("Faucet request in progress"),
    );
    expect(getOpenDialog()?.textContent).toContain(
      t("Solving faucet proof-of-work…"),
    );

    resolveFaucet({
      account_id: "testuAliceCanonicalAccount1234567890",
      asset_definition_id: "61CtjvNd9T3THAR65GsMVHr82Bjc",
      asset_id: "61CtjvNd9T3THAR65GsMVHr82Bjc",
      amount: "25000",
      tx_hash_hex: "0xabc",
      status: "QUEUED",
    });
    await flushPromises();
    await vi.advanceTimersByTimeAsync(1_500);
    await flushPromises();

    expect(getOpenDialog()).toBeNull();
  });

  it("lets the user cancel an in-flight faucet request", async () => {
    let rejectFaucet: (error: Error) => void = () => {};
    requestFaucetFundsMock.mockImplementation(
      async (_input: unknown, onProgress?: (progress: any) => void) => {
        onProgress?.({ phase: "solvingPuzzle" });
        return new Promise<FaucetResponseFixture>((_resolve, reject) => {
          rejectFaucet = reject;
        });
      },
    );
    cancelFaucetRequestMock.mockImplementation(async () => {
      const error = new Error("Faucet request canceled.");
      error.name = "AbortError";
      rejectFaucet(error);
      return { canceled: true };
    });

    const wrapper = mountView("");
    await flushPromises();

    await wrapper
      .findAll("button")
      .find((button) => button.text().includes(t("Request XOR")))!
      .trigger("click");
    await flushPromises();

    const requestId = requestFaucetFundsMock.mock.calls[0][0].requestId;
    expect(getOpenDialog()).not.toBeNull();
    expect(getOpenDialog()?.textContent).toContain(t("Cancel"));

    const cancelButton = Array.from(
      getOpenDialog()?.querySelectorAll("button") ?? [],
    ).find((button) => button.textContent?.includes(t("Cancel")));
    cancelButton?.click();
    await flushPromises();

    expect(cancelFaucetRequestMock).toHaveBeenCalledWith({ requestId });
    expect(getOpenDialog()).toBeNull();
    expect(wrapper.text()).toContain(t("Faucet request canceled."));
    expect(wrapper.text()).not.toContain(t("Failed to request faucet funds."));
  });

  it("keeps polling wallet refresh until the funded faucet asset appears", async () => {
    vi.useFakeTimers();
    const fundedAssets = {
      items: [
        {
          asset_id: "61CtjvNd9T3THAR65GsMVHr82Bjc",
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
      account_id: "testuAliceCanonicalAccount1234567890",
      asset_definition_id: "61CtjvNd9T3THAR65GsMVHr82Bjc",
      asset_id: "61CtjvNd9T3THAR65GsMVHr82Bjc",
      amount: "25000",
      tx_hash_hex: "0xabc",
      status: "QUEUED",
    });

    const wrapper = mountView("");
    await flushPromises();

    await wrapper
      .findAll("button")
      .find((button) => button.text().includes(t("Request XOR")))!
      .trigger("click");
    await flushPromises();
    await vi.advanceTimersByTimeAsync(3_000);
    await flushPromises();
    await flushPromises();

    expect(fetchAccountAssetsMock).toHaveBeenCalledTimes(4);
    expect(wrapper.text()).toContain(
      formatAssetDefinitionLabel("61CtjvNd9T3THAR65GsMVHr82Bjc"),
    );
    expect(wrapper.text()).toContain("25000");
  });

  it("shows an indexing fallback message when the funded asset is not visible yet", async () => {
    vi.useFakeTimers();
    fetchAccountAssetsMock.mockResolvedValue({
      items: [],
      total: 0,
    });
    requestFaucetFundsMock.mockResolvedValue({
      account_id: "testuAliceCanonicalAccount1234567890",
      asset_definition_id: "61CtjvNd9T3THAR65GsMVHr82Bjc",
      asset_id: "61CtjvNd9T3THAR65GsMVHr82Bjc",
      amount: "25000",
      tx_hash_hex: "0xabc",
      status: "Committed",
    });

    const wrapper = mountView("");
    await flushPromises();

    await wrapper
      .findAll("button")
      .find((button) => button.text().includes(t("Request XOR")))!
      .trigger("click");
    await flushPromises();
    await vi.advanceTimersByTimeAsync(4_500);
    await flushPromises();
    await flushPromises();

    expect(wrapper.text()).toContain(
      t(
        "Faucet transaction finalized, but wallet balances are still indexing. Refresh again in a few seconds.",
      ),
    );
  });

  it("keeps local-only missing accounts as an empty wallet instead of a failed refresh", async () => {
    fetchAccountAssetsMock.mockRejectedValueOnce(
      new Error("Account not found"),
    );

    const wrapper = mountView(XOR_ASSET_DEFINITION_ID, { localOnly: true });
    await flushPromises();

    expect(wrapper.text()).toContain(
      t(
        "This wallet is saved locally. If the account is not live on-chain yet, balances and transfers can stay empty until it is funded or otherwise created on-chain.",
      ),
    );
    expect(wrapper.text()).not.toContain("Account not found");
    expect(wrapper.text()).not.toContain(
      t("Wallet data is unavailable until this account exists on-chain."),
    );
  });

  it("keeps standard assets visible but marks private balance unavailable when its read fails", async () => {
    const consoleWarnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    try {
      fetchAccountAssetsMock.mockResolvedValueOnce({
        items: [
          {
            asset_id: ALICE_OTHER_HOLDING_ID,
            quantity: "25000",
          },
        ],
        total: 1,
      });
      getConfidentialAssetBalanceMock.mockRejectedValueOnce(
        new Error(
          "Confidential asset policy request failed with status 404 (Not Found)",
        ),
      );

      const wrapper = mountView("61CtjvNd9T3THAR65GsMVHr82Bjc", {
        localOnly: false,
      });
      await flushPromises();
      await flushPromises();

      expect(wrapper.get(".wallet-balance-value").text()).toBe("25000");
      expect(wrapper.find(".wallet-shield-panel").exists()).toBe(true);
      expect(wrapper.text()).not.toContain(
        t("No assets found for this account."),
      );
      expect(wrapper.get(".wallet-shield-balance").text()).toBe(
        t("Unavailable"),
      );
      expect(wrapper.text()).toContain(
        "Confidential asset policy request failed",
      );
      expect(wrapper.text()).not.toContain(
        t(
          "Recovered {count} private note(s) from {source} through {watermark}.",
          {
            count: 0,
            source: t("account history fallback"),
            watermark: t("current available history"),
          },
        ),
      );
    } finally {
      consoleWarnSpy.mockRestore();
    }
  });

  it("clears the local-only flag once on-chain wallet data loads", async () => {
    fetchAccountAssetsMock.mockResolvedValueOnce({
      items: [],
      total: 0,
    });

    mountView(XOR_ASSET_DEFINITION_ID, { localOnly: true });
    await flushPromises();

    expect(useSessionStore().activeAccount?.localOnly).toBe(false);
  });
  it("keeps confidential balance recovery read-only", async () => {
    fetchAccountAssetsMock.mockResolvedValue({
      items: [
        {
          asset_id: ALICE_XOR_HOLDING_ID,
          quantity: "22",
        },
      ],
      total: 1,
    });

    const wrapper = mountView(XOR_ASSET_DEFINITION_ID);
    await flushPromises();

    expect(wrapper.find(".wallet-shield-panel").exists()).toBe(true);
    expect(wrapper.find(".wallet-shield-input").exists()).toBe(false);
    expect(wrapper.text()).not.toContain("Move to private balance");
    expect(
      wrapper
        .findAll("button.secondary")
        .some((button) => button.text().includes(t("Rescan private balance"))),
    ).toBe(true);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import SendView from "@/views/SendView.vue";
import { translate } from "@/i18n/messages";
import { useEndpointStore } from "@/stores/endpoint";
import { useSessionStore } from "@/stores/session";
import type {
  EndpointFeatureAvailability,
  EndpointInspection,
} from "@/types/endpointInspection";
import { formatAssetDefinitionLabel } from "@/utils/assetId";
import { unpinnedNetworkIdentity } from "./helpers/networkIdentityFixture";

const ALICE_I105_ACCOUNT_ID = "testuAliceRealI105AccountId";
const BOB_I105_ACCOUNT_ID = "testuBobRealI105AccountId";
const ASSET_DEFINITION_ID = "6TEAJqbb8oEPmLncoNiMRbLEK6tw";
const ASSET_HOLDING_ID = `${ASSET_DEFINITION_ID}#${ALICE_I105_ACCOUNT_ID}`;
const DESTINATION_ACCOUNT_SELECTOR =
  'input[data-testid="destination-account-input"]';
const SEND_REVIEW_SELECTOR = '[data-testid="send-review-button"]';
const SEND_CONFIRM_SELECTOR = '[data-testid="send-confirm-button"]';

const fetchAccountAssetsMock = vi.fn();
const transferAssetMock = vi.fn();
const resolveAccountAliasMock = vi.fn();

vi.mock("@/services/iroha", () => ({
  fetchAccountAssets: (input: unknown) => fetchAccountAssetsMock(input),
  resolveAccountAlias: (input: unknown) => resolveAccountAliasMock(input),
  transferAsset: (input: unknown) => transferAssetMock(input),
}));

const t = (key: string, params?: Record<string, string | number>) =>
  translate("en-US", key, params);
const finalizedResult = (hash: string) => ({
  hash,
  finality: {
    status: "finalized" as const,
    transactionHash: hash,
    blockHeight: 17,
    blockHash: "ef".repeat(32),
    finalizedBlockHeight: 17,
  },
});

describe("SendView", () => {
  beforeEach(() => {
    document.body
      .querySelectorAll("dialog.ui-dialog")
      .forEach((dialog) => dialog.remove());
    localStorage.clear();
    fetchAccountAssetsMock.mockReset();
    transferAssetMock.mockReset();
    resolveAccountAliasMock.mockReset();
    resolveAccountAliasMock.mockImplementation(
      async (input: { alias?: string }) => ({
        alias: "",
        accountId: String(input.alias ?? "").trim(),
        resolved: false,
      }),
    );
    fetchAccountAssetsMock.mockResolvedValue({
      items: [
        {
          asset_id: ASSET_HOLDING_ID,
          quantity: "42",
        },
      ],
      total: 1,
    });
    setActivePinia(createPinia());
  });

  const mountView = (
    assetDefinitionId = ASSET_DEFINITION_ID,
    endpointOptions: {
      writeAllowed?: boolean;
      assetTransfers?: boolean;
    } = {},
  ) => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const session = useSessionStore();
    session.$patch({
      connection: {
        toriiUrl: "http://localhost:8080",
        chainId: "chain",
        assetDefinitionId,
        networkPrefix: 369,
      },
      accounts: [
        {
          displayName: "Alice",
          domain: "default",
          accountId: ALICE_I105_ACCOUNT_ID,
          i105AccountId: ALICE_I105_ACCOUNT_ID,
          publicKeyHex: "ab".repeat(32),
          hasStoredSecret: true,
        },
      ],
      activeAccountId: ALICE_I105_ACCOUNT_ID,
    });
    const feature = (supported = true): EndpointFeatureAvailability => ({
      supported,
      source: "openapi",
      requiredOperations: [],
      missingOperations: supported ? [] : ["POST /missing"],
    });
    const writeAllowed = endpointOptions.writeAllowed !== false;
    const endpointStore = useEndpointStore();
    endpointStore.$patch({
      state: "ready",
      inspection: {
        schema: "iroha.wallet.endpoint-inspection.v1",
        toriiUrl: "http://localhost:8080",
        expected: { chainId: "chain", networkPrefix: 369 },
        observed: { chainId: "chain", networkPrefix: 369 },
        identityStatus: writeAllowed ? "matched" : "unverified",
        accessMode: writeAllowed ? "read-write" : "read-only",
        checkedAtMs: 1,
        evidence: [],
        networkIdentity: unpinnedNetworkIdentity(),
        features: {
          accountRegistration: feature(),
          accountOnboarding: feature(),
          assetTransfers: feature(endpointOptions.assetTransfers !== false),
          faucetClaim: feature(),
          kaigiMeetings: feature(),
          governanceWrites: feature(),
          stakingWrites: feature(),
          subscriptionWrites: feature(),
          soraCloudHfSharedLease: feature(),
          vpnSessions: feature(),
          irohaConnectSessions: feature(),
        },
        diagnostic: writeAllowed
          ? {
              code: "endpoint_identity_matched",
              message: "Endpoint identity matches the configured network.",
            }
          : {
              code: "endpoint_identity_unverified",
              message: "Endpoint identity is unverified.",
            },
      } satisfies EndpointInspection,
      error: "",
    });
    return mount(SendView, {
      global: {
        plugins: [pinia],
      },
    });
  };

  const reviewTransfer = async (wrapper: ReturnType<typeof mountView>) => {
    await wrapper.get(SEND_REVIEW_SELECTOR).trigger("click");
    await flushPromises();
  };

  const reviewAndConfirmTransfer = async (
    wrapper: ReturnType<typeof mountView>,
  ) => {
    await reviewTransfer(wrapper);
    await wrapper.get(SEND_CONFIRM_SELECTOR).trigger("click");
    await flushPromises();
  };

  it("shows transfer-specific success text for transparent sends", async () => {
    transferAssetMock.mockResolvedValue(finalizedResult("0x123"));
    const wrapper = mountView();
    await flushPromises();

    await wrapper
      .get(DESTINATION_ACCOUNT_SELECTOR)
      .setValue(BOB_I105_ACCOUNT_ID);
    await wrapper.get('input[type="number"]').setValue("2");
    await reviewAndConfirmTransfer(wrapper);

    expect(wrapper.text()).toContain(
      t("Transaction finalized on-chain: {hash}", { hash: "0x123" }),
    );
    expect(wrapper.get(".send-status").classes()).toContain(
      "send-status-success",
    );
    expect(wrapper.get(".send-status").attributes("role")).toBe("status");
  });

  it("keeps transfer review disabled while endpoint writes are read-only", async () => {
    const wrapper = mountView(ASSET_DEFINITION_ID, {
      writeAllowed: false,
    });
    await flushPromises();

    await wrapper
      .get(DESTINATION_ACCOUNT_SELECTOR)
      .setValue(BOB_I105_ACCOUNT_ID);
    await wrapper.get('input[type="number"]').setValue("2");

    expect(wrapper.get(SEND_REVIEW_SELECTOR).attributes("disabled")).toBe("");
    expect(wrapper.get('[data-testid="send-write-prerequisite"]').text()).toBe(
      "Endpoint identity is unverified.",
    );
    expect(transferAssetMock).not.toHaveBeenCalled();
  });

  it("requires review before a valid transfer is submitted", async () => {
    transferAssetMock.mockResolvedValue(finalizedResult("0xreviewed"));
    const wrapper = mountView();
    await flushPromises();

    await wrapper
      .get(DESTINATION_ACCOUNT_SELECTOR)
      .setValue(BOB_I105_ACCOUNT_ID);
    await wrapper.get('input[type="number"]').setValue("2");

    await reviewTransfer(wrapper);

    expect(transferAssetMock).not.toHaveBeenCalled();
    expect(wrapper.find(SEND_CONFIRM_SELECTOR).exists()).toBe(true);
    expect(wrapper.get(".send-review-list").text()).toContain(
      BOB_I105_ACCOUNT_ID,
    );

    await wrapper.get(SEND_CONFIRM_SELECTOR).trigger("click");
    await flushPromises();

    expect(transferAssetMock).toHaveBeenCalledTimes(1);
  });

  it("submits only one bounded canonical memo field", async () => {
    transferAssetMock.mockResolvedValue(finalizedResult("0xmemo"));
    const wrapper = mountView();
    await flushPromises();

    await wrapper
      .get(DESTINATION_ACCOUNT_SELECTOR)
      .setValue(BOB_I105_ACCOUNT_ID);
    await wrapper.get('input[type="number"]').setValue("2");
    await wrapper.get('[data-testid="send-memo-input"]').setValue("invoice-7");
    await reviewAndConfirmTransfer(wrapper);

    expect(transferAssetMock).toHaveBeenCalledWith(
      expect.objectContaining({ memo: "invoice-7" }),
    );
    expect(transferAssetMock.mock.calls[0]?.[0]).not.toHaveProperty("metadata");
  });

  it("rejects noncanonical or oversized UTF-8 memos before review", async () => {
    const wrapper = mountView();
    await flushPromises();
    await wrapper
      .get(DESTINATION_ACCOUNT_SELECTOR)
      .setValue(BOB_I105_ACCOUNT_ID);
    await wrapper.get('input[type="number"]').setValue("2");
    const memo = wrapper.get('[data-testid="send-memo-input"]');

    await memo.setValue(" padded ");
    expect(wrapper.get(SEND_REVIEW_SELECTOR).attributes("disabled")).toBe("");

    await memo.setValue("界".repeat(400));
    expect(wrapper.get(SEND_REVIEW_SELECTOR).attributes("disabled")).toBe("");
    expect(transferAssetMock).not.toHaveBeenCalled();
  });

  it("refreshes the displayed balance after successful transparent sends", async () => {
    fetchAccountAssetsMock
      .mockResolvedValueOnce({
        items: [
          {
            asset_id: ASSET_HOLDING_ID,
            quantity: "42",
          },
        ],
        total: 1,
      })
      .mockResolvedValueOnce({
        items: [
          {
            asset_id: ASSET_HOLDING_ID,
            quantity: "40",
          },
        ],
        total: 1,
      });
    transferAssetMock.mockResolvedValue(finalizedResult("0xrefresh"));
    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.text()).toContain("42");

    await wrapper
      .get(DESTINATION_ACCOUNT_SELECTOR)
      .setValue(BOB_I105_ACCOUNT_ID);
    await wrapper.get('input[type="number"]').setValue("2");
    await reviewAndConfirmTransfer(wrapper);

    expect(fetchAccountAssetsMock).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain("40");
  });

  it("marks rejected transactions as error feedback", async () => {
    const rejectedMessage =
      "Transaction 23479912c2cb8a929bb96246163cb95b30dd6e9766b209338e44d0fdf8e01c2b rejected before it committed.";
    transferAssetMock.mockRejectedValue(new Error(rejectedMessage));
    const wrapper = mountView();
    await flushPromises();

    await wrapper
      .get(DESTINATION_ACCOUNT_SELECTOR)
      .setValue(BOB_I105_ACCOUNT_ID);
    await wrapper.get('input[type="number"]').setValue("2");
    await reviewAndConfirmTransfer(wrapper);

    const status = wrapper.get(".send-status");
    expect(status.text()).toContain(rejectedMessage);
    expect(status.classes()).toContain("send-status-error");
    expect(status.attributes("role")).toBe("alert");
  });

  it("trims transparent destination before submit", async () => {
    transferAssetMock.mockResolvedValue(finalizedResult("0xdef"));
    const wrapper = mountView();
    await flushPromises();

    await wrapper
      .get(DESTINATION_ACCOUNT_SELECTOR)
      .setValue(` ${BOB_I105_ACCOUNT_ID} `);
    await wrapper.get('input[type="number"]').setValue("2");
    await reviewAndConfirmTransfer(wrapper);

    expect(transferAssetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        destinationAccountId: BOB_I105_ACCOUNT_ID,
      }),
    );
    expect(transferAssetMock.mock.calls[0]?.[0]).not.toHaveProperty("shielded");
  });

  it("resolves recipient aliases before transparent sends", async () => {
    resolveAccountAliasMock.mockResolvedValueOnce({
      alias: "bob@universal",
      accountId: BOB_I105_ACCOUNT_ID,
      resolved: true,
      source: "on_chain",
    });
    transferAssetMock.mockResolvedValue(finalizedResult("0xalias"));
    const wrapper = mountView();
    await flushPromises();

    await wrapper.get(DESTINATION_ACCOUNT_SELECTOR).setValue("bob@universal");
    await wrapper.get('input[type="number"]').setValue("2");
    await reviewAndConfirmTransfer(wrapper);

    expect(resolveAccountAliasMock).toHaveBeenCalledWith({
      toriiUrl: "http://localhost:8080",
      alias: "bob@universal",
      networkPrefix: 369,
    });
    expect(transferAssetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        destinationAccountId: BOB_I105_ACCOUNT_ID,
        networkPrefix: 369,
      }),
    );
    expect(transferAssetMock.mock.calls[0]?.[0]).not.toHaveProperty("shielded");
    expect(wrapper.text()).toContain(
      t("Alias {alias} resolves to {accountId}.", {
        alias: "bob@universal",
        accountId: BOB_I105_ACCOUNT_ID,
      }),
    );
  });

  it("invalidates a reviewed alias when the network changes", async () => {
    const oldNetworkAccountId = "testuBobOnOldNetwork";
    const newNetworkAccountId = "sorauBobOnNewNetwork";
    let resolveNewNetworkAlias!: (value: {
      alias: string;
      accountId: string;
      resolved: boolean;
      source: string;
    }) => void;
    const newNetworkAliasResult = new Promise<{
      alias: string;
      accountId: string;
      resolved: boolean;
      source: string;
    }>((resolve) => {
      resolveNewNetworkAlias = resolve;
    });
    resolveAccountAliasMock.mockImplementation(
      async (input: { toriiUrl: string }) => {
        if (input.toriiUrl === "https://new-network.example") {
          return newNetworkAliasResult;
        }
        return {
          alias: "bob@universal",
          accountId: oldNetworkAccountId,
          resolved: true,
          source: "on_chain",
        };
      },
    );
    transferAssetMock.mockResolvedValue(finalizedResult("0xnew-network"));
    const wrapper = mountView();
    const session = useSessionStore();
    await flushPromises();

    await wrapper.get(DESTINATION_ACCOUNT_SELECTOR).setValue("bob@universal");
    await wrapper.get('input[type="number"]').setValue("2");
    await reviewTransfer(wrapper);

    expect(wrapper.get(".send-review-list").text()).toContain(
      oldNetworkAccountId,
    );
    const staleConfirmButton = wrapper.get(SEND_CONFIRM_SELECTOR);

    session.$patch({
      connection: {
        ...session.connection,
        toriiUrl: "https://new-network.example",
        chainId: "new-chain",
        networkPrefix: 753,
      },
    });
    await staleConfirmButton.trigger("click");

    expect(transferAssetMock).not.toHaveBeenCalled();
    expect(wrapper.find(SEND_CONFIRM_SELECTOR).exists()).toBe(false);

    await wrapper.get(SEND_REVIEW_SELECTOR).trigger("click");

    expect(resolveAccountAliasMock).toHaveBeenCalledWith({
      toriiUrl: "https://new-network.example",
      alias: "bob@universal",
      networkPrefix: 753,
    });
    expect(transferAssetMock).not.toHaveBeenCalled();

    resolveNewNetworkAlias({
      alias: "bob@universal",
      accountId: newNetworkAccountId,
      resolved: true,
      source: "on_chain",
    });
    await flushPromises();

    expect(wrapper.get(".send-review-list").text()).toContain(
      newNetworkAccountId,
    );
    await wrapper.get(SEND_CONFIRM_SELECTOR).trigger("click");
    await flushPromises();

    expect(transferAssetMock).toHaveBeenCalledTimes(1);
    expect(transferAssetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        toriiUrl: "https://new-network.example",
        chainId: "new-chain",
        destinationAccountId: newNetworkAccountId,
        networkPrefix: 753,
      }),
    );
  });

  it("blocks transparent sends when an alias cannot resolve", async () => {
    resolveAccountAliasMock.mockRejectedValueOnce(
      new Error('Account alias "missing@universal" was not found.'),
    );
    const wrapper = mountView();
    await flushPromises();

    await wrapper
      .get(DESTINATION_ACCOUNT_SELECTOR)
      .setValue("missing@universal");
    await wrapper.get('input[type="number"]').setValue("2");
    await reviewTransfer(wrapper);

    expect(transferAssetMock).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain(
      'Account alias "missing@universal" was not found.',
    );
  });

  it("shows the exact current asset definition label", async () => {
    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.text()).toContain(
      formatAssetDefinitionLabel(ASSET_DEFINITION_ID),
    );
  });

  it("shows the send asset balance and alias when live assets include one", async () => {
    fetchAccountAssetsMock.mockResolvedValueOnce({
      items: [
        {
          asset_id: "6TEAJqbb8oEPmLncoNiMRbLEK6tw#alice@default",
          quantity: "25000",
          asset_alias: "XOR",
        },
      ],
      total: 1,
    });
    const wrapper = mountView("6TEAJqbb8oEPmLncoNiMRbLEK6tw");
    await flushPromises();

    expect(fetchAccountAssetsMock).toHaveBeenCalledWith({
      toriiUrl: "http://localhost:8080",
      accountId: ALICE_I105_ACCOUNT_ID,
      networkPrefix: 369,
      limit: 200,
    });
    expect(wrapper.text()).toContain(t("Available balance"));
    expect(wrapper.text()).toContain("25000");
    expect(wrapper.text()).toContain("XOR");
    expect(wrapper.text()).toContain(
      formatAssetDefinitionLabel("6TEAJqbb8oEPmLncoNiMRbLEK6tw#alice@default"),
    );
  });

  it("does not show an unrelated positive holding as the configured send asset", async () => {
    fetchAccountAssetsMock.mockResolvedValueOnce({
      items: [
        {
          asset_id: "61CtjvNd9T3THAR65GsMVHr82Bjc#alice@default",
          quantity: "25000",
          asset_alias: "OTHER",
        },
      ],
      total: 1,
    });

    const wrapper = mountView("6TEAJqbb8oEPmLncoNiMRbLEK6tw");
    await flushPromises();

    expect(wrapper.get(".send-balance-value").text()).toBe("0");
    expect(wrapper.get(".send-balance-asset").text()).toBe(
      formatAssetDefinitionLabel("6TEAJqbb8oEPmLncoNiMRbLEK6tw"),
    );
    expect(wrapper.text()).not.toContain("25000");
    expect(wrapper.text()).not.toContain("OTHER");
  });

  it("shows balance unavailable and blocks review when the asset read fails", async () => {
    fetchAccountAssetsMock.mockRejectedValueOnce(
      new Error("Account assets request timed out."),
    );
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      const wrapper = mountView();
      await flushPromises();

      expect(wrapper.get(".send-balance-value").text()).toBe(t("Unavailable"));
      expect(wrapper.get('[data-testid="send-assets-error"]').text()).toBe(
        "Account assets request timed out.",
      );

      await wrapper
        .get(DESTINATION_ACCOUNT_SELECTOR)
        .setValue(BOB_I105_ACCOUNT_ID);
      await wrapper.get('input[type="number"]').setValue("2");

      expect(wrapper.get(SEND_REVIEW_SELECTOR).attributes("disabled")).toBe("");
      expect(transferAssetMock).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("fails closed when the post-submit balance refresh fails", async () => {
    fetchAccountAssetsMock
      .mockResolvedValueOnce({
        items: [
          {
            asset_id: ASSET_HOLDING_ID,
            quantity: "42",
          },
        ],
        total: 1,
      })
      .mockRejectedValueOnce(new Error("Balance refresh unavailable."));
    transferAssetMock.mockResolvedValue(finalizedResult("0xbalance-refresh"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      const wrapper = mountView();
      await flushPromises();

      await wrapper
        .get(DESTINATION_ACCOUNT_SELECTOR)
        .setValue(BOB_I105_ACCOUNT_ID);
      await wrapper.get('input[type="number"]').setValue("2");
      await reviewAndConfirmTransfer(wrapper);

      expect(transferAssetMock).toHaveBeenCalledTimes(1);
      expect(wrapper.get(".send-balance-value").text()).toBe(t("Unavailable"));
      expect(wrapper.get('[data-testid="send-assets-error"]').text()).toBe(
        "Balance refresh unavailable.",
      );
      expect(wrapper.get(SEND_REVIEW_SELECTOR).attributes("disabled")).toBe("");
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("exposes only the exact transparent transfer contract", async () => {
    transferAssetMock.mockResolvedValue(finalizedResult("0xexact"));
    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.find('[data-testid="send-mode-control"]').exists()).toBe(
      false,
    );
    expect(wrapper.text()).not.toContain(t("Scan payment QR"));

    await wrapper
      .get(DESTINATION_ACCOUNT_SELECTOR)
      .setValue(BOB_I105_ACCOUNT_ID);
    await wrapper.get('input[type="number"]').setValue("2");
    await reviewAndConfirmTransfer(wrapper);

    const payload = transferAssetMock.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    expect(Object.keys(payload).sort()).toEqual(
      [
        "accountId",
        "assetDefinitionId",
        "chainId",
        "destinationAccountId",
        "networkPrefix",
        "quantity",
        "toriiUrl",
      ].sort(),
    );
    expect(payload).not.toHaveProperty("shielded");
    expect(payload).not.toHaveProperty("unshield");
    expect(payload).not.toHaveProperty("shieldedRecipient");
  });
});

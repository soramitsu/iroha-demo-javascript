import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import StatsView from "@/views/StatsView.vue";
import { useSessionStore } from "@/stores/session";
import { translate } from "@/i18n/messages";

const getNetworkStatsMock = vi.fn();
const getGovernanceCitizenCountMock = vi.fn();

vi.mock("@/services/iroha", () => ({
  getNetworkStats: (input: unknown) => getNetworkStatsMock(input),
  getGovernanceCitizenCount: (toriiUrl: string) =>
    getGovernanceCitizenCountMock(toriiUrl),
}));

const t = (key: string, params?: Record<string, string | number>) =>
  translate("en-US", key, params);

describe("StatsView", () => {
  beforeEach(() => {
    getNetworkStatsMock.mockReset();
    getGovernanceCitizenCountMock.mockReset();
    getNetworkStatsMock.mockResolvedValue({
      collectedAtMs: Date.UTC(2026, 4, 2, 12, 0, 0),
      xorAssetDefinitionId: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
      explorer: {
        peers: 3,
        domains: 4,
        accounts: 5,
        assets: 6,
        transactionsAccepted: 10,
        transactionsRejected: 1,
        blockHeight: 100,
        blockCreatedAt: null,
        finalizedBlockHeight: 98,
        averageCommitTimeMs: 1200,
        averageBlockTimeMs: 2400,
      },
      supply: null,
      econometrics: null,
      runtime: {
        queueSize: 1,
        queueCapacity: 10,
        commitTimeMs: 1200,
        effectiveBlockTimeMs: 2400,
        txQueueSaturated: false,
        highestQcHeight: 100,
        lockedQcHeight: 99,
        currentBlockHeight: 100,
        finalizedBlockHeight: 98,
        finalizationLag: 2,
      },
      governance: {
        laneCount: 1,
        dataspaceCount: 1,
        validatorCount: 2,
      },
      warnings: [],
      partial: false,
    });
    getGovernanceCitizenCountMock.mockResolvedValue({
      total: 42,
      endpointAvailable: true,
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
        networkPrefix: 369,
      },
    });
    return mount(StatsView, {
      global: {
        plugins: [pinia],
      },
    });
  };

  it("shows the governance citizen count on the stats page", async () => {
    const wrapper = mountView();
    await flushPromises();

    const overviewCitizenCard = wrapper
      .findAll(".overview-card")
      .find((node) => node.text().includes(t("Citizens")));
    expect(overviewCitizenCard?.text()).toContain("42");
    expect(getGovernanceCitizenCountMock).toHaveBeenCalledWith(
      "http://localhost:8080",
    );
  });

  it("uses the exact citizen count endpoint instead of a lower-bound display", async () => {
    getGovernanceCitizenCountMock.mockResolvedValueOnce({
      total: 1,
      endpointAvailable: true,
    });

    const pinia = createPinia();
    setActivePinia(pinia);
    const session = useSessionStore();
    session.$patch({
      connection: {
        toriiUrl: "http://localhost:8080",
        chainId: "chain",
        assetDefinitionId: "xor#wonderland",
        networkPrefix: 369,
      },
      accounts: [
        {
          displayName: "Alice",
          domain: "wonderland",
          accountId: "alice@wonderland",
          i105AccountId: "alice@wonderland",
          i105DefaultAccountId: "alice@wonderland",
          publicKeyHex: "0xalice",
          hasStoredSecret: true,
          localOnly: false,
        },
      ],
      activeAccountId: "alice@wonderland",
    });

    const wrapper = mount(StatsView, {
      global: {
        plugins: [pinia],
      },
    });
    await flushPromises();

    const overviewCitizenCard = wrapper
      .findAll(".overview-card")
      .find((node) => node.text().includes(t("Citizens")));
    expect(overviewCitizenCard?.text()).toContain("1");
    expect(overviewCitizenCard?.text()).not.toContain("1+");
    expect(overviewCitizenCard?.text()).not.toContain("0");
  });
});

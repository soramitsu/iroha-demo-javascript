import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
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

const statsResponse = () => ({
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
  supply: {
    definitionId: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
    computedAtMs: Date.UTC(2026, 4, 2, 12, 0, 0),
    holdersTotal: 3,
    totalSupply: "1250000",
    topHolders: [
      {
        accountId: "testuAliceAccountWithAnIntentionallyLongIdentifier",
        balance: "500000",
      },
    ],
    distribution: {
      gini: 0.4,
      hhi: 0.2,
      nakamoto51: 2,
      top1: 0.4,
      top10: 0.75,
      median: "50",
      p99: "10000",
      lorenz: [
        { population: 0.5, share: 0.1 },
        { population: 1, share: 1 },
      ],
    },
  },
  econometrics: {
    definitionId: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
    computedAtMs: Date.UTC(2026, 4, 2, 12, 0, 0),
    velocityWindows: [
      {
        key: "24h",
        startMs: Date.UTC(2026, 4, 1, 12, 0, 0),
        endMs: Date.UTC(2026, 4, 2, 12, 0, 0),
        transfers: 8,
        uniqueSenders: 4,
        uniqueReceivers: 5,
        amount: "1200",
      },
    ],
    issuanceWindows: [
      {
        key: "24h",
        startMs: Date.UTC(2026, 4, 1, 12, 0, 0),
        endMs: Date.UTC(2026, 4, 2, 12, 0, 0),
        mintCount: 2,
        burnCount: 1,
        minted: "20",
        burned: "5",
        net: "15",
      },
    ],
    issuanceSeries: [
      {
        bucketStartMs: Date.UTC(2026, 4, 2, 0, 0, 0),
        minted: "20",
        burned: "5",
        net: "15",
      },
    ],
  },
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

describe("StatsView", () => {
  beforeEach(() => {
    getNetworkStatsMock.mockReset();
    getGovernanceCitizenCountMock.mockReset();
    getNetworkStatsMock.mockResolvedValue(statsResponse());
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

  const getOverviewMetric = (wrapper: VueWrapper, label: string) => {
    const metric = wrapper
      .findAll(".stats-overview .ui-metric-item")
      .find((node) => node.text().includes(label));
    if (!metric) throw new Error(`Overview metric not found: ${label}`);
    return metric;
  };

  it("renders the successful summary and exact governance citizen count", async () => {
    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.get(".stats-supply-line").text()).toContain("1.3M");
    expect(wrapper.get(".stats-supply-line").text()).toContain("XOR");
    expect(getOverviewMetric(wrapper, t("Citizens")).text()).toContain("42");
    expect(getOverviewMetric(wrapper, t("Holders")).text()).toContain("3");

    const alert = wrapper.get('[data-testid="stats-readiness-alert"]');
    expect(alert.classes()).toContain("ui-tone-success");
    expect(alert.text()).toContain(t("Live telemetry"));
    expect(alert.text()).toContain(
      t(
        "The active network is publishing live explorer, supply, and consensus data for the XOR lane.",
      ),
    );

    expect(getGovernanceCitizenCountMock).toHaveBeenCalledWith(
      "http://localhost:8080",
    );
    expect(getNetworkStatsMock).toHaveBeenCalledWith({
      toriiUrl: "http://localhost:8080",
      assetDefinitionId: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
    });
  });

  it("shows one concise loading state while telemetry is pending", async () => {
    let resolveStats!: (value: ReturnType<typeof statsResponse>) => void;
    getNetworkStatsMock.mockReturnValueOnce(
      new Promise<ReturnType<typeof statsResponse>>((resolve) => {
        resolveStats = resolve;
      }),
    );

    const wrapper = mountView();
    await wrapper.vm.$nextTick();

    expect(wrapper.get(".stats-shell").attributes("aria-busy")).toBe("true");
    const alert = wrapper.get('[data-testid="stats-readiness-alert"]');
    expect(alert.attributes("role")).toBe("status");
    expect(alert.text()).toContain(t("Booting telemetry"));
    expect(alert.text()).toContain(t("Querying explorer and status surfaces."));

    resolveStats(statsResponse());
    await flushPromises();
    expect(wrapper.get(".stats-shell").attributes("aria-busy")).toBeUndefined();
  });

  it("surfaces a failed stats request as the sole danger alert", async () => {
    getNetworkStatsMock.mockRejectedValueOnce(new Error("Torii timed out"));

    const wrapper = mountView();
    await flushPromises();

    const alert = wrapper.get('[data-testid="stats-readiness-alert"]');
    expect(alert.attributes("role")).toBe("alert");
    expect(alert.classes()).toContain("ui-tone-danger");
    expect(alert.text()).toContain(t("Unable to load network stats."));
    expect(alert.text()).toContain("Torii timed out");
    expect(wrapper.get(".stats-supply-line strong").text()).toBe(t("—"));
    expect(wrapper.findAll(".ui-alert")).toHaveLength(1);
  });

  it("keeps consensus, flow, and distribution collapsed until requested", async () => {
    const wrapper = mountView();
    await flushPromises();

    const disclosures = wrapper.findAll('[data-testid^="stats-disclosure-"]');
    expect(disclosures).toHaveLength(3);
    expect(disclosures.map((item) => item.attributes("open"))).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
    expect(disclosures.map((item) => item.get("summary").text())).toEqual([
      t("Network load"),
      t("Velocity and issuance"),
      t("Holder concentration"),
    ]);

    await disclosures[1]?.get("summary").trigger("click");
    expect(disclosures[1]?.attributes("open")).toBeDefined();
    expect(disclosures[1]?.text()).toContain("24H");
    expect(disclosures[1]?.text()).toContain(t("30 day issuance pulse"));
  });

  it("uses the exact citizen count endpoint instead of a lower-bound display", async () => {
    getGovernanceCitizenCountMock.mockResolvedValueOnce({
      total: 1,
      endpointAvailable: true,
    });

    const wrapper = mountView();
    await flushPromises();

    const citizenMetric = getOverviewMetric(wrapper, t("Citizens"));
    expect(citizenMetric.text()).toContain("1");
    expect(citizenMetric.text()).not.toContain("1+");
  });
});

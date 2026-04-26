import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import SoraCloudView from "@/views/SoraCloudView.vue";
import { useSessionStore } from "@/stores/session";
import { SORACLOUD_STORAGE_KEY } from "@/stores/soracloud";
import {
  deploySoraCloudHf,
  getSoraCloudHfStatus,
  getSoraCloudStatus,
} from "@/services/iroha";

vi.mock("@/services/iroha", () => ({
  getSoraCloudStatus: vi.fn(),
  deploySoraCloudHf: vi.fn(),
  getSoraCloudHfStatus: vi.fn(),
}));

const unavailableStatus = {
  available: false,
  statusCode: 404,
  message: "This Torii endpoint does not expose the SoraCloud API yet.",
  schemaVersion: null,
  serviceCount: 0,
  auditEventCount: 0,
  services: [],
  recentAuditEvents: [],
  raw: null,
};

const availableStatus = {
  available: true,
  schemaVersion: 1,
  serviceCount: 0,
  auditEventCount: 0,
  services: [],
  recentAuditEvents: [],
  raw: {
    control_plane: {
      service_count: 0,
      services: [],
    },
  },
};

const serviceStatus = {
  ...availableStatus,
  serviceCount: 1,
  services: [
    {
      id: "demo-hf",
      name: "demo-hf",
      status: "healthy" as const,
      currentVersion: "hf-generated-v1",
      revisionCount: 1,
      configEntryCount: 0,
      secretEntryCount: 0,
      routeHost: "demo",
      publicUrls: ["https://demo.mon.taira.sora.org/"],
      rolloutStage: null,
      rolloutPercent: null,
      leaseStatus: "Active",
      leaseExpiresSequence: 100,
      remainingRuntimeBalanceNanos: "10000",
      latestSequence: 9,
      signedBy: "ed25519:abc",
      raw: {},
    },
  ],
};

describe("SoraCloudView", () => {
  beforeEach(() => {
    vi.mocked(getSoraCloudStatus).mockReset();
    vi.mocked(deploySoraCloudHf).mockReset();
    vi.mocked(getSoraCloudHfStatus).mockReset();
    localStorage.clear();
    setActivePinia(createPinia());
  });

  const mountView = async (options?: { assetDefinitionId?: string }) => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const session = useSessionStore();
    session.$patch({
      connection: {
        toriiUrl: "https://taira.sora.org",
        chainId: "chain",
        assetDefinitionId:
          options?.assetDefinitionId ?? "4cuvDVPuLBKJyN6dPbRQhmLh68sU",
        networkPrefix: 369,
      },
      accounts: [
        {
          displayName: "Alice",
          domain: "wonderland",
          accountId: "alice@wonderland",
          publicKeyHex: "ab".repeat(32),
          hasStoredSecret: true,
          localOnly: false,
        },
      ],
      activeAccountId: "alice@wonderland",
    });

    const wrapper = mount(SoraCloudView, {
      global: {
        plugins: [pinia],
        stubs: {
          RouterLink: {
            props: ["to"],
            template: "<a><slot /></a>",
          },
        },
      },
    });
    await flushPromises();
    return wrapper;
  };

  it("renders endpoint-unavailable without fake KPIs or disabled-action copy", async () => {
    vi.mocked(getSoraCloudStatus).mockResolvedValue(unavailableStatus);

    const wrapper = await mountView();
    const text = wrapper.text();

    expect(text).toContain("SoraCloud is not available on this endpoint yet.");
    expect(text).toContain("Open Settings");
    expect(text).not.toContain("Monthly estimate");
    expect(text).not.toContain("Bridge unavailable");
    expect(text).not.toContain("Disabled actions");
    expect(wrapper.findAll(".soracloud-deployment-row")).toHaveLength(0);
  });

  it("shows a guided launch flow for available live endpoints", async () => {
    vi.mocked(getSoraCloudStatus).mockResolvedValue(availableStatus);

    const wrapper = await mountView();

    expect(wrapper.text()).toContain("Launch instance");
    expect(wrapper.text()).toContain("Choose model");
    expect(wrapper.text()).toContain(
      "No SoraCloud services found on this endpoint.",
    );
    expect(wrapper.text()).not.toContain("No local deployment records");

    await wrapper.findAll("input")[0].setValue("OpenAI/Demo Model");
    await flushPromises();
    expect(
      (wrapper.findAll("input")[2].element as HTMLInputElement).value,
    ).toBe("demo-model");
  });

  it("does not prefill stale lease asset aliases and adopts canonical session assets", async () => {
    vi.mocked(getSoraCloudStatus).mockResolvedValue(availableStatus);

    const wrapper = await mountView({ assetDefinitionId: "xor#universal" });

    await wrapper
      .findAll("button")
      .find((button) => button.text() === "Next")
      ?.trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain(
      "If this is empty, claim XOR in Wallet first.",
    );
    const leaseInputs = wrapper.findAll("input");
    expect((leaseInputs[0].element as HTMLInputElement).value).toBe("");

    useSessionStore().connection.assetDefinitionId =
      "61CtjvNd9T3THAR65GsMVHr82Bjc";
    await flushPromises();

    expect((leaseInputs[0].element as HTMLInputElement).value).toBe(
      "61CtjvNd9T3THAR65GsMVHr82Bjc",
    );
  });

  it("submits a valid launch request and refreshes live services", async () => {
    vi.mocked(getSoraCloudStatus)
      .mockResolvedValueOnce(availableStatus)
      .mockResolvedValueOnce(serviceStatus);
    vi.mocked(deploySoraCloudHf).mockResolvedValue({
      ok: true,
      action: "join",
      service_name: "demo-model-service",
      sequence: 12,
      raw: {},
    });

    const wrapper = await mountView();
    await wrapper.findAll("input")[0].setValue("OpenAI/Demo Model");
    await flushPromises();

    await wrapper
      .findAll("button")
      .find((button) => button.text() === "Next")
      ?.trigger("click");
    await flushPromises();

    const leaseInputs = wrapper.findAll("input");
    await leaseInputs[1].setValue("10000");
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "Next")
      ?.trigger("click");
    await flushPromises();

    const launchButton = wrapper
      .findAll("button")
      .find((button) => button.text() === "Launch live instance");
    expect(launchButton?.attributes("disabled")).toBeUndefined();
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(deploySoraCloudHf).toHaveBeenCalledWith(
      expect.objectContaining({
        toriiUrl: "https://taira.sora.org",
        accountId: "alice@wonderland",
        repoId: "OpenAI/Demo Model",
        modelName: "demo-model",
        serviceName: expect.stringContaining("demo-model"),
        baseFeeNanos: "10000",
      }),
    );
    expect(wrapper.text()).toContain("demo-hf");
    expect(wrapper.findAll(".soracloud-deployment-row")).toHaveLength(1);
  });

  it("does not persist SoraCloud services or transient launch secrets", async () => {
    localStorage.setItem(SORACLOUD_STORAGE_KEY, "stale");
    vi.mocked(getSoraCloudStatus).mockResolvedValue(availableStatus);

    await mountView();

    expect(localStorage.getItem(SORACLOUD_STORAGE_KEY)).toBeNull();
    expect(JSON.stringify(localStorage)).not.toContain("SoraCloud");
  });
});

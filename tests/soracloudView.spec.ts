import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import SoraCloudView from "@/views/SoraCloudView.vue";
import { useEndpointStore } from "@/stores/endpoint";
import { useSessionStore } from "@/stores/session";
import { SORACLOUD_STORAGE_KEY, useSoraCloudStore } from "@/stores/soracloud";
import {
  deploySoraCloudHf,
  getSoraCloudHfStatus,
  getSoraCloudStatus,
  reconcileSoraCloudHfLaunch,
} from "@/services/iroha";

vi.mock("@/services/iroha", () => ({
  getSoraCloudStatus: vi.fn(),
  deploySoraCloudHf: vi.fn(),
  getSoraCloudHfStatus: vi.fn(),
  reconcileSoraCloudHfLaunch: vi.fn(),
}));

const finalizedBlockProof = (transactionHash: string) => ({
  status: "finalized" as const,
  transactionHash,
  blockHeight: 17,
  blockHash: "ef".repeat(32),
  finalizedBlockHeight: 17,
});

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
    vi.mocked(reconcileSoraCloudHfLaunch).mockReset();
    vi.mocked(getSoraCloudHfStatus).mockResolvedValue({
      found: false,
      statusCode: 404,
      message: "Source not found.",
      raw: null,
    });
    localStorage.clear();
    setActivePinia(createPinia());
  });

  const mountView = async (options?: {
    assetDefinitionId?: string;
    deploySupported?: boolean;
  }) => {
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
    useEndpointStore().$patch({
      state: "ready",
      inspection: {
        schema: "iroha.wallet.endpoint-inspection.v1",
        toriiUrl: "https://taira.sora.org",
        expected: { chainId: "chain", networkPrefix: 369 },
        observed: { chainId: "chain", networkPrefix: 369 },
        identityStatus: "matched",
        accessMode: "read-write",
        checkedAtMs: 1,
        evidence: [],
        diagnostic: {
          code: "endpoint_identity_matched",
          message: "Endpoint identity matched.",
        },
        features: {
          soraCloudDeploy: {
            supported: options?.deploySupported ?? true,
            source: "openapi",
            requiredOperations: ["POST /v1/soracloud/hf/deploy"],
            missingOperations:
              options?.deploySupported === false
                ? ["POST /v1/soracloud/hf/deploy"]
                : [],
          },
        },
      },
    } as any);

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

  const openLaunchWorkspace = async (
    wrapper: Awaited<ReturnType<typeof mountView>>,
  ) => {
    const launchWorkspaceButton = wrapper
      .findAll("button")
      .find(
        (button) =>
          button.text() === "Launch instance" &&
          button.attributes("aria-pressed") !== undefined,
      );
    expect(launchWorkspaceButton).toBeDefined();
    await launchWorkspaceButton!.trigger("click");
    await flushPromises();
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

  it("does not report OK or zero audit events when the status read fails", async () => {
    vi.mocked(getSoraCloudStatus).mockRejectedValue(
      new Error("status payload is malformed"),
    );

    const wrapper = await mountView();
    const diagnostics = wrapper.get(".soracloud-inspector-card").text();

    expect(diagnostics).toContain("Status codeUnavailable");
    expect(diagnostics).toContain("Audit eventsUnavailable");
    expect(diagnostics).not.toContain("Status codeOK");
    expect(diagnostics).not.toContain("Audit events0");
  });

  it("shows a guided launch flow for available live endpoints", async () => {
    vi.mocked(getSoraCloudStatus).mockResolvedValue(availableStatus);

    const wrapper = await mountView();

    expect(wrapper.text()).toContain("Launch instance");
    expect(wrapper.text()).toContain(
      "No SoraCloud services found on this endpoint.",
    );
    expect(wrapper.text()).not.toContain("No local deployment records");

    await openLaunchWorkspace(wrapper);
    expect(wrapper.text()).toContain("Choose model");
    expect(wrapper.text()).not.toContain(
      "No SoraCloud services found on this endpoint.",
    );

    await wrapper.findAll("input")[0].setValue("OpenAI/Demo Model");
    await flushPromises();
    expect(
      (wrapper.findAll("input")[2].element as HTMLInputElement).value,
    ).toBe("demo-model");
  });

  it("disables the launcher when deploy is not advertised", async () => {
    vi.mocked(getSoraCloudStatus).mockResolvedValue(availableStatus);

    const wrapper = await mountView({ deploySupported: false });
    await openLaunchWorkspace(wrapper);

    expect(wrapper.text()).toContain(
      "This endpoint does not advertise POST /v1/soracloud/hf/deploy.",
    );
    expect(wrapper.get("fieldset").attributes("disabled")).toBeDefined();
    expect(
      wrapper
        .findAll("button")
        .find((button) => button.text() === "Next")
        ?.attributes("disabled"),
    ).toBeDefined();
    expect(deploySoraCloudHf).not.toHaveBeenCalled();
  });

  it("does not prefill stale lease asset aliases and adopts canonical session assets", async () => {
    vi.mocked(getSoraCloudStatus).mockResolvedValue(availableStatus);

    const wrapper = await mountView({ assetDefinitionId: "xor#universal" });

    await openLaunchWorkspace(wrapper);

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
    vi.mocked(deploySoraCloudHf).mockImplementation(async (input) => ({
      ok: true,
      settlement_status: "confirmed",
      finality: finalizedBlockProof("cd".repeat(32)),
      action: "join",
      service_name: input.serviceName,
      sequence: 12,
      tx_hash_hex: "cd".repeat(32),
      storage_base_fee: "0.00001",
      actual_storage_charge: "0.00001",
      max_compute_reservation_fee: "0.0000075",
      actual_compute_charge: "0",
      raw: {},
    }));
    vi.mocked(getSoraCloudHfStatus).mockResolvedValue({
      found: true,
      raw: { state: "deploying" },
    });

    const wrapper = await mountView();
    await openLaunchWorkspace(wrapper);
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

    const servicesWorkspaceButton = wrapper
      .findAll("button")
      .find(
        (button) =>
          button.text() === "Live services" &&
          button.attributes("aria-pressed") !== undefined,
      );
    expect(servicesWorkspaceButton).toBeDefined();
    await servicesWorkspaceButton!.trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("demo-hf");
    expect(wrapper.findAll(".soracloud-deployment-row")).toHaveLength(1);
    expect(getSoraCloudHfStatus).toHaveBeenLastCalledWith({
      toriiUrl: "https://taira.sora.org",
      repoId: "OpenAI/Demo Model",
      revision: "main",
      storageClass: "warm",
      leaseTermMs: 86_400_000,
      accountId: "alice@wonderland",
    });
  });

  it("refreshes HF source status from the current launch context independently", async () => {
    vi.mocked(getSoraCloudStatus).mockResolvedValue(serviceStatus);
    vi.mocked(getSoraCloudHfStatus).mockResolvedValue({
      found: true,
      raw: { state: "ready" },
    });

    const wrapper = await mountView();
    await openLaunchWorkspace(wrapper);
    await wrapper.findAll("input")[0].setValue("OpenAI/Demo");
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "Next")
      ?.trigger("click");
    await flushPromises();

    expect(getSoraCloudHfStatus).toHaveBeenLastCalledWith({
      toriiUrl: "https://taira.sora.org",
      repoId: "OpenAI/Demo",
      revision: "main",
      storageClass: "warm",
      leaseTermMs: 86_400_000,
      accountId: "alice@wonderland",
    });

    await wrapper.findAll("select")[0].setValue("hot");
    await flushPromises();

    expect(getSoraCloudHfStatus).toHaveBeenLastCalledWith(
      expect.objectContaining({
        repoId: "OpenAI/Demo",
        storageClass: "hot",
      }),
    );
    expect(useSoraCloudStore().services.map((service) => service.name)).toEqual(
      ["demo-hf"],
    );
  });

  it("refreshes and clears live services when the Torii endpoint changes", async () => {
    vi.mocked(getSoraCloudStatus)
      .mockResolvedValueOnce(serviceStatus)
      .mockImplementationOnce(() => new Promise<never>(() => {}));

    const wrapper = await mountView();
    expect(wrapper.findAll(".soracloud-deployment-row")).toHaveLength(1);
    expect(wrapper.text()).toContain("demo-hf");

    const session = useSessionStore();
    session.$patch({
      connection: {
        ...session.connection,
        toriiUrl: "https://minamoto.sora.org",
      },
    });
    await flushPromises();

    expect(getSoraCloudStatus).toHaveBeenLastCalledWith(
      expect.objectContaining({
        toriiUrl: "https://minamoto.sora.org",
      }),
    );
    expect(wrapper.findAll(".soracloud-deployment-row")).toHaveLength(0);
    expect(wrapper.text()).toContain("Checking SoraCloud...");
    expect(wrapper.text()).toContain("https://minamoto.sora.org");
  });

  it("does not persist SoraCloud services or transient launch secrets", async () => {
    localStorage.setItem(SORACLOUD_STORAGE_KEY, "stale");
    vi.mocked(getSoraCloudStatus).mockResolvedValue(availableStatus);

    const wrapper = await mountView();

    expect(localStorage.getItem(SORACLOUD_STORAGE_KEY)).toBeNull();
    expect(JSON.stringify(localStorage)).not.toContain("SoraCloud");
    expect(wrapper.text()).not.toContain("API token");
    expect(wrapper.findAll('input[type="password"]')).toHaveLength(0);
  });

  it("reconciles a finalized indexing transaction without resubmitting it", async () => {
    const transactionHash = "de".repeat(32);
    vi.mocked(getSoraCloudStatus).mockResolvedValue(availableStatus);
    vi.mocked(reconcileSoraCloudHfLaunch).mockResolvedValue({
      ok: true,
      settlement_status: "confirmed",
      finality: finalizedBlockProof(transactionHash),
      action: "Join",
      service_name: "demo-service",
      sequence: 18,
      tx_hash_hex: transactionHash,
      storage_base_fee: "0.00001",
      actual_storage_charge: "0.00001",
      max_compute_reservation_fee: "0.0000075",
      actual_compute_charge: "0",
      raw: {},
    });

    const wrapper = await mountView();
    await openLaunchWorkspace(wrapper);
    useSoraCloudStore().$patch({
      launchResult: {
        ok: true,
        settlement_status: "indexing",
        finality: finalizedBlockProof(transactionHash),
        action: null,
        service_name: "demo-service",
        sequence: null,
        tx_hash_hex: transactionHash,
        storage_base_fee: "0.00001",
        actual_storage_charge: null,
        max_compute_reservation_fee: "0.0000075",
        actual_compute_charge: null,
        reconciliation_message:
          "The transaction is finalized; settlement is still indexing.",
        raw: null,
      },
    });
    await flushPromises();

    expect(wrapper.text()).toContain("Transaction finalized");
    expect(wrapper.text()).toContain("Block 17");
    await wrapper.get(".soracloud-launch-result button").trigger("click");
    await flushPromises();

    expect(reconcileSoraCloudHfLaunch).toHaveBeenCalledWith({
      toriiUrl: "https://taira.sora.org",
      chainId: "chain",
      networkPrefix: 369,
      accountId: "alice@wonderland",
      transactionHash,
    });
    expect(deploySoraCloudHf).not.toHaveBeenCalled();
    expect(useSoraCloudStore().launchResult?.settlement_status).toBe(
      "confirmed",
    );
  });
});

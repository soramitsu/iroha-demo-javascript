import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import {
  deploySoraCloudHf,
  getSoraCloudHfStatus,
  getSoraCloudStatus,
} from "@/services/iroha";
import { SORACLOUD_STORAGE_KEY, useSoraCloudStore } from "@/stores/soracloud";
import type { SoraCloudStatusResponseView } from "@/types/iroha";

type ResolveSoraCloudStatus = (
  value: SoraCloudStatusResponseView | PromiseLike<SoraCloudStatusResponseView>,
) => void;

vi.mock("@/services/iroha", () => ({
  getSoraCloudStatus: vi.fn(),
  deploySoraCloudHf: vi.fn(),
  getSoraCloudHfStatus: vi.fn(),
}));

describe("SoraCloud store", () => {
  beforeEach(() => {
    vi.mocked(getSoraCloudStatus).mockReset();
    vi.mocked(deploySoraCloudHf).mockReset();
    vi.mocked(getSoraCloudHfStatus).mockReset();
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it("maps unavailable status without treating it as an empty live list", async () => {
    vi.mocked(getSoraCloudStatus).mockResolvedValue({
      available: false,
      statusCode: 404,
      message: "This Torii endpoint does not expose the SoraCloud API yet.",
      schemaVersion: null,
      serviceCount: 0,
      auditEventCount: 0,
      services: [],
      recentAuditEvents: [],
      raw: null,
    });

    const store = useSoraCloudStore();
    await store.refresh({ toriiUrl: "https://taira.sora.org" });

    expect(store.availability).toBe("unavailable");
    expect(store.services).toEqual([]);
    expect(store.error).toContain("does not expose");
  });

  it("stores only live service records returned by the bridge", async () => {
    vi.mocked(getSoraCloudStatus).mockResolvedValue({
      available: true,
      schemaVersion: 1,
      serviceCount: 1,
      auditEventCount: 0,
      services: [
        {
          id: "demo",
          name: "demo",
          status: "healthy",
          currentVersion: "v1",
          revisionCount: 1,
          configEntryCount: 0,
          secretEntryCount: 0,
          routeHost: null,
          publicUrls: [],
          rolloutStage: null,
          rolloutPercent: null,
          leaseStatus: "Active",
          leaseExpiresSequence: null,
          remainingRuntimeBalanceNanos: null,
          latestSequence: 1,
          signedBy: null,
          raw: {},
        },
      ],
      recentAuditEvents: [],
      raw: {},
    });

    const store = useSoraCloudStore();
    await store.refresh({ toriiUrl: "https://taira.sora.org" });

    expect(store.availability).toBe("available");
    expect(store.services.map((service) => service.name)).toEqual(["demo"]);
  });

  it("clears previous endpoint status while a refresh is pending", async () => {
    vi.mocked(getSoraCloudStatus).mockResolvedValueOnce({
      available: true,
      schemaVersion: 1,
      serviceCount: 1,
      auditEventCount: 0,
      services: [
        {
          id: "demo",
          name: "demo",
          status: "healthy",
          currentVersion: "v1",
          revisionCount: 1,
          configEntryCount: 0,
          secretEntryCount: 0,
          routeHost: null,
          publicUrls: [],
          rolloutStage: null,
          rolloutPercent: null,
          leaseStatus: "Active",
          leaseExpiresSequence: null,
          remainingRuntimeBalanceNanos: null,
          latestSequence: 1,
          signedBy: null,
          raw: {},
        },
      ],
      recentAuditEvents: [],
      raw: {},
    });

    const store = useSoraCloudStore();
    await store.refresh({ toriiUrl: "https://taira.sora.org" });
    expect(store.services.map((service) => service.name)).toEqual(["demo"]);

    let resolvePending!: ResolveSoraCloudStatus;
    vi.mocked(getSoraCloudStatus).mockImplementationOnce(
      () =>
        new Promise<SoraCloudStatusResponseView>((resolve) => {
          resolvePending = resolve;
        }),
    );

    const pendingRefresh = store.refresh({
      toriiUrl: "https://minamoto.sora.org",
    });

    expect(store.loading).toBe(true);
    expect(store.availability).toBe("unknown");
    expect(store.status).toBeNull();
    expect(store.hfStatus).toBeNull();
    expect(store.services).toEqual([]);
    expect(store.lastUpdatedAtMs).toBeNull();

    resolvePending({
      available: false,
      statusCode: 404,
      message: "This Torii endpoint does not expose the SoraCloud API yet.",
      schemaVersion: null,
      serviceCount: 0,
      auditEventCount: 0,
      services: [],
      recentAuditEvents: [],
      raw: null,
    });
    await pendingRefresh;

    expect(store.loading).toBe(false);
    expect(store.availability).toBe("unavailable");
  });

  it("ignores stale status responses after a newer endpoint refresh starts", async () => {
    let resolveTaira!: ResolveSoraCloudStatus;
    let resolveMinamoto!: ResolveSoraCloudStatus;
    vi.mocked(getSoraCloudStatus).mockImplementation(
      ({ toriiUrl }) =>
        new Promise<SoraCloudStatusResponseView>((resolve) => {
          if (toriiUrl.includes("minamoto")) {
            resolveMinamoto = resolve;
          } else {
            resolveTaira = resolve;
          }
        }),
    );

    const store = useSoraCloudStore();
    const staleRefresh = store.refresh({ toriiUrl: "https://taira.sora.org" });
    const activeRefresh = store.refresh({
      toriiUrl: "https://minamoto.sora.org",
    });

    resolveMinamoto({
      available: true,
      schemaVersion: 1,
      serviceCount: 1,
      auditEventCount: 0,
      services: [
        {
          id: "minamoto-hf",
          name: "minamoto-hf",
          status: "healthy",
          currentVersion: "v1",
          revisionCount: 1,
          configEntryCount: 0,
          secretEntryCount: 0,
          routeHost: null,
          publicUrls: [],
          rolloutStage: null,
          rolloutPercent: null,
          leaseStatus: "Active",
          leaseExpiresSequence: null,
          remainingRuntimeBalanceNanos: null,
          latestSequence: 1,
          signedBy: null,
          raw: {},
        },
      ],
      recentAuditEvents: [],
      raw: {},
    });
    await activeRefresh;

    expect(store.loading).toBe(false);
    expect(store.services.map((service) => service.name)).toEqual([
      "minamoto-hf",
    ]);

    resolveTaira({
      available: true,
      schemaVersion: 1,
      serviceCount: 1,
      auditEventCount: 0,
      services: [
        {
          id: "taira-hf",
          name: "taira-hf",
          status: "healthy",
          currentVersion: "v1",
          revisionCount: 1,
          configEntryCount: 0,
          secretEntryCount: 0,
          routeHost: null,
          publicUrls: [],
          rolloutStage: null,
          rolloutPercent: null,
          leaseStatus: "Active",
          leaseExpiresSequence: null,
          remainingRuntimeBalanceNanos: null,
          latestSequence: 1,
          signedBy: null,
          raw: {},
        },
      ],
      recentAuditEvents: [],
      raw: {},
    });
    await staleRefresh;

    expect(store.services.map((service) => service.name)).toEqual([
      "minamoto-hf",
    ]);
  });

  it("validates launch input and refreshes after success", async () => {
    vi.mocked(deploySoraCloudHf).mockResolvedValue({
      ok: true,
      action: "join",
      service_name: "demo",
      sequence: 10,
      raw: {},
    });
    vi.mocked(getSoraCloudStatus).mockResolvedValue({
      available: true,
      schemaVersion: 1,
      serviceCount: 0,
      auditEventCount: 0,
      services: [],
      recentAuditEvents: [],
      raw: {},
    });

    const store = useSoraCloudStore();
    await store.launchHf({
      toriiUrl: "https://taira.sora.org",
      accountId: "alice@wonderland",
      repoId: "OpenAI/Demo",
      modelName: "demo",
      serviceName: "demo-service",
      storageClass: "warm",
      leaseTermMs: 86_400_000,
      leaseAssetDefinitionId: "4cuvDVPuLBKJyN6dPbRQhmLh68sU",
      baseFeeNanos: "10000",
      apiToken: "secret-token",
    });

    expect(deploySoraCloudHf).toHaveBeenCalledWith(
      expect.objectContaining({
        apiToken: "secret-token",
        repoId: "OpenAI/Demo",
      }),
    );
    expect(getSoraCloudStatus).toHaveBeenCalledTimes(1);
    expect(store.launchResult?.service_name).toBe("demo");
  });

  it("removes stale local SoraCloud cache during hydrate", () => {
    localStorage.setItem(SORACLOUD_STORAGE_KEY, "stale");

    useSoraCloudStore().hydrate();

    expect(localStorage.getItem(SORACLOUD_STORAGE_KEY)).toBeNull();
  });

  it("rejects alias settlement assets before launch", async () => {
    const store = useSoraCloudStore();

    await expect(
      store.launchHf({
        toriiUrl: "https://taira.sora.org",
        accountId: "alice@wonderland",
        repoId: "OpenAI/Demo",
        modelName: "demo",
        serviceName: "demo-service",
        storageClass: "warm",
        leaseTermMs: 86_400_000,
        leaseAssetDefinitionId: "xor#universal",
        baseFeeNanos: "10000",
      }),
    ).rejects.toThrow("canonical asset definition ID");
    expect(deploySoraCloudHf).not.toHaveBeenCalled();
  });
});

import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getSoraCloudHfSharedLeaseStatus,
  getSoraCloudStatus,
} from "@/services/iroha";
import { SORACLOUD_STORAGE_KEY, useSoraCloudStore } from "@/stores/soracloud";

vi.mock("@/services/iroha", () => ({
  getSoraCloudStatus: vi.fn(),
  getSoraCloudHfSharedLeaseStatus: vi.fn(),
}));

const unavailableStatus = () => ({
  available: false as const,
  statusCode: 404,
  message: "This Torii endpoint does not expose the SoraCloud API yet.",
  schemaVersion: null,
  serviceCount: 0,
  auditEventCount: 0,
  services: [],
  recentAuditEvents: [],
  raw: null,
});

const missingLeaseStatus = () => ({
  found: false,
  statusCode: 404,
  message: "The requested source was not found.",
  source: null,
  pool: null,
  member: null,
  latestAuditEvent: null,
  auditEventCount: 0,
  storageBaseFee: null,
  raw: null,
});

describe("SoraCloud store", () => {
  beforeEach(() => {
    vi.mocked(getSoraCloudStatus).mockReset();
    vi.mocked(getSoraCloudHfSharedLeaseStatus).mockReset();
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it("maps an unavailable control-plane status without claiming an empty live list", async () => {
    vi.mocked(getSoraCloudStatus).mockResolvedValue(unavailableStatus());
    const store = useSoraCloudStore();

    await store.refresh({ toriiUrl: "https://taira.sora.org" });

    expect(store.availability).toBe("unavailable");
    expect(store.services).toEqual([]);
    expect(store.error).toContain("does not expose");
  });

  it("stores only service records returned by the live bridge", async () => {
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
          leaseExpiresHeight: null,
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

  it("forwards the exact shared-lease status query, including the full revision", async () => {
    vi.mocked(getSoraCloudHfSharedLeaseStatus).mockResolvedValue(
      missingLeaseStatus(),
    );
    const store = useSoraCloudStore();
    const revision = "12".repeat(20);

    await store.refreshHfSharedLeaseStatus({
      toriiUrl: "https://taira.sora.org",
      repoId: "OpenAI/Demo",
      revision,
      storageClass: "warm",
      leaseTermMs: 86_400_000,
      accountId: "test-account",
    });

    expect(getSoraCloudHfSharedLeaseStatus).toHaveBeenCalledWith({
      toriiUrl: "https://taira.sora.org",
      repoId: "OpenAI/Demo",
      revision,
      storageClass: "warm",
      leaseTermMs: 86_400_000,
      accountId: "test-account",
    });
    expect(store.hfSharedLeaseStatus?.found).toBe(false);
    expect(store.availability).not.toBe("unavailable");
  });

  it("keeps shared-lease read failures independent from live services", async () => {
    vi.mocked(getSoraCloudHfSharedLeaseStatus).mockRejectedValue(
      new Error("status route unavailable"),
    );
    const store = useSoraCloudStore();

    await expect(
      store.refreshHfSharedLeaseStatus({
        toriiUrl: "https://taira.sora.org",
        repoId: "OpenAI/Demo",
        revision: "34".repeat(20),
        storageClass: "hot",
        leaseTermMs: 3_600_000,
      }),
    ).rejects.toThrow("status route unavailable");

    expect(store.hfSharedLeaseStatus).toBeNull();
    expect(store.hfSharedLeaseStatusError).toBe("status route unavailable");
    expect(store.availability).toBe("unknown");
  });

  it("clears endpoint-bound projections when the endpoint or wallet changes", async () => {
    vi.mocked(getSoraCloudStatus).mockResolvedValue(unavailableStatus());
    const store = useSoraCloudStore();
    store.hfSharedLeaseStatus = missingLeaseStatus();
    store.hfSharedLeaseStatusError = "old";

    await store.refresh({
      toriiUrl: "https://minamoto.sora.org",
      accountId: "account-b",
    });

    expect(store.hfSharedLeaseStatus).toBeNull();
    expect(store.hfSharedLeaseStatusError).toBe("");
    expect(store.activeToriiUrl).toBe("https://minamoto.sora.org");
    expect(store.activeAccountId).toBe("account-b");
  });

  it("discards the retired persisted cache without migration", () => {
    localStorage.setItem(SORACLOUD_STORAGE_KEY, JSON.stringify({ fake: true }));
    const store = useSoraCloudStore();

    store.hydrate();

    expect(localStorage.getItem(SORACLOUD_STORAGE_KEY)).toBeNull();
  });
});

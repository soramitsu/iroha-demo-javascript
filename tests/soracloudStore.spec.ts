import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import {
  deploySoraCloudHf,
  getSoraCloudHfStatus,
  getSoraCloudStatus,
  reconcileSoraCloudHfLaunch,
} from "@/services/iroha";
import { SORACLOUD_STORAGE_KEY, useSoraCloudStore } from "@/stores/soracloud";
import type { SoraCloudStatusResponseView } from "@/types/iroha";

type ResolveSoraCloudStatus = (
  value: SoraCloudStatusResponseView | PromiseLike<SoraCloudStatusResponseView>,
) => void;

const finalizedBlockProof = (transactionHash: string) => ({
  status: "finalized" as const,
  transactionHash,
  blockHeight: 17,
  blockHash: "cd".repeat(32),
  finalizedBlockHeight: 17,
});

vi.mock("@/services/iroha", () => ({
  getSoraCloudStatus: vi.fn(),
  deploySoraCloudHf: vi.fn(),
  getSoraCloudHfStatus: vi.fn(),
  reconcileSoraCloudHfLaunch: vi.fn(),
}));

describe("SoraCloud store", () => {
  beforeEach(() => {
    vi.mocked(getSoraCloudStatus).mockReset();
    vi.mocked(deploySoraCloudHf).mockReset();
    vi.mocked(getSoraCloudHfStatus).mockReset();
    vi.mocked(reconcileSoraCloudHfLaunch).mockReset();
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

  it("forwards the complete HF status query and stores source-not-found", async () => {
    vi.mocked(getSoraCloudHfStatus).mockResolvedValue({
      found: false,
      statusCode: 404,
      message: "The requested source was not found.",
      raw: null,
    });

    const store = useSoraCloudStore();
    await store.refreshHfStatus({
      toriiUrl: "https://taira.sora.org",
      repoId: "OpenAI/Demo",
      revision: "main",
      storageClass: "warm",
      leaseTermMs: 86_400_000,
      accountId: "testuAlice",
    });

    expect(getSoraCloudHfStatus).toHaveBeenCalledWith({
      toriiUrl: "https://taira.sora.org",
      repoId: "OpenAI/Demo",
      revision: "main",
      storageClass: "warm",
      leaseTermMs: 86_400_000,
      accountId: "testuAlice",
    });
    expect(store.hfStatus?.found).toBe(false);
    expect(store.availability).not.toBe("unavailable");
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
      settlement_status: "confirmed",
      finality: finalizedBlockProof("ab".repeat(32)),
      action: "join",
      service_name: "demo-service",
      sequence: 10,
      tx_hash_hex: "ab".repeat(32),
      storage_base_fee: "0.00001",
      actual_storage_charge: "0.00001",
      max_compute_reservation_fee: "0.0000075",
      actual_compute_charge: "0",
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
    vi.mocked(getSoraCloudHfStatus).mockResolvedValue({
      found: true,
      raw: { state: "deploying" },
    });

    const store = useSoraCloudStore();
    await store.launchHf({
      toriiUrl: "https://taira.sora.org",
      chainId: "fc56984b-2be7-431d-840e-21514d1883f0",
      networkPrefix: 369,
      accountId: "alice@wonderland",
      repoId: "OpenAI/Demo",
      modelName: "demo",
      serviceName: "demo-service",
      storageClass: "warm",
      leaseTermMs: 86_400_000,
      leaseAssetDefinitionId: "4cuvDVPuLBKJyN6dPbRQhmLh68sU",
      baseFeeNanos: "10000",
    });

    expect(deploySoraCloudHf).toHaveBeenCalledWith(
      expect.objectContaining({
        repoId: "OpenAI/Demo",
      }),
    );
    expect(getSoraCloudStatus).toHaveBeenCalledTimes(1);
    expect(getSoraCloudHfStatus).toHaveBeenCalledWith({
      toriiUrl: "https://taira.sora.org",
      repoId: "OpenAI/Demo",
      revision: undefined,
      storageClass: "warm",
      leaseTermMs: 86_400_000,
      accountId: "alice@wonderland",
    });
    expect(store.launchResult?.service_name).toBe("demo-service");
    expect(store.hfStatus?.found).toBe(true);
  });

  it("does not expose a launch success without a confirmed transaction hash", async () => {
    vi.mocked(deploySoraCloudHf).mockResolvedValue({
      ok: true,
      settlement_status: "confirmed",
      finality: finalizedBlockProof("not-a-canonical-hash"),
      action: "join",
      service_name: "demo-service",
      sequence: 10,
      tx_hash_hex: "not-a-canonical-hash",
      storage_base_fee: "0.00001",
      actual_storage_charge: "0.00001",
      max_compute_reservation_fee: "0.0000075",
      actual_compute_charge: "0",
      raw: {},
    });

    const store = useSoraCloudStore();
    await expect(
      store.launchHf({
        toriiUrl: "https://taira.sora.org",
        chainId: "fc56984b-2be7-431d-840e-21514d1883f0",
        networkPrefix: 369,
        accountId: "alice@wonderland",
        repoId: "OpenAI/Demo",
        modelName: "demo",
        serviceName: "demo-service",
        storageClass: "warm",
        leaseTermMs: 86_400_000,
        leaseAssetDefinitionId: "4cuvDVPuLBKJyN6dPbRQhmLh68sU",
        baseFeeNanos: "10000",
      }),
    ).rejects.toThrow("canonical transaction hash");

    expect(store.launchResult).toBeNull();
    expect(store.launchError).toContain("canonical transaction hash");
    expect(getSoraCloudStatus).not.toHaveBeenCalled();
  });

  it("keeps live services available when the independent HF status read fails", async () => {
    vi.mocked(getSoraCloudStatus).mockResolvedValue({
      available: true,
      schemaVersion: 1,
      serviceCount: 1,
      auditEventCount: 0,
      services: [
        {
          id: "live-service",
          name: "live-service",
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
    vi.mocked(getSoraCloudHfStatus).mockRejectedValue(
      new Error("HF source status unavailable"),
    );

    const store = useSoraCloudStore();
    await store.refresh({ toriiUrl: "https://taira.sora.org" });
    await expect(
      store.refreshHfStatus({
        toriiUrl: "https://taira.sora.org",
        repoId: "OpenAI/Demo",
        storageClass: "warm",
        leaseTermMs: 86_400_000,
      }),
    ).rejects.toThrow("HF source status unavailable");

    expect(store.services.map((service) => service.name)).toEqual([
      "live-service",
    ]);
    expect(store.availability).toBe("available");
    expect(store.error).toBe("");
    expect(store.hfStatus).toBeNull();
    expect(store.hfStatusError).toBe("HF source status unavailable");
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
        chainId: "fc56984b-2be7-431d-840e-21514d1883f0",
        networkPrefix: 369,
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

  it("blocks duplicate launches until a finalized indexing result reconciles", async () => {
    const transactionHash = "de".repeat(32);
    vi.mocked(deploySoraCloudHf).mockResolvedValue({
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
    });
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
    vi.mocked(getSoraCloudStatus).mockResolvedValue({
      available: true,
      schemaVersion: 1,
      serviceCount: 0,
      auditEventCount: 0,
      services: [],
      recentAuditEvents: [],
      raw: {},
    });
    vi.mocked(getSoraCloudHfStatus).mockResolvedValue({
      found: true,
      raw: {},
    });
    const launchInput = {
      toriiUrl: "https://taira.sora.org",
      chainId: "fc56984b-2be7-431d-840e-21514d1883f0",
      networkPrefix: 369,
      accountId: "alice@wonderland",
      repoId: "OpenAI/Demo",
      modelName: "demo",
      serviceName: "demo-service",
      storageClass: "warm" as const,
      leaseTermMs: 86_400_000,
      leaseAssetDefinitionId: "4cuvDVPuLBKJyN6dPbRQhmLh68sU",
      baseFeeNanos: "10000",
    };

    const store = useSoraCloudStore();
    await store.launchHf(launchInput);
    expect(store.launchResult?.settlement_status).toBe("indexing");

    await expect(store.launchHf(launchInput)).rejects.toThrow(
      "Reconcile it before submitting another launch",
    );
    expect(deploySoraCloudHf).toHaveBeenCalledTimes(1);

    await store.reconcileHfLaunch({
      toriiUrl: launchInput.toriiUrl,
      chainId: launchInput.chainId,
      networkPrefix: launchInput.networkPrefix,
      accountId: launchInput.accountId,
      transactionHash,
    });

    expect(reconcileSoraCloudHfLaunch).toHaveBeenCalledWith({
      toriiUrl: launchInput.toriiUrl,
      chainId: launchInput.chainId,
      networkPrefix: launchInput.networkPrefix,
      accountId: launchInput.accountId,
      transactionHash,
    });
    expect(store.launchResult?.settlement_status).toBe("confirmed");
    expect(store.reconciling).toBe(false);
  });
});

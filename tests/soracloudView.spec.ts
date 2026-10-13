import { createPinia, setActivePinia } from "pinia";
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getSoraCloudHfSharedLeaseStatus,
  getSoraCloudStatus,
} from "@/services/iroha";
import { useEndpointStore } from "@/stores/endpoint";
import { useSessionStore } from "@/stores/session";
import SoraCloudView from "@/views/SoraCloudView.vue";

vi.mock("@/services/iroha", () => ({
  getSoraCloudStatus: vi.fn(),
  getSoraCloudHfSharedLeaseStatus: vi.fn(),
}));

const ACCOUNT_ID = "testuﾛ1NﾐヱﾇCﾍUovﾏﾊｺｸﾛJbｵVtﾍykRﾗﾊhﾄﾏKqTjUｺwﾒrym3GS93U";
const REVISION = "12".repeat(20);

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
  raw: {},
};

const missingLeaseStatus = {
  found: false,
  statusCode: 404,
  message: "Source not found.",
  source: null,
  pool: null,
  member: null,
  latestAuditEvent: null,
  auditEventCount: 0,
  storageBaseFee: null,
  raw: null,
};

describe("SoraCloudView", () => {
  beforeEach(() => {
    (window as unknown as { iroha: unknown }).iroha = {
      validateCanonicalAccountId: ({ accountId }: { accountId: string }) => {
        if (accountId !== ACCOUNT_ID) {
          throw new Error("Invalid account fixture.");
        }
        return accountId;
      },
    };
    vi.mocked(getSoraCloudStatus).mockReset();
    vi.mocked(getSoraCloudHfSharedLeaseStatus).mockReset();
    vi.mocked(getSoraCloudHfSharedLeaseStatus).mockResolvedValue(
      missingLeaseStatus,
    );
    localStorage.clear();
    setActivePinia(createPinia());
  });

  afterEach(() => {
    delete (window as { iroha?: unknown }).iroha;
  });

  const mountView = async (leaseRoutesSupported = true) => {
    const pinia = createPinia();
    setActivePinia(pinia);
    useSessionStore().$patch({
      connection: {
        toriiUrl: "https://taira.sora.org",
        chainId: "fc56984b-2be7-431d-840e-21514d1883f0",
        assetDefinitionId: "4cuvDVPuLBKJyN6dPbRQhmLh68sU",
        networkPrefix: 369,
      },
      accounts: [
        {
          displayName: "Alice",
          domain: "wonderland",
          accountId: ACCOUNT_ID,
          publicKeyHex: "ab".repeat(32),
          hasStoredSecret: true,
          localOnly: false,
        },
      ],
      activeAccountId: ACCOUNT_ID,
    });
    useEndpointStore().$patch({
      state: "ready",
      inspection: {
        schema: "iroha.wallet.endpoint-inspection.v1",
        toriiUrl: "https://taira.sora.org",
        expected: {
          chainId: "fc56984b-2be7-431d-840e-21514d1883f0",
          networkPrefix: 369,
        },
        observed: {
          chainId: "fc56984b-2be7-431d-840e-21514d1883f0",
          networkPrefix: 369,
        },
        identityStatus: "matched",
        accessMode: "read-write",
        checkedAtMs: 1,
        evidence: [],
        diagnostic: {
          code: "endpoint_identity_matched",
          message: "Endpoint identity matched.",
        },
        features: {
          soraCloudHfSharedLease: {
            supported: leaseRoutesSupported,
            source: "openapi",
            requiredOperations: [
              "POST /v1/soracloud/hf/lease/join",
              "GET /v1/soracloud/hf/lease/status",
              "CONTRACT /v1/soracloud/hf/lease exact-v1",
            ],
            missingOperations: leaseRoutesSupported
              ? []
              : ["CONTRACT /v1/soracloud/hf/lease exact-v1"],
          },
        },
      },
    } as never);

    const wrapper = mount(SoraCloudView, {
      global: {
        plugins: [pinia],
        stubs: {
          RouterLink: { props: ["to"], template: "<a><slot /></a>" },
        },
      },
    });
    await flushPromises();
    return wrapper;
  };

  const openLeaseWorkspace = async (
    wrapper: Awaited<ReturnType<typeof mountView>>,
  ) => {
    const button = wrapper
      .findAll("button")
      .find((candidate) => candidate.text() === "HF shared lease");
    expect(button).toBeDefined();
    await button!.trigger("click");
    await flushPromises();
  };

  it("renders endpoint-unavailable without inventing service records", async () => {
    vi.mocked(getSoraCloudStatus).mockResolvedValue(unavailableStatus);

    const wrapper = await mountView();

    expect(wrapper.text()).toContain(
      "SoraCloud is not available on this endpoint yet.",
    );
    expect(wrapper.findAll(".soracloud-service-row")).toHaveLength(0);
  });

  it("exposes the current shared-lease status route while keeping join fail-closed", async () => {
    vi.mocked(getSoraCloudStatus).mockResolvedValue(availableStatus);

    const wrapper = await mountView();
    await openLeaseWorkspace(wrapper);

    expect(wrapper.text()).toContain("GET /v1/soracloud/hf/lease/status");
    expect(wrapper.text()).toContain("Lease joining is read-only");
    expect(wrapper.text()).toContain(
      "exact canonical Norito provenance encoder",
    );
    const joinButton = wrapper
      .findAll("button")
      .find((button) => button.text() === "Join shared lease unavailable");
    expect(joinButton?.attributes("disabled")).toBeDefined();
  });

  it("submits only the exact five-field shared-lease status query", async () => {
    vi.mocked(getSoraCloudStatus).mockResolvedValue(availableStatus);
    const wrapper = await mountView();
    await openLeaseWorkspace(wrapper);
    const inputs = wrapper.findAll("input");
    await inputs[0]!.setValue("OpenAI/Demo");
    await inputs[1]!.setValue(REVISION);
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "Check shared lease")!
      .trigger("submit");
    await flushPromises();

    expect(getSoraCloudHfSharedLeaseStatus).toHaveBeenCalledWith({
      toriiUrl: "https://taira.sora.org",
      repoId: "OpenAI/Demo",
      revision: REVISION,
      storageClass: "warm",
      leaseTermMs: 86_400_000,
      accountId: ACCOUNT_ID,
    });
    expect(wrapper.text()).toContain("HF source not found");
  });

  it("does not query endpoints whose exact shared-lease contract is absent", async () => {
    vi.mocked(getSoraCloudStatus).mockResolvedValue(availableStatus);
    const wrapper = await mountView(false);
    await openLeaseWorkspace(wrapper);

    expect(wrapper.text()).toContain(
      "does not advertise the exact /v1/soracloud/hf/lease contract",
    );
    expect(getSoraCloudHfSharedLeaseStatus).not.toHaveBeenCalled();
  });

  it("renders the exact pool and member fields returned by the read bridge", async () => {
    vi.mocked(getSoraCloudStatus).mockResolvedValue(availableStatus);
    vi.mocked(getSoraCloudHfSharedLeaseStatus).mockResolvedValue({
      found: true,
      source: {
        schemaVersion: 1,
        sourceId: "source-id",
        repoId: "OpenAI/Demo",
        resolvedRevision: REVISION,
        createdAtMs: 1,
        updatedAtMs: 2,
      },
      pool: {
        schemaVersion: 1,
        poolId: "pool-id",
        sourceId: "source-id",
        storageClass: "warm",
        leaseAssetDefinitionId: "4cuvDVPuLBKJyN6dPbRQhmLh68sU",
        baseFee: "1",
        leaseTermMs: 86_400_000,
        windowStartedAtMs: 1,
        windowExpiresAtMs: 86_400_001,
        activeMemberCount: 1,
        status: "Active",
        queuedNextWindow: null,
      },
      member: {
        schemaVersion: 1,
        poolId: "pool-id",
        sourceId: "source-id",
        accountId: ACCOUNT_ID,
        status: "Active",
        joinedAtMs: 1,
        updatedAtMs: 2,
        totalPaid: "1",
        totalRefunded: "0",
        lastCharge: "1",
        serviceBindings: ["demo_service"],
        apartmentBindings: [],
      },
      latestAuditEvent: null,
      auditEventCount: 0,
      storageBaseFee: "1",
      raw: {},
    });
    const wrapper = await mountView();
    await openLeaseWorkspace(wrapper);
    const inputs = wrapper.findAll("input");
    await inputs[0]!.setValue("OpenAI/Demo");
    await inputs[1]!.setValue(REVISION);
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "Check shared lease")!
      .trigger("submit");
    await flushPromises();

    const status = wrapper.get('[data-testid="hf-shared-lease-status"]').text();
    expect(status).toContain("pool-id");
    expect(status).toContain("Active");
    expect(status).toContain("demo_service");
  });
});

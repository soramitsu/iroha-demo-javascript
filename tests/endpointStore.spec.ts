import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { inspectEndpoint } from "@/services/iroha";
import { useEndpointStore } from "@/stores/endpoint";
import type { EndpointInspection } from "@/types/endpointInspection";

vi.mock("@/services/iroha", () => ({
  inspectEndpoint: vi.fn(),
}));

const context = {
  toriiUrl: "https://taira.sora.org",
  chainId: "fc56984b-2be7-431d-840e-21514d1883f0",
  networkPrefix: 369,
};

const inspection = (
  accessMode: EndpointInspection["accessMode"],
): EndpointInspection => ({
  schema: "iroha.wallet.endpoint-inspection.v1",
  toriiUrl: context.toriiUrl,
  expected: {
    chainId: context.chainId,
    networkPrefix: context.networkPrefix,
  },
  observed: {
    chainId: context.chainId,
    networkPrefix: context.networkPrefix,
  },
  identityStatus: accessMode === "read-write" ? "matched" : "unverified",
  accessMode,
  checkedAtMs: 1,
  evidence: [],
  features: {} as EndpointInspection["features"],
  diagnostic: {
    code:
      accessMode === "read-write"
        ? "endpoint_identity_matched"
        : "endpoint_identity_unverified",
    message: accessMode === "read-write" ? "matched" : "unverified",
  },
});

describe("endpoint store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(inspectEndpoint).mockReset();
  });

  it("exposes read-write access only after a matching inspection", async () => {
    vi.mocked(inspectEndpoint).mockResolvedValue(inspection("read-write"));
    const store = useEndpointStore();

    await store.inspect(context);

    expect(store.state).toBe("ready");
    expect(store.writeAllowed).toBe(true);
    expect(store.degraded).toBe(false);
  });

  it("keeps unverified endpoints visible as read-only", async () => {
    vi.mocked(inspectEndpoint).mockResolvedValue(inspection("read-only"));
    const store = useEndpointStore();

    await store.inspect(context);

    expect(store.accessMode).toBe("read-only");
    expect(store.writeAllowed).toBe(false);
    expect(store.degraded).toBe(true);
    expect(store.diagnostic).toBe("unverified");
  });

  it("ignores a stale inspection after the endpoint changes", async () => {
    let resolveFirst!: (value: EndpointInspection) => void;
    vi.mocked(inspectEndpoint)
      .mockImplementationOnce(
        () =>
          new Promise<EndpointInspection>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce(inspection("read-only"));
    const store = useEndpointStore();
    const first = store.inspect(context);
    await store.inspect({
      ...context,
      toriiUrl: "https://replacement.example",
    });
    resolveFirst(inspection("read-write"));
    await first;

    expect(store.accessMode).toBe("read-only");
  });

  it("keeps an adopted saved-session inspection ahead of an older in-flight request", async () => {
    let resolveStale!: (value: EndpointInspection) => void;
    vi.mocked(inspectEndpoint).mockImplementationOnce(
      () =>
        new Promise<EndpointInspection>((resolve) => {
          resolveStale = resolve;
        }),
    );
    const store = useEndpointStore();
    const staleRequest = store.inspect(context);
    const adopted = {
      ...inspection("read-only"),
      toriiUrl: "https://saved.example",
    };

    store.adoptInspection(adopted);
    resolveStale(inspection("read-write"));
    await staleRequest;

    expect(store.state).toBe("ready");
    expect(store.inspection).toEqual(adopted);
    expect(store.accessMode).toBe("read-only");
    expect(store.error).toBe("");
  });

  it("clears derived endpoint state without touching persisted session data", async () => {
    vi.mocked(inspectEndpoint).mockResolvedValue(inspection("read-write"));
    const store = useEndpointStore();
    await store.inspect(context);

    store.invalidate();

    expect(store.state).toBe("idle");
    expect(store.inspection).toBeNull();
    expect(store.writeAllowed).toBe(false);
  });
});

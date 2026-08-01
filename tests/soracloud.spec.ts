import { describe, expect, it } from "vitest";
import {
  buildSoraCloudHfStatusQuery,
  deriveSoraCloudModelName,
  deriveSoraCloudPublicUrls,
  deriveSoraCloudServiceName,
  missingSoraCloudHfStatus,
  normalizeSoraCloudHfStatusPayload,
  normalizeSoraCloudStatusPayload,
  sortSoraCloudDeployments,
  soraCloudStatusTone,
  summarizeSoraCloudDeployments,
  unavailableSoraCloudStatus,
  validateSoraCloudLeaseAssetDefinitionId,
  validateSoraCloudServiceName,
  type SoraCloudDeployment,
} from "@/utils/soracloud";

const deployment = (
  status: SoraCloudDeployment["status"],
  updatedAtMs: number | null,
  monthlyXor: number | null,
): SoraCloudDeployment => ({
  id: `${status}-${updatedAtMs ?? "pending"}`,
  name: `${status} deployment`,
  status,
  replicas: null,
  targetReplicas: null,
  requestsPerMinute: null,
  monthlyXor,
  updatedAtMs,
  services: [],
  events: [],
});

describe("SoraCloud utilities", () => {
  it("summarizes only live deployment records supplied by a caller", () => {
    expect(
      summarizeSoraCloudDeployments([
        deployment("healthy", 100, 80),
        deployment("deploying", 200, 120),
        deployment("warning", 300, null),
        deployment("failed", 400, 300),
        deployment("paused", 500, Number.NaN),
        deployment("unknown", null, 60),
      ]),
    ).toEqual({
      total: 6,
      healthy: 1,
      deploying: 1,
      attention: 2,
      paused: 1,
      monthlyXor: 560,
    });
  });

  it("sorts deployments by operational risk and latest activity", () => {
    expect(
      sortSoraCloudDeployments([
        deployment("paused", 500, 0),
        deployment("healthy", 100, 0),
        deployment("failed", 200, 0),
        deployment("warning", 300, 0),
        deployment("deploying", 400, 0),
        deployment("unknown", null, 0),
      ]).map((item) => item.status),
    ).toEqual([
      "failed",
      "warning",
      "deploying",
      "healthy",
      "paused",
      "unknown",
    ]);
  });

  it("maps statuses to existing pill tones", () => {
    expect(soraCloudStatusTone("healthy")).toBe("positive");
    expect(soraCloudStatusTone("deploying")).toBe("warning");
    expect(soraCloudStatusTone("warning")).toBe("warning");
    expect(soraCloudStatusTone("failed")).toBe("error");
    expect(soraCloudStatusTone("paused")).toBe("muted");
    expect(soraCloudStatusTone("unknown")).toBe("muted");
  });

  it("normalizes control-plane service snapshots from live status", () => {
    const status = normalizeSoraCloudStatusPayload({
      schema_version: 1,
      control_plane: {
        schema_version: 1,
        service_count: 1,
        audit_event_count: 2,
        services: [
          {
            service_name: "demo-hf",
            current_version: "hf-generated-v1",
            revision_count: 1,
            config_generation: 0,
            secret_generation: 0,
            config_entry_count: 0,
            secret_entry_count: 0,
            service_lease_status: { status: "Active" },
            public_discovery_url: "https://demo.mon.taira.sora.org/",
            latest_revision: {
              sequence: 7,
              service_version: "hf-generated-v1",
              route_host: "demo",
              signed_by: "ed25519:abc",
            },
          },
        ],
        recent_audit_events: [],
      },
    });

    expect(status.available).toBe(true);
    expect(status.serviceCount).toBe(1);
    expect(status.auditEventCount).toBe(2);
    expect(status.services[0]).toMatchObject({
      name: "demo-hf",
      status: "healthy",
      currentVersion: "hf-generated-v1",
      revisionCount: 1,
      latestSequence: 7,
    });
    expect(status.services[0].publicUrls).toContain(
      "https://demo.mon.taira.sora.org/",
    );
  });

  it("normalizes current TAIRA service route and rollout fields", () => {
    const status = normalizeSoraCloudStatusPayload({
      schema_version: 1,
      control_plane: {
        schema_version: 1,
        service_count: 1,
        audit_event_count: 18,
        services: [
          {
            service_name: "hayahi_live",
            current_version: "0.1.6",
            revision_count: 7,
            config_generation: 0,
            secret_generation: 0,
            config_entry_count: 0,
            secret_entry_count: 0,
            service_lease_status: { status: "Active", value: null },
            active_rollout: {
              rollout_handle: "hayahi_live:rollout:17",
              stage: { stage: "Canary", value: null },
              traffic_percent: 20,
            },
            public_discovery_url:
              "https://taira.sora.org/sorafs/cid/demo/index.json",
            latest_revision: {
              route_host: "taira.sora.org",
              route_path_prefix: "/api/v1",
              base_url: "https://taira.sora.org/api/v1/",
              sequence: 17,
              service_version: "0.1.6",
              signed_by: "ed25519:abc",
            },
          },
        ],
        recent_audit_events: [],
      },
    });

    expect(status.services[0]).toMatchObject({
      name: "hayahi_live",
      status: "deploying",
      rolloutStage: "Canary",
      rolloutPercent: 20,
      routeHost: "taira.sora.org",
      latestSequence: 17,
    });
    expect(status.services[0].publicUrls).toEqual([
      "https://taira.sora.org/sorafs/cid/demo/index.json",
      "https://taira.sora.org/api/v1/",
    ]);
  });

  it("keeps unavailable endpoints distinct from empty live service lists", () => {
    const unavailable = unavailableSoraCloudStatus(
      "This Torii endpoint does not expose the SoraCloud API yet.",
      404,
    );
    const empty = normalizeSoraCloudStatusPayload({
      schema_version: 1,
      control_plane: {
        schema_version: 1,
        services: [],
        service_count: 0,
        audit_event_count: 0,
        recent_audit_events: [],
      },
    });

    expect(unavailable.available).toBe(false);
    expect(unavailable.statusCode).toBe(404);
    expect(empty.available).toBe(true);
    expect(empty.services).toEqual([]);
  });

  it("rejects malformed-200 status payloads instead of inventing an empty service list", () => {
    expect(() => normalizeSoraCloudStatusPayload({})).toThrow("schema_version");
    expect(() =>
      normalizeSoraCloudStatusPayload({
        schemaVersion: 1,
        controlPlane: {
          schemaVersion: 1,
          serviceCount: 0,
          auditEventCount: 0,
          services: [],
          recentAuditEvents: [],
        },
      }),
    ).toThrow("non-canonical fields");
    expect(() =>
      normalizeSoraCloudStatusPayload({
        schema_version: 1,
        control_plane: {
          schema_version: 1,
          service_count: 1,
          audit_event_count: 0,
          services: [],
          recent_audit_events: [],
        },
      }),
    ).toThrow("does not match");
  });

  it("rejects malformed service items instead of filtering or fabricating names", () => {
    expect(() =>
      normalizeSoraCloudStatusPayload({
        schema_version: 1,
        control_plane: {
          schema_version: 1,
          service_count: 1,
          audit_event_count: 0,
          services: [{ serviceName: "legacy-service" }],
          recent_audit_events: [],
        },
      }),
    ).toThrow("non-canonical fields");
    expect(() =>
      normalizeSoraCloudStatusPayload({
        schema_version: 1,
        control_plane: {
          schema_version: 1,
          service_count: 1,
          audit_event_count: 0,
          services: [null],
          recent_audit_events: [],
        },
      }),
    ).toThrow("must be an object");
  });

  it("builds the complete current HF status query", () => {
    expect(
      buildSoraCloudHfStatusQuery({
        repoId: " OpenAI/Demo ",
        revision: " main ",
        storageClass: "warm",
        leaseTermMs: 86_400_000,
        accountId: " testuAlice ",
      }),
    ).toEqual({
      repo_id: "OpenAI/Demo",
      revision: "main",
      storage_class: "warm",
      lease_term_ms: 86_400_000,
      account_id: "testuAlice",
    });
    expect(() =>
      buildSoraCloudHfStatusQuery({
        repoId: "",
        storageClass: "warm",
        leaseTermMs: 86_400_000,
      }),
    ).toThrow("Hugging Face repo is required");
  });

  it("keeps HF source 404 distinct from API unavailability", () => {
    expect(missingSoraCloudHfStatus("The source was not found.", 404)).toEqual({
      found: false,
      statusCode: 404,
      message: "The source was not found.",
      raw: null,
    });
    expect(normalizeSoraCloudHfStatusPayload({ state: "deploying" })).toEqual({
      found: true,
      raw: { state: "deploying" },
    });
  });

  it("derives safe model and service names from a Hugging Face repo", () => {
    expect(deriveSoraCloudModelName("OpenAI/Demo Model")).toBe("demo-model");
    const serviceName = deriveSoraCloudServiceName(
      "OpenAI/Demo Model",
      "testu0123456789abcdef",
    );
    expect(validateSoraCloudServiceName(serviceName)).toBe(true);
  });

  it("accepts canonical lease asset ids and rejects aliases", () => {
    expect(
      validateSoraCloudLeaseAssetDefinitionId("61CtjvNd9T3THAR65GsMVHr82Bjc"),
    ).toBe(true);
    expect(validateSoraCloudLeaseAssetDefinitionId("xor#universal")).toBe(
      false,
    );
  });

  it("uses discovery and Mon gateway URLs without inventing Torii service paths", () => {
    const urls = deriveSoraCloudPublicUrls({
      latest_revision: {
        route_host: "demo",
        base_url: "https://edge.example.test/demo",
      },
    });

    expect(urls).toContain("https://demo.mon.taira.sora.org/");
    expect(urls).toContain("https://edge.example.test/demo");
    expect(urls.some((url) => url.includes("taira.sora.org/demo"))).toBe(false);
  });

  it("does not append the Mon gateway suffix to full route hosts", () => {
    const urls = deriveSoraCloudPublicUrls({
      latest_revision: {
        route_host: "taira.sora.org",
        base_url: "https://taira.sora.org/api/v1/",
      },
    });

    expect(urls).toEqual(["https://taira.sora.org/api/v1/"]);
  });
});

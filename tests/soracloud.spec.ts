import { describe, expect, it } from "vitest";
import {
  buildSoraCloudHfStatusQuery,
  deriveSoraCloudPublicUrls,
  missingSoraCloudHfStatus,
  normalizeSoraCloudHfStatusPayload,
  normalizeSoraCloudStatusPayload,
  soraCloudStatusTone,
  unavailableSoraCloudStatus,
} from "@/utils/soracloud";

const HF_REVISION = "0123456789abcdef0123456789abcdef01234567";
const CANONICAL_ACCOUNT_ID =
  "testuﾛ1PﾉｳﾇmEｴWｵebHﾑ6ﾔﾙｲヰiwuCWErJ7uｽoPGｱﾔnjﾑKﾋTCW2PV";
const CANONICAL_HASH =
  "hash:1313131313131313131313131313131313131313131313131313131313131313#9CE1";
const CANONICAL_ASSET_DEFINITION_ID = "61CtjvNd9T3THAR65GsMVHr82Bjc";

const exactStatusPayload = (overrides: Record<string, unknown> = {}) => ({
  schema_version: 1,
  service_health: {
    mode: "embedded_runtime_manager",
    status: "unavailable",
    message: "embedded runtime manager is unavailable",
  },
  routing: {
    configured_lane_count: 0,
    declared_lane_count: 0,
    active_lane_count: 0,
    active_lane_ids: [],
    autoscale_capacity_lane_count: 0,
    autoscale_capacity_lane_ids: [],
    dataspace_count: 0,
    routing_rules: 0,
    default_lane_id: 0,
    default_dataspace_id: 0,
  },
  hosted_http_topology: {
    active_capability_adverts: 0,
    placed_host_count: 0,
    hosted_replica_count: 0,
    unavailable_replica_count: 0,
  },
  resource_pressure: {
    queue_active: 0,
    queue_queued: 0,
    queue_capacity: 1,
    queue_saturated: false,
    high_load_threshold: 1,
    high_load: false,
    runtime: { enabled: false },
  },
  failed_admissions: {
    available: false,
    total: 0,
    governance_manifest_rejected: 0,
    sorafs_provider_rejected: 0,
  },
  runtime_manager: { available: false },
  control_plane: {
    schema_version: 1,
    service_count: 0,
    audit_event_count: 0,
    services: [],
    recent_audit_events: [],
  },
  ...overrides,
});

const exactLeaseSnapshot = () => ({
  authoritative_state: {
    schema_version: 1,
    economic_clock: { clock: "CanonicalBlockHeight", value: null },
    status: { status: "Active", value: null },
    quota_class: "standard",
    replica_count: 1,
    deployment_deposit: "0",
    prepaid_runtime_balance: "100",
    runtime_price_per_block: "1",
    storage_price_per_gib_block: "1",
    egress_price_per_mib: "1",
    lease_started_height: 1,
    lease_expires_height: 100,
    reporting_epoch: 1,
    settled_egress_bytes: 0,
    egress_reporter_checkpoints: [],
    accounted_egress_bytes: 0,
    last_status_reason: null,
  },
  effective_status: { status: "Active", value: null },
  remaining_runtime_balance: "100",
});

const exactRevision = (overrides: Record<string, unknown> = {}) => ({
  sequence: 7,
  action: { action: "Deploy", value: null },
  service_version: "hf-generated-v1",
  service_manifest_hash: "hash:service",
  container_manifest_hash: "hash:container",
  replicas: 1,
  execution_plane: {},
  route_host: "demo",
  route_path_prefix: "/",
  route_service_port: 443,
  route_visibility: "public",
  route_tls_mode: "required",
  base_url: "https://demo.mon.taira.sora.org/",
  healthcheck_url: null,
  public_discovery_content_cid: null,
  public_discovery_url: null,
  public_discovery_cid_host_url: null,
  state_binding_count: 0,
  state_bindings: [],
  lease_volumes: [],
  allow_model_inference: true,
  allow_model_training: false,
  runtime: {},
  allow_state_writes: false,
  network: {},
  cpu_millis: 100,
  memory_bytes: 1_024,
  ephemeral_storage_bytes: 1_024,
  max_open_files_per_process: 64,
  max_tasks: 8,
  start_grace_secs: 10,
  stop_grace_secs: 10,
  healthcheck_path: null,
  required_config_names: [],
  required_secret_names: [],
  config_exports: [],
  sandbox_profile_hash: "hash:sandbox",
  process_generation: 1,
  process_started_sequence: 7,
  signed_by: "ed25519:abc",
  ...overrides,
});

const exactRollout = (overrides: Record<string, unknown> = {}) => ({
  rollout_handle: "demo:rollout:7",
  baseline_version: "v0",
  candidate_version: "v1",
  canary_percent: 20,
  traffic_percent: 20,
  stage: { stage: "Canary", value: null },
  health_failures: 0,
  max_health_failures: 3,
  health_window_secs: 60,
  created_sequence: 7,
  updated_sequence: 7,
  ...overrides,
});

const exactServiceSnapshot = (overrides: Record<string, unknown> = {}) => ({
  service_name: "demo-hf",
  current_version: "hf-generated-v1",
  revision_count: 1,
  config_generation: 0,
  secret_generation: 0,
  config_entry_count: 0,
  secret_entry_count: 0,
  service_lease: exactLeaseSnapshot(),
  public_discovery_content_cid: null,
  public_discovery_url: "https://demo.mon.taira.sora.org/",
  public_discovery_cid_host_url: null,
  latest_revision: exactRevision(),
  active_rollout: null,
  last_rollout: null,
  ...overrides,
});

const exactHfStatusPayload = (overrides: Record<string, unknown> = {}) => ({
  schema_version: 1,
  source: {
    schema_version: 1,
    source_id: CANONICAL_HASH,
    repo_id: "OpenAI/Demo",
    resolved_revision: HF_REVISION,
    created_at_ms: 1,
    updated_at_ms: 2,
  },
  pool: {
    schema_version: 1,
    pool_id: CANONICAL_HASH,
    source_id: CANONICAL_HASH,
    storage_class: "warm",
    lease_asset_definition_id: CANONICAL_ASSET_DEFINITION_ID,
    base_fee: "1",
    lease_term_ms: 86_400_000,
    window_started_at_ms: 3,
    window_expires_at_ms: 86_400_003,
    active_member_count: 1,
    status: { status: "Active", value: null },
    queued_next_window: null,
  },
  member: {
    schema_version: 1,
    pool_id: CANONICAL_HASH,
    source_id: CANONICAL_HASH,
    account_id: CANONICAL_ACCOUNT_ID,
    status: { status: "Active", value: null },
    joined_at_ms: 4,
    updated_at_ms: 5,
    total_paid: "1",
    total_refunded: "0",
    last_charge: "1",
    service_bindings: ["demo_hf"],
    apartment_bindings: [],
  },
  latest_audit_event: {
    schema_version: 1,
    sequence: 1,
    action: { action: "Join", value: null },
    pool_id: CANONICAL_HASH,
    source_id: CANONICAL_HASH,
    account_id: CANONICAL_ACCOUNT_ID,
    occurred_at_ms: 4,
    active_member_count: 1,
    charged: "1",
    refunded: "0",
    lease_expires_at_ms: 86_400_003,
    service_name: "demo_hf",
    apartment_name: null,
  },
  audit_event_count: 1,
  storage_base_fee: "1",
  ...overrides,
});

describe("SoraCloud utilities", () => {
  it("maps statuses to existing pill tones", () => {
    expect(soraCloudStatusTone("healthy")).toBe("positive");
    expect(soraCloudStatusTone("deploying")).toBe("warning");
    expect(soraCloudStatusTone("warning")).toBe("warning");
    expect(soraCloudStatusTone("failed")).toBe("error");
    expect(soraCloudStatusTone("paused")).toBe("muted");
    expect(soraCloudStatusTone("unknown")).toBe("muted");
  });

  it("normalizes control-plane service snapshots from live status", () => {
    const status = normalizeSoraCloudStatusPayload(
      exactStatusPayload({
        control_plane: {
          schema_version: 1,
          service_count: 1,
          audit_event_count: 2,
          services: [
            exactServiceSnapshot({
              latest_revision: exactRevision({
                sequence: 7,
                service_version: "hf-generated-v1",
                route_host: "demo",
              }),
            }),
          ],
          recent_audit_events: [],
        },
      }),
    );

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
    const status = normalizeSoraCloudStatusPayload(
      exactStatusPayload({
        control_plane: {
          schema_version: 1,
          service_count: 1,
          audit_event_count: 18,
          services: [
            exactServiceSnapshot({
              service_name: "hayahi_live",
              current_version: "0.1.6",
              revision_count: 7,
              active_rollout: exactRollout({
                rollout_handle: "hayahi_live:rollout:17",
              }),
              public_discovery_url:
                "https://taira.sora.org/sorafs/cid/demo/index.json",
              latest_revision: exactRevision({
                route_host: "taira.sora.org",
                route_path_prefix: "/api/v1",
                base_url: "https://taira.sora.org/api/v1/",
                sequence: 17,
                service_version: "0.1.6",
                process_started_sequence: 17,
              }),
            }),
          ],
          recent_audit_events: [],
        },
      }),
    );

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
    const empty = normalizeSoraCloudStatusPayload(
      exactStatusPayload({
        control_plane: {
          schema_version: 1,
          services: [],
          service_count: 0,
          audit_event_count: 0,
          recent_audit_events: [],
        },
      }),
    );

    expect(unavailable.available).toBe(false);
    expect(unavailable.statusCode).toBe(404);
    expect(empty.available).toBe(true);
    expect(empty.services).toEqual([]);
  });

  it("rejects malformed-200 status payloads instead of inventing an empty service list", () => {
    expect(() => normalizeSoraCloudStatusPayload({})).toThrow("schema_version");
    expect(() =>
      normalizeSoraCloudStatusPayload(
        exactStatusPayload({
          schemaVersion: 1,
          controlPlane: {
            schemaVersion: 1,
            serviceCount: 0,
            auditEventCount: 0,
            services: [],
            recentAuditEvents: [],
          },
        }),
      ),
    ).toThrow("invalid fields");
    expect(() =>
      normalizeSoraCloudStatusPayload(
        exactStatusPayload({
          control_plane: {
            schema_version: 1,
            service_count: 1,
            audit_event_count: 0,
            services: [],
            recent_audit_events: [],
          },
        }),
      ),
    ).toThrow("does not match");
    expect(() =>
      normalizeSoraCloudStatusPayload(
        exactStatusPayload({ legacy_service_count: 0 }),
      ),
    ).toThrow("unexpected legacy_service_count");
  });

  it("rejects malformed service items instead of filtering or fabricating names", () => {
    expect(() =>
      normalizeSoraCloudStatusPayload(
        exactStatusPayload({
          control_plane: {
            schema_version: 1,
            service_count: 1,
            audit_event_count: 0,
            services: [{ serviceName: "legacy-service" }],
            recent_audit_events: [],
          },
        }),
      ),
    ).toThrow("invalid fields");
    expect(() =>
      normalizeSoraCloudStatusPayload(
        exactStatusPayload({
          control_plane: {
            schema_version: 1,
            service_count: 1,
            audit_event_count: 0,
            services: [null],
            recent_audit_events: [],
          },
        }),
      ),
    ).toThrow("must be an object");
    expect(() =>
      normalizeSoraCloudStatusPayload(
        exactStatusPayload({
          control_plane: {
            schema_version: 1,
            service_count: 1,
            audit_event_count: 0,
            services: [
              {
                ...exactServiceSnapshot(),
                service_lease: undefined,
                service_lease_status: { status: "Active", value: null },
              },
            ],
            recent_audit_events: [],
          },
        }),
      ),
    ).toThrow("unexpected service_lease_status");
    expect(() =>
      normalizeSoraCloudStatusPayload(
        exactStatusPayload({
          control_plane: {
            schema_version: 1,
            service_count: 1,
            audit_event_count: 0,
            services: [
              exactServiceSnapshot({
                service_lease: {
                  ...exactLeaseSnapshot(),
                  effective_status: { status: "Active" },
                },
              }),
            ],
            recent_audit_events: [],
          },
        }),
      ),
    ).toThrow("missing value");
  });

  it("builds the complete current HF status query", () => {
    expect(
      buildSoraCloudHfStatusQuery({
        repoId: "OpenAI/Demo",
        revision: HF_REVISION,
        storageClass: "warm",
        leaseTermMs: 86_400_000,
        accountId: CANONICAL_ACCOUNT_ID,
      }),
    ).toEqual({
      repo_id: "OpenAI/Demo",
      revision: HF_REVISION,
      storage_class: "warm",
      lease_term_ms: 86_400_000,
      account_id: CANONICAL_ACCOUNT_ID,
    });
    expect(() =>
      buildSoraCloudHfStatusQuery({
        repoId: "",
        revision: HF_REVISION,
        storageClass: "warm",
        leaseTermMs: 86_400_000,
      }),
    ).toThrow("canonical non-empty string");
    expect(() =>
      buildSoraCloudHfStatusQuery({
        repoId: " OpenAI/Demo ",
        revision: HF_REVISION,
        storageClass: "warm",
        leaseTermMs: 86_400_000,
      }),
    ).toThrow("canonical non-empty string");
    expect(() =>
      buildSoraCloudHfStatusQuery({
        repoId: "OpenAI/Demo",
        revision: "main",
        storageClass: "warm",
        leaseTermMs: 86_400_000,
      }),
    ).toThrow("full 40-character lowercase hexadecimal commit OID");
  });

  it("keeps HF source 404 distinct from API unavailability", () => {
    expect(missingSoraCloudHfStatus("The source was not found.", 404)).toEqual({
      found: false,
      statusCode: 404,
      message: "The source was not found.",
      source: null,
      pool: null,
      member: null,
      latestAuditEvent: null,
      auditEventCount: 0,
      storageBaseFee: null,
      raw: null,
    });
    const payload = exactHfStatusPayload();
    expect(
      normalizeSoraCloudHfStatusPayload(payload, {
        repoId: "OpenAI/Demo",
        revision: HF_REVISION,
        storageClass: "warm",
        leaseTermMs: 86_400_000,
        accountId: CANONICAL_ACCOUNT_ID,
      }),
    ).toEqual({
      found: true,
      source: {
        schemaVersion: 1,
        sourceId: CANONICAL_HASH,
        repoId: "OpenAI/Demo",
        resolvedRevision: HF_REVISION,
        createdAtMs: 1,
        updatedAtMs: 2,
      },
      pool: {
        schemaVersion: 1,
        poolId: CANONICAL_HASH,
        sourceId: CANONICAL_HASH,
        storageClass: "warm",
        leaseAssetDefinitionId: CANONICAL_ASSET_DEFINITION_ID,
        baseFee: "1",
        leaseTermMs: 86_400_000,
        windowStartedAtMs: 3,
        windowExpiresAtMs: 86_400_003,
        activeMemberCount: 1,
        status: "Active",
        queuedNextWindow: null,
      },
      member: {
        schemaVersion: 1,
        poolId: CANONICAL_HASH,
        sourceId: CANONICAL_HASH,
        accountId: CANONICAL_ACCOUNT_ID,
        status: "Active",
        joinedAtMs: 4,
        updatedAtMs: 5,
        totalPaid: "1",
        totalRefunded: "0",
        lastCharge: "1",
        serviceBindings: ["demo_hf"],
        apartmentBindings: [],
      },
      latestAuditEvent: {
        schemaVersion: 1,
        sequence: 1,
        action: "Join",
        poolId: CANONICAL_HASH,
        sourceId: CANONICAL_HASH,
        accountId: CANONICAL_ACCOUNT_ID,
        occurredAtMs: 4,
        activeMemberCount: 1,
        charged: "1",
        refunded: "0",
        leaseExpiresAtMs: 86_400_003,
        serviceName: "demo_hf",
        apartmentName: null,
      },
      auditEventCount: 1,
      storageBaseFee: "1",
      raw: payload,
    });
    expect(() =>
      normalizeSoraCloudHfStatusPayload({ state: "deploying" }),
    ).toThrow("invalid fields");
  });

  it("allows an account-filtered status with pool-wide audit history but no account event", () => {
    const payload = exactHfStatusPayload({
      latest_audit_event: null,
      audit_event_count: 7,
    });
    const query = {
      repoId: "OpenAI/Demo",
      revision: HF_REVISION,
      storageClass: "warm" as const,
      leaseTermMs: 86_400_000,
      accountId: CANONICAL_ACCOUNT_ID,
    };

    expect(normalizeSoraCloudHfStatusPayload(payload, query)).toMatchObject({
      found: true,
      latestAuditEvent: null,
      auditEventCount: 7,
    });
    expect(() =>
      normalizeSoraCloudHfStatusPayload(payload, {
        ...query,
        accountId: undefined,
      }),
    ).toThrow("unfiltered non-empty log");
  });

  it("rejects obsolete projections and invalid shared-lease record invariants", () => {
    expect(() =>
      normalizeSoraCloudHfStatusPayload({
        ...exactHfStatusPayload(),
        compute_reservation_fee: "1",
      }),
    ).toThrow("unexpected compute_reservation_fee");

    const aliasAsset = exactHfStatusPayload();
    aliasAsset.pool.lease_asset_definition_id = "xor#universal";
    expect(() => normalizeSoraCloudHfStatusPayload(aliasAsset)).toThrow(
      "canonical Base58 asset definition ID",
    );

    const excessiveRefund = exactHfStatusPayload();
    excessiveRefund.member.total_refunded = "2";
    expect(() => normalizeSoraCloudHfStatusPayload(excessiveRefund)).toThrow(
      "must not exceed total_paid",
    );

    const unboundedBindings = exactHfStatusPayload();
    unboundedBindings.member.service_bindings = Array.from(
      { length: 257 },
      (_, index) => `service_${index}`,
    );
    expect(() => normalizeSoraCloudHfStatusPayload(unboundedBindings)).toThrow(
      "at most 256 items",
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

  it("rejects public HTTP URLs while retaining exact HTTPS projections", () => {
    const urls = deriveSoraCloudPublicUrls({
      public_discovery_url: "http://discovery.example.test/demo",
      latest_revision: {
        route_host: "demo",
        base_url: "https://edge.example.test/demo",
      },
    });

    expect(urls).toEqual([
      "https://edge.example.test/demo",
      "https://demo.mon.taira.sora.org/",
    ]);

    expect(() =>
      normalizeSoraCloudStatusPayload(
        exactStatusPayload({
          control_plane: {
            schema_version: 1,
            service_count: 1,
            audit_event_count: 0,
            services: [
              exactServiceSnapshot({
                latest_revision: exactRevision({
                  base_url: "http://edge.example.test/demo",
                }),
              }),
            ],
            recent_audit_events: [],
          },
        }),
      ),
    ).toThrow("absolute HTTPS URL");
  });
});

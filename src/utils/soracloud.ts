import { isCanonicalAssetDefinitionId } from "@/utils/assetId";

export type SoraCloudAvailability =
  | "unknown"
  | "available"
  | "unavailable"
  | "error";

export type SoraCloudServiceStatus =
  | "healthy"
  | "deploying"
  | "warning"
  | "paused"
  | "failed"
  | "unknown";

export type SoraCloudStorageClass = "hot" | "warm" | "cold";

export interface SoraCloudServiceSummary {
  id: string;
  name: string;
  status: SoraCloudServiceStatus;
  currentVersion: string;
  revisionCount: number;
  configEntryCount: number;
  secretEntryCount: number;
  routeHost: string | null;
  publicUrls: string[];
  rolloutStage: string | null;
  rolloutPercent: number | null;
  leaseStatus: string | null;
  leaseExpiresHeight: number | null;
  remainingRuntimeBalanceNanos: string | null;
  latestSequence: number | null;
  signedBy: string | null;
  raw: Record<string, unknown>;
}

export interface SoraCloudStatusView {
  available: boolean;
  statusCode?: number;
  message?: string;
  schemaVersion: number | null;
  serviceCount: number;
  auditEventCount: number;
  services: SoraCloudServiceSummary[];
  recentAuditEvents: Record<string, unknown>[];
  raw: Record<string, unknown> | null;
}

export interface SoraCloudHfStatusQueryInput {
  repoId: string;
  revision: string;
  storageClass: SoraCloudStorageClass;
  leaseTermMs: number;
  accountId?: string;
}

export type CanonicalI105AccountIdValidator = (accountId: string) => string;

export interface SoraCloudHfSourceView {
  schemaVersion: 1;
  sourceId: string;
  repoId: string;
  resolvedRevision: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface SoraCloudHfQueuedWindowView {
  sponsorAccountId: string;
  leaseAssetDefinitionId: string;
  baseFee: string;
  sponsoredAtMs: number;
  windowStartedAtMs: number;
  windowExpiresAtMs: number;
  serviceName: string;
  apartmentName: string | null;
}

export interface SoraCloudHfPoolView {
  schemaVersion: 1;
  poolId: string;
  sourceId: string;
  storageClass: SoraCloudStorageClass;
  leaseAssetDefinitionId: string;
  baseFee: string;
  leaseTermMs: number;
  windowStartedAtMs: number;
  windowExpiresAtMs: number;
  activeMemberCount: number;
  status: "Active" | "Draining" | "Expired" | "Retired";
  queuedNextWindow: SoraCloudHfQueuedWindowView | null;
}

export interface SoraCloudHfMemberView {
  schemaVersion: 1;
  poolId: string;
  sourceId: string;
  accountId: string;
  status: "Active" | "Left";
  joinedAtMs: number;
  updatedAtMs: number;
  totalPaid: string;
  totalRefunded: string;
  lastCharge: string;
  serviceBindings: string[];
  apartmentBindings: string[];
}

export interface SoraCloudHfAuditEventView {
  schemaVersion: 1;
  sequence: number;
  action: "CreateWindow" | "Join" | "Leave" | "Renew" | "Retire";
  poolId: string;
  sourceId: string;
  accountId: string;
  occurredAtMs: number;
  activeMemberCount: number;
  charged: string;
  refunded: string;
  leaseExpiresAtMs: number;
  serviceName: string | null;
  apartmentName: string | null;
}

export interface SoraCloudHfStatusView {
  found: boolean;
  statusCode?: number;
  message?: string;
  source: SoraCloudHfSourceView | null;
  pool: SoraCloudHfPoolView | null;
  member: SoraCloudHfMemberView | null;
  latestAuditEvent: SoraCloudHfAuditEventView | null;
  auditEventCount: number;
  storageBaseFee: string | null;
  raw: Record<string, unknown> | null;
}

const MON_GATEWAY_HOST_SUFFIX = ".mon.taira.sora.org";
const CANONICAL_QUANTITY_RE = /^(?:0|[1-9]\d*)(?:\.(?:\d{0,27}[1-9]))?$/u;
const MAX_QUANTITY_MANTISSA = (1n << 511n) - 1n;
const MAX_SORACLOUD_SERVICES = 10_000;
const MAX_SORACLOUD_AUDIT_EVENTS = 10;
const MAX_SORACLOUD_NESTED_ITEMS = 10_000;
const MAX_SORACLOUD_LEASE_BINDINGS = 256;
const HF_COMMIT_OID_RE = /^[0-9a-f]{40}$/u;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const hasOwn = (value: Record<string, unknown>, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

const trimString = (value: unknown): string => String(value ?? "").trim();

const requireRecord = (
  value: unknown,
  label: string,
): Record<string, unknown> => {
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value;
};

const requireCanonicalText = (value: unknown, label: string): string => {
  if (
    typeof value !== "string" ||
    !value ||
    value.trim() !== value ||
    value.normalize("NFC") !== value ||
    value.length > 4_096 ||
    Array.from(value).some((character) => character < " ")
  ) {
    throw new Error(`${label} must be a canonical non-empty string.`);
  }
  return value;
};

const requireCanonicalHfRepoId = (value: unknown, label: string): string => {
  const repoId = requireCanonicalText(value, label);
  if (
    new TextEncoder().encode(repoId).length > 96 ||
    repoId.includes("--") ||
    repoId.includes("..") ||
    repoId.slice(-4).toLowerCase() === ".git"
  ) {
    throw new Error(
      `${label} must be one exact fully-qualified namespace/repository identifier.`,
    );
  }
  const components = repoId.split("/");
  if (
    components.length !== 2 ||
    components.some(
      (component) =>
        !component ||
        component.startsWith(".") ||
        component.startsWith("-") ||
        component.endsWith(".") ||
        component.endsWith("-") ||
        !/^[A-Za-z0-9._-]+$/u.test(component),
    )
  ) {
    throw new Error(
      `${label} must be one exact fully-qualified namespace/repository identifier.`,
    );
  }
  return repoId;
};

const requireCanonicalCommitOid = (value: unknown, label: string): string => {
  const revision = requireCanonicalText(value, label);
  if (!HF_COMMIT_OID_RE.test(revision)) {
    throw new Error(
      `${label} must be a full 40-character lowercase hexadecimal commit OID.`,
    );
  }
  return revision;
};

const requireCanonicalIrohaName = (value: unknown, label: string): string => {
  const name = requireCanonicalText(value, label);
  if (
    new TextEncoder().encode(name).length > 255 ||
    name.normalize("NFC") !== name ||
    /[\p{Cc}\p{White_Space}@#$]/u.test(name) ||
    /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(name)
  ) {
    throw new Error(
      `${label} must use its exact canonical Iroha Name spelling.`,
    );
  }
  return name;
};

const requireCanonicalI105AccountId = (
  value: unknown,
  label: string,
  validateAccountId: CanonicalI105AccountIdValidator,
): string => {
  const accountId = requireCanonicalText(value, label);
  try {
    if (validateAccountId(accountId) !== accountId) {
      throw new Error("noncanonical");
    }
  } catch {
    throw new Error(`${label} must be an exact canonical I105 account ID.`);
  }
  return accountId;
};

const validateAccountIdWithRendererBridge: CanonicalI105AccountIdValidator = (
  accountId,
) => window.iroha.validateCanonicalAccountId({ accountId });

const computeHashLiteralCrc = (body: string): string => {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(`hash:${body}`)) {
    crc ^= (byte & 0xff) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc =
        (crc & 0x8000) !== 0
          ? ((crc << 1) ^ 0x1021) & 0xffff
          : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
};

const requireCanonicalHashLiteral = (value: unknown, label: string): string => {
  const literal = requireCanonicalText(value, label);
  const match = /^hash:([0-9A-F]{64})#([0-9A-F]{4})$/u.exec(literal);
  if (
    !match ||
    (Number.parseInt(match[1]!.slice(-2), 16) & 1) !== 1 ||
    computeHashLiteralCrc(match[1]!) !== match[2]
  ) {
    throw new Error(`${label} must be an exact canonical Norito hash literal.`);
  }
  return literal;
};

const requireNonNegativeSafeInteger = (
  value: unknown,
  label: string,
): number => {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`${label} must be a non-negative safe integer.`);
  }
  return value as number;
};

const requirePositiveSafeInteger = (value: unknown, label: string): number => {
  const integer = requireNonNegativeSafeInteger(value, label);
  if (integer === 0) {
    throw new Error(`${label} must be a positive safe integer.`);
  }
  return integer;
};

const requireU32 = (value: unknown, label: string): number => {
  const integer = requireNonNegativeSafeInteger(value, label);
  if (integer > 0xffff_ffff) {
    throw new Error(`${label} must fit an unsigned 32-bit integer.`);
  }
  return integer;
};

const requireBoolean = (value: unknown, label: string): boolean => {
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be a boolean.`);
  }
  return value;
};

const requireBoundedArray = (
  value: unknown,
  label: string,
  maximumItems: number,
): unknown[] => {
  if (!Array.isArray(value) || value.length > maximumItems) {
    throw new Error(
      `${label} must be an array with at most ${maximumItems} items.`,
    );
  }
  return value;
};

const optionalCanonicalText = (
  value: unknown,
  label: string,
): string | null => {
  if (value === undefined || value === null) return null;
  return requireCanonicalText(value, label);
};

const optionalCanonicalQuantity = (
  value: unknown,
  label: string,
): string | null => {
  const literal = optionalCanonicalText(value, label);
  if (literal !== null && !CANONICAL_QUANTITY_RE.test(literal)) {
    throw new Error(`${label} must be a canonical quantity.`);
  }
  if (literal !== null) {
    const mantissa = literal.replace(".", "").replace(/^0+/u, "") || "0";
    if (mantissa.length > 154 || BigInt(mantissa) > MAX_QUANTITY_MANTISSA) {
      throw new Error(`${label} exceeds the first-release Quantity range.`);
    }
  }
  return literal;
};

const requireCanonicalQuantity = (value: unknown, label: string): string => {
  const quantity = optionalCanonicalQuantity(value, label);
  if (quantity === null) {
    throw new Error(`${label} must be a canonical quantity.`);
  }
  return quantity;
};

const requirePositiveCanonicalQuantity = (
  value: unknown,
  label: string,
): string => {
  const quantity = requireCanonicalQuantity(value, label);
  if (quantity === "0") {
    throw new Error(`${label} must be greater than zero.`);
  }
  return quantity;
};

const compareCanonicalQuantities = (left: string, right: string): number => {
  const [leftWhole, leftFraction = ""] = left.split(".");
  const [rightWhole, rightFraction = ""] = right.split(".");
  const scale = Math.max(leftFraction.length, rightFraction.length);
  const leftMantissa =
    BigInt(`${leftWhole}${leftFraction}`) *
    10n ** BigInt(scale - leftFraction.length);
  const rightMantissa =
    BigInt(`${rightWhole}${rightFraction}`) *
    10n ** BigInt(scale - rightFraction.length);
  return leftMantissa < rightMantissa
    ? -1
    : leftMantissa > rightMantissa
      ? 1
      : 0;
};

const requireExactKeys = (
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
  label: string,
) => {
  const expected = new Set(expectedKeys);
  const missing = expectedKeys.filter((key) => !hasOwn(value, key));
  const unexpected = Object.keys(value).filter((key) => !expected.has(key));
  if (missing.length > 0 || unexpected.length > 0) {
    const detail = [
      missing.length > 0 ? `missing ${missing.join(", ")}` : "",
      unexpected.length > 0 ? `unexpected ${unexpected.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("; ");
    throw new Error(`${label} has invalid fields (${detail}).`);
  }
};

const readTaggedValue = (
  value: unknown,
  tag: "action" | "status" | "stage" | "type",
  label: string,
): string => {
  const record = requireRecord(value, label);
  requireExactKeys(record, [tag, "value"], label);
  if (record.value !== null) {
    throw new Error(`${label}.value must be null for a unit variant.`);
  }
  return requireCanonicalText(record[tag], `${label}.${tag}`);
};

const serviceStatusFromSnapshot = (
  service: Record<string, unknown>,
): SoraCloudServiceStatus => {
  const activeRollout = isRecord(service.active_rollout)
    ? service.active_rollout
    : null;
  const latestRevision = isRecord(service.latest_revision)
    ? service.latest_revision
    : null;
  const serviceLease = isRecord(service.service_lease)
    ? service.service_lease
    : null;
  const leaseStatus = serviceLease
    ? readTaggedValue(
        serviceLease.effective_status,
        "status",
        "SoraCloud service.service_lease.effective_status",
      ).toLowerCase()
    : "";

  if (activeRollout) return "deploying";
  if (leaseStatus === "exhausted") return "failed";
  if (leaseStatus === "expired" || leaseStatus === "suspended") {
    return "warning";
  }
  if (latestRevision) return "healthy";
  if (leaseStatus === "active") return "healthy";
  return "unknown";
};

const uniqueStrings = (values: Array<string | null | undefined>): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = trimString(value);
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
};

const normalizeUrl = (value: unknown): string | null => {
  if (typeof value !== "string" || !value || value.trim() !== value) {
    return null;
  }
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.hash) {
      return null;
    }
    return value;
  } catch {
    return null;
  }
};

const deriveMonGatewayUrl = (routeHost: string): string | null => {
  if (!routeHost) return null;
  if (routeHost.endsWith(MON_GATEWAY_HOST_SUFFIX)) {
    return `https://${routeHost}/`;
  }
  if (/^[a-z0-9-]+$/u.test(routeHost)) {
    return `https://${routeHost}${MON_GATEWAY_HOST_SUFFIX}/`;
  }
  return null;
};

const requireNonNegativeFields = (
  record: Record<string, unknown>,
  fields: readonly string[],
  label: string,
) => {
  for (const field of fields) {
    requireNonNegativeSafeInteger(record[field], `${label}.${field}`);
  }
};

const validateSoraCloudStatusEnvelope = (
  payload: Record<string, unknown>,
  label: string,
) => {
  requireExactKeys(
    payload,
    [
      "schema_version",
      "service_health",
      "routing",
      "hosted_http_topology",
      "resource_pressure",
      "failed_admissions",
      "runtime_manager",
      "control_plane",
    ],
    label,
  );

  const serviceHealth = requireRecord(
    payload.service_health,
    `${label}.service_health`,
  );
  if (serviceHealth.status === "unavailable") {
    requireExactKeys(
      serviceHealth,
      ["mode", "status", "message"],
      `${label}.service_health`,
    );
  } else {
    requireExactKeys(
      serviceHealth,
      [
        "mode",
        "status",
        "message",
        "observed_height",
        "observed_block_hash",
        "state_dir",
        "service_revisions",
        "healthy_service_revisions",
        "hydrating_service_revisions",
        "degraded_service_revisions",
        "unavailable_service_revisions",
        "apartments",
        "running_apartments",
        "expired_apartments",
      ],
      `${label}.service_health`,
    );
    if (
      !["idle", "healthy", "degraded", "unavailable"].includes(
        String(serviceHealth.status),
      )
    ) {
      throw new Error(`${label}.service_health.status is unsupported.`);
    }
    requireNonNegativeFields(
      serviceHealth,
      [
        "observed_height",
        "service_revisions",
        "healthy_service_revisions",
        "hydrating_service_revisions",
        "degraded_service_revisions",
        "unavailable_service_revisions",
        "apartments",
        "running_apartments",
        "expired_apartments",
      ],
      `${label}.service_health`,
    );
    optionalCanonicalText(
      serviceHealth.observed_block_hash,
      `${label}.service_health.observed_block_hash`,
    );
    requireCanonicalText(
      serviceHealth.state_dir,
      `${label}.service_health.state_dir`,
    );
  }
  if (serviceHealth.mode !== "embedded_runtime_manager") {
    throw new Error(
      `${label}.service_health.mode must be embedded_runtime_manager.`,
    );
  }
  requireCanonicalText(
    serviceHealth.message,
    `${label}.service_health.message`,
  );

  const routing = requireRecord(payload.routing, `${label}.routing`);
  requireExactKeys(
    routing,
    [
      "configured_lane_count",
      "declared_lane_count",
      "active_lane_count",
      "active_lane_ids",
      "autoscale_capacity_lane_count",
      "autoscale_capacity_lane_ids",
      "dataspace_count",
      "routing_rules",
      "default_lane_id",
      "default_dataspace_id",
    ],
    `${label}.routing`,
  );
  requireNonNegativeFields(
    routing,
    [
      "configured_lane_count",
      "declared_lane_count",
      "active_lane_count",
      "autoscale_capacity_lane_count",
      "dataspace_count",
      "routing_rules",
      "default_lane_id",
      "default_dataspace_id",
    ],
    `${label}.routing`,
  );
  const activeLaneIds = requireBoundedArray(
    routing.active_lane_ids,
    `${label}.routing.active_lane_ids`,
    MAX_SORACLOUD_NESTED_ITEMS,
  );
  const autoscaleLaneIds = requireBoundedArray(
    routing.autoscale_capacity_lane_ids,
    `${label}.routing.autoscale_capacity_lane_ids`,
    MAX_SORACLOUD_NESTED_ITEMS,
  );
  activeLaneIds.forEach((value, index) =>
    requireNonNegativeSafeInteger(
      value,
      `${label}.routing.active_lane_ids[${index}]`,
    ),
  );
  autoscaleLaneIds.forEach((value, index) =>
    requireNonNegativeSafeInteger(
      value,
      `${label}.routing.autoscale_capacity_lane_ids[${index}]`,
    ),
  );
  if (
    routing.active_lane_count !== activeLaneIds.length ||
    routing.autoscale_capacity_lane_count !== autoscaleLaneIds.length
  ) {
    throw new Error(`${label}.routing lane counts do not match their IDs.`);
  }

  const topology = requireRecord(
    payload.hosted_http_topology,
    `${label}.hosted_http_topology`,
  );
  requireExactKeys(
    topology,
    [
      "active_capability_adverts",
      "placed_host_count",
      "hosted_replica_count",
      "unavailable_replica_count",
    ],
    `${label}.hosted_http_topology`,
  );
  requireNonNegativeFields(
    topology,
    [
      "active_capability_adverts",
      "placed_host_count",
      "hosted_replica_count",
      "unavailable_replica_count",
    ],
    `${label}.hosted_http_topology`,
  );

  const resourcePressure = requireRecord(
    payload.resource_pressure,
    `${label}.resource_pressure`,
  );
  requireExactKeys(
    resourcePressure,
    [
      "queue_active",
      "queue_queued",
      "queue_capacity",
      "queue_saturated",
      "high_load_threshold",
      "high_load",
      "runtime",
    ],
    `${label}.resource_pressure`,
  );
  requireNonNegativeFields(
    resourcePressure,
    ["queue_active", "queue_queued", "queue_capacity", "high_load_threshold"],
    `${label}.resource_pressure`,
  );
  requireBoolean(
    resourcePressure.queue_saturated,
    `${label}.resource_pressure.queue_saturated`,
  );
  requireBoolean(
    resourcePressure.high_load,
    `${label}.resource_pressure.high_load`,
  );
  const runtimePressure = requireRecord(
    resourcePressure.runtime,
    `${label}.resource_pressure.runtime`,
  );
  if (runtimePressure.enabled === false) {
    requireExactKeys(
      runtimePressure,
      ["enabled"],
      `${label}.resource_pressure.runtime`,
    );
  } else {
    requireExactKeys(
      runtimePressure,
      [
        "enabled",
        "state_dir",
        "observed_height",
        "service_revisions",
        "apartments",
        "max_load_factor_bps",
        "reported_pending_mailbox_messages",
        "authoritative_pending_mailbox_messages",
        "bundle_cache_misses",
        "artifact_cache_misses",
      ],
      `${label}.resource_pressure.runtime`,
    );
    if (runtimePressure.enabled !== true) {
      throw new Error(`${label}.resource_pressure.runtime.enabled is invalid.`);
    }
    requireCanonicalText(
      runtimePressure.state_dir,
      `${label}.resource_pressure.runtime.state_dir`,
    );
    requireNonNegativeFields(
      runtimePressure,
      [
        "observed_height",
        "service_revisions",
        "apartments",
        "max_load_factor_bps",
        "reported_pending_mailbox_messages",
        "authoritative_pending_mailbox_messages",
        "bundle_cache_misses",
        "artifact_cache_misses",
      ],
      `${label}.resource_pressure.runtime`,
    );
  }

  const failedAdmissions = requireRecord(
    payload.failed_admissions,
    `${label}.failed_admissions`,
  );
  requireExactKeys(
    failedAdmissions,
    [
      "available",
      "total",
      "governance_manifest_rejected",
      "sorafs_provider_rejected",
    ],
    `${label}.failed_admissions`,
  );
  requireBoolean(
    failedAdmissions.available,
    `${label}.failed_admissions.available`,
  );
  requireNonNegativeFields(
    failedAdmissions,
    ["total", "governance_manifest_rejected", "sorafs_provider_rejected"],
    `${label}.failed_admissions`,
  );
  if (
    failedAdmissions.total !==
    (failedAdmissions.governance_manifest_rejected as number) +
      (failedAdmissions.sorafs_provider_rejected as number)
  ) {
    throw new Error(`${label}.failed_admissions.total is inconsistent.`);
  }

  const runtimeManager = requireRecord(
    payload.runtime_manager,
    `${label}.runtime_manager`,
  );
  if (runtimeManager.available === false) {
    requireExactKeys(runtimeManager, ["available"], `${label}.runtime_manager`);
  } else {
    requireExactKeys(
      runtimeManager,
      ["available", "state_dir", "snapshot"],
      `${label}.runtime_manager`,
    );
    if (runtimeManager.available !== true) {
      throw new Error(`${label}.runtime_manager.available is invalid.`);
    }
    requireCanonicalText(
      runtimeManager.state_dir,
      `${label}.runtime_manager.state_dir`,
    );
    const snapshot = requireRecord(
      runtimeManager.snapshot,
      `${label}.runtime_manager.snapshot`,
    );
    requireExactKeys(
      snapshot,
      [
        "schema_version",
        "observed_height",
        "observed_block_hash",
        "local_peer_id",
        "services",
        "apartments",
      ],
      `${label}.runtime_manager.snapshot`,
    );
    if (snapshot.schema_version !== 1) {
      throw new Error(
        `${label}.runtime_manager.snapshot.schema_version must be 1.`,
      );
    }
    requireNonNegativeSafeInteger(
      snapshot.observed_height,
      `${label}.runtime_manager.snapshot.observed_height`,
    );
    optionalCanonicalText(
      snapshot.observed_block_hash,
      `${label}.runtime_manager.snapshot.observed_block_hash`,
    );
    optionalCanonicalText(
      snapshot.local_peer_id,
      `${label}.runtime_manager.snapshot.local_peer_id`,
    );
    const services = requireRecord(
      snapshot.services,
      `${label}.runtime_manager.snapshot.services`,
    );
    const apartments = requireRecord(
      snapshot.apartments,
      `${label}.runtime_manager.snapshot.apartments`,
    );
    if (
      Object.keys(services).length > MAX_SORACLOUD_SERVICES ||
      Object.keys(apartments).length > MAX_SORACLOUD_SERVICES
    ) {
      throw new Error(
        `${label}.runtime_manager.snapshot exceeds its item limit.`,
      );
    }
  }
};

export const deriveSoraCloudPublicUrls = (
  service: Record<string, unknown>,
): string[] => {
  const latestRevision = isRecord(service.latest_revision)
    ? service.latest_revision
    : {};
  const routeHost = trimString(latestRevision.route_host);
  const monRoute = deriveMonGatewayUrl(routeHost);
  return uniqueStrings([
    normalizeUrl(service.public_discovery_url),
    normalizeUrl(service.public_discovery_cid_host_url),
    normalizeUrl(latestRevision.public_discovery_url),
    normalizeUrl(latestRevision.public_discovery_cid_host_url),
    normalizeUrl(latestRevision.base_url),
    monRoute,
  ]);
};

const validateRolloutSnapshot = (
  value: unknown,
  label: string,
): Record<string, unknown> => {
  const rollout = requireRecord(value, label);
  requireExactKeys(
    rollout,
    [
      "rollout_handle",
      "baseline_version",
      "candidate_version",
      "canary_percent",
      "traffic_percent",
      "stage",
      "health_failures",
      "max_health_failures",
      "health_window_secs",
      "created_sequence",
      "updated_sequence",
    ],
    label,
  );
  for (const field of [
    "rollout_handle",
    "baseline_version",
    "candidate_version",
  ] as const) {
    requireCanonicalText(rollout[field], `${label}.${field}`);
  }
  requireNonNegativeFields(
    rollout,
    [
      "canary_percent",
      "traffic_percent",
      "health_failures",
      "max_health_failures",
      "health_window_secs",
      "created_sequence",
      "updated_sequence",
    ],
    label,
  );
  if (
    (rollout.canary_percent as number) > 100 ||
    (rollout.traffic_percent as number) > 100
  ) {
    throw new Error(`${label} percentages must not exceed 100.`);
  }
  const stage = readTaggedValue(rollout.stage, "stage", `${label}.stage`);
  if (!["Canary", "Promoted", "RolledBack"].includes(stage)) {
    throw new Error(`${label}.stage is unsupported.`);
  }
  return rollout;
};

const validateServiceLeaseSnapshot = (
  value: unknown,
  label: string,
): {
  status: string;
  expiresHeight: number;
  remainingRuntimeBalance: string;
} | null => {
  if (value === null) return null;
  const lease = requireRecord(value, label);
  requireExactKeys(
    lease,
    ["authoritative_state", "effective_status", "remaining_runtime_balance"],
    label,
  );
  const authoritative = requireRecord(
    lease.authoritative_state,
    `${label}.authoritative_state`,
  );
  requireExactKeys(
    authoritative,
    [
      "schema_version",
      "economic_clock",
      "status",
      "quota_class",
      "replica_count",
      "deployment_deposit",
      "prepaid_runtime_balance",
      "runtime_price_per_block",
      "storage_price_per_gib_block",
      "egress_price_per_mib",
      "lease_started_height",
      "lease_expires_height",
      "reporting_epoch",
      "settled_egress_bytes",
      "egress_reporter_checkpoints",
      "accounted_egress_bytes",
      "last_status_reason",
    ],
    `${label}.authoritative_state`,
  );
  if (authoritative.schema_version !== 1) {
    throw new Error(`${label}.authoritative_state.schema_version must be 1.`);
  }
  const clock = requireRecord(
    authoritative.economic_clock,
    `${label}.authoritative_state.economic_clock`,
  );
  requireExactKeys(
    clock,
    ["clock", "value"],
    `${label}.authoritative_state.economic_clock`,
  );
  if (clock.clock !== "CanonicalBlockHeight" || clock.value !== null) {
    throw new Error(`${label}.authoritative_state.economic_clock is invalid.`);
  }
  const authoritativeStatus = readTaggedValue(
    authoritative.status,
    "status",
    `${label}.authoritative_state.status`,
  );
  const effectiveStatus = readTaggedValue(
    lease.effective_status,
    "status",
    `${label}.effective_status`,
  );
  if (
    !["Active", "Expired", "Exhausted", "Suspended"].includes(
      authoritativeStatus,
    ) ||
    effectiveStatus !== authoritativeStatus
  ) {
    throw new Error(`${label} contains inconsistent lease status.`);
  }
  requireCanonicalText(
    authoritative.quota_class,
    `${label}.authoritative_state.quota_class`,
  );
  const replicaCount = requirePositiveSafeInteger(
    authoritative.replica_count,
    `${label}.authoritative_state.replica_count`,
  );
  if (replicaCount > 4) {
    throw new Error(`${label}.authoritative_state.replica_count exceeds 4.`);
  }
  for (const field of [
    "deployment_deposit",
    "prepaid_runtime_balance",
    "runtime_price_per_block",
    "storage_price_per_gib_block",
    "egress_price_per_mib",
  ] as const) {
    optionalCanonicalQuantity(
      authoritative[field],
      `${label}.authoritative_state.${field}`,
    );
  }
  requirePositiveSafeInteger(
    authoritative.lease_started_height,
    `${label}.authoritative_state.lease_started_height`,
  );
  const expiresHeight = requirePositiveSafeInteger(
    authoritative.lease_expires_height,
    `${label}.authoritative_state.lease_expires_height`,
  );
  requirePositiveSafeInteger(
    authoritative.reporting_epoch,
    `${label}.authoritative_state.reporting_epoch`,
  );
  requireNonNegativeSafeInteger(
    authoritative.settled_egress_bytes,
    `${label}.authoritative_state.settled_egress_bytes`,
  );
  requireNonNegativeSafeInteger(
    authoritative.accounted_egress_bytes,
    `${label}.authoritative_state.accounted_egress_bytes`,
  );
  requireBoundedArray(
    authoritative.egress_reporter_checkpoints,
    `${label}.authoritative_state.egress_reporter_checkpoints`,
    4_096,
  );
  optionalCanonicalText(
    authoritative.last_status_reason,
    `${label}.authoritative_state.last_status_reason`,
  );
  const remainingRuntimeBalance = optionalCanonicalQuantity(
    lease.remaining_runtime_balance,
    `${label}.remaining_runtime_balance`,
  );
  if (remainingRuntimeBalance === null) {
    throw new Error(`${label}.remaining_runtime_balance must not be null.`);
  }
  return {
    status: effectiveStatus,
    expiresHeight,
    remainingRuntimeBalance,
  };
};

const validateServiceRevision = (
  value: unknown,
  label: string,
): Record<string, unknown> => {
  const revision = requireRecord(value, label);
  requireExactKeys(
    revision,
    [
      "sequence",
      "action",
      "service_version",
      "service_manifest_hash",
      "container_manifest_hash",
      "replicas",
      "execution_plane",
      "route_host",
      "route_path_prefix",
      "route_service_port",
      "route_visibility",
      "route_tls_mode",
      "base_url",
      "healthcheck_url",
      "public_discovery_content_cid",
      "public_discovery_url",
      "public_discovery_cid_host_url",
      "state_binding_count",
      "state_bindings",
      "lease_volumes",
      "allow_model_inference",
      "allow_model_training",
      "runtime",
      "allow_state_writes",
      "network",
      "cpu_millis",
      "memory_bytes",
      "ephemeral_storage_bytes",
      "max_open_files_per_process",
      "max_tasks",
      "start_grace_secs",
      "stop_grace_secs",
      "healthcheck_path",
      "required_config_names",
      "required_secret_names",
      "config_exports",
      "sandbox_profile_hash",
      "process_generation",
      "process_started_sequence",
      "signed_by",
    ],
    label,
  );
  requireNonNegativeFields(
    revision,
    [
      "sequence",
      "replicas",
      "state_binding_count",
      "cpu_millis",
      "memory_bytes",
      "ephemeral_storage_bytes",
      "max_open_files_per_process",
      "max_tasks",
      "start_grace_secs",
      "stop_grace_secs",
      "process_generation",
      "process_started_sequence",
    ],
    label,
  );
  for (const field of [
    "service_version",
    "service_manifest_hash",
    "container_manifest_hash",
    "sandbox_profile_hash",
    "signed_by",
  ] as const) {
    requireCanonicalText(revision[field], `${label}.${field}`);
  }
  readTaggedValue(revision.action, "action", `${label}.action`);
  for (const field of [
    "route_host",
    "route_path_prefix",
    "route_visibility",
    "route_tls_mode",
    "healthcheck_path",
    "public_discovery_content_cid",
  ] as const) {
    optionalCanonicalText(revision[field], `${label}.${field}`);
  }
  if (revision.route_service_port !== null) {
    const port = requirePositiveSafeInteger(
      revision.route_service_port,
      `${label}.route_service_port`,
    );
    if (port > 65_535) {
      throw new Error(`${label}.route_service_port exceeds 65535.`);
    }
  }
  for (const field of [
    "base_url",
    "healthcheck_url",
    "public_discovery_url",
    "public_discovery_cid_host_url",
  ] as const) {
    const url = optionalCanonicalText(revision[field], `${label}.${field}`);
    if (url !== null && normalizeUrl(url) === null) {
      throw new Error(`${label}.${field} must be an absolute HTTPS URL.`);
    }
  }
  for (const field of [
    "allow_model_inference",
    "allow_model_training",
    "allow_state_writes",
  ] as const) {
    requireBoolean(revision[field], `${label}.${field}`);
  }
  for (const field of [
    "state_bindings",
    "lease_volumes",
    "required_config_names",
    "required_secret_names",
    "config_exports",
  ] as const) {
    const items = requireBoundedArray(
      revision[field],
      `${label}.${field}`,
      MAX_SORACLOUD_NESTED_ITEMS,
    );
    if (
      field === "required_config_names" ||
      field === "required_secret_names"
    ) {
      items.forEach((item, index) =>
        requireCanonicalText(item, `${label}.${field}[${index}]`),
      );
    }
  }
  if (
    revision.state_binding_count !==
    (revision.state_bindings as unknown[]).length
  ) {
    throw new Error(`${label}.state_binding_count is inconsistent.`);
  }
  requireRecord(revision.execution_plane, `${label}.execution_plane`);
  requireRecord(revision.runtime, `${label}.runtime`);
  requireRecord(revision.network, `${label}.network`);
  return revision;
};

const validateControlPlaneAuditEvent = (value: unknown, label: string) => {
  const event = requireRecord(value, label);
  requireExactKeys(
    event,
    [
      "sequence",
      "action",
      "service_name",
      "from_version",
      "to_version",
      "service_manifest_hash",
      "container_manifest_hash",
      "process_generation",
      "config_generation",
      "secret_generation",
      "config_snapshot_hash",
      "secret_snapshot_hash",
      "binding_name",
      "state_key",
      "config_mutations",
      "secret_mutations",
      "governance_tx_hash",
      "rollout_state",
      "policy_name",
      "policy_snapshot_hash",
      "jurisdiction_tag",
      "consent_evidence_hash",
      "break_glass",
      "break_glass_reason",
      "lease_usage",
      "service_lease_commitment",
      "lease_reporting_epoch_rollover",
      "signed_by",
    ],
    label,
  );
  requireNonNegativeFields(
    event,
    [
      "sequence",
      "process_generation",
      "config_generation",
      "secret_generation",
    ],
    label,
  );
  readTaggedValue(event.action, "action", `${label}.action`);
  for (const field of [
    "service_name",
    "to_version",
    "service_manifest_hash",
    "container_manifest_hash",
    "config_snapshot_hash",
    "secret_snapshot_hash",
    "signed_by",
  ] as const) {
    requireCanonicalText(event[field], `${label}.${field}`);
  }
  requireBoundedArray(
    event.config_mutations,
    `${label}.config_mutations`,
    MAX_SORACLOUD_NESTED_ITEMS,
  );
  requireBoundedArray(
    event.secret_mutations,
    `${label}.secret_mutations`,
    MAX_SORACLOUD_NESTED_ITEMS,
  );
  if (event.rollout_state !== null) {
    validateRolloutSnapshot(event.rollout_state, `${label}.rollout_state`);
  }
  return event;
};

export const normalizeSoraCloudStatusPayload = (
  payload: Record<string, unknown>,
): SoraCloudStatusView => {
  const label = "SoraCloud status response";
  validateSoraCloudStatusEnvelope(payload, label);
  const schemaVersion = requireNonNegativeSafeInteger(
    payload.schema_version,
    `${label}.schema_version`,
  );
  if (schemaVersion !== 1) {
    throw new Error(`${label}.schema_version must be 1.`);
  }
  const controlPlane = requireRecord(
    payload.control_plane,
    `${label}.control_plane`,
  );
  requireExactKeys(
    controlPlane,
    [
      "schema_version",
      "service_count",
      "audit_event_count",
      "services",
      "recent_audit_events",
    ],
    `${label}.control_plane`,
  );
  if (
    requireNonNegativeSafeInteger(
      controlPlane.schema_version,
      `${label}.control_plane.schema_version`,
    ) !== 1
  ) {
    throw new Error(`${label}.control_plane.schema_version must be 1.`);
  }
  const serviceItems = requireBoundedArray(
    controlPlane.services,
    `${label}.control_plane.services`,
    MAX_SORACLOUD_SERVICES,
  );
  const services = serviceItems.map((service, index) =>
    normalizeSoraCloudServiceSummary(
      requireRecord(service, `${label}.control_plane.services[${index}]`),
      `${label}.control_plane.services[${index}]`,
    ),
  );
  const serviceCount = requireNonNegativeSafeInteger(
    controlPlane.service_count,
    `${label}.control_plane.service_count`,
  );
  if (serviceCount !== services.length) {
    throw new Error(
      `${label}.control_plane.service_count does not match its services.`,
    );
  }
  const recentAuditEvents = requireBoundedArray(
    controlPlane.recent_audit_events,
    `${label}.control_plane.recent_audit_events`,
    MAX_SORACLOUD_AUDIT_EVENTS,
  ).map((event, index) =>
    validateControlPlaneAuditEvent(
      event,
      `${label}.control_plane.recent_audit_events[${index}]`,
    ),
  );
  return {
    available: true,
    schemaVersion,
    serviceCount,
    auditEventCount: requireNonNegativeSafeInteger(
      controlPlane.audit_event_count,
      `${label}.control_plane.audit_event_count`,
    ),
    services,
    recentAuditEvents,
    raw: payload,
  };
};

export const unavailableSoraCloudStatus = (
  message: string,
  statusCode?: number,
): SoraCloudStatusView => ({
  available: false,
  statusCode,
  message,
  schemaVersion: null,
  serviceCount: 0,
  auditEventCount: 0,
  services: [],
  recentAuditEvents: [],
  raw: null,
});

export const buildSoraCloudHfStatusQuery = (
  input: SoraCloudHfStatusQueryInput,
  validateAccountId: CanonicalI105AccountIdValidator = validateAccountIdWithRendererBridge,
): Record<string, string | number | undefined> => {
  const repoId = requireCanonicalHfRepoId(input.repoId, "Hugging Face repo");
  const revision = requireCanonicalCommitOid(
    input.revision,
    "Hugging Face revision",
  );
  if (!["hot", "warm", "cold"].includes(input.storageClass)) {
    throw new Error("SoraCloud storage class is invalid.");
  }
  if (!Number.isSafeInteger(input.leaseTermMs) || input.leaseTermMs <= 0) {
    throw new Error("Lease duration must be greater than zero.");
  }
  return {
    repo_id: repoId,
    revision,
    storage_class: input.storageClass,
    lease_term_ms: input.leaseTermMs,
    account_id:
      input.accountId === undefined
        ? undefined
        : requireCanonicalI105AccountId(
            input.accountId,
            "SoraCloud account ID",
            validateAccountId,
          ),
  };
};

const readExactUnitVariant = <T extends string>(
  value: unknown,
  tag: "action" | "status",
  allowed: readonly T[],
  label: string,
): T => {
  const variant = readTaggedValue(value, tag, label);
  if (!allowed.includes(variant as T)) {
    throw new Error(`${label}.${tag} is unsupported.`);
  }
  return variant as T;
};

const readExactNameArray = (value: unknown, label: string): string[] => {
  const items = requireBoundedArray(
    value,
    label,
    MAX_SORACLOUD_LEASE_BINDINGS,
  ).map((item, index) => requireCanonicalIrohaName(item, `${label}[${index}]`));
  if (new Set(items).size !== items.length) {
    throw new Error(`${label} must contain unique values.`);
  }
  return items;
};

const readQueuedWindow = (
  value: unknown,
  label: string,
  validateAccountId: CanonicalI105AccountIdValidator,
): SoraCloudHfQueuedWindowView => {
  const queued = requireRecord(value, label);
  requireExactKeys(
    queued,
    [
      "sponsor_account_id",
      "lease_asset_definition_id",
      "base_fee",
      "sponsored_at_ms",
      "window_started_at_ms",
      "window_expires_at_ms",
      "service_name",
      "apartment_name",
    ],
    label,
  );
  const sponsoredAtMs = requirePositiveSafeInteger(
    queued.sponsored_at_ms,
    `${label}.sponsored_at_ms`,
  );
  const windowStartedAtMs = requirePositiveSafeInteger(
    queued.window_started_at_ms,
    `${label}.window_started_at_ms`,
  );
  const windowExpiresAtMs = requirePositiveSafeInteger(
    queued.window_expires_at_ms,
    `${label}.window_expires_at_ms`,
  );
  if (
    sponsoredAtMs > windowStartedAtMs ||
    windowStartedAtMs >= windowExpiresAtMs
  ) {
    throw new Error(`${label} has an invalid window timeline.`);
  }
  const leaseAssetDefinitionId = requireCanonicalText(
    queued.lease_asset_definition_id,
    `${label}.lease_asset_definition_id`,
  );
  if (!isCanonicalAssetDefinitionId(leaseAssetDefinitionId)) {
    throw new Error(
      `${label}.lease_asset_definition_id must be a canonical Base58 asset definition ID.`,
    );
  }
  return {
    sponsorAccountId: requireCanonicalI105AccountId(
      queued.sponsor_account_id,
      `${label}.sponsor_account_id`,
      validateAccountId,
    ),
    leaseAssetDefinitionId,
    baseFee: requirePositiveCanonicalQuantity(
      queued.base_fee,
      `${label}.base_fee`,
    ),
    sponsoredAtMs,
    windowStartedAtMs,
    windowExpiresAtMs,
    serviceName: requireCanonicalIrohaName(
      queued.service_name,
      `${label}.service_name`,
    ),
    apartmentName:
      queued.apartment_name === null
        ? null
        : requireCanonicalIrohaName(
            queued.apartment_name,
            `${label}.apartment_name`,
          ),
  };
};

export const normalizeSoraCloudHfStatusPayload = (
  payload: Record<string, unknown>,
  expected?: SoraCloudHfStatusQueryInput,
  validateAccountId: CanonicalI105AccountIdValidator = validateAccountIdWithRendererBridge,
): SoraCloudHfStatusView => {
  const label = "SoraCloud HF status response";
  requireExactKeys(
    payload,
    [
      "schema_version",
      "source",
      "pool",
      "member",
      "latest_audit_event",
      "audit_event_count",
      "storage_base_fee",
    ],
    label,
  );
  if (payload.schema_version !== 1) {
    throw new Error(`${label}.schema_version must be 1.`);
  }
  const auditEventCount = requireU32(
    payload.audit_event_count,
    `${label}.audit_event_count`,
  );
  const storageBaseFee = requireCanonicalQuantity(
    payload.storage_base_fee,
    `${label}.storage_base_fee`,
  );

  const source = requireRecord(payload.source, `${label}.source`);
  requireExactKeys(
    source,
    [
      "schema_version",
      "source_id",
      "repo_id",
      "resolved_revision",
      "created_at_ms",
      "updated_at_ms",
    ],
    `${label}.source`,
  );
  if (source.schema_version !== 1) {
    throw new Error(`${label}.source.schema_version must be 1.`);
  }
  const sourceId = requireCanonicalHashLiteral(
    source.source_id,
    `${label}.source.source_id`,
  );
  const repoId = requireCanonicalHfRepoId(
    source.repo_id,
    `${label}.source.repo_id`,
  );
  const resolvedRevision = requireCanonicalCommitOid(
    source.resolved_revision,
    `${label}.source.resolved_revision`,
  );
  const createdAtMs = requirePositiveSafeInteger(
    source.created_at_ms,
    `${label}.source.created_at_ms`,
  );
  const updatedAtMs = requirePositiveSafeInteger(
    source.updated_at_ms,
    `${label}.source.updated_at_ms`,
  );
  if (updatedAtMs < createdAtMs) {
    throw new Error(`${label}.source.updated_at_ms precedes created_at_ms.`);
  }
  if (expected) {
    const query = buildSoraCloudHfStatusQuery(expected, validateAccountId);
    if (repoId !== query.repo_id || resolvedRevision !== query.revision) {
      throw new Error(
        `${label}.source does not match the requested HF source.`,
      );
    }
  }
  const sourceView: SoraCloudHfSourceView = {
    schemaVersion: 1,
    sourceId,
    repoId,
    resolvedRevision,
    createdAtMs,
    updatedAtMs,
  };

  let poolView: SoraCloudHfPoolView | null = null;
  if (payload.pool === null) {
    if (storageBaseFee !== "0") {
      throw new Error(`${label}.storage_base_fee must be zero without a pool.`);
    }
  } else {
    const pool = requireRecord(payload.pool, `${label}.pool`);
    requireExactKeys(
      pool,
      [
        "schema_version",
        "pool_id",
        "source_id",
        "storage_class",
        "lease_asset_definition_id",
        "base_fee",
        "lease_term_ms",
        "window_started_at_ms",
        "window_expires_at_ms",
        "active_member_count",
        "status",
        "queued_next_window",
      ],
      `${label}.pool`,
    );
    if (pool.schema_version !== 1) {
      throw new Error(`${label}.pool.schema_version must be 1.`);
    }
    const poolId = requireCanonicalHashLiteral(
      pool.pool_id,
      `${label}.pool.pool_id`,
    );
    if (
      requireCanonicalHashLiteral(pool.source_id, `${label}.pool.source_id`) !==
      sourceId
    ) {
      throw new Error(
        `${label}.pool.source_id does not match source.source_id.`,
      );
    }
    if (!["hot", "warm", "cold"].includes(String(pool.storage_class))) {
      throw new Error(`${label}.pool.storage_class is unsupported.`);
    }
    const storageClass = pool.storage_class as SoraCloudStorageClass;
    const leaseAssetDefinitionId = requireCanonicalText(
      pool.lease_asset_definition_id,
      `${label}.pool.lease_asset_definition_id`,
    );
    if (!isCanonicalAssetDefinitionId(leaseAssetDefinitionId)) {
      throw new Error(
        `${label}.pool.lease_asset_definition_id must be a canonical Base58 asset definition ID.`,
      );
    }
    const baseFee = requirePositiveCanonicalQuantity(
      pool.base_fee,
      `${label}.pool.base_fee`,
    );
    if (baseFee !== storageBaseFee) {
      throw new Error(
        `${label}.storage_base_fee does not match pool.base_fee.`,
      );
    }
    const leaseTermMs = requirePositiveSafeInteger(
      pool.lease_term_ms,
      `${label}.pool.lease_term_ms`,
    );
    const windowStartedAtMs = requirePositiveSafeInteger(
      pool.window_started_at_ms,
      `${label}.pool.window_started_at_ms`,
    );
    const windowExpiresAtMs = requirePositiveSafeInteger(
      pool.window_expires_at_ms,
      `${label}.pool.window_expires_at_ms`,
    );
    if (windowExpiresAtMs <= windowStartedAtMs) {
      throw new Error(`${label}.pool has an invalid window timeline.`);
    }
    if (
      expected &&
      (storageClass !== expected.storageClass ||
        leaseTermMs !== expected.leaseTermMs)
    ) {
      throw new Error(`${label}.pool does not match the requested lease pool.`);
    }
    const activeMemberCount = requireU32(
      pool.active_member_count,
      `${label}.pool.active_member_count`,
    );
    const status = readExactUnitVariant(
      pool.status,
      "status",
      ["Active", "Draining", "Expired", "Retired"] as const,
      `${label}.pool.status`,
    );
    const queuedNextWindow =
      pool.queued_next_window === null
        ? null
        : readQueuedWindow(
            pool.queued_next_window,
            `${label}.pool.queued_next_window`,
            validateAccountId,
          );
    if (status !== "Active" && activeMemberCount !== 0) {
      throw new Error(
        `${label}.pool.active_member_count must be zero outside an active pool.`,
      );
    }
    if (queuedNextWindow !== null) {
      if (
        status !== "Active" ||
        queuedNextWindow.windowStartedAtMs !== windowExpiresAtMs ||
        BigInt(queuedNextWindow.windowExpiresAtMs) !==
          BigInt(queuedNextWindow.windowStartedAtMs) + BigInt(leaseTermMs) ||
        queuedNextWindow.leaseAssetDefinitionId !== leaseAssetDefinitionId
      ) {
        throw new Error(
          `${label}.pool.queued_next_window does not match the active pool.`,
        );
      }
    }
    poolView = {
      schemaVersion: 1,
      poolId,
      sourceId,
      storageClass,
      leaseAssetDefinitionId,
      baseFee,
      leaseTermMs,
      windowStartedAtMs,
      windowExpiresAtMs,
      activeMemberCount,
      status,
      queuedNextWindow,
    };
  }

  let memberView: SoraCloudHfMemberView | null = null;
  if (payload.member !== null) {
    if (poolView === null) {
      throw new Error(`${label}.member requires a matching pool.`);
    }
    const member = requireRecord(payload.member, `${label}.member`);
    requireExactKeys(
      member,
      [
        "schema_version",
        "pool_id",
        "source_id",
        "account_id",
        "status",
        "joined_at_ms",
        "updated_at_ms",
        "total_paid",
        "total_refunded",
        "last_charge",
        "service_bindings",
        "apartment_bindings",
      ],
      `${label}.member`,
    );
    if (member.schema_version !== 1) {
      throw new Error(`${label}.member.schema_version must be 1.`);
    }
    if (
      requireCanonicalHashLiteral(member.pool_id, `${label}.member.pool_id`) !==
        poolView.poolId ||
      requireCanonicalHashLiteral(
        member.source_id,
        `${label}.member.source_id`,
      ) !== sourceId
    ) {
      throw new Error(
        `${label}.member identifiers do not match the source pool.`,
      );
    }
    const accountId = requireCanonicalI105AccountId(
      member.account_id,
      `${label}.member.account_id`,
      validateAccountId,
    );
    if (expected?.accountId !== undefined && accountId !== expected.accountId) {
      throw new Error(`${label}.member.account_id does not match the query.`);
    }
    const joinedAtMs = requirePositiveSafeInteger(
      member.joined_at_ms,
      `${label}.member.joined_at_ms`,
    );
    const updatedAtMs = requirePositiveSafeInteger(
      member.updated_at_ms,
      `${label}.member.updated_at_ms`,
    );
    if (updatedAtMs < joinedAtMs) {
      throw new Error(`${label}.member.updated_at_ms precedes joined_at_ms.`);
    }
    const status = readExactUnitVariant(
      member.status,
      "status",
      ["Active", "Left"] as const,
      `${label}.member.status`,
    );
    if (status === "Active" && poolView.status !== "Active") {
      throw new Error(
        `${label}.member cannot be active outside an active pool.`,
      );
    }
    const totalPaid = requireCanonicalQuantity(
      member.total_paid,
      `${label}.member.total_paid`,
    );
    const totalRefunded = requireCanonicalQuantity(
      member.total_refunded,
      `${label}.member.total_refunded`,
    );
    const lastCharge = requireCanonicalQuantity(
      member.last_charge,
      `${label}.member.last_charge`,
    );
    if (
      compareCanonicalQuantities(totalRefunded, totalPaid) > 0 ||
      compareCanonicalQuantities(lastCharge, totalPaid) > 0
    ) {
      throw new Error(
        `${label}.member refunds and last charge must not exceed total_paid.`,
      );
    }
    memberView = {
      schemaVersion: 1,
      poolId: poolView.poolId,
      sourceId,
      accountId,
      status,
      joinedAtMs,
      updatedAtMs,
      totalPaid,
      totalRefunded,
      lastCharge,
      serviceBindings: readExactNameArray(
        member.service_bindings,
        `${label}.member.service_bindings`,
      ),
      apartmentBindings: readExactNameArray(
        member.apartment_bindings,
        `${label}.member.apartment_bindings`,
      ),
    };
  }

  let latestAuditEventView: SoraCloudHfAuditEventView | null = null;
  if (payload.latest_audit_event !== null) {
    if (poolView === null) {
      throw new Error(`${label}.latest_audit_event requires a matching pool.`);
    }
    const event = requireRecord(
      payload.latest_audit_event,
      `${label}.latest_audit_event`,
    );
    requireExactKeys(
      event,
      [
        "schema_version",
        "sequence",
        "action",
        "pool_id",
        "source_id",
        "account_id",
        "occurred_at_ms",
        "active_member_count",
        "charged",
        "refunded",
        "lease_expires_at_ms",
        "service_name",
        "apartment_name",
      ],
      `${label}.latest_audit_event`,
    );
    if (event.schema_version !== 1) {
      throw new Error(`${label}.latest_audit_event.schema_version must be 1.`);
    }
    if (auditEventCount === 0) {
      throw new Error(`${label}.latest_audit_event requires a positive count.`);
    }
    const eventPoolId = requireCanonicalHashLiteral(
      event.pool_id,
      `${label}.latest_audit_event.pool_id`,
    );
    const eventSourceId = requireCanonicalHashLiteral(
      event.source_id,
      `${label}.latest_audit_event.source_id`,
    );
    if (
      eventSourceId !== sourceId ||
      (poolView !== null && eventPoolId !== poolView.poolId)
    ) {
      throw new Error(
        `${label}.latest_audit_event identifiers are inconsistent.`,
      );
    }
    const accountId = requireCanonicalI105AccountId(
      event.account_id,
      `${label}.latest_audit_event.account_id`,
      validateAccountId,
    );
    if (expected?.accountId !== undefined && accountId !== expected.accountId) {
      throw new Error(
        `${label}.latest_audit_event.account_id does not match the query.`,
      );
    }
    latestAuditEventView = {
      schemaVersion: 1,
      sequence: requirePositiveSafeInteger(
        event.sequence,
        `${label}.latest_audit_event.sequence`,
      ),
      action: readExactUnitVariant(
        event.action,
        "action",
        ["CreateWindow", "Join", "Leave", "Renew", "Retire"] as const,
        `${label}.latest_audit_event.action`,
      ),
      poolId: eventPoolId,
      sourceId: eventSourceId,
      accountId,
      occurredAtMs: requirePositiveSafeInteger(
        event.occurred_at_ms,
        `${label}.latest_audit_event.occurred_at_ms`,
      ),
      activeMemberCount: requireU32(
        event.active_member_count,
        `${label}.latest_audit_event.active_member_count`,
      ),
      charged: requireCanonicalQuantity(
        event.charged,
        `${label}.latest_audit_event.charged`,
      ),
      refunded: requireCanonicalQuantity(
        event.refunded,
        `${label}.latest_audit_event.refunded`,
      ),
      leaseExpiresAtMs: requirePositiveSafeInteger(
        event.lease_expires_at_ms,
        `${label}.latest_audit_event.lease_expires_at_ms`,
      ),
      serviceName:
        event.service_name === null
          ? null
          : requireCanonicalIrohaName(
              event.service_name,
              `${label}.latest_audit_event.service_name`,
            ),
      apartmentName:
        event.apartment_name === null
          ? null
          : requireCanonicalIrohaName(
              event.apartment_name,
              `${label}.latest_audit_event.apartment_name`,
            ),
    };
    if (
      latestAuditEventView.occurredAtMs > latestAuditEventView.leaseExpiresAtMs
    ) {
      throw new Error(
        `${label}.latest_audit_event occurs after its lease expiry.`,
      );
    }
  } else if (auditEventCount !== 0 && expected?.accountId === undefined) {
    throw new Error(
      `${label}.latest_audit_event is missing for an unfiltered non-empty log.`,
    );
  }

  return {
    found: true,
    source: sourceView,
    pool: poolView,
    member: memberView,
    latestAuditEvent: latestAuditEventView,
    auditEventCount,
    storageBaseFee,
    raw: payload,
  };
};

export const missingSoraCloudHfStatus = (
  message: string,
  statusCode = 404,
): SoraCloudHfStatusView => ({
  found: false,
  statusCode,
  message,
  source: null,
  pool: null,
  member: null,
  latestAuditEvent: null,
  auditEventCount: 0,
  storageBaseFee: null,
  raw: null,
});

export const normalizeSoraCloudServiceSummary = (
  service: Record<string, unknown>,
  label = "SoraCloud service",
): SoraCloudServiceSummary => {
  requireExactKeys(
    service,
    [
      "service_name",
      "current_version",
      "revision_count",
      "config_generation",
      "secret_generation",
      "config_entry_count",
      "secret_entry_count",
      "service_lease",
      "public_discovery_content_cid",
      "public_discovery_url",
      "public_discovery_cid_host_url",
      "latest_revision",
      "active_rollout",
      "last_rollout",
    ],
    label,
  );
  const serviceName = requireCanonicalText(
    service.service_name,
    `${label}.service_name`,
  );
  requireNonNegativeSafeInteger(
    service.config_generation,
    `${label}.config_generation`,
  );
  requireNonNegativeSafeInteger(
    service.secret_generation,
    `${label}.secret_generation`,
  );
  optionalCanonicalText(
    service.public_discovery_content_cid,
    `${label}.public_discovery_content_cid`,
  );
  for (const field of [
    "public_discovery_url",
    "public_discovery_cid_host_url",
  ] as const) {
    const url = optionalCanonicalText(service[field], `${label}.${field}`);
    if (url !== null && normalizeUrl(url) === null) {
      throw new Error(`${label}.${field} must be an absolute HTTPS URL.`);
    }
  }
  const latestRevision =
    service.latest_revision === null
      ? null
      : validateServiceRevision(
          service.latest_revision,
          `${label}.latest_revision`,
        );
  const activeRollout =
    service.active_rollout === null
      ? null
      : validateRolloutSnapshot(
          service.active_rollout,
          `${label}.active_rollout`,
        );
  if (service.last_rollout !== null) {
    validateRolloutSnapshot(service.last_rollout, `${label}.last_rollout`);
  }
  const rolloutStage = activeRollout
    ? readTaggedValue(
        activeRollout.stage,
        "stage",
        `${label}.active_rollout.stage`,
      )
    : null;
  const rolloutPercent = activeRollout
    ? requireNonNegativeSafeInteger(
        activeRollout.traffic_percent,
        `${label}.active_rollout.traffic_percent`,
      )
    : null;
  if (rolloutPercent !== null && rolloutPercent > 100) {
    throw new Error(
      `${label}.active_rollout.traffic_percent must not exceed 100.`,
    );
  }
  const serviceLease = validateServiceLeaseSnapshot(
    service.service_lease,
    `${label}.service_lease`,
  );
  return {
    id: serviceName,
    name: serviceName,
    status: serviceStatusFromSnapshot(service),
    currentVersion: requireCanonicalText(
      service.current_version,
      `${label}.current_version`,
    ),
    revisionCount: requireNonNegativeSafeInteger(
      service.revision_count,
      `${label}.revision_count`,
    ),
    configEntryCount: requireNonNegativeSafeInteger(
      service.config_entry_count,
      `${label}.config_entry_count`,
    ),
    secretEntryCount: requireNonNegativeSafeInteger(
      service.secret_entry_count,
      `${label}.secret_entry_count`,
    ),
    routeHost:
      latestRevision?.route_host === undefined ||
      latestRevision.route_host === null
        ? null
        : requireCanonicalText(
            latestRevision.route_host,
            `${label}.latest_revision.route_host`,
          ),
    publicUrls: deriveSoraCloudPublicUrls(service),
    rolloutStage: rolloutStage || null,
    rolloutPercent,
    leaseStatus: serviceLease?.status ?? null,
    leaseExpiresHeight: serviceLease?.expiresHeight ?? null,
    remainingRuntimeBalanceNanos: serviceLease?.remainingRuntimeBalance ?? null,
    latestSequence: latestRevision
      ? requireNonNegativeSafeInteger(
          latestRevision.sequence,
          `${label}.latest_revision.sequence`,
        )
      : null,
    signedBy:
      latestRevision === null
        ? null
        : requireCanonicalText(
            latestRevision.signed_by,
            `${label}.latest_revision.signed_by`,
          ),
    raw: service,
  };
};

export const soraCloudStatusTone = (
  status: SoraCloudServiceStatus,
): "positive" | "warning" | "error" | "muted" => {
  if (status === "healthy") {
    return "positive";
  }
  if (status === "deploying" || status === "warning") {
    return "warning";
  }
  if (status === "failed") {
    return "error";
  }
  return "muted";
};

export const sortSoraCloudServices = (
  services: SoraCloudServiceSummary[],
): SoraCloudServiceSummary[] => {
  const statusRank: Record<SoraCloudServiceStatus, number> = {
    failed: 0,
    warning: 1,
    deploying: 2,
    healthy: 3,
    paused: 4,
    unknown: 5,
  };
  return [...services].sort((left, right) => {
    const statusDelta = statusRank[left.status] - statusRank[right.status];
    if (statusDelta !== 0) return statusDelta;
    return (right.latestSequence ?? 0) - (left.latestSequence ?? 0);
  });
};

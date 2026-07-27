export type SoraCloudAvailability =
  | "unknown"
  | "available"
  | "unavailable"
  | "error";

export type SoraCloudDeploymentStatus =
  | "healthy"
  | "deploying"
  | "warning"
  | "paused"
  | "failed"
  | "unknown";

export type SoraCloudStorageClass = "hot" | "warm" | "cold";

export interface SoraCloudDeploymentEvent {
  id: string;
  messageKey: string;
  atMs: number | null;
}

export interface SoraCloudServiceHealth {
  name: string;
  status: SoraCloudDeploymentStatus;
  latencyMs: number | null;
}

export interface SoraCloudDeployment {
  id: string;
  name: string;
  templateLabel?: string | null;
  environment?: string | null;
  regionLabel?: string | null;
  version?: string | null;
  domain?: string | null;
  status: SoraCloudDeploymentStatus;
  replicas: number | null;
  targetReplicas: number | null;
  requestsPerMinute: number | null;
  monthlyXor: number | null;
  updatedAtMs: number | null;
  services: SoraCloudServiceHealth[];
  events: SoraCloudDeploymentEvent[];
}

export interface SoraCloudDeploymentSummary {
  total: number;
  healthy: number;
  deploying: number;
  attention: number;
  paused: number;
  monthlyXor: number;
}

export interface SoraCloudServiceSummary {
  id: string;
  name: string;
  status: SoraCloudDeploymentStatus;
  currentVersion: string;
  revisionCount: number;
  configEntryCount: number;
  secretEntryCount: number;
  routeHost: string | null;
  publicUrls: string[];
  rolloutStage: string | null;
  rolloutPercent: number | null;
  leaseStatus: string | null;
  leaseExpiresSequence: number | null;
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
  revision?: string;
  storageClass: SoraCloudStorageClass;
  leaseTermMs: number;
  accountId?: string;
}

export interface SoraCloudHfStatusView {
  found: boolean;
  statusCode?: number;
  message?: string;
  raw: Record<string, unknown> | null;
}

const SERVICE_NAME_FALLBACK = "hf-model-service";
const MON_GATEWAY_HOST_SUFFIX = ".mon.taira.sora.org";
const BASE58_ASSET_DEFINITION_RE = /^[1-9A-HJ-NP-Za-km-z]+$/u;
const CANONICAL_QUANTITY_RE = /^(?:0|[1-9]\d*)(?:\.(?:\d{0,27}[1-9]))?$/u;

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
  if (typeof value !== "string" || !value || value.trim() !== value) {
    throw new Error(`${label} must be a canonical non-empty string.`);
  }
  return value;
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

const optionalNonNegativeSafeInteger = (
  value: unknown,
  label: string,
): number | null => {
  if (value === undefined || value === null) return null;
  return requireNonNegativeSafeInteger(value, label);
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
  return literal;
};

const assertSnakeCaseFields = (
  value: Record<string, unknown>,
  label: string,
) => {
  const invalid = Object.keys(value).filter(
    (key) => !/^[a-z][a-z0-9_]*$/u.test(key),
  );
  if (invalid.length > 0) {
    throw new Error(
      `${label} contains non-canonical fields: ${invalid.join(", ")}.`,
    );
  }
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

const requireAllowedKeys = (
  value: Record<string, unknown>,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[],
  label: string,
) => {
  const allowed = new Set([...requiredKeys, ...optionalKeys]);
  const missing = requiredKeys.filter((key) => !hasOwn(value, key));
  const unexpected = Object.keys(value).filter((key) => !allowed.has(key));
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
  tag: "status" | "stage",
  label: string,
): string => {
  const record = requireRecord(value, label);
  assertSnakeCaseFields(record, label);
  const allowed = new Set([tag, "value"]);
  const unexpected = Object.keys(record).filter((key) => !allowed.has(key));
  if (unexpected.length > 0 || !hasOwn(record, tag)) {
    throw new Error(`${label} must use the canonical ${tag} tag.`);
  }
  return requireCanonicalText(record[tag], `${label}.${tag}`);
};

const serviceStatusFromSnapshot = (
  service: Record<string, unknown>,
): SoraCloudDeploymentStatus => {
  const activeRollout = isRecord(service.active_rollout)
    ? service.active_rollout
    : null;
  const latestRevision = isRecord(service.latest_revision)
    ? service.latest_revision
    : null;
  const leaseStatus =
    service.service_lease_status === undefined ||
    service.service_lease_status === null
      ? ""
      : readTaggedValue(
          service.service_lease_status,
          "status",
          "SoraCloud service.service_lease_status",
        ).toLowerCase();

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
  const literal = trimString(value);
  if (!literal) return null;
  if (/^https?:\/\//iu.test(literal)) return literal;
  return null;
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

export const normalizeSoraCloudStatusPayload = (
  payload: Record<string, unknown>,
): SoraCloudStatusView => {
  const label = "SoraCloud status response";
  assertSnakeCaseFields(payload, label);
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
  if (!Array.isArray(controlPlane.services)) {
    throw new Error(`${label}.control_plane.services must be an array.`);
  }
  const services = controlPlane.services.map((service, index) =>
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
  if (!Array.isArray(controlPlane.recent_audit_events)) {
    throw new Error(
      `${label}.control_plane.recent_audit_events must be an array.`,
    );
  }
  const recentAuditEvents = controlPlane.recent_audit_events.map(
    (event, index) => {
      const record = requireRecord(
        event,
        `${label}.control_plane.recent_audit_events[${index}]`,
      );
      assertSnakeCaseFields(
        record,
        `${label}.control_plane.recent_audit_events[${index}]`,
      );
      return record;
    },
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
): Record<string, string | number | undefined> => {
  const repoId = trimString(input.repoId);
  if (!repoId) {
    throw new Error("Hugging Face repo is required.");
  }
  if (!["hot", "warm", "cold"].includes(input.storageClass)) {
    throw new Error("SoraCloud storage class is invalid.");
  }
  if (!Number.isSafeInteger(input.leaseTermMs) || input.leaseTermMs <= 0) {
    throw new Error("Lease duration must be greater than zero.");
  }
  return {
    repo_id: repoId,
    revision: trimString(input.revision) || undefined,
    storage_class: input.storageClass,
    lease_term_ms: input.leaseTermMs,
    account_id: trimString(input.accountId) || undefined,
  };
};

export const normalizeSoraCloudHfStatusPayload = (
  payload: Record<string, unknown>,
): SoraCloudHfStatusView => ({
  found: true,
  raw: payload,
});

export const missingSoraCloudHfStatus = (
  message: string,
  statusCode = 404,
): SoraCloudHfStatusView => ({
  found: false,
  statusCode,
  message,
  raw: null,
});

export const normalizeSoraCloudServiceSummary = (
  service: Record<string, unknown>,
  label = "SoraCloud service",
): SoraCloudServiceSummary => {
  assertSnakeCaseFields(service, label);
  requireAllowedKeys(
    service,
    [
      "service_name",
      "current_version",
      "revision_count",
      "config_generation",
      "secret_generation",
      "config_entry_count",
      "secret_entry_count",
      "latest_revision",
    ],
    [
      "quota_class",
      "service_lease_status",
      "lease_expires_sequence",
      "prepaid_runtime_balance",
      "remaining_runtime_balance",
      "public_discovery_content_cid",
      "public_discovery_url",
      "public_discovery_cid_host_url",
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
  optionalCanonicalText(service.quota_class, `${label}.quota_class`);
  optionalCanonicalQuantity(
    service.prepaid_runtime_balance,
    `${label}.prepaid_runtime_balance`,
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
      throw new Error(`${label}.${field} must be an absolute HTTP(S) URL.`);
    }
  }
  const latestRevision =
    service.latest_revision === null
      ? null
      : requireRecord(service.latest_revision, `${label}.latest_revision`);
  if (latestRevision) {
    assertSnakeCaseFields(latestRevision, `${label}.latest_revision`);
    requireNonNegativeSafeInteger(
      latestRevision.sequence,
      `${label}.latest_revision.sequence`,
    );
    requireCanonicalText(
      latestRevision.service_version,
      `${label}.latest_revision.service_version`,
    );
    requireCanonicalText(
      latestRevision.signed_by,
      `${label}.latest_revision.signed_by`,
    );
    for (const field of [
      "base_url",
      "public_discovery_url",
      "public_discovery_cid_host_url",
    ] as const) {
      const url = optionalCanonicalText(
        latestRevision[field],
        `${label}.latest_revision.${field}`,
      );
      if (url !== null && normalizeUrl(url) === null) {
        throw new Error(
          `${label}.latest_revision.${field} must be an absolute HTTP(S) URL.`,
        );
      }
    }
  }
  const activeRollout =
    service.active_rollout === undefined || service.active_rollout === null
      ? null
      : requireRecord(service.active_rollout, `${label}.active_rollout`);
  if (activeRollout) {
    assertSnakeCaseFields(activeRollout, `${label}.active_rollout`);
  }
  if (service.last_rollout !== undefined && service.last_rollout !== null) {
    const lastRollout = requireRecord(
      service.last_rollout,
      `${label}.last_rollout`,
    );
    assertSnakeCaseFields(lastRollout, `${label}.last_rollout`);
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
  const leaseStatus =
    service.service_lease_status === undefined ||
    service.service_lease_status === null
      ? null
      : readTaggedValue(
          service.service_lease_status,
          "status",
          `${label}.service_lease_status`,
        );
  const remainingRuntimeBalance = optionalCanonicalQuantity(
    service.remaining_runtime_balance,
    `${label}.remaining_runtime_balance`,
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
    leaseStatus,
    leaseExpiresSequence: optionalNonNegativeSafeInteger(
      service.lease_expires_sequence,
      `${label}.lease_expires_sequence`,
    ),
    remainingRuntimeBalanceNanos: remainingRuntimeBalance,
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

export const summarizeSoraCloudDeployments = (
  deployments: SoraCloudDeployment[],
): SoraCloudDeploymentSummary =>
  deployments.reduce<SoraCloudDeploymentSummary>(
    (summary, deployment) => {
      summary.total += 1;
      if (Number.isFinite(deployment.monthlyXor)) {
        summary.monthlyXor += deployment.monthlyXor ?? 0;
      }
      if (deployment.status === "healthy") {
        summary.healthy += 1;
      } else if (deployment.status === "deploying") {
        summary.deploying += 1;
      } else if (deployment.status === "paused") {
        summary.paused += 1;
      } else if (
        deployment.status === "warning" ||
        deployment.status === "failed"
      ) {
        summary.attention += 1;
      }
      return summary;
    },
    {
      total: 0,
      healthy: 0,
      deploying: 0,
      attention: 0,
      paused: 0,
      monthlyXor: 0,
    },
  );

export const soraCloudStatusTone = (
  status: SoraCloudDeploymentStatus,
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

export const sortSoraCloudDeployments = (
  deployments: SoraCloudDeployment[],
): SoraCloudDeployment[] => {
  const statusRank: Record<SoraCloudDeploymentStatus, number> = {
    failed: 0,
    warning: 1,
    deploying: 2,
    healthy: 3,
    paused: 4,
    unknown: 5,
  };
  return [...deployments].sort((left, right) => {
    const statusDelta = statusRank[left.status] - statusRank[right.status];
    if (statusDelta !== 0) {
      return statusDelta;
    }
    return (right.updatedAtMs ?? 0) - (left.updatedAtMs ?? 0);
  });
};

export const sortSoraCloudServices = (
  services: SoraCloudServiceSummary[],
): SoraCloudServiceSummary[] => {
  const statusRank: Record<SoraCloudDeploymentStatus, number> = {
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

export const deriveSoraCloudModelName = (repoId: string): string => {
  const slug = trimString(repoId).split("/").filter(Boolean).at(-1) ?? "";
  return sanitizeSoraCloudIdentifier(slug || "model", "model");
};

export const deriveSoraCloudServiceName = (
  repoId: string,
  accountId?: string | null,
): string => {
  const model = deriveSoraCloudModelName(repoId);
  const accountPrefix = sanitizeSoraCloudIdentifier(
    trimString(accountId).slice(0, 10),
    "",
  );
  return sanitizeSoraCloudIdentifier(
    accountPrefix ? `${accountPrefix}-${model}` : `${model}-service`,
    SERVICE_NAME_FALLBACK,
  ).slice(0, 48);
};

export const sanitizeSoraCloudIdentifier = (
  value: string,
  fallback: string,
): string => {
  const normalized = trimString(value)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/gu, "-")
    .replace(/-+/gu, "-")
    .replace(/^[-_]+|[-_]+$/gu, "");
  return normalized || fallback;
};

export const validateSoraCloudServiceName = (value: string): boolean =>
  /^[a-z][a-z0-9_-]{2,63}$/u.test(trimString(value));

export const validateSoraCloudLeaseAssetDefinitionId = (
  value: string,
): boolean => {
  const literal = trimString(value);
  return Boolean(literal) && BASE58_ASSET_DEFINITION_RE.test(literal);
};

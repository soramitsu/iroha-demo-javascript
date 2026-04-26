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

const SERVICE_NAME_FALLBACK = "hf-model-service";
const MON_GATEWAY_HOST_SUFFIX = ".mon.taira.sora.org";
const BASE58_ASSET_DEFINITION_RE = /^[1-9A-HJ-NP-Za-km-z]+$/u;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const trimString = (value: unknown): string => String(value ?? "").trim();

const numberOrNull = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const integerOrNull = (value: unknown): number | null => {
  const parsed = numberOrNull(value);
  return parsed === null ? null : Math.trunc(parsed);
};

const readTaggedValue = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (isRecord(value)) {
    return trimString(value.status ?? value.stage ?? value.value);
  }
  return "";
};

const serviceStatusFromSnapshot = (
  service: Record<string, unknown>,
): SoraCloudDeploymentStatus => {
  const activeRollout = isRecord(service.active_rollout)
    ? service.active_rollout
    : isRecord(service.activeRollout)
      ? service.activeRollout
      : null;
  const latestRevision = isRecord(service.latest_revision)
    ? service.latest_revision
    : isRecord(service.latestRevision)
      ? service.latestRevision
      : null;
  const leaseStatus = readTaggedValue(
    service.service_lease_status ?? service.serviceLeaseStatus,
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
    : isRecord(service.latestRevision)
      ? service.latestRevision
      : {};
  const routeHost = trimString(
    latestRevision.route_host ?? latestRevision.routeHost,
  );
  const monRoute = deriveMonGatewayUrl(routeHost);
  return uniqueStrings([
    normalizeUrl(service.public_discovery_url ?? service.publicDiscoveryUrl),
    normalizeUrl(
      service.public_discovery_cid_host_url ??
        service.publicDiscoveryCidHostUrl,
    ),
    normalizeUrl(
      latestRevision.public_discovery_url ?? latestRevision.publicDiscoveryUrl,
    ),
    normalizeUrl(
      latestRevision.public_discovery_cid_host_url ??
        latestRevision.publicDiscoveryCidHostUrl,
    ),
    normalizeUrl(latestRevision.base_url ?? latestRevision.baseUrl),
    monRoute,
  ]);
};

export const normalizeSoraCloudStatusPayload = (
  payload: Record<string, unknown>,
): SoraCloudStatusView => {
  const controlPlane = isRecord(payload.control_plane)
    ? payload.control_plane
    : isRecord(payload.controlPlane)
      ? payload.controlPlane
      : {};
  const rawServices = Array.isArray(controlPlane.services)
    ? controlPlane.services.filter(isRecord)
    : [];
  const services = rawServices.map(normalizeSoraCloudServiceSummary);
  return {
    available: true,
    schemaVersion: integerOrNull(
      payload.schema_version ??
        payload.schemaVersion ??
        controlPlane.schema_version ??
        controlPlane.schemaVersion,
    ),
    serviceCount:
      integerOrNull(controlPlane.service_count ?? controlPlane.serviceCount) ??
      services.length,
    auditEventCount:
      integerOrNull(
        controlPlane.audit_event_count ?? controlPlane.auditEventCount,
      ) ?? 0,
    services,
    recentAuditEvents: Array.isArray(controlPlane.recent_audit_events)
      ? controlPlane.recent_audit_events.filter(isRecord)
      : [],
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

export const normalizeSoraCloudServiceSummary = (
  service: Record<string, unknown>,
): SoraCloudServiceSummary => {
  const latestRevision = isRecord(service.latest_revision)
    ? service.latest_revision
    : isRecord(service.latestRevision)
      ? service.latestRevision
      : {};
  const activeRollout = isRecord(service.active_rollout)
    ? service.active_rollout
    : isRecord(service.activeRollout)
      ? service.activeRollout
      : null;
  const serviceName = trimString(
    service.service_name ?? service.serviceName ?? service.name,
  );
  const rolloutStage = activeRollout
    ? readTaggedValue(activeRollout.stage)
    : null;
  return {
    id: serviceName || SERVICE_NAME_FALLBACK,
    name: serviceName || SERVICE_NAME_FALLBACK,
    status: serviceStatusFromSnapshot(service),
    currentVersion: trimString(
      service.current_version ??
        service.currentVersion ??
        latestRevision.service_version ??
        latestRevision.serviceVersion,
    ),
    revisionCount:
      integerOrNull(service.revision_count ?? service.revisionCount) ?? 0,
    configEntryCount:
      integerOrNull(service.config_entry_count ?? service.configEntryCount) ??
      0,
    secretEntryCount:
      integerOrNull(service.secret_entry_count ?? service.secretEntryCount) ??
      0,
    routeHost:
      trimString(latestRevision.route_host ?? latestRevision.routeHost) || null,
    publicUrls: deriveSoraCloudPublicUrls(service),
    rolloutStage: rolloutStage || null,
    rolloutPercent:
      integerOrNull(
        activeRollout?.traffic_percent ??
          activeRollout?.trafficPercent ??
          activeRollout?.canary_percent ??
          activeRollout?.canaryPercent,
      ) ?? null,
    leaseStatus:
      readTaggedValue(
        service.service_lease_status ?? service.serviceLeaseStatus,
      ) || null,
    leaseExpiresSequence: integerOrNull(
      service.lease_expires_sequence ?? service.leaseExpiresSequence,
    ),
    remainingRuntimeBalanceNanos:
      service.remaining_runtime_balance_nanos !== undefined
        ? trimString(service.remaining_runtime_balance_nanos)
        : service.remainingRuntimeBalanceNanos !== undefined
          ? trimString(service.remainingRuntimeBalanceNanos)
          : null,
    latestSequence: integerOrNull(latestRevision.sequence),
    signedBy:
      trimString(latestRevision.signed_by ?? latestRevision.signedBy) || null,
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

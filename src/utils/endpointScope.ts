import { normalizeEndpointUrl } from "./endpoint";
import type { EndpointInspection } from "../types/endpointInspection";

export const ENDPOINT_DERIVED_STORAGE_VERSION = "v2";

export interface EndpointIdentityScopeInput {
  toriiUrl: string;
  observedChainId: string;
  observedNetworkPrefix: number;
}

export interface EndpointIdentityScope {
  origin: string;
  chainId: string;
  networkPrefix: number;
  storageSegment: string;
}

const normalizeStorageDimension = (value: string, label: string) => {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${label} is required for endpoint-derived storage.`);
  }
  return encodeURIComponent(normalized);
};

export const buildEndpointIdentityScope = (
  input: EndpointIdentityScopeInput,
): EndpointIdentityScope => {
  const endpoint = new URL(normalizeEndpointUrl(input.toriiUrl));
  if (endpoint.username || endpoint.password) {
    throw new Error(
      "Endpoint credentials are not allowed in endpoint-derived storage scope.",
    );
  }
  const origin = endpoint.origin;
  const chainId = input.observedChainId.trim();
  if (!chainId) {
    throw new Error(
      "Observed chain ID is required for endpoint-derived storage.",
    );
  }
  if (
    !Number.isInteger(input.observedNetworkPrefix) ||
    input.observedNetworkPrefix < 0 ||
    input.observedNetworkPrefix > 0x3fff
  ) {
    throw new Error(
      "Observed network prefix must be an integer between 0 and 16383.",
    );
  }
  return {
    origin,
    chainId,
    networkPrefix: input.observedNetworkPrefix,
    storageSegment: [
      ENDPOINT_DERIVED_STORAGE_VERSION,
      encodeURIComponent(origin),
      encodeURIComponent(chainId),
      String(input.observedNetworkPrefix),
    ].join(":"),
  };
};

export const buildEndpointDerivedStorageKey = (
  namespace: string,
  input: EndpointIdentityScopeInput,
  dimensions: string[] = [],
): string => {
  const normalizedNamespace = namespace.trim().replace(/:+$/u, "");
  if (!normalizedNamespace) {
    throw new Error("Storage namespace is required.");
  }
  const scope = buildEndpointIdentityScope(input);
  const suffix = dimensions.map((value, index) =>
    normalizeStorageDimension(value, `Storage dimension ${index + 1}`),
  );
  return [normalizedNamespace, scope.storageSegment, ...suffix].join(":");
};

export const getTrustedEndpointIdentityScopeInput = (
  inspection: EndpointInspection,
): EndpointIdentityScopeInput | null => {
  if (!inspection.observed || inspection.identityStatus === "conflicting") {
    return null;
  }
  const hasMatchingAuthoritativeEvidence = inspection.evidence.some(
    (entry) =>
      (entry.source === "governance-capabilities-v1" ||
        entry.source === "chain-metadata" ||
        entry.source === "blocked-deployment-fingerprint") &&
      entry.identity.chainId === inspection.observed?.chainId &&
      entry.identity.networkPrefix === inspection.observed?.networkPrefix,
  );
  if (!hasMatchingAuthoritativeEvidence) {
    return null;
  }
  return {
    toriiUrl: inspection.toriiUrl,
    observedChainId: inspection.observed.chainId,
    observedNetworkPrefix: inspection.observed.networkPrefix,
  };
};

export const buildTrustedEndpointIdentityScope = (
  inspection: EndpointInspection,
): EndpointIdentityScope | null => {
  const input = getTrustedEndpointIdentityScopeInput(inspection);
  return input ? buildEndpointIdentityScope(input) : null;
};

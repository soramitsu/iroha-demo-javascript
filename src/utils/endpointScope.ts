import { normalizeEndpointUrl } from "./endpoint";
import type { EndpointInspection } from "../types/endpointInspection";

export const ENDPOINT_DERIVED_STORAGE_VERSION = "v3";

export interface EndpointIdentityScopeInput {
  toriiUrl: string;
  observedChainId: string;
  observedNetworkPrefix: number;
  observedGenesisHash: string;
}

export interface EndpointIdentityScope {
  origin: string;
  chainId: string;
  networkPrefix: number;
  genesisHash: string;
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
  const genesisHash = input.observedGenesisHash;
  if (!/^[0-9a-f]{64}$/u.test(genesisHash)) {
    throw new Error(
      "Observed genesis hash must be exactly 64 lowercase hexadecimal characters.",
    );
  }
  return {
    origin,
    chainId,
    networkPrefix: input.observedNetworkPrefix,
    genesisHash,
    storageSegment: [
      ENDPOINT_DERIVED_STORAGE_VERSION,
      encodeURIComponent(origin),
      encodeURIComponent(chainId),
      String(input.observedNetworkPrefix),
      genesisHash,
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
  const observed = inspection.observed;
  if (
    !observed?.networkId ||
    !observed.genesisHash ||
    inspection.identityStatus === "conflicting"
  ) {
    return null;
  }
  // Both independent public sources must have attested the same NetworkId.
  const attestedBy = (source: "account-capabilities" | "genesis-block") =>
    inspection.evidence.some(
      (entry) =>
        entry.source === source &&
        entry.identity.networkId === observed.networkId,
    );
  if (!attestedBy("account-capabilities") || !attestedBy("genesis-block")) {
    return null;
  }
  return {
    toriiUrl: inspection.toriiUrl,
    observedChainId: observed.chainId,
    observedNetworkPrefix: observed.networkPrefix,
    observedGenesisHash: observed.genesisHash,
  };
};

export const buildTrustedEndpointIdentityScope = (
  inspection: EndpointInspection,
): EndpointIdentityScope | null => {
  const input = getTrustedEndpointIdentityScopeInput(inspection);
  return input ? buildEndpointIdentityScope(input) : null;
};

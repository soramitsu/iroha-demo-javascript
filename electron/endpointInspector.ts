import { parseGovernanceCapabilitiesV1 } from "./governanceCapabilities";
import { parseRetryAfterMs, withBoundedHttpGetRetry } from "./httpReadRetry";
import { nodeFetch } from "./nodeFetch";
import {
  normalizeChainMetadata,
  parseFirstReleaseChainMetadataPayload,
  type ChainMetadataDraft,
} from "../src/utils/chainMetadata";
import { normalizeEndpointUrl } from "../src/utils/endpoint";
import {
  canAttemptFaucetIdentityChallenge,
  isEndpointFeatureOperationSupported,
  normalizeEndpointOperation,
} from "../src/utils/endpointFeatures";
export {
  canAttemptFaucetIdentityChallenge,
  isEndpointFeatureOperationSupported,
} from "../src/utils/endpointFeatures";
import type {
  EndpointChainIdentity,
  EndpointDiagnostic,
  EndpointFeature,
  EndpointFeatureMap,
  EndpointIdentityEvidence,
  EndpointInspection,
  EndpointNetworkContext,
} from "../src/types/endpointInspection";
import {
  getTrustedEndpointIdentityScopeInput,
  type EndpointIdentityScopeInput,
} from "../src/utils/endpointScope";

type FetchLike = (
  input: Parameters<typeof fetch>[0],
  init?: RequestInit,
) => Promise<Response>;

type EndpointInspectorOptions = {
  fetchImpl?: FetchLike;
  now?: () => number;
  timeoutMs?: number;
};

type ProbeResult = {
  reachedEndpoint: boolean;
  evidence: EndpointIdentityEvidence[];
  openApiOperations?: string[];
};

const DEFAULT_TIMEOUT_MS = 5_000;
const ENDPOINT_PROBE_CONCURRENCY = 2;
const HTTP_DISCOVERY_METHODS = [
  "get",
  "post",
  "put",
  "patch",
  "delete",
] as const;
const SORACLOUD_HF_DEPLOY_CONTRACT_EXTENSION =
  "x-iroha-soracloud-hf-deploy-contract";
const SORACLOUD_HF_DEPLOY_CONTRACT_VERSION = "cap-bound-local-signing-v1";
const SORACLOUD_HF_DEPLOY_CONTRACT_OPERATION =
  "CONTRACT /v1/soracloud/hf/deploy cap-bound-local-signing-v1";
const FINALIZED_TRANSACTION_EVIDENCE_OPERATIONS = [
  "GET /v1/pipeline/transactions/status",
  "GET /v1/explorer/transactions/{hash}",
  "GET /v1/explorer/blocks/{identifier}",
  "GET /v1/explorer/metrics",
] as const;

const FEATURE_OPERATION_REQUIREMENTS: Record<
  EndpointFeature,
  readonly string[]
> = {
  accountRegistration: [
    "POST /v1/fees/quote",
    "POST /v1/pipeline/transactions",
    ...FINALIZED_TRANSACTION_EVIDENCE_OPERATIONS,
  ],
  accountOnboarding: ["POST /v1/accounts/onboard"],
  assetTransfers: [
    "POST /v1/fees/quote",
    "POST /v1/pipeline/transactions",
    ...FINALIZED_TRANSACTION_EVIDENCE_OPERATIONS,
  ],
  faucetClaim: [
    "GET /v1/accounts/faucet/puzzle",
    "POST /v1/accounts/faucet",
    "GET /v1/sumeragi/status",
    ...FINALIZED_TRANSACTION_EVIDENCE_OPERATIONS,
  ],
  confidentialTransfers: [
    "POST /v1/fees/quote",
    "POST /v1/pipeline/transactions",
    "POST /v1/pipeline/transaction-entrypoints",
    "POST /v1/zk/roots",
    "POST /v1/confidential/relay/submit",
    ...FINALIZED_TRANSACTION_EVIDENCE_OPERATIONS,
  ],
  kaigiMeetings: [
    "POST /v1/fees/quote",
    "POST /v1/pipeline/transactions",
    "POST /v1/pipeline/transaction-entrypoints",
    "POST /v1/zk/roots",
    ...FINALIZED_TRANSACTION_EVIDENCE_OPERATIONS,
  ],
  governanceWrites: [
    "POST /v1/fees/quote",
    "POST /v1/gov/citizens/draft",
    "POST /v1/validation-fee/proposals/draft",
    "POST /v1/validation-fee/proposals/{proposal_id}/plain-ballot/draft",
    "POST /v1/gov/ballots/plain",
    "POST /v1/gov/parliament/ballots",
    "POST /v1/pipeline/transactions",
    ...FINALIZED_TRANSACTION_EVIDENCE_OPERATIONS,
  ],
  stakingWrites: [
    "POST /v1/fees/quote",
    "POST /v1/pipeline/transactions",
    ...FINALIZED_TRANSACTION_EVIDENCE_OPERATIONS,
  ],
  subscriptionWrites: [
    "POST /v1/fees/quote",
    "POST /v1/pipeline/transactions",
    "POST /v1/subscriptions",
    "POST /v1/subscriptions/{subscription_id}/pause",
    "POST /v1/subscriptions/{subscription_id}/resume",
    "POST /v1/subscriptions/{subscription_id}/cancel",
    "POST /v1/subscriptions/{subscription_id}/keep",
    "POST /v1/subscriptions/{subscription_id}/charge-now",
    ...FINALIZED_TRANSACTION_EVIDENCE_OPERATIONS,
  ],
  soraCloudDeploy: [
    "POST /v1/fees/quote",
    "POST /v1/pipeline/transactions",
    "POST /v1/soracloud/hf/deploy",
    SORACLOUD_HF_DEPLOY_CONTRACT_OPERATION,
    ...FINALIZED_TRANSACTION_EVIDENCE_OPERATIONS,
  ],
  vpnSessions: [
    "POST /v1/fees/quote",
    "POST /v1/vpn/quotes",
    "POST /v1/vpn/sessions",
    "DELETE /v1/vpn/sessions/{session_id}",
    ...FINALIZED_TRANSACTION_EVIDENCE_OPERATIONS,
  ],
  irohaConnectSessions: ["POST /v1/connect/session"],
  zkProofJobs: [
    "POST /v1/fees/quote",
    "POST /v1/zk/ivm/derive",
    "POST /v1/zk/ivm/prove",
    "DELETE /v1/zk/ivm/prove/{job_id}",
    "POST /v1/pipeline/transactions",
    ...FINALIZED_TRANSACTION_EVIDENCE_OPERATIONS,
  ],
};

// This is a deny-only fingerprint for the archived deployment currently served
// by the public Taira hostname. It must never be used to authorize a write.
const BLOCKED_DEPLOYMENT_FINGERPRINTS: ReadonlyArray<{
  genesisHash: string;
  identity: EndpointChainIdentity;
}> = [
  {
    genesisHash:
      "cc62233ac63ec4131207a35c28b84d5fb22f0c954bd7b2d0f2edc50541117121",
    identity: {
      chainId: "809574f5-fee7-5e69-bfcf-52451e42d50f",
      networkPrefix: 369,
      genesisHash:
        "cc62233ac63ec4131207a35c28b84d5fb22f0c954bd7b2d0f2edc50541117121",
    },
  },
];

const normalizeHash = (value: unknown): string | null => {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  return /^[0-9a-f]{64}$/u.test(normalized) ? normalized : null;
};

const readHeaderMetadata = (response: Response): ChainMetadataDraft => ({
  chainId: response.headers.get("x-iroha-chain-id"),
  networkPrefix: response.headers.get("x-iroha-network-prefix"),
});

const completeIdentity = (
  draft: ChainMetadataDraft,
): EndpointChainIdentity | null => {
  try {
    return normalizeChainMetadata(draft);
  } catch {
    return null;
  }
};

const evidenceFor = (
  source: EndpointIdentityEvidence["source"],
  identity: EndpointChainIdentity,
  observedAtMs: number,
): EndpointIdentityEvidence => ({
  source,
  identity,
  observedAtMs,
});

const fetchWithTimeout = async (
  fetchImpl: FetchLike,
  endpoint: string,
  timeoutMs: number,
): Promise<Response> => {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new Error("Endpoint probe timed out.")),
    timeoutMs,
  );
  try {
    let lastRateLimitedResponse: Response | null = null;
    try {
      return await withBoundedHttpGetRetry(
        async () => {
          const response = await fetchImpl(endpoint, {
            method: "GET",
            headers: { Accept: "application/json" },
            signal: controller.signal,
          });
          if (response.status !== 429) {
            return response;
          }
          lastRateLimitedResponse = response;
          throw Object.assign(new Error("Endpoint probe was rate limited."), {
            status: 429,
            retryAfterMs: parseRetryAfterMs(
              response.headers.get("retry-after"),
            ),
          });
        },
        { signal: controller.signal },
      );
    } catch (error) {
      if (lastRateLimitedResponse) {
        return lastRateLimitedResponse;
      }
      throw error;
    }
  } finally {
    clearTimeout(timeout);
  }
};

const runEndpointProbes = async (
  probes: Array<() => Promise<ProbeResult>>,
): Promise<ProbeResult[]> => {
  const results = new Array<ProbeResult>(probes.length);
  let nextProbe = 0;
  const worker = async () => {
    while (nextProbe < probes.length) {
      const index = nextProbe;
      nextProbe += 1;
      results[index] = await probes[index]();
    }
  };
  await Promise.all(
    Array.from(
      { length: Math.min(ENDPOINT_PROBE_CONCURRENCY, probes.length) },
      () => worker(),
    ),
  );
  return results;
};

const parseJsonResponse = async (response: Response): Promise<unknown> => {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("json")) {
    return null;
  }
  try {
    return await response.json();
  } catch {
    return null;
  }
};

const readOpenApiWriteOperations = (payload: unknown): string[] => {
  if (
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload) ||
    !("paths" in payload)
  ) {
    return [];
  }
  const paths = (payload as { paths?: unknown }).paths;
  if (!paths || typeof paths !== "object" || Array.isArray(paths)) {
    return [];
  }
  const operations: string[] = [];
  for (const [path, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== "object" || Array.isArray(pathItem)) {
      continue;
    }
    for (const method of HTTP_DISCOVERY_METHODS) {
      const operation = (pathItem as Record<string, unknown>)[method];
      if (
        operation &&
        typeof operation === "object" &&
        !Array.isArray(operation)
      ) {
        operations.push(`${method.toUpperCase()} ${path}`);
      }
    }
  }
  const components = (payload as { components?: unknown }).components;
  const schemas =
    components &&
    typeof components === "object" &&
    !Array.isArray(components) &&
    (components as { schemas?: unknown }).schemas;
  const deployPath = (paths as Record<string, unknown>)[
    "/v1/soracloud/hf/deploy"
  ];
  const deployOperation =
    deployPath && typeof deployPath === "object" && !Array.isArray(deployPath)
      ? (deployPath as Record<string, unknown>).post
      : null;
  const deployResponseSchemaRef =
    deployOperation &&
    typeof deployOperation === "object" &&
    !Array.isArray(deployOperation)
      ? (
          deployOperation as {
            responses?: {
              "200"?: {
                content?: {
                  "application/json"?: { schema?: { $ref?: unknown } };
                };
              };
            };
          }
        ).responses?.["200"]?.content?.["application/json"]?.schema?.$ref
      : null;
  const draftSchema =
    schemas && typeof schemas === "object" && !Array.isArray(schemas)
      ? (schemas as Record<string, unknown>).SoracloudHfDeployDraftV1
      : null;
  const instructionSchema =
    schemas && typeof schemas === "object" && !Array.isArray(schemas)
      ? (schemas as Record<string, unknown>).SoracloudTxInstruction
      : null;
  const requiredFields =
    draftSchema &&
    typeof draftSchema === "object" &&
    !Array.isArray(draftSchema) &&
    Array.isArray((draftSchema as Record<string, unknown>).required)
      ? ((draftSchema as Record<string, unknown>).required as unknown[])
      : [];
  const instructionRequiredFields =
    instructionSchema &&
    typeof instructionSchema === "object" &&
    !Array.isArray(instructionSchema) &&
    Array.isArray((instructionSchema as Record<string, unknown>).required)
      ? ((instructionSchema as Record<string, unknown>).required as unknown[])
      : [];
  const draftProperties =
    draftSchema &&
    typeof draftSchema === "object" &&
    !Array.isArray(draftSchema) &&
    (draftSchema as Record<string, unknown>).properties &&
    typeof (draftSchema as Record<string, unknown>).properties === "object" &&
    !Array.isArray((draftSchema as Record<string, unknown>).properties)
      ? ((draftSchema as Record<string, unknown>).properties as Record<
          string,
          unknown
        >)
      : null;
  const draftInstructions =
    draftProperties?.tx_instructions &&
    typeof draftProperties.tx_instructions === "object" &&
    !Array.isArray(draftProperties.tx_instructions)
      ? (draftProperties.tx_instructions as Record<string, unknown>)
      : null;
  const instructionProperties =
    instructionSchema &&
    typeof instructionSchema === "object" &&
    !Array.isArray(instructionSchema) &&
    (instructionSchema as Record<string, unknown>).properties &&
    typeof (instructionSchema as Record<string, unknown>).properties ===
      "object" &&
    !Array.isArray((instructionSchema as Record<string, unknown>).properties)
      ? ((instructionSchema as Record<string, unknown>).properties as Record<
          string,
          unknown
        >)
      : null;
  const instructionPayloadHex =
    instructionProperties?.payload_hex &&
    typeof instructionProperties.payload_hex === "object" &&
    !Array.isArray(instructionProperties.payload_hex)
      ? (instructionProperties.payload_hex as Record<string, unknown>)
      : null;
  const deployContractIsExact =
    deployOperation !== null &&
    typeof deployOperation === "object" &&
    !Array.isArray(deployOperation) &&
    (deployOperation as Record<string, unknown>)[
      SORACLOUD_HF_DEPLOY_CONTRACT_EXTENSION
    ] === SORACLOUD_HF_DEPLOY_CONTRACT_VERSION &&
    deployResponseSchemaRef ===
      "#/components/schemas/SoracloudHfDeployDraftV1" &&
    draftSchema !== null &&
    typeof draftSchema === "object" &&
    !Array.isArray(draftSchema) &&
    (draftSchema as Record<string, unknown>)[
      SORACLOUD_HF_DEPLOY_CONTRACT_EXTENSION
    ] === SORACLOUD_HF_DEPLOY_CONTRACT_VERSION &&
    (draftSchema as Record<string, unknown>).additionalProperties === false &&
    ["ok", "authority", "signed_by", "tx_instructions"].every((field) =>
      requiredFields.includes(field),
    ) &&
    draftInstructions?.type === "array" &&
    draftInstructions.minItems === 1 &&
    draftInstructions.maxItems === 3 &&
    instructionSchema !== null &&
    typeof instructionSchema === "object" &&
    !Array.isArray(instructionSchema) &&
    (instructionSchema as Record<string, unknown>).additionalProperties ===
      false &&
    ["wire_id", "payload_hex"].every((field) =>
      instructionRequiredFields.includes(field),
    ) &&
    instructionPayloadHex?.type === "string" &&
    instructionPayloadHex.pattern === "^(?:[0-9a-f]{2})+$";
  if (deployContractIsExact) {
    operations.push(SORACLOUD_HF_DEPLOY_CONTRACT_OPERATION);
  }
  return operations;
};

const probeOpenApi = async (
  baseUrl: string,
  fetchImpl: FetchLike,
  timeoutMs: number,
): Promise<ProbeResult> => {
  try {
    const response = await fetchWithTimeout(
      fetchImpl,
      `${baseUrl}/openapi.json`,
      timeoutMs,
    );
    if (!response.ok) {
      return { reachedEndpoint: true, evidence: [] };
    }
    return {
      reachedEndpoint: true,
      evidence: [],
      openApiOperations: readOpenApiWriteOperations(
        await parseJsonResponse(response),
      ),
    };
  } catch {
    return { reachedEndpoint: false, evidence: [] };
  }
};

const featureMapFor = (
  openApiOperations: string[] | null,
): EndpointFeatureMap => {
  const advertised = new Set(
    (openApiOperations ?? []).map(normalizeEndpointOperation),
  );
  return Object.fromEntries(
    Object.entries(FEATURE_OPERATION_REQUIREMENTS).map(
      ([feature, requiredOperations]) => {
        const missingOperations = requiredOperations.filter(
          (operation) => !advertised.has(normalizeEndpointOperation(operation)),
        );
        return [
          feature,
          {
            supported:
              openApiOperations !== null && missingOperations.length === 0,
            source: openApiOperations === null ? "unavailable" : "openapi",
            requiredOperations: [...requiredOperations],
            missingOperations:
              openApiOperations === null
                ? [...requiredOperations]
                : missingOperations,
          },
        ];
      },
    ),
  ) as EndpointFeatureMap;
};

const probeGovernanceCapabilities = async (
  baseUrl: string,
  fetchImpl: FetchLike,
  timeoutMs: number,
  observedAtMs: number,
): Promise<ProbeResult> => {
  try {
    const response = await fetchWithTimeout(
      fetchImpl,
      `${baseUrl}/v1/gov/capabilities`,
      timeoutMs,
    );
    if (!response.ok) {
      return { reachedEndpoint: true, evidence: [] };
    }
    const payload = await parseJsonResponse(response);
    const capabilities = parseGovernanceCapabilitiesV1(payload);
    return {
      reachedEndpoint: true,
      evidence: [
        evidenceFor(
          "governance-capabilities-v1",
          {
            chainId: capabilities.chainId,
            networkPrefix: capabilities.networkPrefix,
            genesisHash: capabilities.genesisHash,
          },
          observedAtMs,
        ),
      ],
    };
  } catch {
    return { reachedEndpoint: false, evidence: [] };
  }
};

const probeChainMetadata = async (
  baseUrl: string,
  fetchImpl: FetchLike,
  timeoutMs: number,
  observedAtMs: number,
): Promise<ProbeResult> => {
  try {
    const response = await fetchWithTimeout(
      fetchImpl,
      `${baseUrl}/v1/chain/metadata`,
      timeoutMs,
    );
    const evidence: EndpointIdentityEvidence[] = [];
    const headerIdentity = completeIdentity(readHeaderMetadata(response));
    if (headerIdentity) {
      evidence.push(
        evidenceFor("response-headers", headerIdentity, observedAtMs),
      );
    }
    if (response.ok) {
      const payload = await parseJsonResponse(response);
      try {
        const payloadIdentity = parseFirstReleaseChainMetadataPayload(payload);
        evidence.push(
          evidenceFor("chain-metadata", payloadIdentity, observedAtMs),
        );
      } catch {
        // Invalid or drifted metadata is not identity evidence.
      }
    }
    return { reachedEndpoint: true, evidence };
  } catch {
    return { reachedEndpoint: false, evidence: [] };
  }
};

const probeGenesisFingerprint = async (
  baseUrl: string,
  fetchImpl: FetchLike,
  timeoutMs: number,
  observedAtMs: number,
): Promise<ProbeResult> => {
  try {
    const response = await fetchWithTimeout(
      fetchImpl,
      `${baseUrl}/v1/explorer/blocks/1`,
      timeoutMs,
    );
    if (!response.ok) {
      return { reachedEndpoint: true, evidence: [] };
    }
    const payload = await parseJsonResponse(response);
    const record =
      payload && typeof payload === "object" && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : null;
    const genesisHash = normalizeHash(record?.hash);
    const blocked = BLOCKED_DEPLOYMENT_FINGERPRINTS.find(
      (entry) => entry.genesisHash === genesisHash,
    );
    return {
      reachedEndpoint: true,
      evidence: blocked
        ? [
            evidenceFor(
              "blocked-deployment-fingerprint",
              blocked.identity,
              observedAtMs,
            ),
          ]
        : [],
    };
  } catch {
    return { reachedEndpoint: false, evidence: [] };
  }
};

const identitiesConflict = (evidence: EndpointIdentityEvidence[]) => {
  if (evidence.length < 2) {
    return false;
  }
  const first = evidence[0].identity;
  return evidence.slice(1).some(({ identity }) => {
    if (
      identity.chainId !== first.chainId ||
      identity.networkPrefix !== first.networkPrefix
    ) {
      return true;
    }
    return Boolean(
      identity.genesisHash &&
        first.genesisHash &&
        identity.genesisHash !== first.genesisHash,
    );
  });
};

const identitiesMatch = (
  expected: EndpointChainIdentity,
  observed: EndpointChainIdentity,
) =>
  expected.chainId === observed.chainId &&
  expected.networkPrefix === observed.networkPrefix &&
  (!expected.genesisHash ||
    !observed.genesisHash ||
    expected.genesisHash === observed.genesisHash);

const diagnosticFor = (input: {
  status: EndpointInspection["identityStatus"];
  expected: EndpointChainIdentity;
  observed: EndpointChainIdentity | null;
}): EndpointDiagnostic => {
  switch (input.status) {
    case "matched":
      return {
        code: "endpoint_identity_matched",
        message: "Endpoint identity matches the configured network.",
      };
    case "mismatched":
      return {
        code: "endpoint_identity_mismatch",
        message: `Endpoint reports chain "${input.observed?.chainId ?? "unknown"}" with network prefix "${input.observed?.networkPrefix ?? "unknown"}", but the wallet is configured for chain "${input.expected.chainId}" with network prefix "${input.expected.networkPrefix}". Reads remain available; writes are blocked.`,
      };
    case "blocked":
      return {
        code: "endpoint_deployment_blocked",
        message:
          "This endpoint is a known archived deployment. Reads remain available; writes are blocked even when its archived identity is selected.",
      };
    case "conflicting":
      return {
        code: "endpoint_identity_conflict",
        message:
          "Endpoint identity sources disagree. Reads remain available; writes are blocked.",
      };
    case "unverified":
      return {
        code: "endpoint_identity_unverified",
        message:
          "Endpoint did not provide authoritative chain identity. Reads remain available; writes are blocked.",
      };
    case "unreachable":
      return {
        code: "endpoint_unreachable",
        message:
          "Endpoint identity could not be checked because the endpoint is unreachable.",
      };
  }
};

export const inspectEndpoint = async (
  input: EndpointNetworkContext,
  options: EndpointInspectorOptions = {},
): Promise<EndpointInspection> => {
  const toriiUrl = normalizeEndpointUrl(input.toriiUrl);
  const expected = normalizeChainMetadata({
    chainId: input.chainId,
    networkPrefix: input.networkPrefix,
  });
  const now = options.now ?? Date.now;
  const observedAtMs = now();
  const fetchImpl = options.fetchImpl ?? nodeFetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const results = await runEndpointProbes([
    () =>
      probeGovernanceCapabilities(toriiUrl, fetchImpl, timeoutMs, observedAtMs),
    () => probeChainMetadata(toriiUrl, fetchImpl, timeoutMs, observedAtMs),
    () => probeGenesisFingerprint(toriiUrl, fetchImpl, timeoutMs, observedAtMs),
    () => probeOpenApi(toriiUrl, fetchImpl, timeoutMs),
  ]);

  const reachedEndpoint = results.some((result) => result.reachedEndpoint);
  const evidence = results.flatMap((result) => result.evidence);
  const hasBlockedDeploymentIdentity = evidence.some((entry) =>
    BLOCKED_DEPLOYMENT_FINGERPRINTS.some(
      (blocked) =>
        blocked.identity.chainId === entry.identity.chainId &&
        blocked.identity.networkPrefix === entry.identity.networkPrefix,
    ),
  );
  const hasAuthoritativeIdentity = evidence.some(
    (entry) =>
      entry.source === "governance-capabilities-v1" ||
      entry.source === "chain-metadata",
  );
  const openApiOperations =
    results.find((result) => result.openApiOperations !== undefined)
      ?.openApiOperations ?? null;

  let observed: EndpointChainIdentity | null = evidence[0]?.identity ?? null;
  let identityStatus: EndpointInspection["identityStatus"];
  if (!reachedEndpoint) {
    observed = null;
    identityStatus = "unreachable";
  } else if (identitiesConflict(evidence)) {
    identityStatus = "conflicting";
  } else if (!observed) {
    identityStatus = "unverified";
  } else {
    const matchesExpected = identitiesMatch(expected, observed);
    if (!matchesExpected) {
      identityStatus = "mismatched";
    } else if (hasBlockedDeploymentIdentity) {
      identityStatus = "blocked";
    } else if (hasAuthoritativeIdentity) {
      identityStatus = "matched";
    } else {
      identityStatus = "unverified";
    }
  }

  return {
    schema: "iroha.wallet.endpoint-inspection.v1",
    toriiUrl,
    expected,
    observed,
    identityStatus,
    accessMode:
      identityStatus === "matched"
        ? "read-write"
        : identityStatus === "unreachable"
          ? "offline"
          : "read-only",
    checkedAtMs: observedAtMs,
    evidence,
    features: featureMapFor(openApiOperations),
    diagnostic: diagnosticFor({
      status: identityStatus,
      expected,
      observed,
    }),
  };
};

export const getTrustedEndpointIdentityScope = (
  inspection: EndpointInspection,
): EndpointIdentityScopeInput | null =>
  getTrustedEndpointIdentityScopeInput(inspection);

export class EndpointWriteBlockedError extends Error {
  readonly code:
    | "endpoint_identity_mismatch"
    | "endpoint_deployment_blocked"
    | "endpoint_identity_conflict"
    | "endpoint_identity_unverified"
    | "endpoint_unreachable";

  readonly inspection: EndpointInspection;

  constructor(inspection: EndpointInspection) {
    const code =
      inspection.diagnostic.code === "endpoint_identity_matched"
        ? "endpoint_identity_unverified"
        : inspection.diagnostic.code;
    super(`[${code}] ${inspection.diagnostic.message}`);
    this.name = "EndpointWriteBlockedError";
    this.code = code;
    this.inspection = inspection;
  }
}

export class EndpointFeatureUnsupportedError extends Error {
  readonly code = "endpoint_feature_unsupported";
  readonly feature: EndpointFeature;
  readonly inspection: EndpointInspection;

  constructor(inspection: EndpointInspection, feature: EndpointFeature) {
    const availability = inspection.features[feature];
    const missing = availability.missingOperations.join(", ");
    super(
      `[endpoint_feature_unsupported] Endpoint does not advertise the required ${feature} write operations${missing ? `: ${missing}` : "."}`,
    );
    this.name = "EndpointFeatureUnsupportedError";
    this.feature = feature;
    this.inspection = inspection;
  }
}

export class EndpointFeatureOperationUnsupportedError extends Error {
  readonly code = "endpoint_feature_operation_unsupported";
  readonly feature: EndpointFeature;
  readonly operation: string;
  readonly inspection: EndpointInspection;

  constructor(
    inspection: EndpointInspection,
    feature: EndpointFeature,
    operation: string,
  ) {
    super(
      `[endpoint_feature_operation_unsupported] Endpoint does not advertise ${operation} for ${feature}.`,
    );
    this.name = "EndpointFeatureOperationUnsupportedError";
    this.feature = feature;
    this.operation = operation;
    this.inspection = inspection;
  }
}

export const assertEndpointFeatureOperationSupported = (
  inspection: EndpointInspection,
  feature: EndpointFeature,
  operation: string,
): void => {
  if (!isEndpointFeatureOperationSupported(inspection, feature, operation)) {
    throw new EndpointFeatureOperationUnsupportedError(
      inspection,
      feature,
      operation,
    );
  }
};

export const assertEndpointFeatureSupported = (
  inspection: EndpointInspection,
  feature: EndpointFeature,
): void => {
  if (!inspection.features[feature].supported) {
    throw new EndpointFeatureUnsupportedError(inspection, feature);
  }
};

export const assertEndpointWriteAuthorized = async (
  input: EndpointNetworkContext,
  options: EndpointInspectorOptions = {},
): Promise<EndpointInspection> => {
  const inspection = await inspectEndpoint(input, options);
  if (inspection.identityStatus !== "matched") {
    throw new EndpointWriteBlockedError(inspection);
  }
  return inspection;
};

export const assertEndpointFaucetChallengeAvailable = async (
  input: EndpointNetworkContext,
  options: EndpointInspectorOptions = {},
): Promise<EndpointInspection> => {
  const inspection = await inspectEndpoint(input, options);
  if (
    inspection.identityStatus !== "matched" &&
    inspection.identityStatus !== "unverified"
  ) {
    throw new EndpointWriteBlockedError(inspection);
  }
  if (!canAttemptFaucetIdentityChallenge(inspection)) {
    throw new EndpointFeatureUnsupportedError(inspection, "faucetClaim");
  }
  return inspection;
};

import { describe, expect, it, vi } from "vitest";
import {
  EndpointFeatureOperationUnsupportedError,
  EndpointWriteBlockedError,
  assertEndpointFaucetChallengeAvailable,
  assertEndpointFeatureOperationSupported,
  assertEndpointFeatureSupported,
  assertEndpointWriteAuthorized,
  canAttemptFaucetIdentityChallenge,
  getTrustedEndpointIdentityScope,
  inspectEndpoint,
  isEndpointFeatureOperationSupported,
} from "../electron/endpointInspector";

const TAIRA_CHAIN_ID = "fc56984b-2be7-431d-840e-21514d1883f0";
const ARCHIVED_TAIRA_CHAIN_ID = "809574f5-fee7-5e69-bfcf-52451e42d50f";
const ARCHIVED_TAIRA_GENESIS =
  "cc62233ac63ec4131207a35c28b84d5fb22f0c954bd7b2d0f2edc50541117121";

const network = {
  toriiUrl: "https://taira.sora.org",
  chainId: TAIRA_CHAIN_ID,
  networkPrefix: 369,
};

const capBoundSoraCloudSchemas = {
  SoracloudHfDeployDraftV1: {
    "x-iroha-soracloud-hf-deploy-contract": "cap-bound-local-signing-v1",
    additionalProperties: false,
    required: ["ok", "authority", "signed_by", "tx_instructions"],
    properties: {
      tx_instructions: {
        type: "array",
        minItems: 1,
        maxItems: 3,
      },
    },
  },
  SoracloudTxInstruction: {
    additionalProperties: false,
    required: ["wire_id", "payload_hex"],
    properties: {
      payload_hex: {
        type: "string",
        pattern: "^(?:[0-9a-f]{2})+$",
      },
    },
  },
};

const finalizedTransactionEvidencePaths = {
  "/v1/pipeline/transactions/status": { get: {} },
  "/v1/explorer/transactions/{hash}": { get: {} },
  "/v1/explorer/blocks/{identifier}": { get: {} },
  "/v1/explorer/metrics": { get: {} },
};

const faucetClaimPaths = {
  "/v1/accounts/faucet/puzzle": { get: {} },
  "/v1/accounts/faucet": { post: {} },
  "/v1/sumeragi/status": { get: {} },
  ...finalizedTransactionEvidencePaths,
};

const capBoundSoraCloudDeployOperation = {
  "x-iroha-soracloud-hf-deploy-contract": "cap-bound-local-signing-v1",
  responses: {
    "200": {
      content: {
        "application/json": {
          schema: {
            $ref: "#/components/schemas/SoracloudHfDeployDraftV1",
          },
        },
      },
    },
  },
};

const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const headerIdentityResponse = () =>
  new Response(JSON.stringify({}), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "x-iroha-chain-id": TAIRA_CHAIN_ID,
      "x-iroha-network-prefix": "369",
    },
  });

const routeFetch = (
  routes: Record<string, Response | (() => Response | Promise<Response>)>,
) =>
  vi.fn(async (input: Parameters<typeof fetch>[0]) => {
    const path = new URL(String(input)).pathname;
    const route = routes[path];
    if (!route) {
      return jsonResponse({ code: "route_not_found" }, 404);
    }
    return typeof route === "function" ? await route() : route.clone();
  });

describe("endpoint inspector", () => {
  it("classifies the archived public Taira deployment as mismatched read-only", async () => {
    const fetchImpl = routeFetch({
      "/v1/explorer/blocks/1": jsonResponse({
        hash: ARCHIVED_TAIRA_GENESIS,
        height: 1,
        prev_block_hash: null,
      }),
    });

    const inspection = await inspectEndpoint(network, {
      fetchImpl,
      now: () => 123,
    });

    expect(inspection).toMatchObject({
      identityStatus: "mismatched",
      accessMode: "read-only",
      checkedAtMs: 123,
      expected: {
        chainId: TAIRA_CHAIN_ID,
        networkPrefix: 369,
      },
      observed: {
        chainId: ARCHIVED_TAIRA_CHAIN_ID,
        networkPrefix: 369,
        genesisHash: ARCHIVED_TAIRA_GENESIS,
      },
      diagnostic: {
        code: "endpoint_identity_mismatch",
      },
    });
  });

  it("authorizes a complete matching metadata response", async () => {
    const fetchImpl = routeFetch({
      "/v1/chain/metadata": jsonResponse({
        chain_id: TAIRA_CHAIN_ID,
        network_prefix: 369,
      }),
    });

    const inspection = await assertEndpointWriteAuthorized(network, {
      fetchImpl,
    });

    expect(inspection.identityStatus).toBe("matched");
    expect(inspection.accessMode).toBe("read-write");
  });

  it("retries a rate-limited identity probe before classifying the endpoint", async () => {
    let metadataCalls = 0;
    const fetchImpl = routeFetch({
      "/v1/chain/metadata": () => {
        metadataCalls += 1;
        if (metadataCalls === 1) {
          return new Response(
            JSON.stringify({ code: "preauth_rate_limited" }),
            {
              status: 429,
              headers: {
                "Content-Type": "application/json",
                "Retry-After": "0",
              },
            },
          );
        }
        return jsonResponse({
          chain_id: TAIRA_CHAIN_ID,
          network_prefix: 369,
        });
      },
    });

    const inspection = await inspectEndpoint(network, { fetchImpl });

    expect(metadataCalls).toBe(2);
    expect(inspection.identityStatus).toBe("matched");
  });

  it("fails closed after bounded rate-limit retries are exhausted", async () => {
    let metadataCalls = 0;
    const fetchImpl = routeFetch({
      "/v1/chain/metadata": () => {
        metadataCalls += 1;
        return new Response(JSON.stringify({ code: "preauth_rate_limited" }), {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": "0",
          },
        });
      },
    });

    const inspection = await inspectEndpoint(network, { fetchImpl });

    expect(metadataCalls).toBe(3);
    expect(inspection.identityStatus).toBe("unverified");
    expect(inspection.accessMode).toBe("read-only");
    expect(inspection.observed).toBeNull();
  });

  it("limits concurrent identity probes to avoid admission bursts", async () => {
    let active = 0;
    let maximumActive = 0;
    const fetchImpl = vi.fn(async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return jsonResponse({ code: "route_not_found" }, 404);
    });

    await inspectEndpoint(network, { fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(maximumActive).toBeLessThanOrEqual(2);
  });

  it("never authorizes the archived deployment fingerprint as a write target", async () => {
    const fetchImpl = routeFetch({
      "/v1/explorer/blocks/1": jsonResponse({
        hash: ARCHIVED_TAIRA_GENESIS,
        height: 1,
      }),
    });

    const inspection = await inspectEndpoint(
      {
        ...network,
        chainId: ARCHIVED_TAIRA_CHAIN_ID,
      },
      { fetchImpl },
    );

    expect(inspection.identityStatus).toBe("blocked");
    expect(inspection.accessMode).toBe("read-only");
    expect(inspection.diagnostic.code).toBe("endpoint_deployment_blocked");
  });

  it("never authorizes the archived chain identity when its genesis probe is unavailable", async () => {
    const fetchImpl = routeFetch({
      "/v1/chain/metadata": jsonResponse({
        chain_id: ARCHIVED_TAIRA_CHAIN_ID,
        network_prefix: 369,
      }),
    });

    const inspection = await inspectEndpoint(
      {
        ...network,
        chainId: ARCHIVED_TAIRA_CHAIN_ID,
      },
      { fetchImpl },
    );

    expect(inspection.identityStatus).toBe("blocked");
    expect(inspection.accessMode).toBe("read-only");
    expect(inspection.diagnostic.code).toBe("endpoint_deployment_blocked");
  });

  it("does not infer identity from the hostname or a reachable endpoint", async () => {
    const fetchImpl = routeFetch({});

    const inspection = await inspectEndpoint(network, { fetchImpl });

    expect(inspection.identityStatus).toBe("unverified");
    expect(inspection.observed).toBeNull();
    expect(inspection.accessMode).toBe("read-only");
  });

  it("allows only the faucet identity challenge on an otherwise unverified endpoint with the exact advertised surface", async () => {
    const fetchImpl = routeFetch({
      "/openapi.json": jsonResponse({
        paths: faucetClaimPaths,
      }),
    });

    const inspection = await assertEndpointFaucetChallengeAvailable(network, {
      fetchImpl,
    });

    expect(inspection.identityStatus).toBe("unverified");
    expect(inspection.accessMode).toBe("read-only");
    expect(canAttemptFaucetIdentityChallenge(inspection)).toBe(true);
    await expect(
      assertEndpointWriteAuthorized(network, { fetchImpl }),
    ).rejects.toMatchObject({
      code: "endpoint_identity_unverified",
    });
  });

  it("does not attempt the faucet identity challenge unless OpenAPI advertises its puzzle, claim, liveness, and finality evidence routes", async () => {
    const fetchImpl = routeFetch({
      "/openapi.json": jsonResponse({
        paths: {
          ...faucetClaimPaths,
          "/v1/accounts/faucet/puzzle": undefined,
        },
      }),
    });

    await expect(
      assertEndpointFaucetChallengeAvailable(network, { fetchImpl }),
    ).rejects.toMatchObject({
      code: "endpoint_feature_unsupported",
      feature: "faucetClaim",
      inspection: {
        identityStatus: "unverified",
        features: {
          faucetClaim: {
            supported: false,
            missingOperations: ["GET /v1/accounts/faucet/puzzle"],
          },
        },
      },
    });
  });

  it("rejects mismatched identity evidence before the faucet challenge even when the full faucet surface is advertised", async () => {
    const fetchImpl = routeFetch({
      "/v1/explorer/blocks/1": jsonResponse({
        hash: ARCHIVED_TAIRA_GENESIS,
        height: 1,
      }),
      "/openapi.json": jsonResponse({
        paths: faucetClaimPaths,
      }),
    });

    await expect(
      assertEndpointFaucetChallengeAvailable(network, { fetchImpl }),
    ).rejects.toMatchObject({
      code: "endpoint_identity_mismatch",
      inspection: {
        identityStatus: "mismatched",
        features: {
          faucetClaim: {
            supported: true,
          },
        },
      },
    });
  });

  it("keeps one matching response-header observation unverified", async () => {
    const fetchImpl = routeFetch({
      "/v1/chain/metadata": headerIdentityResponse(),
    });

    const inspection = await inspectEndpoint(network, { fetchImpl });

    expect(inspection.evidence).toHaveLength(1);
    expect(inspection.evidence[0]?.source).toBe("response-headers");
    expect(inspection.identityStatus).toBe("unverified");
    expect(inspection.accessMode).toBe("read-only");
    expect(getTrustedEndpointIdentityScope(inspection)).toBeNull();
  });

  it("never authorizes matching response headers without an exact body", async () => {
    const fetchImpl = routeFetch({
      "/v1/chain/metadata": headerIdentityResponse(),
    });

    const inspection = await inspectEndpoint(network, { fetchImpl });

    expect(inspection.evidence).toHaveLength(1);
    expect(inspection.evidence[0]?.source).toBe("response-headers");
    expect(inspection.identityStatus).toBe("unverified");
    expect(inspection.accessMode).toBe("read-only");
    expect(getTrustedEndpointIdentityScope(inspection)).toBeNull();
  });

  it("builds feature availability from advertised OpenAPI write routes", async () => {
    const fetchImpl = routeFetch({
      "/v1/chain/metadata": jsonResponse({
        chain_id: TAIRA_CHAIN_ID,
        network_prefix: 369,
      }),
      "/openapi.json": jsonResponse({
        paths: {
          "/v1/fees/quote": { post: {} },
          "/v1/pipeline/transactions": { post: {} },
          ...finalizedTransactionEvidencePaths,
          "/v1/soracloud/hf/deploy": {
            post: capBoundSoraCloudDeployOperation,
          },
          "/v1/vpn/quotes": { post: {} },
          "/v1/vpn/sessions": { post: {} },
          "/v1/vpn/sessions/{id}": { delete: {} },
        },
        components: { schemas: capBoundSoraCloudSchemas },
      }),
    });

    const inspection = await inspectEndpoint(network, { fetchImpl });

    expect(inspection.features.soraCloudDeploy.supported).toBe(true);
    expect(inspection.features.vpnSessions.supported).toBe(true);
    expect(inspection.features.subscriptionWrites.supported).toBe(false);
    expect(() =>
      assertEndpointFeatureSupported(inspection, "subscriptionWrites"),
    ).toThrowError(
      expect.objectContaining({
        code: "endpoint_feature_unsupported",
        feature: "subscriptionWrites",
      }),
    );
  });

  it("does not authorize an older SoraCloud deploy route without the cap-bound draft contract", async () => {
    const fetchImpl = routeFetch({
      "/v1/chain/metadata": jsonResponse({
        chain_id: TAIRA_CHAIN_ID,
        network_prefix: 369,
      }),
      "/openapi.json": jsonResponse({
        paths: {
          "/v1/soracloud/hf/deploy": { post: {} },
        },
      }),
    });

    const inspection = await inspectEndpoint(network, { fetchImpl });

    expect(inspection.features.soraCloudDeploy.supported).toBe(false);
    expect(inspection.features.soraCloudDeploy.missingOperations).toContain(
      "CONTRACT /v1/soracloud/hf/deploy cap-bound-local-signing-v1",
    );
  });

  it("checks subscription write routes independently", async () => {
    const fetchImpl = routeFetch({
      "/v1/chain/metadata": jsonResponse({
        chain_id: TAIRA_CHAIN_ID,
        network_prefix: 369,
      }),
      "/openapi.json": jsonResponse({
        paths: {
          "/v1/subscriptions": { post: {} },
          "/v1/subscriptions/{id}/pause": { post: {} },
          "/v1/subscriptions/{id}/resume": { post: {} },
          "/v1/subscriptions/{id}/cancel": { post: {} },
          "/v1/subscriptions/{id}/keep": { post: {} },
        },
      }),
    });

    const inspection = await inspectEndpoint(network, { fetchImpl });

    expect(inspection.features.subscriptionWrites.supported).toBe(false);
    expect(
      isEndpointFeatureOperationSupported(
        inspection,
        "subscriptionWrites",
        "POST /v1/subscriptions",
      ),
    ).toBe(true);
    expect(
      isEndpointFeatureOperationSupported(
        inspection,
        "subscriptionWrites",
        "POST /v1/subscriptions/{subscription_id}/pause",
      ),
    ).toBe(true);
    expect(() =>
      assertEndpointFeatureOperationSupported(
        inspection,
        "subscriptionWrites",
        "POST /v1/subscriptions/{subscription_id}/charge-now",
      ),
    ).toThrowError(
      expect.objectContaining({
        code: "endpoint_feature_operation_unsupported",
        feature: "subscriptionWrites",
        operation: "POST /v1/subscriptions/{subscription_id}/charge-now",
      }) satisfies Partial<EndpointFeatureOperationUnsupportedError>,
    );
  });

  it("does not advertise signing features when the fee quote route is missing", async () => {
    const fetchImpl = routeFetch({
      "/v1/chain/metadata": jsonResponse({
        chain_id: TAIRA_CHAIN_ID,
        network_prefix: 369,
      }),
      "/openapi.json": jsonResponse({
        paths: {
          "/v1/pipeline/transactions": { post: {} },
        },
      }),
    });

    const inspection = await inspectEndpoint(network, { fetchImpl });

    expect(inspection.features.accountRegistration.supported).toBe(false);
    expect(inspection.features.assetTransfers.supported).toBe(false);
    expect(inspection.features.assetTransfers.missingOperations).toContain(
      "POST /v1/fees/quote",
    );
  });

  it("does not treat empty OpenAPI method placeholders as write routes", async () => {
    const fetchImpl = routeFetch({
      "/v1/chain/metadata": jsonResponse({
        chain_id: TAIRA_CHAIN_ID,
        network_prefix: 369,
      }),
      "/openapi.json": jsonResponse({
        paths: {
          "/v1/fees/quote": { post: null },
          "/v1/pipeline/transactions": { post: "unresolved" },
        },
      }),
    });

    const inspection = await inspectEndpoint(network, { fetchImpl });

    expect(inspection.features.assetTransfers.supported).toBe(false);
    expect(inspection.features.assetTransfers.missingOperations).toEqual([
      "POST /v1/fees/quote",
      "POST /v1/pipeline/transactions",
      "GET /v1/pipeline/transactions/status",
      "GET /v1/explorer/transactions/{hash}",
      "GET /v1/explorer/blocks/{identifier}",
      "GET /v1/explorer/metrics",
    ]);
  });

  it("requires the complete first-release write-route contract for every feature", async () => {
    const fetchImpl = routeFetch({
      "/v1/chain/metadata": jsonResponse({
        chain_id: TAIRA_CHAIN_ID,
        network_prefix: 369,
      }),
      "/openapi.json": jsonResponse({
        paths: {
          "/v1/fees/quote": { post: {} },
          "/v1/accounts/onboard": { post: {} },
          ...faucetClaimPaths,
          "/v1/pipeline/transactions": { post: {} },
          "/v1/pipeline/transaction-entrypoints": { post: {} },
          "/v1/zk/roots": { post: {} },
          "/v1/confidential/relay/submit": { post: {} },
          "/v1/gov/citizens/draft": { post: {} },
          "/v1/validation-fee/proposals/draft": { post: {} },
          "/v1/validation-fee/proposals/{id}/plain-ballot/draft": {
            post: {},
          },
          "/v1/gov/ballots/plain": { post: {} },
          "/v1/gov/parliament/ballots": { post: {} },
          "/v1/subscriptions": { post: {} },
          "/v1/subscriptions/{id}/pause": { post: {} },
          "/v1/subscriptions/{id}/resume": { post: {} },
          "/v1/subscriptions/{id}/cancel": { post: {} },
          "/v1/subscriptions/{id}/keep": { post: {} },
          "/v1/subscriptions/{id}/charge-now": { post: {} },
          "/v1/soracloud/hf/deploy": {
            post: capBoundSoraCloudDeployOperation,
          },
          "/v1/vpn/quotes": { post: {} },
          "/v1/vpn/sessions": { post: {} },
          "/v1/vpn/sessions/{id}": { delete: {} },
          "/v1/connect/session": { post: {} },
          "/v1/zk/ivm/derive": { post: {} },
          "/v1/zk/ivm/prove": { post: {} },
          "/v1/zk/ivm/prove/{id}": { delete: {} },
        },
        components: { schemas: capBoundSoraCloudSchemas },
      }),
    });

    const inspection = await inspectEndpoint(network, { fetchImpl });

    expect(
      Object.values(inspection.features).every((feature) => feature.supported),
    ).toBe(true);
  });

  it("fails closed when authoritative endpoint sources conflict", async () => {
    const fetchImpl = routeFetch({
      "/v1/chain/metadata": jsonResponse({
        chain_id: TAIRA_CHAIN_ID,
        network_prefix: 369,
      }),
      "/v1/explorer/blocks/1": jsonResponse({
        hash: ARCHIVED_TAIRA_GENESIS,
        height: 1,
      }),
    });

    const inspection = await inspectEndpoint(network, { fetchImpl });

    expect(inspection.identityStatus).toBe("conflicting");
    expect(inspection.accessMode).toBe("read-only");
  });

  it("distinguishes an unreachable endpoint from an unverified one", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("offline");
    });

    const inspection = await inspectEndpoint(network, { fetchImpl });

    expect(inspection.identityStatus).toBe("unreachable");
    expect(inspection.accessMode).toBe("offline");
  });

  it("throws a stable write-blocking error for a mismatched endpoint", async () => {
    const fetchImpl = routeFetch({
      "/v1/explorer/blocks/1": jsonResponse({
        hash: ARCHIVED_TAIRA_GENESIS,
        height: 1,
      }),
    });

    await expect(
      assertEndpointWriteAuthorized(network, { fetchImpl }),
    ).rejects.toMatchObject({
      name: "EndpointWriteBlockedError",
      code: "endpoint_identity_mismatch",
    } satisfies Partial<EndpointWriteBlockedError>);
  });
});

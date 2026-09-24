import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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
const TAIRA_GENESIS =
  "82531ce8eae8bff6beeca4698bfd13a3bc8bec5f0ee0d23d428c97fc17ab0f3b";
const UNREVIEWED_PUBLIC_RESET_GENESIS =
  "77fb29d14745adccfdc14350e1a6fe6a10265798cc936a1dafa7d2552ac3b9f7";
const ARCHIVED_TAIRA_CHAIN_ID = "809574f5-fee7-5e69-bfcf-52451e42d50f";
const ARCHIVED_TAIRA_GENESIS =
  "cc62233ac63ec4131207a35c28b84d5fb22f0c954bd7b2d0f2edc50541117121";

const network = {
  toriiUrl: "https://taira.sora.org",
  chainId: TAIRA_CHAIN_ID,
  networkPrefix: 369,
};

const strictObjectSchema = (
  fields: readonly string[],
  properties: Record<string, unknown> = {},
) => ({
  type: "object",
  additionalProperties: false,
  required: [...fields],
  properties: Object.fromEntries(
    fields.map((field) => [field, properties[field] ?? {}]),
  ),
});

const unitVariantSchema = (tag: string, variants: readonly string[]) => ({
  oneOf: variants.map((variant) =>
    strictObjectSchema([tag, "value"], {
      [tag]: { type: "string", const: variant },
      value: { type: "null" },
    }),
  ),
});

const nullableRef = (name: string) => ({
  anyOf: [{ $ref: `#/components/schemas/${name}` }, { type: "null" }],
});

const exactSharedLeaseSchemas = {
  SignedHfSharedLeaseJoinRequest: strictObjectSchema(
    ["payload", "provenance"],
    {
      payload: { $ref: "#/components/schemas/HfSharedLeaseJoinPayload" },
      provenance: { $ref: "#/components/schemas/ManifestProvenance" },
    },
  ),
  HfSharedLeaseJoinPayload: strictObjectSchema(
    [
      "repo_id",
      "revision",
      "service_name",
      "apartment_name",
      "storage_class",
      "lease_term_ms",
      "lease_asset_definition_id",
      "base_fee",
    ],
    {
      storage_class: { type: "string", enum: ["hot", "warm", "cold"] },
    },
  ),
  ManifestProvenance: strictObjectSchema(["signer", "signature"], {
    signer: { type: "string", minLength: 1 },
    signature: { type: "string", pattern: "^(?:[0-9A-F]{2})+$" },
  }),
  SoracloudMutationDraftResponse: strictObjectSchema(
    ["ok", "authority", "signed_by", "tx_instructions"],
    {
      ok: { type: "boolean", const: true },
      authority: { type: "string", minLength: 1 },
      signed_by: { type: "string", minLength: 1 },
      tx_instructions: {
        type: "array",
        minItems: 1,
        items: { $ref: "#/components/schemas/SoracloudTxInstruction" },
      },
    },
  ),
  SoracloudTxInstruction: strictObjectSchema(["wire_id", "payload_hex"], {
    payload_hex: { type: "string", pattern: "^(?:[0-9a-f]{2})+$" },
  }),
  HfSharedLeaseStatusResponse: strictObjectSchema(
    [
      "schema_version",
      "source",
      "pool",
      "member",
      "latest_audit_event",
      "audit_event_count",
      "storage_base_fee",
    ],
    {
      schema_version: { type: "integer", const: 1 },
      source: { $ref: "#/components/schemas/SoraHfSourceRecordV1" },
      pool: nullableRef("SoraHfSharedLeasePoolV1"),
      member: nullableRef("SoraHfSharedLeaseMemberV1"),
      latest_audit_event: nullableRef("SoraHfSharedLeaseAuditEventV1"),
      storage_base_fee: { $ref: "#/components/schemas/Quantity" },
    },
  ),
  SoraHfSourceRecordV1: strictObjectSchema(
    [
      "schema_version",
      "source_id",
      "repo_id",
      "resolved_revision",
      "created_at_ms",
      "updated_at_ms",
    ],
    {
      schema_version: { type: "integer", const: 1 },
      source_id: { $ref: "#/components/schemas/Hash" },
    },
  ),
  SoraHfSharedLeasePoolV1: strictObjectSchema(
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
    {
      schema_version: { type: "integer", const: 1 },
      pool_id: { $ref: "#/components/schemas/Hash" },
      source_id: { $ref: "#/components/schemas/Hash" },
      storage_class: { type: "string", enum: ["hot", "warm", "cold"] },
      base_fee: { $ref: "#/components/schemas/Quantity" },
      status: { $ref: "#/components/schemas/SoraHfSharedLeaseStatusV1" },
      queued_next_window: nullableRef("SoraHfSharedLeaseQueuedWindowV1"),
    },
  ),
  SoraHfSharedLeaseQueuedWindowV1: strictObjectSchema(
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
    {
      base_fee: { $ref: "#/components/schemas/Quantity" },
      apartment_name: {
        anyOf: [{ type: "string" }, { type: "null" }],
      },
    },
  ),
  SoraHfSharedLeaseMemberV1: strictObjectSchema(
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
    {
      schema_version: { type: "integer", const: 1 },
      pool_id: { $ref: "#/components/schemas/Hash" },
      source_id: { $ref: "#/components/schemas/Hash" },
      status: {
        $ref: "#/components/schemas/SoraHfSharedLeaseMemberStatusV1",
      },
      total_paid: { $ref: "#/components/schemas/Quantity" },
      total_refunded: { $ref: "#/components/schemas/Quantity" },
      last_charge: { $ref: "#/components/schemas/Quantity" },
      service_bindings: {
        type: "array",
        uniqueItems: true,
        items: { type: "string" },
      },
      apartment_bindings: {
        type: "array",
        uniqueItems: true,
        items: { type: "string" },
      },
    },
  ),
  SoraHfSharedLeaseAuditEventV1: strictObjectSchema(
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
    {
      schema_version: { type: "integer", const: 1 },
      action: { $ref: "#/components/schemas/SoraHfSharedLeaseActionV1" },
      pool_id: { $ref: "#/components/schemas/Hash" },
      source_id: { $ref: "#/components/schemas/Hash" },
      charged: { $ref: "#/components/schemas/Quantity" },
      refunded: { $ref: "#/components/schemas/Quantity" },
      service_name: { anyOf: [{ type: "string" }, { type: "null" }] },
      apartment_name: { anyOf: [{ type: "string" }, { type: "null" }] },
    },
  ),
  SoraHfSharedLeaseStatusV1: unitVariantSchema("status", [
    "Active",
    "Draining",
    "Expired",
    "Retired",
  ]),
  SoraHfSharedLeaseMemberStatusV1: unitVariantSchema("status", [
    "Active",
    "Left",
  ]),
  SoraHfSharedLeaseActionV1: unitVariantSchema("action", [
    "CreateWindow",
    "Join",
    "Leave",
    "Renew",
    "Retire",
  ]),
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

const exactSharedLeaseJoinOperation = {
  "x-iroha-tool-effect": "write",
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: {
          $ref: "#/components/schemas/SignedHfSharedLeaseJoinRequest",
        },
      },
    },
  },
  responses: {
    "200": {
      content: {
        "application/json": {
          schema: {
            $ref: "#/components/schemas/SoracloudMutationDraftResponse",
          },
        },
      },
    },
  },
};

const exactOptionalReadAuthenticationParameters = [
  "X-Iroha-Account",
  "X-Iroha-Signature",
  "X-Iroha-Timestamp-Ms",
  "X-Iroha-Nonce",
  "X-Iroha-Witness",
].map((name) => ({
  in: "header",
  name,
  required: false,
  schema: { type: "string" },
}));

const exactSharedLeaseStatusOperation = {
  "x-iroha-tool-effect": "read",
  parameters: [
    ...exactOptionalReadAuthenticationParameters,
    {
      in: "query",
      name: "repo_id",
      required: true,
      schema: { type: "string" },
    },
    {
      in: "query",
      name: "revision",
      required: true,
      schema: { type: "string", pattern: "^[0-9a-f]{40}$" },
    },
    {
      in: "query",
      name: "storage_class",
      required: true,
      schema: { type: "string", enum: ["hot", "warm", "cold"] },
    },
    {
      in: "query",
      name: "lease_term_ms",
      required: true,
      schema: { type: "integer", format: "uint64", minimum: 0 },
    },
    {
      in: "query",
      name: "account_id",
      required: false,
      schema: { type: "string" },
    },
  ],
  responses: {
    "200": {
      content: {
        "application/json": {
          schema: {
            $ref: "#/components/schemas/HfSharedLeaseStatusResponse",
          },
        },
      },
    },
  },
};

const exactSharedLeasePaths = {
  "/v1/soracloud/hf/lease/join": { post: exactSharedLeaseJoinOperation },
  "/v1/soracloud/hf/lease/status": { get: exactSharedLeaseStatusOperation },
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

  it("authorizes only complete matching metadata plus the pinned genesis", async () => {
    const fetchImpl = routeFetch({
      "/v1/chain/metadata": jsonResponse({
        chain_id: TAIRA_CHAIN_ID,
        network_prefix: 369,
      }),
      "/v1/explorer/blocks/1": jsonResponse({
        hash: TAIRA_GENESIS,
        height: 1,
      }),
    });

    const inspection = await assertEndpointWriteAuthorized(network, {
      fetchImpl,
    });

    expect(inspection.identityStatus).toBe("matched");
    expect(inspection.accessMode).toBe("read-write");
    expect(inspection.observed?.genesisHash).toBe(TAIRA_GENESIS);
  });

  it("keeps an unreviewed public Taira reset read-only", async () => {
    const fetchImpl = routeFetch({
      "/v1/explorer/blocks/1": jsonResponse({
        hash: UNREVIEWED_PUBLIC_RESET_GENESIS,
        height: 1,
      }),
    });

    const inspection = await inspectEndpoint(network, { fetchImpl });

    expect(inspection.identityStatus).toBe("mismatched");
    expect(inspection.accessMode).toBe("read-only");
    expect(inspection.expected.genesisHash).toBe(TAIRA_GENESIS);
    expect(inspection.observed?.genesisHash).toBe(
      UNREVIEWED_PUBLIC_RESET_GENESIS,
    );
  });

  it("does not authorize matching metadata without genesis evidence", async () => {
    const fetchImpl = routeFetch({
      "/v1/chain/metadata": jsonResponse({
        chain_id: TAIRA_CHAIN_ID,
        network_prefix: 369,
      }),
    });

    const inspection = await inspectEndpoint(network, { fetchImpl });

    expect(inspection.identityStatus).toBe("unverified");
    expect(inspection.accessMode).toBe("read-only");
  });

  it("keeps a custom HTTPS endpoint read-only even when it self-reports a matching identity and write surface", async () => {
    const customNetwork = {
      ...network,
      toriiUrl: "https://custom-torii.example",
    };
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
        },
      }),
    });

    const inspection = await inspectEndpoint(customNetwork, { fetchImpl });

    expect(inspection.identityStatus).toBe("unverified");
    expect(inspection.accessMode).toBe("read-only");
    expect(inspection.features.assetTransfers.supported).toBe(true);
    expect(inspection.diagnostic.message).toContain(
      "not a release-pinned write target",
    );
    await expect(
      assertEndpointWriteAuthorized(customNetwork, { fetchImpl }),
    ).rejects.toMatchObject({ code: "endpoint_identity_unverified" });
  });

  it("keeps Minamoto read-only until the release pins its exact NetworkId", async () => {
    const minamotoNetwork = {
      toriiUrl: "https://minamoto.sora.org",
      chainId: "00000000-0000-0000-0000-000000000000",
      networkPrefix: 753,
    };
    const fetchImpl = routeFetch({
      "/v1/chain/metadata": jsonResponse({
        chain_id: minamotoNetwork.chainId,
        network_prefix: minamotoNetwork.networkPrefix,
      }),
    });

    const inspection = await inspectEndpoint(minamotoNetwork, { fetchImpl });

    expect(inspection.identityStatus).toBe("unverified");
    expect(inspection.accessMode).toBe("read-only");
    expect(inspection.diagnostic.message).toContain(
      "not a release-pinned write target",
    );
    await expect(
      assertEndpointWriteAuthorized(minamotoNetwork, { fetchImpl }),
    ).rejects.toMatchObject({ code: "endpoint_identity_unverified" });
  });

  it("does not let a pinned origin authorize a different configured profile", async () => {
    const fetchImpl = routeFetch({
      "/v1/chain/metadata": jsonResponse({
        chain_id: "custom-chain",
        network_prefix: 369,
      }),
    });

    const inspection = await inspectEndpoint(
      { ...network, chainId: "custom-chain" },
      { fetchImpl },
    );

    expect(inspection.identityStatus).toBe("unverified");
    expect(inspection.accessMode).toBe("read-only");
  });

  it("does not authorize duplicate-key identity JSON", async () => {
    const fetchImpl = routeFetch({
      "/v1/chain/metadata": new Response(
        `{"chain_id":"${TAIRA_CHAIN_ID}","chain_id":"attacker-chain","network_prefix":369}`,
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    });

    const inspection = await inspectEndpoint(network, { fetchImpl });

    expect(inspection.identityStatus).toBe("unverified");
    expect(inspection.accessMode).toBe("read-only");
  });

  it("rejects coercive configured identity values before probing", async () => {
    const fetchImpl = vi.fn();

    await expect(
      inspectEndpoint({ ...network, chainId: ` ${TAIRA_CHAIN_ID}` } as never, {
        fetchImpl,
      }),
    ).rejects.toThrow("exact canonical chain ID");
    await expect(
      inspectEndpoint({ ...network, networkPrefix: "369" } as never, {
        fetchImpl,
      }),
    ).rejects.toThrow("integer network prefix");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("does not normalize a noncanonical block-one hash into identity evidence", async () => {
    for (const hash of [TAIRA_GENESIS.toUpperCase(), ` ${TAIRA_GENESIS}`]) {
      const fetchImpl = routeFetch({
        "/v1/chain/metadata": jsonResponse({
          chain_id: TAIRA_CHAIN_ID,
          network_prefix: 369,
        }),
        "/v1/explorer/blocks/1": jsonResponse({ hash, height: 1 }),
      });

      const inspection = await inspectEndpoint(network, { fetchImpl });

      expect(inspection.identityStatus).toBe("unverified");
      expect(inspection.observed?.genesisHash).toBeUndefined();
      expect(
        inspection.evidence.some(
          (entry) => entry.source === "genesis-fingerprint",
        ),
      ).toBe(false);
    }
  });

  it("does not authorize oversized identity JSON", async () => {
    const fetchImpl = routeFetch({
      "/v1/chain/metadata": jsonResponse({
        chain_id: TAIRA_CHAIN_ID,
        network_prefix: 369,
        padding: "x".repeat(4 * 1024 * 1024),
      }),
      "/v1/explorer/blocks/1": jsonResponse({
        hash: TAIRA_GENESIS,
        height: 1,
      }),
    });

    const inspection = await inspectEndpoint(network, { fetchImpl });

    expect(inspection.identityStatus).toBe("unverified");
    expect(inspection.accessMode).toBe("read-only");
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
      "/v1/explorer/blocks/1": jsonResponse({
        hash: TAIRA_GENESIS,
        height: 1,
      }),
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

  it("classifies a reached endpoint with malformed capabilities as unverified", async () => {
    const fetchImpl = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      if (new URL(String(input)).pathname === "/v1/gov/capabilities") {
        return jsonResponse({ malformed: true });
      }
      throw new Error("offline");
    });

    const inspection = await inspectEndpoint(network, { fetchImpl });

    expect(inspection.identityStatus).toBe("unverified");
    expect(inspection.accessMode).toBe("read-only");
  });

  it("rejects invalid inspection clocks and timeouts before probing", async () => {
    const fetchImpl = vi.fn();

    await expect(
      inspectEndpoint(network, { fetchImpl, now: () => Number.NaN }),
    ).rejects.toThrow("clock must return a non-negative safe integer");
    await expect(
      inspectEndpoint(network, { fetchImpl, timeoutMs: 0 }),
    ).rejects.toThrow("timeout must be an integer between 1 and 60000");
    await expect(
      inspectEndpoint(network, { fetchImpl, timeoutMs: 60_001 }),
    ).rejects.toThrow("timeout must be an integer between 1 and 60000");
    expect(fetchImpl).not.toHaveBeenCalled();
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

  it("builds feature availability from advertised exact OpenAPI routes", async () => {
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
          ...exactSharedLeasePaths,
          "/v1/vpn/quotes": { post: {} },
          "/v1/vpn/sessions": { post: {} },
          "/v1/vpn/sessions/{session_id}": { delete: {} },
        },
        components: { schemas: exactSharedLeaseSchemas },
      }),
    });

    const inspection = await inspectEndpoint(network, { fetchImpl });

    expect(inspection.features.soraCloudHfSharedLease.supported).toBe(true);
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

  it("recognizes the current sibling Torii shared-lease OpenAPI contract", async () => {
    const currentOpenApi = JSON.parse(
      readFileSync(
        resolve(
          process.cwd(),
          "../iroha/artifacts/openapi/versions/current/torii.json",
        ),
        "utf8",
      ),
    );
    const fetchImpl = routeFetch({
      "/v1/chain/metadata": jsonResponse({
        chain_id: TAIRA_CHAIN_ID,
        network_prefix: 369,
      }),
      "/openapi.json": jsonResponse(currentOpenApi),
    });

    const inspection = await inspectEndpoint(network, { fetchImpl });

    expect(inspection.features.soraCloudHfSharedLease.supported).toBe(true);
  });

  it("rejects the obsolete SoraCloud deploy route", async () => {
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

    expect(inspection.features.soraCloudHfSharedLease.supported).toBe(false);
    expect(
      inspection.features.soraCloudHfSharedLease.missingOperations,
    ).toContain("CONTRACT /v1/soracloud/hf/lease exact-v1");
  });

  it("fails closed when a shared-lease response schema accepts unknown fields", async () => {
    const permissiveSchemas = structuredClone(exactSharedLeaseSchemas);
    permissiveSchemas.HfSharedLeaseStatusResponse.additionalProperties = true;
    const fetchImpl = routeFetch({
      "/v1/chain/metadata": jsonResponse({
        chain_id: TAIRA_CHAIN_ID,
        network_prefix: 369,
      }),
      "/openapi.json": jsonResponse({
        paths: exactSharedLeasePaths,
        components: { schemas: permissiveSchemas },
      }),
    });

    const inspection = await inspectEndpoint(network, { fetchImpl });

    expect(inspection.features.soraCloudHfSharedLease.supported).toBe(false);
    expect(
      inspection.features.soraCloudHfSharedLease.missingOperations,
    ).toContain("CONTRACT /v1/soracloud/hf/lease exact-v1");
  });

  it("fails closed when a shared-lease operation adds a non-contract parameter", async () => {
    const fetchImpl = routeFetch({
      "/openapi.json": jsonResponse({
        paths: {
          ...exactSharedLeasePaths,
          "/v1/soracloud/hf/lease/status": {
            get: {
              ...exactSharedLeaseStatusOperation,
              parameters: [
                ...exactSharedLeaseStatusOperation.parameters,
                {
                  in: "header",
                  name: "x-legacy-mode",
                  required: false,
                  schema: { type: "string" },
                },
              ],
            },
          },
        },
        components: { schemas: exactSharedLeaseSchemas },
      }),
    });

    const inspection = await inspectEndpoint(network, { fetchImpl });

    expect(inspection.features.soraCloudHfSharedLease.supported).toBe(false);
    expect(
      inspection.features.soraCloudHfSharedLease.missingOperations,
    ).toContain("CONTRACT /v1/soracloud/hf/lease exact-v1");
  });

  it("fails closed when exact OpenAPI string sets contain duplicates", async () => {
    const duplicateRequiredSchemas = structuredClone(exactSharedLeaseSchemas);
    duplicateRequiredSchemas.SignedHfSharedLeaseJoinRequest.required = [
      "payload",
      "payload",
    ];
    const duplicateEnumSchemas = structuredClone(exactSharedLeaseSchemas);
    const duplicateJoinStorageClass = duplicateEnumSchemas
      .HfSharedLeaseJoinPayload.properties.storage_class as {
      enum: string[];
    };
    const duplicatePoolStorageClass = duplicateEnumSchemas
      .SoraHfSharedLeasePoolV1.properties.storage_class as {
      enum: string[];
    };
    duplicateJoinStorageClass.enum = ["hot", "hot", "cold"];
    duplicatePoolStorageClass.enum = ["hot", "hot", "cold"];

    for (const schemas of [duplicateRequiredSchemas, duplicateEnumSchemas]) {
      const fetchImpl = routeFetch({
        "/openapi.json": jsonResponse({
          paths: exactSharedLeasePaths,
          components: { schemas },
        }),
      });

      const inspection = await inspectEndpoint(network, { fetchImpl });

      expect(inspection.features.soraCloudHfSharedLease.supported).toBe(false);
      expect(
        inspection.features.soraCloudHfSharedLease.missingOperations,
      ).toContain("CONTRACT /v1/soracloud/hf/lease exact-v1");
    }
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
          "/v1/subscriptions/{subscription_id}/pause": { post: {} },
          "/v1/subscriptions/{subscription_id}/resume": { post: {} },
          "/v1/subscriptions/{subscription_id}/cancel": { post: {} },
          "/v1/subscriptions/{subscription_id}/keep": { post: {} },
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

  it("does not let aliased path parameters satisfy current route contracts", async () => {
    const fetchImpl = routeFetch({
      "/openapi.json": jsonResponse({
        paths: {
          "/v1/subscriptions": { post: {} },
          "/v1/subscriptions/{id}/pause": { post: {} },
          "/v1/subscriptions/{id}/resume": { post: {} },
          "/v1/subscriptions/{id}/cancel": { post: {} },
          "/v1/subscriptions/{id}/keep": { post: {} },
          "/v1/subscriptions/{id}/charge-now": { post: {} },
        },
      }),
    });

    const inspection = await inspectEndpoint(network, { fetchImpl });

    expect(inspection.features.subscriptionWrites.supported).toBe(false);
    expect(inspection.features.subscriptionWrites.missingOperations).toContain(
      "POST /v1/subscriptions/{subscription_id}/pause",
    );
    expect(
      isEndpointFeatureOperationSupported(
        inspection,
        "subscriptionWrites",
        "POST /v1/subscriptions/{subscription_id}/pause",
      ),
    ).toBe(false);
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
          "/v1/gov/capabilities": { get: {} },
          "/v1/gov/citizens/draft": { post: {} },
          "/v1/gov/parliament/attempts/draft": { post: {} },
          "/v1/gov/parliament/attempts/{governance_attempt_id}": { get: {} },
          "/v1/gov/parliament/ballots/{ballot_attempt_id}/casting-context": {
            get: {},
          },
          "/v1/gov/parliament/ballots/{ballot_attempt_id}/casting-proof": {
            post: {},
          },
          "/v1/gov/parliament/ballots/{ballot_attempt_id}/release-context": {
            get: {},
          },
          "/v1/gov/parliament/ballots/{ballot_attempt_id}/partial-release": {
            post: {},
          },
          "/v1/gov/parliament/transitions/draft": { post: {} },
          "/v1/gov/ballots/plain": { post: {} },
          "/v1/gov/ballots/zk-v1": { post: {} },
          "/v1/gov/ballots/zk-v1/ballot-proof": { post: {} },
          "/v1/validation-fee/proposals": { get: {} },
          "/v1/validation-fee/proposals/{proposal_id}": { get: {} },
          "/v1/validation-fee/proposals/draft": { post: {} },
          "/v1/subscriptions": { post: {} },
          "/v1/subscriptions/{subscription_id}/pause": { post: {} },
          "/v1/subscriptions/{subscription_id}/resume": { post: {} },
          "/v1/subscriptions/{subscription_id}/cancel": { post: {} },
          "/v1/subscriptions/{subscription_id}/keep": { post: {} },
          "/v1/subscriptions/{subscription_id}/charge-now": { post: {} },
          ...exactSharedLeasePaths,
          "/v1/vpn/quotes": { post: {} },
          "/v1/vpn/sessions": { post: {} },
          "/v1/vpn/sessions/{session_id}": { delete: {} },
          "/v1/connect/session": { post: {} },
        },
        components: { schemas: exactSharedLeaseSchemas },
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

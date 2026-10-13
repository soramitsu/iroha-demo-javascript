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
  requireTrustedInspectionNetworkId,
  resolvePinnedEndpointNetworkId,
  type EndpointIdentityPins,
} from "../electron/endpointInspector";
import type { NetworkIdentityPin } from "../src/utils/networkIdentity";
import {
  TEST_PREVIOUS_TAIRA_NETWORK_ID,
  TEST_TAIRA_GENESIS_HASH,
  TEST_TAIRA_NETWORK_ID,
  testNetworkIdentityPin,
} from "./helpers/networkIdentityFixture";

const TAIRA_CHAIN_ID = "fc56984b-2be7-431d-840e-21514d1883f0";
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
  "/v1/accounts/faucet/policy": { get: {} },
  "/v1/accounts/faucet/puzzle": { get: {} },
  "/v1/accounts/faucet/prepare": { post: {} },
  "/v1/accounts/faucet": { post: {} },
  "/v1/pipeline/transactions/status": { get: {} },
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

const capabilitiesPayload = (
  input: { networkId?: string; networkPrefix?: number } = {},
) => ({
  schema_version: 1,
  network_id: input.networkId ?? TEST_TAIRA_NETWORK_ID,
  network_prefix: input.networkPrefix ?? 369,
  allowed_signing: ["bls_normal", "ed25519", "secp256k1"],
  default_signing: "ed25519",
});

const identityRoutes = (
  input: {
    capabilitiesNetworkId?: string;
    genesisHash?: string;
    networkPrefix?: number;
  } = {},
): Record<string, Response | (() => Response | Promise<Response>)> => ({
  "/v1/accounts/capabilities": jsonResponse(
    capabilitiesPayload({
      networkId: input.capabilitiesNetworkId,
      networkPrefix: input.networkPrefix,
    }),
  ),
  "/v1/explorer/blocks/1": jsonResponse({
    hash: input.genesisHash ?? TEST_TAIRA_NETWORK_ID,
    height: 1,
    created_at: "2026-10-11T15:03:56.844Z",
    prev_block_hash: null,
    transactions_hash: TEST_TAIRA_NETWORK_ID,
    transactions_rejected: 0,
    transactions_total: 0,
  }),
});

const memoryPins = (initial: NetworkIdentityPin[] = []) => {
  const pins = new Map(initial.map((pin) => [pin.toriiUrl, pin]));
  const store = {
    read: vi.fn(async (toriiUrl: string) => pins.get(toriiUrl) ?? null),
    pinFirstUse: vi.fn(
      async (
        toriiUrl: string,
        identity: { networkId: string; networkPrefix: number },
      ) => {
        const existing = pins.get(toriiUrl);
        if (existing) return existing;
        const pin = testNetworkIdentityPin({
          toriiUrl,
          networkId: identity.networkId,
          networkPrefix: identity.networkPrefix,
        });
        pins.set(toriiUrl, pin);
        return pin;
      },
    ),
  };
  return store satisfies EndpointIdentityPins;
};

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

describe("endpoint inspector network identity", () => {
  it("parses current hash literals and pins a write endpoint on first use", async () => {
    const pins = memoryPins();
    const inspection = await inspectEndpoint(network, {
      identityPins: pins,
      fetchImpl: routeFetch(identityRoutes()),
      now: () => 123,
    });

    expect(inspection).toMatchObject({
      identityStatus: "matched",
      accessMode: "read-write",
      checkedAtMs: 123,
      expected: { chainId: TAIRA_CHAIN_ID, networkPrefix: 369 },
      observed: {
        chainId: TAIRA_CHAIN_ID,
        networkPrefix: 369,
        networkId: TEST_TAIRA_NETWORK_ID,
        genesisHash: TEST_TAIRA_GENESIS_HASH,
      },
      networkIdentity: {
        state: "pinned-now",
        observedNetworkId: TEST_TAIRA_NETWORK_ID,
        pinned: { networkId: TEST_TAIRA_NETWORK_ID, networkPrefix: 369 },
      },
      diagnostic: { code: "endpoint_identity_matched" },
    });
    expect(inspection.evidence.map((entry) => entry.source)).toEqual([
      "account-capabilities",
      "genesis-block",
    ]);
    expect(pins.pinFirstUse).toHaveBeenCalledTimes(1);
    expect(requireTrustedInspectionNetworkId(inspection)).toBe(
      TEST_TAIRA_NETWORK_ID,
    );
    expect(getTrustedEndpointIdentityScope(inspection)).toEqual({
      toriiUrl: "https://taira.sora.org",
      observedChainId: TAIRA_CHAIN_ID,
      observedNetworkPrefix: 369,
      observedGenesisHash: TEST_TAIRA_GENESIS_HASH,
    });
  });

  it("accepts the legacy lowercase genesis hash form and normalizes it", async () => {
    const inspection = await inspectEndpoint(network, {
      identityPins: memoryPins(),
      fetchImpl: routeFetch(
        identityRoutes({ genesisHash: TEST_TAIRA_GENESIS_HASH }),
      ),
    });
    expect(inspection.identityStatus).toBe("matched");
    expect(inspection.observed?.networkId).toBe(TEST_TAIRA_NETWORK_ID);
  });

  it("keeps an existing matching pin without re-pinning", async () => {
    const pins = memoryPins([testNetworkIdentityPin()]);
    const inspection = await inspectEndpoint(network, {
      identityPins: pins,
      fetchImpl: routeFetch(identityRoutes()),
    });
    expect(inspection.identityStatus).toBe("matched");
    expect(inspection.networkIdentity.state).toBe("matches-pin");
    expect(pins.pinFirstUse).not.toHaveBeenCalled();
  });

  it("blocks writes when a reset changed the pinned identity", async () => {
    const pins = memoryPins([
      testNetworkIdentityPin({ networkId: TEST_PREVIOUS_TAIRA_NETWORK_ID }),
    ]);
    const inspection = await inspectEndpoint(network, {
      identityPins: pins,
      fetchImpl: routeFetch(identityRoutes()),
    });
    expect(inspection).toMatchObject({
      identityStatus: "changed",
      accessMode: "read-only",
      expected: { networkId: TEST_PREVIOUS_TAIRA_NETWORK_ID },
      observed: { networkId: TEST_TAIRA_NETWORK_ID },
      networkIdentity: {
        state: "changed",
        pinned: { networkId: TEST_PREVIOUS_TAIRA_NETWORK_ID },
        observedNetworkId: TEST_TAIRA_NETWORK_ID,
      },
      diagnostic: { code: "endpoint_identity_changed" },
    });
    expect(inspection.diagnostic.message).toContain(
      "confirm the new network identity",
    );
    expect(pins.pinFirstUse).not.toHaveBeenCalled();
    expect(() => requireTrustedInspectionNetworkId(inspection)).toThrow(
      EndpointWriteBlockedError,
    );
    await expect(
      assertEndpointWriteAuthorized(network, {
        identityPins: pins,
        fetchImpl: routeFetch(identityRoutes()),
      }),
    ).rejects.toMatchObject({ code: "endpoint_identity_changed" });
  });

  it("fails closed when the two identity sources disagree", async () => {
    const inspection = await inspectEndpoint(network, {
      identityPins: memoryPins(),
      fetchImpl: routeFetch(
        identityRoutes({ genesisHash: TEST_PREVIOUS_TAIRA_NETWORK_ID }),
      ),
    });
    expect(inspection.identityStatus).toBe("conflicting");
    expect(inspection.accessMode).toBe("read-only");
    expect(inspection.observed).toBeNull();
    expect(inspection.networkIdentity.pinned).toBeNull();
    expect(getTrustedEndpointIdentityScope(inspection)).toBeNull();
  });

  it("requires both public sources before trusting an identity", async () => {
    const routes = identityRoutes();
    delete routes["/v1/explorer/blocks/1"];
    const pins = memoryPins();
    const inspection = await inspectEndpoint(network, {
      identityPins: pins,
      fetchImpl: routeFetch(routes),
    });
    expect(inspection.identityStatus).toBe("unverified");
    expect(inspection.diagnostic.message).toContain("/v1/explorer/blocks/1");
    expect(pins.pinFirstUse).not.toHaveBeenCalled();
    expect(inspection.evidence.map((entry) => entry.source)).toEqual([
      "account-capabilities",
    ]);
  });

  it("rejects checksum-invalid and non-genesis identity projections", async () => {
    for (const routes of [
      identityRoutes({
        genesisHash: TEST_TAIRA_NETWORK_ID.replace("#44D9", "#0000"),
      }),
      identityRoutes({
        capabilitiesNetworkId: TEST_TAIRA_NETWORK_ID.toLowerCase(),
      }),
      {
        ...identityRoutes(),
        "/v1/explorer/blocks/1": jsonResponse({
          hash: TEST_TAIRA_NETWORK_ID,
          height: 2,
          prev_block_hash: TEST_PREVIOUS_TAIRA_NETWORK_ID,
        }),
      },
    ]) {
      const inspection = await inspectEndpoint(network, {
        identityPins: memoryPins(),
        fetchImpl: routeFetch(routes),
      });
      expect(inspection.identityStatus).toBe("unverified");
      expect(inspection.accessMode).toBe("read-only");
    }
  });

  it("classifies a network prefix mismatch as mismatched", async () => {
    const inspection = await inspectEndpoint(network, {
      identityPins: memoryPins(),
      fetchImpl: routeFetch(identityRoutes({ networkPrefix: 753 })),
    });
    expect(inspection.identityStatus).toBe("mismatched");
    expect(inspection.diagnostic.code).toBe("endpoint_identity_mismatch");
  });

  it("keeps a custom endpoint read-only and unpinned even with a valid identity", async () => {
    const pins = memoryPins();
    const inspection = await inspectEndpoint(
      { ...network, toriiUrl: "https://example.test" },
      {
        identityPins: pins,
        fetchImpl: routeFetch(identityRoutes()),
      },
    );
    expect(inspection.identityStatus).toBe("unverified");
    expect(inspection.observed?.networkId).toBe(TEST_TAIRA_NETWORK_ID);
    expect(pins.pinFirstUse).not.toHaveBeenCalled();
  });

  it("does not let the TAIRA origin authorize a different configured profile", async () => {
    const inspection = await inspectEndpoint(
      { ...network, chainId: "00000000-0000-0000-0000-000000000000" },
      {
        identityPins: memoryPins(),
        fetchImpl: routeFetch(identityRoutes()),
      },
    );
    expect(inspection.identityStatus).toBe("unverified");
  });

  it("keeps the endpoint read-only when the pin store fails", async () => {
    const pins = memoryPins();
    pins.read.mockRejectedValueOnce(new Error("pin store is malformed"));
    const inspection = await inspectEndpoint(network, {
      identityPins: pins,
      fetchImpl: routeFetch(identityRoutes()),
    });
    expect(inspection.identityStatus).toBe("unverified");
    expect(inspection.diagnostic.message).toContain("pin store is malformed");
  });

  it("does not trust duplicate-key or oversized identity JSON", async () => {
    const duplicate = new Response(
      `{"schema_version":1,"network_id":"${TEST_TAIRA_NETWORK_ID}","network_id":"${TEST_TAIRA_NETWORK_ID}","network_prefix":369}`,
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
    const oversized = jsonResponse({
      ...capabilitiesPayload(),
      padding: "x".repeat(70 * 1024),
    });
    for (const capabilities of [duplicate, oversized]) {
      const inspection = await inspectEndpoint(network, {
        identityPins: memoryPins(),
        fetchImpl: routeFetch({
          ...identityRoutes(),
          "/v1/accounts/capabilities": capabilities,
        }),
      });
      expect(inspection.identityStatus).toBe("unverified");
    }
  });

  it("retries a rate-limited identity source before classifying", async () => {
    let calls = 0;
    const inspection = await inspectEndpoint(network, {
      identityPins: memoryPins(),
      fetchImpl: routeFetch({
        ...identityRoutes(),
        "/v1/accounts/capabilities": () => {
          calls += 1;
          return calls === 1
            ? new Response("{}", {
                status: 429,
                headers: {
                  "Content-Type": "application/json",
                  "Retry-After": "0",
                },
              })
            : jsonResponse(capabilitiesPayload());
        },
      }),
    });
    expect(calls).toBe(2);
    expect(inspection.identityStatus).toBe("matched");
  });

  it("rejects invalid inspection clocks and timeouts before probing", async () => {
    const fetchImpl = vi.fn();
    const identityPins = memoryPins();
    await expect(
      inspectEndpoint(network, { identityPins, fetchImpl, now: () => -1 }),
    ).rejects.toThrow("clock");
    await expect(
      inspectEndpoint(network, { identityPins, fetchImpl, timeoutMs: 0 }),
    ).rejects.toThrow("timeout");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("allows only the faucet challenge on an identity-verified read-only endpoint", async () => {
    const fetchImpl = routeFetch({
      ...identityRoutes(),
      "/openapi.json": jsonResponse({ paths: faucetClaimPaths }),
    });
    const custom = { ...network, toriiUrl: "https://example.test" };
    const inspection = await assertEndpointFaucetChallengeAvailable(custom, {
      identityPins: memoryPins(),
      fetchImpl,
    });
    expect(inspection.identityStatus).toBe("unverified");
    expect(canAttemptFaucetIdentityChallenge(inspection)).toBe(true);
    await expect(
      assertEndpointWriteAuthorized(custom, {
        identityPins: memoryPins(),
        fetchImpl,
      }),
    ).rejects.toBeInstanceOf(EndpointWriteBlockedError);
  });

  it("does not attempt the faucet challenge without the prepared-flow routes", async () => {
    const fetchImpl = routeFetch({
      ...identityRoutes(),
      "/openapi.json": jsonResponse({
        paths: {
          "/v1/accounts/faucet/puzzle": { get: {} },
          "/v1/accounts/faucet": { post: {} },
        },
      }),
    });
    await expect(
      assertEndpointFaucetChallengeAvailable(network, {
        identityPins: memoryPins(),
        fetchImpl,
      }),
    ).rejects.toMatchObject({ feature: "faucetClaim" });
  });

  it("resolves the pinned NetworkId without reading OpenAPI", async () => {
    const pins = memoryPins();
    const fetchImpl = routeFetch(identityRoutes());
    await expect(
      resolvePinnedEndpointNetworkId(network, {
        identityPins: pins,
        fetchImpl,
      }),
    ).resolves.toBe(TEST_TAIRA_NETWORK_ID);
    expect(
      fetchImpl.mock.calls.some(([url]) =>
        String(url).endsWith("/openapi.json"),
      ),
    ).toBe(false);
    await expect(
      resolvePinnedEndpointNetworkId(network, {
        identityPins: memoryPins([
          testNetworkIdentityPin({ networkId: TEST_PREVIOUS_TAIRA_NETWORK_ID }),
        ]),
        fetchImpl,
      }),
    ).rejects.toThrow("endpoint_identity_changed");
    await expect(
      resolvePinnedEndpointNetworkId(
        { ...network, toriiUrl: "https://example.test" },
        { identityPins: pins, fetchImpl },
      ),
    ).rejects.toThrow("not a release write target");
  });

  it("distinguishes an unreachable endpoint from an unverified one", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("offline");
    });
    const inspection = await inspectEndpoint(network, {
      identityPins: memoryPins(),
      fetchImpl,
    });
    expect(inspection.identityStatus).toBe("unreachable");
    expect(inspection.accessMode).toBe("offline");
  });

  it("requires a pin store", async () => {
    await expect(
      inspectEndpoint(
        network,
        {} as unknown as Parameters<typeof inspectEndpoint>[1],
      ),
    ).rejects.toThrow("pin store");
  });
});

describe("endpoint inspector OpenAPI features", () => {
  it("builds feature availability from advertised exact OpenAPI routes", async () => {
    const fetchImpl = routeFetch({
      ...identityRoutes(),
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

    const inspection = await inspectEndpoint(network, {
      identityPins: memoryPins(),
      fetchImpl,
    });

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
      ...identityRoutes(),
      "/openapi.json": jsonResponse(currentOpenApi),
    });

    const inspection = await inspectEndpoint(network, {
      identityPins: memoryPins(),
      fetchImpl,
    });

    expect(inspection.features.soraCloudHfSharedLease.supported).toBe(true);
  });

  it("rejects the obsolete SoraCloud deploy route", async () => {
    const fetchImpl = routeFetch({
      ...identityRoutes(),
      "/openapi.json": jsonResponse({
        paths: {
          "/v1/soracloud/hf/deploy": { post: {} },
        },
      }),
    });

    const inspection = await inspectEndpoint(network, {
      identityPins: memoryPins(),
      fetchImpl,
    });

    expect(inspection.features.soraCloudHfSharedLease.supported).toBe(false);
    expect(
      inspection.features.soraCloudHfSharedLease.missingOperations,
    ).toContain("CONTRACT /v1/soracloud/hf/lease exact-v1");
  });

  it("fails closed when a shared-lease response schema accepts unknown fields", async () => {
    const permissiveSchemas = structuredClone(exactSharedLeaseSchemas);
    permissiveSchemas.HfSharedLeaseStatusResponse.additionalProperties = true;
    const fetchImpl = routeFetch({
      ...identityRoutes(),
      "/openapi.json": jsonResponse({
        paths: exactSharedLeasePaths,
        components: { schemas: permissiveSchemas },
      }),
    });

    const inspection = await inspectEndpoint(network, {
      identityPins: memoryPins(),
      fetchImpl,
    });

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

    const inspection = await inspectEndpoint(network, {
      identityPins: memoryPins(),
      fetchImpl,
    });

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

      const inspection = await inspectEndpoint(network, {
        identityPins: memoryPins(),
        fetchImpl,
      });

      expect(inspection.features.soraCloudHfSharedLease.supported).toBe(false);
      expect(
        inspection.features.soraCloudHfSharedLease.missingOperations,
      ).toContain("CONTRACT /v1/soracloud/hf/lease exact-v1");
    }
  });

  it("checks subscription write routes independently", async () => {
    const fetchImpl = routeFetch({
      ...identityRoutes(),
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

    const inspection = await inspectEndpoint(network, {
      identityPins: memoryPins(),
      fetchImpl,
    });

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

    const inspection = await inspectEndpoint(network, {
      identityPins: memoryPins(),
      fetchImpl,
    });

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
      ...identityRoutes(),
      "/openapi.json": jsonResponse({
        paths: {
          "/v1/pipeline/transactions": { post: {} },
        },
      }),
    });

    const inspection = await inspectEndpoint(network, {
      identityPins: memoryPins(),
      fetchImpl,
    });

    expect(inspection.features.accountRegistration.supported).toBe(false);
    expect(inspection.features.assetTransfers.supported).toBe(false);
    expect(inspection.features.assetTransfers.missingOperations).toContain(
      "POST /v1/fees/quote",
    );
  });

  it("does not treat empty OpenAPI method placeholders as write routes", async () => {
    const fetchImpl = routeFetch({
      ...identityRoutes(),
      "/openapi.json": jsonResponse({
        paths: {
          "/v1/fees/quote": { post: null },
          "/v1/pipeline/transactions": { post: "unresolved" },
        },
      }),
    });

    const inspection = await inspectEndpoint(network, {
      identityPins: memoryPins(),
      fetchImpl,
    });

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
      ...identityRoutes(),
      "/openapi.json": jsonResponse({
        paths: {
          "/v1/fees/quote": { post: {} },
          "/v1/accounts/onboard": { post: {} },
          ...faucetClaimPaths,
          ...finalizedTransactionEvidencePaths,
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

    const inspection = await inspectEndpoint(network, {
      identityPins: memoryPins(),
      fetchImpl,
    });

    expect(
      Object.entries(inspection.features)
        .filter(([, feature]) => !feature.supported)
        .map(([name, feature]) => [name, feature.missingOperations]),
    ).toEqual([]);
  });

  it("classifies the live Taira identity and route inventory as read-write", async () => {
    // Snapshot of the identity sources and routes served by
    // https://taira.sora.org on 2026-10-13 (after the 2026-10-11 reset).
    const liveRoutes: Record<string, Record<string, object>> = {};
    for (const route of [
      "POST /v1/fees/quote",
      "POST /v1/pipeline/transactions",
      "GET /v1/pipeline/transactions/status",
      "GET /v1/explorer/transactions/{hash}",
      "GET /v1/explorer/blocks/{identifier}",
      "GET /v1/explorer/metrics",
      "GET /v1/accounts/faucet/policy",
      "GET /v1/accounts/faucet/puzzle",
      "POST /v1/accounts/faucet/prepare",
      "POST /v1/accounts/faucet",
      "POST /v1/connect/session",
      "GET /v1/gov/capabilities",
    ]) {
      const [method, path] = route.split(" ");
      liveRoutes[path] = { ...liveRoutes[path], [method.toLowerCase()]: {} };
    }
    const inspection = await inspectEndpoint(network, {
      identityPins: memoryPins(),
      fetchImpl: routeFetch({
        ...identityRoutes(),
        // Live governance capabilities now require canonical request auth.
        "/v1/gov/capabilities": jsonResponse(
          { code: "canonical_authentication_required" },
          401,
        ),
        "/v1/chain/metadata": jsonResponse({ code: "route_not_found" }, 404),
        "/openapi.json": jsonResponse({ paths: liveRoutes }),
      }),
    });
    expect(inspection.identityStatus).toBe("matched");
    expect(inspection.accessMode).toBe("read-write");
    expect(inspection.features.assetTransfers.supported).toBe(true);
    expect(inspection.features.faucetClaim.supported).toBe(true);
    expect(inspection.features.irohaConnectSessions.supported).toBe(true);
    expect(inspection.features.governanceWrites.supported).toBe(false);
  });
});

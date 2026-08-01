import { describe, expect, it, vi } from "vitest";
import {
  ARCHIVED_TAIRA_CHAIN_ID,
  CURRENT_READ_OPERATIONS,
  OFFICIAL_TAIRA_CHAIN_ID,
  OFFICIAL_V2_WRITE_OPERATIONS,
  TAIRA_XOR_ASSET_DEFINITION_ID,
  assertCurrentReadSurface,
  assertOfficialV2WriteSurface,
  classifyTairaIdentity,
  normalizeToriiBaseUrl,
  probeJson,
  validateAccountAssets,
  validateCitizenStatus,
  validateExplorerMetrics,
  validateFinalizedTransactionRead,
  validateKaigiRelayHealth,
  validateOfflineReadiness,
  validateOwnedSubscriptions,
  validatePublicLaneStake,
  validatePublicLaneValidators,
} from "../scripts/e2e/taira-read-contract-utils.mjs";

const openApiReadFixture = () => {
  const paths = {};
  for (const operation of CURRENT_READ_OPERATIONS) {
    const [method, path] = operation.split(" ");
    const concretePath = path.replaceAll("{}", "{resource_id}");
    paths[concretePath] ??= {};
    paths[concretePath][method.toLowerCase()] = {};
  }
  return { paths };
};

const closedSchema = (required, propertyNames, overrides = {}) => ({
  type: "object",
  additionalProperties: false,
  required,
  properties: Object.fromEntries(
    propertyNames.map((property) => [property, { type: "string" }]),
  ),
  ...overrides,
});

const subscriptionDraftSchemasFixture = () => {
  const stateFields = [
    "plan_id",
    "provider",
    "subscriber",
    "status",
    "current_period_start_ms",
    "current_period_end_ms",
    "next_charge_ms",
    "cancel_at_period_end",
    "cancel_at_ms",
    "failure_count",
    "usage_accumulated",
    "billing_trigger_id",
  ];
  const createResponseFields = [
    "version",
    "authority",
    "action",
    "subscription_id",
    "plan_id",
    "billing_trigger_id",
    "usage_trigger_id",
    "first_charge_ms",
    "provider_usage_grant_included",
    "resulting_subscription",
    "tx_instructions",
  ];
  const actionDetailFields = [
    "billing_trigger_id",
    "billing_trigger_operation",
    "effective_charge_ms",
    "cancel_mode",
    "resulting_subscription",
  ];
  const actionResponseFields = [
    "version",
    "authority",
    "action",
    "subscription_id",
    "details",
    "tx_instructions",
  ];
  const schemas = {
    SubscriptionMutationInstructionDraftV1: closedSchema(
      ["wire_id", "payload_hex"],
      ["wire_id", "payload_hex"],
    ),
    SubscriptionStateV1: closedSchema(stateFields, stateFields),
    SubscriptionCreateDraftRequestV1: closedSchema(
      ["authority", "subscription_id", "plan_id"],
      [
        "authority",
        "subscription_id",
        "plan_id",
        "billing_trigger_id",
        "usage_trigger_id",
        "first_charge_ms",
        "grant_usage_to_provider",
      ],
    ),
    SubscriptionAuthorityDraftRequestV1: closedSchema(
      ["authority"],
      ["authority"],
    ),
    SubscriptionChargeDraftRequestV1: closedSchema(
      ["authority"],
      ["authority", "charge_at_ms"],
    ),
    SubscriptionCancelDraftRequestV1: closedSchema(
      ["authority", "cancel_mode"],
      ["authority", "cancel_mode"],
    ),
    SubscriptionCreateDraftResponseV1: closedSchema(
      createResponseFields,
      createResponseFields,
    ),
    SubscriptionActionDraftDetailsV1: closedSchema(
      actionDetailFields,
      actionDetailFields,
    ),
    SubscriptionActionDraftResponseV1: closedSchema(
      actionResponseFields,
      actionResponseFields,
    ),
    SubscriptionCancelModeV1: { oneOf: [] },
  };

  schemas.SubscriptionMutationInstructionDraftV1.properties.payload_hex = {
    type: "string",
    pattern: "^(?:[0-9a-f]{2})+$",
  };
  schemas.SubscriptionCancelDraftRequestV1.properties.cancel_mode = {
    $ref: "#/components/schemas/SubscriptionCancelModeV1",
  };
  schemas.SubscriptionCreateDraftResponseV1.properties.version = {
    type: "integer",
    enum: [1],
  };
  schemas.SubscriptionCreateDraftResponseV1.properties.action = {
    type: "string",
    enum: ["create"],
  };
  schemas.SubscriptionCreateDraftResponseV1.properties.resulting_subscription =
    {
      $ref: "#/components/schemas/SubscriptionStateV1",
    };
  schemas.SubscriptionCreateDraftResponseV1.properties.tx_instructions = {
    type: "array",
    minItems: 2,
    items: {
      $ref: "#/components/schemas/SubscriptionMutationInstructionDraftV1",
    },
  };
  schemas.SubscriptionActionDraftDetailsV1.properties.resulting_subscription = {
    $ref: "#/components/schemas/SubscriptionStateV1",
  };
  schemas.SubscriptionActionDraftResponseV1.properties.version = {
    type: "integer",
    enum: [1],
  };
  schemas.SubscriptionActionDraftResponseV1.properties.action = {
    type: "string",
    enum: ["pause", "resume", "cancel", "keep", "charge_now"],
  };
  schemas.SubscriptionActionDraftResponseV1.properties.details = {
    $ref: "#/components/schemas/SubscriptionActionDraftDetailsV1",
  };
  schemas.SubscriptionActionDraftResponseV1.properties.tx_instructions = {
    type: "array",
    minItems: 1,
    items: {
      $ref: "#/components/schemas/SubscriptionMutationInstructionDraftV1",
    },
  };
  return schemas;
};

const subscriptionDraftPost = (requestSchema, responseSchema) => ({
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: { $ref: `#/components/schemas/${requestSchema}` },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: { $ref: `#/components/schemas/${responseSchema}` },
        },
      },
    },
  },
});

const openApiWriteFixture = () => {
  const subscriptionContracts = new Map([
    [
      "POST /v1/subscriptions",
      ["SubscriptionCreateDraftRequestV1", "SubscriptionCreateDraftResponseV1"],
    ],
    [
      "POST /v1/subscriptions/{}/pause",
      [
        "SubscriptionAuthorityDraftRequestV1",
        "SubscriptionActionDraftResponseV1",
      ],
    ],
    [
      "POST /v1/subscriptions/{}/resume",
      ["SubscriptionChargeDraftRequestV1", "SubscriptionActionDraftResponseV1"],
    ],
    [
      "POST /v1/subscriptions/{}/cancel",
      ["SubscriptionCancelDraftRequestV1", "SubscriptionActionDraftResponseV1"],
    ],
    [
      "POST /v1/subscriptions/{}/keep",
      [
        "SubscriptionAuthorityDraftRequestV1",
        "SubscriptionActionDraftResponseV1",
      ],
    ],
    [
      "POST /v1/subscriptions/{}/charge-now",
      ["SubscriptionChargeDraftRequestV1", "SubscriptionActionDraftResponseV1"],
    ],
  ]);
  const paths = {};
  for (const operation of OFFICIAL_V2_WRITE_OPERATIONS) {
    const [method, path] = operation.split(" ");
    const concretePath = path.replace("{}", "{resource_id}");
    paths[concretePath] ??= {};
    const subscriptionContract = subscriptionContracts.get(operation);
    paths[concretePath][method.toLowerCase()] = subscriptionContract
      ? subscriptionDraftPost(...subscriptionContract)
      : {};
  }
  paths["/v1/soracloud/hf/deploy"].post = {
    "x-iroha-soracloud-hf-deploy-contract": "cap-bound-local-signing-v1",
    responses: {
      200: {
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
  const schemas = subscriptionDraftSchemasFixture();
  schemas.SoracloudHfDeployDraftV1 = closedSchema(
    ["ok", "authority", "signed_by", "tx_instructions"],
    ["ok", "authority", "signed_by", "tx_instructions"],
    {
      "x-iroha-soracloud-hf-deploy-contract": "cap-bound-local-signing-v1",
    },
  );
  schemas.SoracloudHfDeployDraftV1.properties.tx_instructions = {
    type: "array",
    minItems: 1,
    maxItems: 3,
    items: { $ref: "#/components/schemas/SoracloudTxInstruction" },
  };
  schemas.SoracloudTxInstruction = closedSchema(
    ["wire_id", "payload_hex"],
    ["wire_id", "payload_hex"],
  );
  schemas.SoracloudTxInstruction.properties.payload_hex = {
    type: "string",
    pattern: "^(?:[0-9a-f]{2})+$",
  };
  return {
    paths,
    components: { schemas },
  };
};

const explorerMetricsFixture = () => ({
  peers: 4,
  domains: 7,
  accounts: 360,
  assets: 169,
  transactions_accepted: 359,
  transactions_rejected: 16,
  block: 51_179,
  block_created_at: "2026-07-25T05:19:21.206Z",
  finalized_block: 51_179,
  avg_commit_time: { ms: 437_192 },
  avg_block_time: { ms: 1_000 },
});

const finalizedReadFixture = () => {
  const transactionHash = "ab".repeat(32);
  const status = {
    hash: transactionHash,
    scope: "global",
    resolved_from: "state",
    status: { kind: "Applied", block_height: 17 },
  };
  return {
    expectedHash: transactionHash,
    initialStatus: structuredClone(status),
    confirmationStatus: structuredClone(status),
    transaction: {
      hash: transactionHash,
      block: 17,
      status: "Committed",
    },
    block: {
      hash: "cd".repeat(32),
      height: 17,
      transactions_hash: transactionHash,
      transactions_total: 1,
    },
    metrics: {
      ...explorerMetricsFixture(),
      block: 19,
      finalized_block: 19,
    },
  };
};

const offlineReadinessFixture = (overrides = {}) => ({
  required_bridge_abi_version: 21,
  cash_handoff_capability: "cash_handoff_v1",
  max_hops: 8,
  asset_definition_id: TAIRA_XOR_ASSET_DEFINITION_ID,
  asset_scale: null,
  evaluated_block_height: 51_179,
  evaluated_block_hash: "4c".repeat(32),
  active_transfer_verifier: null,
  active_topup_shield_verifier: null,
  active_unshield_verifier: null,
  active_recursive_step_eq_verifier: null,
  active_recursive_step_ep_verifier: null,
  artifact_set: null,
  proof_backend_available: false,
  recursive_lineage_supported: false,
  ready: false,
  blockers: [
    {
      code: "proof_backend_unavailable",
      message: "The proof backend is unavailable.",
    },
  ],
  ...overrides,
});

const validatorsFixture = () => ({
  lane_id: 0,
  total: 1,
  items: [
    {
      lane_id: 0,
      validator: "testu-validator",
      peer_id: "peer-1",
      stake_account: "testu-staker",
      total_stake: "10000",
      self_stake: "10000",
      status: { type: "Active" },
      activation_epoch: 0,
      activation_height: 1,
      last_reward_epoch: null,
      metadata: {},
      authority_source: "staking",
    },
  ],
});

const stakeFixture = () => ({
  lane_id: 0,
  total: 1,
  items: [
    {
      lane_id: 0,
      validator: "testu-validator",
      staker: "testu-staker",
      bonded: "10000",
      metadata: {},
      pending_unbonds: [],
    },
  ],
});

describe("Taira read contract utilities", () => {
  it("normalizes Torii URLs and probes accepted JSON responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('{"ok":true}', {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    await expect(
      probeJson(fetchMock, "https://taira.sora.org/", "/status"),
    ).resolves.toEqual({ status: 200, payload: { ok: true } });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://taira.sora.org/status",
      expect.objectContaining({ method: "GET" }),
    );
    expect(normalizeToriiBaseUrl("https://taira.sora.org///")).toBe(
      "https://taira.sora.org",
    );
  });

  it("retries a rate-limited live read before validating its payload", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('{"code":"preauth_rate_limited"}', {
          status: 429,
          headers: {
            "content-type": "application/json",
            "retry-after": "0",
          },
        }),
      )
      .mockResolvedValueOnce(
        new Response('{"ok":true}', {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );

    await expect(
      probeJson(fetchMock, "https://taira.sora.org", "/status"),
    ).resolves.toEqual({ status: 200, payload: { ok: true } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("classifies official, archived, and conflicting identity evidence", () => {
    expect(
      classifyTairaIdentity({
        faucetPuzzle: {
          chain_id: OFFICIAL_TAIRA_CHAIN_ID,
          chain_discriminant: 369,
        },
        councilAudit: { chain_id: OFFICIAL_TAIRA_CHAIN_ID },
      }),
    ).toMatchObject({ state: "matched", accessMode: "read-write" });
    expect(
      classifyTairaIdentity({
        faucetPuzzle: { chain_id: ARCHIVED_TAIRA_CHAIN_ID },
        councilAudit: { chain_id: ARCHIVED_TAIRA_CHAIN_ID },
      }),
    ).toMatchObject({ state: "mismatched", accessMode: "read-only" });
    expect(
      classifyTairaIdentity({
        faucetPuzzle: { chain_id: OFFICIAL_TAIRA_CHAIN_ID },
        councilAudit: { chain_id: ARCHIVED_TAIRA_CHAIN_ID },
      }),
    ).toMatchObject({ state: "conflicting", accessMode: "read-only" });
  });

  it("requires current canonical uint64-string citizen payloads", () => {
    const accountId = "testu-account";
    expect(
      validateCitizenStatus(
        {
          account_id: accountId,
          is_citizen: true,
          amount: "10000",
          bonded_height: "18457",
          seats_in_epoch: "0",
          last_epoch_seen: "0",
          cooldown_until: "0",
        },
        accountId,
      ),
    ).toMatchObject({ is_citizen: true, bonded_height: "18457" });
    expect(
      validateCitizenStatus(
        {
          account_id: accountId,
          is_citizen: false,
          amount: null,
          bonded_height: "18457",
          seats_in_epoch: "0",
          last_epoch_seen: null,
          cooldown_until: "0",
          additive_field: true,
        },
        accountId,
      ),
    ).toMatchObject({ is_citizen: false, bonded_height: "18457" });
    expect(() =>
      validateCitizenStatus(
        {
          account_id: accountId,
          is_citizen: true,
          bonded_height: 18457,
          seats_in_epoch: "0",
          last_epoch_seen: "0",
          cooldown_until: "0",
        },
        accountId,
      ),
    ).toThrow("bonded_height");
    expect(() =>
      validateCitizenStatus(
        {
          account_id: accountId,
          is_citizen: true,
          bonded_height: "18446744073709551616",
          seats_in_epoch: "0",
          last_epoch_seen: "0",
          cooldown_until: "0",
        },
        accountId,
      ),
    ).toThrow("bonded_height");
    expect(() =>
      validateCitizenStatus(
        {
          account_id: accountId,
          is_citizen: true,
          bonded_height: "18457",
          seats_in_epoch: "0",
          last_epoch_seen: "0",
        },
        accountId,
      ),
    ).toThrow("cooldown_until");
    expect(() =>
      validateCitizenStatus(
        {
          account_id: "another-account",
          is_citizen: false,
          bonded_height: null,
          seats_in_epoch: null,
          last_epoch_seen: null,
          cooldown_until: null,
        },
        accountId,
      ),
    ).toThrow("different account");
  });

  it("requires every current read surface used by the app", () => {
    const fixture = {
      openApi: openApiReadFixture(),
      lifecycle: { lanes: [] },
      validators: validatorsFixture(),
      stake: stakeFixture(),
      vpnProfile: { available: false },
      soraCloud: { control_plane: { service_count: 0, services: [] } },
      subscriptionPlans: { items: [], total: 0 },
      explorerMetrics: explorerMetricsFixture(),
      offlineReadiness: offlineReadinessFixture(),
      kaigiRelayHealth: {
        healthy_total: 0,
        degraded_total: 0,
        unavailable_total: 0,
        reports_total: 0,
        registrations_total: 0,
        failovers_total: 0,
        domains: [],
      },
      requestedAssetDefinitionId: TAIRA_XOR_ASSET_DEFINITION_ID,
      requestedLaneId: 0,
      requestedValidator: "testu-validator",
    };
    expect(() => assertCurrentReadSurface(fixture)).not.toThrow();
    const missingRoute = structuredClone(fixture);
    delete missingRoute.openApi.paths[
      "/v1/nexus/public-lanes/{resource_id}/stake"
    ];
    expect(() => assertCurrentReadSurface(missingRoute)).toThrow(
      "GET /v1/nexus/public-lanes/{}/stake",
    );
  });

  it("validates exact explorer metrics and Kaigi relay-health shapes", () => {
    expect(() =>
      validateExplorerMetrics(explorerMetricsFixture()),
    ).not.toThrow();
    expect(() =>
      validateExplorerMetrics({
        ...explorerMetricsFixture(),
        block: 10,
        finalized_block: 11,
      }),
    ).toThrow("cannot exceed");

    const relayHealth = {
      healthy_total: 1,
      degraded_total: 0,
      unavailable_total: 0,
      reports_total: 4,
      registrations_total: 1,
      failovers_total: 0,
      domains: [
        {
          domain: "kaigi.universal",
          registrations_total: 1,
          manifest_updates_total: 2,
          failovers_total: 0,
          health_reports_total: 4,
        },
      ],
    };
    expect(() => validateKaigiRelayHealth(relayHealth)).not.toThrow();
    expect(() =>
      validateKaigiRelayHealth({
        ...relayHealth,
        reportsTotal: 4,
      }),
    ).toThrow("unexpected fields");
  });

  it("requires stable authoritative state plus exact finalized block evidence", () => {
    const fixture = finalizedReadFixture();
    expect(validateFinalizedTransactionRead(fixture)).toEqual({
      status: "finalized",
      transactionHash: fixture.expectedHash,
      blockHeight: 17,
      blockHash: "cd".repeat(32),
      finalizedBlockHeight: 19,
    });

    expect(() =>
      validateFinalizedTransactionRead({
        ...finalizedReadFixture(),
        initialStatus: {
          ...fixture.initialStatus,
          resolved_from: "cache",
          status: { kind: "Committed", block_height: 17 },
        },
      }),
    ).toThrow("authoritative state");

    expect(() =>
      validateFinalizedTransactionRead({
        ...finalizedReadFixture(),
        metrics: {
          ...fixture.metrics,
          finalized_block: 16,
        },
      }),
    ).toThrow("does not cover");

    expect(() =>
      validateFinalizedTransactionRead({
        ...finalizedReadFixture(),
        transaction: {
          ...fixture.transaction,
          hash: "ef".repeat(32),
        },
      }),
    ).toThrow("does not match");
  });

  it("binds offline readiness to the exact canonical asset and blockers", () => {
    expect(() =>
      validateOfflineReadiness(
        offlineReadinessFixture(),
        TAIRA_XOR_ASSET_DEFINITION_ID,
      ),
    ).not.toThrow();
    expect(() =>
      validateOfflineReadiness(
        offlineReadinessFixture({
          required_bridge_abi_version: 20,
        }),
        TAIRA_XOR_ASSET_DEFINITION_ID,
      ),
    ).toThrow("must be exactly 21");
    expect(() =>
      validateOfflineReadiness(
        offlineReadinessFixture(),
        TAIRA_XOR_ASSET_DEFINITION_ID,
        20,
      ),
    ).toThrow("release gate must require offline readiness ABI version 21");
    const missingCashHandoffCapability = offlineReadinessFixture();
    delete missingCashHandoffCapability.cash_handoff_capability;
    expect(() =>
      validateOfflineReadiness(
        missingCashHandoffCapability,
        TAIRA_XOR_ASSET_DEFINITION_ID,
      ),
    ).toThrow(
      'Offline readiness.cash_handoff_capability must be exactly "cash_handoff_v1".',
    );
    expect(() =>
      validateOfflineReadiness(
        offlineReadinessFixture({
          cash_handoff_capability: "cash_handoff_v0",
        }),
        TAIRA_XOR_ASSET_DEFINITION_ID,
      ),
    ).toThrow(
      'Offline readiness.cash_handoff_capability must be exactly "cash_handoff_v1".',
    );
    expect(() =>
      validateOfflineReadiness(
        offlineReadinessFixture({ compatibility_hint: "legacy" }),
        TAIRA_XOR_ASSET_DEFINITION_ID,
      ),
    ).toThrow("Offline readiness contains unexpected fields");
    expect(() =>
      validateOfflineReadiness(
        offlineReadinessFixture({
          asset_definition_id: "7TEAJqbb8oEPmLncoNiMRbLEK6tw",
        }),
        TAIRA_XOR_ASSET_DEFINITION_ID,
      ),
    ).toThrow("exact requested asset");
    expect(() =>
      validateOfflineReadiness(
        offlineReadinessFixture({ ready: true }),
        TAIRA_XOR_ASSET_DEFINITION_ID,
      ),
    ).toThrow("exactly when blockers is empty");
    expect(() =>
      validateOfflineReadiness(offlineReadinessFixture(), "xor#universal"),
    ).toThrow("canonical");
  });

  it("derives and validates a validator-filtered public-lane stake read", () => {
    const validators = validatePublicLaneValidators(validatorsFixture(), 0);
    const requestedValidator = validators.items[0].validator;
    expect(() =>
      validatePublicLaneStake(stakeFixture(), {
        requestedLaneId: validators.lane_id,
        requestedValidator,
      }),
    ).not.toThrow();
    expect(() =>
      validatePublicLaneStake(
        {
          ...stakeFixture(),
          items: [
            {
              ...stakeFixture().items[0],
              validator: "testu-another-validator",
            },
          ],
        },
        {
          requestedLaneId: validators.lane_id,
          requestedValidator,
        },
      ),
    ).toThrow("does not match");
  });

  it("validates account-scoped asset and owned-subscription reads", () => {
    const accountId = "testu-account";
    expect(() =>
      validateAccountAssets(
        {
          items: [
            {
              account_id: accountId,
              asset: TAIRA_XOR_ASSET_DEFINITION_ID,
              quantity: "14999.9926",
              scope: "global",
            },
          ],
          total: 1,
        },
        accountId,
      ),
    ).not.toThrow();
    expect(() =>
      validateAccountAssets(
        {
          items: [
            {
              account_id: "testu-another-account",
              asset: TAIRA_XOR_ASSET_DEFINITION_ID,
              quantity: "1",
              scope: "global",
            },
          ],
          total: 1,
        },
        accountId,
      ),
    ).toThrow("requested account");
    expect(() =>
      validateAccountAssets(
        {
          items: [
            {
              account_id: accountId,
              asset_id: TAIRA_XOR_ASSET_DEFINITION_ID,
              quantity: "1",
              scope: "global",
            },
          ],
          total: 1,
        },
        accountId,
      ),
    ).toThrow("canonical");

    expect(() =>
      validateOwnedSubscriptions({
        items: [],
        total: 0,
        has_more: false,
        count_mode: "exact",
      }),
    ).not.toThrow();
    expect(() =>
      validateOwnedSubscriptions({
        items: [],
        total: 0,
        hasMore: false,
        count_mode: "exact",
      }),
    ).toThrow("unexpected fields");
    expect(() =>
      validateOwnedSubscriptions({
        items: [
          {
            subscriptionId: "legacy-id",
            subscription: {},
            invoice: null,
            plan: null,
          },
        ],
        total: 1,
        has_more: false,
        count_mode: "exact",
      }),
    ).toThrow("unexpected fields");
  });

  it("requires the complete first-release write inventory for official v2", () => {
    const openApi = openApiWriteFixture();
    expect(() => assertOfficialV2WriteSurface(openApi)).not.toThrow();
    delete openApi.paths["/v1/connect/session"];
    expect(() => assertOfficialV2WriteSurface(openApi)).toThrow(
      "POST /v1/connect/session",
    );
  });

  it("rejects server-signed or receipt-shaped subscription write contracts", () => {
    const privateKeyRequest = openApiWriteFixture();
    privateKeyRequest.components.schemas.SubscriptionCreateDraftRequestV1.properties.private_key =
      { type: "string" };
    expect(() => assertOfficialV2WriteSurface(privateKeyRequest)).toThrow(
      "private_key",
    );

    const serverReceipt = openApiWriteFixture();
    serverReceipt.paths["/v1/subscriptions"].post.responses[200].content[
      "application/json"
    ].schema.$ref = "#/components/schemas/SubscriptionActionResponse";
    expect(() => assertOfficialV2WriteSurface(serverReceipt)).toThrow(
      "not a server-submission receipt",
    );

    const permissiveRequest = openApiWriteFixture();
    permissiveRequest.components.schemas.SubscriptionChargeDraftRequestV1.additionalProperties = true;
    expect(() => assertOfficialV2WriteSurface(permissiveRequest)).toThrow(
      "closed first-release object",
    );
  });
});

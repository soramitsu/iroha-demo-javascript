export const OFFICIAL_TAIRA_CHAIN_ID = "fc56984b-2be7-431d-840e-21514d1883f0";
export const ARCHIVED_TAIRA_CHAIN_ID = "809574f5-fee7-5e69-bfcf-52451e42d50f";
export const TAIRA_NETWORK_PREFIX = 369;
export const TAIRA_XOR_ASSET_DEFINITION_ID = "6TEAJqbb8oEPmLncoNiMRbLEK6tw";
const UINT64_MAX_DECIMAL = "18446744073709551615";

export const CURRENT_READ_OPERATIONS = Object.freeze([
  "GET /v1/accounts/{}/assets",
  "GET /v1/explorer/metrics",
  "GET /v1/gov/citizens/{}",
  "GET /v1/kaigi/relays/health",
  "GET /v1/nexus/public-lanes/{}/stake",
  "GET /v1/nexus/public-lanes/{}/validators",
  "GET /v1/offline/readiness",
  "GET /v1/soracloud/status",
  "GET /v1/subscriptions",
  "GET /v1/subscriptions/plans",
  "GET /v1/vpn/profile",
]);

export const OFFICIAL_V2_WRITE_OPERATIONS = Object.freeze([
  "GET /v1/pipeline/transactions/status",
  "GET /v1/explorer/transactions/{}",
  "GET /v1/explorer/blocks/{}",
  "GET /v1/explorer/metrics",
  "POST /v1/fees/quote",
  "POST /v1/accounts/faucet",
  "POST /v1/accounts/onboard",
  "POST /v1/connect/session",
  "POST /v1/pipeline/transactions",
  "POST /v1/pipeline/transaction-entrypoints",
  "POST /v1/zk/roots",
  "POST /v1/confidential/relay/submit",
  "POST /v1/zk/ivm/derive",
  "POST /v1/zk/ivm/prove",
  "DELETE /v1/zk/ivm/prove/{}",
  "POST /v1/gov/citizens/draft",
  "POST /v1/validation-fee/proposals/draft",
  "POST /v1/gov/ballots/plain",
  "POST /v1/gov/parliament/ballots",
  "POST /v1/gov/enact",
  "POST /v1/subscriptions",
  "POST /v1/subscriptions/{}/pause",
  "POST /v1/subscriptions/{}/resume",
  "POST /v1/subscriptions/{}/cancel",
  "POST /v1/subscriptions/{}/keep",
  "POST /v1/subscriptions/{}/charge-now",
  "POST /v1/soracloud/hf/deploy",
  "POST /v1/vpn/quotes",
  "POST /v1/vpn/sessions",
  "DELETE /v1/vpn/sessions/{}",
]);

const isRecord = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const requireRecord = (value, label) => {
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value;
};

const requireExactKeys = (value, allowedKeys, label) => {
  const unexpected = Object.keys(value).filter(
    (key) => !allowedKeys.includes(key),
  );
  if (unexpected.length > 0) {
    throw new Error(
      `${label} contains unexpected fields: ${unexpected.join(", ")}.`,
    );
  }
};

const requireNonEmptyString = (value, label) => {
  if (typeof value !== "string" || !value.trim() || value !== value.trim()) {
    throw new Error(`${label} must be a non-empty trimmed string.`);
  }
  return value;
};

const requireNonNegativeSafeInteger = (value, label) => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer.`);
  }
  return value;
};

const requireNullableNonNegativeSafeInteger = (value, label) => {
  if (value === null) return null;
  return requireNonNegativeSafeInteger(value, label);
};

const requireBoolean = (value, label) => {
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be a boolean.`);
  }
  return value;
};

const requireDecimalAmount = (value, label) => {
  if (typeof value !== "string" || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(value)) {
    throw new Error(`${label} must be a canonical non-negative decimal.`);
  }
  return value;
};

const validateExactListTotal = (payload, label) => {
  if (!Array.isArray(payload.items)) {
    throw new Error(`${label}.items must be an array.`);
  }
  const total = requireNonNegativeSafeInteger(payload.total, `${label}.total`);
  if (total !== payload.items.length) {
    throw new Error(`${label}.total must match the returned item count.`);
  }
  return payload.items;
};

const normalizeOpenApiOperation = (operation) =>
  String(operation)
    .trim()
    .replace(/\{[^}]+\}/gu, "{}")
    .replace(/\s+/gu, " ");

const readOpenApiOperations = (openApi) => {
  if (!isRecord(openApi) || !isRecord(openApi.paths)) {
    throw new Error("OpenAPI paths are missing.");
  }
  const operations = new Set();
  for (const [path, pathItem] of Object.entries(openApi.paths)) {
    if (!isRecord(pathItem)) continue;
    for (const method of ["get", "post", "put", "patch", "delete"]) {
      if (method in pathItem) {
        operations.add(
          normalizeOpenApiOperation(`${method.toUpperCase()} ${path}`),
        );
      }
    }
  }
  return operations;
};

const SUBSCRIPTION_DRAFT_OPERATION_SCHEMAS = Object.freeze([
  [
    "POST /v1/subscriptions",
    "SubscriptionCreateDraftRequestV1",
    "SubscriptionCreateDraftResponseV1",
  ],
  [
    "POST /v1/subscriptions/{}/pause",
    "SubscriptionAuthorityDraftRequestV1",
    "SubscriptionActionDraftResponseV1",
  ],
  [
    "POST /v1/subscriptions/{}/resume",
    "SubscriptionChargeDraftRequestV1",
    "SubscriptionActionDraftResponseV1",
  ],
  [
    "POST /v1/subscriptions/{}/cancel",
    "SubscriptionCancelDraftRequestV1",
    "SubscriptionActionDraftResponseV1",
  ],
  [
    "POST /v1/subscriptions/{}/keep",
    "SubscriptionAuthorityDraftRequestV1",
    "SubscriptionActionDraftResponseV1",
  ],
  [
    "POST /v1/subscriptions/{}/charge-now",
    "SubscriptionChargeDraftRequestV1",
    "SubscriptionActionDraftResponseV1",
  ],
]);

const SUBSCRIPTION_CLOSED_SCHEMA_FIELDS = Object.freeze({
  SubscriptionMutationInstructionDraftV1: {
    required: ["wire_id", "payload_hex"],
    properties: ["wire_id", "payload_hex"],
  },
  SubscriptionStateV1: {
    required: [
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
    ],
    properties: [
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
    ],
  },
  SubscriptionCreateDraftRequestV1: {
    required: ["authority", "subscription_id", "plan_id"],
    properties: [
      "authority",
      "subscription_id",
      "plan_id",
      "billing_trigger_id",
      "usage_trigger_id",
      "first_charge_ms",
      "grant_usage_to_provider",
    ],
  },
  SubscriptionAuthorityDraftRequestV1: {
    required: ["authority"],
    properties: ["authority"],
  },
  SubscriptionChargeDraftRequestV1: {
    required: ["authority"],
    properties: ["authority", "charge_at_ms"],
  },
  SubscriptionCancelDraftRequestV1: {
    required: ["authority", "cancel_mode"],
    properties: ["authority", "cancel_mode"],
  },
  SubscriptionCreateDraftResponseV1: {
    required: [
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
    ],
    properties: [
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
    ],
  },
  SubscriptionActionDraftDetailsV1: {
    required: [
      "billing_trigger_id",
      "billing_trigger_operation",
      "effective_charge_ms",
      "cancel_mode",
      "resulting_subscription",
    ],
    properties: [
      "billing_trigger_id",
      "billing_trigger_operation",
      "effective_charge_ms",
      "cancel_mode",
      "resulting_subscription",
    ],
  },
  SubscriptionActionDraftResponseV1: {
    required: [
      "version",
      "authority",
      "action",
      "subscription_id",
      "details",
      "tx_instructions",
    ],
    properties: [
      "version",
      "authority",
      "action",
      "subscription_id",
      "details",
      "tx_instructions",
    ],
  },
});

const requireExactStringSet = (value, expected, label) => {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${label} must be an array of strings.`);
  }
  const actual = [...value].sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length ||
    actual.some((item, index) => item !== wanted[index])
  ) {
    throw new Error(`${label} does not match the first-release contract.`);
  }
};

const findOpenApiOperation = (openApi, operation) => {
  const normalizedTarget = normalizeOpenApiOperation(operation);
  for (const [path, pathItem] of Object.entries(openApi.paths)) {
    if (!isRecord(pathItem)) continue;
    for (const method of ["get", "post", "put", "patch", "delete"]) {
      if (
        method in pathItem &&
        normalizeOpenApiOperation(`${method.toUpperCase()} ${path}`) ===
          normalizedTarget
      ) {
        return requireRecord(
          pathItem[method],
          `OpenAPI operation ${operation}`,
        );
      }
    }
  }
  throw new Error(`OpenAPI operation ${operation} is missing.`);
};

const readJsonSchemaRef = (value, label) => {
  const schema = requireRecord(value, label);
  return requireNonEmptyString(schema.$ref, `${label}.$ref`);
};

const assertSubscriptionDraftOpenApiContract = (openApi) => {
  const components = requireRecord(openApi.components, "OpenAPI components");
  const schemas = requireRecord(components.schemas, "OpenAPI schemas");

  for (const [name, expected] of Object.entries(
    SUBSCRIPTION_CLOSED_SCHEMA_FIELDS,
  )) {
    const schema = requireRecord(schemas[name], `OpenAPI schema ${name}`);
    if (schema.type !== "object" || schema.additionalProperties !== false) {
      throw new Error(
        `OpenAPI schema ${name} must be a closed first-release object.`,
      );
    }
    requireExactStringSet(
      schema.required,
      expected.required,
      `OpenAPI schema ${name}.required`,
    );
    const properties = requireRecord(
      schema.properties,
      `OpenAPI schema ${name}.properties`,
    );
    requireExactKeys(
      properties,
      expected.properties,
      `OpenAPI schema ${name}.properties`,
    );
    for (const property of expected.properties) {
      if (!(property in properties)) {
        throw new Error(
          `OpenAPI schema ${name}.properties is missing ${property}.`,
        );
      }
    }
  }

  const schemaRef = (name) => `#/components/schemas/${name}`;
  const requireProperty = (schemaName, propertyName) =>
    requireRecord(
      requireRecord(schemas[schemaName], `OpenAPI schema ${schemaName}`)
        .properties[propertyName],
      `OpenAPI schema ${schemaName}.${propertyName}`,
    );

  for (const responseName of [
    "SubscriptionCreateDraftResponseV1",
    "SubscriptionActionDraftResponseV1",
  ]) {
    const version = requireProperty(responseName, "version");
    if (
      version.type !== "integer" ||
      !Array.isArray(version.enum) ||
      version.enum.length !== 1 ||
      version.enum[0] !== 1
    ) {
      throw new Error(
        `OpenAPI schema ${responseName}.version must be exactly V1.`,
      );
    }
  }

  const createAction = requireProperty(
    "SubscriptionCreateDraftResponseV1",
    "action",
  );
  requireExactStringSet(
    createAction.enum,
    ["create"],
    "OpenAPI subscription create action enum",
  );
  const mutationAction = requireProperty(
    "SubscriptionActionDraftResponseV1",
    "action",
  );
  requireExactStringSet(
    mutationAction.enum,
    ["pause", "resume", "cancel", "keep", "charge_now"],
    "OpenAPI subscription mutation action enum",
  );

  const cancelMode = requireProperty(
    "SubscriptionCancelDraftRequestV1",
    "cancel_mode",
  );
  if (cancelMode.$ref !== schemaRef("SubscriptionCancelModeV1")) {
    throw new Error(
      "OpenAPI subscription cancel request must use SubscriptionCancelModeV1.",
    );
  }

  const createState = requireProperty(
    "SubscriptionCreateDraftResponseV1",
    "resulting_subscription",
  );
  if (createState.$ref !== schemaRef("SubscriptionStateV1")) {
    throw new Error(
      "OpenAPI subscription create result must use SubscriptionStateV1.",
    );
  }
  const actionDetails = requireProperty(
    "SubscriptionActionDraftResponseV1",
    "details",
  );
  if (actionDetails.$ref !== schemaRef("SubscriptionActionDraftDetailsV1")) {
    throw new Error(
      "OpenAPI subscription action result must use SubscriptionActionDraftDetailsV1.",
    );
  }
  const detailState = requireProperty(
    "SubscriptionActionDraftDetailsV1",
    "resulting_subscription",
  );
  if (detailState.$ref !== schemaRef("SubscriptionStateV1")) {
    throw new Error(
      "OpenAPI subscription action details must use SubscriptionStateV1.",
    );
  }

  for (const [responseName, minItems] of [
    ["SubscriptionCreateDraftResponseV1", 2],
    ["SubscriptionActionDraftResponseV1", 1],
  ]) {
    const instructions = requireProperty(responseName, "tx_instructions");
    if (
      instructions.type !== "array" ||
      instructions.minItems !== minItems ||
      readJsonSchemaRef(
        requireRecord(
          instructions.items,
          `OpenAPI schema ${responseName}.tx_instructions.items`,
        ),
        `OpenAPI schema ${responseName}.tx_instructions.items`,
      ) !== schemaRef("SubscriptionMutationInstructionDraftV1")
    ) {
      throw new Error(
        `OpenAPI schema ${responseName}.tx_instructions is not the exact unsigned instruction draft array.`,
      );
    }
  }

  const payloadHex = requireProperty(
    "SubscriptionMutationInstructionDraftV1",
    "payload_hex",
  );
  if (
    payloadHex.type !== "string" ||
    payloadHex.pattern !== "^(?:[0-9a-f]{2})+$"
  ) {
    throw new Error(
      "OpenAPI subscription instruction payload must be canonical lowercase framed bytes.",
    );
  }

  for (const [
    operationName,
    requestName,
    responseName,
  ] of SUBSCRIPTION_DRAFT_OPERATION_SCHEMAS) {
    const operation = findOpenApiOperation(openApi, operationName);
    const requestBody = requireRecord(
      operation.requestBody,
      `OpenAPI ${operationName} requestBody`,
    );
    if (requestBody.required !== true) {
      throw new Error(
        `OpenAPI ${operationName} request body must be required.`,
      );
    }
    const requestRef = readJsonSchemaRef(
      requireRecord(
        requireRecord(
          requireRecord(
            requestBody.content,
            `OpenAPI ${operationName} request content`,
          )["application/json"],
          `OpenAPI ${operationName} JSON request`,
        ).schema,
        `OpenAPI ${operationName} request schema`,
      ),
      `OpenAPI ${operationName} request schema`,
    );
    if (requestRef !== schemaRef(requestName)) {
      throw new Error(
        `OpenAPI ${operationName} must use ${requestName}, not a server-signing request.`,
      );
    }

    const responses = requireRecord(
      operation.responses,
      `OpenAPI ${operationName} responses`,
    );
    const success = requireRecord(
      responses["200"],
      `OpenAPI ${operationName} response 200`,
    );
    const responseRef = readJsonSchemaRef(
      requireRecord(
        requireRecord(
          requireRecord(
            success.content,
            `OpenAPI ${operationName} response content`,
          )["application/json"],
          `OpenAPI ${operationName} JSON response`,
        ).schema,
        `OpenAPI ${operationName} response schema`,
      ),
      `OpenAPI ${operationName} response schema`,
    );
    if (responseRef !== schemaRef(responseName)) {
      throw new Error(
        `OpenAPI ${operationName} must return ${responseName}, not a server-submission receipt.`,
      );
    }
  }
};

const assertSoraCloudHfDraftOpenApiContract = (openApi) => {
  const operation = findOpenApiOperation(
    openApi,
    "POST /v1/soracloud/hf/deploy",
  );
  const contractVersion = "cap-bound-local-signing-v1";
  if (operation["x-iroha-soracloud-hf-deploy-contract"] !== contractVersion) {
    throw new Error(
      "OpenAPI SoraCloud HF deploy operation is not the cap-bound local-signing contract.",
    );
  }
  const components = requireRecord(openApi.components, "OpenAPI components");
  const schemas = requireRecord(components.schemas, "OpenAPI schemas");
  const draft = requireRecord(
    schemas.SoracloudHfDeployDraftV1,
    "OpenAPI schema SoracloudHfDeployDraftV1",
  );
  const instruction = requireRecord(
    schemas.SoracloudTxInstruction,
    "OpenAPI schema SoracloudTxInstruction",
  );
  if (
    draft.type !== "object" ||
    draft.additionalProperties !== false ||
    draft["x-iroha-soracloud-hf-deploy-contract"] !== contractVersion
  ) {
    throw new Error(
      "OpenAPI SoraCloud HF draft must be the closed cap-bound local-signing V1 object.",
    );
  }
  requireExactStringSet(
    draft.required,
    ["ok", "authority", "signed_by", "tx_instructions"],
    "OpenAPI SoraCloud HF draft required fields",
  );
  const draftProperties = requireRecord(
    draft.properties,
    "OpenAPI SoraCloud HF draft properties",
  );
  requireExactKeys(
    draftProperties,
    ["ok", "authority", "signed_by", "tx_instructions"],
    "OpenAPI SoraCloud HF draft properties",
  );
  const txInstructions = requireRecord(
    draftProperties.tx_instructions,
    "OpenAPI SoraCloud HF draft tx_instructions",
  );
  if (
    txInstructions.type !== "array" ||
    txInstructions.minItems !== 1 ||
    txInstructions.maxItems !== 3 ||
    readJsonSchemaRef(
      txInstructions.items,
      "OpenAPI SoraCloud HF draft tx_instructions.items",
    ) !== "#/components/schemas/SoracloudTxInstruction"
  ) {
    throw new Error(
      "OpenAPI SoraCloud HF draft instructions must contain the bounded one-to-three instruction contract.",
    );
  }

  if (
    instruction.type !== "object" ||
    instruction.additionalProperties !== false
  ) {
    throw new Error(
      "OpenAPI SoraCloud transaction instruction must be a closed object.",
    );
  }
  requireExactStringSet(
    instruction.required,
    ["wire_id", "payload_hex"],
    "OpenAPI SoraCloud transaction instruction required fields",
  );
  const instructionProperties = requireRecord(
    instruction.properties,
    "OpenAPI SoraCloud transaction instruction properties",
  );
  requireExactKeys(
    instructionProperties,
    ["wire_id", "payload_hex"],
    "OpenAPI SoraCloud transaction instruction properties",
  );
  const payloadHex = requireRecord(
    instructionProperties.payload_hex,
    "OpenAPI SoraCloud transaction instruction payload_hex",
  );
  if (
    payloadHex.type !== "string" ||
    payloadHex.pattern !== "^(?:[0-9a-f]{2})+$"
  ) {
    throw new Error(
      "OpenAPI SoraCloud instruction payload must be canonical lowercase framed bytes.",
    );
  }

  const responses = requireRecord(
    operation.responses,
    "OpenAPI SoraCloud HF deploy responses",
  );
  const success = requireRecord(
    responses["200"],
    "OpenAPI SoraCloud HF deploy response 200",
  );
  const responseRef = readJsonSchemaRef(
    requireRecord(
      requireRecord(
        requireRecord(
          success.content,
          "OpenAPI SoraCloud HF deploy response content",
        )["application/json"],
        "OpenAPI SoraCloud HF deploy JSON response",
      ).schema,
      "OpenAPI SoraCloud HF deploy response schema",
    ),
    "OpenAPI SoraCloud HF deploy response schema",
  );
  if (responseRef !== "#/components/schemas/SoracloudHfDeployDraftV1") {
    throw new Error(
      "OpenAPI SoraCloud HF deploy must return the unsigned cap-bound draft.",
    );
  }
};

export const normalizeToriiBaseUrl = (value) => {
  const normalized = String(value ?? "")
    .trim()
    .replace(/\/+$/, "");
  const parsed = new URL(normalized);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Torii URL must use http or https.");
  }
  return parsed.toString().replace(/\/+$/, "");
};

export const validateCanonicalAssetDefinitionId = (value) => {
  const assetDefinitionId = String(value ?? "").trim();
  if (!/^[1-9A-HJ-NP-Za-km-z]{28}$/u.test(assetDefinitionId)) {
    throw new Error(
      "Asset definition fixture must be a canonical 28-character Base58 identifier.",
    );
  }
  return assetDefinitionId;
};

export const probeJson = async (
  fetchImpl,
  baseUrl,
  path,
  acceptedStatuses = [200],
) => {
  const url = `${normalizeToriiBaseUrl(baseUrl)}${path}`;
  let response;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    response = await fetchImpl(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": "iroha-wallet-taira-read-contract",
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status !== 429 || attempt === 3) {
      break;
    }
    const retryAfter = String(response.headers.get("retry-after") ?? "").trim();
    const seconds = Number(retryAfter);
    const retryAtMs = Date.parse(retryAfter);
    const delayMs =
      Number.isFinite(seconds) && seconds >= 0
        ? Math.ceil(seconds * 1_000)
        : Number.isFinite(retryAtMs)
          ? Math.max(0, Math.ceil(retryAtMs - Date.now()))
          : 1_000;
    await response.body?.cancel().catch(() => {});
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(10_000, delayMs)),
    );
  }
  if (!response) {
    throw new Error(`${path} did not return a response.`);
  }
  const body = await response.text();
  if (!acceptedStatuses.includes(response.status)) {
    throw new Error(
      `${path} returned ${response.status} ${response.statusText}: ${body.slice(0, 240)}`,
    );
  }
  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new Error(`${path} did not return valid JSON.`);
  }
  return { status: response.status, payload };
};

export const classifyTairaIdentity = ({ faucetPuzzle, councilAudit }) => {
  const evidence = [faucetPuzzle, councilAudit]
    .filter(isRecord)
    .map((payload) => String(payload.chain_id ?? "").trim())
    .filter(Boolean);
  const uniqueChainIds = [...new Set(evidence)];
  if (uniqueChainIds.length !== 1) {
    return {
      state: uniqueChainIds.length > 1 ? "conflicting" : "unverified",
      chainId: null,
      accessMode: "read-only",
    };
  }

  const chainId = uniqueChainIds[0];
  if (chainId === OFFICIAL_TAIRA_CHAIN_ID) {
    const prefix = Number(faucetPuzzle?.chain_discriminant);
    if (prefix !== TAIRA_NETWORK_PREFIX) {
      return { state: "conflicting", chainId, accessMode: "read-only" };
    }
    return { state: "matched", chainId, accessMode: "read-write" };
  }
  if (chainId === ARCHIVED_TAIRA_CHAIN_ID) {
    return { state: "mismatched", chainId, accessMode: "read-only" };
  }
  return { state: "unverified", chainId, accessMode: "read-only" };
};

export const validateCitizenStatus = (payload, requestedAccountId) => {
  if (!isRecord(payload)) {
    throw new Error("Citizen status must be an object.");
  }
  const accountId = String(payload.account_id ?? "").trim();
  if (!accountId || accountId !== requestedAccountId) {
    throw new Error("Citizen status returned a different account.");
  }
  if (typeof payload.is_citizen !== "boolean") {
    throw new Error("Citizen status is missing is_citizen.");
  }
  const uint64StringFields = [
    "bonded_height",
    "seats_in_epoch",
    "last_epoch_seen",
    "cooldown_until",
  ];
  for (const field of uint64StringFields) {
    if (!Object.prototype.hasOwnProperty.call(payload, field)) {
      throw new Error(`Citizen status is missing ${field}.`);
    }
    const value = payload[field];
    const validString =
      typeof value === "string" &&
      /^(?:0|[1-9]\d*)$/u.test(value) &&
      (value.length < UINT64_MAX_DECIMAL.length ||
        (value.length === UINT64_MAX_DECIMAL.length &&
          value <= UINT64_MAX_DECIMAL));
    if (value !== null && !validString) {
      throw new Error(
        `Citizen status ${field} must be a canonical uint64 decimal string or null.`,
      );
    }
  }
  return payload;
};

export const validateExplorerMetrics = (payload) => {
  const metrics = requireRecord(payload, "Explorer metrics");
  requireExactKeys(
    metrics,
    [
      "peers",
      "domains",
      "accounts",
      "assets",
      "transactions_accepted",
      "transactions_rejected",
      "block",
      "block_created_at",
      "finalized_block",
      "avg_commit_time",
      "avg_block_time",
    ],
    "Explorer metrics",
  );
  for (const field of [
    "peers",
    "domains",
    "accounts",
    "assets",
    "transactions_accepted",
    "transactions_rejected",
    "block",
    "finalized_block",
  ]) {
    requireNonNegativeSafeInteger(metrics[field], `Explorer metrics.${field}`);
  }
  if (metrics.finalized_block > metrics.block) {
    throw new Error(
      "Explorer metrics.finalized_block cannot exceed the current block.",
    );
  }
  if (metrics.block_created_at !== null) {
    const createdAt = requireNonEmptyString(
      metrics.block_created_at,
      "Explorer metrics.block_created_at",
    );
    if (!Number.isFinite(Date.parse(createdAt))) {
      throw new Error(
        "Explorer metrics.block_created_at must be an ISO timestamp or null.",
      );
    }
  }
  for (const field of ["avg_commit_time", "avg_block_time"]) {
    if (metrics[field] === null) continue;
    const duration = requireRecord(metrics[field], `Explorer metrics.${field}`);
    requireExactKeys(duration, ["ms"], `Explorer metrics.${field}`);
    requireNonNegativeSafeInteger(duration.ms, `Explorer metrics.${field}.ms`);
  }
  return metrics;
};

const requireCanonicalHash = (value, label) => {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/u.test(value)) {
    throw new Error(`${label} must be a canonical lowercase 32-byte hash.`);
  }
  return value;
};

const validateAppliedGlobalStatus = (payload, expectedHash, label) => {
  const envelope = requireRecord(payload, label);
  if (envelope.hash !== expectedHash) {
    throw new Error(`${label}.hash does not match the requested transaction.`);
  }
  if (envelope.scope !== "global" || envelope.resolved_from !== "state") {
    throw new Error(
      `${label} must be global and resolved from authoritative state.`,
    );
  }
  const status = requireRecord(envelope.status, `${label}.status`);
  if (status.kind !== "Applied") {
    throw new Error(`${label}.status.kind must be Applied.`);
  }
  const blockHeight = requireNonNegativeSafeInteger(
    status.block_height,
    `${label}.status.block_height`,
  );
  if (blockHeight < 1) {
    throw new Error(`${label}.status.block_height must be positive.`);
  }
  return blockHeight;
};

export const validateFinalizedTransactionRead = ({
  expectedHash,
  initialStatus,
  confirmationStatus,
  transaction,
  block,
  metrics,
}) => {
  const transactionHash = requireCanonicalHash(
    expectedHash,
    "Expected transaction hash",
  );
  const initialHeight = validateAppliedGlobalStatus(
    initialStatus,
    transactionHash,
    "Initial global transaction status",
  );
  const confirmationHeight = validateAppliedGlobalStatus(
    confirmationStatus,
    transactionHash,
    "Confirmation global transaction status",
  );
  if (confirmationHeight !== initialHeight) {
    throw new Error(
      "The authoritative transaction block changed across finality reads.",
    );
  }

  const transactionDetail = requireRecord(
    transaction,
    "Explorer transaction detail",
  );
  if (
    requireCanonicalHash(
      transactionDetail.hash,
      "Explorer transaction detail.hash",
    ) !== transactionHash
  ) {
    throw new Error(
      "Explorer transaction detail does not match the requested transaction.",
    );
  }
  if (
    requireNonNegativeSafeInteger(
      transactionDetail.block,
      "Explorer transaction detail.block",
    ) !== initialHeight
  ) {
    throw new Error(
      "Explorer transaction detail block does not match authoritative state.",
    );
  }
  if (transactionDetail.status !== "Committed") {
    throw new Error(
      "Explorer transaction detail must identify a successful committed entry.",
    );
  }

  const blockDetail = requireRecord(block, "Explorer block detail");
  const blockHash = requireCanonicalHash(
    blockDetail.hash,
    "Explorer block detail.hash",
  );
  if (
    requireNonNegativeSafeInteger(
      blockDetail.height,
      "Explorer block detail.height",
    ) !== initialHeight
  ) {
    throw new Error(
      "Explorer block detail height does not match authoritative state.",
    );
  }
  requireCanonicalHash(
    blockDetail.transactions_hash,
    "Explorer block detail.transactions_hash",
  );
  if (
    requireNonNegativeSafeInteger(
      blockDetail.transactions_total,
      "Explorer block detail.transactions_total",
    ) < 1
  ) {
    throw new Error(
      "Explorer block detail must contain at least one external transaction.",
    );
  }

  const validatedMetrics = validateExplorerMetrics(metrics);
  if (validatedMetrics.block < initialHeight) {
    throw new Error(
      "Explorer metrics current block is behind the transaction block.",
    );
  }
  if (validatedMetrics.finalized_block < initialHeight) {
    throw new Error(
      "Explorer finalized height does not cover the transaction block.",
    );
  }

  return {
    status: "finalized",
    transactionHash,
    blockHeight: initialHeight,
    blockHash,
    finalizedBlockHeight: validatedMetrics.finalized_block,
  };
};

export const validateOfflineReadiness = (
  payload,
  requestedAssetDefinitionId,
  requiredAbiVersion,
) => {
  const readiness = requireRecord(payload, "Offline readiness");
  requireExactKeys(
    readiness,
    [
      "required_bridge_abi_version",
      "cash_handoff_capability",
      "max_hops",
      "asset_definition_id",
      "asset_scale",
      "evaluated_block_height",
      "evaluated_block_hash",
      "active_transfer_verifier",
      "active_topup_shield_verifier",
      "active_unshield_verifier",
      "active_recursive_step_eq_verifier",
      "active_recursive_step_ep_verifier",
      "artifact_set",
      "proof_backend_available",
      "recursive_lineage_supported",
      "ready",
      "blockers",
    ],
    "Offline readiness",
  );
  if (readiness.required_bridge_abi_version !== 21) {
    throw new Error(
      "Offline readiness.required_bridge_abi_version must be exactly 21.",
    );
  }
  if (requiredAbiVersion !== undefined && requiredAbiVersion !== 21) {
    throw new Error(
      "The release gate must require offline readiness ABI version 21.",
    );
  }
  if (readiness.cash_handoff_capability !== "cash_handoff_v1") {
    throw new Error(
      'Offline readiness.cash_handoff_capability must be exactly "cash_handoff_v1".',
    );
  }
  if (readiness.max_hops !== 8) {
    throw new Error("Offline readiness.max_hops must be exactly 8.");
  }
  const expectedAsset = validateCanonicalAssetDefinitionId(
    requestedAssetDefinitionId,
  );
  if (readiness.asset_definition_id !== expectedAsset) {
    throw new Error(
      "Offline readiness.asset_definition_id must match the exact requested asset.",
    );
  }
  if (
    readiness.asset_scale !== null &&
    (!Number.isSafeInteger(readiness.asset_scale) ||
      readiness.asset_scale < 0 ||
      readiness.asset_scale > 0xffff_ffff)
  ) {
    throw new Error("Offline readiness.asset_scale must be a uint32 or null.");
  }
  requireNonNegativeSafeInteger(
    readiness.evaluated_block_height,
    "Offline readiness.evaluated_block_height",
  );
  if (
    typeof readiness.evaluated_block_hash !== "string" ||
    !/^[0-9a-f]{64}$/u.test(readiness.evaluated_block_hash)
  ) {
    throw new Error(
      "Offline readiness.evaluated_block_hash must be a lowercase 32-byte hash.",
    );
  }
  for (const field of [
    "active_transfer_verifier",
    "active_topup_shield_verifier",
    "active_unshield_verifier",
    "active_recursive_step_eq_verifier",
    "active_recursive_step_ep_verifier",
    "artifact_set",
  ]) {
    if (readiness[field] !== null && !isRecord(readiness[field])) {
      throw new Error(`Offline readiness.${field} must be an object or null.`);
    }
  }
  requireBoolean(
    readiness.proof_backend_available,
    "Offline readiness.proof_backend_available",
  );
  requireBoolean(
    readiness.recursive_lineage_supported,
    "Offline readiness.recursive_lineage_supported",
  );
  requireBoolean(readiness.ready, "Offline readiness.ready");
  if (!Array.isArray(readiness.blockers)) {
    throw new Error("Offline readiness.blockers must be an array.");
  }
  for (const [index, rawBlocker] of readiness.blockers.entries()) {
    const blocker = requireRecord(
      rawBlocker,
      `Offline readiness.blockers[${index}]`,
    );
    requireExactKeys(
      blocker,
      ["code", "message"],
      `Offline readiness.blockers[${index}]`,
    );
    if (
      typeof blocker.code !== "string" ||
      !/^[a-z0-9][a-z0-9_]{0,63}$/u.test(blocker.code)
    ) {
      throw new Error(
        `Offline readiness.blockers[${index}].code is malformed.`,
      );
    }
    requireNonEmptyString(
      blocker.message,
      `Offline readiness.blockers[${index}].message`,
    );
  }
  if (readiness.ready !== (readiness.blockers.length === 0)) {
    throw new Error(
      "Offline readiness.ready must be true exactly when blockers is empty.",
    );
  }
  if (
    readiness.ready &&
    (readiness.asset_scale === null || readiness.asset_scale > 28)
  ) {
    throw new Error(
      "A ready offline response must include a supported asset scale.",
    );
  }
  return readiness;
};

export const validateKaigiRelayHealth = (payload) => {
  const health = requireRecord(payload, "Kaigi relay health");
  const totalFields = [
    "healthy_total",
    "degraded_total",
    "unavailable_total",
    "reports_total",
    "registrations_total",
    "failovers_total",
  ];
  requireExactKeys(health, [...totalFields, "domains"], "Kaigi relay health");
  for (const field of totalFields) {
    requireNonNegativeSafeInteger(health[field], `Kaigi relay health.${field}`);
  }
  if (!Array.isArray(health.domains)) {
    throw new Error("Kaigi relay health.domains must be an array.");
  }
  for (const [index, rawDomain] of health.domains.entries()) {
    const domain = requireRecord(
      rawDomain,
      `Kaigi relay health.domains[${index}]`,
    );
    requireExactKeys(
      domain,
      [
        "domain",
        "registrations_total",
        "manifest_updates_total",
        "failovers_total",
        "health_reports_total",
      ],
      `Kaigi relay health.domains[${index}]`,
    );
    requireNonEmptyString(
      domain.domain,
      `Kaigi relay health.domains[${index}].domain`,
    );
    for (const field of [
      "registrations_total",
      "manifest_updates_total",
      "failovers_total",
      "health_reports_total",
    ]) {
      requireNonNegativeSafeInteger(
        domain[field],
        `Kaigi relay health.domains[${index}].${field}`,
      );
    }
  }
  return health;
};

export const validatePublicLaneValidators = (payload, requestedLaneId) => {
  const validators = requireRecord(payload, "Public-lane validators");
  requireExactKeys(
    validators,
    ["lane_id", "total", "items"],
    "Public-lane validators",
  );
  const laneId = requireNonNegativeSafeInteger(
    requestedLaneId,
    "Requested public lane id",
  );
  if (validators.lane_id !== laneId) {
    throw new Error(
      "Public-lane validators.lane_id must match the requested lane.",
    );
  }
  const items = validateExactListTotal(validators, "Public-lane validators");
  for (const [index, rawItem] of items.entries()) {
    const item = requireRecord(
      rawItem,
      `Public-lane validators.items[${index}]`,
    );
    requireExactKeys(
      item,
      [
        "lane_id",
        "validator",
        "peer_id",
        "stake_account",
        "total_stake",
        "self_stake",
        "status",
        "activation_epoch",
        "activation_height",
        "last_reward_epoch",
        "metadata",
        "authority_source",
      ],
      `Public-lane validators.items[${index}]`,
    );
    if (item.lane_id !== laneId) {
      throw new Error(
        `Public-lane validators.items[${index}].lane_id must match the requested lane.`,
      );
    }
    for (const field of ["validator", "peer_id", "stake_account"]) {
      requireNonEmptyString(
        item[field],
        `Public-lane validators.items[${index}].${field}`,
      );
    }
    for (const field of ["total_stake", "self_stake"]) {
      requireDecimalAmount(
        item[field],
        `Public-lane validators.items[${index}].${field}`,
      );
    }
    const status = requireRecord(
      item.status,
      `Public-lane validators.items[${index}].status`,
    );
    requireNonEmptyString(
      status.type,
      `Public-lane validators.items[${index}].status.type`,
    );
    for (const field of [
      "activation_epoch",
      "activation_height",
      "last_reward_epoch",
    ]) {
      if (field in item) {
        requireNullableNonNegativeSafeInteger(
          item[field],
          `Public-lane validators.items[${index}].${field}`,
        );
      }
    }
    if ("metadata" in item && !isRecord(item.metadata)) {
      throw new Error(
        `Public-lane validators.items[${index}].metadata must be an object.`,
      );
    }
    if ("authority_source" in item) {
      requireNonEmptyString(
        item.authority_source,
        `Public-lane validators.items[${index}].authority_source`,
      );
    }
  }
  return validators;
};

export const validatePublicLaneStake = (
  payload,
  { requestedLaneId, requestedValidator },
) => {
  const stake = requireRecord(payload, "Public-lane stake");
  requireExactKeys(stake, ["lane_id", "total", "items"], "Public-lane stake");
  const laneId = requireNonNegativeSafeInteger(
    requestedLaneId,
    "Requested public lane id",
  );
  const validator = requireNonEmptyString(
    requestedValidator,
    "Requested public-lane validator",
  );
  if (stake.lane_id !== laneId) {
    throw new Error("Public-lane stake.lane_id must match the requested lane.");
  }
  const items = validateExactListTotal(stake, "Public-lane stake");
  if (items.length === 0) {
    throw new Error(
      "Public-lane stake returned no entries for an advertised validator.",
    );
  }
  for (const [index, rawItem] of items.entries()) {
    const item = requireRecord(rawItem, `Public-lane stake.items[${index}]`);
    requireExactKeys(
      item,
      [
        "lane_id",
        "validator",
        "staker",
        "bonded",
        "metadata",
        "pending_unbonds",
      ],
      `Public-lane stake.items[${index}]`,
    );
    if (item.lane_id !== laneId || item.validator !== validator) {
      throw new Error(
        `Public-lane stake.items[${index}] does not match the requested validator and lane.`,
      );
    }
    requireNonEmptyString(
      item.staker,
      `Public-lane stake.items[${index}].staker`,
    );
    requireDecimalAmount(
      item.bonded,
      `Public-lane stake.items[${index}].bonded`,
    );
    if (!isRecord(item.metadata)) {
      throw new Error(
        `Public-lane stake.items[${index}].metadata must be an object.`,
      );
    }
    if (!Array.isArray(item.pending_unbonds)) {
      throw new Error(
        `Public-lane stake.items[${index}].pending_unbonds must be an array.`,
      );
    }
    for (const [unbondIndex, rawUnbond] of item.pending_unbonds.entries()) {
      const unbond = requireRecord(
        rawUnbond,
        `Public-lane stake.items[${index}].pending_unbonds[${unbondIndex}]`,
      );
      requireExactKeys(
        unbond,
        ["request_id", "amount", "release_at_ms"],
        `Public-lane stake.items[${index}].pending_unbonds[${unbondIndex}]`,
      );
      requireNonEmptyString(
        unbond.request_id,
        `Public-lane stake.items[${index}].pending_unbonds[${unbondIndex}].request_id`,
      );
      requireDecimalAmount(
        unbond.amount,
        `Public-lane stake.items[${index}].pending_unbonds[${unbondIndex}].amount`,
      );
      requireNonNegativeSafeInteger(
        unbond.release_at_ms,
        `Public-lane stake.items[${index}].pending_unbonds[${unbondIndex}].release_at_ms`,
      );
    }
  }
  return stake;
};

export const validateOwnedSubscriptions = (payload) => {
  const subscriptions = requireRecord(payload, "Owned subscriptions");
  requireExactKeys(
    subscriptions,
    ["items", "total", "has_more", "count_mode"],
    "Owned subscriptions",
  );
  if (!Array.isArray(subscriptions.items)) {
    throw new Error("Owned subscriptions.items must be an array.");
  }
  const total = requireNonNegativeSafeInteger(
    subscriptions.total,
    "Owned subscriptions.total",
  );
  requireBoolean(subscriptions.has_more, "Owned subscriptions.has_more");
  if (subscriptions.count_mode !== "exact") {
    throw new Error('Owned subscriptions.count_mode must be "exact".');
  }
  if (
    total < subscriptions.items.length ||
    (!subscriptions.has_more && total !== subscriptions.items.length)
  ) {
    throw new Error(
      "Owned subscriptions pagination metadata does not match its items.",
    );
  }
  for (const [index, rawItem] of subscriptions.items.entries()) {
    const item = requireRecord(rawItem, `Owned subscriptions.items[${index}]`);
    requireExactKeys(
      item,
      ["subscription_id", "subscription", "invoice", "plan"],
      `Owned subscriptions.items[${index}]`,
    );
    requireNonEmptyString(
      item.subscription_id,
      `Owned subscriptions.items[${index}].subscription_id`,
    );
    requireRecord(
      item.subscription,
      `Owned subscriptions.items[${index}].subscription`,
    );
    for (const field of ["invoice", "plan"]) {
      if (item[field] !== null && !isRecord(item[field])) {
        throw new Error(
          `Owned subscriptions.items[${index}].${field} must be an object or null.`,
        );
      }
    }
  }
  return subscriptions;
};

export const validateAccountAssets = (payload, requestedAccountId) => {
  const assets = requireRecord(payload, "Account assets");
  if (!Array.isArray(assets.items)) {
    throw new Error("Account assets.items must be an array.");
  }
  const total = requireNonNegativeSafeInteger(
    assets.total,
    "Account assets.total",
  );
  if (total < assets.items.length) {
    throw new Error("Account assets.total cannot be smaller than items.");
  }
  for (const [index, rawItem] of assets.items.entries()) {
    const item = requireRecord(rawItem, `Account assets.items[${index}]`);
    if (item.account_id !== requestedAccountId) {
      throw new Error(
        `Account assets.items[${index}].account_id does not match the requested account.`,
      );
    }
    validateCanonicalAssetDefinitionId(item.asset);
    requireDecimalAmount(
      item.quantity,
      `Account assets.items[${index}].quantity`,
    );
    requireNonEmptyString(item.scope, `Account assets.items[${index}].scope`);
  }
  return assets;
};

export const assertOfficialV2WriteSurface = (openApi) => {
  const advertised = readOpenApiOperations(openApi);
  const missing = OFFICIAL_V2_WRITE_OPERATIONS.filter(
    (operation) => !advertised.has(normalizeOpenApiOperation(operation)),
  );
  if (missing.length > 0) {
    throw new Error(
      `Official Taira v2 OpenAPI is missing required operations: ${missing.join(", ")}`,
    );
  }
  assertSubscriptionDraftOpenApiContract(openApi);
  assertSoraCloudHfDraftOpenApiContract(openApi);
};

export const assertCurrentReadSurface = ({
  openApi,
  lifecycle,
  validators,
  stake,
  vpnProfile,
  soraCloud,
  subscriptionPlans,
  explorerMetrics,
  offlineReadiness,
  kaigiRelayHealth,
  requestedAssetDefinitionId,
  requiredOfflineAbiVersion,
  requestedLaneId,
  requestedValidator,
}) => {
  const advertised = readOpenApiOperations(openApi);
  const missingReads = CURRENT_READ_OPERATIONS.filter(
    (operation) => !advertised.has(normalizeOpenApiOperation(operation)),
  );
  if (missingReads.length > 0) {
    throw new Error(
      `OpenAPI is missing required first-release reads: ${missingReads.join(", ")}`,
    );
  }
  if (!isRecord(lifecycle) || !Array.isArray(lifecycle.lanes)) {
    throw new Error("Nexus lifecycle lanes are missing.");
  }
  validatePublicLaneValidators(validators, requestedLaneId);
  validatePublicLaneStake(stake, {
    requestedLaneId,
    requestedValidator,
  });
  if (!isRecord(vpnProfile) || typeof vpnProfile.available !== "boolean") {
    throw new Error("VPN profile availability is missing.");
  }
  if (
    !isRecord(soraCloud) ||
    !isRecord(soraCloud.control_plane) ||
    !Array.isArray(soraCloud.control_plane.services) ||
    !Number.isSafeInteger(soraCloud.control_plane.service_count) ||
    soraCloud.control_plane.service_count !==
      soraCloud.control_plane.services.length
  ) {
    throw new Error("SoraCloud control-plane status is missing.");
  }
  if (
    !isRecord(subscriptionPlans) ||
    !Array.isArray(subscriptionPlans.items) ||
    !Number.isSafeInteger(subscriptionPlans.total) ||
    subscriptionPlans.total < subscriptionPlans.items.length
  ) {
    throw new Error("Subscription plan list is missing.");
  }
  validateExplorerMetrics(explorerMetrics);
  validateOfflineReadiness(
    offlineReadiness,
    requestedAssetDefinitionId,
    requiredOfflineAbiVersion,
  );
  validateKaigiRelayHealth(kaigiRelayHealth);
};

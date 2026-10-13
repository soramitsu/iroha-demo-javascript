import { createHash } from "node:crypto";
import { parseJsonWithoutDuplicateObjectKeys } from "../src/utils/json";
import { parseNetworkIdLiteral } from "../src/utils/networkIdentity";
import {
  NATIVE_SBD_ASSET_DEFINITION_ID,
  VALIDATION_FEE_CHARGING_MODE,
  VALIDATION_FEE_PAYOUT_ENTRYPOINT,
  VALIDATION_FEE_REFERENCE_PROVIDER_COUNT,
  VALIDATION_FEE_TREASURY_PAYOUT_EXEMPTION,
  normalizeRetailFeeSchedule,
  normalizeValidationFeePolicy,
  validationFeeActivationError,
  type GovernanceValidationFeePolicyView,
  type RetailFeeSchedulePayload,
} from "../src/governance/model";

export const GOVERNANCE_VALIDATION_FEE_CONFIG_ENV =
  "GOVERNANCE_VALIDATION_FEE_CONFIG_JSON";
export const CBSI_CORE_API_BASE_URL_ENV = "CBSI_CORE_API_BASE_URL";

export const CBSI_SBD_ASSET_DEFINITION_ID = NATIVE_SBD_ASSET_DEFINITION_ID;

/** CBSI Core `ValidationFeeLedgerBindingV2` (camelCase, deny unknown fields). */
const LEDGER_BINDING_SCHEMA = "cbsi.mobile-validation-fee-ledger-binding.v2";
const LEDGER_PROJECTION_SCHEMA = "cbsi.validation-fee-ledger-projection.v1";
const STATUS_SCHEMA = "cbsi.validation-fee-status.v1";
const AUTHORIZATION_MODEL = "SORA_PARLIAMENT_V1";
const REGISTRY_PARAMETER_ID = "iroha:validation_fee_policy_registry_v1";
const U32_MAX = 0xffff_ffff;
/**
 * Native `MAX_FINALITY_CHECKPOINT_BYTES` (two 32 MiB finality frames plus
 * 4 MiB of context) and the standard Base64 length CBSI Core admits for it.
 */
const MAX_FINALITY_CHECKPOINT_BYTES = 68 * 1024 * 1024;
const MAX_FINALITY_CHECKPOINT_BASE64_CHARS =
  Math.ceil(MAX_FINALITY_CHECKPOINT_BYTES / 3) * 4;
const STANDARD_BASE64 = /^[A-Za-z0-9+/]+={0,2}$/u;
/** The generated config embeds the Core binding's Base64 checkpoint. */
export const MAX_VALIDATION_FEE_CONFIG_BYTES =
  MAX_FINALITY_CHECKPOINT_BASE64_CHARS + 1024 * 1024;
const MAX_VALIDATION_FEE_CORE_RESPONSE_BYTES = 4 * 1024 * 1024;
const NONZERO_LOWER_HASH_32 = /^[0-9a-f]{64}$/u;
/** Top-level native `GovernanceCertificateV1` JSON fields (SDK parliamentApiV1). */
const GOVERNANCE_CERTIFICATE_FIELDS = [
  "proposal_content_id",
  "governance_attempt_id",
  "governance_attempt_sequence",
  "risk_tier",
  "body_bindings",
  "policy_version",
  "effect_preimage_hash",
  "expected_head",
  "certified_at_height",
  "enact_at_height",
] as const;

export type GovernanceValidationFeeEnabledConfig = {
  enabled: true;
  /**
   * Exact CBSI Core release binding. `checkpoint.canonicalBase64` carries the
   * Core-verified native finality checkpoint; this wallet exports no native
   * checkpoint verifier, so it checks only canonical Base64 within the native
   * bound and trusts projection checkpoint coordinates by exact equality.
   */
  ledgerBinding: {
    schema: typeof LEDGER_BINDING_SCHEMA;
    networkId: string;
    genesisHash: string;
    policyChainGenesisHash: string;
    checkpoint: {
      height: number;
      contextId: string;
      canonicalBase64: string;
    };
  };
  /**
   * Immutable release coordinates only. Fee amounts, retail schedules,
   * activation times, and Parliament authorities are governed on chain and
   * are verified structurally rather than pinned.
   */
  expected: {
    rewardCustody: {
      contractAddress: string;
      treasuryAccountId: string;
      xorAssetDefinitionId: string;
      rewardPoolAccountId: string;
      validatorLaneId: number;
    };
  };
};

type RewardCustodyProjection = {
  contract_address: string;
  treasury_account_id: string;
  sbd_asset_id: string;
  xor_asset_id: string;
  reward_pool_account_id: string;
  validator_lane_id: number;
};

type ParliamentAuthorityProjection = {
  proposal_operator: string;
  proposal_fingerprint_hex: string;
  governance_certificate_id_hex: string;
  governance_certificate: Record<string, unknown>;
  enacted_at_height: number;
};

type PayoutLifecycleAuthorityProjection = ParliamentAuthorityProjection & {
  lifecycle_seal_hex: string;
};

type ConversionBindingProjection = {
  contract_address: string;
  contract_subject_account_id: string;
  code_hash_hex: string;
  entrypoint: typeof VALIDATION_FEE_PAYOUT_ENTRYPOINT;
  treasury_account_id: string;
  sbd_asset_id: string;
  xor_asset_id: string;
  pool_contract_address: string;
  pool_code_hash_hex: string;
  pool_vault_account_id: string;
  reward_pool_account_id: string;
  reference_feed_id: string;
  reference_feed_config_version: number;
  reference_provider_accounts: string[];
  max_sbd_per_attempt_minor: number;
  max_sbd_per_day_minor: number;
  min_interval_ms: number;
  max_source_age_ms: number;
  max_slippage_bps: number;
  validator_lane_id: number;
  min_reward_claim_xor_minor: number;
};

/** Exact CBSI Core `ValidationFeeLedgerProjectionV1`. */
type ValidationFeeProjection = {
  schema: typeof LEDGER_PROJECTION_SCHEMA;
  authorization_model: typeof AUTHORIZATION_MODEL;
  policy_chain_genesis_hash_hex: string;
  policy: {
    schema_version: 1;
    network_id: string;
    genesis_hash_hex: string;
    policy_version: number;
    previous_policy_hash_hex: string | null;
    policy_hash_hex: string;
    sbd_asset_id: typeof CBSI_SBD_ASSET_DEFINITION_ID;
    sbd_scale: 2;
    fee: string;
    fee_minor_units: number;
    treasury_account_id: string;
    charging_mode: typeof VALIDATION_FEE_CHARGING_MODE;
    effective_from_height: number;
    effective_from_ms: number;
    notice_published_at_ms: number;
    retail_schedule: RetailFeeSchedulePayload;
    exemption_classes: [typeof VALIDATION_FEE_TREASURY_PAYOUT_EXEMPTION];
    reward_custody: RewardCustodyProjection;
  };
  parliament_authorization: ParliamentAuthorityProjection;
  conversion_policy: {
    revision: number;
    binding: ConversionBindingProjection;
    authority: PayoutLifecycleAuthorityProjection;
  };
  ledger_finality: {
    ledger_finalised_height: number;
    block_timestamp_ms: number;
    block_hash_hex: string;
    ordinary_writes_root_hex: string;
    context_id_hex: string;
    registry_parameter_id: typeof REGISTRY_PARAMETER_ID;
    validation_fee_snapshot_commitment_hash_hex: string;
    registry_snapshot_hash_hex: string;
    head_policy_hash_hex: string;
    scheduled_policy_hash_hex: string;
    effective_policy_hash_hex: string;
    checkpoint_height: number;
    checkpoint_context_id_hex: string;
    checkpoint_lineage_verified: true;
    registry_inclusion_verified: true;
  };
};

type CoreReadResponse = {
  ok: boolean;
  status: number;
  arrayBuffer(): Promise<ArrayBuffer>;
};

export type GovernanceValidationFeeCoreFetch = (
  input: string,
  init: {
    method: "GET";
    headers: { accept: "application/json" };
    cache: "no-store";
    signal?: AbortSignal;
  },
) => Promise<CoreReadResponse>;

export type GovernanceValidationFeeFinalityObservation = Readonly<{
  ledgerFinalisedHeight: number;
  contextId: string;
  blockHash: string;
  policyVersion: number;
  policyHash: string;
  projectionHash: string;
}>;

export type GovernanceValidationFeeFinalityPromoter = (
  observation: GovernanceValidationFeeFinalityObservation,
) => Promise<void> | void;

export function readGovernanceValidationFeeConfig(
  serialized = process.env[GOVERNANCE_VALIDATION_FEE_CONFIG_ENV],
): GovernanceValidationFeeEnabledConfig {
  const rawSource = String(serialized ?? "");
  if (Buffer.byteLength(rawSource, "utf8") > MAX_VALIDATION_FEE_CONFIG_BYTES) {
    throw new Error(
      `${GOVERNANCE_VALIDATION_FEE_CONFIG_ENV} exceeds ${MAX_VALIDATION_FEE_CONFIG_BYTES} bytes.`,
    );
  }
  const source = rawSource.trim();
  if (!source) {
    throw new Error(
      `${GOVERNANCE_VALIDATION_FEE_CONFIG_ENV} must contain the generated enabled Taira validation-fee config.`,
    );
  }
  let parsed: unknown;
  try {
    parsed = parseJsonWithoutDuplicateObjectKeys(
      source,
      GOVERNANCE_VALIDATION_FEE_CONFIG_ENV,
    );
  } catch {
    throw new Error(
      `${GOVERNANCE_VALIDATION_FEE_CONFIG_ENV} must be valid JSON.`,
    );
  }
  return parseEnabledConfig(parsed);
}

export function readCbsiCoreApiBaseUrl(
  serialized = process.env[CBSI_CORE_API_BASE_URL_ENV],
): string {
  const source = String(serialized ?? "").trim();
  if (!source) {
    throw new Error(
      `${CBSI_CORE_API_BASE_URL_ENV} is required for validation-fee Core reads.`,
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(source);
  } catch {
    throw new Error(`${CBSI_CORE_API_BASE_URL_ENV} must be an absolute URL.`);
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(
      `${CBSI_CORE_API_BASE_URL_ENV} must be a credential-free HTTPS base URL.`,
    );
  }
  return parsed.toString().replace(/\/+$/u, "");
}

export async function fetchGovernanceValidationFeePolicy(input: {
  config?: GovernanceValidationFeeEnabledConfig;
  coreApiBaseUrl?: string;
  fetcher: GovernanceValidationFeeCoreFetch;
  signal?: AbortSignal;
  promoteFinality: GovernanceValidationFeeFinalityPromoter;
}): Promise<GovernanceValidationFeePolicyView> {
  const config = input.config ?? readGovernanceValidationFeeConfig();
  const coreApiBaseUrl = readCbsiCoreApiBaseUrl(input.coreApiBaseUrl);
  const fetcher = input.fetcher;
  if (typeof fetcher !== "function") {
    throw new Error(
      "Validation-fee Core reads require a fetch implementation.",
    );
  }
  if (typeof input.promoteFinality !== "function") {
    throw new Error(
      "Validation-fee Core reads require the main-process durable finality promoter.",
    );
  }

  const [rawPolicy, rawStatus] = await Promise.all([
    fetchCoreJson(
      fetcher,
      `${coreApiBaseUrl}/v1/validation-fee/policy`,
      input.signal,
    ),
    fetchCoreJson(
      fetcher,
      `${coreApiBaseUrl}/v1/validation-fee/status`,
      input.signal,
    ),
  ]);
  const projection = parseProjection(rawPolicy);
  const status = parseStatus(rawStatus);
  if (canonicalJson(projection) !== canonicalJson(status.active_projection)) {
    throw new Error(
      "CBSI Core validation-fee policy and status returned different active projections.",
    );
  }
  assertProjectionMatchesRuntime(projection, config);
  if (
    status.ledger_finalised_height !==
    projection.ledger_finality.ledger_finalised_height
  ) {
    throw new Error(
      "CBSI Core validation-fee status height differs from its active projection.",
    );
  }
  await input.promoteFinality(
    buildGovernanceValidationFeeFinalityObservation(projection),
  );
  return projectPolicyView(projection);
}

async function fetchCoreJson(
  fetcher: GovernanceValidationFeeCoreFetch,
  url: string,
  signal?: AbortSignal,
): Promise<unknown> {
  const response = await fetcher(url, {
    method: "GET",
    headers: { accept: "application/json" },
    cache: "no-store",
    signal,
  });
  if (!response.ok) {
    throw new Error(
      `CBSI Core validation-fee read failed (${response.status}).`,
    );
  }
  try {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_VALIDATION_FEE_CORE_RESPONSE_BYTES) {
      throw new Error(
        `response exceeds ${MAX_VALIDATION_FEE_CORE_RESPONSE_BYTES} bytes`,
      );
    }
    const serialized = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return parseJsonWithoutDuplicateObjectKeys(
      serialized,
      "CBSI Core validation-fee response",
    );
  } catch {
    throw new Error(
      "CBSI Core validation-fee response was not bounded, strict UTF-8 JSON.",
    );
  }
}

function parseEnabledConfig(
  value: unknown,
): GovernanceValidationFeeEnabledConfig {
  const raw = exactRecord(
    value,
    ["enabled", "expected", "ledgerBinding"],
    "validationFee",
  );
  if (raw.enabled !== true) {
    throw new Error("validationFee.enabled must be true.");
  }
  const bindingRaw = exactRecord(
    raw.ledgerBinding,
    [
      "schema",
      "networkId",
      "genesisHash",
      "policyChainGenesisHash",
      "checkpoint",
    ],
    "validationFee.ledgerBinding",
  );
  if (bindingRaw.schema !== LEDGER_BINDING_SCHEMA) {
    throw new Error(
      `validationFee.ledgerBinding.schema must be ${LEDGER_BINDING_SCHEMA}.`,
    );
  }
  const checkpointRaw = exactRecord(
    bindingRaw.checkpoint,
    ["height", "contextId", "canonicalBase64"],
    "validationFee.ledgerBinding.checkpoint",
  );
  const genesisHash = canonicalIrohaHash(
    bindingRaw.genesisHash,
    "validationFee.ledgerBinding.genesisHash",
  );
  // Core `ValidationFeeLedgerBindingV2::validate`: the canonical checksummed
  // NetworkId literal must be the one derived from the genesis hash.
  const networkId = bindingNetworkId(genesisHash);
  if (bindingRaw.networkId !== networkId) {
    throw new Error(
      "validationFee.ledgerBinding.networkId must be the canonical NetworkId derived from genesisHash.",
    );
  }
  const binding: GovernanceValidationFeeEnabledConfig["ledgerBinding"] = {
    schema: LEDGER_BINDING_SCHEMA,
    networkId,
    genesisHash,
    policyChainGenesisHash: canonicalIrohaHash(
      bindingRaw.policyChainGenesisHash,
      "validationFee.ledgerBinding.policyChainGenesisHash",
    ),
    checkpoint: {
      height: positiveSafeInteger(
        checkpointRaw.height,
        "validationFee.ledgerBinding.checkpoint.height",
      ),
      contextId: canonicalIrohaHash(
        checkpointRaw.contextId,
        "validationFee.ledgerBinding.checkpoint.contextId",
      ),
      canonicalBase64: canonicalCheckpointBase64(
        checkpointRaw.canonicalBase64,
        "validationFee.ledgerBinding.checkpoint.canonicalBase64",
      ),
    },
  };
  const expectedRaw = exactRecord(
    raw.expected,
    ["rewardCustody"],
    "validationFee.expected",
  );
  const custodyLabel = "validationFee.expected.rewardCustody";
  const custodyRaw = exactRecord(
    expectedRaw.rewardCustody,
    [
      "contractAddress",
      "treasuryAccountId",
      "xorAssetDefinitionId",
      "rewardPoolAccountId",
      "validatorLaneId",
    ],
    custodyLabel,
  );
  const rewardCustody = {
    contractAddress: exactText(
      custodyRaw.contractAddress,
      `${custodyLabel}.contractAddress`,
    ),
    treasuryAccountId: exactText(
      custodyRaw.treasuryAccountId,
      `${custodyLabel}.treasuryAccountId`,
    ),
    xorAssetDefinitionId: exactText(
      custodyRaw.xorAssetDefinitionId,
      `${custodyLabel}.xorAssetDefinitionId`,
    ),
    rewardPoolAccountId: exactText(
      custodyRaw.rewardPoolAccountId,
      `${custodyLabel}.rewardPoolAccountId`,
    ),
    validatorLaneId: boundedSafeInteger(
      custodyRaw.validatorLaneId,
      `${custodyLabel}.validatorLaneId`,
      { maximum: U32_MAX },
    ),
  };
  if (
    rewardCustody.treasuryAccountId === rewardCustody.rewardPoolAccountId ||
    rewardCustody.xorAssetDefinitionId === CBSI_SBD_ASSET_DEFINITION_ID
  ) {
    throw new Error(
      `${custodyLabel} requires distinct treasury and reward pool accounts and distinct SBD and XOR assets.`,
    );
  }
  return {
    enabled: true,
    ledgerBinding: binding,
    expected: { rewardCustody },
  };
}

function parseProjection(value: unknown): ValidationFeeProjection {
  const raw = exactRecord(
    value,
    [
      "schema",
      "authorization_model",
      "policy_chain_genesis_hash_hex",
      "policy",
      "parliament_authorization",
      "conversion_policy",
      "ledger_finality",
    ],
    "validation-fee ledger projection",
  );
  if (
    raw.schema !== LEDGER_PROJECTION_SCHEMA ||
    raw.authorization_model !== AUTHORIZATION_MODEL
  ) {
    throw new Error("CBSI Core returned an unsupported projection schema.");
  }
  const result: ValidationFeeProjection = {
    schema: LEDGER_PROJECTION_SCHEMA,
    authorization_model: AUTHORIZATION_MODEL,
    policy_chain_genesis_hash_hex: canonicalIrohaHash(
      raw.policy_chain_genesis_hash_hex,
      "projection policy-chain genesis hash",
    ),
    policy: parseProjectionPolicy(raw.policy),
    parliament_authorization: parseParliamentAuthority(
      raw.parliament_authorization,
      "projection policy Parliament authority",
    ),
    conversion_policy: parseConversionPolicy(raw.conversion_policy),
    ledger_finality: parseProjectionFinality(raw.ledger_finality),
  };
  assertProjectionRelationships(result);
  return result;
}

function parseProjectionPolicy(
  value: unknown,
): ValidationFeeProjection["policy"] {
  const raw = exactRecord(
    value,
    [
      "schema_version",
      "network_id",
      "genesis_hash_hex",
      "policy_version",
      "previous_policy_hash_hex",
      "policy_hash_hex",
      "sbd_asset_id",
      "sbd_scale",
      "fee",
      "fee_minor_units",
      "treasury_account_id",
      "charging_mode",
      "effective_from_height",
      "effective_from_ms",
      "notice_published_at_ms",
      "retail_schedule",
      "exemption_classes",
      "reward_custody",
    ],
    "validation-fee policy",
  );
  const policyVersion = positiveSafeInteger(
    raw.policy_version,
    "projection policy version",
  );
  const feeMinorUnits = positiveSafeInteger(
    raw.fee_minor_units,
    "projection fee minor units",
  );
  const previousPolicyHash =
    raw.previous_policy_hash_hex === null
      ? null
      : canonicalIrohaHash(
          raw.previous_policy_hash_hex,
          "projection previous policy hash",
        );
  if (
    raw.schema_version !== 1 ||
    raw.sbd_scale !== 2 ||
    raw.sbd_asset_id !== CBSI_SBD_ASSET_DEFINITION_ID ||
    raw.fee !== formatMinorUnits(feeMinorUnits) ||
    raw.charging_mode !== VALIDATION_FEE_CHARGING_MODE ||
    (policyVersion === 1) !== (previousPolicyHash === null) ||
    !Array.isArray(raw.exemption_classes) ||
    raw.exemption_classes.length !== 1 ||
    raw.exemption_classes[0] !== VALIDATION_FEE_TREASURY_PAYOUT_EXEMPTION
  ) {
    throw new Error(
      "CBSI Core projection is not a governed monthly-allowance SBD fee policy.",
    );
  }
  let retailSchedule: RetailFeeSchedulePayload;
  try {
    retailSchedule = normalizeRetailFeeSchedule(
      raw.retail_schedule,
      "projection retail schedule",
    );
  } catch (error) {
    throw new Error(
      `CBSI Core projection has an invalid governed retail schedule: ${errorMessage(error)}`,
    );
  }
  const effectiveFromMs = positiveSafeInteger(
    raw.effective_from_ms,
    "projection effective time",
  );
  const noticePublishedAtMs = positiveSafeInteger(
    raw.notice_published_at_ms,
    "projection notice time",
  );
  if (validationFeeActivationError(noticePublishedAtMs, effectiveFromMs)) {
    throw new Error(
      "CBSI Core fee activation requires a Honiara month boundary and 30 calendar days notice.",
    );
  }
  const genesisHash = canonicalIrohaHash(
    raw.genesis_hash_hex,
    "projection genesis hash",
  );
  const networkId = exactText(raw.network_id, "projection network id");
  if (networkId !== bindingNetworkId(genesisHash)) {
    throw new Error("CBSI Core fee network identity differs from genesis.");
  }
  const treasuryAccountId = exactText(
    raw.treasury_account_id,
    "projection treasury account",
  );
  const rewardCustody = parseRewardCustody(raw.reward_custody);
  if (
    rewardCustody.sbd_asset_id !== CBSI_SBD_ASSET_DEFINITION_ID ||
    rewardCustody.treasury_account_id !== treasuryAccountId ||
    rewardCustody.reward_pool_account_id === treasuryAccountId ||
    rewardCustody.xor_asset_id === CBSI_SBD_ASSET_DEFINITION_ID
  ) {
    throw new Error(
      "CBSI Core projection has invalid immutable reward custody.",
    );
  }
  return {
    schema_version: 1,
    network_id: networkId,
    genesis_hash_hex: genesisHash,
    policy_version: policyVersion,
    previous_policy_hash_hex: previousPolicyHash,
    policy_hash_hex: canonicalIrohaHash(
      raw.policy_hash_hex,
      "projection policy hash",
    ),
    sbd_asset_id: CBSI_SBD_ASSET_DEFINITION_ID,
    sbd_scale: 2,
    fee: formatMinorUnits(feeMinorUnits),
    fee_minor_units: feeMinorUnits,
    treasury_account_id: treasuryAccountId,
    charging_mode: VALIDATION_FEE_CHARGING_MODE,
    effective_from_height: positiveSafeInteger(
      raw.effective_from_height,
      "projection effective height",
    ),
    effective_from_ms: effectiveFromMs,
    notice_published_at_ms: noticePublishedAtMs,
    retail_schedule: retailSchedule,
    exemption_classes: [VALIDATION_FEE_TREASURY_PAYOUT_EXEMPTION],
    reward_custody: rewardCustody,
  };
}

function parseRewardCustody(value: unknown): RewardCustodyProjection {
  const raw = exactRecord(
    value,
    [
      "contract_address",
      "treasury_account_id",
      "sbd_asset_id",
      "xor_asset_id",
      "reward_pool_account_id",
      "validator_lane_id",
    ],
    "projection reward custody",
  );
  return {
    contract_address: exactText(
      raw.contract_address,
      "projection reward custody contract",
    ),
    treasury_account_id: exactText(
      raw.treasury_account_id,
      "projection reward treasury",
    ),
    sbd_asset_id: exactText(raw.sbd_asset_id, "projection reward SBD asset"),
    xor_asset_id: exactText(raw.xor_asset_id, "projection reward asset"),
    reward_pool_account_id: exactText(
      raw.reward_pool_account_id,
      "projection reward pool",
    ),
    validator_lane_id: boundedSafeInteger(
      raw.validator_lane_id,
      "projection reward validator lane",
      { maximum: U32_MAX },
    ),
  };
}

function parseParliamentAuthority(
  value: unknown,
  label: string,
  lifecycle = false,
): ParliamentAuthorityProjection {
  const raw = exactRecord(
    value,
    [
      "proposal_operator",
      "proposal_fingerprint_hex",
      "governance_certificate_id_hex",
      "governance_certificate",
      "enacted_at_height",
      ...(lifecycle ? ["lifecycle_seal_hex"] : []),
    ],
    label,
  );
  const fingerprint = lowerHash(
    raw.proposal_fingerprint_hex,
    `${label} proposal fingerprint`,
  );
  const enactedAtHeight = positiveSafeInteger(
    raw.enacted_at_height,
    `${label} enacted height`,
  );
  // The public SDK does not export the complete native certificate
  // validator, so the wallet binds only the certificate fields that tie it
  // to this proposal and enactment; Core verifies the certificate natively.
  const certificate = exactRecord(
    raw.governance_certificate,
    GOVERNANCE_CERTIFICATE_FIELDS,
    `${label} certificate`,
  );
  const certifiedAtHeight = positiveSafeInteger(
    certificate.certified_at_height,
    `${label} certificate certified height`,
  );
  if (
    certificate.proposal_content_id !== fingerprint ||
    certificate.enact_at_height !== enactedAtHeight ||
    certifiedAtHeight >= enactedAtHeight
  ) {
    throw new Error(
      `${label} certificate does not bind this proposal and enactment.`,
    );
  }
  return {
    proposal_operator: exactText(
      raw.proposal_operator,
      `${label} proposal operator`,
    ),
    proposal_fingerprint_hex: fingerprint,
    governance_certificate_id_hex: lowerHash(
      raw.governance_certificate_id_hex,
      `${label} certificate identifier`,
    ),
    governance_certificate: certificate,
    enacted_at_height: enactedAtHeight,
  };
}

function parseConversionPolicy(
  value: unknown,
): ValidationFeeProjection["conversion_policy"] {
  const raw = exactRecord(
    value,
    ["revision", "binding", "authority"],
    "projection conversion policy",
  );
  const authorityRaw = exactRecord(
    raw.authority,
    [
      "proposal_operator",
      "proposal_fingerprint_hex",
      "governance_certificate_id_hex",
      "governance_certificate",
      "enacted_at_height",
      "lifecycle_seal_hex",
    ],
    "projection conversion authority",
  );
  return {
    revision: positiveSafeInteger(
      raw.revision,
      "projection conversion revision",
    ),
    binding: parseConversionBinding(raw.binding),
    authority: {
      ...parseParliamentAuthority(
        authorityRaw,
        "projection conversion authority",
        true,
      ),
      lifecycle_seal_hex: canonicalIrohaHash(
        authorityRaw.lifecycle_seal_hex,
        "projection payout lifecycle seal",
      ),
    },
  };
}

function parseConversionBinding(value: unknown): ConversionBindingProjection {
  const label = "projection conversion binding";
  const raw = exactRecord(
    value,
    [
      "contract_address",
      "contract_subject_account_id",
      "code_hash_hex",
      "entrypoint",
      "treasury_account_id",
      "sbd_asset_id",
      "xor_asset_id",
      "pool_contract_address",
      "pool_code_hash_hex",
      "pool_vault_account_id",
      "reward_pool_account_id",
      "reference_feed_id",
      "reference_feed_config_version",
      "reference_provider_accounts",
      "max_sbd_per_attempt_minor",
      "max_sbd_per_day_minor",
      "min_interval_ms",
      "max_source_age_ms",
      "max_slippage_bps",
      "validator_lane_id",
      "min_reward_claim_xor_minor",
    ],
    label,
  );
  if (
    !Array.isArray(raw.reference_provider_accounts) ||
    raw.reference_provider_accounts.length !==
      VALIDATION_FEE_REFERENCE_PROVIDER_COUNT
  ) {
    throw new Error(`${label} requires exactly five reference providers.`);
  }
  const providers = raw.reference_provider_accounts.map((entry, index) =>
    exactText(entry, `${label} reference provider ${index}`),
  );
  const binding: ConversionBindingProjection = {
    contract_address: exactText(raw.contract_address, `${label} contract`),
    contract_subject_account_id: exactText(
      raw.contract_subject_account_id,
      `${label} contract subject`,
    ),
    code_hash_hex: lowerHash(raw.code_hash_hex, `${label} code hash`),
    entrypoint: VALIDATION_FEE_PAYOUT_ENTRYPOINT,
    treasury_account_id: exactText(
      raw.treasury_account_id,
      `${label} treasury`,
    ),
    sbd_asset_id: exactText(raw.sbd_asset_id, `${label} SBD asset`),
    xor_asset_id: exactText(raw.xor_asset_id, `${label} XOR asset`),
    pool_contract_address: exactText(
      raw.pool_contract_address,
      `${label} pool contract`,
    ),
    pool_code_hash_hex: lowerHash(
      raw.pool_code_hash_hex,
      `${label} pool code hash`,
    ),
    pool_vault_account_id: exactText(
      raw.pool_vault_account_id,
      `${label} pool vault`,
    ),
    reward_pool_account_id: exactText(
      raw.reward_pool_account_id,
      `${label} reward pool`,
    ),
    reference_feed_id: exactText(
      raw.reference_feed_id,
      `${label} reference feed`,
    ),
    reference_feed_config_version: positiveSafeInteger(
      raw.reference_feed_config_version,
      `${label} reference feed config version`,
    ),
    reference_provider_accounts: providers,
    max_sbd_per_attempt_minor: positiveSafeInteger(
      raw.max_sbd_per_attempt_minor,
      `${label} per-attempt limit`,
    ),
    max_sbd_per_day_minor: positiveSafeInteger(
      raw.max_sbd_per_day_minor,
      `${label} daily limit`,
    ),
    min_interval_ms: positiveSafeInteger(
      raw.min_interval_ms,
      `${label} minimum interval`,
    ),
    max_source_age_ms: positiveSafeInteger(
      raw.max_source_age_ms,
      `${label} maximum source age`,
    ),
    max_slippage_bps: boundedSafeInteger(
      raw.max_slippage_bps,
      `${label} maximum slippage`,
      { maximum: 9_999 },
    ),
    validator_lane_id: boundedSafeInteger(
      raw.validator_lane_id,
      `${label} validator lane`,
      { maximum: U32_MAX },
    ),
    min_reward_claim_xor_minor: positiveSafeInteger(
      raw.min_reward_claim_xor_minor,
      `${label} minimum reward claim`,
    ),
  };
  if (
    raw.entrypoint !== VALIDATION_FEE_PAYOUT_ENTRYPOINT ||
    binding.reference_feed_config_version > U32_MAX ||
    new Set(providers).size !== providers.length ||
    binding.max_sbd_per_day_minor < binding.max_sbd_per_attempt_minor ||
    binding.sbd_asset_id === binding.xor_asset_id ||
    new Set([
      binding.treasury_account_id,
      binding.pool_vault_account_id,
      binding.reward_pool_account_id,
    ]).size !== 3
  ) {
    throw new Error(`${label} is not a valid governed conversion binding.`);
  }
  return binding;
}

function parseProjectionFinality(
  value: unknown,
): ValidationFeeProjection["ledger_finality"] {
  const raw = exactRecord(
    value,
    [
      "ledger_finalised_height",
      "block_timestamp_ms",
      "block_hash_hex",
      "ordinary_writes_root_hex",
      "context_id_hex",
      "registry_parameter_id",
      "validation_fee_snapshot_commitment_hash_hex",
      "registry_snapshot_hash_hex",
      "head_policy_hash_hex",
      "scheduled_policy_hash_hex",
      "effective_policy_hash_hex",
      "checkpoint_height",
      "checkpoint_context_id_hex",
      "checkpoint_lineage_verified",
      "registry_inclusion_verified",
    ],
    "projection ledger finality",
  );
  if (
    raw.registry_parameter_id !== REGISTRY_PARAMETER_ID ||
    raw.checkpoint_lineage_verified !== true ||
    raw.registry_inclusion_verified !== true
  ) {
    throw new Error(
      "CBSI Core projection lacks verified checkpoint lineage or registry inclusion.",
    );
  }
  const finality: ValidationFeeProjection["ledger_finality"] = {
    ledger_finalised_height: positiveSafeInteger(
      raw.ledger_finalised_height,
      "projection finalized height",
    ),
    block_timestamp_ms: positiveSafeInteger(
      raw.block_timestamp_ms,
      "projection finalized block timestamp",
    ),
    block_hash_hex: canonicalIrohaHash(
      raw.block_hash_hex,
      "projection finalized block hash",
    ),
    ordinary_writes_root_hex: canonicalIrohaHash(
      raw.ordinary_writes_root_hex,
      "projection ordinary writes root",
    ),
    context_id_hex: canonicalIrohaHash(
      raw.context_id_hex,
      "projection finalized context",
    ),
    registry_parameter_id: REGISTRY_PARAMETER_ID,
    validation_fee_snapshot_commitment_hash_hex: canonicalIrohaHash(
      raw.validation_fee_snapshot_commitment_hash_hex,
      "projection snapshot commitment",
    ),
    registry_snapshot_hash_hex: canonicalIrohaHash(
      raw.registry_snapshot_hash_hex,
      "projection registry snapshot hash",
    ),
    head_policy_hash_hex: canonicalIrohaHash(
      raw.head_policy_hash_hex,
      "projection head policy hash",
    ),
    scheduled_policy_hash_hex: canonicalIrohaHash(
      raw.scheduled_policy_hash_hex,
      "projection scheduled policy hash",
    ),
    effective_policy_hash_hex: canonicalIrohaHash(
      raw.effective_policy_hash_hex,
      "projection effective policy hash",
    ),
    checkpoint_height: positiveSafeInteger(
      raw.checkpoint_height,
      "projection checkpoint height",
    ),
    checkpoint_context_id_hex: canonicalIrohaHash(
      raw.checkpoint_context_id_hex,
      "projection checkpoint context",
    ),
    checkpoint_lineage_verified: true,
    registry_inclusion_verified: true,
  };
  if (finality.ledger_finalised_height < finality.checkpoint_height) {
    throw new Error(
      "CBSI Core validation-fee finality rolls back before its trusted checkpoint.",
    );
  }
  return finality;
}

function parseStatus(value: unknown): {
  schema: typeof STATUS_SCHEMA;
  authorization_model: typeof AUTHORIZATION_MODEL;
  status: "ACTIVE";
  ledger_finalised_height: number;
  active_projection: ValidationFeeProjection;
} {
  const raw = exactRecord(
    value,
    [
      "schema",
      "authorization_model",
      "status",
      "ledger_finalised_height",
      "active_projection",
    ],
    "validation-fee status",
  );
  if (
    raw.schema !== STATUS_SCHEMA ||
    raw.authorization_model !== AUTHORIZATION_MODEL ||
    raw.status !== "ACTIVE"
  ) {
    throw new Error("CBSI Core validation-fee status is not ACTIVE.");
  }
  return {
    schema: STATUS_SCHEMA,
    authorization_model: AUTHORIZATION_MODEL,
    status: "ACTIVE",
    ledger_finalised_height: positiveSafeInteger(
      raw.ledger_finalised_height,
      "validation-fee status finalized height",
    ),
    active_projection: parseProjection(raw.active_projection),
  };
}

/** Mirror of Core `ValidationFeeLedgerProjectionV1::validate` relationships. */
function assertProjectionRelationships(projection: ValidationFeeProjection) {
  const policy = projection.policy;
  const finality = projection.ledger_finality;
  const pricingAuthority = projection.parliament_authorization;
  const conversion = projection.conversion_policy;
  const binding = conversion.binding;
  const custody = policy.reward_custody;
  if (pricingAuthority.enacted_at_height + 1 !== policy.effective_from_height) {
    throw new Error(
      "CBSI Core fee policy differs from its enacted Parliament authority.",
    );
  }
  if (
    conversion.authority.enacted_at_height >=
      finality.ledger_finalised_height ||
    conversion.authority.proposal_fingerprint_hex ===
      pricingAuthority.proposal_fingerprint_hex ||
    binding.contract_address !== custody.contract_address ||
    binding.contract_subject_account_id !== custody.treasury_account_id ||
    binding.treasury_account_id !== custody.treasury_account_id ||
    binding.sbd_asset_id !== custody.sbd_asset_id ||
    binding.xor_asset_id !== custody.xor_asset_id ||
    binding.reward_pool_account_id !== custody.reward_pool_account_id ||
    binding.validator_lane_id !== custody.validator_lane_id
  ) {
    throw new Error(
      "CBSI Core conversion policy differs from its finalized authority or immutable reward custody.",
    );
  }
  if (
    finality.ledger_finalised_height < policy.effective_from_height ||
    finality.block_timestamp_ms < policy.effective_from_ms
  ) {
    throw new Error(
      "CBSI Core validation-fee policy is not active at the proved finalized block.",
    );
  }
  if (
    policy.policy_version === 1 &&
    policy.policy_hash_hex !== projection.policy_chain_genesis_hash_hex
  ) {
    throw new Error(
      "CBSI Core first validation-fee policy differs from the policy-chain genesis.",
    );
  }
  if (finality.effective_policy_hash_hex !== policy.policy_hash_hex) {
    throw new Error(
      "CBSI Core effective registry entry differs from the projected policy.",
    );
  }
}

/** Mirror of Core `verify_active_projection` plus immutable custody pins. */
function assertProjectionMatchesRuntime(
  projection: ValidationFeeProjection,
  config: GovernanceValidationFeeEnabledConfig,
) {
  const binding = config.ledgerBinding;
  if (
    projection.policy.network_id !== binding.networkId ||
    projection.policy.network_id !== bindingNetworkId(binding.genesisHash) ||
    projection.policy.genesis_hash_hex !== binding.genesisHash ||
    projection.policy_chain_genesis_hash_hex !==
      binding.policyChainGenesisHash ||
    projection.ledger_finality.checkpoint_height !==
      binding.checkpoint.height ||
    projection.ledger_finality.checkpoint_context_id_hex !==
      binding.checkpoint.contextId
  ) {
    throw new Error(
      "CBSI Core validation-fee projection differs from the immutable runtime ledger binding.",
    );
  }
  const expected = config.expected.rewardCustody;
  const custody = projection.policy.reward_custody;
  if (
    custody.contract_address !== expected.contractAddress ||
    custody.treasury_account_id !== expected.treasuryAccountId ||
    custody.sbd_asset_id !== CBSI_SBD_ASSET_DEFINITION_ID ||
    custody.xor_asset_id !== expected.xorAssetDefinitionId ||
    custody.reward_pool_account_id !== expected.rewardPoolAccountId ||
    custody.validator_lane_id !== expected.validatorLaneId
  ) {
    throw new Error(
      "CBSI Core validation-fee reward custody does not exactly match the runtime release coordinates.",
    );
  }
}

function buildGovernanceValidationFeeFinalityObservation(
  projection: ValidationFeeProjection,
): GovernanceValidationFeeFinalityObservation {
  return Object.freeze({
    ledgerFinalisedHeight: projection.ledger_finality.ledger_finalised_height,
    contextId: projection.ledger_finality.context_id_hex,
    blockHash: projection.ledger_finality.block_hash_hex,
    policyVersion: projection.policy.policy_version,
    policyHash: projection.policy.policy_hash_hex,
    projectionHash: createHash("sha256")
      .update(canonicalJson(projection), "utf8")
      .digest("hex"),
  });
}

/**
 * Map Core's public names (`sbd_*`, lowercase hashes, two-decimal fee text)
 * onto the exact native `ValidationFeePolicyV1` JSON that the composer
 * extends and the native fingerprint consumes.
 */
function projectPolicyView(
  projection: ValidationFeeProjection,
): GovernanceValidationFeePolicyView {
  const policy = projection.policy;
  const finality = projection.ledger_finality;
  const effective = normalizeValidationFeePolicy({
    schema_version: 1,
    network_id: policy.network_id,
    policy_version: String(policy.policy_version),
    previous_policy_hash:
      policy.previous_policy_hash_hex === null
        ? null
        : policy.previous_policy_hash_hex.toUpperCase(),
    ds_asset_id: policy.sbd_asset_id,
    ds_scale: 2,
    retail_schedule: policy.retail_schedule,
    effective_from_ms: policy.effective_from_ms,
    notice_published_at_ms: policy.notice_published_at_ms,
    fee: canonicalQuantityFromMinorUnits(policy.fee_minor_units),
    treasury_account_id: policy.treasury_account_id,
    charging_mode: {
      charging_mode: VALIDATION_FEE_CHARGING_MODE,
      value: null,
    },
    exemption_classes: [VALIDATION_FEE_TREASURY_PAYOUT_EXEMPTION],
    reward_custody: {
      contract_address: policy.reward_custody.contract_address,
      treasury_account_id: policy.reward_custody.treasury_account_id,
      ds_asset_id: policy.reward_custody.sbd_asset_id,
      xor_asset_id: policy.reward_custody.xor_asset_id,
      reward_pool_account_id: policy.reward_custody.reward_pool_account_id,
      validator_lane_id: policy.reward_custody.validator_lane_id,
    },
  });
  const headIsEffective =
    finality.head_policy_hash_hex === policy.policy_hash_hex;
  return deepFreeze({
    observedHeight: String(finality.ledger_finalised_height),
    observedAtMs: finality.block_timestamp_ms,
    effective,
    effectivePolicyHash: policy.policy_hash_hex,
    registryHead: {
      policyHash: finality.head_policy_hash_hex,
      policyVersion: headIsEffective ? String(policy.policy_version) : null,
    },
    verifiedProof: {
      schema: LEDGER_PROJECTION_SCHEMA,
      authorizationModel: AUTHORIZATION_MODEL,
      registrySnapshotHash: finality.registry_snapshot_hash_hex,
      finalizedBlockHash: finality.block_hash_hex,
      finalizedContextId: finality.context_id_hex,
      trustedCheckpointHeight: String(finality.checkpoint_height),
      trustedCheckpointContextId: finality.checkpoint_context_id_hex,
    },
  });
}

/** Core `format_minor_units` for the fixed SBD scale 2. */
function formatMinorUnits(minorUnits: number): string {
  const units = BigInt(minorUnits);
  return `${units / 100n}.${(units % 100n).toString().padStart(2, "0")}`;
}

/** Native canonical `Quantity` text for SBD minor units (no trailing zeros). */
function canonicalQuantityFromMinorUnits(minorUnits: number): string {
  const [whole, fraction] = formatMinorUnits(minorUnits).split(".");
  const trimmed = fraction.replace(/0+$/u, "");
  return trimmed ? `${whole}.${trimmed}` : whole;
}

function bindingNetworkId(genesisHash: string): string {
  try {
    return parseNetworkIdLiteral(genesisHash, "validation-fee genesis hash");
  } catch {
    throw new Error(
      "validation-fee genesis hash does not derive a canonical NetworkId.",
    );
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  const record = value as Record<string, unknown>;
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw new Error(`${label} fields must be exactly ${expected.join(", ")}.`);
  }
  return record;
}

function exactText(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value ||
    Array.from(value).some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 0x1f || codePoint === 0x7f || /\s/u.test(character);
    })
  ) {
    throw new Error(`${label} must be canonical non-empty text.`);
  }
  return value;
}

function lowerHash(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    !NONZERO_LOWER_HASH_32.test(value) ||
    /^0+$/u.test(value)
  ) {
    throw new Error(`${label} must be a non-zero lowercase 64-hex hash.`);
  }
  return value;
}

function canonicalIrohaHash(value: unknown, label: string): string {
  const hash = lowerHash(value, label);
  if ((Number.parseInt(hash.slice(-2), 16) & 1) !== 1) {
    throw new Error(`${label} must carry the canonical Iroha hash marker.`);
  }
  return hash;
}

/**
 * Core `decode_finality_checkpoint` wire checks: non-empty canonical standard
 * Base64 whose decoded bytes fit the native checkpoint bound.
 */
function canonicalCheckpointBase64(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_FINALITY_CHECKPOINT_BASE64_CHARS ||
    value.length % 4 !== 0 ||
    !STANDARD_BASE64.test(value)
  ) {
    throw new Error(`${label} must be canonical standard Base64.`);
  }
  const bytes = Buffer.from(value, "base64");
  if (
    bytes.byteLength === 0 ||
    bytes.byteLength > MAX_FINALITY_CHECKPOINT_BYTES ||
    bytes.toString("base64") !== value
  ) {
    throw new Error(
      `${label} must be canonical standard Base64 within the native checkpoint bound.`,
    );
  }
  return value;
}

function positiveSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new Error(`${label} must be a positive safe integer.`);
  }
  return Number(value);
}

function boundedSafeInteger(
  value: unknown,
  label: string,
  options: Readonly<{ maximum: number }>,
): number {
  if (
    !Number.isSafeInteger(value) ||
    Number(value) < 0 ||
    Number(value) > options.maximum
  ) {
    throw new Error(
      `${label} must be a safe integer between 0 and ${options.maximum}.`,
    );
  }
  return Number(value);
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}

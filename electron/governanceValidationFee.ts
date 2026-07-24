export const GOVERNANCE_VALIDATION_FEE_CONFIG_ENV =
  "GOVERNANCE_VALIDATION_FEE_CONFIG_JSON";
export const CBSI_CORE_API_BASE_URL_ENV = "CBSI_CORE_API_BASE_URL";

export const TAIRA_CHAIN_ID = "fc56984b-2be7-431d-840e-21514d1883f0";
export const CBSI_SBD_ASSET_DEFINITION_ID = "7ZepsJTHCVLKsrFFNZGSRGZgvBhv";
export const VALIDATION_FEE_ACTIVATION_DELAY_BLOCKS = 120_960;

const LEDGER_BINDING_SCHEMA = "cbsi.mobile-validation-fee-ledger-binding.v1";
const LEDGER_PROJECTION_SCHEMA = "cbsi.validation-fee-ledger-projection.v1";
const STATUS_SCHEMA = "cbsi.validation-fee-status.v1";
const AUTHORIZATION_MODEL = "SORA_PARLIAMENT_V1";
const REGISTRY_PARAMETER_ID = "iroha:validation_fee_policy_registry_v1";
const CHARGING_MODE = "PER_QUALIFYING_TRANSFER_INSTRUCTION";
const PAYOUT_ENTRYPOINT = "autonomous_validation_fee_tick";
const U128_MAX = (1n << 128n) - 1n;
const U64_MAX = (1n << 64n) - 1n;
const NONZERO_LOWER_HASH_32 = /^[0-9a-f]{64}$/u;
const CONTRACT_ADDRESS =
  /^(?:sorac|tairac|c[0-9a-f]+)1[023456789acdefghjklmnpqrstuvwxyz]{20,128}$/u;

type ValidationFeeProposalKind =
  | "ValidationFeePolicyV1"
  | "ValidationFeePayoutLifecycleV1";

type ValidationFeeFinalizationConfig = {
  proposal_id: string;
  referendum_id: string;
  finalized_at_height: string;
  mode: "PLAIN";
  approve: string;
  reject: string;
  abstain: string;
  min_turnout: string;
  approval_threshold_numerator: string;
  approval_threshold_denominator: string;
  approved: true;
};

type ValidationFeeProposalConfig = {
  proposal_kind: ValidationFeeProposalKind;
  proposal_id: string;
  payload_hash: string;
  parliament_roster_root: string;
  enactment_window: {
    opens_at_height: string;
    closes_at_height: string;
    enacted_at_height: string;
  };
  finalization: ValidationFeeFinalizationConfig;
};

export type GovernanceValidationFeeEnabledConfig = {
  enabled: true;
  ledgerBinding: {
    schema: typeof LEDGER_BINDING_SCHEMA;
    chainId: typeof TAIRA_CHAIN_ID;
    genesisHash: string;
    policyChainGenesisHash: string;
    checkpoint: {
      height: number;
      contextId: string;
    };
  };
  expected: {
    activePolicyVersion: "1";
    activePolicyHash: string;
    feeAssetDefinitionId: typeof CBSI_SBD_ASSET_DEFINITION_ID;
    feeScale: 2;
    feeMinorUnits: "10";
    chargingMode: typeof CHARGING_MODE;
    effectiveFromHeight: string;
    expiresAfterHeight: null;
    parliament: {
      validationFeePolicy: ValidationFeeProposalConfig & {
        proposal_kind: "ValidationFeePolicyV1";
      };
      payoutLifecycle: ValidationFeeProposalConfig & {
        proposal_kind: "ValidationFeePayoutLifecycleV1";
      };
      payoutLifecycleSealHash: string;
    };
    payout: {
      contractAddress: string;
      codeHash: string;
      entrypoint: typeof PAYOUT_ENTRYPOINT;
      sbdAssetDefinitionId: typeof CBSI_SBD_ASSET_DEFINITION_ID;
      xorAssetDefinitionId: string;
      treasuryAccountId: string;
      vaultAccountId: string;
      batchSbdMinorUnits: "1000";
      sbdScale: 2;
      xorOutputMin: "4";
      xorOutputMax: "100";
      recipients: Array<{
        account_id: string;
        share_basis_points: 2500;
      }>;
    };
  };
};

type ValidationFeeFinalization = {
  proposal_id_hex: string;
  referendum_id_hex: string;
  finalized_at_height: number;
  mode: "PLAIN";
  approve: string;
  reject: string;
  abstain: string;
  min_turnout: string;
  approval_threshold_numerator: string;
  approval_threshold_denominator: string;
  approved: true;
};

type ValidationFeeProposal = {
  proposal_id_hex: string;
  proposal_fingerprint_hex: string;
  parliament_roster_root_hex: string;
  enactment_window: {
    opens_at_height: number;
    closes_at_height: number;
    enacted_at_height: number;
  };
  finalization: ValidationFeeFinalization;
};

type ValidationFeeProjection = {
  schema: typeof LEDGER_PROJECTION_SCHEMA;
  authorization_model: typeof AUTHORIZATION_MODEL;
  policy_chain_genesis_hash_hex: string;
  policy: {
    schema_version: 1;
    network_id: string;
    genesis_hash_hex: string;
    policy_version: number;
    previous_policy_hash_hex: null;
    policy_hash_hex: string;
    sbd_asset_id: string;
    sbd_scale: 2;
    fee: "0.10";
    fee_minor_units: 10;
    treasury_account_id: string;
    charging_mode: typeof CHARGING_MODE;
    effective_from_height: number;
    expires_after_height: null;
    exemption_classes: ["TREASURY_PAYOUT"];
    treasury_payout_binding: {
      contract_address: string;
      contract_subject_account_id: string;
      code_hash_hex: string;
      entrypoint: typeof PAYOUT_ENTRYPOINT;
      treasury_account_id: string;
      sbd_asset_id: string;
      xor_asset_id: string;
      pool_vault_account_id: string;
      batch_sbd: "10";
      min_xor_out: "4";
      max_xor_out: "100";
      recipients: Array<{ account_id: string; share: "0.25" }>;
      lifecycle_seal_hex: string;
    };
  };
  parliament_authorization: {
    policy_proposal: ValidationFeeProposal;
    payout_lifecycle_proposal: ValidationFeeProposal & {
      lifecycle_seal_hex: string;
    };
  };
  ledger_finality: {
    ledger_finalised_height: number;
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

export type GovernanceValidationFeePolicyView = {
  observedHeight: string;
  effective: Record<string, unknown>;
  latestEnacted: Record<string, unknown>;
  scheduled: [];
  registryHead: {
    policyVersion: string;
    policyHash: string;
  };
  verifiedProof: {
    schema: typeof LEDGER_PROJECTION_SCHEMA;
    authorizationModel: typeof AUTHORIZATION_MODEL;
    registrySnapshotHash: string;
    finalizedBlockHash: string;
    finalizedContextId: string;
    trustedCheckpointHeight: string;
    trustedCheckpointContextId: string;
  };
};

type CoreReadResponse = {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
};

type CoreFetch = (
  input: string,
  init: {
    method: "GET";
    headers: { accept: "application/json" };
    cache: "no-store";
    signal?: AbortSignal;
  },
) => Promise<CoreReadResponse>;

type FinalityObservation = {
  height: number;
  contextId: string;
  blockHash: string;
  policyVersion: number;
  policyHash: string;
  projectionFingerprint: string;
};

const lastObservationByTrustScope = new Map<string, FinalityObservation>();

export function clearGovernanceValidationFeeFinalityObservations(): void {
  lastObservationByTrustScope.clear();
}

export function readGovernanceValidationFeeConfig(
  serialized = process.env[GOVERNANCE_VALIDATION_FEE_CONFIG_ENV],
): GovernanceValidationFeeEnabledConfig {
  const source = String(serialized ?? "").trim();
  if (!source) {
    throw new Error(
      `${GOVERNANCE_VALIDATION_FEE_CONFIG_ENV} must contain the generated enabled Taira validation-fee config.`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
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

export async function fetchGovernanceValidationFeePolicy(
  input: {
    config?: GovernanceValidationFeeEnabledConfig;
    coreApiBaseUrl?: string;
    fetcher?: CoreFetch;
    signal?: AbortSignal;
  } = {},
): Promise<GovernanceValidationFeePolicyView> {
  const config = input.config ?? readGovernanceValidationFeeConfig();
  const coreApiBaseUrl = readCbsiCoreApiBaseUrl(input.coreApiBaseUrl);
  const fetcher = input.fetcher ?? (globalThis.fetch as unknown as CoreFetch);
  if (typeof fetcher !== "function") {
    throw new Error(
      "Validation-fee Core reads require a fetch implementation.",
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
  rejectRollbackOrEquivocation(projection, config, coreApiBaseUrl);
  return projectPolicyView(projection);
}

async function fetchCoreJson(
  fetcher: CoreFetch,
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
    return await response.json();
  } catch {
    throw new Error("CBSI Core validation-fee response was not valid JSON.");
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
      "chainId",
      "genesisHash",
      "policyChainGenesisHash",
      "checkpoint",
    ],
    "validationFee.ledgerBinding",
  );
  if (
    bindingRaw.schema !== LEDGER_BINDING_SCHEMA ||
    bindingRaw.chainId !== TAIRA_CHAIN_ID
  ) {
    throw new Error(
      "validationFee.ledgerBinding must identify the exact Taira ledger.",
    );
  }
  const checkpointRaw = exactRecord(
    bindingRaw.checkpoint,
    ["height", "contextId"],
    "validationFee.ledgerBinding.checkpoint",
  );
  const binding: GovernanceValidationFeeEnabledConfig["ledgerBinding"] = {
    schema: LEDGER_BINDING_SCHEMA,
    chainId: TAIRA_CHAIN_ID,
    genesisHash: canonicalIrohaHash(
      bindingRaw.genesisHash,
      "validationFee.ledgerBinding.genesisHash",
    ),
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
    },
  };
  const expectedRaw = exactRecord(
    raw.expected,
    [
      "activePolicyVersion",
      "activePolicyHash",
      "feeAssetDefinitionId",
      "feeScale",
      "feeMinorUnits",
      "chargingMode",
      "effectiveFromHeight",
      "expiresAfterHeight",
      "parliament",
      "payout",
    ],
    "validationFee.expected",
  );
  if (
    expectedRaw.activePolicyVersion !== "1" ||
    expectedRaw.feeAssetDefinitionId !== CBSI_SBD_ASSET_DEFINITION_ID ||
    expectedRaw.feeScale !== 2 ||
    expectedRaw.feeMinorUnits !== "10" ||
    expectedRaw.chargingMode !== CHARGING_MODE ||
    expectedRaw.expiresAfterHeight !== null
  ) {
    throw new Error(
      "validationFee.expected must pin the exact initial 0.10 SBD policy.",
    );
  }
  const activePolicyHash = canonicalIrohaHash(
    expectedRaw.activePolicyHash,
    "validationFee.expected.activePolicyHash",
  );
  if (activePolicyHash !== binding.policyChainGenesisHash) {
    throw new Error(
      "validationFee.expected.activePolicyHash must match the policy-chain genesis hash.",
    );
  }
  const parliamentRaw = exactRecord(
    expectedRaw.parliament,
    ["validationFeePolicy", "payoutLifecycle", "payoutLifecycleSealHash"],
    "validationFee.expected.parliament",
  );
  const validationFeePolicy = parseConfigProposal(
    parliamentRaw.validationFeePolicy,
    "ValidationFeePolicyV1",
    "validationFee.expected.parliament.validationFeePolicy",
  );
  const payoutLifecycle = parseConfigProposal(
    parliamentRaw.payoutLifecycle,
    "ValidationFeePayoutLifecycleV1",
    "validationFee.expected.parliament.payoutLifecycle",
  );
  if (validationFeePolicy.proposal_id === payoutLifecycle.proposal_id) {
    throw new Error("Validation-fee Parliament proposal IDs must differ.");
  }
  const effectiveFromHeight = positiveSafeIntegerText(
    expectedRaw.effectiveFromHeight,
    "validationFee.expected.effectiveFromHeight",
  );
  if (
    BigInt(effectiveFromHeight) -
      BigInt(validationFeePolicy.enactment_window.enacted_at_height) !==
    BigInt(VALIDATION_FEE_ACTIVATION_DELAY_BLOCKS)
  ) {
    throw new Error(
      "Validation-fee activation must be exactly 120,960 blocks after policy enactment.",
    );
  }
  if (
    BigInt(payoutLifecycle.enactment_window.enacted_at_height) >
      BigInt(effectiveFromHeight) ||
    BigInt(binding.checkpoint.height) >= BigInt(effectiveFromHeight)
  ) {
    throw new Error(
      "Validation-fee activation must follow lifecycle enactment and its trusted checkpoint.",
    );
  }
  const payout = parseConfigPayout(expectedRaw.payout);
  const payoutLifecycleSealHash = canonicalIrohaHash(
    parliamentRaw.payoutLifecycleSealHash,
    "validationFee.expected.parliament.payoutLifecycleSealHash",
  );
  return {
    enabled: true,
    ledgerBinding: binding,
    expected: {
      activePolicyVersion: "1",
      activePolicyHash,
      feeAssetDefinitionId: CBSI_SBD_ASSET_DEFINITION_ID,
      feeScale: 2,
      feeMinorUnits: "10",
      chargingMode: CHARGING_MODE,
      effectiveFromHeight,
      expiresAfterHeight: null,
      parliament: {
        validationFeePolicy,
        payoutLifecycle,
        payoutLifecycleSealHash,
      },
      payout,
    },
  };
}

function parseConfigProposal<TKind extends ValidationFeeProposalKind>(
  value: unknown,
  expectedKind: TKind,
  label: string,
): ValidationFeeProposalConfig & { proposal_kind: TKind } {
  const raw = exactRecord(
    value,
    [
      "proposal_kind",
      "proposal_id",
      "payload_hash",
      "parliament_roster_root",
      "enactment_window",
      "finalization",
    ],
    label,
  );
  if (raw.proposal_kind !== expectedKind) {
    throw new Error(`${label}.proposal_kind must be ${expectedKind}.`);
  }
  const proposalId = lowerHash(raw.proposal_id, `${label}.proposal_id`);
  const payloadHash = lowerHash(raw.payload_hash, `${label}.payload_hash`);
  if (proposalId !== payloadHash) {
    throw new Error(`${label}.proposal_id must equal payload_hash.`);
  }
  const windowRaw = exactRecord(
    raw.enactment_window,
    ["opens_at_height", "closes_at_height", "enacted_at_height"],
    `${label}.enactment_window`,
  );
  const enactmentWindow = {
    opens_at_height: positiveSafeIntegerText(
      windowRaw.opens_at_height,
      `${label}.enactment_window.opens_at_height`,
    ),
    closes_at_height: positiveSafeIntegerText(
      windowRaw.closes_at_height,
      `${label}.enactment_window.closes_at_height`,
    ),
    enacted_at_height: positiveSafeIntegerText(
      windowRaw.enacted_at_height,
      `${label}.enactment_window.enacted_at_height`,
    ),
  };
  const finalization = parseConfigFinalization(
    raw.finalization,
    proposalId,
    `${label}.finalization`,
  );
  const opens = BigInt(enactmentWindow.opens_at_height);
  const closes = BigInt(enactmentWindow.closes_at_height);
  const enacted = BigInt(enactmentWindow.enacted_at_height);
  const finalized = BigInt(finalization.finalized_at_height);
  if (
    closes < opens ||
    finalized < opens ||
    finalized > closes ||
    enacted < finalized ||
    enacted > closes
  ) {
    throw new Error(`${label} has an invalid finalization/enactment window.`);
  }
  return {
    proposal_kind: expectedKind,
    proposal_id: proposalId,
    payload_hash: payloadHash,
    parliament_roster_root: lowerHash(
      raw.parliament_roster_root,
      `${label}.parliament_roster_root`,
    ),
    enactment_window: enactmentWindow,
    finalization,
  };
}

function parseConfigFinalization(
  value: unknown,
  proposalId: string,
  label: string,
): ValidationFeeFinalizationConfig {
  const raw = exactRecord(
    value,
    [
      "proposal_id",
      "referendum_id",
      "finalized_at_height",
      "mode",
      "approve",
      "reject",
      "abstain",
      "min_turnout",
      "approval_threshold_numerator",
      "approval_threshold_denominator",
      "approved",
    ],
    label,
  );
  if (
    lowerHash(raw.proposal_id, `${label}.proposal_id`) !== proposalId ||
    lowerHash(raw.referendum_id, `${label}.referendum_id`) !== proposalId ||
    raw.mode !== "PLAIN" ||
    raw.approved !== true
  ) {
    throw new Error(`${label} must contain approved PLAIN finalization.`);
  }
  const result: ValidationFeeFinalizationConfig = {
    proposal_id: proposalId,
    referendum_id: proposalId,
    finalized_at_height: positiveSafeIntegerText(
      raw.finalized_at_height,
      `${label}.finalized_at_height`,
    ),
    mode: "PLAIN",
    approve: unsignedU128(raw.approve, `${label}.approve`),
    reject: unsignedU128(raw.reject, `${label}.reject`),
    abstain: unsignedU128(raw.abstain, `${label}.abstain`),
    min_turnout: unsignedU128(raw.min_turnout, `${label}.min_turnout`),
    approval_threshold_numerator: positiveU64(
      raw.approval_threshold_numerator,
      `${label}.approval_threshold_numerator`,
    ),
    approval_threshold_denominator: positiveU64(
      raw.approval_threshold_denominator,
      `${label}.approval_threshold_denominator`,
    ),
    approved: true,
  };
  assertApprovedTally(result, label);
  return result;
}

function parseConfigPayout(
  value: unknown,
): GovernanceValidationFeeEnabledConfig["expected"]["payout"] {
  const label = "validationFee.expected.payout";
  const raw = exactRecord(
    value,
    [
      "contractAddress",
      "codeHash",
      "entrypoint",
      "sbdAssetDefinitionId",
      "xorAssetDefinitionId",
      "treasuryAccountId",
      "vaultAccountId",
      "batchSbdMinorUnits",
      "sbdScale",
      "xorOutputMin",
      "xorOutputMax",
      "recipients",
    ],
    label,
  );
  const contractAddress = exactText(
    raw.contractAddress,
    `${label}.contractAddress`,
  );
  if (
    !CONTRACT_ADDRESS.test(contractAddress) ||
    raw.entrypoint !== PAYOUT_ENTRYPOINT ||
    raw.sbdAssetDefinitionId !== CBSI_SBD_ASSET_DEFINITION_ID ||
    raw.batchSbdMinorUnits !== "1000" ||
    raw.sbdScale !== 2 ||
    raw.xorOutputMin !== "4" ||
    raw.xorOutputMax !== "100"
  ) {
    throw new Error(`${label} differs from the first-release payout contract.`);
  }
  const xorAssetDefinitionId = exactText(
    raw.xorAssetDefinitionId,
    `${label}.xorAssetDefinitionId`,
  );
  if (xorAssetDefinitionId === CBSI_SBD_ASSET_DEFINITION_ID) {
    throw new Error(`${label} SBD and XOR assets must differ.`);
  }
  const treasuryAccountId = exactText(
    raw.treasuryAccountId,
    `${label}.treasuryAccountId`,
  );
  const vaultAccountId = exactText(
    raw.vaultAccountId,
    `${label}.vaultAccountId`,
  );
  if (!Array.isArray(raw.recipients) || raw.recipients.length !== 4) {
    throw new Error(`${label}.recipients must contain exactly four entries.`);
  }
  const recipients = raw.recipients.map((value, index) => {
    const recipient = exactRecord(
      value,
      ["account_id", "share_basis_points"],
      `${label}.recipients[${index}]`,
    );
    if (recipient.share_basis_points !== 2500) {
      throw new Error(`${label} recipient shares must be exactly 2500 bps.`);
    }
    return {
      account_id: exactText(
        recipient.account_id,
        `${label}.recipients[${index}].account_id`,
      ),
      share_basis_points: 2500 as const,
    };
  });
  const accounts = recipients.map((recipient) => recipient.account_id);
  if (
    treasuryAccountId === vaultAccountId ||
    new Set(accounts).size !== 4 ||
    accounts.includes(treasuryAccountId) ||
    accounts.includes(vaultAccountId)
  ) {
    throw new Error(
      `${label} treasury, vault, and recipients must be distinct.`,
    );
  }
  return {
    contractAddress,
    codeHash: lowerHash(raw.codeHash, `${label}.codeHash`),
    entrypoint: PAYOUT_ENTRYPOINT,
    sbdAssetDefinitionId: CBSI_SBD_ASSET_DEFINITION_ID,
    xorAssetDefinitionId,
    treasuryAccountId,
    vaultAccountId,
    batchSbdMinorUnits: "1000",
    sbdScale: 2,
    xorOutputMin: "4",
    xorOutputMax: "100",
    recipients,
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
  const policy = parseProjectionPolicy(raw.policy);
  const parliamentAuthorization = parseProjectionParliament(
    raw.parliament_authorization,
  );
  const ledgerFinality = parseProjectionFinality(raw.ledger_finality);
  const result: ValidationFeeProjection = {
    schema: LEDGER_PROJECTION_SCHEMA,
    authorization_model: AUTHORIZATION_MODEL,
    policy_chain_genesis_hash_hex: canonicalIrohaHash(
      raw.policy_chain_genesis_hash_hex,
      "projection policy-chain genesis hash",
    ),
    policy,
    parliament_authorization: parliamentAuthorization,
    ledger_finality: ledgerFinality,
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
      "expires_after_height",
      "exemption_classes",
      "treasury_payout_binding",
    ],
    "validation-fee policy",
  );
  if (
    raw.schema_version !== 1 ||
    raw.policy_version !== 1 ||
    raw.previous_policy_hash_hex !== null ||
    raw.sbd_asset_id !== CBSI_SBD_ASSET_DEFINITION_ID ||
    raw.sbd_scale !== 2 ||
    raw.fee !== "0.10" ||
    raw.fee_minor_units !== 10 ||
    raw.charging_mode !== CHARGING_MODE ||
    raw.expires_after_height !== null ||
    !Array.isArray(raw.exemption_classes) ||
    raw.exemption_classes.length !== 1 ||
    raw.exemption_classes[0] !== "TREASURY_PAYOUT"
  ) {
    throw new Error(
      "CBSI Core projection differs from the exact initial 0.10 SBD policy.",
    );
  }
  return {
    schema_version: 1,
    network_id: exactText(raw.network_id, "projection network id"),
    genesis_hash_hex: canonicalIrohaHash(
      raw.genesis_hash_hex,
      "projection genesis hash",
    ),
    policy_version: 1,
    previous_policy_hash_hex: null,
    policy_hash_hex: canonicalIrohaHash(
      raw.policy_hash_hex,
      "projection policy hash",
    ),
    sbd_asset_id: CBSI_SBD_ASSET_DEFINITION_ID,
    sbd_scale: 2,
    fee: "0.10",
    fee_minor_units: 10,
    treasury_account_id: exactText(
      raw.treasury_account_id,
      "projection treasury account",
    ),
    charging_mode: CHARGING_MODE,
    effective_from_height: positiveSafeInteger(
      raw.effective_from_height,
      "projection effective height",
    ),
    expires_after_height: null,
    exemption_classes: ["TREASURY_PAYOUT"],
    treasury_payout_binding: parseProjectionPayout(raw.treasury_payout_binding),
  };
}

function parseProjectionPayout(
  value: unknown,
): ValidationFeeProjection["policy"]["treasury_payout_binding"] {
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
      "pool_vault_account_id",
      "batch_sbd",
      "min_xor_out",
      "max_xor_out",
      "recipients",
      "lifecycle_seal_hex",
    ],
    "validation-fee payout binding",
  );
  const contractAddress = exactText(
    raw.contract_address,
    "projection payout contract",
  );
  if (
    !CONTRACT_ADDRESS.test(contractAddress) ||
    raw.entrypoint !== PAYOUT_ENTRYPOINT ||
    raw.sbd_asset_id !== CBSI_SBD_ASSET_DEFINITION_ID ||
    raw.batch_sbd !== "10" ||
    raw.min_xor_out !== "4" ||
    raw.max_xor_out !== "100" ||
    !Array.isArray(raw.recipients) ||
    raw.recipients.length !== 4
  ) {
    throw new Error(
      "CBSI Core payout projection differs from the exact first release.",
    );
  }
  const recipients = raw.recipients.map((value, index) => {
    const recipient = exactRecord(
      value,
      ["account_id", "share"],
      `projection payout recipient ${index}`,
    );
    if (recipient.share !== "0.25") {
      throw new Error("Projection payout shares must each be exactly 0.25.");
    }
    return {
      account_id: exactText(
        recipient.account_id,
        `projection payout recipient ${index}`,
      ),
      share: "0.25" as const,
    };
  });
  if (new Set(recipients.map((recipient) => recipient.account_id)).size !== 4) {
    throw new Error("Projection payout recipient accounts must be unique.");
  }
  return {
    contract_address: contractAddress,
    contract_subject_account_id: exactText(
      raw.contract_subject_account_id,
      "projection payout contract subject",
    ),
    code_hash_hex: lowerHash(raw.code_hash_hex, "projection payout code hash"),
    entrypoint: PAYOUT_ENTRYPOINT,
    treasury_account_id: exactText(
      raw.treasury_account_id,
      "projection payout treasury",
    ),
    sbd_asset_id: CBSI_SBD_ASSET_DEFINITION_ID,
    xor_asset_id: exactText(raw.xor_asset_id, "projection payout XOR asset"),
    pool_vault_account_id: exactText(
      raw.pool_vault_account_id,
      "projection payout vault",
    ),
    batch_sbd: "10",
    min_xor_out: "4",
    max_xor_out: "100",
    recipients,
    lifecycle_seal_hex: canonicalIrohaHash(
      raw.lifecycle_seal_hex,
      "projection payout lifecycle seal",
    ),
  };
}

function parseProjectionParliament(
  value: unknown,
): ValidationFeeProjection["parliament_authorization"] {
  const raw = exactRecord(
    value,
    ["policy_proposal", "payout_lifecycle_proposal"],
    "projection Parliament authorization",
  );
  const policyProposal = parseProjectionProposal(
    raw.policy_proposal,
    "projection policy proposal",
  );
  const lifecycleRaw = exactRecord(
    raw.payout_lifecycle_proposal,
    [
      "proposal_id_hex",
      "proposal_fingerprint_hex",
      "parliament_roster_root_hex",
      "enactment_window",
      "finalization",
      "lifecycle_seal_hex",
    ],
    "projection payout lifecycle proposal",
  );
  const payoutLifecycleProposal = {
    ...parseProjectionProposal(
      lifecycleRaw,
      "projection payout lifecycle proposal",
      true,
    ),
    lifecycle_seal_hex: canonicalIrohaHash(
      lifecycleRaw.lifecycle_seal_hex,
      "projection payout lifecycle seal",
    ),
  };
  if (
    policyProposal.proposal_id_hex === payoutLifecycleProposal.proposal_id_hex
  ) {
    throw new Error("Projection Parliament proposal IDs must differ.");
  }
  return {
    policy_proposal: policyProposal,
    payout_lifecycle_proposal: payoutLifecycleProposal,
  };
}

function parseProjectionProposal(
  value: unknown,
  label: string,
  lifecycle = false,
): ValidationFeeProposal {
  const raw = exactRecord(
    value,
    [
      "proposal_id_hex",
      "proposal_fingerprint_hex",
      "parliament_roster_root_hex",
      "enactment_window",
      "finalization",
      ...(lifecycle ? ["lifecycle_seal_hex"] : []),
    ],
    label,
  );
  const proposalId = lowerHash(raw.proposal_id_hex, `${label} id`);
  const proposalFingerprint = lowerHash(
    raw.proposal_fingerprint_hex,
    `${label} fingerprint`,
  );
  if (proposalId !== proposalFingerprint) {
    throw new Error(`${label} ID must equal its typed fingerprint.`);
  }
  const windowRaw = exactRecord(
    raw.enactment_window,
    ["opens_at_height", "closes_at_height", "enacted_at_height"],
    `${label} enactment window`,
  );
  const window = {
    opens_at_height: positiveSafeInteger(
      windowRaw.opens_at_height,
      `${label} opens height`,
    ),
    closes_at_height: positiveSafeInteger(
      windowRaw.closes_at_height,
      `${label} closes height`,
    ),
    enacted_at_height: positiveSafeInteger(
      windowRaw.enacted_at_height,
      `${label} enacted height`,
    ),
  };
  const finalization = parseProjectionFinalization(
    raw.finalization,
    proposalId,
    label,
  );
  if (
    window.closes_at_height < window.opens_at_height ||
    finalization.finalized_at_height < window.opens_at_height ||
    finalization.finalized_at_height > window.closes_at_height ||
    window.enacted_at_height < finalization.finalized_at_height ||
    window.enacted_at_height > window.closes_at_height
  ) {
    throw new Error(`${label} finalization/enactment window is invalid.`);
  }
  return {
    proposal_id_hex: proposalId,
    proposal_fingerprint_hex: proposalFingerprint,
    parliament_roster_root_hex: lowerHash(
      raw.parliament_roster_root_hex,
      `${label} roster root`,
    ),
    enactment_window: window,
    finalization,
  };
}

function parseProjectionFinalization(
  value: unknown,
  proposalId: string,
  label: string,
): ValidationFeeFinalization {
  const raw = exactRecord(
    value,
    [
      "proposal_id_hex",
      "referendum_id_hex",
      "finalized_at_height",
      "mode",
      "approve",
      "reject",
      "abstain",
      "min_turnout",
      "approval_threshold_numerator",
      "approval_threshold_denominator",
      "approved",
    ],
    `${label} finalization`,
  );
  if (
    lowerHash(raw.proposal_id_hex, `${label} finalization proposal`) !==
      proposalId ||
    lowerHash(raw.referendum_id_hex, `${label} referendum`) !== proposalId ||
    raw.mode !== "PLAIN" ||
    raw.approved !== true
  ) {
    throw new Error(`${label} lacks exact approved PLAIN finalization.`);
  }
  const result: ValidationFeeFinalization = {
    proposal_id_hex: proposalId,
    referendum_id_hex: proposalId,
    finalized_at_height: positiveSafeInteger(
      raw.finalized_at_height,
      `${label} finalized height`,
    ),
    mode: "PLAIN",
    approve: unsignedU128(raw.approve, `${label} approve tally`),
    reject: unsignedU128(raw.reject, `${label} reject tally`),
    abstain: unsignedU128(raw.abstain, `${label} abstain tally`),
    min_turnout: unsignedU128(raw.min_turnout, `${label} minimum turnout`),
    approval_threshold_numerator: positiveU64(
      raw.approval_threshold_numerator,
      `${label} threshold numerator`,
    ),
    approval_threshold_denominator: positiveU64(
      raw.approval_threshold_denominator,
      `${label} threshold denominator`,
    ),
    approved: true,
  };
  assertApprovedTally(result, label);
  return result;
}

function parseProjectionFinality(
  value: unknown,
): ValidationFeeProjection["ledger_finality"] {
  const raw = exactRecord(
    value,
    [
      "ledger_finalised_height",
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
  return {
    ledger_finalised_height: positiveSafeInteger(
      raw.ledger_finalised_height,
      "projection finalized height",
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

function assertProjectionRelationships(projection: ValidationFeeProjection) {
  const policy = projection.policy;
  const finality = projection.ledger_finality;
  const payout = policy.treasury_payout_binding;
  const policyProposal = projection.parliament_authorization.policy_proposal;
  const lifecycle =
    projection.parliament_authorization.payout_lifecycle_proposal;
  if (
    policy.policy_hash_hex !== projection.policy_chain_genesis_hash_hex ||
    finality.head_policy_hash_hex !== policy.policy_hash_hex ||
    finality.scheduled_policy_hash_hex !== policy.policy_hash_hex ||
    finality.effective_policy_hash_hex !== policy.policy_hash_hex
  ) {
    throw new Error(
      "CBSI Core projection policy chain and protected registry head differ.",
    );
  }
  if (
    finality.ledger_finalised_height < finality.checkpoint_height ||
    finality.ledger_finalised_height < policy.effective_from_height
  ) {
    throw new Error(
      "CBSI Core validation-fee projection is not active at finalized height.",
    );
  }
  if (
    policy.effective_from_height !==
    policyProposal.enactment_window.enacted_at_height +
      VALIDATION_FEE_ACTIVATION_DELAY_BLOCKS
  ) {
    throw new Error(
      "Validation-fee policy does not preserve the 120,960-block activation delay.",
    );
  }
  if (
    payout.lifecycle_seal_hex !== lifecycle.lifecycle_seal_hex ||
    payout.contract_subject_account_id !== policy.treasury_account_id ||
    payout.treasury_account_id !== policy.treasury_account_id ||
    payout.sbd_asset_id !== policy.sbd_asset_id ||
    payout.pool_vault_account_id === policy.treasury_account_id ||
    payout.recipients.some(
      (recipient) =>
        recipient.account_id === policy.treasury_account_id ||
        recipient.account_id === payout.pool_vault_account_id,
    )
  ) {
    throw new Error(
      "CBSI Core payout lifecycle differs from the active fee policy.",
    );
  }
}

function assertProjectionMatchesRuntime(
  projection: ValidationFeeProjection,
  config: GovernanceValidationFeeEnabledConfig,
) {
  const expectedProjection = expectedProjectionFromRuntime(config);
  const actualWithoutFinality = {
    schema: projection.schema,
    authorization_model: projection.authorization_model,
    policy_chain_genesis_hash_hex: projection.policy_chain_genesis_hash_hex,
    policy: projection.policy,
    parliament_authorization: projection.parliament_authorization,
  };
  if (
    canonicalJson(actualWithoutFinality) !== canonicalJson(expectedProjection)
  ) {
    throw new Error(
      "CBSI Core validation-fee projection does not exactly match runtime ledgerBinding and expected coordinates.",
    );
  }
  if (
    projection.ledger_finality.checkpoint_height !==
      config.ledgerBinding.checkpoint.height ||
    projection.ledger_finality.checkpoint_context_id_hex !==
      config.ledgerBinding.checkpoint.contextId
  ) {
    throw new Error(
      "CBSI Core validation-fee finality does not match the runtime trusted checkpoint.",
    );
  }
}

function expectedProjectionFromRuntime(
  config: GovernanceValidationFeeEnabledConfig,
) {
  const { ledgerBinding: binding, expected } = config;
  const proposal = (value: ValidationFeeProposalConfig) => ({
    proposal_id_hex: value.proposal_id,
    proposal_fingerprint_hex: value.payload_hash,
    parliament_roster_root_hex: value.parliament_roster_root,
    enactment_window: {
      opens_at_height: Number(value.enactment_window.opens_at_height),
      closes_at_height: Number(value.enactment_window.closes_at_height),
      enacted_at_height: Number(value.enactment_window.enacted_at_height),
    },
    finalization: {
      proposal_id_hex: value.finalization.proposal_id,
      referendum_id_hex: value.finalization.referendum_id,
      finalized_at_height: Number(value.finalization.finalized_at_height),
      mode: "PLAIN" as const,
      approve: value.finalization.approve,
      reject: value.finalization.reject,
      abstain: value.finalization.abstain,
      min_turnout: value.finalization.min_turnout,
      approval_threshold_numerator:
        value.finalization.approval_threshold_numerator,
      approval_threshold_denominator:
        value.finalization.approval_threshold_denominator,
      approved: true as const,
    },
  });
  return {
    schema: LEDGER_PROJECTION_SCHEMA,
    authorization_model: AUTHORIZATION_MODEL,
    policy_chain_genesis_hash_hex: binding.policyChainGenesisHash,
    policy: {
      schema_version: 1,
      network_id: binding.chainId,
      genesis_hash_hex: binding.genesisHash,
      policy_version: 1,
      previous_policy_hash_hex: null,
      policy_hash_hex: expected.activePolicyHash,
      sbd_asset_id: expected.feeAssetDefinitionId,
      sbd_scale: 2,
      fee: "0.10",
      fee_minor_units: 10,
      treasury_account_id: expected.payout.treasuryAccountId,
      charging_mode: CHARGING_MODE,
      effective_from_height: Number(expected.effectiveFromHeight),
      expires_after_height: null,
      exemption_classes: ["TREASURY_PAYOUT"],
      treasury_payout_binding: {
        contract_address: expected.payout.contractAddress,
        contract_subject_account_id: expected.payout.treasuryAccountId,
        code_hash_hex: expected.payout.codeHash,
        entrypoint: PAYOUT_ENTRYPOINT,
        treasury_account_id: expected.payout.treasuryAccountId,
        sbd_asset_id: expected.payout.sbdAssetDefinitionId,
        xor_asset_id: expected.payout.xorAssetDefinitionId,
        pool_vault_account_id: expected.payout.vaultAccountId,
        batch_sbd: "10",
        min_xor_out: "4",
        max_xor_out: "100",
        recipients: expected.payout.recipients.map((recipient) => ({
          account_id: recipient.account_id,
          share: "0.25",
        })),
        lifecycle_seal_hex: expected.parliament.payoutLifecycleSealHash,
      },
    },
    parliament_authorization: {
      policy_proposal: proposal(expected.parliament.validationFeePolicy),
      payout_lifecycle_proposal: {
        ...proposal(expected.parliament.payoutLifecycle),
        lifecycle_seal_hex: expected.parliament.payoutLifecycleSealHash,
      },
    },
  };
}

function rejectRollbackOrEquivocation(
  projection: ValidationFeeProjection,
  config: GovernanceValidationFeeEnabledConfig,
  coreApiBaseUrl: string,
) {
  const scope = `${canonicalJson(config)}|${new URL(coreApiBaseUrl).origin}`;
  const current: FinalityObservation = {
    height: projection.ledger_finality.ledger_finalised_height,
    contextId: projection.ledger_finality.context_id_hex,
    blockHash: projection.ledger_finality.block_hash_hex,
    policyVersion: projection.policy.policy_version,
    policyHash: projection.policy.policy_hash_hex,
    projectionFingerprint: canonicalJson(projection),
  };
  const previous = lastObservationByTrustScope.get(scope);
  if (
    previous &&
    (current.height < previous.height ||
      current.policyVersion < previous.policyVersion)
  ) {
    throw new Error(
      "CBSI Core validation-fee finality regressed behind a previously verified state.",
    );
  }
  if (
    previous &&
    ((current.height === previous.height &&
      (current.contextId !== previous.contextId ||
        current.blockHash !== previous.blockHash ||
        current.projectionFingerprint !== previous.projectionFingerprint)) ||
      (current.policyVersion === previous.policyVersion &&
        current.policyHash !== previous.policyHash))
  ) {
    throw new Error(
      "CBSI Core validation-fee projection equivocated at an already verified height or policy version.",
    );
  }
  lastObservationByTrustScope.set(scope, current);
}

function projectPolicyView(
  projection: ValidationFeeProjection,
): GovernanceValidationFeePolicyView {
  const policy = projection.policy;
  const effective = {
    schema_version: policy.schema_version,
    chain_id: policy.network_id,
    genesis_hash: policy.genesis_hash_hex,
    policy_version: String(policy.policy_version),
    previous_policy_hash: policy.previous_policy_hash_hex,
    policy_hash: policy.policy_hash_hex,
    ds_asset_id: policy.sbd_asset_id,
    ds_scale: policy.sbd_scale,
    fee: policy.fee,
    treasury_account_id: policy.treasury_account_id,
    charging_mode: {
      charging_mode: policy.charging_mode,
      value: null,
    },
    effective_from_height: String(policy.effective_from_height),
    expires_after_height: null,
    exemption_classes: policy.exemption_classes,
    treasury_payout_binding: policy.treasury_payout_binding,
    parliament_authorization: projection.parliament_authorization,
  };
  return deepFreeze({
    observedHeight: String(projection.ledger_finality.ledger_finalised_height),
    effective,
    latestEnacted: effective,
    scheduled: [],
    registryHead: {
      policyVersion: String(policy.policy_version),
      policyHash: policy.policy_hash_hex,
    },
    verifiedProof: {
      schema: LEDGER_PROJECTION_SCHEMA,
      authorizationModel: AUTHORIZATION_MODEL,
      registrySnapshotHash:
        projection.ledger_finality.registry_snapshot_hash_hex,
      finalizedBlockHash: projection.ledger_finality.block_hash_hex,
      finalizedContextId: projection.ledger_finality.context_id_hex,
      trustedCheckpointHeight: String(
        projection.ledger_finality.checkpoint_height,
      ),
      trustedCheckpointContextId:
        projection.ledger_finality.checkpoint_context_id_hex,
    },
  });
}

function assertApprovedTally(
  value: ValidationFeeFinalization | ValidationFeeFinalizationConfig,
  label: string,
) {
  const turnout = checkedU128Add(
    checkedU128Add(
      BigInt(value.approve),
      BigInt(value.reject),
      `${label} turnout`,
    ),
    BigInt(value.abstain),
    `${label} turnout`,
  );
  const weightedApprove = checkedU128Multiply(
    BigInt(value.approve),
    BigInt(value.approval_threshold_denominator),
    `${label} threshold`,
  );
  const weightedTurnout = checkedU128Multiply(
    turnout,
    BigInt(value.approval_threshold_numerator),
    `${label} threshold`,
  );
  if (
    BigInt(value.approval_threshold_numerator) >
      BigInt(value.approval_threshold_denominator) ||
    turnout < BigInt(value.min_turnout) ||
    weightedApprove < weightedTurnout
  ) {
    throw new Error(`${label} is not a deterministic approved result.`);
  }
}

function checkedU128Add(left: bigint, right: bigint, label: string): bigint {
  const result = left + right;
  if (result > U128_MAX) {
    throw new Error(`${label} overflows u128.`);
  }
  return result;
}

function checkedU128Multiply(
  left: bigint,
  right: bigint,
  label: string,
): bigint {
  const result = left * right;
  if (result > U128_MAX) {
    throw new Error(`${label} overflows u128.`);
  }
  return result;
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
      return codePoint <= 0x1f || codePoint === 0x7f;
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

function positiveSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new Error(`${label} must be a positive safe integer.`);
  }
  return Number(value);
}

function positiveSafeIntegerText(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    !/^[1-9][0-9]*$/u.test(value) ||
    BigInt(value) > BigInt(Number.MAX_SAFE_INTEGER)
  ) {
    throw new Error(`${label} must be a positive safe-integer string.`);
  }
  return value;
}

function unsignedU128(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    !/^(0|[1-9][0-9]*)$/u.test(value) ||
    BigInt(value) > U128_MAX
  ) {
    throw new Error(`${label} must be a canonical u128 integer string.`);
  }
  return value;
}

function positiveU64(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    !/^[1-9][0-9]*$/u.test(value) ||
    BigInt(value) > U64_MAX
  ) {
    throw new Error(`${label} must be a canonical positive u64 string.`);
  }
  return value;
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

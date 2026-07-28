export const GOVERNANCE_PIPELINE_STAGES = [
  "Admit",
  "Rules",
  "Agenda",
  "Study",
  "Review",
  "Jury",
  "Enact",
] as const;

export type GovernancePipelineStageName =
  (typeof GOVERNANCE_PIPELINE_STAGES)[number];

export type GovernanceProposalStatus =
  | "Proposed"
  | "Approved"
  | "Rejected"
  | "Enacted"
  | "Superseded"
  | "Unknown";

export type GovernanceReferendumStatus =
  | "Proposed"
  | "Open"
  | "Closed"
  | "Unknown";

export type GovernanceVotingMode = "Plain" | "Zk" | "Unknown";

export type GovernanceProposalKindId =
  | "DeployContract"
  | "RuntimeUpgrade"
  | "SccpRouteGovernance"
  | "ValidationFeePayoutLifecycle"
  | "ValidationFeePolicy"
  | "Unknown";

export type GovernanceWritableProposalKindId =
  | "ValidationFeePayoutLifecycle"
  | "ValidationFeePolicy";

export type GovernanceParliamentDecision = "approve" | "reject" | "abstain";

export const GOVERNANCE_PARLIAMENT_BODIES = [
  "rules-committee",
  "agenda-council",
  "interest-panel",
  "review-panel",
  "policy-jury",
  "oversight-committee",
  "fma-committee",
] as const;

export type GovernanceParliamentBody =
  (typeof GOVERNANCE_PARLIAMENT_BODIES)[number];

export interface GovernancePipelineStage {
  stage: GovernancePipelineStageName;
  startedAt: string;
  deadline: string | null;
  completedAt: string | null;
  failure: string | null;
}

export interface GovernanceParliamentRoster {
  body: GovernanceParliamentBody;
  members: string[];
  alternates: string[];
}

export interface GovernanceParliamentOutcome {
  body: GovernanceParliamentBody;
  approvals: string;
  rejections: string;
  abstentions: string;
  required: string;
  currentAccountDecision: GovernanceParliamentDecision | null;
}

export interface GovernanceReferendum {
  id: string;
  hStart: string;
  hEnd: string;
  status: GovernanceReferendumStatus;
  mode: GovernanceVotingMode;
}

export interface GovernanceTally {
  approve: string;
  reject: string;
  abstain: string;
  turnout: string;
  minTurnout: string;
  approvalThresholdNumerator: string;
  approvalThresholdDenominator: string;
  approved: boolean | null;
}

export interface GovernanceLock {
  owner: string;
  amount: string;
  expiryHeight: string;
  direction: string;
  durationBlocks: string;
}

export interface GovernanceFinalizationEvidence {
  proposal_id: string;
  referendum_id: string;
  finalized_at_height: string;
  mode: "Plain";
  approve: string;
  reject: string;
  abstain: string;
  min_turnout: string;
  approval_threshold_numerator: string;
  approval_threshold_denominator: string;
  approved: boolean;
}

export type GovernanceCitizenVoteState =
  | "unavailable"
  | "awaiting-window"
  | "open"
  | "recorded"
  | "closed";

export interface GovernanceCitizenVoteProjection {
  state: GovernanceCitizenVoteState;
  lock: GovernanceLock | null;
  blocksUntilOpen: string | null;
  blocksUntilClose: string | null;
}

interface GovernanceKindBase {
  type: GovernanceProposalKindId;
  raw: Record<string, unknown>;
}

export interface DeployContractGovernanceKind extends GovernanceKindBase {
  type: "DeployContract";
  contractAddress: string;
  codeHash: string;
  abiHash: string;
  abiVersion: string;
}

export interface RuntimeUpgradeGovernanceKind extends GovernanceKindBase {
  type: "RuntimeUpgrade";
  manifest: Record<string, unknown>;
}

export interface SccpRouteGovernanceKind extends GovernanceKindBase {
  type: "SccpRouteGovernance";
  action: Record<string, unknown>;
}

export interface ValidationFeeChargingModePayload {
  charging_mode: "PER_QUALIFYING_TRANSFER_INSTRUCTION";
  value: null;
}

export interface ValidationFeePolicyPayload {
  schema_version: number;
  chain_id: string;
  genesis_hash: string;
  policy_version: string;
  previous_policy_hash: string | null;
  ds_asset_id: string;
  ds_scale: number;
  fee: string;
  treasury_account_id: string;
  charging_mode: ValidationFeeChargingModePayload;
  effective_from_height: string;
  expires_after_height: string | null;
  exemption_classes: string[];
  treasury_payout_binding: Record<string, unknown> | null;
}

export interface ValidationFeeReferendumWindowPayload {
  lower: string;
  upper: string;
}

export const VALIDATION_FEE_PLAIN_VOTING_ASSET_ID =
  "6TEAJqbb8oEPmLncoNiMRbLEK6tw";

export interface ValidationFeePlainElectorateRulesPayload {
  voting_asset_id: typeof VALIDATION_FEE_PLAIN_VOTING_ASSET_ID;
  bond_escrow_account: string;
  slash_receiver_account: string;
  ballot_amount: "150";
  ballot_duration_blocks: "3600";
  citizenship_amount: "10000";
  max_members: "256";
  conviction_step_blocks: "100";
  max_conviction: "6";
  min_turnout: "1";
  approval_threshold_numerator: "1";
  approval_threshold_denominator: "2";
  eligibility_rule: {
    rule: "proposal_operator_at_or_before_gate_others_after_gate";
    value: null;
  };
}

export interface ValidationFeePolicyGovernanceKind extends GovernanceKindBase {
  type: "ValidationFeePolicy";
  policy: ValidationFeePolicyPayload;
  payoutLifecycleProposalId: string | null;
  plainElectorateRules: ValidationFeePlainElectorateRulesPayload;
}

export interface ValidationFeePayoutLifecycleGovernanceKind
  extends GovernanceKindBase {
  type: "ValidationFeePayoutLifecycle";
  payoutBinding: Record<string, unknown>;
  plainElectorateRules: ValidationFeePlainElectorateRulesPayload;
}

export interface UnknownGovernanceKind extends GovernanceKindBase {
  type: "Unknown";
  variant: string;
}

export type GovernanceProposalKind =
  | DeployContractGovernanceKind
  | RuntimeUpgradeGovernanceKind
  | SccpRouteGovernanceKind
  | ValidationFeePayoutLifecycleGovernanceKind
  | ValidationFeePolicyGovernanceKind
  | UnknownGovernanceKind;

export interface GovernanceProposalSummary {
  proposalId: string;
  referendumId: string;
  proposer: string;
  createdHeight: string;
  status: GovernanceProposalStatus;
  referendumStatus: GovernanceReferendumStatus;
  votingMode: GovernanceVotingMode;
  kindType: GovernanceProposalKindId;
  kindLabelKey: string;
  currentStage: GovernancePipelineStageName;
}

export interface GovernanceProposalDetail {
  summary: GovernanceProposalSummary;
  kind: GovernanceProposalKind;
  referendum: GovernanceReferendum | null;
  tally: GovernanceTally | null;
  locks: GovernanceLock[];
  pipeline: GovernancePipelineStage[];
  parliamentRosters: GovernanceParliamentRoster[];
  parliamentOutcomes: GovernanceParliamentOutcome[];
  currentHeight: string | null;
  finalizationEvidence: GovernanceFinalizationEvidence | null;
  enactedAtHeight: string | null;
  raw: Record<string, unknown>;
}

export interface GovernanceProposalList {
  items: GovernanceProposalSummary[];
  nextCursor: string | null;
}

export interface GovernanceProposalKindAdapter {
  id: GovernanceProposalKindId;
  labelKey: string;
  descriptionKey: string;
  composer:
    | "deploy"
    | "runtime"
    | "sccp"
    | "validation-fee-lifecycle"
    | "validation-fee"
    | null;
  readOnly: boolean;
}

export const GOVERNANCE_KIND_ADAPTERS: Readonly<
  Record<GovernanceProposalKindId, GovernanceProposalKindAdapter>
> = Object.freeze({
  DeployContract: {
    id: "DeployContract",
    labelKey: "Contract deployment",
    descriptionKey: "Deploy a reviewed IVM contract by immutable hashes.",
    composer: null,
    readOnly: true,
  },
  RuntimeUpgrade: {
    id: "RuntimeUpgrade",
    labelKey: "Runtime upgrade",
    descriptionKey: "Schedule a canonical runtime upgrade manifest.",
    composer: null,
    readOnly: true,
  },
  SccpRouteGovernance: {
    id: "SccpRouteGovernance",
    labelKey: "SCCP route",
    descriptionKey: "Apply one closed SCCP route-registry action.",
    composer: null,
    readOnly: true,
  },
  ValidationFeePayoutLifecycle: {
    id: "ValidationFeePayoutLifecycle",
    labelKey: "Validation fee payout lifecycle",
    descriptionKey:
      "Authorize the exact immutable treasury payout binding before proposing its fee policy.",
    composer: "validation-fee-lifecycle",
    readOnly: false,
  },
  ValidationFeePolicy: {
    id: "ValidationFeePolicy",
    labelKey: "Validation fee policy",
    descriptionKey:
      "Set the typed validation fee policy through citizen and Parliament approval.",
    composer: "validation-fee",
    readOnly: false,
  },
  Unknown: {
    id: "Unknown",
    labelKey: "Unknown proposal type",
    descriptionKey:
      "This wallet can inspect this proposal but cannot act on its payload.",
    composer: null,
    readOnly: true,
  },
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const exactRecord = (
  value: unknown,
  expectedKeys: readonly string[],
  label: string,
): Record<string, unknown> => {
  if (!isRecord(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw new TypeError(
      `${label} must contain exactly ${expected.join(", ")}.`,
    );
  }
  return value;
};

const exactNonEmptyText = (value: unknown, label: string): string => {
  if (typeof value !== "string" || !value || value.trim() !== value) {
    throw new TypeError(`${label} must be canonical non-empty text.`);
  }
  return value;
};

const exactCanonicalInteger = (value: unknown, label: string): string => {
  if (typeof value !== "string" || !/^(?:0|[1-9]\d*)$/u.test(value)) {
    throw new TypeError(
      `${label} must be a complete canonical decimal integer string.`,
    );
  }
  return value;
};

const exactCanonicalPositiveInteger = (
  value: unknown,
  label: string,
): string => {
  const literal = exactCanonicalInteger(value, label);
  if (literal === "0") {
    throw new TypeError(`${label} must be positive.`);
  }
  return literal;
};

const GOVERNANCE_U128_MAX = (1n << 128n) - 1n;
const GOVERNANCE_U64_MAX = (1n << 64n) - 1n;
const GOVERNANCE_U32_MAX = (1n << 32n) - 1n;
const GOVERNANCE_PLAIN_MIN_TURNOUT = "1";
const GOVERNANCE_PLAIN_APPROVAL_THRESHOLD_NUMERATOR = "1";
const GOVERNANCE_PLAIN_APPROVAL_THRESHOLD_DENOMINATOR = "2";
const CBSI_SBD_ASSET_DEFINITION_ID = "7ZepsJTHCVLKsrFFNZGSRGZgvBhv";

const exactCanonicalBoundedInteger = (
  value: unknown,
  label: string,
  maximum: bigint,
  typeName: "u32" | "u64" | "u128",
): string => {
  const literal = exactCanonicalInteger(value, label);
  if (BigInt(literal) > maximum) {
    throw new TypeError(`${label} exceeds ${typeName}.`);
  }
  return literal;
};

const exactCanonicalU128 = (value: unknown, label: string): string =>
  exactCanonicalBoundedInteger(value, label, GOVERNANCE_U128_MAX, "u128");

const exactCanonicalU64 = (value: unknown, label: string): string =>
  exactCanonicalBoundedInteger(value, label, GOVERNANCE_U64_MAX, "u64");

const exactCanonicalU32 = (value: unknown, label: string): string =>
  exactCanonicalBoundedInteger(value, label, GOVERNANCE_U32_MAX, "u32");

const checkedGovernanceU128Add = (
  left: bigint,
  right: bigint,
  label: string,
): bigint => {
  const result = left + right;
  if (result > GOVERNANCE_U128_MAX) {
    throw new TypeError(`${label} overflows u128.`);
  }
  return result;
};

const exactCanonicalDecimal = (value: unknown, label: string): string => {
  if (typeof value !== "string" || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(value)) {
    throw new TypeError(`${label} must be a complete canonical decimal.`);
  }
  return value;
};

const exactJsonNonNegativeInteger = (value: unknown, label: string): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative JSON integer.`);
  }
  return value;
};

const exactJsonU32 = (value: unknown, label: string): number => {
  const integer = exactJsonNonNegativeInteger(value, label);
  if (integer > Number(GOVERNANCE_U32_MAX)) {
    throw new TypeError(`${label} exceeds u32.`);
  }
  return integer;
};

const exactNullableCanonicalU64 = (
  value: unknown,
  label: string,
): string | null => {
  if (value === null) return null;
  return exactCanonicalU64(value, label);
};

const exactNullableText = (value: unknown, label: string): string | null => {
  if (value === null) return null;
  return exactNonEmptyText(value, label);
};

const exactStringArray = (value: unknown, label: string): string[] => {
  if (!Array.isArray(value)) {
    throw new TypeError(`${label} must be an array.`);
  }
  return value.map((entry, index) =>
    exactNonEmptyText(entry, `${label}[${index}]`),
  );
};

const exactHex32 = (value: unknown, label: string): string => {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/u.test(value)) {
    throw new TypeError(
      `${label} must be exactly 64 lowercase hexadecimal digits.`,
    );
  }
  return value;
};

const exactUpperHex32 = (value: unknown, label: string): string => {
  if (typeof value !== "string" || !/^[0-9A-F]{64}$/u.test(value)) {
    throw new TypeError(
      `${label} must be exactly 64 uppercase hexadecimal digits.`,
    );
  }
  return value;
};

export const canonicalGovernanceProposalId = (
  value: unknown,
): string | null => {
  if (typeof value !== "string") return null;
  const literal = value.trim().toLowerCase().replace(/^0x/u, "");
  return /^[0-9a-f]{64}$/u.test(literal) ? `0x${literal}` : null;
};

export const canonicalValidationFeeHash = (value: unknown): string | null =>
  typeof value === "string" && /^[0-9a-f]{64}$/u.test(value) ? value : null;

const exactParliamentBody = (
  value: unknown,
  label: string,
): GovernanceParliamentBody => {
  if (
    typeof value !== "string" ||
    !GOVERNANCE_PARLIAMENT_BODIES.includes(value as GovernanceParliamentBody)
  ) {
    throw new TypeError(`${label} must be an exact Parliament body name.`);
  }
  return value as GovernanceParliamentBody;
};

const exactValidationFeePayoutBinding = (
  value: unknown,
  label: string,
): Record<string, unknown> => {
  const binding = exactRecord(
    value,
    [
      "batch_sbd",
      "code_hash",
      "contract_address",
      "entrypoint",
      "max_xor_out",
      "min_xor_out",
      "pool_vault_account_id",
      "recipients",
      "sbd_asset_id",
      "treasury_account_id",
      "xor_asset_id",
    ],
    label,
  );
  exactNonEmptyText(binding.contract_address, `${label}.contract_address`);
  const entrypoint = exactNonEmptyText(
    binding.entrypoint,
    `${label}.entrypoint`,
  );
  const treasuryAccountId = exactNonEmptyText(
    binding.treasury_account_id,
    `${label}.treasury_account_id`,
  );
  const sbdAssetId = exactNonEmptyText(
    binding.sbd_asset_id,
    `${label}.sbd_asset_id`,
  );
  if (sbdAssetId !== CBSI_SBD_ASSET_DEFINITION_ID) {
    throw new TypeError(
      `${label}.sbd_asset_id must be the exact CBSI SBD asset definition ID.`,
    );
  }
  const xorAssetId = exactNonEmptyText(
    binding.xor_asset_id,
    `${label}.xor_asset_id`,
  );
  const poolVaultAccountId = exactNonEmptyText(
    binding.pool_vault_account_id,
    `${label}.pool_vault_account_id`,
  );
  const codeHash = exactUpperHex32(binding.code_hash, `${label}.code_hash`);
  if (/^0+$/u.test(codeHash)) {
    throw new TypeError(`${label}.code_hash must be non-zero.`);
  }
  const batchSbd = exactCanonicalDecimal(
    binding.batch_sbd,
    `${label}.batch_sbd`,
  );
  const minXorOut = exactCanonicalDecimal(
    binding.min_xor_out,
    `${label}.min_xor_out`,
  );
  const maxXorOut = exactCanonicalDecimal(
    binding.max_xor_out,
    `${label}.max_xor_out`,
  );
  if (
    entrypoint !== "autonomous_validation_fee_tick" ||
    batchSbd !== "10" ||
    minXorOut !== "4" ||
    maxXorOut !== "100"
  ) {
    throw new TypeError(
      `${label} must use the exact first-release entrypoint and payout bounds.`,
    );
  }
  if (!Array.isArray(binding.recipients) || binding.recipients.length !== 4) {
    throw new TypeError(
      `${label}.recipients must contain exactly four entries.`,
    );
  }
  const recipientAccounts = binding.recipients.map((entry, index) => {
    const recipient = exactRecord(
      entry,
      ["account_id", "share"],
      `${label}.recipients[${index}]`,
    );
    const accountId = exactNonEmptyText(
      recipient.account_id,
      `${label}.recipients[${index}].account_id`,
    );
    const share = exactCanonicalDecimal(
      recipient.share,
      `${label}.recipients[${index}].share`,
    );
    if (share !== "0.25") {
      throw new TypeError(
        `${label}.recipients must each receive exactly 0.25.`,
      );
    }
    return accountId;
  });
  if (
    new Set(recipientAccounts).size !== recipientAccounts.length ||
    treasuryAccountId === poolVaultAccountId ||
    sbdAssetId === xorAssetId ||
    recipientAccounts.includes(treasuryAccountId) ||
    recipientAccounts.includes(poolVaultAccountId)
  ) {
    throw new TypeError(
      `${label} treasury, vault, assets, and recipients must be distinct.`,
    );
  }
  return binding;
};

const exactValidationFeePlainElectorateRules = (
  value: unknown,
  label: string,
): ValidationFeePlainElectorateRulesPayload => {
  const rules = exactRecord(
    value,
    [
      "approval_threshold_denominator",
      "approval_threshold_numerator",
      "ballot_amount",
      "ballot_duration_blocks",
      "bond_escrow_account",
      "citizenship_amount",
      "conviction_step_blocks",
      "eligibility_rule",
      "max_conviction",
      "max_members",
      "min_turnout",
      "slash_receiver_account",
      "voting_asset_id",
    ],
    label,
  );
  const eligibility = exactRecord(
    rules.eligibility_rule,
    ["rule", "value"],
    `${label}.eligibility_rule`,
  );
  if (
    rules.voting_asset_id !== VALIDATION_FEE_PLAIN_VOTING_ASSET_ID ||
    rules.ballot_amount !== "150" ||
    rules.ballot_duration_blocks !== "3600" ||
    rules.citizenship_amount !== "10000" ||
    rules.max_members !== "256" ||
    rules.conviction_step_blocks !== "100" ||
    rules.max_conviction !== "6" ||
    rules.min_turnout !== "1" ||
    rules.approval_threshold_numerator !== "1" ||
    rules.approval_threshold_denominator !== "2" ||
    eligibility.rule !==
      "proposal_operator_at_or_before_gate_others_after_gate" ||
    eligibility.value !== null
  ) {
    throw new TypeError(
      `${label} must equal the exact first-release PLAIN electorate contract.`,
    );
  }
  return {
    voting_asset_id: VALIDATION_FEE_PLAIN_VOTING_ASSET_ID,
    bond_escrow_account: exactNonEmptyText(
      rules.bond_escrow_account,
      `${label}.bond_escrow_account`,
    ),
    slash_receiver_account: exactNonEmptyText(
      rules.slash_receiver_account,
      `${label}.slash_receiver_account`,
    ),
    ballot_amount: "150",
    ballot_duration_blocks: "3600",
    citizenship_amount: "10000",
    max_members: "256",
    conviction_step_blocks: "100",
    max_conviction: "6",
    min_turnout: "1",
    approval_threshold_numerator: "1",
    approval_threshold_denominator: "2",
    eligibility_rule: {
      rule: "proposal_operator_at_or_before_gate_others_after_gate",
      value: null,
    },
  };
};

export const normalizeGovernanceProposalKind = (
  raw: unknown,
): GovernanceProposalKind => {
  const envelope = exactRecord(
    raw,
    ["kind", "payload"],
    "Governance proposal kind",
  );
  const variant = exactNonEmptyText(
    envelope.kind,
    "Governance proposal kind.kind",
  );
  if (!isRecord(envelope.payload)) {
    throw new TypeError("Governance proposal kind.payload must be an object.");
  }
  const payload = envelope.payload;
  if (variant === "DeployContract") {
    const source = exactRecord(
      payload,
      [
        "abi_hash_hex",
        "abi_version",
        "code_hash_hex",
        "contract_address",
        "manifest_provenance",
      ],
      "DeployContract proposal payload",
    );
    return {
      type: "DeployContract",
      contractAddress: exactNonEmptyText(
        source.contract_address,
        "DeployContract proposal payload.contract_address",
      ),
      codeHash: exactHex32(
        source.code_hash_hex,
        "DeployContract proposal payload.code_hash_hex",
      ),
      abiHash: exactHex32(
        source.abi_hash_hex,
        "DeployContract proposal payload.abi_hash_hex",
      ),
      abiVersion: String(
        exactJsonNonNegativeInteger(
          source.abi_version,
          "DeployContract proposal payload.abi_version",
        ),
      ),
      raw: envelope,
    };
  }
  if (variant === "RuntimeUpgrade") {
    const source = exactRecord(
      payload,
      ["manifest"],
      "RuntimeUpgrade proposal payload",
    );
    if (!isRecord(source.manifest)) {
      throw new TypeError(
        "RuntimeUpgrade proposal payload.manifest must be an object.",
      );
    }
    return {
      type: "RuntimeUpgrade",
      manifest: source.manifest,
      raw: envelope,
    };
  }
  if (variant === "SccpRouteGovernance") {
    const source = exactRecord(
      payload,
      ["action"],
      "SccpRouteGovernance proposal payload",
    );
    if (!isRecord(source.action)) {
      throw new TypeError(
        "SccpRouteGovernance proposal payload.action must be an object.",
      );
    }
    return {
      type: "SccpRouteGovernance",
      action: source.action,
      raw: envelope,
    };
  }
  if (variant === "ValidationFeePolicy") {
    const source = exactRecord(
      payload,
      ["payout_lifecycle_proposal_id", "plain_electorate_rules", "policy"],
      "ValidationFeePolicy proposal payload",
    );
    const payoutLifecycleProposalId =
      source.payout_lifecycle_proposal_id === null
        ? null
        : exactUpperHex32(
            source.payout_lifecycle_proposal_id,
            "ValidationFeePolicy proposal payload.payout_lifecycle_proposal_id",
          );
    if (
      payoutLifecycleProposalId !== null &&
      /^0+$/u.test(payoutLifecycleProposalId)
    ) {
      throw new TypeError(
        "ValidationFeePolicy proposal payout lifecycle ID must be non-zero.",
      );
    }
    const policy = normalizeValidationFeePolicy(source.policy);
    if (
      (policy.treasury_payout_binding !== null) !==
      (payoutLifecycleProposalId !== null)
    ) {
      throw new TypeError(
        "ValidationFeePolicy proposal must select a lifecycle proposal exactly when its payout binding is present.",
      );
    }
    return {
      type: "ValidationFeePolicy",
      policy,
      payoutLifecycleProposalId,
      plainElectorateRules: exactValidationFeePlainElectorateRules(
        source.plain_electorate_rules,
        "ValidationFeePolicy proposal payload.plain_electorate_rules",
      ),
      raw: envelope,
    };
  }
  if (variant === "ValidationFeePayoutLifecycle") {
    const source = exactRecord(
      payload,
      ["payout_binding", "plain_electorate_rules"],
      "ValidationFeePayoutLifecycle proposal payload",
    );
    return {
      type: "ValidationFeePayoutLifecycle",
      payoutBinding: exactValidationFeePayoutBinding(
        source.payout_binding,
        "ValidationFeePayoutLifecycle proposal payload.payout_binding",
      ),
      plainElectorateRules: exactValidationFeePlainElectorateRules(
        source.plain_electorate_rules,
        "ValidationFeePayoutLifecycle proposal payload.plain_electorate_rules",
      ),
      raw: envelope,
    };
  }
  return {
    type: "Unknown",
    variant,
    raw: envelope,
  };
};

export const normalizeValidationFeePolicy = (
  raw: unknown,
): ValidationFeePolicyPayload => {
  if (!isRecord(raw)) {
    throw new Error("Validation-fee policy must be an object.");
  }
  const policy = raw;
  const expectedKeys = [
    "chain_id",
    "charging_mode",
    "ds_asset_id",
    "ds_scale",
    "effective_from_height",
    "exemption_classes",
    "expires_after_height",
    "fee",
    "genesis_hash",
    "policy_version",
    "previous_policy_hash",
    "schema_version",
    "treasury_account_id",
    "treasury_payout_binding",
  ];
  const actualKeys = Object.keys(policy).sort();
  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key, index) => key !== expectedKeys[index])
  ) {
    throw new Error(
      `Validation-fee policy must contain exactly ${expectedKeys.join(", ")}.`,
    );
  }
  if (!isRecord(policy.charging_mode)) {
    throw new Error("Validation-fee charging mode must be an object.");
  }
  const chargingModeKeys = Object.keys(policy.charging_mode).sort();
  if (
    chargingModeKeys.length !== 2 ||
    chargingModeKeys[0] !== "charging_mode" ||
    chargingModeKeys[1] !== "value" ||
    policy.charging_mode.charging_mode !==
      "PER_QUALIFYING_TRANSFER_INSTRUCTION" ||
    policy.charging_mode.value !== null
  ) {
    throw new Error(
      "Validation-fee charging mode must be the exact enabled first-release mode.",
    );
  }
  const genesisHash = exactUpperHex32(
    policy.genesis_hash,
    "Validation-fee genesis hash",
  );
  if (/^0+$/u.test(genesisHash)) {
    throw new TypeError("Validation-fee genesis hash must be non-zero.");
  }
  const previousPolicyHash =
    policy.previous_policy_hash === null
      ? null
      : exactUpperHex32(
          policy.previous_policy_hash,
          "Validation-fee previous policy hash",
        );
  if (policy.schema_version !== 1) {
    throw new Error("Validation-fee policy schema version must be 1.");
  }
  if (
    typeof policy.ds_scale !== "number" ||
    !Number.isInteger(policy.ds_scale) ||
    policy.ds_scale < 0 ||
    policy.ds_scale > 0xff
  ) {
    throw new Error(
      "Validation-fee policy asset scale must be an exact uint8 JSON integer.",
    );
  }
  if (
    !Array.isArray(policy.exemption_classes) ||
    policy.exemption_classes.some(
      (entry) => typeof entry !== "string" || !entry || entry.trim() !== entry,
    )
  ) {
    throw new Error(
      "Validation-fee policy must use the exact native V1 field types.",
    );
  }
  const chainId = exactNonEmptyText(policy.chain_id, "Validation-fee chain ID");
  const policyVersion = exactCanonicalPositiveInteger(
    policy.policy_version,
    "Validation-fee policy version",
  );
  exactCanonicalU64(policyVersion, "Validation-fee policy version");
  if (policyVersion === "1" && previousPolicyHash !== null) {
    throw new TypeError(
      "Initial validation-fee policy must not bind a previous policy hash.",
    );
  }
  if (policyVersion !== "1" && previousPolicyHash === null) {
    throw new TypeError(
      "Successor validation-fee policy must bind a previous policy hash.",
    );
  }
  if (previousPolicyHash !== null && /^0+$/u.test(previousPolicyHash)) {
    throw new TypeError(
      "Validation-fee previous policy hash must be non-zero.",
    );
  }
  const dsAssetId = exactNonEmptyText(
    policy.ds_asset_id,
    "Validation-fee fee asset",
  );
  if (dsAssetId !== CBSI_SBD_ASSET_DEFINITION_ID) {
    throw new TypeError(
      "Validation-fee fee asset must be the exact CBSI SBD asset definition ID.",
    );
  }
  const treasuryAccountId = exactNonEmptyText(
    policy.treasury_account_id,
    "Validation-fee treasury account",
  );
  const fee = exactCanonicalDecimal(policy.fee, "Validation-fee amount");
  if (policy.ds_scale !== 2 || fee !== "0.1") {
    throw new TypeError(
      "Validation-fee policy must encode the exact first-release 0.10 SBD amount at scale 2.",
    );
  }
  const effectiveFromHeight = exactCanonicalPositiveInteger(
    policy.effective_from_height,
    "Validation-fee effective height",
  );
  const expiresAfterHeight =
    policy.expires_after_height === null
      ? null
      : exactCanonicalPositiveInteger(
          policy.expires_after_height,
          "Validation-fee expiry height",
        );
  exactCanonicalU64(effectiveFromHeight, "Validation-fee effective height");
  if (expiresAfterHeight !== null) {
    exactCanonicalU64(expiresAfterHeight, "Validation-fee expiry height");
    if (BigInt(expiresAfterHeight) <= BigInt(effectiveFromHeight)) {
      throw new TypeError(
        "Validation-fee policy expiry must be strictly after its effective height.",
      );
    }
  }
  const treasuryPayoutBinding =
    policy.treasury_payout_binding === null
      ? null
      : exactValidationFeePayoutBinding(
          policy.treasury_payout_binding,
          "Validation-fee treasury payout binding",
        );
  const payoutEnabled = treasuryPayoutBinding !== null;
  if (
    policy.exemption_classes.length !== (payoutEnabled ? 1 : 0) ||
    (payoutEnabled && policy.exemption_classes[0] !== "TREASURY_PAYOUT")
  ) {
    throw new TypeError(
      "Validation-fee policy must bind exactly the TREASURY_PAYOUT exemption iff its exact payout binding is present.",
    );
  }
  if (
    treasuryPayoutBinding !== null &&
    (treasuryPayoutBinding.treasury_account_id !== treasuryAccountId ||
      treasuryPayoutBinding.sbd_asset_id !== dsAssetId)
  ) {
    throw new TypeError(
      "Validation-fee payout binding must use the policy treasury and fee asset.",
    );
  }
  return {
    schema_version: 1,
    chain_id: chainId,
    genesis_hash: genesisHash,
    policy_version: policyVersion,
    previous_policy_hash: previousPolicyHash,
    ds_asset_id: dsAssetId,
    ds_scale: policy.ds_scale,
    fee,
    treasury_account_id: treasuryAccountId,
    charging_mode: {
      charging_mode: "PER_QUALIFYING_TRANSFER_INSTRUCTION",
      value: null,
    },
    effective_from_height: effectiveFromHeight,
    expires_after_height: expiresAfterHeight,
    exemption_classes: [...policy.exemption_classes] as string[],
    treasury_payout_binding: treasuryPayoutBinding,
  };
};

const exactProposalStatus = (value: unknown): GovernanceProposalStatus => {
  const status = exactRecord(
    value,
    ["status", "value"],
    "Governance proposal status",
  );
  if (status.value !== null) {
    throw new TypeError("Governance proposal status.value must be null.");
  }
  const variants: Readonly<Record<string, GovernanceProposalStatus>> = {
    PROPOSED: "Proposed",
    APPROVED: "Approved",
    REJECTED: "Rejected",
    ENACTED: "Enacted",
    SUPERSEDED: "Superseded",
  };
  if (typeof status.status !== "string" || !variants[status.status]) {
    throw new TypeError(
      "Governance proposal status.status is outside the V1 contract.",
    );
  }
  return variants[status.status];
};

const exactVotingMode = (
  value: unknown,
  label: string,
): GovernanceVotingMode => {
  if (value !== "Plain") {
    throw new TypeError(
      `${label} must be Plain in the first-release contract.`,
    );
  }
  return "Plain";
};

const normalizeReferendum = (
  raw: unknown,
  proposalId: string,
): GovernanceReferendum => {
  const referendum = exactRecord(
    raw,
    ["closed", "mode", "opened", "window"],
    "Governance proposal referendum",
  );
  const window = exactRecord(
    referendum.window,
    ["lower", "upper"],
    "Governance proposal referendum.window",
  );
  if (
    typeof referendum.opened !== "boolean" ||
    typeof referendum.closed !== "boolean"
  ) {
    throw new TypeError(
      "Governance proposal referendum opened/closed flags must be booleans.",
    );
  }
  if (referendum.closed && !referendum.opened) {
    throw new TypeError(
      "Governance proposal referendum cannot be closed before it is opened.",
    );
  }
  const hStart = exactCanonicalU64(
    window.lower,
    "Governance proposal referendum.window.lower",
  );
  const hEnd = exactCanonicalU64(
    window.upper,
    "Governance proposal referendum.window.upper",
  );
  if (BigInt(hEnd) < BigInt(hStart)) {
    throw new TypeError(
      "Governance proposal referendum window ends before it starts.",
    );
  }
  return {
    id: proposalId,
    hStart,
    hEnd,
    status: referendum.closed
      ? "Closed"
      : referendum.opened
        ? "Open"
        : "Proposed",
    mode: exactVotingMode(
      referendum.mode,
      "Governance proposal referendum.mode",
    ),
  };
};

const normalizePipeline = (raw: unknown): GovernancePipelineStage[] => {
  const pipeline = exactRecord(raw, ["stages"], "Governance proposal pipeline");
  if (
    !Array.isArray(pipeline.stages) ||
    pipeline.stages.length !== GOVERNANCE_PIPELINE_STAGES.length
  ) {
    throw new TypeError(
      "Governance proposal pipeline.stages must contain the exact seven V1 stages.",
    );
  }
  return pipeline.stages.map((item, index) => {
    const label = `Governance proposal pipeline.stages[${index}]`;
    const record = exactRecord(
      item,
      ["completed_at", "deadline", "failure", "stage", "started_at"],
      label,
    );
    const stage = GOVERNANCE_PIPELINE_STAGES[index];
    if (record.stage !== stage) {
      throw new TypeError(
        `${label}.stage must be ${stage} in the V1 pipeline order.`,
      );
    }
    const failure = exactNullableText(record.failure, `${label}.failure`);
    if (
      failure !== null &&
      failure !== "DeadlineMissed" &&
      failure !== "MissingReferendum" &&
      failure !== "EnactmentOverdue"
    ) {
      throw new TypeError(`${label}.failure is outside the V1 contract.`);
    }
    const completedAt = exactNullableCanonicalU64(
      record.completed_at,
      `${label}.completed_at`,
    );
    if (failure !== null && completedAt === null) {
      throw new TypeError(`${label} failed without a completion height.`);
    }
    return {
      stage,
      startedAt: exactCanonicalU64(record.started_at, `${label}.started_at`),
      deadline: exactNullableCanonicalU64(record.deadline, `${label}.deadline`),
      completedAt,
      failure,
    };
  });
};

const currentPipelineStage = (
  pipeline: GovernancePipelineStage[],
): GovernancePipelineStageName => {
  const failed = pipeline.find((stage) => stage.failure);
  if (failed) return failed.stage;
  const pending = pipeline.find((stage) => !stage.completedAt);
  return pending?.stage ?? "Enact";
};

const normalizeRosters = (raw: unknown): GovernanceParliamentRoster[] => {
  const snapshot = exactRecord(
    raw,
    ["beacon", "bodies", "roster_root", "selection_epoch"],
    "Governance proposal Parliament snapshot",
  );
  const selectionEpoch = exactCanonicalU64(
    snapshot.selection_epoch,
    "Governance proposal Parliament snapshot.selection_epoch",
  );
  exactUpperHex32(
    snapshot.beacon,
    "Governance proposal Parliament snapshot.beacon",
  );
  exactUpperHex32(
    snapshot.roster_root,
    "Governance proposal Parliament snapshot.roster_root",
  );
  const bodies = exactRecord(
    snapshot.bodies,
    ["rosters", "selection_epoch"],
    "Governance proposal Parliament snapshot.bodies",
  );
  const bodiesEpoch = exactJsonNonNegativeInteger(
    bodies.selection_epoch,
    "Governance proposal Parliament snapshot.bodies.selection_epoch",
  );
  if (String(bodiesEpoch) !== selectionEpoch) {
    throw new TypeError(
      "Governance proposal Parliament snapshot selection epochs differ.",
    );
  }
  const rosterMap = exactRecord(
    bodies.rosters,
    GOVERNANCE_PARLIAMENT_BODIES,
    "Governance proposal Parliament snapshot.bodies.rosters",
  );
  return GOVERNANCE_PARLIAMENT_BODIES.map((body) => {
    const label = `Governance proposal Parliament roster ${body}`;
    const roster = exactRecord(
      rosterMap[body],
      [
        "alternates",
        "body",
        "candidate_count",
        "derived_by",
        "epoch",
        "members",
        "verified",
      ],
      label,
    );
    if (exactParliamentBody(roster.body, `${label}.body`) !== body) {
      throw new TypeError(`${label}.body does not match its roster map key.`);
    }
    const epoch = exactJsonNonNegativeInteger(roster.epoch, `${label}.epoch`);
    if (epoch !== bodiesEpoch) {
      throw new TypeError(`${label}.epoch differs from the snapshot epoch.`);
    }
    const verified = exactJsonU32(roster.verified, `${label}.verified`);
    const candidateCount = exactJsonU32(
      roster.candidate_count,
      `${label}.candidate_count`,
    );
    if (roster.derived_by !== "Vrf" && roster.derived_by !== "Fallback") {
      throw new TypeError(`${label}.derived_by is outside the V1 contract.`);
    }
    const members = exactStringArray(roster.members, `${label}.members`);
    const alternates = exactStringArray(
      roster.alternates,
      `${label}.alternates`,
    );
    const allAccounts = [...members, ...alternates];
    if (new Set(allAccounts).size !== allAccounts.length) {
      throw new TypeError(
        `${label} members and alternates must be unique and disjoint.`,
      );
    }
    if (verified > candidateCount || allAccounts.length > candidateCount) {
      throw new TypeError(
        `${label} counts must be bounded by candidate_count.`,
      );
    }
    if (roster.derived_by === "Fallback" && verified !== 0) {
      throw new TypeError(
        `${label} fallback derivation must have zero verified proofs.`,
      );
    }
    return {
      body,
      members,
      alternates,
    };
  });
};

const stringArraysEqual = (
  left: readonly string[],
  right: readonly string[],
): boolean =>
  left.length === right.length &&
  left.every((value, index) => value === right[index]);

const normalizeOutcomes = (
  raw: unknown,
  rosters: readonly GovernanceParliamentRoster[],
): GovernanceParliamentOutcome[] => {
  if (
    !Array.isArray(raw) ||
    raw.length !== GOVERNANCE_PARLIAMENT_BODIES.length
  ) {
    throw new TypeError(
      "Governance proposal body_progress must contain all seven V1 bodies.",
    );
  }
  return raw.map((item, index) => {
    const label = `Governance proposal body_progress[${index}]`;
    const progress = exactRecord(
      item,
      [
        "abstain",
        "alternates",
        "approval_quorum_met",
        "approve",
        "body",
        "current_account_decision",
        "members",
        "reject",
        "rejection_quorum_met",
        "required",
      ],
      label,
    );
    const body = exactParliamentBody(progress.body, `${label}.body`);
    if (body !== GOVERNANCE_PARLIAMENT_BODIES[index]) {
      throw new TypeError(`${label}.body is outside the V1 body order.`);
    }
    const roster = rosters[index];
    const members = exactStringArray(progress.members, `${label}.members`);
    const alternates = exactStringArray(
      progress.alternates,
      `${label}.alternates`,
    );
    if (
      !roster ||
      roster.body !== body ||
      !stringArraysEqual(members, roster.members) ||
      !stringArraysEqual(alternates, roster.alternates)
    ) {
      throw new TypeError(
        `${label} differs from the proposal snapshot roster.`,
      );
    }
    if (
      typeof progress.approval_quorum_met !== "boolean" ||
      typeof progress.rejection_quorum_met !== "boolean"
    ) {
      throw new TypeError(`${label} quorum flags must be booleans.`);
    }
    const decision = progress.current_account_decision;
    if (
      decision !== null &&
      decision !== "APPROVE" &&
      decision !== "REJECT" &&
      decision !== "ABSTAIN"
    ) {
      throw new TypeError(
        `${label}.current_account_decision is outside the V1 contract.`,
      );
    }
    const required = exactCanonicalU32(progress.required, `${label}.required`);
    const approvals = exactCanonicalU32(progress.approve, `${label}.approve`);
    const rejections = exactCanonicalU32(progress.reject, `${label}.reject`);
    const abstentions = exactCanonicalU32(progress.abstain, `${label}.abstain`);
    const memberCount = BigInt(members.length);
    const requiredCount = BigInt(required);
    const approvalCount = BigInt(approvals);
    const rejectionCount = BigInt(rejections);
    const abstentionCount = BigInt(abstentions);
    if (
      requiredCount > memberCount ||
      approvalCount + rejectionCount + abstentionCount > memberCount
    ) {
      throw new TypeError(`${label} vote counts exceed the seated roster.`);
    }
    if (
      progress.approval_quorum_met !== approvalCount >= requiredCount ||
      progress.rejection_quorum_met !==
        (requiredCount > 0n && rejectionCount >= requiredCount)
    ) {
      throw new TypeError(`${label} quorum flags differ from exact counts.`);
    }
    if (
      (decision === "APPROVE" && approvalCount === 0n) ||
      (decision === "REJECT" && rejectionCount === 0n) ||
      (decision === "ABSTAIN" && abstentionCount === 0n)
    ) {
      throw new TypeError(
        `${label}.current_account_decision has no matching recorded vote.`,
      );
    }
    return {
      body,
      approvals,
      rejections,
      abstentions,
      required,
      currentAccountDecision:
        decision === null
          ? null
          : (decision.toLowerCase() as GovernanceParliamentDecision),
    };
  });
};

const normalizeLocks = (raw: unknown): GovernanceLock[] => {
  const envelope = exactRecord(raw, ["locks"], "Governance proposal locks");
  if (!isRecord(envelope.locks)) {
    throw new TypeError("Governance proposal locks.locks must be an object.");
  }
  return Object.entries(envelope.locks).map(([key, value]) => {
    const mapOwner = exactNonEmptyText(
      key,
      "Governance proposal lock map owner",
    );
    const label = `Governance proposal lock ${mapOwner}`;
    const lock = exactRecord(
      value,
      [
        "amount",
        "direction",
        "duration_blocks",
        "expiry_height",
        "owner",
        "slashed",
      ],
      label,
    );
    const owner = exactNonEmptyText(lock.owner, `${label}.owner`);
    if (owner !== mapOwner) {
      throw new TypeError(`${label}.owner differs from its map key.`);
    }
    if (
      lock.direction !== "Aye" &&
      lock.direction !== "Nay" &&
      lock.direction !== "Abstain"
    ) {
      throw new TypeError(`${label}.direction is outside the V1 contract.`);
    }
    exactCanonicalDecimal(lock.slashed, `${label}.slashed`);
    return {
      owner,
      amount: exactCanonicalDecimal(lock.amount, `${label}.amount`),
      expiryHeight: exactCanonicalU64(
        lock.expiry_height,
        `${label}.expiry_height`,
      ),
      direction: lock.direction,
      durationBlocks: exactCanonicalU64(
        lock.duration_blocks,
        `${label}.duration_blocks`,
      ),
    };
  });
};

const normalizeTally = (raw: unknown): GovernanceTally => {
  const tally = exactRecord(
    raw,
    [
      "abstain",
      "approval_threshold_denominator",
      "approval_threshold_numerator",
      "approve",
      "approved",
      "min_turnout",
      "reject",
      "turnout",
    ],
    "Governance proposal tally",
  );
  if (tally.approved !== null && typeof tally.approved !== "boolean") {
    throw new TypeError(
      "Governance proposal tally.approved must be boolean or null.",
    );
  }
  const approve = exactCanonicalU128(
    tally.approve,
    "Governance proposal tally.approve",
  );
  const reject = exactCanonicalU128(
    tally.reject,
    "Governance proposal tally.reject",
  );
  const abstain = exactCanonicalU128(
    tally.abstain,
    "Governance proposal tally.abstain",
  );
  const turnout = exactCanonicalU128(
    tally.turnout,
    "Governance proposal tally.turnout",
  );
  const minTurnout = exactCanonicalU128(
    tally.min_turnout,
    "Governance proposal tally.min_turnout",
  );
  const approvalThresholdNumerator = exactCanonicalU64(
    tally.approval_threshold_numerator,
    "Governance proposal tally.approval_threshold_numerator",
  );
  const approvalThresholdDenominator = exactCanonicalU64(
    tally.approval_threshold_denominator,
    "Governance proposal tally.approval_threshold_denominator",
  );
  if (
    minTurnout !== GOVERNANCE_PLAIN_MIN_TURNOUT ||
    approvalThresholdNumerator !==
      GOVERNANCE_PLAIN_APPROVAL_THRESHOLD_NUMERATOR ||
    approvalThresholdDenominator !==
      GOVERNANCE_PLAIN_APPROVAL_THRESHOLD_DENOMINATOR
  ) {
    throw new TypeError(
      "Governance proposal tally differs from the exact first-release PLAIN rules.",
    );
  }
  const recomputedTurnout = checkedGovernanceU128Add(
    checkedGovernanceU128Add(
      BigInt(approve),
      BigInt(reject),
      "Governance proposal tally aggregation",
    ),
    BigInt(abstain),
    "Governance proposal tally aggregation",
  );
  if (BigInt(turnout) !== recomputedTurnout) {
    throw new TypeError(
      "Governance proposal tally.turnout differs from its checked aggregation.",
    );
  }
  const weightedApprove =
    BigInt(approve) * BigInt(approvalThresholdDenominator);
  const weightedTurnout =
    recomputedTurnout * BigInt(approvalThresholdNumerator);
  const recomputedApproval =
    recomputedTurnout >= BigInt(minTurnout) &&
    weightedApprove >= weightedTurnout;
  if (tally.approved !== null && tally.approved !== recomputedApproval) {
    throw new TypeError(
      "Governance proposal tally.approved differs from its checked arithmetic.",
    );
  }
  return {
    approve,
    reject,
    abstain,
    turnout,
    minTurnout,
    approvalThresholdNumerator,
    approvalThresholdDenominator,
    approved: tally.approved,
  };
};

const normalizeFinalizationEvidence = (
  raw: unknown,
  proposalId: string,
  referendum: GovernanceReferendum,
): GovernanceFinalizationEvidence | null => {
  if (raw === null) return null;
  const evidence = exactRecord(
    raw,
    [
      "abstain",
      "approval_threshold_denominator",
      "approval_threshold_numerator",
      "approve",
      "approved",
      "finalized_at_height",
      "min_turnout",
      "mode",
      "proposal_id",
      "referendum_id",
      "reject",
    ],
    "Governance proposal finalization_evidence",
  );
  const rawProposalId = proposalId.replace(/^0x/u, "");
  if (
    exactUpperHex32(
      evidence.proposal_id,
      "Governance proposal finalization_evidence.proposal_id",
    ) !== rawProposalId.toUpperCase() ||
    exactUpperHex32(
      evidence.referendum_id,
      "Governance proposal finalization_evidence.referendum_id",
    ) !== rawProposalId.toUpperCase()
  ) {
    throw new TypeError(
      "Governance finalization evidence does not bind the exact proposal.",
    );
  }
  const finalizedAtHeight = exactCanonicalU64(
    evidence.finalized_at_height,
    "Governance proposal finalization_evidence.finalized_at_height",
  );
  if (
    BigInt(finalizedAtHeight) < BigInt(referendum.hStart) ||
    BigInt(finalizedAtHeight) > BigInt(referendum.hEnd)
  ) {
    throw new TypeError(
      "Governance finalization evidence must be committed inside its inclusive referendum window.",
    );
  }
  if (evidence.mode !== "Plain") {
    throw new TypeError(
      "Governance finalization evidence must use the first-release PLAIN mode.",
    );
  }
  const approve = exactCanonicalU128(
    evidence.approve,
    "Governance proposal finalization_evidence.approve",
  );
  const reject = exactCanonicalU128(
    evidence.reject,
    "Governance proposal finalization_evidence.reject",
  );
  const abstain = exactCanonicalU128(
    evidence.abstain,
    "Governance proposal finalization_evidence.abstain",
  );
  const minTurnout = exactCanonicalU128(
    evidence.min_turnout,
    "Governance proposal finalization_evidence.min_turnout",
  );
  const thresholdNumerator = exactCanonicalU64(
    evidence.approval_threshold_numerator,
    "Governance proposal finalization_evidence.approval_threshold_numerator",
  );
  const thresholdDenominator = exactCanonicalU64(
    evidence.approval_threshold_denominator,
    "Governance proposal finalization_evidence.approval_threshold_denominator",
  );
  if (typeof evidence.approved !== "boolean") {
    throw new TypeError(
      "Governance proposal finalization_evidence.approved must be boolean.",
    );
  }
  if (
    minTurnout !== GOVERNANCE_PLAIN_MIN_TURNOUT ||
    thresholdNumerator !== GOVERNANCE_PLAIN_APPROVAL_THRESHOLD_NUMERATOR ||
    thresholdDenominator !== GOVERNANCE_PLAIN_APPROVAL_THRESHOLD_DENOMINATOR
  ) {
    throw new TypeError(
      "Governance finalization evidence differs from the exact first-release PLAIN rules.",
    );
  }
  const turnout = checkedGovernanceU128Add(
    checkedGovernanceU128Add(
      BigInt(approve),
      BigInt(reject),
      "Governance finalization tally aggregation",
    ),
    BigInt(abstain),
    "Governance finalization tally aggregation",
  );
  const weightedApprove = BigInt(approve) * BigInt(thresholdDenominator);
  const weightedTurnout = turnout * BigInt(thresholdNumerator);
  const recomputedApproval =
    turnout >= BigInt(minTurnout) && weightedApprove >= weightedTurnout;
  if (evidence.approved !== recomputedApproval) {
    throw new TypeError(
      "Governance finalization evidence approval differs from its exact arithmetic.",
    );
  }
  return {
    proposal_id: evidence.proposal_id as string,
    referendum_id: evidence.referendum_id as string,
    finalized_at_height: finalizedAtHeight,
    mode: "Plain",
    approve,
    reject,
    abstain,
    min_turnout: minTurnout,
    approval_threshold_numerator: thresholdNumerator,
    approval_threshold_denominator: thresholdDenominator,
    approved: evidence.approved,
  };
};

interface NormalizedProposalRecord {
  summary: GovernanceProposalSummary;
  kind: GovernanceProposalKind;
  referendum: GovernanceReferendum;
  pipeline: GovernancePipelineStage[];
  parliamentRosters: GovernanceParliamentRoster[];
  finalizationEvidence: GovernanceFinalizationEvidence | null;
  enactedAtHeight: string | null;
}

const normalizeProposalRecord = (
  raw: unknown,
  label: string,
): NormalizedProposalRecord => {
  const proposal = exactRecord(
    raw,
    [
      "created_height",
      "enacted_at_height",
      "finalization_evidence",
      "parliament_snapshot",
      "pipeline",
      "proposal_id",
      "proposal_kind",
      "proposer",
      "referendum",
      "status",
    ],
    label,
  );
  const rawProposalId = exactHex32(
    proposal.proposal_id,
    `${label}.proposal_id`,
  );
  const proposalId = `0x${rawProposalId}`;
  const kind = normalizeGovernanceProposalKind(proposal.proposal_kind);
  if (
    kind.type !== "ValidationFeePolicy" &&
    kind.type !== "ValidationFeePayoutLifecycle"
  ) {
    throw new TypeError(
      `${label}.proposal_kind must be an exact typed validation-fee proposal.`,
    );
  }
  const pipeline = normalizePipeline(proposal.pipeline);
  const referendum = normalizeReferendum(proposal.referendum, rawProposalId);
  const parliamentRosters = normalizeRosters(proposal.parliament_snapshot);
  const finalizationEvidence = normalizeFinalizationEvidence(
    proposal.finalization_evidence,
    proposalId,
    referendum,
  );
  const createdHeight = exactCanonicalU64(
    proposal.created_height,
    `${label}.created_height`,
  );
  const status = exactProposalStatus(proposal.status);
  const enactedAtHeight = exactNullableCanonicalU64(
    proposal.enacted_at_height,
    `${label}.enacted_at_height`,
  );
  const isFinalizedStatus =
    status === "Approved" ||
    status === "Rejected" ||
    status === "Enacted" ||
    status === "Superseded";
  if (
    isFinalizedStatus !== Boolean(finalizationEvidence) ||
    (finalizationEvidence !== null && referendum.status !== "Closed") ||
    (finalizationEvidence === null && referendum.status === "Closed") ||
    (status === "Rejected" && finalizationEvidence?.approved !== false) ||
    ((status === "Approved" ||
      status === "Enacted" ||
      status === "Superseded") &&
      finalizationEvidence?.approved !== true)
  ) {
    throw new TypeError(
      `${label}.status differs from genuine finalized PLAIN evidence.`,
    );
  }
  const isEnactedStatus = status === "Enacted";
  if (isEnactedStatus !== (enactedAtHeight !== null)) {
    throw new TypeError(
      `${label}.enacted_at_height differs from its finalized status.`,
    );
  }
  if (
    enactedAtHeight !== null &&
    finalizationEvidence !== null &&
    BigInt(enactedAtHeight) <= BigInt(finalizationEvidence.finalized_at_height)
  ) {
    throw new TypeError(
      `${label}.enacted_at_height must be strictly later than finalized_at_height.`,
    );
  }
  if (
    kind.type === "ValidationFeePolicy" &&
    enactedAtHeight !== null &&
    BigInt(kind.policy.effective_from_height) !==
      BigInt(enactedAtHeight) + VALIDATION_FEE_EXACT_ACTIVATION_DELAY_BLOCKS
  ) {
    throw new TypeError(
      `${label} policy activation must be exactly 120,960 blocks after enactment.`,
    );
  }
  return {
    summary: {
      proposalId,
      referendumId: rawProposalId,
      proposer: exactNonEmptyText(proposal.proposer, `${label}.proposer`),
      createdHeight,
      status,
      referendumStatus: referendum.status,
      votingMode: referendum.mode,
      kindType: kind.type,
      kindLabelKey: GOVERNANCE_KIND_ADAPTERS[kind.type].labelKey,
      currentStage: currentPipelineStage(pipeline),
    },
    kind,
    referendum,
    pipeline,
    parliamentRosters,
    finalizationEvidence,
    enactedAtHeight,
  };
};

export const normalizeGovernanceProposalList = (
  raw: unknown,
): GovernanceProposalList => {
  const record = exactRecord(
    raw,
    ["proposals", "version"],
    "Governance proposal list",
  );
  if (record.version !== 1) {
    throw new TypeError("Governance proposal list.version must be 1.");
  }
  if (!Array.isArray(record.proposals)) {
    throw new TypeError("Governance proposal list.proposals must be an array.");
  }
  const proposals = record.proposals.map((item, index) =>
    normalizeProposalRecord(
      item,
      `Governance proposal list.proposals[${index}]`,
    ),
  );
  const proposalIds = new Set<string>();
  for (let index = 0; index < proposals.length; index += 1) {
    const proposal = proposals[index];
    if (proposalIds.has(proposal.summary.proposalId)) {
      throw new TypeError("Governance proposal list contains a duplicate ID.");
    }
    proposalIds.add(proposal.summary.proposalId);
    if (index === 0) continue;
    const previous = proposals[index - 1].summary;
    const current = proposal.summary;
    const heightOrder =
      BigInt(previous.createdHeight) < BigInt(current.createdHeight);
    const idOrderAtSameHeight =
      previous.createdHeight === current.createdHeight &&
      previous.proposalId < current.proposalId;
    if (!heightOrder && !idOrderAtSameHeight) {
      throw new TypeError(
        "Governance proposal list must be canonically ordered by created_height then proposal_id.",
      );
    }
  }
  return {
    items: proposals.map(({ summary }) => summary),
    nextCursor: null,
  };
};

export const normalizeGovernanceProposalDetail = (
  raw: unknown,
  proposalIdFallback = "",
): GovernanceProposalDetail => {
  const record = exactRecord(
    raw,
    [
      "body_progress",
      "current_height",
      "locks",
      "proposal",
      "tally",
      "version",
    ],
    "Governance proposal detail",
  );
  if (record.version !== 1) {
    throw new TypeError("Governance proposal detail.version must be 1.");
  }
  const proposal = normalizeProposalRecord(
    record.proposal,
    "Governance proposal detail.proposal",
  );
  const currentHeight = exactCanonicalU64(
    record.current_height,
    "Governance proposal detail.current_height",
  );
  if (proposalIdFallback) {
    const expected = canonicalGovernanceProposalId(proposalIdFallback);
    if (!expected || expected !== proposal.summary.proposalId) {
      throw new TypeError(
        "Governance proposal detail does not match the requested proposal ID.",
      );
    }
  }
  const tally = normalizeTally(record.tally);
  if ((tally.approved !== null) !== (proposal.finalizationEvidence !== null)) {
    throw new TypeError(
      "Governance proposal tally.approved must be present exactly when finalization evidence exists.",
    );
  }
  if (proposal.finalizationEvidence) {
    const evidence = proposal.finalizationEvidence;
    const expectedTurnout = (
      BigInt(evidence.approve) +
      BigInt(evidence.reject) +
      BigInt(evidence.abstain)
    ).toString();
    if (
      evidence.approve !== tally.approve ||
      evidence.reject !== tally.reject ||
      evidence.abstain !== tally.abstain ||
      expectedTurnout !== tally.turnout ||
      evidence.min_turnout !== tally.minTurnout ||
      evidence.approval_threshold_numerator !==
        tally.approvalThresholdNumerator ||
      evidence.approval_threshold_denominator !==
        tally.approvalThresholdDenominator ||
      evidence.approved !== tally.approved
    ) {
      throw new TypeError(
        "Governance proposal tally differs from its finalization evidence.",
      );
    }
  }
  if (BigInt(proposal.summary.createdHeight) > BigInt(currentHeight)) {
    throw new TypeError(
      "Governance proposal creation height exceeds current_height.",
    );
  }
  if (
    proposal.finalizationEvidence !== null &&
    BigInt(proposal.finalizationEvidence.finalized_at_height) >
      BigInt(currentHeight)
  ) {
    throw new TypeError(
      "Governance proposal finalization height exceeds current_height.",
    );
  }
  if (
    proposal.enactedAtHeight !== null &&
    BigInt(proposal.enactedAtHeight) > BigInt(currentHeight)
  ) {
    throw new TypeError(
      "Governance proposal enactment height exceeds current_height.",
    );
  }
  const parliamentOutcomes = normalizeOutcomes(
    record.body_progress,
    proposal.parliamentRosters,
  );
  return {
    summary: proposal.summary,
    kind: proposal.kind,
    referendum: proposal.referendum,
    tally,
    locks: normalizeLocks(record.locks),
    pipeline: proposal.pipeline,
    parliamentRosters: proposal.parliamentRosters,
    parliamentOutcomes,
    currentHeight,
    finalizationEvidence: proposal.finalizationEvidence,
    enactedAtHeight: proposal.enactedAtHeight,
    raw: record,
  };
};

export const isAccountInParliamentRoster = (
  detail: GovernanceProposalDetail,
  accountId: string,
  body: string,
): boolean => {
  const normalizedAccount = accountId.trim();
  const roster = detail.parliamentRosters.find((item) => item.body === body);
  return Boolean(
    normalizedAccount && roster && roster.members.includes(normalizedAccount),
  );
};

export const activeParliamentBody = (
  detail: GovernanceProposalDetail,
): string | null => {
  const stageBody: Partial<Record<GovernancePipelineStageName, string>> = {
    Rules: "rules-committee",
    Agenda: "agenda-council",
    Study: "interest-panel",
    Review: "review-panel",
    Jury: "policy-jury",
    Enact: "oversight-committee",
  };
  const body = stageBody[detail.summary.currentStage];
  return body && detail.parliamentRosters.some((item) => item.body === body)
    ? body
    : null;
};

export const isReferendumPlainVoteOpen = (
  detail: GovernanceProposalDetail,
): boolean => {
  const referendum = detail.referendum;
  if (!referendum || referendum.status !== "Open") return false;
  if (referendum.mode !== "Plain") return false;
  if (!detail.currentHeight) return false;
  const current = BigInt(detail.currentHeight);
  return (
    current >= BigInt(referendum.hStart) && current <= BigInt(referendum.hEnd)
  );
};

export const governanceCitizenVoteProjection = (
  detail: GovernanceProposalDetail | null,
  accountId: string,
): GovernanceCitizenVoteProjection => {
  const referendum = detail?.referendum;
  const currentHeight = detail?.currentHeight;
  if (!detail || !referendum || !currentHeight || referendum.mode !== "Plain") {
    return {
      state: "unavailable",
      lock: null,
      blocksUntilOpen: null,
      blocksUntilClose: null,
    };
  }
  const normalizedAccount = accountId.trim();
  const lock =
    (normalizedAccount &&
      detail.locks.find((entry) => entry.owner === normalizedAccount)) ||
    null;
  if (lock) {
    return {
      state: "recorded",
      lock,
      blocksUntilOpen: null,
      blocksUntilClose: null,
    };
  }
  const current = BigInt(currentHeight);
  const lower = BigInt(referendum.hStart);
  const upper = BigInt(referendum.hEnd);
  if (referendum.status === "Closed" || current > upper) {
    return {
      state: "closed",
      lock: null,
      blocksUntilOpen: null,
      blocksUntilClose: null,
    };
  }
  if (
    referendum.mode === "Plain" &&
    referendum.status === "Open" &&
    current >= lower &&
    current <= upper
  ) {
    return {
      state: "open",
      lock: null,
      blocksUntilOpen: null,
      blocksUntilClose: (upper - current).toString(),
    };
  }
  return {
    state: "awaiting-window",
    lock: null,
    blocksUntilOpen: current < lower ? (lower - current).toString() : "0",
    blocksUntilClose: null,
  };
};

export const plainBallotLockCoversReferendum = (
  detail: GovernanceProposalDetail,
  durationBlocks: string,
): boolean => {
  const referendum = detail.referendum;
  if (
    !referendum ||
    !detail.currentHeight ||
    !/^[1-9]\d*$/u.test(durationBlocks)
  ) {
    return false;
  }
  try {
    return (
      BigInt(detail.currentHeight) + BigInt(durationBlocks) >=
      BigInt(referendum.hEnd)
    );
  } catch {
    return false;
  }
};

export const isEnactActionable = (detail: GovernanceProposalDetail): boolean =>
  detail.summary.status === "Approved" &&
  detail.referendum?.mode === "Plain" &&
  detail.referendum.status === "Closed" &&
  detail.finalizationEvidence?.approved === true &&
  /^(?:0|[1-9]\d*)$/u.test(detail.finalizationEvidence.finalized_at_height) &&
  /^(?:0|[1-9]\d*)$/u.test(detail.referendum.hStart) &&
  /^(?:0|[1-9]\d*)$/u.test(detail.referendum.hEnd) &&
  BigInt(detail.finalizationEvidence.finalized_at_height) >=
    BigInt(detail.referendum.hStart) &&
  BigInt(detail.finalizationEvidence.finalized_at_height) <=
    BigInt(detail.referendum.hEnd);

export const assertPlainGovernanceProposalWrite = (
  detail: GovernanceProposalDetail,
): void => {
  if (detail.referendum?.mode !== "Plain") {
    throw new Error(
      "This release refuses governance writes for proposals without a PLAIN referendum.",
    );
  }
};

export const isCanonicalUnsignedDecimal = (
  value: string,
  options: { allowZero?: boolean } = {},
): boolean => {
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(value)) return false;
  if (options.allowZero) return true;
  return !/^0(?:\.0+)?$/u.test(value);
};

export const VALIDATION_FEE_EXACT_ACTIVATION_DELAY_BLOCKS = 120_960n;
/**
 * A proposal review can remain open for two minutes and submission/finality
 * consumes additional blocks. Keep five minutes of one-second Taira blocks
 * above Core's 600-block staging minimum so an explicitly signed window
 * cannot become stale during review.
 */
export const GOVERNANCE_PROPOSAL_REVIEW_SAFETY_MARGIN_BLOCKS = 300n;
const MAX_U64 = 0xffff_ffff_ffff_ffffn;

const canonicalU64 = (
  value: string | number | bigint,
  label: string,
  options: { positive?: boolean } = {},
): bigint => {
  const literal =
    typeof value === "bigint"
      ? value.toString()
      : typeof value === "number" && Number.isSafeInteger(value)
        ? String(value)
        : typeof value === "string"
          ? value
          : "";
  if (
    !/^(?:0|[1-9]\d*)$/u.test(literal) ||
    (options.positive && literal === "0")
  ) {
    throw new Error(`${label} must be a canonical uint64 integer.`);
  }
  const parsed = BigInt(literal);
  if (parsed > MAX_U64) {
    throw new Error(`${label} exceeds the uint64 range.`);
  }
  return parsed;
};

export const rebaseGovernanceReferendumWindow = (input: {
  currentHeight: string | number | bigint;
  minStagingBlocks: string | number | bigint;
  windowSpan: string | number | bigint;
  safetyMarginBlocks?: string | number | bigint;
}): ValidationFeeReferendumWindowPayload => {
  const currentHeight = canonicalU64(input.currentHeight, "Current height");
  const minStagingBlocks = canonicalU64(
    input.minStagingBlocks,
    "Minimum staging blocks",
    { positive: true },
  );
  const windowSpan = canonicalU64(input.windowSpan, "Referendum window span", {
    positive: true,
  });
  const safetyMarginBlocks = canonicalU64(
    input.safetyMarginBlocks ?? GOVERNANCE_PROPOSAL_REVIEW_SAFETY_MARGIN_BLOCKS,
    "Proposal review safety margin",
    { positive: true },
  );
  const lower = currentHeight + minStagingBlocks + safetyMarginBlocks;
  const upper = lower + windowSpan - 1n;
  if (lower > MAX_U64 || upper > MAX_U64) {
    throw new Error("Rebased referendum window exceeds the uint64 range.");
  }
  return {
    lower: lower.toString(),
    upper: upper.toString(),
  };
};

export const validationFeePolicyEnactmentTargetHeight = (
  effectiveHeight: string,
): string | null => {
  if (!/^[1-9]\d*$/u.test(effectiveHeight)) return null;
  const effective = BigInt(effectiveHeight);
  if (
    effective > MAX_U64 ||
    effective <= VALIDATION_FEE_EXACT_ACTIVATION_DELAY_BLOCKS
  ) {
    return null;
  }
  return (effective - VALIDATION_FEE_EXACT_ACTIVATION_DELAY_BLOCKS).toString();
};

export type ValidationFeePolicyEnactmentTimingStatus =
  | "not-policy"
  | "unavailable"
  | "not-yet"
  | "ready"
  | "missed";

export interface ValidationFeePolicyEnactmentTiming {
  status: ValidationFeePolicyEnactmentTimingStatus;
  targetHeight: string | null;
  nextHeight: string | null;
  blocksRemaining: string | null;
}

export const validationFeePolicyEnactmentTiming = (
  detail: GovernanceProposalDetail,
): ValidationFeePolicyEnactmentTiming => {
  if (detail.kind.type !== "ValidationFeePolicy") {
    return {
      status: "not-policy",
      targetHeight: null,
      nextHeight: null,
      blocksRemaining: null,
    };
  }
  const effectiveLiteral = detail.kind.policy.effective_from_height;
  const currentLiteral = detail.currentHeight;
  const finalizedLiteral = detail.finalizationEvidence?.finalized_at_height;
  const referendumStartLiteral = detail.referendum?.hStart;
  const referendumEndLiteral = detail.referendum?.hEnd;
  const targetLiteral =
    validationFeePolicyEnactmentTargetHeight(effectiveLiteral);
  if (
    targetLiteral === null ||
    !currentLiteral ||
    !/^(?:0|[1-9]\d*)$/u.test(currentLiteral) ||
    !finalizedLiteral ||
    !/^(?:0|[1-9]\d*)$/u.test(finalizedLiteral) ||
    !referendumStartLiteral ||
    !/^(?:0|[1-9]\d*)$/u.test(referendumStartLiteral) ||
    !referendumEndLiteral ||
    !/^(?:0|[1-9]\d*)$/u.test(referendumEndLiteral) ||
    detail.finalizationEvidence?.approved !== true
  ) {
    return {
      status: "unavailable",
      targetHeight: null,
      nextHeight: null,
      blocksRemaining: null,
    };
  }
  const effective = BigInt(effectiveLiteral);
  const current = BigInt(currentLiteral);
  const finalized = BigInt(finalizedLiteral);
  const referendumStart = BigInt(referendumStartLiteral);
  const referendumEnd = BigInt(referendumEndLiteral);
  const target = BigInt(targetLiteral);
  if (
    effective > MAX_U64 ||
    current > MAX_U64 ||
    finalized > MAX_U64 ||
    referendumStart > referendumEnd ||
    current < finalized ||
    finalized < referendumStart ||
    finalized > referendumEnd ||
    target <= referendumEnd ||
    target <= finalized ||
    effective !== target + VALIDATION_FEE_EXACT_ACTIVATION_DELAY_BLOCKS
  ) {
    return {
      status: "unavailable",
      targetHeight: null,
      nextHeight: null,
      blocksRemaining: null,
    };
  }
  if (current === MAX_U64) {
    return {
      status: "missed",
      targetHeight: target.toString(),
      nextHeight: null,
      blocksRemaining: null,
    };
  }
  const next = current + 1n;
  if (next < target) {
    return {
      status: "not-yet",
      targetHeight: target.toString(),
      nextHeight: next.toString(),
      blocksRemaining: (target - next).toString(),
    };
  }
  return {
    status: next === target ? "ready" : "missed",
    targetHeight: target.toString(),
    nextHeight: next.toString(),
    blocksRemaining: next === target ? "0" : null,
  };
};

export const validateValidationFeePolicy = (
  policy: ValidationFeePolicyPayload,
  referendumWindow: ValidationFeeReferendumWindowPayload,
  payoutLifecycleProposalId: string,
): string[] => {
  const errors: string[] = [];
  if (policy.schema_version !== 1) errors.push("Unsupported schema version.");
  if (!policy.chain_id.trim()) errors.push("Chain ID is required.");
  if (
    !canonicalValidationFeeHash(policy.genesis_hash) ||
    /^0+$/u.test(policy.genesis_hash)
  ) {
    errors.push("Genesis hash must be non-zero lowercase 32-byte hex.");
  }
  const policyVersionIsCanonical = /^[1-9]\d*$/u.test(policy.policy_version);
  if (
    !policyVersionIsCanonical ||
    BigInt(policy.policy_version || "0") > MAX_U64
  ) {
    errors.push("Policy version must be a positive integer.");
  }
  if (
    policyVersionIsCanonical &&
    policy.policy_version === "1" &&
    policy.previous_policy_hash !== null
  ) {
    errors.push("The initial policy must not bind a previous policy hash.");
  } else if (
    policy.policy_version !== "1" &&
    (!canonicalValidationFeeHash(policy.previous_policy_hash) ||
      /^0+$/u.test(policy.previous_policy_hash ?? ""))
  ) {
    errors.push("A successor policy must bind the previous policy hash.");
  }
  if (!policy.ds_asset_id.trim()) {
    errors.push("Fee asset is required.");
  } else if (policy.ds_asset_id !== CBSI_SBD_ASSET_DEFINITION_ID) {
    errors.push("Fee asset must be the exact CBSI SBD asset definition ID.");
  }
  if (policy.ds_scale !== 2) {
    errors.push("Fee asset scale must be exactly 2.");
  }
  if (policy.fee !== "0.10") {
    errors.push("Enabled validation fee must be exactly 0.10 SBD.");
  }
  if (!policy.treasury_account_id.trim()) {
    errors.push("Treasury account is required.");
  }
  if (
    policy.charging_mode.charging_mode !==
      "PER_QUALIFYING_TRANSFER_INSTRUCTION" ||
    policy.charging_mode.value !== null
  ) {
    errors.push("Charging mode must be the enabled first-release mode.");
  }
  const lowerIsCanonical = /^[1-9]\d*$/u.test(referendumWindow.lower);
  const upperIsCanonical = /^[1-9]\d*$/u.test(referendumWindow.upper);
  if (!lowerIsCanonical || !upperIsCanonical) {
    errors.push(
      "Referendum window start and end are required positive integers.",
    );
  }
  const lower = lowerIsCanonical ? BigInt(referendumWindow.lower) : null;
  const upper = upperIsCanonical ? BigInt(referendumWindow.upper) : null;
  if (
    lower !== null &&
    upper !== null &&
    (lower > MAX_U64 || upper > MAX_U64)
  ) {
    errors.push("Referendum window exceeds the uint64 range.");
  } else if (lower !== null && upper !== null && upper < lower) {
    errors.push("Referendum window end must not be before its start.");
  }
  const enactmentTargetHeight = validationFeePolicyEnactmentTargetHeight(
    policy.effective_from_height,
  );
  const effectiveHeightIsCanonical = /^[1-9]\d*$/u.test(
    policy.effective_from_height,
  );
  const effectiveHeight = effectiveHeightIsCanonical
    ? BigInt(policy.effective_from_height)
    : null;
  if (effectiveHeight === null || effectiveHeight > MAX_U64) {
    errors.push("Effective height must be a positive integer.");
  } else if (
    enactmentTargetHeight === null ||
    lower === null ||
    upper === null ||
    BigInt(enactmentTargetHeight) <= upper
  ) {
    errors.push(
      "Effective height must encode enactment strictly after the inclusive referendum window and activation exactly 120,960 blocks later.",
    );
  }
  if (policy.expires_after_height !== null) {
    const expiryIsCanonical = /^[1-9]\d*$/u.test(policy.expires_after_height);
    const expiry = expiryIsCanonical
      ? BigInt(policy.expires_after_height)
      : null;
    if (
      expiry === null ||
      expiry > MAX_U64 ||
      effectiveHeight === null ||
      expiry <= effectiveHeight
    ) {
      errors.push("Expiry height must be after the effective height.");
    }
  }
  const payoutEnabled = policy.treasury_payout_binding !== null;
  if (
    policy.exemption_classes.length !== (payoutEnabled ? 1 : 0) ||
    (payoutEnabled && policy.exemption_classes[0] !== "TREASURY_PAYOUT")
  ) {
    errors.push(
      "Only the exact TREASURY_PAYOUT exemption is allowed with a payout binding.",
    );
  }
  const lifecycleId = canonicalValidationFeeHash(
    payoutLifecycleProposalId.trim(),
  );
  if (payoutEnabled && (!lifecycleId || /^0+$/u.test(lifecycleId))) {
    errors.push(
      "A payout-enabled policy requires a non-zero lifecycle proposal ID.",
    );
  } else if (!payoutEnabled && payoutLifecycleProposalId.trim()) {
    errors.push(
      "A policy without a payout binding cannot select a lifecycle proposal.",
    );
  }
  return errors;
};

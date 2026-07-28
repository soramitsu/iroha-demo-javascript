import { createHash } from "node:crypto";
import { normalizeCanonicalAccountIdLiteral } from "./accountAddress";

export const TAIRA_GOVERNANCE_CHAIN_ID = "fc56984b-2be7-431d-840e-21514d1883f0";
export const TAIRA_GOVERNANCE_NETWORK_PREFIX = 369;
export const TAIRA_GOVERNANCE_GENESIS_HASH =
  "884b61c61f56dcddceee7aa3dc1deb89fb8552576d02b01a1b7af9ae7fd5ff7a";
export const TAIRA_GOVERNANCE_ABI_VERSION = 1;
export const TAIRA_GOVERNANCE_DATA_MODEL_VERSION = 3;
export const TAIRA_GOVERNANCE_WINDOW_SPAN = 3_600;
// This Torii capability is the staging delay before the voting window opens.
// Validation-fee activation has its own strict 120,960-block delay.
export const TAIRA_GOVERNANCE_MIN_ENACTMENT_DELAY = 600;
export const TAIRA_GOVERNANCE_XOR_ASSET_ID = "6TEAJqbb8oEPmLncoNiMRbLEK6tw";
export const TAIRA_GOVERNANCE_ESCROW_ACCOUNT =
  "testuﾛ1NfｷgﾉﾓﾉBｦKﾌﾘﾒoﾇﾂﾛrG81ﾋjWﾎﾕVncwﾌSｱ3pﾘﾋﾉhUS9Q76";

export const GOVERNANCE_BODY_KEYS = [
  "rules_committee",
  "agenda_council",
  "interest_panel",
  "review_panel",
  "policy_jury",
  "oversight_committee",
  "fma_committee",
] as const;

export type GovernanceBodyKey = (typeof GOVERNANCE_BODY_KEYS)[number];

export const TAIRA_GOVERNANCE_TARGET_BODY_SIZES: Readonly<
  Record<GovernanceBodyKey, number>
> = Object.freeze({
  rules_committee: 7,
  agenda_council: 9,
  interest_panel: 11,
  review_panel: 13,
  policy_jury: 25,
  oversight_committee: 7,
  fma_committee: 5,
});

export const GOVERNANCE_REQUIRED_PROPOSAL_KINDS = [
  "VALIDATION_FEE_PAYOUT_LIFECYCLE",
  "VALIDATION_FEE_POLICY",
] as const;

export const GOVERNANCE_REQUIRED_ROUTES = [
  "/v1/gov/capabilities",
  "/v1/gov/citizens",
  "/v1/gov/citizens/{account_id}",
  "/v1/gov/citizens/draft",
  "/v1/validation-fee/proposals",
  "/v1/validation-fee/proposals/{proposal_id}",
  "/v1/validation-fee/proposals/{proposal_id}/enactment-proof",
  "/v1/validation-fee/proposals/draft",
  "/v1/validation-fee/proposals/{proposal_id}/plain-electorate/draft",
  "/v1/validation-fee/proposals/{proposal_id}/plain-ballot/draft",
  "/v1/validation-fee/proposals/{proposal_id}/finalization/draft",
  "/v1/validation-fee/proposals/{proposal_id}/payout-lifecycle-enactment/draft",
  "/v1/gov/parliament/ballots",
  "/v1/gov/ballots/plain",
] as const;

export interface GovernanceValidationFeePlainElectorateRulesV1 {
  votingAssetId: typeof TAIRA_GOVERNANCE_XOR_ASSET_ID;
  bondEscrowAccount: string;
  slashReceiverAccount: string;
  ballotAmount: "150";
  ballotDurationBlocks: "3600";
  citizenshipAmount: "10000";
  maxMembers: "256";
  convictionStepBlocks: "100";
  maxConviction: "6";
  minTurnout: "1";
  approvalThresholdNumerator: "1";
  approvalThresholdDenominator: "2";
  eligibilityRule: {
    rule: "proposal_operator_at_or_before_gate_others_after_gate";
    value: null;
  };
}

export interface GovernanceCapabilitiesV1 {
  schema: "iroha.governance.capabilities.v1";
  version: 1;
  chainId: string;
  genesisHash: string;
  currentHeight: number;
  networkPrefix: number;
  abiVersion: number;
  dataModelVersion: number;
  approvalMode: "PARLIAMENT_SORTITION_JIT";
  plainVotingEnabled: true;
  autoFinalizePlain: true;
  autoFinalizePlainScope: "GENERIC_NON_VALIDATION_FEE_ONLY";
  validationFeePlainRequiresExplicitFinalization: true;
  validationFeePlainElectorateRules: GovernanceValidationFeePlainElectorateRulesV1;
  citizenshipAssetId: string;
  citizenshipBondAmount: string;
  citizenshipEscrowAccount: string;
  votingAssetId: string;
  minBondAmount: string;
  bondEscrowAccount: string;
  convictionStepBlocks: number;
  maxConviction: number;
  minEnactmentDelay: number;
  windowSpan: number;
  minTurnout: string;
  approvalThresholdNumerator: number;
  approvalThresholdDenominator: number;
  parliamentQuorumBps: number;
  targetBodySizes: Record<GovernanceBodyKey, number>;
  supportedProposalKinds: Array<
    (typeof GOVERNANCE_REQUIRED_PROPOSAL_KINDS)[number]
  >;
  supportedRoutes: string[];
}

const GOVERNANCE_CAPABILITIES_CONTRACT_FINGERPRINT_DOMAIN =
  "iroha.wallet.governance-capabilities-contract.v1";

/**
 * Fingerprint the immutable governance contract used for a reviewed write.
 * currentHeight is intentionally excluded because it is an observation that
 * may advance between prepare and confirmation without changing the contract.
 */
export function governanceCapabilitiesContractFingerprintV1(
  capabilities: Readonly<GovernanceCapabilitiesV1>,
): string {
  const contract = {
    schema: capabilities.schema,
    version: capabilities.version,
    chainId: capabilities.chainId,
    genesisHash: capabilities.genesisHash,
    networkPrefix: capabilities.networkPrefix,
    abiVersion: capabilities.abiVersion,
    dataModelVersion: capabilities.dataModelVersion,
    approvalMode: capabilities.approvalMode,
    plainVotingEnabled: capabilities.plainVotingEnabled,
    autoFinalizePlain: capabilities.autoFinalizePlain,
    autoFinalizePlainScope: capabilities.autoFinalizePlainScope,
    validationFeePlainRequiresExplicitFinalization:
      capabilities.validationFeePlainRequiresExplicitFinalization,
    validationFeePlainElectorateRules:
      capabilities.validationFeePlainElectorateRules,
    citizenshipAssetId: capabilities.citizenshipAssetId,
    citizenshipBondAmount: capabilities.citizenshipBondAmount,
    citizenshipEscrowAccount: capabilities.citizenshipEscrowAccount,
    votingAssetId: capabilities.votingAssetId,
    minBondAmount: capabilities.minBondAmount,
    bondEscrowAccount: capabilities.bondEscrowAccount,
    convictionStepBlocks: capabilities.convictionStepBlocks,
    maxConviction: capabilities.maxConviction,
    minEnactmentDelay: capabilities.minEnactmentDelay,
    windowSpan: capabilities.windowSpan,
    minTurnout: capabilities.minTurnout,
    approvalThresholdNumerator: capabilities.approvalThresholdNumerator,
    approvalThresholdDenominator: capabilities.approvalThresholdDenominator,
    parliamentQuorumBps: capabilities.parliamentQuorumBps,
    targetBodySizes: GOVERNANCE_BODY_KEYS.map((body) => [
      body,
      capabilities.targetBodySizes[body],
    ]),
    supportedProposalKinds: [...capabilities.supportedProposalKinds].sort(),
    supportedRoutes: [...capabilities.supportedRoutes].sort(),
  };
  return createHash("sha256")
    .update(GOVERNANCE_CAPABILITIES_CONTRACT_FINGERPRINT_DOMAIN)
    .update("\0")
    .update(JSON.stringify(contract))
    .digest("hex");
}

type PlainRecord = Record<string, unknown>;

const CAPABILITY_KEYS = Object.freeze(
  [
    "abi_version",
    "approval_mode",
    "approval_threshold_denominator",
    "approval_threshold_numerator",
    "auto_finalize_plain",
    "auto_finalize_plain_scope",
    "bond_escrow_account",
    "chain_id",
    "citizenship_asset_id",
    "citizenship_bond_amount",
    "citizenship_escrow_account",
    "conviction_step_blocks",
    "current_height",
    "data_model_version",
    "genesis_hash",
    "max_conviction",
    "min_bond_amount",
    "min_enactment_delay",
    "min_turnout",
    "network_prefix",
    "parliament_quorum_bps",
    "plain_voting_enabled",
    "schema",
    "supported_proposal_kinds",
    "supported_routes",
    "target_body_sizes",
    "validation_fee_plain_electorate_rules",
    "validation_fee_plain_requires_explicit_finalization",
    "version",
    "voting_asset_id",
    "window_span",
  ].sort(),
);

const record = (value: unknown, label: string): PlainRecord => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
  return value as PlainRecord;
};

const exactKeys = (
  value: PlainRecord,
  expected: readonly string[],
  label: string,
): void => {
  const actual = Object.keys(value).sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw new TypeError(`${label} contains missing or unknown fields.`);
  }
};

const exactText = (value: unknown, label: string): string => {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value
  ) {
    throw new TypeError(`${label} must be canonical non-empty text.`);
  }
  return value;
};

const exactTairaAccount = (value: unknown, label: string): string => {
  const literal = exactText(value, label);
  let canonical: string;
  try {
    canonical = normalizeCanonicalAccountIdLiteral(
      literal,
      label,
      TAIRA_GOVERNANCE_NETWORK_PREFIX,
    );
  } catch (error) {
    throw new TypeError(
      `${label} must be an exact Taira account literal: ${String(error)}`,
    );
  }
  if (canonical !== literal) {
    throw new TypeError(`${label} must use its exact canonical Taira literal.`);
  }
  return literal;
};

const exactDecimal = (
  value: unknown,
  label: string,
  options: { positive?: boolean } = {},
): string => {
  const literal = exactText(value, label);
  const match = /^(?:0|[1-9]\d*)(?:\.(\d+))?$/u.exec(literal);
  const fractional = match?.[1] ?? "";
  const mantissa = match ? BigInt(literal.replace(".", "")) : 0n;
  if (
    !match ||
    fractional.length > 28 ||
    fractional.endsWith("0") ||
    mantissa > (1n << 511n) - 1n ||
    (options.positive && mantissa === 0n)
  ) {
    throw new TypeError(`${label} must be a canonical decimal string.`);
  }
  return literal;
};

const safeInteger = (
  value: unknown,
  label: string,
  options: { positive?: boolean } = {},
): number => {
  if (typeof value !== "string" || !/^(?:0|[1-9]\d*)$/u.test(value)) {
    throw new TypeError(
      `${label} must be a complete canonical decimal-integer string.`,
    );
  }
  const parsed = BigInt(value);
  if (
    parsed > BigInt(Number.MAX_SAFE_INTEGER) ||
    (options.positive && parsed === 0n)
  ) {
    throw new TypeError(`${label} is outside the exactly representable range.`);
  }
  return Number(parsed);
};

const exactStringArray = (value: unknown, label: string): string[] => {
  if (
    !Array.isArray(value) ||
    value.some(
      (entry) =>
        typeof entry !== "string" ||
        entry.length === 0 ||
        entry.trim() !== entry,
    )
  ) {
    throw new TypeError(`${label} must be an array of canonical strings.`);
  }
  return [...value];
};

const validationFeePlainElectorateRules = (
  value: unknown,
): GovernanceValidationFeePlainElectorateRulesV1 => {
  const rules = record(
    value,
    "governance capabilities.validation_fee_plain_electorate_rules",
  );
  exactKeys(
    rules,
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
    "governance capabilities.validation_fee_plain_electorate_rules",
  );
  const eligibility = record(
    rules.eligibility_rule,
    "governance capabilities.validation_fee_plain_electorate_rules.eligibility_rule",
  );
  exactKeys(
    eligibility,
    ["rule", "value"],
    "governance capabilities.validation_fee_plain_electorate_rules.eligibility_rule",
  );
  if (
    rules.voting_asset_id !== TAIRA_GOVERNANCE_XOR_ASSET_ID ||
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
      "governance capabilities validation-fee PLAIN electorate rules differ from Taira.",
    );
  }
  return {
    votingAssetId: TAIRA_GOVERNANCE_XOR_ASSET_ID,
    bondEscrowAccount: exactTairaAccount(
      rules.bond_escrow_account,
      "governance capabilities.validation_fee_plain_electorate_rules.bond_escrow_account",
    ),
    slashReceiverAccount: exactTairaAccount(
      rules.slash_receiver_account,
      "governance capabilities.validation_fee_plain_electorate_rules.slash_receiver_account",
    ),
    ballotAmount: "150",
    ballotDurationBlocks: "3600",
    citizenshipAmount: "10000",
    maxMembers: "256",
    convictionStepBlocks: "100",
    maxConviction: "6",
    minTurnout: "1",
    approvalThresholdNumerator: "1",
    approvalThresholdDenominator: "2",
    eligibilityRule: {
      rule: "proposal_operator_at_or_before_gate_others_after_gate",
      value: null,
    },
  };
};

const targetBodySizes = (value: unknown): Record<GovernanceBodyKey, number> => {
  const sizes = record(value, "governance capabilities.target_body_sizes");
  exactKeys(
    sizes,
    [...GOVERNANCE_BODY_KEYS].sort(),
    "governance capabilities.target_body_sizes",
  );
  return Object.fromEntries(
    GOVERNANCE_BODY_KEYS.map((body) => [
      body,
      safeInteger(
        sizes[body],
        `governance capabilities.target_body_sizes.${body}`,
        { positive: true },
      ),
    ]),
  ) as Record<GovernanceBodyKey, number>;
};

const assertRequiredSet = (
  actual: string[],
  required: readonly string[],
  label: string,
): void => {
  if (
    actual.length !== new Set(actual).size ||
    required.some((entry) => !actual.includes(entry))
  ) {
    throw new TypeError(
      `${label} does not expose the required Taira contract.`,
    );
  }
};

/**
 * Parse the single public governance readiness contract. This intentionally
 * rejects aliases and unknown fields so a node upgrade cannot silently change
 * what the wallet is about to sign.
 */
export function parseGovernanceCapabilitiesV1(
  value: unknown,
): GovernanceCapabilitiesV1 {
  const capabilities = record(value, "governance capabilities");
  exactKeys(capabilities, CAPABILITY_KEYS, "governance capabilities");

  if (
    capabilities.schema !== "iroha.governance.capabilities.v1" ||
    capabilities.version !== 1
  ) {
    throw new TypeError(
      "governance capabilities must use iroha.governance.capabilities.v1.",
    );
  }

  const chainId = exactText(
    capabilities.chain_id,
    "governance capabilities.chain_id",
  );
  const genesisHash = exactText(
    capabilities.genesis_hash,
    "governance capabilities.genesis_hash",
  );
  if (!/^[0-9a-f]{64}$/u.test(genesisHash) || /^0+$/u.test(genesisHash)) {
    throw new TypeError(
      "governance capabilities.genesis_hash must be non-zero lowercase 32-byte hex.",
    );
  }
  const approvalMode = capabilities.approval_mode;
  if (approvalMode !== "PARLIAMENT_SORTITION_JIT") {
    throw new TypeError(
      "governance capabilities must advertise JIT Parliament sortition.",
    );
  }
  if (
    capabilities.plain_voting_enabled !== true ||
    capabilities.auto_finalize_plain !== true ||
    capabilities.auto_finalize_plain_scope !==
      "GENERIC_NON_VALIDATION_FEE_ONLY" ||
    capabilities.validation_fee_plain_requires_explicit_finalization !== true
  ) {
    throw new TypeError(
      "governance capabilities must scope automatic PLAIN finalization away from validation-fee proposals.",
    );
  }

  const validationFeeElectorateRules = validationFeePlainElectorateRules(
    capabilities.validation_fee_plain_electorate_rules,
  );

  const bodySizes = targetBodySizes(capabilities.target_body_sizes);
  for (const body of GOVERNANCE_BODY_KEYS) {
    if (bodySizes[body] !== TAIRA_GOVERNANCE_TARGET_BODY_SIZES[body]) {
      throw new TypeError(
        `governance capabilities target size for ${body} does not match Taira.`,
      );
    }
  }

  const supportedProposalKinds = exactStringArray(
    capabilities.supported_proposal_kinds,
    "governance capabilities.supported_proposal_kinds",
  );
  assertRequiredSet(
    supportedProposalKinds,
    GOVERNANCE_REQUIRED_PROPOSAL_KINDS,
    "governance capabilities.supported_proposal_kinds",
  );
  if (
    supportedProposalKinds.some(
      (kind) =>
        !GOVERNANCE_REQUIRED_PROPOSAL_KINDS.includes(
          kind as (typeof GOVERNANCE_REQUIRED_PROPOSAL_KINDS)[number],
        ),
    )
  ) {
    throw new TypeError(
      "governance capabilities advertises an unsupported proposal kind.",
    );
  }

  const supportedRoutes = exactStringArray(
    capabilities.supported_routes,
    "governance capabilities.supported_routes",
  );
  assertRequiredSet(
    supportedRoutes,
    GOVERNANCE_REQUIRED_ROUTES,
    "governance capabilities.supported_routes",
  );
  if (
    supportedRoutes.some(
      (route) =>
        !GOVERNANCE_REQUIRED_ROUTES.includes(
          route as (typeof GOVERNANCE_REQUIRED_ROUTES)[number],
        ),
    )
  ) {
    throw new TypeError(
      "governance capabilities advertises an unsupported route.",
    );
  }

  const parsed: GovernanceCapabilitiesV1 = {
    schema: "iroha.governance.capabilities.v1",
    version: 1,
    chainId,
    genesisHash,
    currentHeight: safeInteger(
      capabilities.current_height,
      "governance capabilities.current_height",
    ),
    networkPrefix: safeInteger(
      capabilities.network_prefix,
      "governance capabilities.network_prefix",
      { positive: true },
    ),
    abiVersion: safeInteger(
      capabilities.abi_version,
      "governance capabilities.abi_version",
      { positive: true },
    ),
    dataModelVersion: safeInteger(
      capabilities.data_model_version,
      "governance capabilities.data_model_version",
      { positive: true },
    ),
    approvalMode,
    plainVotingEnabled: true,
    autoFinalizePlain: true,
    autoFinalizePlainScope: "GENERIC_NON_VALIDATION_FEE_ONLY",
    validationFeePlainRequiresExplicitFinalization: true,
    validationFeePlainElectorateRules: validationFeeElectorateRules,
    citizenshipAssetId: exactText(
      capabilities.citizenship_asset_id,
      "governance capabilities.citizenship_asset_id",
    ),
    citizenshipBondAmount: exactDecimal(
      capabilities.citizenship_bond_amount,
      "governance capabilities.citizenship_bond_amount",
      { positive: true },
    ),
    citizenshipEscrowAccount: exactText(
      capabilities.citizenship_escrow_account,
      "governance capabilities.citizenship_escrow_account",
    ),
    votingAssetId: exactText(
      capabilities.voting_asset_id,
      "governance capabilities.voting_asset_id",
    ),
    minBondAmount: exactDecimal(
      capabilities.min_bond_amount,
      "governance capabilities.min_bond_amount",
      { positive: true },
    ),
    bondEscrowAccount: exactTairaAccount(
      capabilities.bond_escrow_account,
      "governance capabilities.bond_escrow_account",
    ),
    convictionStepBlocks: safeInteger(
      capabilities.conviction_step_blocks,
      "governance capabilities.conviction_step_blocks",
      { positive: true },
    ),
    maxConviction: safeInteger(
      capabilities.max_conviction,
      "governance capabilities.max_conviction",
      { positive: true },
    ),
    minEnactmentDelay: safeInteger(
      capabilities.min_enactment_delay,
      "governance capabilities.min_enactment_delay",
      { positive: true },
    ),
    windowSpan: safeInteger(
      capabilities.window_span,
      "governance capabilities.window_span",
      { positive: true },
    ),
    minTurnout: exactDecimal(
      capabilities.min_turnout,
      "governance capabilities.min_turnout",
      { positive: true },
    ),
    approvalThresholdNumerator: safeInteger(
      capabilities.approval_threshold_numerator,
      "governance capabilities.approval_threshold_numerator",
      { positive: true },
    ),
    approvalThresholdDenominator: safeInteger(
      capabilities.approval_threshold_denominator,
      "governance capabilities.approval_threshold_denominator",
      { positive: true },
    ),
    parliamentQuorumBps: safeInteger(
      capabilities.parliament_quorum_bps,
      "governance capabilities.parliament_quorum_bps",
      { positive: true },
    ),
    targetBodySizes: bodySizes,
    supportedProposalKinds:
      supportedProposalKinds as GovernanceCapabilitiesV1["supportedProposalKinds"],
    supportedRoutes,
  };

  if (
    parsed.chainId !== TAIRA_GOVERNANCE_CHAIN_ID ||
    parsed.genesisHash !== TAIRA_GOVERNANCE_GENESIS_HASH ||
    parsed.networkPrefix !== TAIRA_GOVERNANCE_NETWORK_PREFIX ||
    parsed.abiVersion !== TAIRA_GOVERNANCE_ABI_VERSION ||
    parsed.dataModelVersion !== TAIRA_GOVERNANCE_DATA_MODEL_VERSION ||
    parsed.windowSpan !== TAIRA_GOVERNANCE_WINDOW_SPAN ||
    parsed.minEnactmentDelay !== TAIRA_GOVERNANCE_MIN_ENACTMENT_DELAY ||
    parsed.citizenshipAssetId !== TAIRA_GOVERNANCE_XOR_ASSET_ID ||
    parsed.citizenshipBondAmount !== "10000" ||
    parsed.citizenshipEscrowAccount !== TAIRA_GOVERNANCE_ESCROW_ACCOUNT ||
    parsed.votingAssetId !== TAIRA_GOVERNANCE_XOR_ASSET_ID ||
    parsed.minBondAmount !== "150" ||
    parsed.bondEscrowAccount !== TAIRA_GOVERNANCE_ESCROW_ACCOUNT ||
    parsed.validationFeePlainElectorateRules.bondEscrowAccount !==
      TAIRA_GOVERNANCE_ESCROW_ACCOUNT ||
    parsed.validationFeePlainElectorateRules.slashReceiverAccount !==
      TAIRA_GOVERNANCE_ESCROW_ACCOUNT ||
    parsed.validationFeePlainElectorateRules.bondEscrowAccount !==
      parsed.bondEscrowAccount ||
    parsed.convictionStepBlocks !== 100 ||
    parsed.maxConviction !== 6 ||
    parsed.minTurnout !== "1" ||
    parsed.approvalThresholdNumerator !== 1 ||
    parsed.approvalThresholdDenominator !== 2 ||
    parsed.approvalThresholdNumerator >= parsed.approvalThresholdDenominator ||
    parsed.parliamentQuorumBps !== 6_667
  ) {
    throw new TypeError(
      "governance capabilities do not match the reviewed Taira release.",
    );
  }

  return parsed;
}

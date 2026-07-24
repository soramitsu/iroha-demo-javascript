export const TAIRA_GOVERNANCE_CHAIN_ID = "fc56984b-2be7-431d-840e-21514d1883f0";
export const TAIRA_GOVERNANCE_NETWORK_PREFIX = 369;
export const TAIRA_GOVERNANCE_ABI_VERSION = 1;
export const TAIRA_GOVERNANCE_DATA_MODEL_VERSION = 3;
export const TAIRA_GOVERNANCE_WINDOW_SPAN = 3_600;
// This Torii capability is the staging delay before the voting window opens.
// Validation-fee activation has its own strict 120,960-block delay.
export const TAIRA_GOVERNANCE_MIN_ENACTMENT_DELAY = 600;

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
  "/v1/gov/citizens/draft",
  "/v1/validation-fee/proposals",
  "/v1/validation-fee/proposals/{proposal_id}",
  "/v1/validation-fee/proposals/draft",
  "/v1/gov/ballots/plain",
  "/v1/gov/parliament/ballots",
  "/v1/gov/enact",
] as const;

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
  citizenshipAssetId: string;
  citizenshipBondAmount: string;
  votingAssetId: string;
  minBondAmount: string;
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

type PlainRecord = Record<string, unknown>;

const CAPABILITY_KEYS = Object.freeze(
  [
    "abi_version",
    "approval_mode",
    "approval_threshold_denominator",
    "approval_threshold_numerator",
    "auto_finalize_plain",
    "chain_id",
    "citizenship_asset_id",
    "citizenship_bond_amount",
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

const exactDecimal = (
  value: unknown,
  label: string,
  options: { positive?: boolean } = {},
): string => {
  const literal = exactText(value, label);
  if (
    !/^(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(literal) ||
    (options.positive && /^0(?:\.0+)?$/u.test(literal))
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
    capabilities.auto_finalize_plain !== true
  ) {
    throw new TypeError(
      "governance capabilities must enable deterministic PLAIN referenda.",
    );
  }

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
    citizenshipAssetId: exactText(
      capabilities.citizenship_asset_id,
      "governance capabilities.citizenship_asset_id",
    ),
    citizenshipBondAmount: exactDecimal(
      capabilities.citizenship_bond_amount,
      "governance capabilities.citizenship_bond_amount",
      { positive: true },
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
    parsed.networkPrefix !== TAIRA_GOVERNANCE_NETWORK_PREFIX ||
    parsed.abiVersion !== TAIRA_GOVERNANCE_ABI_VERSION ||
    parsed.dataModelVersion !== TAIRA_GOVERNANCE_DATA_MODEL_VERSION ||
    parsed.windowSpan !== TAIRA_GOVERNANCE_WINDOW_SPAN ||
    parsed.minEnactmentDelay !== TAIRA_GOVERNANCE_MIN_ENACTMENT_DELAY ||
    parsed.approvalThresholdNumerator >= parsed.approvalThresholdDenominator ||
    parsed.parliamentQuorumBps > 10_000
  ) {
    throw new TypeError(
      "governance capabilities do not match the reviewed Taira release.",
    );
  }

  return parsed;
}

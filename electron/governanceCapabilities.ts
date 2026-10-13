import { createHash } from "node:crypto";
import { normalizeCanonicalAccountIdLiteral } from "./accountAddress";
import {
  TAIRA_CHAIN_ID,
  TAIRA_NETWORK_PREFIX,
} from "../src/utils/firstReleaseNetworkIdentity";

export const TAIRA_GOVERNANCE_CHAIN_ID = TAIRA_CHAIN_ID;
export const TAIRA_GOVERNANCE_NETWORK_PREFIX = TAIRA_NETWORK_PREFIX;
export const TAIRA_GOVERNANCE_ABI_VERSION = 1;
export const TAIRA_GOVERNANCE_DATA_MODEL_VERSION = 4;
export const TAIRA_GOVERNANCE_XOR_ASSET_ID = "6TEAJqbb8oEPmLncoNiMRbLEK6tw";
export const TAIRA_GOVERNANCE_ESCROW_ACCOUNT =
  "testuﾛ1NfｷgﾉﾓﾉBｦKﾌﾘﾒoﾇﾂﾛrG81ﾋjWﾎﾕVncwﾌSｱ3pﾘﾋﾉhUS9Q76";

export const GOVERNANCE_BODY_KEYS = [
  "rules_committee",
  "agenda_council",
  "interest_panel",
  "review_panel",
  "coordination_council",
  "mpc_committee",
  "fma_committee",
  "oversight_committee",
  "policy_jury",
  "confirmation_jury",
] as const;

export type GovernanceBodyKey = (typeof GOVERNANCE_BODY_KEYS)[number];

export const TAIRA_GOVERNANCE_TARGET_BODY_SIZES = Object.freeze({
  rules_committee: 7,
  agenda_council: 9,
  interest_panel: 11,
  review_panel: 13,
  coordination_council: 150,
  mpc_committee: 50,
  fma_committee: 5,
  oversight_committee: 7,
  policy_jury: 25,
  confirmation_jury: 1_000,
} satisfies Record<GovernanceBodyKey, number>);

export const TAIRA_GOVERNANCE_PRIVATE_BALLOT_BOUNDS = Object.freeze({
  minEnactmentDelay: 600,
  invitationPhaseBlocks: 3_600,
  registrationPhaseBlocks: 3_600,
  survivorFreezePhaseBlocks: 1_000,
  commitmentPhaseBlocks: 3_600,
  releaseDelayBlocks: 600,
  openingPhaseBlocks: 600,
  maxBallotRetries: 3,
  maxCorpusEntries: 1_000,
});

export const GOVERNANCE_REQUIRED_PROPOSAL_KINDS = [
  "DEPLOY_CONTRACT",
  "RUNTIME_UPGRADE",
  "SCCP_ROUTE_GOVERNANCE",
  "VALIDATION_FEE_POLICY",
  "VALIDATION_FEE_PAYOUT_LIFECYCLE",
  "MUSUBI_REGISTRY_GOVERNANCE",
  "SORAFS_PROVIDER_GOVERNANCE",
  "CONTRACT_LIFECYCLE_GOVERNANCE",
  "CONTRACT_EMERGENCY_HOLD",
  "GLOBAL_DATA_TRIGGER_PERMISSION_GOVERNANCE",
] as const;

export const GOVERNANCE_REQUIRED_ROUTES = [
  "/v1/gov/capabilities",
  "/v1/gov/citizens/draft",
  "/v1/gov/parliament/attempts/draft",
  "/v1/gov/parliament/attempts/{governance_attempt_id}",
  "/v1/gov/parliament/ballots/{ballot_attempt_id}/casting-context",
  "/v1/gov/parliament/ballots/{ballot_attempt_id}/casting-proof",
  "/v1/gov/parliament/ballots/{ballot_attempt_id}/release-context",
  "/v1/gov/parliament/ballots/{ballot_attempt_id}/partial-release",
  "/v1/gov/parliament/transitions/draft",
  "/v1/gov/ballots/plain",
  "/v1/gov/ballots/zk-v1",
  "/v1/gov/ballots/zk-v1/ballot-proof",
  "/v1/validation-fee/proposals",
  "/v1/validation-fee/proposals/{proposal_id}",
  "/v1/validation-fee/proposals/draft",
] as const;

export interface GovernanceCapabilitiesV1 {
  schema: "iroha.governance.capabilities.v1";
  version: 1;
  /** Endpoint-derived, pinned NetworkId the capabilities were checked against. */
  networkId: string;
  currentHeight: string;
  networkPrefix: typeof TAIRA_GOVERNANCE_NETWORK_PREFIX;
  abiVersion: typeof TAIRA_GOVERNANCE_ABI_VERSION;
  dataModelVersion: typeof TAIRA_GOVERNANCE_DATA_MODEL_VERSION;
  approvalMode: "PARLIAMENT_ATTEMPT_TIMED_OVN_V1";
  privateBallotProtocol: "TIMED_OVN_TLE_THRESHOLD_BLS_V1";
  mandatoryPrivateBallots: true;
  proposalBackedReferendumBallotsSupported: false;
  standalonePlainBallotsSupported: true;
  standaloneZkBallotsSupported: true;
  citizenshipAssetId: typeof TAIRA_GOVERNANCE_XOR_ASSET_ID;
  citizenshipBondAmount: "10000";
  citizenshipEscrowAccount: typeof TAIRA_GOVERNANCE_ESCROW_ACCOUNT;
  votingAssetId: typeof TAIRA_GOVERNANCE_XOR_ASSET_ID;
  minBondAmount: "150";
  bondEscrowAccount: typeof TAIRA_GOVERNANCE_ESCROW_ACCOUNT;
  minEnactmentDelay: 600;
  invitationPhaseBlocks: 3_600;
  registrationPhaseBlocks: 3_600;
  survivorFreezePhaseBlocks: 1_000;
  commitmentPhaseBlocks: 3_600;
  releaseDelayBlocks: 600;
  openingPhaseBlocks: 600;
  maxBallotRetries: 3;
  maxCorpusEntries: 1_000;
  targetBodySizes: {
    [Body in GovernanceBodyKey]: (typeof TAIRA_GOVERNANCE_TARGET_BODY_SIZES)[Body];
  };
  supportedProposalKinds: Array<
    (typeof GOVERNANCE_REQUIRED_PROPOSAL_KINDS)[number]
  >;
  supportedRoutes: Array<(typeof GOVERNANCE_REQUIRED_ROUTES)[number]>;
}

const GOVERNANCE_CAPABILITIES_CONTRACT_FINGERPRINT_DOMAIN =
  "iroha.wallet.governance-capabilities-contract.v1";

/** Fingerprint the immutable write contract, excluding only moving height. */
export function governanceCapabilitiesContractFingerprintV1(
  capabilities: Readonly<GovernanceCapabilitiesV1>,
): string {
  const contract = {
    schema: capabilities.schema,
    version: capabilities.version,
    networkId: capabilities.networkId,
    networkPrefix: capabilities.networkPrefix,
    abiVersion: capabilities.abiVersion,
    dataModelVersion: capabilities.dataModelVersion,
    approvalMode: capabilities.approvalMode,
    privateBallotProtocol: capabilities.privateBallotProtocol,
    mandatoryPrivateBallots: capabilities.mandatoryPrivateBallots,
    proposalBackedReferendumBallotsSupported:
      capabilities.proposalBackedReferendumBallotsSupported,
    standalonePlainBallotsSupported:
      capabilities.standalonePlainBallotsSupported,
    standaloneZkBallotsSupported: capabilities.standaloneZkBallotsSupported,
    citizenshipAssetId: capabilities.citizenshipAssetId,
    citizenshipBondAmount: capabilities.citizenshipBondAmount,
    citizenshipEscrowAccount: capabilities.citizenshipEscrowAccount,
    votingAssetId: capabilities.votingAssetId,
    minBondAmount: capabilities.minBondAmount,
    bondEscrowAccount: capabilities.bondEscrowAccount,
    minEnactmentDelay: capabilities.minEnactmentDelay,
    invitationPhaseBlocks: capabilities.invitationPhaseBlocks,
    registrationPhaseBlocks: capabilities.registrationPhaseBlocks,
    survivorFreezePhaseBlocks: capabilities.survivorFreezePhaseBlocks,
    commitmentPhaseBlocks: capabilities.commitmentPhaseBlocks,
    releaseDelayBlocks: capabilities.releaseDelayBlocks,
    openingPhaseBlocks: capabilities.openingPhaseBlocks,
    maxBallotRetries: capabilities.maxBallotRetries,
    maxCorpusEntries: capabilities.maxCorpusEntries,
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
    "bond_escrow_account",
    "citizenship_asset_id",
    "citizenship_bond_amount",
    "citizenship_escrow_account",
    "commitment_phase_blocks",
    "current_height",
    "data_model_version",
    "invitation_phase_blocks",
    "mandatory_private_ballots",
    "max_ballot_retries",
    "max_corpus_entries",
    "min_bond_amount",
    "min_enactment_delay",
    "network_id",
    "network_prefix",
    "opening_phase_blocks",
    "private_ballot_protocol",
    "proposal_backed_referendum_ballots_supported",
    "registration_phase_blocks",
    "release_delay_blocks",
    "schema",
    "standalone_plain_ballots_supported",
    "standalone_zk_ballots_supported",
    "supported_proposal_kinds",
    "supported_routes",
    "survivor_freeze_phase_blocks",
    "target_body_sizes",
    "version",
    "voting_asset_id",
  ].sort(),
);

const record = (value: unknown, label: string): PlainRecord => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${label} must be a plain object.`);
  }
  return value as PlainRecord;
};

const exactKeys = (
  value: PlainRecord,
  expected: readonly string[],
  label: string,
): void => {
  const ownKeys = Reflect.ownKeys(value);
  if (
    ownKeys.some((key) => typeof key !== "string") ||
    ownKeys.some((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return !descriptor?.enumerable || !("value" in descriptor);
    })
  ) {
    throw new TypeError(`${label} must contain enumerable JSON data fields.`);
  }
  const actual = (ownKeys as string[]).sort();
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

const U64_MAX = (1n << 64n) - 1n;

const exactU64Text = (
  value: unknown,
  label: string,
  options: { positive?: boolean } = {},
): string => {
  if (typeof value !== "string" || !/^(?:0|[1-9]\d*)$/u.test(value)) {
    throw new TypeError(`${label} must be a canonical uint64 string.`);
  }
  const parsed = BigInt(value);
  if (parsed > U64_MAX || (options.positive && parsed === 0n)) {
    throw new TypeError(`${label} is outside uint64.`);
  }
  return value;
};

const exactSafeInteger = (
  value: unknown,
  label: string,
  options: { positive?: boolean } = {},
): number => {
  const literal = exactU64Text(value, label, options);
  const parsed = BigInt(literal);
  if (parsed > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new TypeError(`${label} is outside the exactly representable range.`);
  }
  return Number(parsed);
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

const exactStringArray = (value: unknown, label: string): string[] => {
  if (
    !Array.isArray(value) ||
    value.some(
      (entry) =>
        typeof entry !== "string" ||
        entry.length === 0 ||
        entry.trim() !== entry,
    ) ||
    new Set(value).size !== value.length
  ) {
    throw new TypeError(
      `${label} must be an array of unique canonical strings.`,
    );
  }
  return [...value];
};

const exactSet = <T extends string>(
  actual: string[],
  expected: readonly T[],
  label: string,
): T[] => {
  if (
    actual.length !== expected.length ||
    expected.some((entry) => !actual.includes(entry))
  ) {
    throw new TypeError(`${label} differs from the first-release contract.`);
  }
  return actual as T[];
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
      exactSafeInteger(
        sizes[body],
        `governance capabilities.target_body_sizes.${body}`,
        { positive: true },
      ),
    ]),
  ) as Record<GovernanceBodyKey, number>;
};

/**
 * Parse the current Torii V1 readiness projection. Aliases, retired fields,
 * and unreviewed values are rejected before a governance write can be drafted.
 */
export function parseGovernanceCapabilitiesV1(
  value: unknown,
  expectedNetworkId: string,
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

  const networkId = exactText(
    capabilities.network_id,
    "governance capabilities.network_id",
  );
  if (
    !/^hash:[0-9A-F]{64}#[0-9A-F]{4}$/u.test(networkId) ||
    networkId !== expectedNetworkId
  ) {
    throw new TypeError(
      "governance capabilities.network_id differs from the endpoint's pinned NetworkId.",
    );
  }
  if (
    capabilities.approval_mode !== "PARLIAMENT_ATTEMPT_TIMED_OVN_V1" ||
    capabilities.private_ballot_protocol !== "TIMED_OVN_TLE_THRESHOLD_BLS_V1" ||
    capabilities.mandatory_private_ballots !== true ||
    capabilities.proposal_backed_referendum_ballots_supported !== false ||
    capabilities.standalone_plain_ballots_supported !== true ||
    capabilities.standalone_zk_ballots_supported !== true
  ) {
    throw new TypeError(
      "governance capabilities do not require the reviewed timed-OVN private Parliament contract.",
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

  const supportedProposalKinds = exactSet(
    exactStringArray(
      capabilities.supported_proposal_kinds,
      "governance capabilities.supported_proposal_kinds",
    ),
    GOVERNANCE_REQUIRED_PROPOSAL_KINDS,
    "governance capabilities.supported_proposal_kinds",
  );
  const supportedRoutes = exactSet(
    exactStringArray(
      capabilities.supported_routes,
      "governance capabilities.supported_routes",
    ),
    GOVERNANCE_REQUIRED_ROUTES,
    "governance capabilities.supported_routes",
  );

  const parsed = {
    schema: "iroha.governance.capabilities.v1" as const,
    version: 1 as const,
    networkId,
    currentHeight: exactU64Text(
      capabilities.current_height,
      "governance capabilities.current_height",
      { positive: true },
    ),
    networkPrefix: exactSafeInteger(
      capabilities.network_prefix,
      "governance capabilities.network_prefix",
      { positive: true },
    ),
    abiVersion: exactSafeInteger(
      capabilities.abi_version,
      "governance capabilities.abi_version",
      { positive: true },
    ),
    dataModelVersion: exactSafeInteger(
      capabilities.data_model_version,
      "governance capabilities.data_model_version",
      { positive: true },
    ),
    approvalMode: "PARLIAMENT_ATTEMPT_TIMED_OVN_V1" as const,
    privateBallotProtocol: "TIMED_OVN_TLE_THRESHOLD_BLS_V1" as const,
    mandatoryPrivateBallots: true as const,
    proposalBackedReferendumBallotsSupported: false as const,
    standalonePlainBallotsSupported: true as const,
    standaloneZkBallotsSupported: true as const,
    citizenshipAssetId: exactText(
      capabilities.citizenship_asset_id,
      "governance capabilities.citizenship_asset_id",
    ),
    citizenshipBondAmount: exactDecimal(
      capabilities.citizenship_bond_amount,
      "governance capabilities.citizenship_bond_amount",
      { positive: true },
    ),
    citizenshipEscrowAccount: exactTairaAccount(
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
    minEnactmentDelay: exactSafeInteger(
      capabilities.min_enactment_delay,
      "governance capabilities.min_enactment_delay",
      { positive: true },
    ),
    invitationPhaseBlocks: exactSafeInteger(
      capabilities.invitation_phase_blocks,
      "governance capabilities.invitation_phase_blocks",
      { positive: true },
    ),
    registrationPhaseBlocks: exactSafeInteger(
      capabilities.registration_phase_blocks,
      "governance capabilities.registration_phase_blocks",
      { positive: true },
    ),
    survivorFreezePhaseBlocks: exactSafeInteger(
      capabilities.survivor_freeze_phase_blocks,
      "governance capabilities.survivor_freeze_phase_blocks",
      { positive: true },
    ),
    commitmentPhaseBlocks: exactSafeInteger(
      capabilities.commitment_phase_blocks,
      "governance capabilities.commitment_phase_blocks",
      { positive: true },
    ),
    releaseDelayBlocks: exactSafeInteger(
      capabilities.release_delay_blocks,
      "governance capabilities.release_delay_blocks",
      { positive: true },
    ),
    openingPhaseBlocks: exactSafeInteger(
      capabilities.opening_phase_blocks,
      "governance capabilities.opening_phase_blocks",
      { positive: true },
    ),
    maxBallotRetries: exactSafeInteger(
      capabilities.max_ballot_retries,
      "governance capabilities.max_ballot_retries",
    ),
    maxCorpusEntries: exactSafeInteger(
      capabilities.max_corpus_entries,
      "governance capabilities.max_corpus_entries",
      { positive: true },
    ),
    targetBodySizes: bodySizes,
    supportedProposalKinds,
    supportedRoutes,
  };

  if (
    parsed.networkPrefix !== TAIRA_GOVERNANCE_NETWORK_PREFIX ||
    parsed.abiVersion !== TAIRA_GOVERNANCE_ABI_VERSION ||
    parsed.dataModelVersion !== TAIRA_GOVERNANCE_DATA_MODEL_VERSION ||
    parsed.citizenshipAssetId !== TAIRA_GOVERNANCE_XOR_ASSET_ID ||
    parsed.citizenshipBondAmount !== "10000" ||
    parsed.citizenshipEscrowAccount !== TAIRA_GOVERNANCE_ESCROW_ACCOUNT ||
    parsed.votingAssetId !== TAIRA_GOVERNANCE_XOR_ASSET_ID ||
    parsed.minBondAmount !== "150" ||
    parsed.bondEscrowAccount !== TAIRA_GOVERNANCE_ESCROW_ACCOUNT ||
    parsed.minEnactmentDelay !==
      TAIRA_GOVERNANCE_PRIVATE_BALLOT_BOUNDS.minEnactmentDelay ||
    parsed.invitationPhaseBlocks !==
      TAIRA_GOVERNANCE_PRIVATE_BALLOT_BOUNDS.invitationPhaseBlocks ||
    parsed.registrationPhaseBlocks !==
      TAIRA_GOVERNANCE_PRIVATE_BALLOT_BOUNDS.registrationPhaseBlocks ||
    parsed.survivorFreezePhaseBlocks !==
      TAIRA_GOVERNANCE_PRIVATE_BALLOT_BOUNDS.survivorFreezePhaseBlocks ||
    parsed.commitmentPhaseBlocks !==
      TAIRA_GOVERNANCE_PRIVATE_BALLOT_BOUNDS.commitmentPhaseBlocks ||
    parsed.releaseDelayBlocks !==
      TAIRA_GOVERNANCE_PRIVATE_BALLOT_BOUNDS.releaseDelayBlocks ||
    parsed.openingPhaseBlocks !==
      TAIRA_GOVERNANCE_PRIVATE_BALLOT_BOUNDS.openingPhaseBlocks ||
    parsed.maxBallotRetries !==
      TAIRA_GOVERNANCE_PRIVATE_BALLOT_BOUNDS.maxBallotRetries ||
    parsed.maxCorpusEntries !==
      TAIRA_GOVERNANCE_PRIVATE_BALLOT_BOUNDS.maxCorpusEntries
  ) {
    throw new TypeError(
      "governance capabilities do not match the reviewed Taira release.",
    );
  }

  return parsed as GovernanceCapabilitiesV1;
}

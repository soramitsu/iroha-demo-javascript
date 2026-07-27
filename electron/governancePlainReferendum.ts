import { createHash } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { normalizeCanonicalAccountIdLiteral } from "./accountAddress";
import {
  TAIRA_GOVERNANCE_CHAIN_ID,
  TAIRA_GOVERNANCE_GENESIS_HASH,
  TAIRA_GOVERNANCE_NETWORK_PREFIX,
} from "./governanceCapabilities";
import {
  loadSecureBoundedJson,
  parseStrictJson,
  secureWriteBoundedFile,
} from "./secureBoundedJson";

export const GOVERNANCE_PLAIN_REFERENDUM_IPC_CHANNEL =
  "governance:getPlainReferendumContract";
export const GOVERNANCE_PLAIN_REFERENDUM_SCHEMA =
  "sora.parliament.plain-referendum.v2";
export const GOVERNANCE_PLAIN_REFERENDUM_SOURCE_SCHEMA =
  "sora.wallet.governance-referendum-source.v1";
export const GOVERNANCE_PLAIN_REFERENDUM_HANDOFF_SCHEMA =
  "sora.wallet.governance-referendum-handoff.v1";
export const GOVERNANCE_PLAIN_REFERENDUM_SOURCE_RESOURCE =
  "governance/governance-referendum-source.json";
export const GOVERNANCE_PLAIN_REFERENDUM_DESCRIPTOR_URL =
  "https://cbsi-core.soramitsu.io/governance/plain-referendum/current.json";
export const GOVERNANCE_PLAIN_REFERENDUM_ARTIFACT_BASE_URL =
  "https://cbsi-core.soramitsu.io/governance/plain-referendum/artifacts";
export const GOVERNANCE_PLAIN_REFERENDUM_FINALITY_FILENAME =
  "governance-plain-referendum-finality.json";
export const GOVERNANCE_PLAIN_REFERENDUM_FINALITY_MARKER_FILENAME =
  "governance-plain-referendum-finality.initialized.json";

const ELIGIBLE_CITIZENS_INPUT_SCHEMA = "taira.governance-eligible-citizens.v1";
const ELIGIBLE_CITIZEN_SNAPSHOT_SCHEMA =
  "taira.governance-eligible-citizen-snapshot.v1";
const POST_PARLIAMENT_REGISTRATION_GATE_SCHEMA =
  "taira.governance-post-parliament-registration-gate.v1";
const FINALITY_SCHEMA = "sora.wallet.governance-referendum-finality.v1";
const FINALITY_MARKER_SCHEMA =
  "sora.wallet.governance-referendum-finality-marker.v1";
const MAX_SOURCE_BYTES = 64 * 1024;
const MAX_DESCRIPTOR_BYTES = 64 * 1024;
const MAX_CONTRACT_BYTES = 1024 * 1024;
const MAX_FINALITY_BYTES = 64 * 1024;
const MAX_FINALITY_MARKER_BYTES = 1024;
const FETCH_TIMEOUT_MS = 15_000;
const MAX_ELIGIBLE_CITIZENS = 256;
const WINDOW_BLOCKS = 3600n;
const EXACT_BALLOT_AMOUNT = "150";
const EXACT_BALLOT_DURATION = "3600";
const EXACT_CITIZEN_BOND = "10000";
const EXACT_VOTING_ASSET_ID = "6TEAJqbb8oEPmLncoNiMRbLEK6tw";
const LOWER_HASH = /^[0-9a-f]{64}$/u;
const REPEATED_BYTE_HASH = /^([0-9a-f]{2})\1{31}$/u;
const DECIMAL = /^(?:0|[1-9][0-9]*)$/u;
const PLACEHOLDER =
  /(?:<[^>]+>|\b(?:placeholder|replace[_ -]?me|change[_ -]?me|example|todo|tbd)\b)/iu;

export type GovernancePlainReferendumCitizen = {
  accountId: string;
  amount: "10000";
  bondedHeight: string;
};

export type GovernancePostParliamentRegistrationGate = {
  schema: "taira.governance-post-parliament-registration-gate.v1";
  chainId: typeof TAIRA_GOVERNANCE_CHAIN_ID;
  genesisHash: string;
  inputsSha256: string;
  proposalId: string;
  referendumId: string;
  hStart: string;
  hEnd: string;
  mode: "Plain";
  operatorAccountId: string;
  eligibleCitizenRosterSha256: string;
  gateHeight: string;
  gateObservationSequence: string;
  networkCheckpointSha256: string;
  parliamentSnapshotSha256: string;
  approvedBodyProgressSha256: string;
};

export type GovernancePlainElectorateRules = {
  votingAssetId: typeof EXACT_VOTING_ASSET_ID;
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
};

export type GovernancePlainReferendumContract = {
  schema: typeof GOVERNANCE_PLAIN_REFERENDUM_SCHEMA;
  chainId: typeof TAIRA_GOVERNANCE_CHAIN_ID;
  genesisHash: string;
  inputsSha256: string;
  proposalId: string;
  referendumId: string;
  hStart: string;
  hEnd: string;
  mode: "Plain";
  postParliamentRegistrationGate: GovernancePostParliamentRegistrationGate;
  eligibleCitizenRosterSha256: string;
  eligibleCitizenCount: string;
  eligibleCitizens: GovernancePlainReferendumCitizen[];
  snapshotFinalizedHeight: string;
  snapshotObservationSequence: string;
  networkCheckpointSha256: string;
  eligibleCitizenSnapshotSha256: string;
  plainElectorate: {
    rules: GovernancePlainElectorateRules;
    parliamentApprovalGateHeight: string;
    sealedAtHeight: string;
    rosterRoot: string;
    electorateSealHash: string;
    members: GovernancePlainReferendumCitizen[];
  };
  ballot: {
    draftRoute: string;
    requestVersion: 1;
    amount: "150";
    durationBlocks: "3600";
    directions: ["Aye", "Nay", "Abstain"];
    termsDerivedByCore: true;
    oneEffectiveBallotPerAccount: true;
  };
};

export type GovernancePlainReferendumSource = {
  schema: typeof GOVERNANCE_PLAIN_REFERENDUM_SOURCE_SCHEMA;
  chainId: typeof TAIRA_GOVERNANCE_CHAIN_ID;
  networkPrefix: typeof TAIRA_GOVERNANCE_NETWORK_PREFIX;
  genesisHash: string;
  descriptorUrl: string;
  artifactBaseUrl: string;
};

export type GovernancePlainReferendumObservedIdentity = {
  chainId: typeof TAIRA_GOVERNANCE_CHAIN_ID;
  networkPrefix: typeof TAIRA_GOVERNANCE_NETWORK_PREFIX;
  genesisHash: string;
};

export type LoadedGovernancePlainReferendumContract = {
  contract: GovernancePlainReferendumContract;
  contractFingerprint: string;
  artifactSha256: string;
  source: {
    descriptorUrl: string;
    artifactUrl: string;
  };
};

type JsonRecord = Record<string, unknown>;

const exactRecord = (
  value: unknown,
  keys: readonly string[],
  label: string,
): JsonRecord => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  const record = value as JsonRecord;
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw new Error(`${label} contains missing or unknown fields.`);
  }
  return record;
};

const exactText = (value: unknown, label: string): string => {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value ||
    PLACEHOLDER.test(value)
  ) {
    throw new Error(`${label} must be canonical, non-placeholder text.`);
  }
  return value;
};

const exactHash = (value: unknown, label: string): string => {
  const hash = exactText(value, label);
  if (!LOWER_HASH.test(hash) || REPEATED_BYTE_HASH.test(hash)) {
    throw new Error(
      `${label} must be a non-placeholder lowercase 64-hex hash.`,
    );
  }
  return hash;
};

const exactDecimal = (
  value: unknown,
  label: string,
  options: { positive?: boolean } = {},
): string => {
  const literal = exactText(value, label);
  if (!DECIMAL.test(literal) || (options.positive && literal === "0")) {
    throw new Error(`${label} must be a canonical decimal integer.`);
  }
  const parsed = BigInt(literal);
  if (parsed > (1n << 64n) - 1n) {
    throw new Error(`${label} exceeds uint64.`);
  }
  return literal;
};

const exactTairaAccount = (value: unknown, label: string): string => {
  const literal = exactText(value, label);
  if (Buffer.byteLength(literal, "utf8") > 512) {
    throw new Error(`${label} exceeds the native account-address byte bound.`);
  }
  let canonical: string;
  try {
    canonical = normalizeCanonicalAccountIdLiteral(
      literal,
      label,
      TAIRA_GOVERNANCE_NETWORK_PREFIX,
    );
  } catch (error) {
    throw new Error(
      `${label} is not a native Taira account address: ${String(error)}`,
    );
  }
  if (canonical !== literal) {
    throw new Error(`${label} is not the canonical native Taira rendering.`);
  }
  return canonical;
};

const exactHttpsUrl = (value: unknown, label: string): string => {
  const literal = exactText(value, label);
  let parsed: URL;
  try {
    parsed = new URL(literal);
  } catch {
    throw new Error(`${label} must be an absolute HTTPS URL.`);
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    parsed.href !== literal
  ) {
    throw new Error(`${label} must be a canonical credential-free HTTPS URL.`);
  }
  return literal;
};

const canonicalJsonValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalJsonValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as JsonRecord)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, nested]) => [key, canonicalJsonValue(nested)]),
    );
  }
  return value;
};

const canonicalJson = (value: unknown): string =>
  JSON.stringify(canonicalJsonValue(value));

export const governancePlainReferendumCanonicalSha256 = (
  value: unknown,
): string =>
  createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");

const sha256 = (value: Buffer | string): string =>
  createHash("sha256").update(value).digest("hex");

const utf8Order = (left: string, right: string): number =>
  Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));

const rawSnapshot = (contract: JsonRecord): JsonRecord => ({
  schema: ELIGIBLE_CITIZEN_SNAPSHOT_SCHEMA,
  chain_id: contract.chain_id,
  genesis_hash: contract.genesis_hash,
  inputs_sha256: contract.inputs_sha256,
  proposal_id: contract.proposal_id,
  referendum_id: contract.referendum_id,
  referendum_window: contract.referendum_window,
  mode: contract.mode,
  post_parliament_registration_gate: contract.post_parliament_registration_gate,
  eligible_citizen_roster_sha256: contract.eligible_citizen_roster_sha256,
  eligible_citizen_count: contract.eligible_citizen_count,
  eligible_citizens: contract.eligible_citizens,
  snapshot_finalized_height: contract.snapshot_finalized_height,
  snapshot_observation_sequence: contract.snapshot_observation_sequence,
  network_checkpoint_sha256: contract.network_checkpoint_sha256,
});

const parseCitizen = (
  value: unknown,
  index: number,
  snapshotFinalizedHeight: string,
  operatorAccountId: string,
  gateHeight: string,
): GovernancePlainReferendumCitizen => {
  const citizen = exactRecord(
    value,
    ["account_id", "amount", "bonded_height"],
    `Eligible citizen ${index + 1}`,
  );
  const accountId = exactTairaAccount(
    citizen.account_id,
    `Eligible citizen ${index + 1} account_id`,
  );
  if (citizen.amount !== EXACT_CITIZEN_BOND) {
    throw new Error(`Eligible citizen ${accountId} has a different bond.`);
  }
  const bondedHeight = exactDecimal(
    citizen.bonded_height,
    `Eligible citizen ${accountId} bonded_height`,
    { positive: true },
  );
  if (BigInt(bondedHeight) > BigInt(snapshotFinalizedHeight)) {
    throw new Error(
      `Eligible citizen ${accountId} was not finalized at snapshot height.`,
    );
  }
  if (
    (accountId === operatorAccountId &&
      BigInt(bondedHeight) > BigInt(gateHeight)) ||
    (accountId !== operatorAccountId &&
      BigInt(bondedHeight) <= BigInt(gateHeight))
  ) {
    throw new Error(
      `Eligible citizen ${accountId} violates the finalized post-Parliament registration gate.`,
    );
  }
  return { accountId, amount: EXACT_CITIZEN_BOND, bondedHeight };
};

const rawCitizen = (citizen: GovernancePlainReferendumCitizen) => ({
  account_id: citizen.accountId,
  amount: citizen.amount,
  bonded_height: citizen.bondedHeight,
});

const parsePlainElectorateRules = (
  value: unknown,
): GovernancePlainElectorateRules => {
  const rules = exactRecord(
    value,
    [
      "voting_asset_id",
      "ballot_amount",
      "ballot_duration_blocks",
      "citizenship_amount",
      "max_members",
      "conviction_step_blocks",
      "max_conviction",
      "min_turnout",
      "approval_threshold_numerator",
      "approval_threshold_denominator",
      "eligibility_rule",
    ],
    "Governance plain_electorate.rules",
  );
  const eligibility = exactRecord(
    rules.eligibility_rule,
    ["rule", "value"],
    "Governance plain_electorate.rules.eligibility_rule",
  );
  if (
    rules.voting_asset_id !== EXACT_VOTING_ASSET_ID ||
    rules.ballot_amount !== EXACT_BALLOT_AMOUNT ||
    rules.ballot_duration_blocks !== EXACT_BALLOT_DURATION ||
    rules.citizenship_amount !== EXACT_CITIZEN_BOND ||
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
    throw new Error(
      "Governance PLAIN electorate rules differ from the exact first-release contract.",
    );
  }
  return {
    votingAssetId: EXACT_VOTING_ASSET_ID,
    ballotAmount: EXACT_BALLOT_AMOUNT,
    ballotDurationBlocks: EXACT_BALLOT_DURATION,
    citizenshipAmount: EXACT_CITIZEN_BOND,
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

export const parseGovernancePlainReferendumContract = (
  value: unknown,
  options: { expectedGenesisHash: string; artifactSha256?: string },
): LoadedGovernancePlainReferendumContract => {
  const raw = exactRecord(
    value,
    [
      "schema",
      "chain_id",
      "genesis_hash",
      "inputs_sha256",
      "proposal_id",
      "referendum_id",
      "referendum_window",
      "mode",
      "post_parliament_registration_gate",
      "eligible_citizen_roster_sha256",
      "eligible_citizen_count",
      "eligible_citizens",
      "snapshot_finalized_height",
      "snapshot_observation_sequence",
      "network_checkpoint_sha256",
      "eligible_citizen_snapshot_sha256",
      "plain_electorate",
      "ballot_contract",
    ],
    "Governance PLAIN referendum contract",
  );
  if (
    raw.schema !== GOVERNANCE_PLAIN_REFERENDUM_SCHEMA ||
    raw.chain_id !== TAIRA_GOVERNANCE_CHAIN_ID ||
    raw.mode !== "Plain"
  ) {
    throw new Error(
      "Governance PLAIN referendum contract must identify exact Taira PLAIN voting.",
    );
  }
  const expectedGenesisHash = exactHash(
    options.expectedGenesisHash,
    "Expected Taira genesis hash",
  );
  const genesisHash = exactHash(raw.genesis_hash, "Contract genesis_hash");
  if (genesisHash !== expectedGenesisHash) {
    throw new Error(
      "Governance PLAIN referendum contract targets a different Taira genesis.",
    );
  }
  const inputsSha256 = exactHash(raw.inputs_sha256, "Contract inputs_sha256");
  const proposalId = exactHash(raw.proposal_id, "Contract proposal_id");
  const referendumId = exactHash(raw.referendum_id, "Contract referendum_id");
  if (proposalId !== referendumId) {
    throw new Error("Governance proposal and referendum IDs differ.");
  }
  const window = exactRecord(
    raw.referendum_window,
    ["lower", "upper"],
    "Governance referendum_window",
  );
  const hStart = exactDecimal(window.lower, "Governance window lower", {
    positive: true,
  });
  const hEnd = exactDecimal(window.upper, "Governance window upper", {
    positive: true,
  });
  if (BigInt(hEnd) - BigInt(hStart) + 1n !== WINDOW_BLOCKS) {
    throw new Error("Governance referendum window must be 3,600 blocks.");
  }
  const eligibleCitizenRosterSha256 = exactHash(
    raw.eligible_citizen_roster_sha256,
    "Eligible citizen roster SHA-256",
  );
  const rawRegistrationGate = exactRecord(
    raw.post_parliament_registration_gate,
    [
      "schema",
      "chain_id",
      "genesis_hash",
      "inputs_sha256",
      "proposal_id",
      "referendum_id",
      "referendum_window",
      "mode",
      "operator_account_id",
      "eligible_citizen_roster_sha256",
      "gate_height",
      "gate_observation_sequence",
      "network_checkpoint_sha256",
      "parliament_snapshot_sha256",
      "approved_body_progress_sha256",
    ],
    "Post-Parliament citizen-registration gate",
  );
  const gateWindow = exactRecord(
    rawRegistrationGate.referendum_window,
    ["lower", "upper"],
    "Post-Parliament registration gate referendum_window",
  );
  const operatorAccountId = exactTairaAccount(
    rawRegistrationGate.operator_account_id,
    "Post-Parliament registration gate operator_account_id",
  );
  const gateHeight = exactDecimal(
    rawRegistrationGate.gate_height,
    "Post-Parliament registration gate height",
    { positive: true },
  );
  const gateObservationSequence = exactDecimal(
    rawRegistrationGate.gate_observation_sequence,
    "Post-Parliament registration gate observation sequence",
    { positive: true },
  );
  const gateNetworkCheckpointSha256 = exactHash(
    rawRegistrationGate.network_checkpoint_sha256,
    "Post-Parliament registration gate network checkpoint SHA-256",
  );
  const parliamentSnapshotSha256 = exactHash(
    rawRegistrationGate.parliament_snapshot_sha256,
    "Post-Parliament registration gate Parliament snapshot SHA-256",
  );
  const approvedBodyProgressSha256 = exactHash(
    rawRegistrationGate.approved_body_progress_sha256,
    "Post-Parliament registration gate approved body progress SHA-256",
  );
  if (
    rawRegistrationGate.schema !== POST_PARLIAMENT_REGISTRATION_GATE_SCHEMA ||
    rawRegistrationGate.chain_id !== TAIRA_GOVERNANCE_CHAIN_ID ||
    rawRegistrationGate.genesis_hash !== genesisHash ||
    rawRegistrationGate.inputs_sha256 !== inputsSha256 ||
    rawRegistrationGate.proposal_id !== proposalId ||
    rawRegistrationGate.referendum_id !== referendumId ||
    rawRegistrationGate.mode !== "Plain" ||
    gateWindow.lower !== hStart ||
    gateWindow.upper !== hEnd ||
    rawRegistrationGate.eligible_citizen_roster_sha256 !==
      eligibleCitizenRosterSha256
  ) {
    throw new Error(
      "Post-Parliament registration gate differs from the exact Taira referendum binding.",
    );
  }
  const postParliamentRegistrationGate: GovernancePostParliamentRegistrationGate =
    {
      schema: POST_PARLIAMENT_REGISTRATION_GATE_SCHEMA,
      chainId: TAIRA_GOVERNANCE_CHAIN_ID,
      genesisHash,
      inputsSha256,
      proposalId,
      referendumId,
      hStart,
      hEnd,
      mode: "Plain",
      operatorAccountId,
      eligibleCitizenRosterSha256,
      gateHeight,
      gateObservationSequence,
      networkCheckpointSha256: gateNetworkCheckpointSha256,
      parliamentSnapshotSha256,
      approvedBodyProgressSha256,
    };
  const eligibleCitizenCount = exactDecimal(
    raw.eligible_citizen_count,
    "Eligible citizen count",
    { positive: true },
  );
  if (
    !Array.isArray(raw.eligible_citizens) ||
    raw.eligible_citizens.length === 0 ||
    raw.eligible_citizens.length > MAX_ELIGIBLE_CITIZENS ||
    BigInt(eligibleCitizenCount) !== BigInt(raw.eligible_citizens.length)
  ) {
    throw new Error("Eligible citizen count differs from the frozen roster.");
  }
  const snapshotFinalizedHeight = exactDecimal(
    raw.snapshot_finalized_height,
    "Snapshot finalized height",
    { positive: true },
  );
  const snapshotObservationSequence = exactDecimal(
    raw.snapshot_observation_sequence,
    "Snapshot observation sequence",
    { positive: true },
  );
  if (
    BigInt(snapshotFinalizedHeight) < BigInt(gateHeight) ||
    BigInt(snapshotObservationSequence) < BigInt(gateObservationSequence) ||
    BigInt(gateHeight) >= BigInt(hStart) ||
    BigInt(snapshotFinalizedHeight) >= BigInt(hStart)
  ) {
    throw new Error(
      "Registration gate and eligible citizen snapshot must be finalized after the gate and strictly before h_start.",
    );
  }
  const eligibleCitizens = raw.eligible_citizens.map((citizen, index) =>
    parseCitizen(
      citizen,
      index,
      snapshotFinalizedHeight,
      operatorAccountId,
      gateHeight,
    ),
  );
  const accounts = eligibleCitizens.map(({ accountId }) => accountId);
  if (
    new Set(accounts).size !== accounts.length ||
    accounts.some(
      (account, index) =>
        index > 0 && utf8Order(accounts[index - 1], account) >= 0,
    )
  ) {
    throw new Error(
      "Eligible citizen identities must be unique and in UTF-8 byte order.",
    );
  }
  if (!accounts.includes(operatorAccountId)) {
    throw new Error(
      "Eligible citizen snapshot omits the post-Parliament gate operator.",
    );
  }
  const computedRosterSha256 = governancePlainReferendumCanonicalSha256({
    schema: ELIGIBLE_CITIZENS_INPUT_SCHEMA,
    chain_id: TAIRA_GOVERNANCE_CHAIN_ID,
    genesis_hash: genesisHash,
    accounts,
  });
  if (computedRosterSha256 !== eligibleCitizenRosterSha256) {
    throw new Error(
      "Eligible citizen roster SHA-256 differs from its accounts.",
    );
  }
  const networkCheckpointSha256 = exactHash(
    raw.network_checkpoint_sha256,
    "Network checkpoint SHA-256",
  );
  const eligibleCitizenSnapshotSha256 = exactHash(
    raw.eligible_citizen_snapshot_sha256,
    "Eligible citizen snapshot SHA-256",
  );
  if (
    governancePlainReferendumCanonicalSha256(rawSnapshot(raw)) !==
    eligibleCitizenSnapshotSha256
  ) {
    throw new Error(
      "Eligible citizen snapshot SHA-256 differs from the embedded snapshot.",
    );
  }

  const rawElectorate = exactRecord(
    raw.plain_electorate,
    [
      "rules",
      "parliament_approval_gate_height",
      "sealed_at_height",
      "roster_root",
      "electorate_seal_hash",
      "members",
    ],
    "Governance plain_electorate",
  );
  const rules = parsePlainElectorateRules(rawElectorate.rules);
  const parliamentApprovalGateHeight = exactDecimal(
    rawElectorate.parliament_approval_gate_height,
    "Governance plain_electorate Parliament approval gate height",
    { positive: true },
  );
  const sealedAtHeight = exactDecimal(
    rawElectorate.sealed_at_height,
    "Governance plain_electorate sealed height",
    { positive: true },
  );
  const rosterRoot = exactHash(
    rawElectorate.roster_root,
    "Governance plain_electorate roster root",
  );
  const electorateSealHash = exactHash(
    rawElectorate.electorate_seal_hash,
    "Governance plain_electorate seal hash",
  );
  if (
    parliamentApprovalGateHeight !== gateHeight ||
    BigInt(sealedAtHeight) <= BigInt(gateHeight) ||
    BigInt(sealedAtHeight) < BigInt(snapshotFinalizedHeight) ||
    BigInt(sealedAtHeight) >= BigInt(hStart) ||
    !Array.isArray(rawElectorate.members) ||
    canonicalJson(rawElectorate.members) !==
      canonicalJson(eligibleCitizens.map(rawCitizen))
  ) {
    throw new Error(
      "Governance PLAIN electorate seal differs from the frozen pre-window citizen snapshot.",
    );
  }

  const ballot = exactRecord(
    raw.ballot_contract,
    [
      "draft_route",
      "request_version",
      "amount",
      "duration_blocks",
      "directions",
      "terms_derived_by_core",
      "one_effective_ballot_per_account",
    ],
    "Governance ballot_contract",
  );
  const exactDraftRoute = `/v1/validation-fee/proposals/${proposalId}/plain-ballot/draft`;
  if (
    ballot.draft_route !== exactDraftRoute ||
    ballot.request_version !== 1 ||
    ballot.amount !== EXACT_BALLOT_AMOUNT ||
    ballot.duration_blocks !== EXACT_BALLOT_DURATION ||
    !Array.isArray(ballot.directions) ||
    ballot.directions.length !== 3 ||
    ballot.directions[0] !== "AYE" ||
    ballot.directions[1] !== "NAY" ||
    ballot.directions[2] !== "ABSTAIN" ||
    ballot.terms_derived_by_core !== true ||
    ballot.one_effective_ballot_per_account !== true
  ) {
    throw new Error(
      "Governance ballot contract differs from the proposal-bound typed PLAIN terms.",
    );
  }
  const contractFingerprint = governancePlainReferendumCanonicalSha256(raw);
  const artifactSha256 = options.artifactSha256
    ? exactHash(
        options.artifactSha256,
        "Governance referendum artifact SHA-256",
      )
    : contractFingerprint;
  const contract: GovernancePlainReferendumContract = {
    schema: GOVERNANCE_PLAIN_REFERENDUM_SCHEMA,
    chainId: TAIRA_GOVERNANCE_CHAIN_ID,
    genesisHash,
    inputsSha256,
    proposalId,
    referendumId,
    hStart,
    hEnd,
    mode: "Plain",
    postParliamentRegistrationGate,
    eligibleCitizenRosterSha256,
    eligibleCitizenCount,
    eligibleCitizens,
    snapshotFinalizedHeight,
    snapshotObservationSequence,
    networkCheckpointSha256,
    eligibleCitizenSnapshotSha256,
    plainElectorate: {
      rules,
      parliamentApprovalGateHeight,
      sealedAtHeight,
      rosterRoot,
      electorateSealHash,
      members: eligibleCitizens,
    },
    ballot: {
      draftRoute: exactDraftRoute,
      requestVersion: 1,
      amount: EXACT_BALLOT_AMOUNT,
      durationBlocks: EXACT_BALLOT_DURATION,
      directions: ["Aye", "Nay", "Abstain"],
      termsDerivedByCore: true,
      oneEffectiveBallotPerAccount: true,
    },
  };
  return {
    contract,
    contractFingerprint,
    artifactSha256,
    source: { descriptorUrl: "unbound", artifactUrl: "unbound" },
  };
};

export const parseGovernancePlainReferendumSource = (
  value: unknown,
): GovernancePlainReferendumSource => {
  const raw = exactRecord(
    value,
    [
      "schema",
      "chainId",
      "networkPrefix",
      "genesisHash",
      "descriptorUrl",
      "artifactBaseUrl",
    ],
    "Governance referendum source",
  );
  const genesisHash = exactHash(
    raw.genesisHash,
    "Governance source genesisHash",
  );
  const descriptorUrl = exactHttpsUrl(
    raw.descriptorUrl,
    "Governance source descriptorUrl",
  );
  const artifactBaseUrl = exactHttpsUrl(
    raw.artifactBaseUrl,
    "Governance source artifactBaseUrl",
  );
  const descriptor = new URL(descriptorUrl);
  const artifactBase = new URL(`${artifactBaseUrl}/`);
  if (
    raw.schema !== GOVERNANCE_PLAIN_REFERENDUM_SOURCE_SCHEMA ||
    raw.chainId !== TAIRA_GOVERNANCE_CHAIN_ID ||
    raw.networkPrefix !== TAIRA_GOVERNANCE_NETWORK_PREFIX ||
    genesisHash !== TAIRA_GOVERNANCE_GENESIS_HASH ||
    descriptorUrl !== GOVERNANCE_PLAIN_REFERENDUM_DESCRIPTOR_URL ||
    artifactBaseUrl !== GOVERNANCE_PLAIN_REFERENDUM_ARTIFACT_BASE_URL ||
    descriptor.origin !== artifactBase.origin ||
    !descriptor.pathname.endsWith("/current.json") ||
    !artifactBase.pathname.endsWith("/artifacts/")
  ) {
    throw new Error(
      "Governance referendum source differs from the exact Taira content-addressed handoff.",
    );
  }
  return {
    schema: GOVERNANCE_PLAIN_REFERENDUM_SOURCE_SCHEMA,
    chainId: TAIRA_GOVERNANCE_CHAIN_ID,
    networkPrefix: TAIRA_GOVERNANCE_NETWORK_PREFIX,
    genesisHash,
    descriptorUrl,
    artifactBaseUrl: artifactBaseUrl.replace(/\/$/u, ""),
  };
};

export const loadGovernancePlainReferendumSource = (
  path: string,
): GovernancePlainReferendumSource => {
  const before = lstatSync(path);
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    before.nlink !== 1 ||
    before.size < 1 ||
    before.size > MAX_SOURCE_BYTES
  ) {
    throw new Error(
      "Governance referendum source must be one bounded regular package resource.",
    );
  }
  const bytes = readFileSync(path);
  const after = lstatSync(path);
  if (
    before.dev !== after.dev ||
    before.ino !== after.ino ||
    before.size !== after.size ||
    before.mtimeMs !== after.mtimeMs ||
    bytes.length !== before.size
  ) {
    throw new Error("Governance referendum source changed while it was read.");
  }
  const serialized = bytes.toString("utf8");
  if (!Buffer.from(serialized, "utf8").equals(bytes)) {
    throw new Error("Governance referendum source is not canonical UTF-8.");
  }
  return parseGovernancePlainReferendumSource(
    parseStrictJson(serialized, "Governance referendum source"),
  );
};

export const governancePlainReferendumSourcePath = (input: {
  isPackaged: boolean;
  appPath: string;
  resourcesPath: string;
}): string =>
  input.isPackaged
    ? join(input.resourcesPath, GOVERNANCE_PLAIN_REFERENDUM_SOURCE_RESOURCE)
    : join(input.appPath, "resources", "governance-referendum-source.json");

const parseObservedIdentity = (
  value: unknown,
): GovernancePlainReferendumObservedIdentity => {
  const raw = exactRecord(
    value,
    ["chainId", "networkPrefix", "genesisHash"],
    "Observed governance identity",
  );
  const genesisHash = exactHash(
    raw.genesisHash,
    "Observed governance genesisHash",
  );
  if (
    raw.chainId !== TAIRA_GOVERNANCE_CHAIN_ID ||
    raw.networkPrefix !== TAIRA_GOVERNANCE_NETWORK_PREFIX
  ) {
    throw new Error("Observed governance identity is not exact Taira.");
  }
  return {
    chainId: TAIRA_GOVERNANCE_CHAIN_ID,
    networkPrefix: TAIRA_GOVERNANCE_NETWORK_PREFIX,
    genesisHash,
  };
};

export const assertGovernancePlainReferendumTrustedSender = (input: {
  ownerMatchesMainWindow: boolean;
  ownerDestroyed: boolean;
  senderFrame: ({ readonly url?: unknown } & object) | null;
  mainFrame: object | null;
  trustedRendererUrl: string;
}): void => {
  let sameOrigin = false;
  if (
    input.senderFrame &&
    typeof input.senderFrame.url === "string" &&
    input.senderFrame.url.trim()
  ) {
    try {
      const actual = new URL(input.senderFrame.url);
      const trusted = new URL(input.trustedRendererUrl);
      sameOrigin =
        !actual.username &&
        !actual.password &&
        !trusted.username &&
        !trusted.password &&
        actual.protocol === trusted.protocol &&
        actual.hostname === trusted.hostname &&
        actual.port === trusted.port;
    } catch {
      sameOrigin = false;
    }
  }
  if (
    !input.ownerMatchesMainWindow ||
    input.ownerDestroyed ||
    !input.senderFrame ||
    input.senderFrame !== input.mainFrame ||
    !sameOrigin
  ) {
    throw new Error(
      "Governance referendum reads require the trusted top-level wallet frame.",
    );
  }
};

type HandoffDescriptor = {
  artifactSha256: string;
  artifactSizeBytes: string;
  inputsSha256: string;
  proposalId: string;
  referendumId: string;
  hStart: string;
  hEnd: string;
  eligibleCitizenSnapshotSha256: string;
  snapshotFinalizedHeight: string;
  snapshotObservationSequence: string;
  networkCheckpointSha256: string;
};

const parseHandoffDescriptor = (
  value: unknown,
  source: GovernancePlainReferendumSource,
): HandoffDescriptor => {
  const raw = exactRecord(
    value,
    [
      "schema",
      "chain_id",
      "genesis_hash",
      "inputs_sha256",
      "proposal_id",
      "referendum_id",
      "referendum_window",
      "artifact_sha256",
      "artifact_size_bytes",
      "eligible_citizen_snapshot_sha256",
      "snapshot_finalized_height",
      "snapshot_observation_sequence",
      "network_checkpoint_sha256",
    ],
    "Governance referendum handoff descriptor",
  );
  const artifactSha256 = exactHash(
    raw.artifact_sha256,
    "Governance descriptor artifact_sha256",
  );
  const inputsSha256 = exactHash(
    raw.inputs_sha256,
    "Governance descriptor inputs_sha256",
  );
  const proposalId = exactHash(
    raw.proposal_id,
    "Governance descriptor proposal_id",
  );
  const referendumId = exactHash(
    raw.referendum_id,
    "Governance descriptor referendum_id",
  );
  const window = exactRecord(
    raw.referendum_window,
    ["lower", "upper"],
    "Governance descriptor referendum_window",
  );
  const hStart = exactDecimal(window.lower, "Governance descriptor h_start", {
    positive: true,
  });
  const hEnd = exactDecimal(window.upper, "Governance descriptor h_end", {
    positive: true,
  });
  const artifactSizeBytes = exactDecimal(
    raw.artifact_size_bytes,
    "Governance descriptor artifact_size_bytes",
    { positive: true },
  );
  const eligibleCitizenSnapshotSha256 = exactHash(
    raw.eligible_citizen_snapshot_sha256,
    "Governance descriptor eligible citizen snapshot SHA-256",
  );
  const snapshotFinalizedHeight = exactDecimal(
    raw.snapshot_finalized_height,
    "Governance descriptor snapshot finalized height",
    { positive: true },
  );
  const snapshotObservationSequence = exactDecimal(
    raw.snapshot_observation_sequence,
    "Governance descriptor snapshot observation sequence",
    { positive: true },
  );
  const networkCheckpointSha256 = exactHash(
    raw.network_checkpoint_sha256,
    "Governance descriptor network checkpoint SHA-256",
  );
  if (
    raw.schema !== GOVERNANCE_PLAIN_REFERENDUM_HANDOFF_SCHEMA ||
    raw.chain_id !== source.chainId ||
    raw.genesis_hash !== source.genesisHash ||
    proposalId !== referendumId ||
    BigInt(hEnd) - BigInt(hStart) + 1n !== WINDOW_BLOCKS ||
    BigInt(artifactSizeBytes) > BigInt(MAX_CONTRACT_BYTES)
  ) {
    throw new Error(
      "Governance referendum handoff descriptor differs from exact Taira PLAIN coordinates.",
    );
  }
  return {
    artifactSha256,
    artifactSizeBytes,
    inputsSha256,
    proposalId,
    referendumId,
    hStart,
    hEnd,
    eligibleCitizenSnapshotSha256,
    snapshotFinalizedHeight,
    snapshotObservationSequence,
    networkCheckpointSha256,
  };
};

const readBoundedJsonResponse = async (
  response: Response,
  label: string,
  maximumBytes: number,
): Promise<{ value: unknown; bytes: Buffer; sha256: string }> => {
  if (!response.ok || response.status !== 200) {
    throw new Error(`${label} returned HTTP ${response.status}.`);
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!/^application\/json(?:\s*;|$)/iu.test(contentType)) {
    throw new Error(`${label} did not return application/json.`);
  }
  const contentLength = response.headers.get("content-length");
  if (
    contentLength !== null &&
    (!DECIMAL.test(contentLength) ||
      BigInt(contentLength) > BigInt(maximumBytes))
  ) {
    throw new Error(`${label} advertised an invalid or oversized body.`);
  }
  if (!response.body) {
    throw new Error(`${label} returned no body.`);
  }
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  let complete = false;
  while (!complete) {
    const result = await reader.read();
    if (result.done) {
      complete = true;
      continue;
    }
    const { value } = result;
    total += value.byteLength;
    if (total > maximumBytes) {
      await reader.cancel("bounded governance JSON body exceeded");
      throw new Error(`${label} body is outside its bounded size.`);
    }
    chunks.push(Buffer.from(value));
  }
  const bytes = Buffer.concat(chunks, total);
  if (bytes.length < 1) {
    throw new Error(`${label} body is outside its bounded size.`);
  }
  const serialized = bytes.toString("utf8");
  if (!Buffer.from(serialized, "utf8").equals(bytes)) {
    throw new Error(`${label} body is not canonical UTF-8.`);
  }
  return {
    value: parseStrictJson(serialized, label),
    bytes,
    sha256: sha256(bytes),
  };
};

type StoredObservation = {
  chainId: string;
  genesisHash: string;
  proposalId: string;
  artifactSha256: string;
  contractFingerprint: string;
  snapshotFinalizedHeight: string;
  snapshotObservationSequence: string;
  networkCheckpointSha256: string;
};

const parseStoredObservation = (value: unknown): StoredObservation => {
  const raw = exactRecord(
    value,
    [
      "chainId",
      "genesisHash",
      "proposalId",
      "artifactSha256",
      "contractFingerprint",
      "snapshotFinalizedHeight",
      "snapshotObservationSequence",
      "networkCheckpointSha256",
    ],
    "Stored governance referendum observation",
  );
  return {
    chainId: exactText(raw.chainId, "Stored referendum chainId"),
    genesisHash: exactHash(raw.genesisHash, "Stored referendum genesisHash"),
    proposalId: exactHash(raw.proposalId, "Stored referendum proposalId"),
    artifactSha256: exactHash(
      raw.artifactSha256,
      "Stored referendum artifactSha256",
    ),
    contractFingerprint: exactHash(
      raw.contractFingerprint,
      "Stored referendum contractFingerprint",
    ),
    snapshotFinalizedHeight: exactDecimal(
      raw.snapshotFinalizedHeight,
      "Stored referendum snapshotFinalizedHeight",
      { positive: true },
    ),
    snapshotObservationSequence: exactDecimal(
      raw.snapshotObservationSequence,
      "Stored referendum snapshotObservationSequence",
      { positive: true },
    ),
    networkCheckpointSha256: exactHash(
      raw.networkCheckpointSha256,
      "Stored referendum networkCheckpointSha256",
    ),
  };
};

const canonicalFinalityState = (observation: StoredObservation): string =>
  JSON.stringify({ schema: FINALITY_SCHEMA, observation });
const canonicalFinalityMarker = (): string =>
  JSON.stringify({
    schema: FINALITY_MARKER_SCHEMA,
    state_schema: FINALITY_SCHEMA,
  });

const pathExists = (path: string): boolean => {
  try {
    lstatSync(path);
    return true;
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return false;
    }
    throw error;
  }
};

export const governancePlainReferendumFinalityPath = (
  userDataPath: string,
): string => join(userDataPath, GOVERNANCE_PLAIN_REFERENDUM_FINALITY_FILENAME);
export const governancePlainReferendumFinalityMarkerPath = (
  userDataPath: string,
): string =>
  join(userDataPath, GOVERNANCE_PLAIN_REFERENDUM_FINALITY_MARKER_FILENAME);

export class GovernancePlainReferendumFinalityStore {
  private readonly path: string;
  private readonly markerPath: string;
  private inProcessFloor: StoredObservation | null = null;
  private initialized = false;

  constructor(userDataPath: string) {
    this.path = governancePlainReferendumFinalityPath(userDataPath);
    this.markerPath = governancePlainReferendumFinalityMarkerPath(userDataPath);
  }

  verifyAndPromote(value: StoredObservation): void {
    const current = parseStoredObservation(value);
    if (
      current.chainId !== TAIRA_GOVERNANCE_CHAIN_ID ||
      current.genesisHash.length !== 64
    ) {
      throw new Error("Governance referendum observation is not exact Taira.");
    }
    const previous = this.load();
    if (this.inProcessFloor) {
      if (!previous) {
        throw new Error(
          "Governance referendum durable watermark disappeared after initialization.",
        );
      }
      this.rejectChange(this.inProcessFloor, previous);
    }
    if (previous) this.rejectChange(previous, current);
    if (previous && canonicalJson(previous) === canonicalJson(current)) return;
    this.persist(current, previous === null);
    this.inProcessFloor = Object.freeze({ ...current });
  }

  private rejectChange(
    previous: StoredObservation,
    current: StoredObservation,
  ) {
    if (
      BigInt(current.snapshotFinalizedHeight) <
        BigInt(previous.snapshotFinalizedHeight) ||
      BigInt(current.snapshotObservationSequence) <
        BigInt(previous.snapshotObservationSequence)
    ) {
      throw new Error(
        "Governance referendum handoff regressed behind its durable finalized snapshot.",
      );
    }
    if (canonicalJson(previous) !== canonicalJson(current)) {
      throw new Error(
        "Governance referendum handoff equivocated after its immutable artifact was verified.",
      );
    }
  }

  private load(): StoredObservation | null {
    const hasState = pathExists(this.path);
    const hasMarker = pathExists(this.markerPath);
    if (!hasState && !hasMarker) {
      if (this.initialized || this.inProcessFloor) {
        throw new Error(
          "Governance referendum durable watermark disappeared after initialization.",
        );
      }
      return null;
    }
    if (!hasState || !hasMarker) {
      throw new Error(
        "Governance referendum durable watermark is incomplete or was reset.",
      );
    }
    const marker = loadSecureBoundedJson(this.markerPath, {
      label: "Governance referendum finality marker",
      maximumBytes: MAX_FINALITY_MARKER_BYTES,
      expectedMode: 0o600,
    });
    const markerRecord = exactRecord(
      marker.value,
      ["schema", "state_schema"],
      "Governance referendum finality marker",
    );
    if (
      markerRecord.schema !== FINALITY_MARKER_SCHEMA ||
      markerRecord.state_schema !== FINALITY_SCHEMA ||
      marker.sha256 !== sha256(canonicalFinalityMarker())
    ) {
      throw new Error(
        "Governance referendum finality marker is not canonical.",
      );
    }
    const loaded = loadSecureBoundedJson(this.path, {
      label: "Governance referendum finality state",
      maximumBytes: MAX_FINALITY_BYTES,
      expectedMode: 0o600,
    });
    const record = exactRecord(
      loaded.value,
      ["schema", "observation"],
      "Governance referendum finality state",
    );
    if (record.schema !== FINALITY_SCHEMA) {
      throw new Error("Governance referendum finality state schema differs.");
    }
    const observation = parseStoredObservation(record.observation);
    if (loaded.sha256 !== sha256(canonicalFinalityState(observation))) {
      throw new Error("Governance referendum finality state is not canonical.");
    }
    this.initialized = true;
    return observation;
  }

  private persist(observation: StoredObservation, first: boolean): void {
    secureWriteBoundedFile(
      this.path,
      Buffer.from(canonicalFinalityState(observation), "utf8"),
      {
        label: "Governance referendum finality state",
        maximumBytes: MAX_FINALITY_BYTES,
        expectedMode: 0o600,
      },
    );
    if (first) {
      secureWriteBoundedFile(
        this.markerPath,
        Buffer.from(canonicalFinalityMarker(), "utf8"),
        {
          label: "Governance referendum finality marker",
          maximumBytes: MAX_FINALITY_MARKER_BYTES,
          expectedMode: 0o600,
        },
      );
      this.initialized = true;
    } else if (!pathExists(this.markerPath)) {
      throw new Error(
        "Governance referendum finality marker disappeared during promotion.",
      );
    }
  }
}

export const fetchGovernancePlainReferendumContract = async (input: {
  source: GovernancePlainReferendumSource;
  observedIdentity: unknown;
  finalityStore: GovernancePlainReferendumFinalityStore;
  fetcher?: typeof fetch;
  signal?: AbortSignal;
}): Promise<LoadedGovernancePlainReferendumContract> => {
  const source = parseGovernancePlainReferendumSource(input.source);
  const observed = parseObservedIdentity(input.observedIdentity);
  if (
    observed.chainId !== source.chainId ||
    observed.networkPrefix !== source.networkPrefix ||
    observed.genesisHash !== source.genesisHash
  ) {
    throw new Error(
      "The observed Taira endpoint identity differs from the packaged referendum source.",
    );
  }
  const fetcher = input.fetcher ?? fetch;
  const controller = new AbortController();
  const abortFromInput = () => controller.abort(input.signal?.reason);
  if (input.signal?.aborted) abortFromInput();
  input.signal?.addEventListener("abort", abortFromInput, { once: true });
  const timeout = setTimeout(
    () => controller.abort(new Error("Governance handoff fetch timed out.")),
    FETCH_TIMEOUT_MS,
  );
  try {
    const descriptorResponse = await fetcher(source.descriptorUrl, {
      method: "GET",
      headers: { accept: "application/json" },
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
    });
    const descriptorDocument = await readBoundedJsonResponse(
      descriptorResponse,
      "Governance referendum handoff descriptor",
      MAX_DESCRIPTOR_BYTES,
    );
    const descriptor = parseHandoffDescriptor(descriptorDocument.value, source);
    const artifactUrl = `${source.artifactBaseUrl}/${descriptor.artifactSha256}.json`;
    const artifactResponse = await fetcher(artifactUrl, {
      method: "GET",
      headers: { accept: "application/json" },
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
    });
    const artifact = await readBoundedJsonResponse(
      artifactResponse,
      "Governance referendum artifact",
      MAX_CONTRACT_BYTES,
    );
    if (
      artifact.sha256 !== descriptor.artifactSha256 ||
      String(artifact.bytes.length) !== descriptor.artifactSizeBytes
    ) {
      throw new Error(
        "Governance referendum artifact bytes differ from the hash-bound handoff descriptor.",
      );
    }
    const loaded = parseGovernancePlainReferendumContract(artifact.value, {
      expectedGenesisHash: source.genesisHash,
      artifactSha256: artifact.sha256,
    });
    const contract = loaded.contract;
    if (
      contract.inputsSha256 !== descriptor.inputsSha256 ||
      contract.proposalId !== descriptor.proposalId ||
      contract.referendumId !== descriptor.referendumId ||
      contract.hStart !== descriptor.hStart ||
      contract.hEnd !== descriptor.hEnd ||
      contract.eligibleCitizenSnapshotSha256 !==
        descriptor.eligibleCitizenSnapshotSha256 ||
      contract.snapshotFinalizedHeight !== descriptor.snapshotFinalizedHeight ||
      contract.snapshotObservationSequence !==
        descriptor.snapshotObservationSequence ||
      contract.networkCheckpointSha256 !== descriptor.networkCheckpointSha256
    ) {
      throw new Error(
        "Governance referendum artifact coordinates differ from its handoff descriptor.",
      );
    }
    input.finalityStore.verifyAndPromote({
      chainId: contract.chainId,
      genesisHash: contract.genesisHash,
      proposalId: contract.proposalId,
      artifactSha256: artifact.sha256,
      contractFingerprint: loaded.contractFingerprint,
      snapshotFinalizedHeight: contract.snapshotFinalizedHeight,
      snapshotObservationSequence: contract.snapshotObservationSequence,
      networkCheckpointSha256: contract.networkCheckpointSha256,
    });
    return {
      ...loaded,
      source: { descriptorUrl: source.descriptorUrl, artifactUrl },
    };
  } finally {
    clearTimeout(timeout);
    input.signal?.removeEventListener("abort", abortFromInput);
  }
};

export const assertGovernancePlainReferendumBallotBinding = (
  loaded: LoadedGovernancePlainReferendumContract,
  input: {
    chainId: string;
    proposalId: string;
    referendumId: string;
    accountId: string;
    hStart: string;
    hEnd: string;
    mode: string;
    amount: string;
    durationBlocks: string;
    direction: string;
    hasExistingLock: boolean;
  },
): void => {
  const { contract } = loaded;
  const proposalId = input.proposalId.toLowerCase().replace(/^0x/u, "");
  if (!LOWER_HASH.test(proposalId)) {
    throw new Error("Governance proposal ID is not canonical 32-byte hex.");
  }
  if (
    input.chainId !== contract.chainId ||
    proposalId !== contract.proposalId ||
    input.referendumId !== contract.referendumId ||
    input.hStart !== contract.hStart ||
    input.hEnd !== contract.hEnd ||
    input.mode !== contract.mode
  ) {
    throw new Error(
      "Live proposal does not exactly match the immutable PLAIN referendum contract.",
    );
  }
  if (
    !contract.eligibleCitizens.some(
      ({ accountId }) => accountId === input.accountId,
    )
  ) {
    throw new Error(
      "The active account is outside the immutable eligible-citizen snapshot.",
    );
  }
  if (
    input.amount !== contract.ballot.amount ||
    input.durationBlocks !== contract.ballot.durationBlocks ||
    !contract.ballot.directions.includes(
      input.direction as (typeof contract.ballot.directions)[number],
    )
  ) {
    throw new Error("Citizen ballot differs from the exact PLAIN contract.");
  }
  if (input.hasExistingLock) {
    throw new Error(
      "The active account already has an effective ballot for this referendum.",
    );
  }
};

export const assertGovernancePlainReferendumBallotDraft = (
  value: unknown,
  loaded: LoadedGovernancePlainReferendumContract,
  input: {
    owner: string;
    direction: "Aye" | "Nay" | "Abstain";
  },
): void => {
  const response = exactRecord(
    value,
    [
      "version",
      "proposal_id",
      "referendum_id",
      "electorate_seal_hash",
      "window",
      "current_height",
      "ballot_amount",
      "duration_blocks",
      "owner",
      "direction",
      "ballot_instruction",
      "tx_instructions",
    ],
    "Validation-fee PLAIN ballot draft",
  );
  const window = exactRecord(
    response.window,
    ["lower", "upper"],
    "Validation-fee PLAIN ballot draft window",
  );
  const ballotInstruction = exactRecord(
    response.ballot_instruction,
    ["referendum_id", "owner", "amount", "duration_blocks", "direction"],
    "Validation-fee PLAIN decoded ballot instruction",
  );
  const direction = input.direction.toUpperCase();
  const directionCode = { AYE: 0, NAY: 1, ABSTAIN: 2 }[direction];
  const currentHeight = exactDecimal(
    response.current_height,
    "Validation-fee PLAIN ballot draft current_height",
    { positive: true },
  );
  if (
    response.version !== 1 ||
    response.proposal_id !== loaded.contract.proposalId ||
    response.referendum_id !== loaded.contract.referendumId ||
    response.electorate_seal_hash !==
      loaded.contract.plainElectorate.electorateSealHash ||
    window.lower !== loaded.contract.hStart ||
    window.upper !== loaded.contract.hEnd ||
    response.ballot_amount !== loaded.contract.ballot.amount ||
    response.duration_blocks !== loaded.contract.ballot.durationBlocks ||
    response.owner !== input.owner ||
    response.direction !== direction ||
    BigInt(currentHeight) + 1n < BigInt(loaded.contract.hStart) ||
    BigInt(currentHeight) + 1n > BigInt(loaded.contract.hEnd) ||
    ballotInstruction.referendum_id !== loaded.contract.referendumId ||
    ballotInstruction.owner !== input.owner ||
    ballotInstruction.amount !== loaded.contract.ballot.amount ||
    ballotInstruction.duration_blocks !==
      loaded.contract.ballot.durationBlocks ||
    ballotInstruction.direction !== directionCode
  ) {
    throw new Error(
      "Validation-fee PLAIN ballot draft differs from the hash-bound proposal, electorate seal, member, window, or terms.",
    );
  }
  if (
    !Array.isArray(response.tx_instructions) ||
    response.tx_instructions.length !== 1
  ) {
    throw new Error(
      "Validation-fee PLAIN ballot draft must contain one typed instruction.",
    );
  }
  const instruction = exactRecord(
    response.tx_instructions[0],
    ["wire_id", "payload_hex"],
    "Validation-fee PLAIN ballot draft instruction",
  );
  if (
    instruction.wire_id !==
      "iroha_data_model::isi::governance::CastPlainBallot" ||
    typeof instruction.payload_hex !== "string" ||
    !/^(?:[0-9a-f]{2})+$/u.test(instruction.payload_hex)
  ) {
    throw new Error(
      "Validation-fee PLAIN ballot draft is not one canonical native CastPlainBallot frame.",
    );
  }
};

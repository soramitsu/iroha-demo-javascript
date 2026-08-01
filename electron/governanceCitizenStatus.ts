import type { GovernanceCitizenStatusResponse } from "../src/types/iroha";
import { normalizeCanonicalAccountIdLiteral } from "./accountAddress";

type GovernanceCitizenStatusDecodeInput = {
  expectedAccountId: string;
  networkPrefix: number;
};

const STATUS_FIELDS = [
  "account_id",
  "amount",
  "bonded_height",
  "cooldown_until",
  "is_citizen",
  "last_epoch_seen",
  "seats_in_epoch",
] as const;
const CITIZEN_DRAFT_FIELDS = [
  "amount",
  "owner",
  "tx_instructions",
  "version",
] as const;
const GOVERNANCE_U64_MAX = (1n << 64n) - 1n;

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

export const assertGovernanceCitizenDraftResponse = (
  payload: unknown,
  expected: { owner: string; amount: string },
): Record<string, unknown> => {
  if (!isPlainRecord(payload)) {
    throw new Error("Governance citizenship draft must be an object.");
  }
  const actualFields = Object.keys(payload).sort();
  if (
    actualFields.length !== CITIZEN_DRAFT_FIELDS.length ||
    actualFields.some((field, index) => field !== CITIZEN_DRAFT_FIELDS[index])
  ) {
    throw new Error(
      "Governance citizenship draft contains missing or unknown fields.",
    );
  }
  if (
    payload.version !== 1 ||
    payload.owner !== expected.owner ||
    typeof payload.amount !== "string" ||
    payload.amount !== expected.amount
  ) {
    throw new Error(
      "Governance citizenship draft differs from the reviewed owner or bond.",
    );
  }
  return payload;
};

export const normalizeGovernanceNetworkPrefix = (value: unknown): number => {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > 0x3fff
  ) {
    throw new Error("networkPrefix must be an integer between 0 and 16383.");
  }
  return value;
};

const normalizeOptionalGovernanceInteger = (
  value: unknown,
  label: string,
): string | null => {
  if (value === null) return null;
  if (typeof value !== "string" || !/^(?:0|[1-9]\d*)$/u.test(value)) {
    throw new Error(
      `${label} must be a canonical uint64 decimal string or null.`,
    );
  }
  const parsed = BigInt(value);
  if (parsed > GOVERNANCE_U64_MAX) {
    throw new Error(`${label} exceeds uint64.`);
  }
  return value;
};

const normalizeExpectedAccountId = ({
  expectedAccountId,
  networkPrefix,
}: GovernanceCitizenStatusDecodeInput) => {
  const normalizedNetworkPrefix =
    normalizeGovernanceNetworkPrefix(networkPrefix);
  return normalizeCanonicalAccountIdLiteral(
    expectedAccountId,
    "accountId",
    normalizedNetworkPrefix,
  );
};

export const unavailableGovernanceCitizenStatus = (
  input: GovernanceCitizenStatusDecodeInput,
): GovernanceCitizenStatusResponse => ({
  state: "unavailable",
  accountId: normalizeExpectedAccountId(input),
  amount: null,
  bondedHeight: null,
  seatsInEpoch: null,
  lastEpochSeen: null,
  cooldownUntil: null,
});

export const decodeGovernanceCitizenStatus = (
  payload: unknown,
  input: GovernanceCitizenStatusDecodeInput,
): GovernanceCitizenStatusResponse => {
  if (!isPlainRecord(payload)) {
    throw new Error("Governance citizenship status must be an object.");
  }
  const actualFields = Object.keys(payload).sort();
  if (
    actualFields.length !== STATUS_FIELDS.length ||
    actualFields.some((field, index) => field !== STATUS_FIELDS[index])
  ) {
    throw new Error(
      "Governance citizenship status contains missing or unknown fields.",
    );
  }
  const networkPrefix = normalizeGovernanceNetworkPrefix(input.networkPrefix);

  const accountIdLiteral =
    typeof payload.account_id === "string" ? payload.account_id.trim() : "";
  if (!accountIdLiteral || accountIdLiteral !== payload.account_id) {
    throw new Error(
      "Governance citizenship status.account_id must be canonical text.",
    );
  }
  const accountId = normalizeCanonicalAccountIdLiteral(
    accountIdLiteral,
    "Governance citizenship status.account_id",
    networkPrefix,
  );
  const expectedAccountId = normalizeExpectedAccountId(input);
  if (accountId !== expectedAccountId) {
    throw new Error(
      "Governance citizenship status.account_id does not match the requested account.",
    );
  }

  if (typeof payload.is_citizen !== "boolean") {
    throw new Error(
      "Governance citizenship status.is_citizen must be a boolean.",
    );
  }
  const amount = payload.amount;
  if (
    amount !== null &&
    (typeof amount !== "string" || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(amount))
  ) {
    throw new Error(
      "Governance citizenship status.amount must be a canonical decimal string or null.",
    );
  }
  const bondedHeight = normalizeOptionalGovernanceInteger(
    payload.bonded_height,
    "Governance citizenship status.bonded_height",
  );
  const seatsInEpoch = normalizeOptionalGovernanceInteger(
    payload.seats_in_epoch,
    "Governance citizenship status.seats_in_epoch",
  );
  const lastEpochSeen = normalizeOptionalGovernanceInteger(
    payload.last_epoch_seen,
    "Governance citizenship status.last_epoch_seen",
  );
  const cooldownUntil = normalizeOptionalGovernanceInteger(
    payload.cooldown_until,
    "Governance citizenship status.cooldown_until",
  );
  return {
    state: payload.is_citizen ? "citizen" : "not-citizen",
    accountId,
    amount,
    bondedHeight,
    seatsInEpoch,
    lastEpochSeen,
    cooldownUntil,
  };
};

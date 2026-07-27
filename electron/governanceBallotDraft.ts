type PlainRecord = Record<string, unknown>;

export const GOVERNANCE_BALLOT_WIRE_IDS = Object.freeze({
  CastPlainBallot: "iroha_data_model::isi::governance::CastPlainBallot",
  CastParliamentBallot:
    "iroha_data_model::isi::governance::CastParliamentBallot",
} as const);

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
  const sortedExpected = [...expected].sort();
  if (
    actual.length !== sortedExpected.length ||
    actual.some((key, index) => key !== sortedExpected[index])
  ) {
    throw new TypeError(`${label} contains missing or unknown fields.`);
  }
};

export const normalizeGovernanceDraftWireId = (value: unknown): string => {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value
  ) {
    throw new TypeError(
      "Governance draft instruction wire_id must be canonical non-empty text.",
    );
  }
  return value;
};

export const normalizeGovernanceDraftPayloadHex = (value: unknown): string => {
  if (typeof value !== "string" || !/^(?:[0-9a-f]{2})+$/u.test(value)) {
    throw new TypeError(
      "Governance draft instruction payload_hex must be non-empty lowercase hexadecimal bytes.",
    );
  }
  return value;
};

/**
 * Verify Torii returned the exact local-signing ballot draft contract before
 * its instruction is decoded, quoted, or admitted to the review cache.
 */
export function assertGovernanceBallotDraftResponse(
  value: unknown,
  expectedVariant: "CastPlainBallot" | "CastParliamentBallot",
): void {
  const response = record(value, "Governance ballot draft");
  exactKeys(
    response,
    ["accepted", "ok", "reason", "tx_instructions"],
    "Governance ballot draft",
  );
  if (
    response.ok !== true ||
    response.accepted !== true ||
    response.reason !== "build transaction skeleton"
  ) {
    throw new TypeError(
      "Governance ballot endpoint did not return an accepted local-signing draft.",
    );
  }
  if (
    !Array.isArray(response.tx_instructions) ||
    response.tx_instructions.length !== 1
  ) {
    throw new TypeError(
      "Governance ballot draft must contain exactly one instruction.",
    );
  }
  const instruction = record(
    response.tx_instructions[0],
    "Governance ballot draft instruction",
  );
  exactKeys(
    instruction,
    ["payload_hex", "wire_id"],
    "Governance ballot draft instruction",
  );
  const wireId = normalizeGovernanceDraftWireId(instruction.wire_id);
  if (wireId !== GOVERNANCE_BALLOT_WIRE_IDS[expectedVariant]) {
    throw new TypeError(
      `Governance ballot draft must use exact wire id ${GOVERNANCE_BALLOT_WIRE_IDS[expectedVariant]}.`,
    );
  }
  normalizeGovernanceDraftPayloadHex(instruction.payload_hex);
}

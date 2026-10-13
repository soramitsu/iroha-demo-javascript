import {
  VALIDATION_FEE_POLICY_DRAFT_DECODED_VARIANT,
  VALIDATION_FEE_POLICY_DRAFT_WIRE_ID,
} from "./governanceValidationFeeDraft";

/** Registered V1 wire ID of the reviewed citizenship instruction. */
export const GOVERNANCE_CITIZEN_DRAFT_WIRE_ID =
  "iroha.instruction.v1::governance::RegisterCitizen";

/**
 * Registered V1 wire IDs of the only instructions governance drafts may
 * carry. Concrete Rust type names are never wire IDs.
 */
const REVIEWED_GOVERNANCE_DRAFT_WIRE_IDS: ReadonlyMap<string, string> = new Map(
  [
    ["RegisterCitizen", GOVERNANCE_CITIZEN_DRAFT_WIRE_ID],
    [
      VALIDATION_FEE_POLICY_DRAFT_DECODED_VARIANT,
      VALIDATION_FEE_POLICY_DRAFT_WIRE_ID,
    ],
  ],
);

/** The exact wire ID for one reviewed instruction variant, or null. */
export const reviewedGovernanceDraftWireId = (variant: string): string | null =>
  REVIEWED_GOVERNANCE_DRAFT_WIRE_IDS.get(variant) ?? null;

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

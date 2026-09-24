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

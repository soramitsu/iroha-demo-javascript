export const CONFIDENTIAL_POLICY_MODES = [
  "TransparentOnly",
  "ShieldedOnly",
  "Convertible",
] as const;

export type ConfidentialPolicyMode = (typeof CONFIDENTIAL_POLICY_MODES)[number];

export const readConfidentialPolicyMode = (
  value: unknown,
  label = "confidential policy mode",
): ConfidentialPolicyMode => {
  if (
    typeof value !== "string" ||
    !CONFIDENTIAL_POLICY_MODES.some((mode) => mode === value)
  ) {
    throw new Error(
      `${label} must be exactly TransparentOnly, ShieldedOnly, or Convertible.`,
    );
  }
  return value as ConfidentialPolicyMode;
};

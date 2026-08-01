export const VALIDATION_FEE_POLICY_OPERATOR_ONLY_MESSAGE =
  "Validation-fee policy enactment is reserved for the sole exact-height operator. This public wallet cannot prepare or submit it.";

export type PublicGovernanceEnactKind = "ValidationFeePayoutLifecycle";

export function assertPublicGovernanceEnactKind(
  kind: unknown,
): asserts kind is PublicGovernanceEnactKind {
  if (kind === "ValidationFeePolicy") {
    throw new Error(VALIDATION_FEE_POLICY_OPERATOR_ONLY_MESSAGE);
  }
  if (kind !== "ValidationFeePayoutLifecycle") {
    throw new Error(
      "This proposal kind cannot be enacted through the public governance wallet.",
    );
  }
}

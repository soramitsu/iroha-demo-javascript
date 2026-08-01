import type {
  EndpointFeature,
  EndpointInspection,
} from "@/types/endpointInspection";

export const normalizeEndpointOperation = (operation: string): string =>
  operation
    .trim()
    .replace(/\{[^}]+\}/gu, "{}")
    .replace(/\s+/gu, " ");

export const isEndpointFeatureOperationSupported = (
  inspection: EndpointInspection | null,
  feature: EndpointFeature,
  operation: string,
): boolean => {
  if (!inspection) {
    return false;
  }
  const availability = inspection.features[feature];
  const normalizedOperation = normalizeEndpointOperation(operation);
  return (
    availability.source === "openapi" &&
    availability.requiredOperations.some(
      (required) =>
        normalizeEndpointOperation(required) === normalizedOperation,
    ) &&
    !availability.missingOperations.some(
      (missing) => normalizeEndpointOperation(missing) === normalizedOperation,
    )
  );
};

export const canAttemptFaucetIdentityChallenge = (
  inspection: EndpointInspection | null,
): boolean =>
  Boolean(
    inspection &&
      (inspection.identityStatus === "matched" ||
        inspection.identityStatus === "unverified") &&
      inspection.features.faucetClaim.supported,
  );

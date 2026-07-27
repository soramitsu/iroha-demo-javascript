import type {
  SoraCloudHfResourceProfileReview,
  SoraCloudHfSettlementReview,
} from "./soraCloudResponses";

export const SORACLOUD_SETTLEMENT_CONFIRMATION_CHANNEL =
  "soracloud:confirm-hf-settlement";

export interface SoraCloudHfSettlementConfirmation
  extends SoraCloudHfSettlementReview {
  accountId: string;
  toriiUrl: string;
  repoId: string;
  resolvedRevision: string;
  modelName: string;
  serviceName: string;
  storageClass: "hot" | "warm" | "cold";
  leaseTermMs: number;
}

const isCanonicalText = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.trim() === value;

const isPositiveSafeInteger = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) > 0;

const isNonNegativeSafeInteger = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) >= 0;

const isCanonicalQuantity = (value: unknown): value is string =>
  isCanonicalText(value) &&
  /^(?:0|[1-9]\d*)(?:\.(?:\d{0,27}[1-9]))?$/u.test(value);

const isResourceProfile = (
  value: unknown,
): value is SoraCloudHfResourceProfileReview => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const profile = value as Partial<SoraCloudHfResourceProfileReview>;
  return (
    isPositiveSafeInteger(profile.requiredModelBytes) &&
    (profile.backendFamily === "Transformers" ||
      profile.backendFamily === "Gguf") &&
    (profile.modelFormat === "Safetensors" ||
      profile.modelFormat === "PyTorch" ||
      profile.modelFormat === "Gguf") &&
    isPositiveSafeInteger(profile.diskCacheBytesFloor) &&
    profile.diskCacheBytesFloor >= profile.requiredModelBytes &&
    isNonNegativeSafeInteger(profile.ramBytesFloor) &&
    isNonNegativeSafeInteger(profile.vramBytesFloor) &&
    (profile.ramBytesFloor > 0 || profile.vramBytesFloor > 0)
  );
};

export const isSoraCloudHfSettlementConfirmation = (
  value: unknown,
): value is SoraCloudHfSettlementConfirmation => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const confirmation = value as Partial<SoraCloudHfSettlementConfirmation>;
  return (
    isCanonicalText(confirmation.accountId) &&
    isCanonicalText(confirmation.toriiUrl) &&
    isCanonicalText(confirmation.repoId) &&
    isCanonicalText(confirmation.resolvedRevision) &&
    isCanonicalText(confirmation.modelName) &&
    isCanonicalText(confirmation.serviceName) &&
    (confirmation.storageClass === "hot" ||
      confirmation.storageClass === "warm" ||
      confirmation.storageClass === "cold") &&
    isPositiveSafeInteger(confirmation.leaseTermMs) &&
    isCanonicalText(confirmation.leaseAssetDefinitionId) &&
    isCanonicalQuantity(confirmation.storageBaseFee) &&
    isCanonicalQuantity(confirmation.maxComputeReservationFee) &&
    isResourceProfile(confirmation.resourceProfile)
  );
};

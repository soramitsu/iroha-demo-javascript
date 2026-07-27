import { describe, expect, it } from "vitest";

import {
  isSoraCloudHfSettlementConfirmation,
  type SoraCloudHfSettlementConfirmation,
} from "../electron/soraCloudSettlementBoundary";

const confirmation = (): SoraCloudHfSettlementConfirmation => ({
  accountId: "testuReviewedAccount",
  toriiUrl: "https://taira.sora.org",
  repoId: "openai/model",
  resolvedRevision: "0123456789abcdef",
  modelName: "model",
  serviceName: "model-service",
  storageClass: "hot",
  leaseTermMs: 3_600_000,
  leaseAssetDefinitionId: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
  storageBaseFee: "0.00001",
  maxComputeReservationFee: "0.0000075",
  resourceProfile: {
    requiredModelBytes: 1_073_741_824,
    backendFamily: "Transformers",
    modelFormat: "Safetensors",
    diskCacheBytesFloor: 2_147_483_648,
    ramBytesFloor: 4_294_967_296,
    vramBytesFloor: 0,
  },
});

describe("SoraCloud settlement confirmation boundary", () => {
  it("accepts only canonical first-release quantities", () => {
    expect(isSoraCloudHfSettlementConfirmation(confirmation())).toBe(true);
    expect(
      isSoraCloudHfSettlementConfirmation({
        ...confirmation(),
        storageBaseFee: "0",
      }),
    ).toBe(true);
    expect(
      isSoraCloudHfSettlementConfirmation({
        ...confirmation(),
        maxComputeReservationFee: `0.${"0".repeat(27)}1`,
      }),
    ).toBe(true);
  });

  it.each([
    "00",
    "01",
    "1.",
    "1.0",
    "0.00000000000000000000000000001",
    "-1",
    "+1",
    "1e-5",
    " 1",
  ])("rejects non-canonical quantity %s before approval", (quantity) => {
    expect(
      isSoraCloudHfSettlementConfirmation({
        ...confirmation(),
        storageBaseFee: quantity,
      }),
    ).toBe(false);
  });
});

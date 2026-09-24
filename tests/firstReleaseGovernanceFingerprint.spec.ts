import { beforeEach, describe, expect, it, vi } from "vitest";

const nativeBinding = {
  validationFeePolicyProposalFingerprintV1: vi.fn(),
  validationFeePayoutLifecycleProposalFingerprintV1: vi.fn(),
};

vi.mock("../electron/irohaJsNativeDir", () => ({
  getInstalledIrohaJsNativeBinding: () => nativeBinding,
  installGlobalIrohaJsNativeBinding: () => nativeBinding,
}));

vi.mock("../electron/accountAddress", () => ({
  normalizeCanonicalAccountIdLiteral: (value: string) => value,
}));

import {
  computeFirstReleaseValidationFeePayoutLifecycleFingerprint,
  computeFirstReleaseValidationFeePolicyFingerprint,
} from "../electron/firstReleaseGovernanceFingerprint";

const proposalOperator = "testuCanonicalProposalOperator";

describe("first-release validation-fee fingerprint boundary", () => {
  beforeEach(() => {
    nativeBinding.validationFeePolicyProposalFingerprintV1
      .mockReset()
      .mockReturnValue(Buffer.alloc(32, 0x12));
    nativeBinding.validationFeePayoutLifecycleProposalFingerprintV1
      .mockReset()
      .mockReturnValue(Buffer.alloc(32, 0x34));
  });

  it("binds the policy fingerprint to the exact proposal operator", () => {
    const policy = { schema_version: 1, network_id: "hash:fixture#0000" };
    const lifecycleId = "56".repeat(32);
    expect(
      computeFirstReleaseValidationFeePolicyFingerprint({
        proposalOperator,
        networkPrefix: 369,
        policy,
        payoutLifecycleProposalId: lifecycleId,
      }),
    ).toBe("12".repeat(32));
    expect(
      nativeBinding.validationFeePolicyProposalFingerprintV1,
    ).toHaveBeenCalledExactlyOnceWith(
      proposalOperator,
      JSON.stringify(policy),
      Buffer.from(lifecycleId, "hex"),
    );
  });

  it("binds the payout lifecycle fingerprint to the exact operator", () => {
    const payoutBinding = {
      entrypoint: "autonomous_validation_fee_tick",
    };
    expect(
      computeFirstReleaseValidationFeePayoutLifecycleFingerprint({
        proposalOperator,
        networkPrefix: 369,
        payoutBinding,
      }),
    ).toBe("34".repeat(32));
    expect(
      nativeBinding.validationFeePayoutLifecycleProposalFingerprintV1,
    ).toHaveBeenCalledExactlyOnceWith(
      proposalOperator,
      JSON.stringify(payoutBinding),
    );
  });

  it("rejects retired rules arguments, lossy JSON, and lifecycle aliases", () => {
    expect(() =>
      computeFirstReleaseValidationFeePolicyFingerprint({
        proposalOperator,
        networkPrefix: 369,
        policy: { schema_version: 1, removed: undefined },
        payoutLifecycleProposalId: null,
      }),
    ).toThrow(/non-JSON/u);
    expect(() =>
      computeFirstReleaseValidationFeePolicyFingerprint({
        proposalOperator,
        networkPrefix: 369,
        policy: { schema_version: 1 },
        payoutLifecycleProposalId: `0x${"56".repeat(32)}`,
      }),
    ).toThrow(/64 lowercase hexadecimal/u);
    expect(() =>
      computeFirstReleaseValidationFeePolicyFingerprint({
        proposalOperator,
        networkPrefix: 369,
        policy: { schema_version: 1 },
        payoutLifecycleProposalId: "00".repeat(32),
      }),
    ).toThrow(/non-zero/u);
    expect(
      nativeBinding.validationFeePolicyProposalFingerprintV1,
    ).not.toHaveBeenCalled();
  });

  it("requires one exact 32-byte native fingerprint", () => {
    nativeBinding.validationFeePolicyProposalFingerprintV1.mockReturnValueOnce(
      Buffer.alloc(31),
    );
    expect(() =>
      computeFirstReleaseValidationFeePolicyFingerprint({
        proposalOperator,
        networkPrefix: 369,
        policy: { schema_version: 1 },
        payoutLifecycleProposalId: null,
      }),
    ).toThrow(/exactly 32 native bytes/u);
  });
});

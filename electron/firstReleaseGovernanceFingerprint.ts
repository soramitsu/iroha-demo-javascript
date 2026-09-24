import { Buffer } from "node:buffer";

import { normalizeCanonicalAccountIdLiteral } from "./accountAddress";
import {
  getInstalledIrohaJsNativeBinding,
  installGlobalIrohaJsNativeBinding,
} from "./irohaJsNativeDir";
import { requireFirstReleaseJsonObject } from "./firstReleaseResourceLimits";

const LOWER_HEX_32 = /^[0-9a-f]{64}$/u;
const MAX_GOVERNANCE_PROPOSAL_JSON_BYTES = 64 * 1024;

type JsonObject = Record<string, unknown>;

type FirstReleaseGovernanceFingerprintNativeBinding = Readonly<{
  validationFeePolicyProposalFingerprintV1(
    proposalOperator: string,
    policyJson: string,
    payoutLifecycleProposalId: Buffer | null,
  ): unknown;
  validationFeePayoutLifecycleProposalFingerprintV1(
    proposalOperator: string,
    payoutBindingJson: string,
  ): unknown;
}>;

const requireNativeBinding =
  (): FirstReleaseGovernanceFingerprintNativeBinding => {
    const candidate =
      getInstalledIrohaJsNativeBinding() ??
      installGlobalIrohaJsNativeBinding(import.meta.url);
    if (
      !candidate ||
      typeof candidate.validationFeePolicyProposalFingerprintV1 !==
        "function" ||
      typeof candidate.validationFeePayoutLifecycleProposalFingerprintV1 !==
        "function"
    ) {
      throw new Error(
        "The reviewed Iroha native binding is missing first-release validation-fee fingerprint support.",
      );
    }
    return candidate as FirstReleaseGovernanceFingerprintNativeBinding;
  };

const requireCanonicalProposalOperator = (
  value: unknown,
  networkPrefix: number,
): string => {
  if (typeof value !== "string") {
    throw new TypeError(
      "proposalOperator must be a canonical account literal.",
    );
  }
  const canonical = normalizeCanonicalAccountIdLiteral(
    value,
    "proposalOperator",
    networkPrefix,
  );
  if (canonical !== value) {
    throw new TypeError("proposalOperator must already be canonical.");
  }
  return canonical;
};

const serializeProposalObject = (value: unknown, label: string): string =>
  JSON.stringify(
    requireFirstReleaseJsonObject(
      value,
      label,
      MAX_GOVERNANCE_PROPOSAL_JSON_BYTES,
    ),
  );

const requireOptionalLifecycleProposalId = (value: unknown): Buffer | null => {
  if (value === null) return null;
  if (typeof value !== "string" || !LOWER_HEX_32.test(value)) {
    throw new TypeError(
      "payoutLifecycleProposalId must be null or exactly 64 lowercase hexadecimal digits.",
    );
  }
  const bytes = Buffer.from(value, "hex");
  if (bytes.every((byte) => byte === 0)) {
    throw new TypeError("payoutLifecycleProposalId must be non-zero.");
  }
  return bytes;
};

const requireFingerprint = (value: unknown, label: string): string => {
  const bytes =
    value instanceof ArrayBuffer
      ? Buffer.from(value)
      : Buffer.isBuffer(value) || ArrayBuffer.isView(value)
        ? Buffer.from(value.buffer, value.byteOffset, value.byteLength)
        : null;
  if (bytes === null || bytes.length !== 32) {
    throw new Error(`${label} must return exactly 32 native bytes.`);
  }
  return Buffer.from(bytes).toString("hex");
};

export const computeFirstReleaseValidationFeePolicyFingerprint = (input: {
  proposalOperator: string;
  networkPrefix: number;
  policy: JsonObject;
  payoutLifecycleProposalId: string | null;
}): string => {
  const proposalOperator = requireCanonicalProposalOperator(
    input.proposalOperator,
    input.networkPrefix,
  );
  const policyJson = serializeProposalObject(
    input.policy,
    "validation-fee policy",
  );
  const payoutLifecycleProposalId = requireOptionalLifecycleProposalId(
    input.payoutLifecycleProposalId,
  );
  return requireFingerprint(
    requireNativeBinding().validationFeePolicyProposalFingerprintV1(
      proposalOperator,
      policyJson,
      payoutLifecycleProposalId,
    ),
    "Native validation-fee policy fingerprint",
  );
};

export const computeFirstReleaseValidationFeePayoutLifecycleFingerprint =
  (input: {
    proposalOperator: string;
    networkPrefix: number;
    payoutBinding: JsonObject;
  }): string => {
    const proposalOperator = requireCanonicalProposalOperator(
      input.proposalOperator,
      input.networkPrefix,
    );
    const payoutBindingJson = serializeProposalObject(
      input.payoutBinding,
      "validation-fee payout binding",
    );
    return requireFingerprint(
      requireNativeBinding().validationFeePayoutLifecycleProposalFingerprintV1(
        proposalOperator,
        payoutBindingJson,
      ),
      "Native validation-fee payout-lifecycle fingerprint",
    );
  };

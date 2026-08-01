import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  VALIDATION_FEE_POLICY_OPERATOR_ONLY_MESSAGE,
  assertPublicGovernanceEnactKind,
} from "../src/governance/enactBoundary";
import {
  GOVERNANCE_PUBLIC_ENACT_AUTHORIZATION_IPC_CHANNEL,
  authorizePublicGovernanceEnactRequest,
} from "../electron/governanceEnactBoundary";

const source = (path: string): string =>
  readFileSync(resolve(process.cwd(), path), "utf8");

const between = (value: string, startMarker: string, endMarker: string) => {
  const start = value.indexOf(startMarker);
  const end = value.indexOf(endMarker, start + startMarker.length);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return value.slice(start, end);
};

describe("public governance enact boundary", () => {
  it("reserves validation-fee policy enactment for the exact-height operator", () => {
    expect(() =>
      assertPublicGovernanceEnactKind("ValidationFeePolicy"),
    ).toThrow(VALIDATION_FEE_POLICY_OPERATOR_ONLY_MESSAGE);
    expect(() =>
      authorizePublicGovernanceEnactRequest({
        proposalKind: "ValidationFeePolicy",
      }),
    ).toThrow(VALIDATION_FEE_POLICY_OPERATOR_ONLY_MESSAGE);
  });

  it("allows only the payout-lifecycle kind through the strict main request", () => {
    expect(
      authorizePublicGovernanceEnactRequest({
        proposalKind: "ValidationFeePayoutLifecycle",
      }),
    ).toBe(true);
    expect(() =>
      authorizePublicGovernanceEnactRequest({
        proposalKind: "ValidationFeePayoutLifecycle",
        operatorOverride: true,
      }),
    ).toThrow("fields must be exactly proposalKind");
    expect(() =>
      authorizePublicGovernanceEnactRequest({ proposalKind: "Unknown" }),
    ).toThrow("cannot be enacted through the public governance wallet");
  });

  it("keeps finalization and enactment out of the public Electron wallet", () => {
    const main = source("electron/main.ts");
    const preload = source("electron/preload.ts");
    const prepare = between(
      preload,
      "const prepareGovernanceEnactAction",
      "const confirmPreparedGovernanceAction",
    );
    const confirm = between(
      preload,
      "const confirmPreparedGovernanceAction",
      "const createPrivateKaigiNonce",
    );

    expect(GOVERNANCE_PUBLIC_ENACT_AUTHORIZATION_IPC_CHANNEL).toBe(
      "governance:authorizePublicEnact",
    );
    expect(main).not.toContain("registerGovernanceEnactBoundaryHandler");
    expect(main).not.toContain(
      "GOVERNANCE_PUBLIC_ENACT_AUTHORIZATION_IPC_CHANNEL",
    );
    expect(prepare).toContain(
      "Validation-fee finalization and enactment are operator-only typed workflows",
    );
    expect(prepare).not.toContain("governanceRequestJson(");
    expect(preload).not.toContain("/v1/gov/enact");
    expect(confirm).not.toContain("EnactReferendum");
  });
});

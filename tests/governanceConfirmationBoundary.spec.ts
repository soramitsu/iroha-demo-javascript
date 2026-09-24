import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const preload = readFileSync(
  resolve(process.cwd(), "electron/preload.ts"),
  "utf8",
);

const between = (startMarker: string, endMarker: string): string => {
  const start = preload.indexOf(startMarker);
  const end = preload.indexOf(endMarker, start + startMarker.length);
  expect(start, `missing source marker ${startMarker}`).toBeGreaterThanOrEqual(
    0,
  );
  expect(end, `missing source marker ${endMarker}`).toBeGreaterThan(start);
  return preload.slice(start, end);
};

describe("governance confirmation capability boundary", () => {
  it("captures the exact parsed capability contract fingerprint in the review", () => {
    const prepare = between(
      "const prepareGovernanceDecodedAction",
      "const assertGovernanceExactKeys",
    );
    const revalidation = prepare.indexOf(
      "await assertGovernanceWriteCapabilities(",
    );
    const fingerprint = prepare.indexOf(
      "governanceCapabilitiesContractFingerprintV1(governanceCapabilities)",
    );
    const pendingReview = prepare.indexOf("governanceCapabilitiesFingerprint,");

    expect(revalidation).toBeGreaterThanOrEqual(0);
    expect(fingerprint).toBeGreaterThan(revalidation);
    expect(pendingReview).toBeGreaterThan(fingerprint);
    expect(prepare).toContain("buildFirstReleaseAuthorityTransactionDraft({");
    expect(prepare).toContain("await fetchFirstReleaseAuthorityFeeQuote({");
    expect(prepare).not.toContain("getClient(");
  });

  it("revalidates and rejects capability drift before vault access or signing", () => {
    const confirm = between(
      "const confirmPreparedGovernanceAction",
      "const assertIrohaConnectWalletContext",
    );
    const revalidation = confirm.indexOf(
      "await assertGovernanceWriteCapabilities({",
    );
    const fingerprint = confirm.indexOf(
      "governanceCapabilitiesContractFingerprintV1(governanceCapabilities)",
    );
    const comparison = confirm.indexOf(
      "prepared.governanceCapabilitiesFingerprint",
    );
    const vaultAccess = confirm.indexOf("resolveSigningMaterial({");
    const signing = confirm.indexOf("signFirstReleaseAuthorityTransaction({");

    expect(revalidation).toBeGreaterThanOrEqual(0);
    expect(fingerprint).toBeGreaterThan(revalidation);
    expect(comparison).toBeGreaterThan(fingerprint);
    expect(vaultAccess).toBeGreaterThan(comparison);
    expect(signing).toBeGreaterThan(vaultAccess);

    const driftRejection = confirm.slice(comparison, vaultAccess);
    expect(driftRejection).toContain(
      "preparedGovernanceActions.delete(reviewId);",
    );
    expect(driftRejection).toContain(
      "Governance capabilities changed after review. Prepare the action again.",
    );
  });

  it("cannot construct a retired ballot or enactment review", () => {
    const confirm = between(
      "const confirmPreparedGovernanceAction",
      "const assertIrohaConnectWalletContext",
    );
    const types = readFileSync(
      resolve(process.cwd(), "src/types/iroha.d.ts"),
      "utf8",
    );
    const prepareBoundary = preload.slice(
      preload.indexOf("const prepareGovernanceCitizenRegistrationAction"),
      preload.indexOf("const confirmPreparedGovernanceAction"),
    );

    for (const source of [prepareBoundary, confirm, types]) {
      expect(source).not.toMatch(
        /plain-ballot|parliament-ballot|enact-referendum|CastPlainBallot|CastParliamentBallot|EnactReferendum/u,
      );
    }
  });
});

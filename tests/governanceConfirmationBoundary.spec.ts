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
    expect(prepare).toContain(
      "getClient(input.context.toriiUrl).quoteFees(payload,",
    );
  });

  it("revalidates and rejects capability drift before vault access or signing", () => {
    const confirm = between(
      "const confirmPreparedGovernanceAction",
      "const createPrivateKaigiNonce",
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
    const signing = confirm.indexOf("signQuotedTransactionPayload({");

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

  it("revalidates the immutable electorate and live ballot state before vault access", () => {
    const confirm = between(
      "const confirmPreparedGovernanceAction",
      "const createPrivateKaigiNonce",
    );
    const ballotBranch = confirm.indexOf(
      'prepared.view.operation === "plain-ballot"',
    );
    const contractReload = confirm.indexOf(
      "await fetchGovernancePlainReferendumContract({",
      ballotBranch,
    );
    const fingerprint = confirm.indexOf(
      "plainReferendum.contractFingerprint !== ballot.contractFingerprint",
      contractReload,
    );
    const citizenship = confirm.indexOf(
      "await assertCurrentBondedGovernanceCitizen(",
      fingerprint,
    );
    const proposalReload = confirm.indexOf(
      "await fetchGovernanceProposalDetail({",
      citizenship,
    );
    const binding = confirm.indexOf(
      "assertGovernancePlainReferendumBallotBinding(plainReferendum",
      proposalReload,
    );
    const vaultAccess = confirm.indexOf("resolveSigningMaterial({");
    const signing = confirm.indexOf("signQuotedTransactionPayload({");

    expect(ballotBranch).toBeGreaterThanOrEqual(0);
    expect(contractReload).toBeGreaterThan(ballotBranch);
    expect(fingerprint).toBeGreaterThan(contractReload);
    expect(citizenship).toBeGreaterThan(fingerprint);
    expect(proposalReload).toBeGreaterThan(citizenship);
    expect(binding).toBeGreaterThan(proposalReload);
    expect(vaultAccess).toBeGreaterThan(binding);
    expect(signing).toBeGreaterThan(vaultAccess);
    expect(confirm.slice(ballotBranch, vaultAccess)).toContain(
      "hasExistingLock: proposal.locks.some",
    );
    expect(confirm.slice(ballotBranch, vaultAccess)).toContain(
      "plainReferendum.artifactSha256 !== ballot.artifactSha256",
    );
  });
});

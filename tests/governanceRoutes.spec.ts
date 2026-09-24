import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  GOVERNANCE_CAPABILITIES_PATH,
  GOVERNANCE_CITIZEN_DRAFT_PATH,
  VALIDATION_FEE_PROPOSALS_PATH,
  validationFeeProposalPath,
} from "../electron/governanceRoutes";

describe("current governance Torii routes", () => {
  it("exposes only the exact capability, citizen, and typed proposal helpers", () => {
    expect(GOVERNANCE_CAPABILITIES_PATH).toBe("/v1/gov/capabilities");
    expect(GOVERNANCE_CITIZEN_DRAFT_PATH).toBe("/v1/gov/citizens/draft");
    expect(VALIDATION_FEE_PROPOSALS_PATH).toBe("/v1/validation-fee/proposals");
    expect(validationFeeProposalPath("ab".repeat(32))).toBe(
      `/v1/validation-fee/proposals/${"ab".repeat(32)}`,
    );

    const source = readFileSync(
      resolve(process.cwd(), "electron/governanceRoutes.ts"),
      "utf8",
    );
    for (const retired of [
      "/v1/gov/proposals",
      "/v1/gov/referenda",
      "/v1/gov/tally",
      "/v1/gov/locks",
      "plain-ballot/draft",
    ]) {
      expect(source).not.toContain(retired);
    }
  });

  it("keeps retired proposal-backed PLAIN, direct-body, and manual enact APIs absent", () => {
    const preload = readFileSync(
      resolve(process.cwd(), "electron/preload.ts"),
      "utf8",
    );
    for (const retired of [
      "prepareGovernancePlainBallot",
      "prepareGovernanceParliamentBallot",
      "prepareGovernanceDirectParliamentAction",
      "prepareGovernanceEnact",
      "fetchGovernancePlainReferendumContract",
      "getGovernancePlainReferendumContract",
      "plain-ballot/draft",
    ]) {
      expect(preload).not.toContain(retired);
    }
  });

  it("loads proposal reads only from the exact typed validation-fee routes", () => {
    const preload = readFileSync(
      resolve(process.cwd(), "electron/preload.ts"),
      "utf8",
    );
    const listStart = preload.indexOf(
      "const fetchGovernanceProposalList = async",
    );
    const detailStart = preload.indexOf(
      "const fetchGovernanceProposalDetail = async",
      listStart,
    );
    const policyStart = preload.indexOf(
      "const fetchGovernanceValidationFeePolicy = async",
      detailStart,
    );
    expect(listStart).toBeGreaterThanOrEqual(0);
    expect(detailStart).toBeGreaterThan(listStart);
    expect(policyStart).toBeGreaterThan(detailStart);
    const loaders = preload.slice(listStart, policyStart);
    expect(loaders).toContain("VALIDATION_FEE_PROPOSALS_PATH");
    expect(loaders).toContain("validationFeeProposalPath(rawId)");
    expect(loaders).not.toContain("/v1/gov/proposals");
    expect(loaders).not.toContain("account_id");
    expect(loaders).not.toContain("referendum");
  });
});

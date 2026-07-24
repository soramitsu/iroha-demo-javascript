import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  GOVERNANCE_CAPABILITIES_PATH,
  GOVERNANCE_CITIZEN_DRAFT_PATH,
  GOVERNANCE_UNLOCK_STATS_PATH,
  VALIDATION_FEE_PROPOSALS_PATH,
  governanceLocksPath,
  governanceProposalPath,
  governanceReferendumPath,
  governanceTallyPath,
  validationFeeProposalPath,
} from "../electron/governanceRoutes";

describe("governance Torii routes", () => {
  it("uses the typed validation-fee catalog instead of an unsupported generic collection", () => {
    expect(VALIDATION_FEE_PROPOSALS_PATH).toBe("/v1/validation-fee/proposals");
    expect(validationFeeProposalPath("ab".repeat(32))).toBe(
      `/v1/validation-fee/proposals/${"ab".repeat(32)}`,
    );
    expect(VALIDATION_FEE_PROPOSALS_PATH).not.toBe("/v1/gov/proposals");
  });

  it("uses the single strict capabilities contract and reviewed citizenship draft", () => {
    expect(GOVERNANCE_CAPABILITIES_PATH).toBe("/v1/gov/capabilities");
    expect(GOVERNANCE_CITIZEN_DRAFT_PATH).toBe("/v1/gov/citizens/draft");
  });

  it("builds only the exact generic governance read routes advertised by Torii", () => {
    const id = "ab".repeat(32);
    expect(governanceProposalPath(id)).toBe(`/v1/gov/proposals/${id}`);
    expect(governanceReferendumPath(id)).toBe(`/v1/gov/referenda/${id}`);
    expect(governanceTallyPath(id)).toBe(`/v1/gov/tally/${id}`);
    expect(governanceLocksPath(id)).toBe(`/v1/gov/locks/${id}`);
    expect(GOVERNANCE_UNLOCK_STATS_PATH).toBe("/v1/gov/unlocks/stats");
    expect(governanceProposalPath(id)).not.toContain("/detail");
  });

  it("encodes an opaque referendum id as one path segment", () => {
    expect(governanceReferendumPath(" referendum/one ")).toBe(
      "/v1/gov/referenda/referendum%2Fone",
    );
  });

  it("does not call routes that Torii does not advertise", () => {
    const preloadSource = readFileSync(
      resolve(process.cwd(), "electron/preload.ts"),
      "utf8",
    );
    expect(preloadSource).not.toContain("/v1/gov/proposals?");
    expect(preloadSource).not.toContain("/detail");
    expect(preloadSource).not.toContain(
      'path: "/v1/gov/proposals/runtime-upgrade"',
    );
    expect(preloadSource).not.toContain(
      'path: "/v1/gov/proposals/deploy-contract"',
    );
    expect(preloadSource).not.toContain(
      'path: "/v1/gov/proposals/sccp-route-governance"',
    );
    expect(preloadSource).not.toContain(
      'buildNexusEndpoint(toriiUrl, "/configuration")',
    );
  });
});

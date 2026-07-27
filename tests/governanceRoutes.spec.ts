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
  validationFeePlainBallotDraftPath,
  validationFeeProposalPath,
} from "../electron/governanceRoutes";

describe("governance Torii routes", () => {
  it("uses the typed validation-fee catalog instead of an unsupported generic collection", () => {
    expect(VALIDATION_FEE_PROPOSALS_PATH).toBe("/v1/validation-fee/proposals");
    expect(validationFeeProposalPath("ab".repeat(32))).toBe(
      `/v1/validation-fee/proposals/${"ab".repeat(32)}`,
    );
    expect(validationFeePlainBallotDraftPath("ab".repeat(32))).toBe(
      `/v1/validation-fee/proposals/${"ab".repeat(32)}/plain-ballot/draft`,
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
    expect(preloadSource).not.toContain("/v1/gov/enact");
    expect(preloadSource).toContain("validationFeePlainBallotDraftPath(");
    expect(preloadSource).not.toContain(
      'governanceRequestJson(\n    input.toriiUrl,\n    "/v1/gov/ballots/plain"',
    );
  });

  it("uses the proposal-bound validation-fee draft with only native request fields", () => {
    const preloadSource = readFileSync(
      resolve(process.cwd(), "electron/preload.ts"),
      "utf8",
    );
    const start = preloadSource.indexOf(
      "const prepareGovernancePlainBallotAction",
    );
    const end = preloadSource.indexOf(
      "const prepareGovernanceParliamentBallotAction",
      start,
    );
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const prepare = preloadSource.slice(start, end);
    expect(prepare).toContain("validationFeePlainBallotDraftPath(");
    expect(prepare).toContain(
      "version: plainReferendum.contract.ballot.requestVersion",
    );
    expect(prepare).toContain("owner: accountId");
    expect(prepare).toContain("direction: input.direction.toUpperCase()");
    expect(prepare).toContain("assertGovernancePlainReferendumBallotDraft(");
    expect(prepare).not.toContain("/v1/gov/ballots/plain");
    expect(prepare).not.toContain("chain_id:");
    expect(prepare).not.toContain("authority:");
  });

  it("loads proposal detail only from the current typed detail contract", () => {
    const preloadSource = readFileSync(
      resolve(process.cwd(), "electron/preload.ts"),
      "utf8",
    );
    const start = preloadSource.indexOf(
      "const fetchGovernanceProposalDetail = async",
    );
    const end = preloadSource.indexOf(
      "const fetchGovernanceValidationFeePolicy = async",
      start,
    );
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const detailLoader = preloadSource.slice(start, end);

    expect(detailLoader).toContain("validationFeeProposalPath(rawId)");
    expect(detailLoader).not.toContain("governanceProposalPath(");
    expect(detailLoader).not.toContain("governanceReferendumPath(");
    expect(detailLoader).not.toContain("governanceTallyPath(");
    expect(detailLoader).not.toContain("governanceLocksPath(");
    expect(detailLoader).not.toContain("GOVERNANCE_UNLOCK_STATS_PATH");
  });

  it("binds validation-fee proof reads to observed governance identity", () => {
    const preloadSource = readFileSync(
      resolve(process.cwd(), "electron/preload.ts"),
      "utf8",
    );
    const start = preloadSource.indexOf(
      "const fetchGovernanceValidationFeePolicy = async",
    );
    const end = preloadSource.indexOf("const normalizeGovernanceWireId", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const policyLoader = preloadSource.slice(start, end);

    expect(policyLoader).toContain(
      "const capabilities = await fetchGovernanceCapabilities(endpoint)",
    );
    expect(policyLoader).toContain("capabilities.chainId !== chainId");
    expect(policyLoader).toContain(
      "capabilities.networkPrefix !== networkPrefix",
    );
    expect(policyLoader.indexOf("fetchGovernanceCapabilities")).toBeLessThan(
      policyLoader.indexOf("GOVERNANCE_VALIDATION_FEE_POLICY_IPC_CHANNEL"),
    );
    expect(policyLoader).not.toContain("GOVERNANCE_RUNTIME_CONFIG_IPC_CHANNEL");
    expect(policyLoader).not.toContain("trustScopeHash");
    expect(policyLoader).not.toContain("https://taira.sora.org");
    expect(policyLoader).not.toContain(".origin");
  });
});

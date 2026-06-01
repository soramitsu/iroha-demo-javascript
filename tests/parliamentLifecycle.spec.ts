import { describe, expect, it } from "vitest";
import {
  buildFallbackGovernanceLifecycle,
  makeGovernanceActionGate,
  resolveGovernanceRole,
  roleLabelKey,
} from "@/utils/parliamentLifecycle";

describe("parliament lifecycle helpers", () => {
  it("builds a fallback lifecycle without inventing future-stage data", () => {
    const snapshot = buildFallbackGovernanceLifecycle({
      referendumId: "ref-1",
      proposalId: `0x${"a".repeat(64)}`,
      proposalFound: true,
      referendumFound: true,
      hasTally: false,
      hasLocks: false,
      hasCouncil: true,
      role: "citizen",
    });

    expect(snapshot.source).toBe("client-fallback");
    expect(snapshot.currentStageId).toBe("vote");
    expect(snapshot.futureStagesUnavailable).toBe(true);
    expect(snapshot.stages.find((stage) => stage.id === "briefs")?.status).toBe(
      "unavailable",
    );
    expect(snapshot.stages.find((stage) => stage.id === "vote")?.status).toBe(
      "active",
    );
  });

  it("moves fallback lifecycle focus to tally when live tallies exist", () => {
    const snapshot = buildFallbackGovernanceLifecycle({
      referendumId: "ref-1",
      proposalId: null,
      proposalFound: false,
      referendumFound: true,
      hasTally: true,
      hasLocks: true,
      hasCouncil: false,
      role: "none",
    });

    expect(snapshot.currentStageId).toBe("tally");
    expect(snapshot.stages.find((stage) => stage.id === "tally")?.status).toBe(
      "active",
    );
    expect(snapshot.stages.find((stage) => stage.id === "enact")?.status).toBe(
      "pending",
    );
  });

  it("resolves governance roles by privilege and roster membership", () => {
    const council = {
      epoch: 1,
      members: [{ account_id: "alice@wonderland" }],
      alternates: [{ account_id: "bob@wonderland" }],
      candidate_count: 2,
      verified: 2,
      derived_by: "Fallback",
    };

    expect(
      resolveGovernanceRole({
        accountId: "alice@wonderland",
        council,
        hasCitizenRole: true,
        hasOperatorRole: false,
      }),
    ).toBe("seated_member");
    expect(
      resolveGovernanceRole({
        accountId: "bob@wonderland",
        council,
        hasCitizenRole: true,
        hasOperatorRole: false,
      }),
    ).toBe("alternate");
    expect(
      resolveGovernanceRole({
        accountId: "carol@wonderland",
        council,
        hasCitizenRole: true,
        hasOperatorRole: false,
      }),
    ).toBe("citizen");
    expect(
      resolveGovernanceRole({
        accountId: "carol@wonderland",
        council,
        hasCitizenRole: true,
        hasOperatorRole: true,
      }),
    ).toBe("operator");
  });

  it("normalizes action gates and role labels", () => {
    expect(makeGovernanceActionGate(true, "busy", "wait")).toEqual({
      enabled: true,
      code: "ready",
      reason: "",
    });
    expect(makeGovernanceActionGate(false, "not-seated", "not seated")).toEqual(
      {
        enabled: false,
        code: "not-seated",
        reason: "not seated",
      },
    );
    expect(roleLabelKey("seated_member")).toBe("Seated member");
  });
});

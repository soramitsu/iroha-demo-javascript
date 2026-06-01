import type {
  GovernanceActionGate,
  GovernanceActionGateCode,
  GovernanceBriefStatus,
  GovernanceChallengeStatus,
  GovernanceCouncilCurrentResponse,
  GovernanceLifecycleSnapshot,
  GovernanceLifecycleStage,
  GovernanceLifecycleStageId,
  GovernanceRole,
  GovernanceRolloutStatus,
  GovernanceStageStatus,
} from "@/types/iroha";

export const GOVERNANCE_LIFECYCLE_STAGE_IDS = [
  "submitted",
  "briefs",
  "comment",
  "sortition",
  "vote",
  "tally",
  "challenge",
  "canary",
  "enact",
  "review",
] as const satisfies readonly GovernanceLifecycleStageId[];

const STAGE_LABEL_KEYS: Record<GovernanceLifecycleStageId, string> = {
  submitted: "Submitted",
  briefs: "Briefs",
  comment: "Comment",
  sortition: "Sortition",
  vote: "Vote",
  tally: "Tally",
  challenge: "Challenge",
  canary: "Canary",
  enact: "Enact",
  review: "Review",
};

const STAGE_DETAIL_KEYS: Record<GovernanceLifecycleStageId, string> = {
  submitted: "Proposal identity and referendum envelope are loaded from Torii.",
  briefs:
    "Expert and red-team brief endpoints are not available on this Torii endpoint yet.",
  comment:
    "Public comment endpoints are not available on this Torii endpoint yet.",
  sortition:
    "Council data shows the active Parliament roster when Torii exposes it.",
  vote: "Citizens can submit a ballot when eligibility and referendum data are ready.",
  tally:
    "Vote totals and lock records come from the live referendum endpoints.",
  challenge:
    "Challenge-window endpoints are not available on this Torii endpoint yet.",
  canary:
    "Canary rollout endpoints are not available on this Torii endpoint yet.",
  enact: "Privileged enactment tools stay in Advanced governance tools.",
  review:
    "Retrospective review and clawback endpoints are not available on this Torii endpoint yet.",
};

const isFutureOnlyStage = (id: GovernanceLifecycleStageId) =>
  id === "briefs" ||
  id === "comment" ||
  id === "challenge" ||
  id === "canary" ||
  id === "review";

const stage = (
  id: GovernanceLifecycleStageId,
  status: GovernanceStageStatus,
): GovernanceLifecycleStage => ({
  id,
  labelKey: STAGE_LABEL_KEYS[id],
  status,
  detailKey: STAGE_DETAIL_KEYS[id],
});

export const makeGovernanceActionGate = (
  enabled: boolean,
  code: GovernanceActionGateCode,
  reason: string,
): GovernanceActionGate => ({
  enabled,
  code: enabled ? "ready" : code,
  reason: enabled ? "" : reason,
});

export const resolveGovernanceRole = (input: {
  accountId: string;
  council: GovernanceCouncilCurrentResponse | null;
  hasCitizenRole: boolean;
  hasOperatorRole: boolean;
}): GovernanceRole => {
  const accountId = input.accountId.trim();
  if (input.hasOperatorRole) {
    return "operator";
  }
  if (!accountId) {
    return "none";
  }
  if (
    input.council?.members.some((member) => member.account_id === accountId)
  ) {
    return "seated_member";
  }
  if (
    input.council?.alternates.some((member) => member.account_id === accountId)
  ) {
    return "alternate";
  }
  return input.hasCitizenRole ? "citizen" : "none";
};

export const roleLabelKey = (role: GovernanceRole) => {
  switch (role) {
    case "operator":
      return "Operator";
    case "seated_member":
      return "Seated member";
    case "alternate":
      return "Alternate";
    case "citizen":
      return "Citizen";
    case "none":
      return "No governance role";
  }
};

export const buildFallbackGovernanceLifecycle = (input: {
  referendumId: string | null;
  proposalId: string | null;
  proposalFound: boolean;
  referendumFound: boolean;
  hasTally: boolean;
  hasLocks: boolean;
  hasCouncil: boolean;
  role: GovernanceRole;
}): GovernanceLifecycleSnapshot => {
  const hasLoadedRecord = Boolean(
    input.proposalFound || input.referendumFound || input.proposalId,
  );
  const hasReferendum = Boolean(input.referendumFound || input.referendumId);
  const currentStageId: GovernanceLifecycleStageId = input.hasTally
    ? "tally"
    : hasReferendum
      ? "vote"
      : hasLoadedRecord
        ? "submitted"
        : "submitted";

  const stages = GOVERNANCE_LIFECYCLE_STAGE_IDS.map((id) => {
    if (isFutureOnlyStage(id)) {
      return stage(id, "unavailable");
    }
    if (id === "submitted") {
      return stage(id, hasLoadedRecord ? "complete" : "active");
    }
    if (id === "sortition") {
      return stage(id, input.hasCouncil ? "complete" : "pending");
    }
    if (id === "vote") {
      return stage(id, hasReferendum ? "active" : "blocked");
    }
    if (id === "tally") {
      return stage(id, input.hasTally ? "active" : "pending");
    }
    if (id === "enact") {
      return stage(id, input.hasTally ? "pending" : "blocked");
    }
    return stage(id, "pending");
  });

  const briefStatus: GovernanceBriefStatus = {
    required: false,
    submitted: 0,
    redTeamRequired: false,
    redTeamSubmitted: 0,
    endpointAvailable: false,
  };
  const challengeStatus: GovernanceChallengeStatus = {
    open: false,
    bondRequired: null,
    activeChallenges: 0,
    endpointAvailable: false,
  };
  const rolloutStatus: GovernanceRolloutStatus = {
    phase: "unavailable",
    endpointAvailable: false,
  };

  return {
    source: "client-fallback",
    endpointAvailable: true,
    referendumId: input.referendumId,
    proposalId: input.proposalId,
    currentStageId,
    role: input.role,
    stages,
    briefStatus,
    challengeStatus,
    rolloutStatus,
    futureStagesUnavailable: true,
  };
};

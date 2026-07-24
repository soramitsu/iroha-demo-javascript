export const VALIDATION_FEE_PROPOSALS_PATH = "/v1/validation-fee/proposals";
export const GOVERNANCE_CAPABILITIES_PATH = "/v1/gov/capabilities";
export const GOVERNANCE_CITIZEN_DRAFT_PATH = "/v1/gov/citizens/draft";
export const GOVERNANCE_UNLOCK_STATS_PATH = "/v1/gov/unlocks/stats";

const encodedPathSegment = (value: string) => encodeURIComponent(value.trim());

export const governanceProposalPath = (proposalId: string) =>
  `/v1/gov/proposals/${encodedPathSegment(proposalId)}`;

export const validationFeeProposalPath = (proposalId: string) =>
  `${VALIDATION_FEE_PROPOSALS_PATH}/${encodedPathSegment(proposalId)}`;

export const governanceReferendumPath = (referendumId: string) =>
  `/v1/gov/referenda/${encodedPathSegment(referendumId)}`;

export const governanceTallyPath = (referendumId: string) =>
  `/v1/gov/tally/${encodedPathSegment(referendumId)}`;

export const governanceLocksPath = (referendumId: string) =>
  `/v1/gov/locks/${encodedPathSegment(referendumId)}`;

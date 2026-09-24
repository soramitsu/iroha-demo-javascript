export const VALIDATION_FEE_PROPOSALS_PATH = "/v1/validation-fee/proposals";
export const GOVERNANCE_CAPABILITIES_PATH = "/v1/gov/capabilities";
export const GOVERNANCE_CITIZEN_DRAFT_PATH = "/v1/gov/citizens/draft";

const encodedPathSegment = (value: string) => encodeURIComponent(value.trim());

export const validationFeeProposalPath = (proposalId: string) =>
  `${VALIDATION_FEE_PROPOSALS_PATH}/${encodedPathSegment(proposalId)}`;

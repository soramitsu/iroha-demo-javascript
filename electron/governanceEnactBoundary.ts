import {
  assertPublicGovernanceEnactKind,
  type PublicGovernanceEnactKind,
} from "../src/governance/enactBoundary";

export const GOVERNANCE_PUBLIC_ENACT_AUTHORIZATION_IPC_CHANNEL =
  "governance:authorizePublicEnact";

const exactRequest = (
  value: unknown,
): { proposalKind: PublicGovernanceEnactKind } => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(
      "Public governance enact authorization must be a JSON object.",
    );
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== 1 || keys[0] !== "proposalKind") {
    throw new Error(
      "Public governance enact authorization fields must be exactly proposalKind.",
    );
  }
  assertPublicGovernanceEnactKind(record.proposalKind);
  return { proposalKind: record.proposalKind };
};

export const authorizePublicGovernanceEnactRequest = (value: unknown): true => {
  exactRequest(value);
  return true;
};

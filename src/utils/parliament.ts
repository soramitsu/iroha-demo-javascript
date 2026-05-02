import type {
  AccountPermissionItem,
  GovernanceBallotDirection,
  GovernanceCitizenCountResponse,
  GovernanceCitizenStatusResponse,
} from "@/types/iroha";
import {
  areAssetDefinitionIdsEquivalent,
  extractAssetDefinitionId,
  resolveToriiXorAsset,
} from "@/utils/assetId";

export const CITIZEN_BOND_XOR = "10000";
export const PARLIAMENT_HISTORY_LIMIT = 8;

export type ParliamentHistory = {
  referenda: string[];
  proposals: string[];
};

const PROPOSAL_ID_PATTERN = /^(?:0x)?[0-9a-fA-F]{64}$/;

export const resolveXorBalance = (
  assets: Array<{ asset_id: string; quantity: string }>,
  preferredAssetDefinitionIds: string | Array<string | null | undefined> = [],
) => {
  const resolvedAsset = resolveToriiXorAsset(
    assets,
    Array.isArray(preferredAssetDefinitionIds)
      ? preferredAssetDefinitionIds
      : [preferredAssetDefinitionIds],
  );
  return resolvedAsset?.quantity ?? "0";
};

export const resolveGovernanceBondBalance = (
  assets: Array<{ asset_id: string; quantity: string }>,
  citizenshipAssetDefinitionId: string | null | undefined,
  fallbackPreferredAssetDefinitionIds:
    | string
    | Array<string | null | undefined> = [],
) => {
  const expectedDefinitionId = extractAssetDefinitionId(
    citizenshipAssetDefinitionId,
  ).trim();
  if (expectedDefinitionId) {
    const exactAsset = assets.find((asset) =>
      areAssetDefinitionIdsEquivalent(asset.asset_id, expectedDefinitionId),
    );
    return exactAsset?.quantity ?? "0";
  }
  return resolveXorBalance(assets, fallbackPreferredAssetDefinitionIds);
};

export const listGovernancePermissions = (
  permissions: AccountPermissionItem[],
) =>
  Array.from(new Set(permissions.map((permission) => permission.name))).sort();

export const hasGovernancePermission = (
  permissions: AccountPermissionItem[],
  expected: string,
) => listGovernancePermissions(permissions).includes(expected);

export const isRegisteredGovernanceCitizen = (
  status: Pick<GovernanceCitizenStatusResponse, "isCitizen"> | null | undefined,
  hasBallotPermission = false,
) => Boolean(hasBallotPermission || status?.isCitizen === true);

export const resolveGovernanceCitizenCount = (
  council: Pick<GovernanceCitizenCountResponse, "total"> | null | undefined,
) => {
  const count = Number(council?.total);
  return Number.isFinite(count) && count >= 0 ? Math.trunc(count) : null;
};

export const ballotDirectionToCode = (
  direction: GovernanceBallotDirection,
): 0 | 1 | 2 => {
  switch (direction) {
    case "Aye":
      return 0;
    case "Nay":
      return 1;
    case "Abstain":
      return 2;
  }
};

export const canonicalizeProposalId = (value: string) => {
  const literal = value.trim();
  if (!PROPOSAL_ID_PATTERN.test(literal)) {
    return null;
  }
  const body = literal.replace(/^0x/i, "").toLowerCase();
  return `0x${body}`;
};

export const isValidProposalId = (value: string) =>
  canonicalizeProposalId(value) !== null;

export const sanitizeReferendumId = (value: string) => value.trim();

export const isPositiveWholeNumberString = (value: string) => {
  const literal = value.trim();
  return /^\d+$/.test(literal) && !/^0+$/.test(literal);
};

export const isPositiveInteger = (value: number) =>
  Number.isInteger(value) && value > 0;

const optionalString = (value: unknown) => {
  if (typeof value !== "string") {
    return null;
  }
  const literal = value.trim();
  return literal ? literal : null;
};

const parseRecentEntries = (
  entries: unknown[],
  normalize?: (value: string) => string | null,
) => {
  const next: string[] = [];
  for (const entry of entries) {
    const literal = optionalString(entry);
    if (!literal) continue;
    const normalized = normalize ? normalize(literal) : literal;
    if (!normalized || next.includes(normalized)) continue;
    next.push(normalized);
    if (next.length >= PARLIAMENT_HISTORY_LIMIT) {
      break;
    }
  }
  return next;
};

export const extractProposalIdFromReferendum = (
  referendum: Record<string, unknown> | null | undefined,
) => {
  if (!referendum) {
    return null;
  }
  const nestedProposal = referendum.proposal;
  const nestedProposalId =
    nestedProposal &&
    typeof nestedProposal === "object" &&
    !Array.isArray(nestedProposal)
      ? (optionalString((nestedProposal as Record<string, unknown>).id) ??
        optionalString((nestedProposal as Record<string, unknown>).proposal_id))
      : null;

  const candidates = [
    optionalString(referendum.proposal_id),
    optionalString(referendum.proposalId),
    optionalString(referendum.proposal_hash),
    optionalString(referendum.proposalHash),
    nestedProposalId,
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const normalized = canonicalizeProposalId(candidate);
    if (normalized) {
      return normalized;
    }
  }
  return null;
};

export const pushRecentValue = (
  entries: string[],
  value: string,
  limit = PARLIAMENT_HISTORY_LIMIT,
) => {
  const literal = value.trim();
  if (!literal) {
    return entries.slice(0, limit);
  }
  const deduped = entries.filter((entry) => entry !== literal);
  return [literal, ...deduped].slice(0, limit);
};

export const parseParliamentHistory = (value: unknown): ParliamentHistory => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { referenda: [], proposals: [] };
  }
  const record = value as Record<string, unknown>;
  return {
    referenda: Array.isArray(record.referenda)
      ? parseRecentEntries(record.referenda)
      : [],
    proposals: Array.isArray(record.proposals)
      ? parseRecentEntries(record.proposals, canonicalizeProposalId)
      : [],
  };
};

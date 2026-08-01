import type { ToriiClient } from "@iroha/iroha-js";
import {
  confidentialModeSupportsShield,
  isPositiveWholeAmount,
} from "../src/utils/confidential";
import { sanitizeErrorMessage } from "../src/utils/errorMessage";
import { normalizeFirstReleaseAssetDefinitionId } from "./assetDefinitionId";

export { confidentialModeSupportsShield, isPositiveWholeAmount };

export type ExplorerAccountQrResponse = Awaited<
  ReturnType<ToriiClient["getExplorerAccountQr"]>
>;

export interface PublicLaneValidatorStatusView {
  type: string;
  activates_at_epoch: number | null;
  reason: string | null;
  releases_at_ms: number | null;
  slash_id: string | null;
}

export interface PublicLaneValidatorRecordView {
  lane_id: number;
  validator: string;
  peer_id: string;
  stake_account: string;
  total_stake: string;
  self_stake: string;
  status: PublicLaneValidatorStatusView;
  activation_epoch: number | null;
  activation_height: number | null;
  last_reward_epoch: number | null;
  metadata: Record<string, unknown>;
}

export interface PublicLaneValidatorsResponseView {
  lane_id: number;
  total: number;
  items: PublicLaneValidatorRecordView[];
}

export interface PublicLaneUnbondingView {
  request_id: string;
  amount: string;
  release_at_ms: number;
}

export interface PublicLaneStakeShareView {
  lane_id: number;
  validator: string;
  staker: string;
  bonded: string;
  metadata: Record<string, unknown>;
  pending_unbonds: PublicLaneUnbondingView[];
}

export interface PublicLaneStakeResponseView {
  lane_id: number;
  total: number;
  items: PublicLaneStakeShareView[];
}

export interface PublicLanePendingRewardView {
  lane_id: number;
  account: string;
  asset: string;
  last_claimed_epoch: number;
  pending_through_epoch: number;
  amount: string;
}

export interface PublicLaneRewardsResponseView {
  lane_id: number;
  total: number;
  items: PublicLanePendingRewardView[];
}

export interface NexusLifecycleLaneView {
  id: number;
  dataspace_id: string;
  alias: string;
  description: string;
  visibility: string;
  governance: string | null;
  storage: string;
  proof_scheme: string;
  metadata: Record<string, unknown>;
}

export interface NexusLifecycleView {
  version: number;
  nexus_enabled: boolean;
  lane_count: number;
  lanes: NexusLifecycleLaneView[];
}

export interface OfflineReadinessBlockerView {
  code: string;
  message: string;
}

export interface OfflineReadinessView {
  required_bridge_abi_version: 21;
  cash_handoff_capability: "cash_handoff_v1";
  max_hops: number;
  asset_definition_id: string;
  asset_scale: number | null;
  evaluated_block_height: number;
  evaluated_block_hash: string;
  active_transfer_verifier: Record<string, unknown> | null;
  active_topup_shield_verifier: Record<string, unknown> | null;
  active_unshield_verifier: Record<string, unknown> | null;
  active_recursive_step_eq_verifier: Record<string, unknown> | null;
  active_recursive_step_ep_verifier: Record<string, unknown> | null;
  artifact_set: Record<string, unknown> | null;
  proof_backend_available: boolean;
  recursive_lineage_supported: boolean;
  ready: boolean;
  blockers: OfflineReadinessBlockerView[];
}

export interface AssetDefinitionConfidentialPolicyView {
  [key: string]: unknown;
  mode: string;
  allow_shield: boolean | null;
  allow_unshield: boolean | null;
  vk_transfer: string | null;
  vk_unshield: string | null;
  vk_shield: string | null;
  vk_set_hash: string | null;
  poseidon_params_id: number | null;
  pedersen_params_id: number | null;
}

export interface ConfidentialPolicyTransitionView {
  transition_id: string;
  previous_mode: string;
  new_mode: string;
  effective_height: number;
  conversion_window: number | null;
  window_open_height: number | null;
}

export interface ConfidentialAssetPolicyView {
  asset_id: string;
  block_height: number;
  current_mode: string;
  effective_mode: string;
  allow_shield: boolean | null;
  allow_unshield: boolean | null;
  vk_transfer: string | null;
  vk_unshield: string | null;
  vk_shield: string | null;
  vk_set_hash: string | null;
  poseidon_params_id: number | null;
  pedersen_params_id: number | null;
  pending_transition: ConfidentialPolicyTransitionView | null;
}

export interface AccountAssetListItemView {
  asset_id: string;
  quantity: string;
  asset_alias?: string | null;
  asset_name?: string | null;
  asset_definition_id?: string | null;
}

export interface AccountAssetListResponseView {
  items: AccountAssetListItemView[];
  total: number;
}

export interface GovernanceCouncilMemberView {
  account_id: string;
}

export interface GovernanceCouncilCurrentResponseView {
  epoch: number;
  members: GovernanceCouncilMemberView[];
  alternates: GovernanceCouncilMemberView[];
  candidate_count: number;
  verified: number;
  derived_by: "Vrf" | "Fallback";
}

export interface GovernanceCitizenCountResponseView {
  total: number | null;
  endpointAvailable: boolean;
}

export interface GovernanceUnlockStatsResponseView {
  height_current: number;
  expired_locks_now: number;
  referenda_with_expired: number;
  last_sweep_height: number;
}

const toRecord = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
};

const assertExactObjectKeys = (
  record: Record<string, unknown>,
  expectedKeys: readonly string[],
  label: string,
): void => {
  const actual = Object.keys(record).sort();
  const expected = [...expectedKeys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw new Error(`${label} must contain exactly ${expected.join(", ")}.`);
  }
};

const toExactJsonNonNegativeInteger = (value: unknown, label: string) => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative JSON integer.`);
  }
  return value;
};

const toPositiveInteger = (value: unknown, label: string) => {
  if (
    typeof value !== "number" &&
    (typeof value !== "string" || !/^(?:0|[1-9]\d*)$/u.test(value))
  ) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(numberValue) || numberValue < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  return numberValue;
};

const toCanonicalNonNegativeDecimalString = (
  value: unknown,
  label: string,
): string => {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(
        `${label} must be a canonical non-negative decimal integer.`,
      );
    }
    return String(value);
  }
  if (typeof value !== "string" || !/^(?:0|[1-9]\d*)$/u.test(value)) {
    throw new Error(
      `${label} must be a canonical non-negative decimal integer.`,
    );
  }
  return value;
};

const toNullableInteger = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  return toPositiveInteger(value, "numeric field");
};

const toStringValue = (value: unknown, label: string) => {
  const out = String(value ?? "").trim();
  if (!out) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return out;
};

const toMetadataRecord = (value: unknown) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
};

const toArray = (value: unknown, label: string): unknown[] => {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }
  return value;
};

export const normalizeBaseUrl = (url: string) => {
  const trimmed = url.trim().replace(/\/$/, "");
  if (!trimmed.startsWith("http")) {
    throw new Error("Torii URL must include http or https scheme");
  }
  return trimmed;
};

export const stripConfidentialFeeSponsor = (
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined => {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return metadata;
  }
  const next = Object.fromEntries(
    Object.entries(metadata).filter(([key]) => key !== "fee_sponsor"),
  );
  return Object.keys(next).length > 0 ? next : undefined;
};

const BINARY_API_ERROR_CONTENT_TYPES = ["application/x-norito"];
const BINARY_API_ERROR_DETAIL_KEYWORDS =
  /\b(account|faucet|invalid|missing|unsupported|expected|forbidden|bad request|internal server error|too many requests|not found|already|failed|failure|timed out|timeout|unavailable|disabled|denied|required|must|rejected|malformed|unknown|ERR_[A-Z0-9_]+)\b/i;

const readResponseHeader = (
  response: Pick<Response, "headers">,
  name: string,
): string => {
  if (!response.headers || typeof response.headers.get !== "function") {
    return "";
  }
  return response.headers.get(name)?.trim() ?? "";
};

const isBinaryApiErrorContentType = (contentType: string) => {
  const normalized = contentType.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  return BINARY_API_ERROR_CONTENT_TYPES.some((candidate) =>
    normalized.includes(candidate),
  );
};

const isBinaryApiErrorSegmentSeparator = (character: string): boolean => {
  const code = character.charCodeAt(0);
  return (
    character === "\ufffd" ||
    (code >= 0 && code <= 8) ||
    (code >= 14 && code <= 31) ||
    (code >= 127 && code <= 159)
  );
};

const splitBinaryApiErrorSegments = (text: string): string[] => {
  const segments: string[] = [];
  let current = "";
  for (const character of text) {
    if (isBinaryApiErrorSegmentSeparator(character)) {
      if (current) {
        segments.push(current);
        current = "";
      }
      continue;
    }
    current += character;
  }
  if (current) {
    segments.push(current);
  }
  return segments;
};

const extractBinaryApiErrorDetail = (text: string): string => {
  const candidates = splitBinaryApiErrorSegments(text)
    .map((segment) => sanitizeErrorMessage(segment))
    .filter(
      (segment) =>
        segment.length >= 4 && BINARY_API_ERROR_DETAIL_KEYWORDS.test(segment),
    );
  return candidates.sort((left, right) => right.length - left.length)[0] ?? "";
};

const GENERIC_API_ERROR_DETAILS = new Set([
  "faucet puzzle failed",
  "faucet request failed",
  "request failed",
  "forbidden",
  "bad request",
  "internal server error",
  "too many requests",
]);

const normalizeApiErrorDetail = (value: string): string =>
  value.trim().replace(/\.+$/, "").toLowerCase();

const isGenericApiErrorDetail = (value: string): boolean =>
  GENERIC_API_ERROR_DETAILS.has(normalizeApiErrorDetail(value));

const collectApiErrorDetails = (payload: unknown): string[] => {
  if (typeof payload === "string") {
    const detail = payload.trim();
    return detail ? [detail] : [];
  }
  if (typeof payload === "number" || typeof payload === "boolean") {
    return [String(payload)];
  }
  if (Array.isArray(payload)) {
    return payload.flatMap((item) => collectApiErrorDetails(item));
  }
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const record = payload as Record<string, unknown>;
  const priorityKeys = [
    "detail",
    "details",
    "message",
    "error",
    "errors",
    "reason",
    "cause",
  ];
  const details: string[] = [];

  for (const key of priorityKeys) {
    details.push(...collectApiErrorDetails(record[key]));
  }

  for (const [key, value] of Object.entries(record)) {
    if (priorityKeys.includes(key)) {
      continue;
    }
    details.push(...collectApiErrorDetails(value));
  }

  return details;
};

export const extractApiErrorDetail = (payload: unknown): string => {
  const details = collectApiErrorDetails(payload)
    .map((detail) => sanitizeErrorMessage(detail))
    .filter(Boolean);
  return (
    details.find((detail) => !isGenericApiErrorDetail(detail)) ??
    details[0] ??
    ""
  );
};

export const readApiErrorDetail = async (
  response: Pick<Response, "headers" | "text">,
): Promise<string> => {
  const rejectCode = sanitizeErrorMessage(
    readResponseHeader(response, "x-iroha-reject-code"),
  );
  if (rejectCode) {
    return rejectCode;
  }

  const contentType = readResponseHeader(response, "content-type");
  if (isBinaryApiErrorContentType(contentType)) {
    return extractBinaryApiErrorDetail(await response.text().catch(() => ""));
  }

  const text = (await response.text().catch(() => "")).trim();
  if (!text) {
    return "";
  }

  try {
    return sanitizeErrorMessage(
      extractApiErrorDetail(JSON.parse(text)) || text,
    );
  } catch {
    return sanitizeErrorMessage(text);
  }
};

export const formatOnboardingError = (input: {
  status: number;
  statusText: string;
  detail?: string;
}) => {
  const detail = String(input.detail ?? "").trim();
  if (input.status === 403) {
    const guidance =
      "UAID alias registration is disabled on this Torii endpoint. Save the wallet locally instead, or use authority registration if you need the account on-chain.";
    return detail
      ? `Alias registration failed with status ${input.status} (${input.statusText}): ${guidance} Detail: ${detail}`
      : `Alias registration failed with status ${input.status} (${input.statusText}): ${guidance}`;
  }
  return detail
    ? `Alias registration failed with status ${input.status} (${input.statusText}): ${detail}`
    : `Alias registration failed with status ${input.status} (${input.statusText})`;
};

export const normalizeExplorerAccountQrPayload = (
  payload: Record<string, unknown>,
): ExplorerAccountQrResponse => {
  const canonicalId = String(payload.canonicalId ?? payload.canonical_id ?? "");
  const literal = String(payload.literal ?? "");
  const networkPrefix = Number(
    payload.networkPrefix ?? payload.network_prefix ?? 0,
  );
  const errorCorrection = String(
    payload.errorCorrection ?? payload.error_correction ?? "",
  );
  const modules = Number(payload.modules ?? 0);
  const qrVersion = Number(payload.qrVersion ?? payload.qr_version ?? 0);
  const svg = String(payload.svg ?? "");

  if (!canonicalId || !literal || !svg) {
    throw new Error("Explorer QR response was missing required fields.");
  }

  return {
    canonicalId,
    literal,
    networkPrefix,
    errorCorrection,
    modules,
    qrVersion,
    svg,
  };
};

export const assertExplorerAccountQrMatchesRequestedAccount = (
  payload: Record<string, unknown>,
  expectedAccountId: string,
): ExplorerAccountQrResponse => {
  const normalized = normalizeExplorerAccountQrPayload(payload);
  if (normalized.literal !== expectedAccountId) {
    throw new Error(
      "Explorer QR response account did not match the requested account.",
    );
  }
  return normalized;
};

export const normalizeAccountAssetListPayload = (
  payload: unknown,
): AccountAssetListResponseView => {
  const record = toRecord(payload, "account asset list response");
  const items = toArray(record.items, "account asset list response.items").map(
    (value, index) => {
      const entry = toRecord(
        value,
        `account asset list response.items[${index}]`,
      );
      const itemLabel = `account asset list response.items[${index}]`;
      const unsupportedField = [
        "assetId",
        "assetDefinitionId",
        "asset_definition_id",
        "accountId",
        "assetAlias",
        "assetName",
      ].find((field) => Object.prototype.hasOwnProperty.call(entry, field));
      if (unsupportedField) {
        throw new Error(
          `${itemLabel}.${unsupportedField} is outside the first-release account asset contract.`,
        );
      }

      const readRequiredString = (field: string) => {
        const fieldValue = entry[field];
        if (typeof fieldValue !== "string" || !fieldValue.trim()) {
          throw new Error(`${itemLabel}.${field} must be a non-empty string.`);
        }
        return fieldValue.trim();
      };
      const readOptionalString = (field: string) => {
        const fieldValue = entry[field];
        if (fieldValue === null || fieldValue === undefined) {
          return "";
        }
        if (typeof fieldValue !== "string") {
          throw new Error(`${itemLabel}.${field} must be a string or null.`);
        }
        return fieldValue.trim();
      };

      const hasLegacyAssetId = Object.prototype.hasOwnProperty.call(
        entry,
        "asset_id",
      );
      const hasSplitAsset = Object.prototype.hasOwnProperty.call(
        entry,
        "asset",
      );
      const hasSplitAccountId = Object.prototype.hasOwnProperty.call(
        entry,
        "account_id",
      );
      if (
        (hasLegacyAssetId && (hasSplitAsset || hasSplitAccountId)) ||
        (!hasLegacyAssetId && (!hasSplitAsset || !hasSplitAccountId))
      ) {
        throw new Error(
          `${itemLabel} must use exactly one first-release shape: { asset_id, quantity } or { asset, account_id, quantity }.`,
        );
      }

      const assetDefinitionId = hasLegacyAssetId
        ? ""
        : readRequiredString("asset");
      const accountId = hasLegacyAssetId
        ? ""
        : readRequiredString("account_id");
      const assetId = hasLegacyAssetId
        ? readRequiredString("asset_id")
        : `${assetDefinitionId}#${accountId}`;
      const assetAlias = readOptionalString("asset_alias").replace(/^@/, "");
      const assetName = readOptionalString("asset_name");
      return {
        asset_id: assetId,
        quantity: readRequiredString("quantity"),
        ...(assetAlias ? { asset_alias: assetAlias } : {}),
        ...(assetName ? { asset_name: assetName } : {}),
        ...(assetDefinitionId
          ? { asset_definition_id: assetDefinitionId }
          : {}),
      };
    },
  );
  return {
    items,
    total: toPositiveInteger(record.total, "account asset list response.total"),
  };
};

const normalizeGovernanceCouncilMember = (
  value: unknown,
  label: string,
): GovernanceCouncilMemberView => {
  const record = toRecord(value, label);
  assertExactObjectKeys(record, ["account_id"], label);
  if (
    typeof record.account_id !== "string" ||
    record.account_id.length === 0 ||
    record.account_id.trim() !== record.account_id
  ) {
    throw new Error(`${label}.account_id must be canonical non-empty text.`);
  }
  return {
    account_id: record.account_id,
  };
};

const normalizeGovernanceCouncilMembers = (
  value: unknown,
  label: string,
): GovernanceCouncilMemberView[] =>
  toArray(value, label).map((entry, index) =>
    normalizeGovernanceCouncilMember(entry, `${label}[${index}]`),
  );

export const normalizeGovernanceCouncilCurrentPayload = (
  payload: unknown,
): GovernanceCouncilCurrentResponseView => {
  const record = toRecord(payload, "governance council current response");
  assertExactObjectKeys(
    record,
    [
      "alternates",
      "candidate_count",
      "derived_by",
      "epoch",
      "members",
      "verified",
    ],
    "governance council current response",
  );
  if (record.derived_by !== "Vrf" && record.derived_by !== "Fallback") {
    throw new Error(
      "governance council current response.derived_by must be Vrf or Fallback.",
    );
  }
  const members = normalizeGovernanceCouncilMembers(
    record.members,
    "governance council current response.members",
  );
  const alternates = normalizeGovernanceCouncilMembers(
    record.alternates,
    "governance council current response.alternates",
  );
  const candidateCount = toExactJsonNonNegativeInteger(
    record.candidate_count,
    "governance council current response.candidate_count",
  );
  const verified = toExactJsonNonNegativeInteger(
    record.verified,
    "governance council current response.verified",
  );
  const accounts = [
    ...members.map(({ account_id }) => account_id),
    ...alternates.map(({ account_id }) => account_id),
  ];
  if (new Set(accounts).size !== accounts.length) {
    throw new Error(
      "governance council members and alternates must be unique and disjoint.",
    );
  }
  if (accounts.length > candidateCount || verified > candidateCount) {
    throw new Error(
      "governance council seats and verified proofs must not exceed candidate_count.",
    );
  }
  if (
    (record.derived_by === "Vrf" && verified === 0) ||
    (record.derived_by === "Fallback" && verified !== 0)
  ) {
    throw new Error(
      "governance council derived_by must agree with the verified proof count.",
    );
  }
  return {
    epoch: toExactJsonNonNegativeInteger(
      record.epoch,
      "governance council current response.epoch",
    ),
    members,
    alternates,
    candidate_count: candidateCount,
    verified,
    derived_by: record.derived_by,
  };
};

export const normalizeGovernanceCitizenCountPayload = (
  payload: unknown,
  endpointAvailable = true,
): GovernanceCitizenCountResponseView => {
  if (!endpointAvailable) {
    if (payload !== null) {
      throw new Error(
        "unavailable governance citizen count must not carry a payload.",
      );
    }
    return {
      total: null,
      endpointAvailable: false,
    };
  }
  const record = toRecord(payload, "governance citizen count response");
  assertExactObjectKeys(record, ["total"], "governance citizen count response");
  if (
    typeof record.total !== "string" ||
    !/^(?:0|[1-9]\d*)$/u.test(record.total)
  ) {
    throw new Error(
      "governance citizen count response.total must be a canonical decimal string.",
    );
  }
  const total = Number(record.total);
  if (!Number.isSafeInteger(total)) {
    throw new Error(
      "governance citizen count response.total exceeds the safe integer range.",
    );
  }
  return {
    total,
    endpointAvailable: true,
  };
};

export const normalizeGovernanceUnlockStatsPayload = (
  payload: unknown,
): GovernanceUnlockStatsResponseView => {
  const record = toRecord(payload, "governance unlock stats response");
  assertExactObjectKeys(
    record,
    [
      "expired_locks_now",
      "height_current",
      "last_sweep_height",
      "referenda_with_expired",
    ],
    "governance unlock stats response",
  );
  return {
    height_current: toExactJsonNonNegativeInteger(
      record.height_current,
      "governance unlock stats response.height_current",
    ),
    expired_locks_now: toExactJsonNonNegativeInteger(
      record.expired_locks_now,
      "governance unlock stats response.expired_locks_now",
    ),
    referenda_with_expired: toExactJsonNonNegativeInteger(
      record.referenda_with_expired,
      "governance unlock stats response.referenda_with_expired",
    ),
    last_sweep_height: toExactJsonNonNegativeInteger(
      record.last_sweep_height,
      "governance unlock stats response.last_sweep_height",
    ),
  };
};

export const normalizePublicLaneValidatorsPayload = (
  payload: Record<string, unknown>,
): PublicLaneValidatorsResponseView => {
  if ("laneId" in payload) {
    throw new Error("validators.laneId is not part of the current contract.");
  }
  const laneId = toPositiveInteger(payload.lane_id, "validators.lane_id");
  const total = toPositiveInteger(payload.total, "validators.total");
  const rawItems = toArray(payload.items, "validators.items");

  const items: PublicLaneValidatorRecordView[] = rawItems.map(
    (raw, index): PublicLaneValidatorRecordView => {
      const item = toRecord(raw, `validators.items[${index}]`);
      if (
        [
          "laneId",
          "peerId",
          "stakeAccount",
          "totalStake",
          "selfStake",
          "activationEpoch",
          "activationHeight",
          "lastRewardEpoch",
        ].some((key) => key in item)
      ) {
        throw new Error(
          `validators.items[${index}] contains fields outside the current contract.`,
        );
      }
      const statusRecord = toRecord(
        item.status ?? {},
        `validators.items[${index}].status`,
      );
      if (
        ["activatesAtEpoch", "releasesAtMs"].some((key) => key in statusRecord)
      ) {
        throw new Error(
          `validators.items[${index}].status contains fields outside the current contract.`,
        );
      }
      return {
        lane_id: toPositiveInteger(
          item.lane_id ?? laneId,
          `validators.items[${index}].lane_id`,
        ),
        validator: toStringValue(
          item.validator,
          `validators.items[${index}].validator`,
        ),
        peer_id: toStringValue(
          item.peer_id ?? "",
          `validators.items[${index}].peer_id`,
        ),
        stake_account: toStringValue(
          item.stake_account,
          `validators.items[${index}].stake_account`,
        ),
        total_stake: toStringValue(
          item.total_stake,
          `validators.items[${index}].total_stake`,
        ),
        self_stake: toStringValue(
          item.self_stake,
          `validators.items[${index}].self_stake`,
        ),
        status: {
          type: toStringValue(
            statusRecord.type,
            `validators.items[${index}].status.type`,
          ),
          activates_at_epoch: toNullableInteger(
            statusRecord.activates_at_epoch,
          ),
          reason:
            statusRecord.reason === null || statusRecord.reason === undefined
              ? null
              : String(statusRecord.reason),
          releases_at_ms: toNullableInteger(statusRecord.releases_at_ms),
          slash_id:
            statusRecord.slash_id === null ||
            statusRecord.slash_id === undefined
              ? null
              : String(statusRecord.slash_id),
        },
        activation_epoch: toNullableInteger(item.activation_epoch),
        activation_height: toNullableInteger(item.activation_height),
        last_reward_epoch: toNullableInteger(item.last_reward_epoch),
        metadata: toMetadataRecord(item.metadata),
      };
    },
  );

  return {
    lane_id: laneId,
    total,
    items,
  };
};

export const normalizePublicLaneStakePayload = (
  payload: Record<string, unknown>,
): PublicLaneStakeResponseView => {
  if ("laneId" in payload) {
    throw new Error("stake.laneId is not part of the current contract.");
  }
  const laneId = toPositiveInteger(payload.lane_id, "stake.lane_id");
  const total = toPositiveInteger(payload.total, "stake.total");
  const rawItems = toArray(payload.items, "stake.items");

  const items: PublicLaneStakeShareView[] = rawItems.map((raw, index) => {
    const item = toRecord(raw, `stake.items[${index}]`);
    if ("laneId" in item || "pendingUnbonds" in item) {
      throw new Error(
        `stake.items[${index}] contains fields outside the current contract.`,
      );
    }
    const rawUnbonds = toArray(
      item.pending_unbonds ?? [],
      `stake.items[${index}].pending_unbonds`,
    );
    const pending_unbonds: PublicLaneUnbondingView[] = rawUnbonds.map(
      (unbondRaw, unbondIndex) => {
        const unbond = toRecord(
          unbondRaw,
          `stake.items[${index}].pending_unbonds[${unbondIndex}]`,
        );
        if ("requestId" in unbond || "releaseAtMs" in unbond) {
          throw new Error(
            `stake.items[${index}].pending_unbonds[${unbondIndex}] contains fields outside the current contract.`,
          );
        }
        return {
          request_id: toStringValue(
            unbond.request_id,
            `stake.items[${index}].pending_unbonds[${unbondIndex}].request_id`,
          ),
          amount: toStringValue(
            unbond.amount,
            `stake.items[${index}].pending_unbonds[${unbondIndex}].amount`,
          ),
          release_at_ms: toPositiveInteger(
            unbond.release_at_ms,
            `stake.items[${index}].pending_unbonds[${unbondIndex}].release_at_ms`,
          ),
        };
      },
    );

    return {
      lane_id: toPositiveInteger(
        item.lane_id ?? laneId,
        `stake.items[${index}].lane_id`,
      ),
      validator: toStringValue(
        item.validator,
        `stake.items[${index}].validator`,
      ),
      staker: toStringValue(item.staker, `stake.items[${index}].staker`),
      bonded: toStringValue(item.bonded, `stake.items[${index}].bonded`),
      metadata: toMetadataRecord(item.metadata),
      pending_unbonds,
    };
  });

  return {
    lane_id: laneId,
    total,
    items,
  };
};

export const normalizePublicLaneRewardsPayload = (
  payload: Record<string, unknown>,
): PublicLaneRewardsResponseView => {
  if ("laneId" in payload) {
    throw new Error("rewards.laneId is not part of the current contract.");
  }
  const laneId = toPositiveInteger(payload.lane_id, "rewards.lane_id");
  const total = toPositiveInteger(payload.total, "rewards.total");
  const rawItems = toArray(payload.items, "rewards.items");

  const items: PublicLanePendingRewardView[] = rawItems.map((raw, index) => {
    const item = toRecord(raw, `rewards.items[${index}]`);
    if (
      ["laneId", "lastClaimedEpoch", "pendingThroughEpoch"].some(
        (key) => key in item,
      )
    ) {
      throw new Error(
        `rewards.items[${index}] contains fields outside the current contract.`,
      );
    }
    return {
      lane_id: toPositiveInteger(
        item.lane_id ?? laneId,
        `rewards.items[${index}].lane_id`,
      ),
      account: toStringValue(item.account, `rewards.items[${index}].account`),
      asset: toStringValue(item.asset, `rewards.items[${index}].asset`),
      last_claimed_epoch: toPositiveInteger(
        item.last_claimed_epoch,
        `rewards.items[${index}].last_claimed_epoch`,
      ),
      pending_through_epoch: toPositiveInteger(
        item.pending_through_epoch,
        `rewards.items[${index}].pending_through_epoch`,
      ),
      amount: toStringValue(item.amount, `rewards.items[${index}].amount`),
    };
  });

  return {
    lane_id: laneId,
    total,
    items,
  };
};

export const normalizeNexusLifecyclePayload = (
  payload: Record<string, unknown>,
): NexusLifecycleView => {
  const rawLanes = toArray(payload.lanes, "nexus lifecycle.lanes");
  const lanes = rawLanes.map((rawLane, index): NexusLifecycleLaneView => {
    const lane = toRecord(rawLane, `nexus lifecycle.lanes[${index}]`);
    return {
      id: toPositiveInteger(lane.id, `nexus lifecycle.lanes[${index}].id`),
      dataspace_id: toCanonicalNonNegativeDecimalString(
        lane.dataspace_id,
        `nexus lifecycle.lanes[${index}].dataspace_id`,
      ),
      alias: toStringValue(lane.alias, `nexus lifecycle.lanes[${index}].alias`),
      description: String(lane.description ?? "").trim(),
      visibility: toStringValue(
        lane.visibility,
        `nexus lifecycle.lanes[${index}].visibility`,
      ),
      governance:
        lane.governance === null || lane.governance === undefined
          ? null
          : String(lane.governance).trim() || null,
      storage: toStringValue(
        lane.storage,
        `nexus lifecycle.lanes[${index}].storage`,
      ),
      proof_scheme: toStringValue(
        lane.proof_scheme,
        `nexus lifecycle.lanes[${index}].proof_scheme`,
      ),
      metadata: toMetadataRecord(lane.metadata),
    };
  });
  const laneCount = toPositiveInteger(
    payload.lane_count,
    "nexus lifecycle.lane_count",
  );
  if (laneCount !== lanes.length) {
    throw new Error(
      "nexus lifecycle.lane_count must match nexus lifecycle.lanes.",
    );
  }
  if (typeof payload.nexus_enabled !== "boolean") {
    throw new Error("nexus lifecycle.nexus_enabled must be a boolean.");
  }
  return {
    version: toPositiveInteger(payload.version, "nexus lifecycle.version"),
    nexus_enabled: payload.nexus_enabled,
    lane_count: laneCount,
    lanes,
  };
};

type JsonParseSourceContext = {
  source?: string;
};

type JsonParseWithSource = (
  text: string,
  reviver: (
    this: unknown,
    key: string,
    value: unknown,
    context?: JsonParseSourceContext,
  ) => unknown,
) => unknown;

export const parseNexusLifecycleJson = (text: string): NexusLifecycleView => {
  const payload = (JSON.parse as JsonParseWithSource)(
    text,
    (key, value, context) => {
      if (key !== "dataspace_id" || typeof value !== "number") {
        return value;
      }
      // JSON.parse has already rounded an unsafe integer by the time the
      // reviver receives `value`. Modern Electron/Node supplies the original
      // numeric token as context.source, so retain that exact decimal lexeme.
      // On an older runtime, leaving `value` intact makes normalization reject
      // unsafe numbers instead of silently selecting the wrong dataspace.
      return context?.source ?? value;
    },
  );
  return normalizeNexusLifecyclePayload(toRecord(payload, "nexus lifecycle"));
};

export const normalizeOfflineReadinessPayload = (
  payload: Record<string, unknown>,
  expectedAssetDefinitionId?: string,
): OfflineReadinessView => {
  assertExactObjectKeys(
    payload,
    [
      "required_bridge_abi_version",
      "cash_handoff_capability",
      "max_hops",
      "asset_definition_id",
      "asset_scale",
      "evaluated_block_height",
      "evaluated_block_hash",
      "active_transfer_verifier",
      "active_topup_shield_verifier",
      "active_unshield_verifier",
      "active_recursive_step_eq_verifier",
      "active_recursive_step_ep_verifier",
      "artifact_set",
      "proof_backend_available",
      "recursive_lineage_supported",
      "ready",
      "blockers",
    ],
    "offline readiness",
  );
  if (payload.required_bridge_abi_version !== 21) {
    throw new Error(
      "offline readiness.required_bridge_abi_version must be exactly 21.",
    );
  }
  if (payload.cash_handoff_capability !== "cash_handoff_v1") {
    throw new Error(
      'offline readiness.cash_handoff_capability must be exactly "cash_handoff_v1".',
    );
  }
  if (payload.max_hops !== 8) {
    throw new Error("offline readiness.max_hops must be exactly 8.");
  }
  if (typeof payload.asset_definition_id !== "string") {
    throw new Error("offline readiness.asset_definition_id must be a string.");
  }
  const assetDefinitionId = normalizeFirstReleaseAssetDefinitionId(
    payload.asset_definition_id,
    "offline readiness.asset_definition_id",
  );
  if (assetDefinitionId !== payload.asset_definition_id) {
    throw new Error(
      "offline readiness.asset_definition_id must be an exact first-release asset definition literal.",
    );
  }
  const assetScale =
    payload.asset_scale === null
      ? null
      : toExactJsonNonNegativeInteger(
          payload.asset_scale,
          "offline readiness.asset_scale",
        );
  if (assetScale !== null && assetScale > 0xffff_ffff) {
    throw new Error("offline readiness.asset_scale must be a uint32 or null.");
  }
  const evaluatedBlockHeight = toExactJsonNonNegativeInteger(
    payload.evaluated_block_height,
    "offline readiness.evaluated_block_height",
  );
  if (
    typeof payload.evaluated_block_hash !== "string" ||
    !/^[0-9a-f]{64}$/u.test(payload.evaluated_block_hash)
  ) {
    throw new Error(
      "offline readiness.evaluated_block_hash must be a lowercase 32-byte hash.",
    );
  }
  const nullableRecord = (
    value: unknown,
    label: string,
  ): Record<string, unknown> | null => {
    if (value === null) return null;
    return toRecord(value, label);
  };
  const rawBlockers = toArray(payload.blockers, "offline readiness.blockers");
  const blockers = rawBlockers.map(
    (rawBlocker, index): OfflineReadinessBlockerView => {
      const blocker = toRecord(
        rawBlocker,
        `offline readiness.blockers[${index}]`,
      );
      assertExactObjectKeys(
        blocker,
        ["code", "message"],
        `offline readiness.blockers[${index}]`,
      );
      if (
        typeof blocker.code !== "string" ||
        !/^[a-z0-9][a-z0-9_]{0,63}$/u.test(blocker.code)
      ) {
        throw new Error(
          `offline readiness.blockers[${index}].code is malformed.`,
        );
      }
      if (
        typeof blocker.message !== "string" ||
        !blocker.message.trim() ||
        blocker.message !== blocker.message.trim()
      ) {
        throw new Error(
          `offline readiness.blockers[${index}].message must be a non-empty trimmed string.`,
        );
      }
      return {
        code: blocker.code,
        message: blocker.message,
      };
    },
  );
  if (
    typeof payload.proof_backend_available !== "boolean" ||
    typeof payload.recursive_lineage_supported !== "boolean" ||
    typeof payload.ready !== "boolean"
  ) {
    throw new Error(
      "offline readiness capability fields must be boolean values.",
    );
  }
  const normalized: OfflineReadinessView = {
    required_bridge_abi_version: payload.required_bridge_abi_version,
    cash_handoff_capability: payload.cash_handoff_capability,
    max_hops: 8,
    asset_definition_id: assetDefinitionId,
    asset_scale: assetScale,
    evaluated_block_height: evaluatedBlockHeight,
    evaluated_block_hash: payload.evaluated_block_hash,
    active_transfer_verifier: nullableRecord(
      payload.active_transfer_verifier,
      "offline readiness.active_transfer_verifier",
    ),
    active_topup_shield_verifier: nullableRecord(
      payload.active_topup_shield_verifier,
      "offline readiness.active_topup_shield_verifier",
    ),
    active_unshield_verifier: nullableRecord(
      payload.active_unshield_verifier,
      "offline readiness.active_unshield_verifier",
    ),
    active_recursive_step_eq_verifier: nullableRecord(
      payload.active_recursive_step_eq_verifier,
      "offline readiness.active_recursive_step_eq_verifier",
    ),
    active_recursive_step_ep_verifier: nullableRecord(
      payload.active_recursive_step_ep_verifier,
      "offline readiness.active_recursive_step_ep_verifier",
    ),
    artifact_set: nullableRecord(
      payload.artifact_set,
      "offline readiness.artifact_set",
    ),
    proof_backend_available: payload.proof_backend_available,
    recursive_lineage_supported: payload.recursive_lineage_supported,
    ready: payload.ready,
    blockers,
  };
  if (
    expectedAssetDefinitionId !== undefined &&
    normalized.asset_definition_id !== expectedAssetDefinitionId
  ) {
    throw new Error(
      "offline readiness.asset_definition_id must match the requested asset definition.",
    );
  }
  if (normalized.ready !== (normalized.blockers.length === 0)) {
    throw new Error(
      "offline readiness.ready must be true exactly when blockers is empty.",
    );
  }
  if (
    normalized.ready &&
    (normalized.asset_scale === null || normalized.asset_scale > 28)
  ) {
    throw new Error(
      "A ready offline response must include a supported asset scale.",
    );
  }
  return normalized;
};

export const normalizeAssetDefinitionConfidentialPolicy = (
  assetDefinition: Record<string, unknown>,
): AssetDefinitionConfidentialPolicyView | null => {
  if (
    assetDefinition.confidential_policy === null ||
    assetDefinition.confidential_policy === undefined
  ) {
    return null;
  }
  const policy = toRecord(
    assetDefinition.confidential_policy,
    "asset definition.confidential_policy",
  );
  const nullableBoolean = (value: unknown, label: string): boolean | null => {
    if (value === null || value === undefined) return null;
    if (typeof value !== "boolean") {
      throw new Error(`${label} must be a boolean or null.`);
    }
    return value;
  };
  const nullableString = (value: unknown): string | null => {
    if (value === null || value === undefined) return null;
    return String(value).trim() || null;
  };
  return {
    mode: toStringValue(
      policy.mode,
      "asset definition.confidential_policy.mode",
    ),
    allow_shield: nullableBoolean(
      policy.allow_shield,
      "asset definition.confidential_policy.allow_shield",
    ),
    allow_unshield: nullableBoolean(
      policy.allow_unshield,
      "asset definition.confidential_policy.allow_unshield",
    ),
    vk_transfer: nullableString(policy.vk_transfer),
    vk_unshield: nullableString(policy.vk_unshield),
    vk_shield: nullableString(policy.vk_shield),
    vk_set_hash: nullableString(policy.vk_set_hash),
    poseidon_params_id: toNullableInteger(policy.poseidon_params_id),
    pedersen_params_id: toNullableInteger(policy.pedersen_params_id),
  };
};

export const normalizeConfidentialAssetPolicyPayload = (
  payload: Record<string, unknown>,
): ConfidentialAssetPolicyView => {
  const legacyFields = [
    "assetId",
    "blockHeight",
    "currentMode",
    "effectiveMode",
    "allowShield",
    "allowUnshield",
    "vkTransfer",
    "vkUnshield",
    "vkShield",
    "vkSetHash",
    "poseidonParamsId",
    "pedersenParamsId",
    "pendingTransition",
  ];
  if (legacyFields.some((field) => field in payload)) {
    throw new Error(
      "Confidential asset policy contains fields outside the first-release contract.",
    );
  }
  const asset_id = toStringValue(payload.asset_id, "confidential.asset_id");
  const block_height = toPositiveInteger(
    payload.block_height,
    "confidential.block_height",
  );
  const current_mode = toStringValue(
    payload.current_mode,
    "confidential.current_mode",
  );
  const effective_mode = toStringValue(
    payload.effective_mode,
    "confidential.effective_mode",
  );

  const pendingTransitionRaw = payload.pending_transition;
  let pending_transition: ConfidentialPolicyTransitionView | null = null;
  if (pendingTransitionRaw !== null && pendingTransitionRaw !== undefined) {
    const pending = toRecord(
      pendingTransitionRaw,
      "confidential.pending_transition",
    );
    const legacyPendingFields = [
      "transitionId",
      "previousMode",
      "newMode",
      "effectiveHeight",
      "conversionWindow",
      "windowOpenHeight",
    ];
    if (legacyPendingFields.some((field) => field in pending)) {
      throw new Error(
        "Confidential pending transition contains fields outside the first-release contract.",
      );
    }
    pending_transition = {
      transition_id: toStringValue(
        pending.transition_id,
        "confidential.pending_transition.transition_id",
      ),
      previous_mode: toStringValue(
        pending.previous_mode,
        "confidential.pending_transition.previous_mode",
      ),
      new_mode: toStringValue(
        pending.new_mode,
        "confidential.pending_transition.new_mode",
      ),
      effective_height: toPositiveInteger(
        pending.effective_height,
        "confidential.pending_transition.effective_height",
      ),
      conversion_window: toNullableInteger(pending.conversion_window),
      window_open_height: toNullableInteger(pending.window_open_height),
    };
  }

  const vkSetHashRaw = payload.vk_set_hash;
  const vk_set_hash =
    vkSetHashRaw === undefined ||
    vkSetHashRaw === null ||
    String(vkSetHashRaw).trim().length === 0
      ? null
      : String(vkSetHashRaw);

  const readNullableBoolean = (
    value: unknown,
    label: string,
  ): boolean | null => {
    if (value === undefined || value === null) {
      return null;
    }
    if (typeof value === "boolean") {
      return value;
    }
    throw new Error(`${label} must be a boolean or null.`);
  };

  const readNullableString = (value: unknown) => {
    const normalized = String(value ?? "").trim();
    return normalized ? normalized : null;
  };

  return {
    asset_id,
    block_height,
    current_mode,
    effective_mode,
    allow_shield: readNullableBoolean(
      payload.allow_shield,
      "confidential.allow_shield",
    ),
    allow_unshield: readNullableBoolean(
      payload.allow_unshield,
      "confidential.allow_unshield",
    ),
    vk_transfer: readNullableString(payload.vk_transfer),
    vk_unshield: readNullableString(payload.vk_unshield),
    vk_shield: readNullableString(payload.vk_shield),
    vk_set_hash,
    poseidon_params_id: toNullableInteger(payload.poseidon_params_id),
    pedersen_params_id: toNullableInteger(payload.pedersen_params_id),
    pending_transition,
  };
};

export const readNexusUnbondingDelayMs = (
  payload: Record<string, unknown>,
): number => {
  const root = toRecord(payload, "configuration");
  const nexus = toRecord(root.nexus ?? {}, "configuration.nexus");
  const staking = toRecord(nexus.staking ?? {}, "configuration.nexus.staking");
  return toPositiveInteger(
    staking.unbonding_delay_ms,
    "configuration.nexus.staking.unbonding_delay_ms",
  );
};

export const sanitizeFetchHeaders = (
  headers: unknown,
): HeadersInit | undefined => {
  if (!headers) return undefined;

  if (typeof Headers !== "undefined" && headers instanceof Headers) {
    return Array.from(headers.entries());
  }

  if (Array.isArray(headers)) {
    return headers
      .filter(
        (entry): entry is [unknown, unknown] =>
          Array.isArray(entry) && entry.length >= 2,
      )
      .map<[string, string]>(([key, value]) => [String(key), String(value)]);
  }

  if (typeof headers === "object") {
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(
      headers as Record<string, unknown>,
    )) {
      if (value === undefined || value === null) continue;
      normalized[key] = String(value);
    }
    return normalized;
  }

  return undefined;
};

export const sanitizeFetchInit = (
  init?: Parameters<typeof fetch>[1],
): Parameters<typeof fetch>[1] | undefined => {
  if (!init) return init;
  const headers = sanitizeFetchHeaders((init as { headers?: unknown }).headers);
  if (!headers) return init;
  return {
    ...init,
    headers,
  };
};

import type { ToriiClient } from "@iroha/iroha-js";
import {
  readConfidentialPolicyMode,
  type ConfidentialPolicyMode,
} from "../src/utils/confidential";
import { sanitizeErrorMessage } from "../src/utils/errorMessage";
import {
  ENDPOINT_URL_MAX_CHARACTERS,
  isLoopbackEndpointUrl,
} from "../src/utils/endpoint";
import { normalizeCanonicalAccountIdLiteral } from "./accountAddress";
import { normalizeFirstReleaseAssetDefinitionId } from "./assetDefinitionId";
import { readBoundedResponseBytes } from "./boundedJsonResponse";
import { parseStrictJson } from "./secureBoundedJson";

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

export interface AssetDefinitionConfidentialPolicyView {
  [key: string]: unknown;
  mode: ConfidentialPolicyMode;
  allow_shield: boolean;
  allow_unshield: boolean;
  vk_transfer: string | null;
  vk_unshield: string | null;
  vk_shield: string | null;
  vk_set_hash: string | null;
  poseidon_params_id: number | null;
  pedersen_params_id: number | null;
  pending_transition: ConfidentialPolicyTransitionView | null;
}

export interface ConfidentialPolicyTransitionView {
  transition_id: string;
  previous_mode: ConfidentialPolicyMode;
  new_mode: ConfidentialPolicyMode;
  effective_height: number;
  conversion_window: number | null;
  window_open_height: number | null;
}

export interface ConfidentialAssetPolicyView {
  asset_id: string;
  block_height: number;
  current_mode: ConfidentialPolicyMode;
  effective_mode: ConfidentialPolicyMode;
  allow_shield: boolean;
  allow_unshield: boolean;
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
  scope: string;
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
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative JSON integer.`);
  }
  return value;
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
  if (value === null) return null;
  return toPositiveInteger(value, "numeric field");
};

const toStringValue = (value: unknown, label: string) => {
  if (
    typeof value !== "string" ||
    !value ||
    value.trim() !== value ||
    Array.from(value).some((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code < 0x20 || code === 0x7f;
    })
  ) {
    throw new Error(`${label} must be canonical non-empty text.`);
  }
  return value;
};

const toMetadataRecord = (value: unknown, label: string) =>
  toRecord(value, label);

const toCanonicalQuantity = (value: unknown, label: string): string => {
  const quantity = toStringValue(value, label);
  if (!/^(?:0|[1-9]\d*)(?:\.\d*[1-9])?$/u.test(quantity)) {
    throw new Error(`${label} must be a canonical non-negative quantity.`);
  }
  return quantity;
};

const toArray = (value: unknown, label: string): unknown[] => {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }
  return value;
};

export const normalizeBaseUrl = (url: string) => {
  if (
    typeof url !== "string" ||
    !url ||
    url.length > ENDPOINT_URL_MAX_CHARACTERS ||
    url.trim() !== url
  ) {
    throw new Error("Torii URL must be canonical non-empty text.");
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Torii URL must be a valid absolute URL.");
  }
  if (
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(
      "Torii URL must use HTTP(S) without credentials, a query, or a fragment.",
    );
  }
  if (parsed.protocol === "http:" && !isLoopbackEndpointUrl(parsed)) {
    throw new Error("Remote Torii URLs must use HTTPS.");
  }
  return parsed.toString().replace(/\/+$/u, "");
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
const MAX_API_ERROR_RESPONSE_BYTES = 64 * 1024;
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
  response: Pick<Response, "arrayBuffer" | "headers">,
): Promise<string> => {
  const rejectCode = sanitizeErrorMessage(
    readResponseHeader(response, "x-iroha-reject-code"),
  );
  if (rejectCode) {
    return rejectCode;
  }

  const contentType = readResponseHeader(response, "content-type");
  let bytes: Buffer;
  try {
    bytes = await readBoundedResponseBytes(response, {
      label: "Torii error response",
      maximumBytes: MAX_API_ERROR_RESPONSE_BYTES,
      allowEmpty: true,
    });
  } catch {
    return "";
  }
  if (bytes.length === 0) {
    return "";
  }
  const text = new TextDecoder("utf-8").decode(bytes).trim();
  if (isBinaryApiErrorContentType(contentType)) {
    return extractBinaryApiErrorDetail(text);
  }

  if (!text) {
    return "";
  }

  try {
    return sanitizeErrorMessage(
      extractApiErrorDetail(parseStrictJson(text, "Torii error response")) ||
        text,
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
  assertExactObjectKeys(
    payload,
    [
      "canonicalId",
      "literal",
      "networkPrefix",
      "errorCorrection",
      "modules",
      "qrVersion",
      "svg",
    ],
    "Explorer QR response",
  );
  const canonicalId = toStringValue(
    payload.canonicalId,
    "Explorer QR response.canonicalId",
  );
  const literal = toStringValue(
    payload.literal,
    "Explorer QR response.literal",
  );
  const networkPrefix = toExactJsonNonNegativeInteger(
    payload.networkPrefix,
    "Explorer QR response.networkPrefix",
  );
  if (networkPrefix < 1 || networkPrefix > 0x3fff) {
    throw new Error(
      "Explorer QR response.networkPrefix must be between 1 and 16383.",
    );
  }
  if (payload.errorCorrection !== "M") {
    throw new Error("Explorer QR response.errorCorrection must be exactly M.");
  }
  if (payload.modules !== 192) {
    throw new Error("Explorer QR response.modules must be exactly 192.");
  }
  const qrVersion = toExactJsonNonNegativeInteger(
    payload.qrVersion,
    "Explorer QR response.qrVersion",
  );
  if (qrVersion < 1 || qrVersion > 40) {
    throw new Error("Explorer QR response.qrVersion must be between 1 and 40.");
  }
  const svg = toStringValue(payload.svg, "Explorer QR response.svg");
  if (!svg.startsWith("<svg") || svg.length > 1024 * 1024) {
    throw new Error("Explorer QR response.svg must be a bounded SVG document.");
  }

  return {
    canonicalId,
    literal,
    networkPrefix,
    errorCorrection: "M",
    modules: 192,
    qrVersion,
    svg,
  };
};

export const assertExplorerAccountQrMatchesRequestedAccount = (
  payload: Record<string, unknown>,
  expectedAccountId: string,
): ExplorerAccountQrResponse => {
  const normalized = normalizeExplorerAccountQrPayload(payload);
  if (
    normalized.literal !== expectedAccountId ||
    normalized.canonicalId !== expectedAccountId
  ) {
    throw new Error(
      "Explorer QR response account did not match the requested account.",
    );
  }
  return normalized;
};

export const normalizeAccountAssetListPayload = (
  payload: unknown,
  context: Readonly<{
    expectedAccountId: string;
    expectedAssetDefinitionId?: string;
    networkPrefix: number;
    maximumItems: number;
  }>,
): AccountAssetListResponseView => {
  const expectedAccountId = normalizeCanonicalAccountIdLiteral(
    context.expectedAccountId,
    "expectedAccountId",
    context.networkPrefix,
  );
  if (!Number.isSafeInteger(context.maximumItems) || context.maximumItems < 0) {
    throw new Error("account asset list maximumItems must be non-negative.");
  }
  const expectedAssetDefinitionId =
    context.expectedAssetDefinitionId === undefined
      ? undefined
      : normalizeFirstReleaseAssetDefinitionId(
          context.expectedAssetDefinitionId,
          "expectedAssetDefinitionId",
        );
  const record = toRecord(payload, "account asset list response");
  assertExactObjectKeys(
    record,
    ["items", "total", "has_more", "count_mode"],
    "account asset list response",
  );
  if (typeof record.has_more !== "boolean") {
    throw new Error("account asset list response.has_more must be a boolean.");
  }
  if (record.count_mode !== "exact") {
    throw new Error('account asset list response.count_mode must be "exact".');
  }
  const rawItems = toArray(record.items, "account asset list response.items");
  if (rawItems.length > context.maximumItems) {
    throw new Error(
      "account asset list response.items exceeds the requested item limit.",
    );
  }
  const holdingKeys = new Set<string>();
  const items = rawItems.map((value, index) => {
    const entry = toRecord(
      value,
      `account asset list response.items[${index}]`,
    );
    const itemLabel = `account asset list response.items[${index}]`;
    assertExactObjectKeys(
      entry,
      [
        "account_id",
        "asset",
        "asset_alias",
        "asset_name",
        "scope",
        "quantity",
        "primary_alias",
        "primary_alias_name",
        "primary_alias_dataspace",
        "primary_alias_domain",
        "has_primary_alias",
      ],
      itemLabel,
    );
    if (
      entry.primary_alias !== null ||
      entry.primary_alias_name !== null ||
      entry.primary_alias_dataspace !== null ||
      entry.primary_alias_domain !== null ||
      entry.has_primary_alias !== false
    ) {
      throw new Error(
        `${itemLabel} contains unsupported primary alias projection data.`,
      );
    }

    const readRequiredString = (field: string) => {
      const fieldValue = entry[field];
      if (
        typeof fieldValue !== "string" ||
        !fieldValue ||
        fieldValue.trim() !== fieldValue ||
        Array.from(fieldValue).some((character) => character < " ")
      ) {
        throw new Error(`${itemLabel}.${field} must be canonical text.`);
      }
      return fieldValue;
    };
    const readOptionalString = (field: string) => {
      const fieldValue = entry[field];
      if (fieldValue === null) {
        return "";
      }
      if (
        typeof fieldValue !== "string" ||
        !fieldValue ||
        fieldValue.trim() !== fieldValue ||
        Array.from(fieldValue).some((character) => character < " ")
      ) {
        throw new Error(`${itemLabel}.${field} must be a string or null.`);
      }
      return fieldValue;
    };

    const assetDefinitionId = normalizeFirstReleaseAssetDefinitionId(
      readRequiredString("asset"),
      `${itemLabel}.asset`,
    );
    if (
      expectedAssetDefinitionId !== undefined &&
      assetDefinitionId !== expectedAssetDefinitionId
    ) {
      throw new Error(
        `${itemLabel}.asset does not match the requested asset definition.`,
      );
    }
    const accountId = normalizeCanonicalAccountIdLiteral(
      readRequiredString("account_id"),
      `${itemLabel}.account_id`,
      context.networkPrefix,
    );
    if (accountId !== expectedAccountId) {
      throw new Error(
        `${itemLabel}.account_id does not match the requested account.`,
      );
    }
    const scope = readRequiredString("scope");
    if (scope !== "global" && !/^dataspace:(?:0|[1-9]\d*)$/u.test(scope)) {
      throw new Error(
        `${itemLabel}.scope must be "global" or a canonical dataspace scope.`,
      );
    }
    if (
      scope.startsWith("dataspace:") &&
      BigInt(scope.slice("dataspace:".length)) > 0xffff_ffff_ffff_ffffn
    ) {
      throw new Error(`${itemLabel}.scope dataspace ID exceeds u64.`);
    }
    const holdingKey = `${assetDefinitionId}\0${scope}`;
    if (holdingKeys.has(holdingKey)) {
      throw new Error(
        `${itemLabel} duplicates an account asset holding in this exact page.`,
      );
    }
    holdingKeys.add(holdingKey);
    const assetId = `${assetDefinitionId}#${accountId}${
      scope === "global" ? "" : `#${scope}`
    }`;
    const assetAlias = readOptionalString("asset_alias");
    const assetName = readRequiredString("asset_name");
    const quantity = readRequiredString("quantity");
    if (
      quantity.length > 155 ||
      !/^(?:0|[1-9]\d*)(?:\.\d*[1-9])?$/u.test(quantity) ||
      (quantity.includes(".") && quantity.split(".")[1]!.length > 28)
    ) {
      throw new Error(`${itemLabel}.quantity must be a canonical quantity.`);
    }
    return {
      asset_id: assetId,
      quantity,
      scope,
      ...(assetAlias ? { asset_alias: assetAlias } : {}),
      ...(assetName ? { asset_name: assetName } : {}),
      asset_definition_id: assetDefinitionId,
    };
  });
  const total = toExactJsonNonNegativeInteger(
    record.total,
    "account asset list response.total",
  );
  if (total < items.length) {
    throw new Error(
      "account asset list response.total cannot be less than items.length.",
    );
  }
  return { items, total };
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
  assertExactObjectKeys(payload, ["lane_id", "total", "items"], "validators");
  const laneId = toPositiveInteger(payload.lane_id, "validators.lane_id");
  const total = toPositiveInteger(payload.total, "validators.total");
  const rawItems = toArray(payload.items, "validators.items");

  const items: PublicLaneValidatorRecordView[] = rawItems.map(
    (raw, index): PublicLaneValidatorRecordView => {
      const item = toRecord(raw, `validators.items[${index}]`);
      const itemLabel = `validators.items[${index}]`;
      assertExactObjectKeys(
        item,
        [
          "lane_id",
          "validator",
          "peer_id",
          "stake_account",
          "total_stake",
          "self_stake",
          "status",
          "activation_epoch",
          "activation_height",
          "last_reward_epoch",
          "metadata",
        ],
        itemLabel,
      );
      const statusRecord = toRecord(
        item.status,
        `validators.items[${index}].status`,
      );
      assertExactObjectKeys(
        statusRecord,
        ["type", "activates_at_epoch", "reason", "releases_at_ms", "slash_id"],
        `${itemLabel}.status`,
      );
      const itemLaneId = toPositiveInteger(
        item.lane_id,
        `${itemLabel}.lane_id`,
      );
      if (itemLaneId !== laneId) {
        throw new Error(`${itemLabel}.lane_id must match validators.lane_id.`);
      }
      return {
        lane_id: itemLaneId,
        validator: toStringValue(
          item.validator,
          `validators.items[${index}].validator`,
        ),
        peer_id: toStringValue(
          item.peer_id,
          `validators.items[${index}].peer_id`,
        ),
        stake_account: toStringValue(
          item.stake_account,
          `validators.items[${index}].stake_account`,
        ),
        total_stake: toCanonicalQuantity(
          item.total_stake,
          `validators.items[${index}].total_stake`,
        ),
        self_stake: toCanonicalQuantity(
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
            statusRecord.reason === null
              ? null
              : toStringValue(
                  statusRecord.reason,
                  `${itemLabel}.status.reason`,
                ),
          releases_at_ms: toNullableInteger(statusRecord.releases_at_ms),
          slash_id:
            statusRecord.slash_id === null
              ? null
              : toStringValue(
                  statusRecord.slash_id,
                  `${itemLabel}.status.slash_id`,
                ),
        },
        activation_epoch: toNullableInteger(item.activation_epoch),
        activation_height: toNullableInteger(item.activation_height),
        last_reward_epoch: toNullableInteger(item.last_reward_epoch),
        metadata: toMetadataRecord(item.metadata, `${itemLabel}.metadata`),
      };
    },
  );

  if (total < items.length) {
    throw new Error("validators.total must not be smaller than items.length.");
  }
  if (new Set(items.map((item) => item.validator)).size !== items.length) {
    throw new Error("validators.items must contain unique validators.");
  }

  return {
    lane_id: laneId,
    total,
    items,
  };
};

export const normalizePublicLaneStakePayload = (
  payload: Record<string, unknown>,
): PublicLaneStakeResponseView => {
  assertExactObjectKeys(payload, ["lane_id", "total", "items"], "stake");
  const laneId = toPositiveInteger(payload.lane_id, "stake.lane_id");
  const total = toPositiveInteger(payload.total, "stake.total");
  const rawItems = toArray(payload.items, "stake.items");

  const items: PublicLaneStakeShareView[] = rawItems.map((raw, index) => {
    const item = toRecord(raw, `stake.items[${index}]`);
    const itemLabel = `stake.items[${index}]`;
    assertExactObjectKeys(
      item,
      [
        "lane_id",
        "validator",
        "staker",
        "bonded",
        "metadata",
        "pending_unbonds",
      ],
      itemLabel,
    );
    const rawUnbonds = toArray(
      item.pending_unbonds,
      `stake.items[${index}].pending_unbonds`,
    );
    const pending_unbonds: PublicLaneUnbondingView[] = rawUnbonds.map(
      (unbondRaw, unbondIndex) => {
        const unbond = toRecord(
          unbondRaw,
          `stake.items[${index}].pending_unbonds[${unbondIndex}]`,
        );
        const unbondLabel = `${itemLabel}.pending_unbonds[${unbondIndex}]`;
        assertExactObjectKeys(
          unbond,
          ["request_id", "amount", "release_at_ms"],
          unbondLabel,
        );
        return {
          request_id: toStringValue(
            unbond.request_id,
            `stake.items[${index}].pending_unbonds[${unbondIndex}].request_id`,
          ),
          amount: toCanonicalQuantity(
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

    const itemLaneId = toPositiveInteger(item.lane_id, `${itemLabel}.lane_id`);
    if (itemLaneId !== laneId) {
      throw new Error(`${itemLabel}.lane_id must match stake.lane_id.`);
    }
    return {
      lane_id: itemLaneId,
      validator: toStringValue(
        item.validator,
        `stake.items[${index}].validator`,
      ),
      staker: toStringValue(item.staker, `stake.items[${index}].staker`),
      bonded: toCanonicalQuantity(item.bonded, `stake.items[${index}].bonded`),
      metadata: toMetadataRecord(item.metadata, `${itemLabel}.metadata`),
      pending_unbonds,
    };
  });

  if (total < items.length) {
    throw new Error("stake.total must not be smaller than items.length.");
  }
  if (
    new Set(items.map((item) => JSON.stringify([item.validator, item.staker])))
      .size !== items.length
  ) {
    throw new Error("stake.items must contain unique validator/staker pairs.");
  }

  return {
    lane_id: laneId,
    total,
    items,
  };
};

export const normalizePublicLaneRewardsPayload = (
  payload: Record<string, unknown>,
): PublicLaneRewardsResponseView => {
  assertExactObjectKeys(payload, ["lane_id", "total", "items"], "rewards");
  const laneId = toPositiveInteger(payload.lane_id, "rewards.lane_id");
  const total = toPositiveInteger(payload.total, "rewards.total");
  const rawItems = toArray(payload.items, "rewards.items");

  const items: PublicLanePendingRewardView[] = rawItems.map((raw, index) => {
    const item = toRecord(raw, `rewards.items[${index}]`);
    const itemLabel = `rewards.items[${index}]`;
    assertExactObjectKeys(
      item,
      [
        "lane_id",
        "account",
        "asset",
        "last_claimed_epoch",
        "pending_through_epoch",
        "amount",
      ],
      itemLabel,
    );
    const itemLaneId = toPositiveInteger(item.lane_id, `${itemLabel}.lane_id`);
    if (itemLaneId !== laneId) {
      throw new Error(`${itemLabel}.lane_id must match rewards.lane_id.`);
    }
    return {
      lane_id: itemLaneId,
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
      amount: toCanonicalQuantity(
        item.amount,
        `rewards.items[${index}].amount`,
      ),
    };
  });

  if (total < items.length) {
    throw new Error("rewards.total must not be smaller than items.length.");
  }
  if (
    new Set(items.map((item) => JSON.stringify([item.account, item.asset])))
      .size !== items.length
  ) {
    throw new Error("rewards.items must contain unique account/asset pairs.");
  }

  return {
    lane_id: laneId,
    total,
    items,
  };
};

export const normalizeNexusLifecyclePayload = (
  payload: Record<string, unknown>,
): NexusLifecycleView => {
  assertExactObjectKeys(
    payload,
    ["version", "nexus_enabled", "lane_count", "lanes"],
    "nexus lifecycle",
  );
  const rawLanes = toArray(payload.lanes, "nexus lifecycle.lanes");
  const lanes = rawLanes.map((rawLane, index): NexusLifecycleLaneView => {
    const lane = toRecord(rawLane, `nexus lifecycle.lanes[${index}]`);
    const laneLabel = `nexus lifecycle.lanes[${index}]`;
    assertExactObjectKeys(
      lane,
      [
        "id",
        "dataspace_id",
        "alias",
        "description",
        "visibility",
        "governance",
        "storage",
        "proof_scheme",
        "metadata",
      ],
      laneLabel,
    );
    if (
      typeof lane.description !== "string" ||
      lane.description.trim() !== lane.description
    ) {
      throw new Error(`${laneLabel}.description must be canonical text.`);
    }
    return {
      id: toPositiveInteger(lane.id, `nexus lifecycle.lanes[${index}].id`),
      dataspace_id: toCanonicalNonNegativeDecimalString(
        lane.dataspace_id,
        `nexus lifecycle.lanes[${index}].dataspace_id`,
      ),
      alias: toStringValue(lane.alias, `nexus lifecycle.lanes[${index}].alias`),
      description: lane.description,
      visibility: toStringValue(
        lane.visibility,
        `nexus lifecycle.lanes[${index}].visibility`,
      ),
      governance:
        lane.governance === null
          ? null
          : toStringValue(lane.governance, `${laneLabel}.governance`),
      storage: toStringValue(
        lane.storage,
        `nexus lifecycle.lanes[${index}].storage`,
      ),
      proof_scheme: toStringValue(
        lane.proof_scheme,
        `nexus lifecycle.lanes[${index}].proof_scheme`,
      ),
      metadata: toMetadataRecord(lane.metadata, `${laneLabel}.metadata`),
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
  if (
    new Set(lanes.map((lane) => lane.id)).size !== lanes.length ||
    new Set(lanes.map((lane) => lane.dataspace_id)).size !== lanes.length ||
    new Set(lanes.map((lane) => lane.alias)).size !== lanes.length
  ) {
    throw new Error(
      "nexus lifecycle lanes must have unique IDs, dataspaces, and aliases.",
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

const readNullablePolicyUint32 = (
  value: unknown,
  label: string,
): number | null => {
  if (value === null) {
    return null;
  }
  const normalized = toExactJsonNonNegativeInteger(value, label);
  if (normalized > 0xffff_ffff) {
    throw new Error(`${label} must be a uint32 or null.`);
  }
  return normalized;
};

const readPolicyBoolean = (value: unknown, label: string): boolean => {
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be an explicit boolean.`);
  }
  return value;
};

const readNullablePolicyString = (
  value: unknown,
  label: string,
): string | null => {
  if (value === null) {
    return null;
  }
  if (
    typeof value !== "string" ||
    !value ||
    value.trim() !== value ||
    Array.from(value).some((character) => {
      const code = character.charCodeAt(0);
      return code < 0x20 || code === 0x7f;
    })
  ) {
    throw new Error(`${label} must be canonical text or null.`);
  }
  return value;
};

const readUpperHashBody = (value: unknown, label: string): string | null => {
  if (value === null) {
    return null;
  }
  if (typeof value !== "string" || !/^[0-9A-F]{64}$/u.test(value)) {
    throw new Error(`${label} must be an uppercase 32-byte hash or null.`);
  }
  return value;
};

const readAssetDefinitionHashBody = (
  value: unknown,
  label: string,
): string | null => {
  if (value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new Error(`${label} must be a canonical hash literal or null.`);
  }
  const match = /^hash:([0-9A-F]{64})#[0-9A-F]{4}$/u.exec(value);
  if (!match) {
    throw new Error(`${label} must be a canonical hash literal or null.`);
  }
  return match[1];
};

const readRequiredUpperHashBody = (value: unknown, label: string): string => {
  const hash = readUpperHashBody(value, label);
  if (hash === null) {
    throw new Error(`${label} must not be null.`);
  }
  return hash;
};

const readRequiredAssetDefinitionHashBody = (
  value: unknown,
  label: string,
): string => {
  const hash = readAssetDefinitionHashBody(value, label);
  if (hash === null) {
    throw new Error(`${label} must not be null.`);
  }
  return hash;
};

const assertPendingTransitionShape = (
  currentMode: ConfidentialPolicyMode,
  pending: ConfidentialPolicyTransitionView,
  label: string,
): void => {
  if (pending.previous_mode !== currentMode) {
    throw new Error(`${label}.previous_mode must match the current mode.`);
  }
  if (currentMode === "Convertible" && pending.new_mode === "ShieldedOnly") {
    if (
      pending.conversion_window === null ||
      pending.conversion_window < 1 ||
      pending.conversion_window > pending.effective_height ||
      pending.window_open_height !==
        pending.effective_height - pending.conversion_window
    ) {
      throw new Error(
        `${label} must carry its exact ShieldedOnly conversion window.`,
      );
    }
    return;
  }
  if (currentMode === "ShieldedOnly" && pending.new_mode === "Convertible") {
    if (
      pending.conversion_window !== null ||
      pending.window_open_height !== null
    ) {
      throw new Error(
        `${label} must not carry a conversion window when entering Convertible mode.`,
      );
    }
    return;
  }
  throw new Error(
    `${label} is outside the first-release policy state machine.`,
  );
};

const effectiveConfidentialPolicyMode = (
  currentMode: ConfidentialPolicyMode,
  blockHeight: number,
  pending: ConfidentialPolicyTransitionView | null,
): ConfidentialPolicyMode => {
  if (!pending) {
    return currentMode;
  }
  if (blockHeight >= pending.effective_height) {
    return pending.new_mode;
  }
  if (
    pending.new_mode === "ShieldedOnly" &&
    pending.window_open_height !== null &&
    blockHeight >= pending.window_open_height
  ) {
    return "Convertible";
  }
  return currentMode;
};

const assertPendingTransitionState = (
  currentMode: ConfidentialPolicyMode,
  effectiveMode: ConfidentialPolicyMode,
  blockHeight: number,
  pending: ConfidentialPolicyTransitionView | null,
  label: string,
): void => {
  if (pending) {
    assertPendingTransitionShape(
      currentMode,
      pending,
      `${label}.pending_transition`,
    );
  }
  if (
    effectiveMode !==
    effectiveConfidentialPolicyMode(currentMode, blockHeight, pending)
  ) {
    throw new Error(
      `${label}.effective_mode does not match the current block and pending transition.`,
    );
  }
};

const readTransitionEndpointPendingTransition = (
  value: unknown,
): ConfidentialPolicyTransitionView | null => {
  if (value === null) {
    return null;
  }
  const pending = toRecord(value, "confidential.pending_transition");
  assertExactObjectKeys(
    pending,
    [
      "transition_id",
      "previous_mode",
      "new_mode",
      "effective_height",
      "conversion_window",
      "window_open_height",
    ],
    "confidential.pending_transition",
  );
  const effectiveHeight = toExactJsonNonNegativeInteger(
    pending.effective_height,
    "confidential.pending_transition.effective_height",
  );
  if (effectiveHeight === 0) {
    throw new Error(
      "confidential.pending_transition.effective_height must be greater than zero.",
    );
  }
  return {
    transition_id: readRequiredUpperHashBody(
      pending.transition_id,
      "confidential.pending_transition.transition_id",
    ),
    previous_mode: readConfidentialPolicyMode(
      pending.previous_mode,
      "confidential.pending_transition.previous_mode",
    ),
    new_mode: readConfidentialPolicyMode(
      pending.new_mode,
      "confidential.pending_transition.new_mode",
    ),
    effective_height: effectiveHeight,
    conversion_window:
      pending.conversion_window === null
        ? null
        : toExactJsonNonNegativeInteger(
            pending.conversion_window,
            "confidential.pending_transition.conversion_window",
          ),
    window_open_height:
      pending.window_open_height === null
        ? null
        : toExactJsonNonNegativeInteger(
            pending.window_open_height,
            "confidential.pending_transition.window_open_height",
          ),
  };
};

const readAssetDefinitionPendingTransition = (
  value: unknown,
  currentMode: ConfidentialPolicyMode,
): ConfidentialPolicyTransitionView | null => {
  if (value === null) {
    return null;
  }
  const pending = toRecord(
    value,
    "asset definition.confidential_policy.pending_transition",
  );
  const label = "asset definition.confidential_policy.pending_transition";
  assertExactObjectKeys(
    pending,
    [
      "new_mode",
      "effective_height",
      "previous_mode",
      "transition_id",
      "conversion_window",
    ],
    label,
  );
  const effectiveHeight = toExactJsonNonNegativeInteger(
    pending.effective_height,
    `${label}.effective_height`,
  );
  if (effectiveHeight === 0) {
    throw new Error(`${label}.effective_height must be greater than zero.`);
  }
  const conversionWindow =
    pending.conversion_window === null
      ? null
      : toExactJsonNonNegativeInteger(
          pending.conversion_window,
          `${label}.conversion_window`,
        );
  const normalized: ConfidentialPolicyTransitionView = {
    transition_id: readRequiredAssetDefinitionHashBody(
      pending.transition_id,
      `${label}.transition_id`,
    ),
    previous_mode: readConfidentialPolicyMode(
      pending.previous_mode,
      `${label}.previous_mode`,
    ),
    new_mode: readConfidentialPolicyMode(pending.new_mode, `${label}.new_mode`),
    effective_height: effectiveHeight,
    conversion_window: conversionWindow,
    window_open_height:
      conversionWindow === null ? null : effectiveHeight - conversionWindow,
  };
  assertPendingTransitionShape(currentMode, normalized, label);
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
  assertExactObjectKeys(
    policy,
    [
      "mode",
      "allow_shield",
      "allow_unshield",
      "vk_transfer",
      "vk_unshield",
      "vk_shield",
      "vk_set_hash",
      "poseidon_params_id",
      "pedersen_params_id",
      "pending_transition",
    ],
    "asset definition.confidential_policy",
  );
  const mode = readConfidentialPolicyMode(
    policy.mode,
    "asset definition.confidential_policy.mode",
  );
  return {
    mode,
    allow_shield: readPolicyBoolean(
      policy.allow_shield,
      "asset definition.confidential_policy.allow_shield",
    ),
    allow_unshield: readPolicyBoolean(
      policy.allow_unshield,
      "asset definition.confidential_policy.allow_unshield",
    ),
    vk_transfer: readNullablePolicyString(
      policy.vk_transfer,
      "asset definition.confidential_policy.vk_transfer",
    ),
    vk_unshield: readNullablePolicyString(
      policy.vk_unshield,
      "asset definition.confidential_policy.vk_unshield",
    ),
    vk_shield: readNullablePolicyString(
      policy.vk_shield,
      "asset definition.confidential_policy.vk_shield",
    ),
    vk_set_hash: readAssetDefinitionHashBody(
      policy.vk_set_hash,
      "asset definition.confidential_policy.vk_set_hash",
    ),
    poseidon_params_id: readNullablePolicyUint32(
      policy.poseidon_params_id,
      "asset definition.confidential_policy.poseidon_params_id",
    ),
    pedersen_params_id: readNullablePolicyUint32(
      policy.pedersen_params_id,
      "asset definition.confidential_policy.pedersen_params_id",
    ),
    pending_transition: readAssetDefinitionPendingTransition(
      policy.pending_transition,
      mode,
    ),
  };
};

export const normalizeConfidentialAssetPolicyPayload = (
  payload: Record<string, unknown>,
): ConfidentialAssetPolicyView => {
  assertExactObjectKeys(
    payload,
    [
      "asset_id",
      "block_height",
      "current_mode",
      "effective_mode",
      "allow_shield",
      "allow_unshield",
      "vk_transfer",
      "vk_unshield",
      "vk_shield",
      "vk_set_hash",
      "poseidon_params_id",
      "pedersen_params_id",
      "pending_transition",
    ],
    "Confidential asset policy",
  );
  if (typeof payload.asset_id !== "string") {
    throw new Error("confidential.asset_id must be a string.");
  }
  const asset_id = normalizeFirstReleaseAssetDefinitionId(
    payload.asset_id,
    "confidential.asset_id",
  );
  if (asset_id !== payload.asset_id) {
    throw new Error("confidential.asset_id must be canonical.");
  }
  const block_height = toExactJsonNonNegativeInteger(
    payload.block_height,
    "confidential.block_height",
  );
  const current_mode = readConfidentialPolicyMode(
    payload.current_mode,
    "confidential.current_mode",
  );
  const effective_mode = readConfidentialPolicyMode(
    payload.effective_mode,
    "confidential.effective_mode",
  );
  const pending_transition = readTransitionEndpointPendingTransition(
    payload.pending_transition,
  );
  assertPendingTransitionState(
    current_mode,
    effective_mode,
    block_height,
    pending_transition,
    "Confidential asset policy",
  );

  return {
    asset_id,
    block_height,
    current_mode,
    effective_mode,
    allow_shield: readPolicyBoolean(
      payload.allow_shield,
      "confidential.allow_shield",
    ),
    allow_unshield: readPolicyBoolean(
      payload.allow_unshield,
      "confidential.allow_unshield",
    ),
    vk_transfer: readNullablePolicyString(
      payload.vk_transfer,
      "confidential.vk_transfer",
    ),
    vk_unshield: readNullablePolicyString(
      payload.vk_unshield,
      "confidential.vk_unshield",
    ),
    vk_shield: readNullablePolicyString(
      payload.vk_shield,
      "confidential.vk_shield",
    ),
    vk_set_hash: readUpperHashBody(
      payload.vk_set_hash,
      "confidential.vk_set_hash",
    ),
    poseidon_params_id: readNullablePolicyUint32(
      payload.poseidon_params_id,
      "confidential.poseidon_params_id",
    ),
    pedersen_params_id: readNullablePolicyUint32(
      payload.pedersen_params_id,
      "confidential.pedersen_params_id",
    ),
    pending_transition,
  };
};

export const assertConfidentialPolicyProjectionAgreement = (
  policy: ConfidentialAssetPolicyView,
  assetDefinition: Record<string, unknown>,
): ConfidentialAssetPolicyView => {
  const assetPolicy =
    normalizeAssetDefinitionConfidentialPolicy(assetDefinition);
  if (!assetPolicy) {
    throw new Error(
      "Confidential asset is missing the top-level confidential_policy.",
    );
  }
  if (
    typeof assetDefinition.id !== "string" ||
    normalizeFirstReleaseAssetDefinitionId(
      assetDefinition.id,
      "asset definition.id",
    ) !== policy.asset_id ||
    assetDefinition.id !== policy.asset_id
  ) {
    throw new Error(
      "Confidential policy transition projection identifies a different asset definition.",
    );
  }
  const expectedEffectiveMode = effectiveConfidentialPolicyMode(
    assetPolicy.mode,
    policy.block_height,
    assetPolicy.pending_transition,
  );
  const samePendingTransition =
    JSON.stringify(policy.pending_transition) ===
    JSON.stringify(assetPolicy.pending_transition);
  if (
    policy.current_mode !== assetPolicy.mode ||
    policy.effective_mode !== expectedEffectiveMode ||
    policy.allow_shield !== assetPolicy.allow_shield ||
    policy.allow_unshield !== assetPolicy.allow_unshield ||
    policy.vk_transfer !== assetPolicy.vk_transfer ||
    policy.vk_unshield !== assetPolicy.vk_unshield ||
    policy.vk_shield !== assetPolicy.vk_shield ||
    policy.vk_set_hash !== assetPolicy.vk_set_hash ||
    policy.poseidon_params_id !== assetPolicy.poseidon_params_id ||
    policy.pedersen_params_id !== assetPolicy.pedersen_params_id ||
    !samePendingTransition
  ) {
    throw new Error(
      "Confidential policy transition projection does not exactly match the asset definition.",
    );
  }
  return policy;
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

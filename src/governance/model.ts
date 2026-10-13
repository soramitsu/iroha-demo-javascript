import { parseNetworkIdLiteral } from "../utils/networkIdentity";

export type GovernanceProposalStatus =
  | "Proposed"
  | "Rejected"
  | "Enacted"
  | "Superseded"
  | "ExecutionFailed";

export type GovernanceProposalKindId =
  | "ValidationFeePayoutLifecycle"
  | "ValidationFeePolicy";

/**
 * Kinds this wallet can draft, decode for review, and sign. The pinned native
 * codec has no reviewable JSON form for `ProposeValidationFeePayoutLifecycle`,
 * so payout-lifecycle proposals are inspect-only.
 */
export type GovernanceWritableProposalKindId = "ValidationFeePolicy";

interface GovernanceKindBase {
  type: GovernanceProposalKindId;
  proposalOperator: string;
  raw: Record<string, unknown>;
}

export interface ValidationFeeChargingModePayload {
  charging_mode: "RETAIL_MONTHLY_ALLOWANCE";
  value: null;
}

export interface RetailMaintenanceTierPayload {
  minimum_average_balance_minor: number;
  monthly_fee_minor: number;
}

export interface RetailFeeSchedulePayload {
  included_payments: number;
  overage_minor: number;
  maintenance_tiers: RetailMaintenanceTierPayload[];
}

/** Native `ValidationFeeRewardCustodyV1`; immutable across policy revisions. */
export interface ValidationFeeRewardCustodyPayload {
  contract_address: string;
  treasury_account_id: string;
  ds_asset_id: typeof NATIVE_SBD_ASSET_DEFINITION_ID;
  xor_asset_id: string;
  reward_pool_account_id: string;
  validator_lane_id: number;
}

/** Native `ValidationFeeTreasuryPayoutBindingV1` (20 fields, exact order). */
export interface ValidationFeePayoutBindingPayload {
  contract_address: string;
  code_hash: string;
  entrypoint: "autonomous_validation_fee_tick";
  treasury_account_id: string;
  ds_asset_id: typeof NATIVE_SBD_ASSET_DEFINITION_ID;
  xor_asset_id: string;
  pool_contract_address: string;
  pool_code_hash: string;
  pool_vault_account_id: string;
  reward_pool_account_id: string;
  reference_feed_id: [string];
  reference_feed_config_version: number;
  reference_provider_accounts: string[];
  max_sbd_per_attempt_minor: number;
  max_sbd_per_day_minor: number;
  min_interval_ms: number;
  max_source_age_ms: number;
  max_slippage_bps: number;
  validator_lane_id: number;
  min_reward_claim_xor_minor: number;
}

/** Native `ValidationFeePolicyV1` (14 fields, exact order). */
export interface ValidationFeePolicyPayload {
  schema_version: 1;
  /** Canonical endpoint-derived NetworkId literal. */
  network_id: string;
  policy_version: string;
  /** Uppercase native [u8; 32] hex, `null` exactly for version 1. */
  previous_policy_hash: string | null;
  ds_asset_id: typeof NATIVE_SBD_ASSET_DEFINITION_ID;
  ds_scale: 2;
  retail_schedule: RetailFeeSchedulePayload;
  effective_from_ms: number;
  notice_published_at_ms: number;
  /** Canonical native Quantity: positive, at most two decimals, no trailing zeros. */
  fee: string;
  treasury_account_id: string;
  charging_mode: ValidationFeeChargingModePayload;
  exemption_classes: ["TREASURY_PAYOUT"];
  reward_custody: ValidationFeeRewardCustodyPayload;
}

export interface ValidationFeePolicyGovernanceKind extends GovernanceKindBase {
  type: "ValidationFeePolicy";
  policy: ValidationFeePolicyPayload;
}

export interface ValidationFeePayoutLifecycleGovernanceKind
  extends GovernanceKindBase {
  type: "ValidationFeePayoutLifecycle";
  payoutBinding: ValidationFeePayoutBindingPayload;
}

export type GovernanceProposalKind =
  | ValidationFeePayoutLifecycleGovernanceKind
  | ValidationFeePolicyGovernanceKind;

export interface GovernanceProposalSummary {
  proposalId: string;
  proposer: string;
  createdHeight: number;
  status: GovernanceProposalStatus;
  kindType: GovernanceProposalKindId;
  kindLabelKey: string;
}

export interface GovernanceCertificateView {
  proposalContentId: string;
  governanceAttemptId: string;
  governanceAttemptSequence: number;
  certifiedAtHeight: string;
  enactAtHeight: string;
  bodyBindingCount: number;
  raw: Record<string, unknown>;
}

export interface GovernanceProposalDetail {
  summary: GovernanceProposalSummary;
  kind: GovernanceProposalKind;
  currentHeight: string;
  governanceCertificate: GovernanceCertificateView | null;
  raw: Record<string, unknown>;
}

export interface GovernanceProposalList {
  items: GovernanceProposalSummary[];
  nextCursor: string | null;
  limit: number;
}

export interface GovernanceProposalKindAdapter {
  id: GovernanceProposalKindId;
  labelKey: string;
  descriptionKey: string;
}

export const GOVERNANCE_KIND_ADAPTERS: Readonly<
  Record<GovernanceProposalKindId, GovernanceProposalKindAdapter>
> = Object.freeze({
  ValidationFeePayoutLifecycle: {
    id: "ValidationFeePayoutLifecycle",
    labelKey: "Validation fee payout lifecycle",
    descriptionKey:
      "Authorize one exact governed conversion and reward binding through the mandatory private Parliament protocol.",
  },
  ValidationFeePolicy: {
    id: "ValidationFeePolicy",
    labelKey: "Validation fee policy",
    descriptionKey:
      "Append one exact network-bound retail validation-fee revision through the mandatory private Parliament protocol.",
  },
});

const MAX_U64 = 0xffff_ffff_ffff_ffffn;
const MAX_U32 = 0xffff_ffff;
const MAX_U16 = 0xffff;
export const NATIVE_SBD_ASSET_DEFINITION_ID = "7ZepsJTHCVLKsrFFNZGSRGZgvBhv";
export const VALIDATION_FEE_CHARGING_MODE = "RETAIL_MONTHLY_ALLOWANCE";
export const VALIDATION_FEE_TREASURY_PAYOUT_EXEMPTION = "TREASURY_PAYOUT";
export const VALIDATION_FEE_PAYOUT_ENTRYPOINT =
  "autonomous_validation_fee_tick";
/** Native `RETAIL_FEE_NOTICE_MS`: thirty calendar days of public notice. */
export const VALIDATION_FEE_NOTICE_MS = 30 * 86_400_000;
/** Honiara is UTC+11 without daylight saving time. */
export const HONIARA_UTC_OFFSET_MS = 11 * 3_600_000;
/**
 * Latest activation the native binding can evaluate. Native
 * `honiara_month_bounds` uses the Rust `time` calendar without `large-dates`,
 * which ends at 9999-12-31: it rejects a December 9999 month (no following
 * month start) and panics, aborting the process, when a UTC instant falls in
 * Honiara year 10000. Every activation must therefore start a Honiara month
 * no later than 9999-11-01 00:00 before it reaches the native fingerprint.
 */
export const HONIARA_LAST_NATIVE_MONTH_START_MS =
  Date.UTC(9999, 10, 1) - HONIARA_UTC_OFFSET_MS;
export const RETAIL_MAINTENANCE_TIER_LIMIT = 32;
export const VALIDATION_FEE_REFERENCE_PROVIDER_COUNT = 5;
const LOWER_HEX_32 = /^[0-9a-f]{64}$/u;
const UPPER_HEX_32 = /^[0-9A-F]{64}$/u;
const LOWER_CURSOR_V1 = /^[0-9a-f]{96}$/u;
const CONTRACT_ADDRESS = /^irohac1[02-9ac-hj-np-z]{6,}$/u;
const CANONICAL_QUANTITY = /^(?:0|[1-9]\d*)(?:\.\d?[1-9])?$/u;
/** Native `Quantity` JSON: at most 154 mantissa digits (155 text bytes). */
const MAX_QUANTITY_MANTISSA_DECIMAL_DIGITS = 154;
const MAX_QUANTITY_TEXT_BYTES = MAX_QUANTITY_MANTISSA_DECIMAL_DIGITS + 1;
/** Native `Quantity` mantissas stay below 2^511 (signed 512-bit domain). */
const QUANTITY_MANTISSA_EXCLUSIVE_LIMIT = 1n << 511n;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const exactRecord = (
  value: unknown,
  expectedKeys: readonly string[],
  label: string,
): Record<string, unknown> => {
  if (!isRecord(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
  const ownKeys = Reflect.ownKeys(value);
  if (
    ownKeys.some((key) => typeof key !== "string") ||
    ownKeys.some((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return !descriptor?.enumerable || !("value" in descriptor);
    })
  ) {
    throw new TypeError(`${label} must contain enumerable JSON data fields.`);
  }
  const actual = (ownKeys as string[]).sort();
  const expected = [...expectedKeys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw new TypeError(
      `${label} must contain exactly ${expected.join(", ")}.`,
    );
  }
  return value;
};

const requiredText = (value: unknown, label: string): string => {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value ||
    value.length > 512 ||
    Array.from(value).some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 0x20 || (codePoint >= 0x7f && codePoint <= 0x9f);
    })
  ) {
    throw new TypeError(`${label} must be bounded canonical non-empty text.`);
  }
  return value;
};

const canonicalU64 = (
  value: unknown,
  label: string,
  options: Readonly<{ positive?: boolean }> = {},
): string => {
  if (typeof value !== "string" || !/^(?:0|[1-9]\d*)$/u.test(value)) {
    throw new TypeError(
      `${label} must be a canonical unsigned decimal string.`,
    );
  }
  const parsed = BigInt(value);
  if (parsed > MAX_U64 || (options.positive === true && parsed === 0n)) {
    throw new TypeError(`${label} is outside the unsigned 64-bit range.`);
  }
  return value;
};

const exactJsonU64 = (value: unknown, label: string): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} must be an exact non-negative JSON integer.`);
  }
  return value;
};

const exactJsonU32 = (value: unknown, label: string): number => {
  const parsed = exactJsonU64(value, label);
  if (parsed > 0xffff_ffff) {
    throw new TypeError(`${label} exceeds uint32.`);
  }
  return parsed;
};

const fixedBytes32 = (
  value: unknown,
  label: string,
  options: Readonly<{ allowZero?: boolean }> = {},
): string => {
  if (typeof value !== "string" || !LOWER_HEX_32.test(value)) {
    throw new TypeError(
      `${label} must be exactly 64 lowercase hexadecimal digits.`,
    );
  }
  if (options.allowZero !== true && /^0{64}$/u.test(value)) {
    throw new TypeError(`${label} must be non-zero.`);
  }
  return value;
};

export const canonicalGovernanceProposalId = (
  value: unknown,
): string | null => {
  if (typeof value !== "string") return null;
  const literal = value.trim();
  const raw = literal.startsWith("0x") ? literal.slice(2) : literal;
  return LOWER_HEX_32.test(raw) ? `0x${raw}` : null;
};

/**
 * Exact native `[u8; 32]` JSON rendering: non-zero uppercase hex. The native
 * codec and Torii emit uppercase, and the wallet compares reviewed values
 * exactly, so lowercase input is rejected rather than rewritten.
 */
const nativeHash32 = (value: unknown, label: string): string => {
  if (typeof value !== "string" || !UPPER_HEX_32.test(value)) {
    throw new TypeError(
      `${label} must be exactly 64 uppercase hexadecimal digits.`,
    );
  }
  if (/^0{64}$/u.test(value)) {
    throw new TypeError(`${label} must be non-zero.`);
  }
  return value;
};

const jsonInteger = (
  value: unknown,
  label: string,
  options: Readonly<{ positive?: boolean; maximum?: number }> = {},
): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(
      `${label} must be an exact non-negative JSON integer within the safe range.`,
    );
  }
  if (options.positive === true && value === 0) {
    throw new TypeError(`${label} must be positive.`);
  }
  if (options.maximum !== undefined && value > options.maximum) {
    throw new TypeError(`${label} exceeds its native bound.`);
  }
  return value;
};

const contractAddress = (value: unknown, label: string): string => {
  const text = requiredText(value, label);
  if (!CONTRACT_ADDRESS.test(text)) {
    throw new TypeError(
      `${label} must be one canonical irohac1 contract address.`,
    );
  }
  return text;
};

const assetDefinitionId = (value: unknown, label: string): string => {
  const text = requiredText(value, label);
  if (!/^[1-9A-HJ-NP-Za-km-z]+$/u.test(text)) {
    throw new TypeError(
      `${label} must be one canonical Base58 asset definition ID.`,
    );
  }
  return text;
};

const MAX_NAME_UTF8_BYTES = 255;
/** Rust `is_bidi_control` code points rejected inside a `Name`. */
const NAME_BIDI_CONTROL = /[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/u;

/**
 * Native `Name::validate_canonical`: non-empty, at most 255 UTF-8 bytes, no
 * control, bidirectional-control, or white-space characters, none of the
 * reserved `@`, `#`, `$`, and exact NFC spelling.
 */
const canonicalName = (value: unknown, label: string): string => {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    new TextEncoder().encode(value).byteLength > MAX_NAME_UTF8_BYTES ||
    /[\p{Cc}\p{White_Space}@#$]/u.test(value) ||
    NAME_BIDI_CONTROL.test(value) ||
    value.normalize("NFC") !== value
  ) {
    throw new TypeError(`${label} must be one canonical Iroha name.`);
  }
  return value;
};

/**
 * Native canonical `Quantity` for the SBD fee: positive, scale <= 2, no
 * trailing zeros, and inside the native text and signed 512-bit mantissa
 * bounds (`Quantity::from_canonical_json_text`).
 */
export const canonicalValidationFeeQuantity = (
  value: unknown,
  label = "Validation-fee policy.fee",
): string => {
  if (
    typeof value !== "string" ||
    value.length > MAX_QUANTITY_TEXT_BYTES ||
    !CANONICAL_QUANTITY.test(value)
  ) {
    throw new TypeError(
      `${label} must be a canonical positive quantity with at most two decimals and no trailing zeros.`,
    );
  }
  if (!/[1-9]/u.test(value)) {
    throw new TypeError(`${label} must be positive.`);
  }
  const mantissa = value.replace(".", "");
  if (
    mantissa.length > MAX_QUANTITY_MANTISSA_DECIMAL_DIGITS ||
    BigInt(mantissa) >= QUANTITY_MANTISSA_EXCLUSIVE_LIMIT
  ) {
    throw new TypeError(
      `${label} exceeds the native signed 512-bit quantity domain.`,
    );
  }
  return value;
};

/** True when `ms` is exactly 00:00 on the first day of a Honiara (UTC+11) month. */
export const isHoniaraMonthStart = (ms: number): boolean => {
  if (!Number.isSafeInteger(ms) || ms < 0) return false;
  const local = new Date(ms + HONIARA_UTC_OFFSET_MS);
  return (
    Number.isFinite(local.getTime()) &&
    local.getUTCDate() === 1 &&
    local.getUTCHours() === 0 &&
    local.getUTCMinutes() === 0 &&
    local.getUTCSeconds() === 0 &&
    local.getUTCMilliseconds() === 0
  );
};

/** `YYYY-MM-DD HH:MM` in Honiara (UTC+11) local time, or "" when invalid. */
export const formatHoniaraTimestamp = (ms: number): string => {
  if (!Number.isSafeInteger(ms) || ms < 0) return "";
  const local = new Date(ms + HONIARA_UTC_OFFSET_MS);
  if (!Number.isFinite(local.getTime())) return "";
  return local.toISOString().slice(0, 16).replace("T", " ");
};

/**
 * Honiara month starts at or after `fromMs`, in ascending order, limited to
 * the native calendar domain (`HONIARA_LAST_NATIVE_MONTH_START_MS`).
 */
export const honiaraMonthStartsFrom = (
  fromMs: number,
  count: number,
): number[] => {
  if (
    !Number.isSafeInteger(fromMs) ||
    fromMs < 0 ||
    fromMs > HONIARA_LAST_NATIVE_MONTH_START_MS ||
    count <= 0
  ) {
    return [];
  }
  const local = new Date(fromMs + HONIARA_UTC_OFFSET_MS);
  let year = local.getUTCFullYear();
  let month = local.getUTCMonth();
  const starts: number[] = [];
  while (starts.length < count) {
    const start = Date.UTC(year, month, 1) - HONIARA_UTC_OFFSET_MS;
    if (start > HONIARA_LAST_NATIVE_MONTH_START_MS) break;
    if (start >= fromMs) starts.push(start);
    month += 1;
    if (month === 12) {
      month = 0;
      year += 1;
    }
  }
  return starts;
};

/**
 * Native `validate_retail_activation`: the effective time is a Honiara month
 * start at least thirty calendar days after the public notice, inside the
 * native calendar domain. Out-of-domain activations are rejected here so they
 * never reach the native fingerprint, which would abort the process.
 */
export const validationFeeActivationError = (
  noticePublishedAtMs: number,
  effectiveFromMs: number,
): string | null => {
  if (
    Number.isSafeInteger(effectiveFromMs) &&
    effectiveFromMs > HONIARA_LAST_NATIVE_MONTH_START_MS
  ) {
    return "Validation-fee activation must be no later than 9999-11-01 00:00 Honiara time, the last month the native calendar can evaluate.";
  }
  if (
    !Number.isSafeInteger(noticePublishedAtMs) ||
    !Number.isSafeInteger(effectiveFromMs) ||
    noticePublishedAtMs < 0 ||
    effectiveFromMs < noticePublishedAtMs + VALIDATION_FEE_NOTICE_MS ||
    !isHoniaraMonthStart(effectiveFromMs)
  ) {
    return "Validation-fee activation must be a Honiara month start at least thirty calendar days after the public notice.";
  }
  return null;
};

/**
 * Ledger enactment rule (`enact_validation_fee_policy`): the notice must not
 * postdate enactment, and activation must be a month start at least thirty
 * days after enactment. Enactment cannot happen before `nowMs`, so a draft
 * that fails this check against the current clock can never be enacted.
 */
export const validationFeeEnactmentWindowError = (
  policy: Readonly<{
    notice_published_at_ms: number;
    effective_from_ms: number;
  }>,
  nowMs: number,
): string | null => {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) {
    return "The current time is unavailable for the validation-fee activation check.";
  }
  if (policy.notice_published_at_ms > nowMs) {
    return "Validation-fee notice must not postdate this proposal.";
  }
  if (policy.effective_from_ms < nowMs + VALIDATION_FEE_NOTICE_MS) {
    return "The activation month must start at least thirty days from now, because Parliament cannot enact this proposal earlier; choose a later month.";
  }
  return null;
};

export const normalizeRetailFeeSchedule = (
  raw: unknown,
  label = "Validation-fee policy.retail_schedule",
): RetailFeeSchedulePayload => {
  const schedule = exactRecord(
    raw,
    ["included_payments", "overage_minor", "maintenance_tiers"],
    label,
  );
  const includedPayments = jsonInteger(
    schedule.included_payments,
    `${label}.included_payments`,
    { positive: true, maximum: MAX_U32 },
  );
  const overageMinor = jsonInteger(
    schedule.overage_minor,
    `${label}.overage_minor`,
    { positive: true },
  );
  if (
    !Array.isArray(schedule.maintenance_tiers) ||
    schedule.maintenance_tiers.length === 0 ||
    schedule.maintenance_tiers.length > RETAIL_MAINTENANCE_TIER_LIMIT
  ) {
    throw new TypeError(
      `${label}.maintenance_tiers must contain 1-${RETAIL_MAINTENANCE_TIER_LIMIT} tiers.`,
    );
  }
  const tiers = schedule.maintenance_tiers.map((entry, index) => {
    const tierLabel = `${label}.maintenance_tiers[${index}]`;
    const tier = exactRecord(
      entry,
      ["minimum_average_balance_minor", "monthly_fee_minor"],
      tierLabel,
    );
    return {
      minimum_average_balance_minor: jsonInteger(
        tier.minimum_average_balance_minor,
        `${tierLabel}.minimum_average_balance_minor`,
      ),
      monthly_fee_minor: jsonInteger(
        tier.monthly_fee_minor,
        `${tierLabel}.monthly_fee_minor`,
        { positive: true },
      ),
    };
  });
  if (
    tiers[0].minimum_average_balance_minor !== 0 ||
    tiers.some(
      (tier, index) =>
        index > 0 &&
        (tier.minimum_average_balance_minor <=
          tiers[index - 1].minimum_average_balance_minor ||
          tier.monthly_fee_minor < tiers[index - 1].monthly_fee_minor),
    )
  ) {
    throw new TypeError(
      `${label} requires a zero first threshold, strictly increasing thresholds, and non-decreasing monthly fees.`,
    );
  }
  return {
    included_payments: includedPayments,
    overage_minor: overageMinor,
    maintenance_tiers: tiers,
  };
};

export const normalizeValidationFeeRewardCustody = (
  raw: unknown,
  label = "Validation-fee policy.reward_custody",
): ValidationFeeRewardCustodyPayload => {
  const custody = exactRecord(
    raw,
    [
      "contract_address",
      "treasury_account_id",
      "ds_asset_id",
      "xor_asset_id",
      "reward_pool_account_id",
      "validator_lane_id",
    ],
    label,
  );
  const treasuryAccountId = requiredText(
    custody.treasury_account_id,
    `${label}.treasury_account_id`,
  );
  const rewardPoolAccountId = requiredText(
    custody.reward_pool_account_id,
    `${label}.reward_pool_account_id`,
  );
  const xorAssetId = assetDefinitionId(
    custody.xor_asset_id,
    `${label}.xor_asset_id`,
  );
  if (custody.ds_asset_id !== NATIVE_SBD_ASSET_DEFINITION_ID) {
    throw new TypeError(
      `${label}.ds_asset_id must be ${NATIVE_SBD_ASSET_DEFINITION_ID}.`,
    );
  }
  if (
    treasuryAccountId === rewardPoolAccountId ||
    xorAssetId === NATIVE_SBD_ASSET_DEFINITION_ID
  ) {
    throw new TypeError(
      `${label} requires distinct treasury and reward pool accounts and distinct SBD and XOR assets.`,
    );
  }
  return {
    contract_address: contractAddress(
      custody.contract_address,
      `${label}.contract_address`,
    ),
    treasury_account_id: treasuryAccountId,
    ds_asset_id: NATIVE_SBD_ASSET_DEFINITION_ID,
    xor_asset_id: xorAssetId,
    reward_pool_account_id: rewardPoolAccountId,
    validator_lane_id: jsonInteger(
      custody.validator_lane_id,
      `${label}.validator_lane_id`,
      { maximum: MAX_U32 },
    ),
  };
};

const PAYOUT_BINDING_FIELDS = [
  "contract_address",
  "code_hash",
  "entrypoint",
  "treasury_account_id",
  "ds_asset_id",
  "xor_asset_id",
  "pool_contract_address",
  "pool_code_hash",
  "pool_vault_account_id",
  "reward_pool_account_id",
  "reference_feed_id",
  "reference_feed_config_version",
  "reference_provider_accounts",
  "max_sbd_per_attempt_minor",
  "max_sbd_per_day_minor",
  "min_interval_ms",
  "max_source_age_ms",
  "max_slippage_bps",
  "validator_lane_id",
  "min_reward_claim_xor_minor",
] as const;

export const normalizeValidationFeePayoutBinding = (
  raw: unknown,
): ValidationFeePayoutBindingPayload => {
  const label = "Validation-fee payout binding";
  const binding = exactRecord(raw, PAYOUT_BINDING_FIELDS, label);
  if (binding.entrypoint !== VALIDATION_FEE_PAYOUT_ENTRYPOINT) {
    throw new TypeError(
      `${label}.entrypoint must be ${VALIDATION_FEE_PAYOUT_ENTRYPOINT}.`,
    );
  }
  if (binding.ds_asset_id !== NATIVE_SBD_ASSET_DEFINITION_ID) {
    throw new TypeError(
      `${label}.ds_asset_id must be ${NATIVE_SBD_ASSET_DEFINITION_ID}.`,
    );
  }
  const xorAssetId = assetDefinitionId(
    binding.xor_asset_id,
    `${label}.xor_asset_id`,
  );
  if (xorAssetId === NATIVE_SBD_ASSET_DEFINITION_ID) {
    throw new TypeError(`${label} SBD and XOR assets must differ.`);
  }
  const treasuryAccountId = requiredText(
    binding.treasury_account_id,
    `${label}.treasury_account_id`,
  );
  const poolVaultAccountId = requiredText(
    binding.pool_vault_account_id,
    `${label}.pool_vault_account_id`,
  );
  const rewardPoolAccountId = requiredText(
    binding.reward_pool_account_id,
    `${label}.reward_pool_account_id`,
  );
  if (
    new Set([treasuryAccountId, poolVaultAccountId, rewardPoolAccountId])
      .size !== 3
  ) {
    throw new TypeError(
      `${label} treasury, pool vault, and reward pool accounts must be pairwise distinct.`,
    );
  }
  if (
    !Array.isArray(binding.reference_feed_id) ||
    binding.reference_feed_id.length !== 1
  ) {
    throw new TypeError(
      `${label}.reference_feed_id must be the native one-element FeedId tuple.`,
    );
  }
  const referenceFeedId = canonicalName(
    binding.reference_feed_id[0],
    `${label}.reference_feed_id[0]`,
  );
  if (
    !Array.isArray(binding.reference_provider_accounts) ||
    binding.reference_provider_accounts.length !==
      VALIDATION_FEE_REFERENCE_PROVIDER_COUNT
  ) {
    throw new TypeError(
      `${label}.reference_provider_accounts must contain exactly ${VALIDATION_FEE_REFERENCE_PROVIDER_COUNT} accounts.`,
    );
  }
  const providers = binding.reference_provider_accounts.map((entry, index) =>
    requiredText(entry, `${label}.reference_provider_accounts[${index}]`),
  );
  if (new Set(providers).size !== providers.length) {
    throw new TypeError(`${label} reference providers must be distinct.`);
  }
  const maxPerAttempt = jsonInteger(
    binding.max_sbd_per_attempt_minor,
    `${label}.max_sbd_per_attempt_minor`,
    { positive: true },
  );
  const maxPerDay = jsonInteger(
    binding.max_sbd_per_day_minor,
    `${label}.max_sbd_per_day_minor`,
    { positive: true },
  );
  if (maxPerDay < maxPerAttempt) {
    throw new TypeError(
      `${label}.max_sbd_per_day_minor must be at least max_sbd_per_attempt_minor.`,
    );
  }
  const maxSlippageBps = jsonInteger(
    binding.max_slippage_bps,
    `${label}.max_slippage_bps`,
    { maximum: MAX_U16 },
  );
  if (maxSlippageBps >= 10_000) {
    throw new TypeError(`${label}.max_slippage_bps must be below 10000.`);
  }
  return {
    contract_address: contractAddress(
      binding.contract_address,
      `${label}.contract_address`,
    ),
    code_hash: nativeHash32(binding.code_hash, `${label}.code_hash`),
    entrypoint: VALIDATION_FEE_PAYOUT_ENTRYPOINT,
    treasury_account_id: treasuryAccountId,
    ds_asset_id: NATIVE_SBD_ASSET_DEFINITION_ID,
    xor_asset_id: xorAssetId,
    pool_contract_address: contractAddress(
      binding.pool_contract_address,
      `${label}.pool_contract_address`,
    ),
    pool_code_hash: nativeHash32(
      binding.pool_code_hash,
      `${label}.pool_code_hash`,
    ),
    pool_vault_account_id: poolVaultAccountId,
    reward_pool_account_id: rewardPoolAccountId,
    reference_feed_id: [referenceFeedId],
    reference_feed_config_version: jsonInteger(
      binding.reference_feed_config_version,
      `${label}.reference_feed_config_version`,
      { positive: true, maximum: MAX_U32 },
    ),
    reference_provider_accounts: providers,
    max_sbd_per_attempt_minor: maxPerAttempt,
    max_sbd_per_day_minor: maxPerDay,
    min_interval_ms: jsonInteger(
      binding.min_interval_ms,
      `${label}.min_interval_ms`,
      { positive: true },
    ),
    max_source_age_ms: jsonInteger(
      binding.max_source_age_ms,
      `${label}.max_source_age_ms`,
      { positive: true },
    ),
    max_slippage_bps: maxSlippageBps,
    validator_lane_id: jsonInteger(
      binding.validator_lane_id,
      `${label}.validator_lane_id`,
      { maximum: MAX_U32 },
    ),
    min_reward_claim_xor_minor: jsonInteger(
      binding.min_reward_claim_xor_minor,
      `${label}.min_reward_claim_xor_minor`,
      { positive: true },
    ),
  };
};

const POLICY_FIELDS = [
  "schema_version",
  "network_id",
  "policy_version",
  "previous_policy_hash",
  "ds_asset_id",
  "ds_scale",
  "retail_schedule",
  "effective_from_ms",
  "notice_published_at_ms",
  "fee",
  "treasury_account_id",
  "charging_mode",
  "exemption_classes",
  "reward_custody",
] as const;

const exactChargingMode = (
  value: unknown,
): ValidationFeeChargingModePayload => {
  const mode = exactRecord(
    value,
    ["charging_mode", "value"],
    "Validation-fee policy.charging_mode",
  );
  if (
    mode.charging_mode !== VALIDATION_FEE_CHARGING_MODE ||
    mode.value !== null
  ) {
    throw new TypeError(
      `Validation-fee policy.charging_mode must be ${VALIDATION_FEE_CHARGING_MODE} with a null value.`,
    );
  }
  return { charging_mode: VALIDATION_FEE_CHARGING_MODE, value: null };
};

export const normalizeValidationFeePolicy = (
  raw: unknown,
): ValidationFeePolicyPayload => {
  const label = "Validation-fee policy";
  const policy = exactRecord(raw, POLICY_FIELDS, label);
  let networkId: string;
  try {
    networkId = parseNetworkIdLiteral(policy.network_id, `${label}.network_id`);
  } catch {
    networkId = "";
  }
  if (
    policy.schema_version !== 1 ||
    !networkId ||
    networkId !== policy.network_id ||
    policy.ds_asset_id !== NATIVE_SBD_ASSET_DEFINITION_ID ||
    policy.ds_scale !== 2
  ) {
    throw new TypeError(
      `${label} must use a canonical NetworkId, schema version 1, the SBD asset, and scale 2.`,
    );
  }
  const policyVersion = canonicalU64(
    policy.policy_version,
    `${label}.policy_version`,
    { positive: true },
  );
  const previousPolicyHash =
    policy.previous_policy_hash === null
      ? null
      : nativeHash32(
          policy.previous_policy_hash,
          `${label}.previous_policy_hash`,
        );
  if ((policyVersion === "1") !== (previousPolicyHash === null)) {
    throw new TypeError(
      `${label}.previous_policy_hash must be null exactly for policy version 1.`,
    );
  }
  const retailSchedule = normalizeRetailFeeSchedule(policy.retail_schedule);
  const effectiveFromMs = jsonInteger(
    policy.effective_from_ms,
    `${label}.effective_from_ms`,
    { positive: true },
  );
  // Native `u64` with no lower bound: Torii admits a zero notice time, so
  // list/detail reads must accept it. Wallet-authored revisions additionally
  // require a published notice (see `validateValidationFeePolicy`).
  const noticePublishedAtMs = jsonInteger(
    policy.notice_published_at_ms,
    `${label}.notice_published_at_ms`,
  );
  const activationError = validationFeeActivationError(
    noticePublishedAtMs,
    effectiveFromMs,
  );
  if (activationError) throw new TypeError(activationError);
  const fee = canonicalValidationFeeQuantity(policy.fee, `${label}.fee`);
  const treasuryAccountId = requiredText(
    policy.treasury_account_id,
    `${label}.treasury_account_id`,
  );
  const chargingMode = exactChargingMode(policy.charging_mode);
  if (
    !Array.isArray(policy.exemption_classes) ||
    policy.exemption_classes.length !== 1 ||
    policy.exemption_classes[0] !== VALIDATION_FEE_TREASURY_PAYOUT_EXEMPTION
  ) {
    throw new TypeError(
      `${label}.exemption_classes must be exactly ["${VALIDATION_FEE_TREASURY_PAYOUT_EXEMPTION}"].`,
    );
  }
  const rewardCustody = normalizeValidationFeeRewardCustody(
    policy.reward_custody,
  );
  if (rewardCustody.treasury_account_id !== treasuryAccountId) {
    throw new TypeError(
      `${label} treasury and fee asset must match its immutable reward custody.`,
    );
  }
  return {
    schema_version: 1,
    network_id: networkId,
    policy_version: policyVersion,
    previous_policy_hash: previousPolicyHash,
    ds_asset_id: NATIVE_SBD_ASSET_DEFINITION_ID,
    ds_scale: 2,
    retail_schedule: retailSchedule,
    effective_from_ms: effectiveFromMs,
    notice_published_at_ms: noticePublishedAtMs,
    fee,
    treasury_account_id: treasuryAccountId,
    charging_mode: chargingMode,
    exemption_classes: [VALIDATION_FEE_TREASURY_PAYOUT_EXEMPTION],
    reward_custody: rewardCustody,
  };
};

export const normalizeGovernanceProposalKind = (
  raw: unknown,
): GovernanceProposalKind => {
  const envelope = exactRecord(
    raw,
    ["kind", "payload"],
    "Governance proposal kind",
  );
  if (!isRecord(envelope.payload)) {
    throw new TypeError("Governance proposal kind.payload must be an object.");
  }
  const payload = envelope.payload;
  if (envelope.kind === "ValidationFeePolicy") {
    const source = exactRecord(
      payload,
      ["policy", "proposal_operator"],
      "ValidationFeePolicy proposal payload",
    );
    return {
      type: "ValidationFeePolicy",
      proposalOperator: requiredText(
        source.proposal_operator,
        "ValidationFeePolicy proposal payload.proposal_operator",
      ),
      policy: normalizeValidationFeePolicy(source.policy),
      raw: envelope,
    };
  }
  if (envelope.kind === "ValidationFeePayoutLifecycle") {
    const source = exactRecord(
      payload,
      ["payout_binding", "proposal_operator"],
      "ValidationFeePayoutLifecycle proposal payload",
    );
    return {
      type: "ValidationFeePayoutLifecycle",
      proposalOperator: requiredText(
        source.proposal_operator,
        "ValidationFeePayoutLifecycle proposal payload.proposal_operator",
      ),
      payoutBinding: normalizeValidationFeePayoutBinding(source.payout_binding),
      raw: envelope,
    };
  }
  throw new TypeError(
    "The typed validation-fee proposal API returned a non-validation-fee ProposalKind.",
  );
};

export type GovernanceProposalIdResolver = (
  input: Readonly<{
    proposer: string;
    kind: GovernanceProposalKind;
  }>,
) => string;

interface NormalizedProposalRecord {
  summary: GovernanceProposalSummary;
  kind: GovernanceProposalKind;
}

const exactProposalStatus = (value: unknown): GovernanceProposalStatus => {
  switch (value) {
    case "Proposed":
    case "Rejected":
    case "Enacted":
    case "Superseded":
    case "ExecutionFailed":
      return value;
    default:
      throw new TypeError(
        "Governance proposal status is outside ValidationFeeProposalStatusV1.",
      );
  }
};

const normalizeProposalRecord = (
  raw: unknown,
  label: string,
  resolveProposalId: GovernanceProposalIdResolver,
): NormalizedProposalRecord => {
  const proposal = exactRecord(
    raw,
    ["created_height", "kind", "proposer", "status"],
    label,
  );
  const proposer = requiredText(proposal.proposer, `${label}.proposer`);
  const kind = normalizeGovernanceProposalKind(proposal.kind);
  if (kind.proposalOperator !== proposer) {
    throw new TypeError(
      `${label}.kind proposal_operator differs from the retained proposer.`,
    );
  }
  const rawProposalId = fixedBytes32(
    resolveProposalId({ proposer, kind }),
    `${label} native proposal fingerprint`,
  );
  return {
    summary: {
      proposalId: `0x${rawProposalId}`,
      proposer,
      createdHeight: exactJsonU64(
        proposal.created_height,
        `${label}.created_height`,
      ),
      status: exactProposalStatus(proposal.status),
      kindType: kind.type,
      kindLabelKey: GOVERNANCE_KIND_ADAPTERS[kind.type].labelKey,
    },
    kind,
  };
};

export const normalizeGovernanceProposalList = (
  raw: unknown,
  resolveProposalId: GovernanceProposalIdResolver,
): GovernanceProposalList => {
  const page = exactRecord(
    raw,
    ["limit", "next_cursor", "proposals", "version"],
    "Governance proposal list",
  );
  if (page.version !== 1) {
    throw new TypeError("Governance proposal list.version must be 1.");
  }
  const limit = exactJsonU32(page.limit, "Governance proposal list.limit");
  if (limit < 1 || limit > 100) {
    throw new TypeError(
      "Governance proposal list.limit must be between 1 and 100.",
    );
  }
  if (!Array.isArray(page.proposals) || page.proposals.length > limit) {
    throw new TypeError(
      "Governance proposal list.proposals must be bounded by limit.",
    );
  }
  const proposals = page.proposals.map((item, index) =>
    normalizeProposalRecord(
      item,
      `Governance proposal list.proposals[${index}]`,
      resolveProposalId,
    ),
  );
  const seen = new Set<string>();
  for (let index = 0; index < proposals.length; index += 1) {
    const current = proposals[index].summary;
    if (seen.has(current.proposalId)) {
      throw new TypeError("Governance proposal list contains a duplicate ID.");
    }
    seen.add(current.proposalId);
    if (index === 0) continue;
    const previous = proposals[index - 1].summary;
    if (
      previous.createdHeight > current.createdHeight ||
      (previous.createdHeight === current.createdHeight &&
        previous.proposalId >= current.proposalId)
    ) {
      throw new TypeError(
        "Governance proposal list must be ordered by created_height then native proposal fingerprint.",
      );
    }
  }
  const nextCursor =
    page.next_cursor === null
      ? null
      : typeof page.next_cursor === "string" &&
          LOWER_CURSOR_V1.test(page.next_cursor)
        ? page.next_cursor
        : (() => {
            throw new TypeError(
              "Governance proposal list.next_cursor must be null or the exact 96-character lowercase V1 cursor.",
            );
          })();
  if (nextCursor !== null && proposals.length === 0) {
    throw new TypeError(
      "Governance proposal list cannot advance from an empty page.",
    );
  }
  return {
    items: proposals.map(({ summary }) => summary),
    nextCursor,
    limit,
  };
};

const normalizeGovernanceCertificate = (
  raw: unknown,
  proposalId: string,
): GovernanceCertificateView | null => {
  if (raw === null) return null;
  throw new TypeError(
    `Governance certificate for proposal ${proposalId} is unavailable until the current public Iroha SDK exports its exact GovernanceCertificateV1 normalizer.`,
  );
};

export const normalizeGovernanceProposalDetail = (
  raw: unknown,
  proposalId: string,
  resolveProposalId: GovernanceProposalIdResolver,
): GovernanceProposalDetail => {
  const detail = exactRecord(
    raw,
    ["current_height", "governance_certificate", "proposal", "version"],
    "Governance proposal detail",
  );
  if (detail.version !== 1) {
    throw new TypeError("Governance proposal detail.version must be 1.");
  }
  const expectedId = canonicalGovernanceProposalId(proposalId);
  if (!expectedId) {
    throw new TypeError(
      "Requested governance proposal ID must be exact lowercase 32-byte hex.",
    );
  }
  const proposal = normalizeProposalRecord(
    detail.proposal,
    "Governance proposal detail.proposal",
    resolveProposalId,
  );
  if (proposal.summary.proposalId !== expectedId) {
    throw new TypeError(
      "Governance proposal detail does not match the requested native fingerprint.",
    );
  }
  const currentHeight = canonicalU64(
    detail.current_height,
    "Governance proposal detail.current_height",
  );
  if (BigInt(proposal.summary.createdHeight) > BigInt(currentHeight)) {
    throw new TypeError(
      "Governance proposal creation height exceeds current_height.",
    );
  }
  const governanceCertificate = normalizeGovernanceCertificate(
    detail.governance_certificate,
    expectedId,
  );
  if (
    governanceCertificate !== null &&
    BigInt(governanceCertificate.certifiedAtHeight) > BigInt(currentHeight)
  ) {
    throw new TypeError(
      "Governance certificate certification height exceeds current_height.",
    );
  }
  if (
    proposal.summary.status === "Enacted" &&
    (governanceCertificate === null ||
      BigInt(governanceCertificate.enactAtHeight) > BigInt(currentHeight))
  ) {
    throw new TypeError(
      "An enacted governance proposal requires a due certificate at or before current_height.",
    );
  }
  return {
    summary: proposal.summary,
    kind: proposal.kind,
    currentHeight,
    governanceCertificate,
    raw: detail,
  };
};

export interface ValidationFeeRegistryHeadContext {
  /** Effective policy currently projected by the verified registry. */
  effective: ValidationFeePolicyPayload;
  /** Registry head; `policyVersion` is null when a scheduled revision is pending. */
  registryHead: Readonly<{ policyHash: string; policyVersion: string | null }>;
}

/**
 * Composer-side checks for the next contiguous retail policy revision, mirroring
 * the native proposal admission: contiguous version and predecessor hash,
 * advancing calendar activation, and immutable treasury and reward custody.
 * With `nowMs`, the ledger enactment window is checked against that clock too.
 */
export const validateValidationFeePolicy = (
  policy: ValidationFeePolicyPayload,
  context: ValidationFeeRegistryHeadContext | null,
  options: Readonly<{ nowMs?: number }> = {},
): string[] => {
  if (!context) {
    return [
      "Validation-fee policy proposals require locally verified consensus proof state.",
    ];
  }
  const { effective, registryHead } = context;
  if (registryHead.policyVersion === null) {
    return [
      "A scheduled validation-fee revision is pending; wait until it becomes effective before proposing another revision.",
    ];
  }
  let normalized: ValidationFeePolicyPayload;
  try {
    normalized = normalizeValidationFeePolicy(policy);
  } catch (error) {
    return [
      error instanceof Error
        ? error.message
        : "Validation-fee policy is outside the exact native V1 contract.",
    ];
  }
  const errors: string[] = [];
  let expectedVersion: string | null = null;
  try {
    const next = BigInt(registryHead.policyVersion) + 1n;
    if (next <= MAX_U64) expectedVersion = next.toString();
  } catch {
    expectedVersion = null;
  }
  if (
    expectedVersion === null ||
    normalized.policy_version !== expectedVersion ||
    normalized.previous_policy_hash !== registryHead.policyHash.toUpperCase()
  ) {
    errors.push(
      "Validation-fee policy must extend the verified registry head with the next version and its policy hash.",
    );
  }
  if (normalized.effective_from_ms <= effective.effective_from_ms) {
    errors.push(
      "Validation-fee activation must advance beyond the effective policy.",
    );
  }
  // The ledger admits a zero notice time, but CBSI Core refuses to project
  // such a policy, so a wallet-authored revision must carry a real notice.
  if (normalized.notice_published_at_ms <= 0) {
    errors.push("Validation-fee notice must be a published timestamp.");
  }
  if (
    normalized.network_id !== effective.network_id ||
    normalized.treasury_account_id !== effective.treasury_account_id ||
    JSON.stringify(normalized.reward_custody) !==
      JSON.stringify(effective.reward_custody)
  ) {
    errors.push(
      "Validation-fee network, treasury, and reward custody are immutable across revisions.",
    );
  }
  if (options.nowMs !== undefined) {
    const enactmentError = validationFeeEnactmentWindowError(
      normalized,
      options.nowMs,
    );
    if (enactmentError) errors.push(enactmentError);
  }
  return errors;
};

/** Earliest activation instant that keeps the native notice and ordering rules. */
export const earliestValidationFeeActivationMs = (
  noticePublishedAtMs: number,
  currentEffectiveFromMs: number,
): number =>
  Math.max(
    noticePublishedAtMs + VALIDATION_FEE_NOTICE_MS,
    currentEffectiveFromMs + 1,
  );

/** Selectable Honiara month starts for the next revision's activation. */
export const validationFeeActivationChoices = (
  noticePublishedAtMs: number,
  currentEffectiveFromMs: number,
  count: number,
): number[] =>
  noticePublishedAtMs > 0
    ? honiaraMonthStartsFrom(
        earliestValidationFeeActivationMs(
          noticePublishedAtMs,
          currentEffectiveFromMs,
        ),
        count,
      )
    : [];

/**
 * Draft the next contiguous retail revision from a verified policy view:
 * the immutable network, treasury and reward custody; the registry head hash
 * (uppercase native bytes) and next version; the current tariff as the
 * editable starting point; the given notice time; and the earliest valid
 * Honiara activation month.
 */
export const draftNextValidationFeePolicy = (
  view: GovernanceValidationFeePolicyView,
  input: Readonly<{ networkId: string; noticePublishedAtMs: number }>,
): ValidationFeePolicyPayload => {
  const effective = view.effective;
  const headVersion = view.registryHead.policyVersion;
  const [effectiveFromMs = 0] = validationFeeActivationChoices(
    input.noticePublishedAtMs,
    effective.effective_from_ms,
    1,
  );
  return {
    schema_version: 1,
    network_id: input.networkId,
    policy_version:
      headVersion === null ? "" : (BigInt(headVersion) + 1n).toString(),
    previous_policy_hash: view.registryHead.policyHash.toUpperCase(),
    ds_asset_id: NATIVE_SBD_ASSET_DEFINITION_ID,
    ds_scale: 2,
    retail_schedule: {
      included_payments: effective.retail_schedule.included_payments,
      overage_minor: effective.retail_schedule.overage_minor,
      maintenance_tiers: effective.retail_schedule.maintenance_tiers.map(
        (tier) => ({ ...tier }),
      ),
    },
    effective_from_ms: effectiveFromMs,
    notice_published_at_ms: input.noticePublishedAtMs,
    fee: effective.fee,
    treasury_account_id: effective.treasury_account_id,
    charging_mode: {
      charging_mode: VALIDATION_FEE_CHARGING_MODE,
      value: null,
    },
    exemption_classes: [VALIDATION_FEE_TREASURY_PAYOUT_EXEMPTION],
    reward_custody: { ...effective.reward_custody },
  };
};

/** Append one tier above the last (bounded by the native 32-tier limit). */
export const appendRetailMaintenanceTier = (
  tiers: RetailMaintenanceTierPayload[],
): RetailMaintenanceTierPayload[] => {
  if (tiers.length >= RETAIL_MAINTENANCE_TIER_LIMIT) return tiers;
  const last = tiers[tiers.length - 1];
  const lastMinimum = Number.isSafeInteger(last?.minimum_average_balance_minor)
    ? last.minimum_average_balance_minor
    : 0;
  const lastFee = Number.isSafeInteger(last?.monthly_fee_minor)
    ? last.monthly_fee_minor
    : 1;
  return [
    ...tiers,
    {
      minimum_average_balance_minor: lastMinimum + 1,
      monthly_fee_minor: lastFee,
    },
  ];
};

/** Remove one tier; the mandatory zero-threshold first tier stays. */
export const removeRetailMaintenanceTier = (
  tiers: RetailMaintenanceTierPayload[],
  index: number,
): RetailMaintenanceTierPayload[] =>
  tiers.length <= 1 || index <= 0 || index >= tiers.length
    ? tiers
    : tiers.filter((_, position) => position !== index);

export interface GovernanceValidationFeePolicyView {
  /** Finalized ledger height observed by the verified projection. */
  observedHeight: string;
  /** Authenticated timestamp of that finalized block (Unix ms). */
  observedAtMs: number;
  effective: ValidationFeePolicyPayload;
  /** Lowercase Iroha hash of the effective policy. */
  effectivePolicyHash: string;
  registryHead: {
    policyHash: string;
    /** Known only while the head is the effective policy. */
    policyVersion: string | null;
  };
  verifiedProof: {
    schema: "cbsi.validation-fee-ledger-projection.v1";
    authorizationModel: "SORA_PARLIAMENT_V1";
    registrySnapshotHash: string;
    finalizedBlockHash: string;
    finalizedContextId: string;
    trustedCheckpointHeight: string;
    trustedCheckpointContextId: string;
  };
}

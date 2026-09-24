import { blake3 } from "@noble/hashes/blake3.js";
import {
  AccountAddress,
  encodeI105AccountAddress,
} from "@iroha/iroha-js/address";
import { domainToASCII } from "node:url";

export interface SubscriptionPlanListItemResponse {
  plan_id: string;
  plan: Record<string, unknown>;
}

export interface SubscriptionPlanListResponse {
  items: SubscriptionPlanListItemResponse[];
  total: number;
}

export interface SubscriptionListItemResponse {
  subscription_id: string;
  subscription: Record<string, unknown>;
  invoice: Record<string, unknown> | null;
  plan: Record<string, unknown> | null;
}

export interface SubscriptionListResponse {
  items: SubscriptionListItemResponse[];
  total: number;
}

export interface SubscriptionActionResponse {
  ok: true;
  subscription_id: string;
  tx_hash_hex: string;
  billing_trigger_id?: string;
  usage_trigger_id?: string | null;
  first_charge_ms?: number;
}

const TRANSACTION_HASH_RE = /^[0-9a-f]{64}$/u;
const CANONICAL_HASH_LITERAL_RE = /^hash:([0-9A-F]{64})#([0-9A-F]{4})$/u;
const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BASE58_INDEX = new Map(
  Array.from(BASE58_ALPHABET, (character, index) => [character, index]),
);
const ASSET_DEFINITION_ADDRESS_VERSION = 1;
const ASSET_DEFINITION_ADDRESS_LENGTH = 21;
const MAX_U8 = 0xff;
const MAX_U32 = 0xffff_ffff;
const MAX_QUANTITY_MANTISSA = (1n << 511n) - 1n;
const MAX_SUBSCRIPTION_PAGE_ITEMS = 500;
const MAX_USAGE_ACCUMULATED_KEYS = 256;
const CANONICAL_QUANTITY_RE = /^(?:0|[1-9][0-9]*)(?:\.(?:[0-9]{0,27}[1-9]))?$/u;
const DOMAIN_LABEL_RE = /^(?!-)[a-z0-9_-]{1,63}(?<!-)$/u;
const SUBSCRIPTION_STATUS_VALUES = [
  "active",
  "paused",
  "past_due",
  "canceled",
  "suspended",
] as const;
const INVOICE_STATUS_VALUES = ["paid", "failed"] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const hasOwn = (value: Record<string, unknown>, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

const requireRecord = (
  value: unknown,
  label: string,
): Record<string, unknown> => {
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value;
};

const requireExactKeys = (
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
  label: string,
) => {
  const expected = new Set(expectedKeys);
  const actual = Object.keys(value);
  const missing = expectedKeys.filter((key) => !hasOwn(value, key));
  const unexpected = actual.filter((key) => !expected.has(key));
  if (missing.length > 0 || unexpected.length > 0) {
    const detail = [
      missing.length > 0 ? `missing ${missing.join(", ")}` : "",
      unexpected.length > 0 ? `unexpected ${unexpected.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("; ");
    throw new Error(`${label} has invalid fields (${detail}).`);
  }
};

const requireCanonicalText = (value: unknown, label: string): string => {
  if (typeof value !== "string" || !value || value.trim() !== value) {
    throw new Error(`${label} must be a canonical non-empty string.`);
  }
  return value;
};

const requireBoolean = (value: unknown, label: string): boolean => {
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be a boolean.`);
  }
  return value;
};

const requireNonNegativeSafeInteger = (
  value: unknown,
  label: string,
): number => {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < 0 ||
    Object.is(value, -0)
  ) {
    throw new Error(`${label} must be a non-negative safe integer.`);
  }
  return value as number;
};

const requireBoundedInteger = (
  value: unknown,
  label: string,
  maximum: number,
): number => {
  const integer = requireNonNegativeSafeInteger(value, label);
  if (integer > maximum) {
    throw new Error(`${label} must be at most ${maximum}.`);
  }
  return integer;
};

const requireNullableNonNegativeSafeInteger = (
  value: unknown,
  label: string,
): number | null =>
  value === null ? null : requireNonNegativeSafeInteger(value, label);

const requireCanonicalName = (value: unknown, label: string): string => {
  const name = requireCanonicalText(value, label);
  if (
    /\p{White_Space}/u.test(name) ||
    /[@#$]/u.test(name) ||
    name.normalize("NFC") !== name
  ) {
    throw new Error(
      `${label} must be a canonical NFC Iroha Name without whitespace or reserved separators.`,
    );
  }
  return name;
};

const requireCanonicalDomainLabel = (value: string, label: string): string => {
  const hasReservedMiddleHyphens =
    value.length >= 4 &&
    value[2] === "-" &&
    value[3] === "-" &&
    !value.startsWith("xn--");
  if (
    !DOMAIN_LABEL_RE.test(value) ||
    hasReservedMiddleHyphens ||
    domainToASCII(value) !== value
  ) {
    throw new Error(`${label} must be a canonical Iroha domain label.`);
  }
  return value;
};

const requireCanonicalNftId = (value: unknown, label: string): string => {
  const literal = requireCanonicalText(value, label);
  const parts = literal.split("$");
  if (parts.length !== 2) {
    throw new Error(
      `${label} must use the canonical name$domain.dataspace form.`,
    );
  }
  requireCanonicalName(parts[0], `${label} name`);
  const domainParts = parts[1]!.split(".");
  if (domainParts.length !== 2) {
    throw new Error(
      `${label} must use the canonical name$domain.dataspace form.`,
    );
  }
  requireCanonicalDomainLabel(domainParts[0]!, `${label} domain`);
  requireCanonicalDomainLabel(domainParts[1]!, `${label} dataspace`);
  return literal;
};

const requireCanonicalAccountId = (value: unknown, label: string): string => {
  const literal = requireCanonicalText(value, label);
  try {
    const parsed = AccountAddress.parseEncoded(literal);
    if (!Number.isInteger(parsed.chainDiscriminant)) {
      throw new Error("missing I105 chain discriminant");
    }
    const canonical = encodeI105AccountAddress(
      parsed.address.canonicalBytes(),
      {
        chainDiscriminant: parsed.chainDiscriminant,
      },
    );
    if (canonical !== literal) {
      throw new Error("noncanonical I105 spelling");
    }
  } catch {
    throw new Error(`${label} must be a canonical I105 account ID.`);
  }
  return literal;
};

const decodeBase58 = (literal: string): Uint8Array | null => {
  let numeric = 0n;
  for (const character of literal) {
    const digit = BASE58_INDEX.get(character);
    if (digit === undefined) return null;
    numeric = numeric * 58n + BigInt(digit);
  }

  const reversed: number[] = [];
  while (numeric > 0n) {
    reversed.push(Number(numeric & 0xffn));
    numeric >>= 8n;
  }
  const leadingZeroes = Array.from(literal).findIndex(
    (character) => character !== "1",
  );
  const zeroCount = leadingZeroes === -1 ? literal.length : leadingZeroes;
  return Uint8Array.from([
    ...Array.from({ length: zeroCount }, () => 0),
    ...reversed.reverse(),
  ]);
};

const bytesEqual = (left: Uint8Array, right: Uint8Array): boolean =>
  left.length === right.length &&
  left.every((value, index) => value === right[index]);

const requireCanonicalAssetDefinitionId = (
  value: unknown,
  label: string,
): string => {
  const literal = requireCanonicalText(value, label);
  const payload = decodeBase58(literal);
  if (
    !payload ||
    payload.length !== ASSET_DEFINITION_ADDRESS_LENGTH ||
    payload[0] !== ASSET_DEFINITION_ADDRESS_VERSION
  ) {
    throw new Error(`${label} must be a canonical Base58 asset definition ID.`);
  }

  const uuid = payload.slice(1, 17);
  const hasUuidV4Version = (uuid[6]! & 0xf0) === 0x40;
  const hasUuidVariant = (uuid[8]! & 0xc0) === 0x80;
  const checksum = blake3(payload.slice(0, 17)).slice(0, 4);
  if (
    !hasUuidV4Version ||
    !hasUuidVariant ||
    !bytesEqual(checksum, payload.slice(17))
  ) {
    throw new Error(`${label} must be a canonical Base58 asset definition ID.`);
  }
  return literal;
};

const requireCanonicalQuantity = (value: unknown, label: string): string => {
  if (typeof value !== "string" || !CANONICAL_QUANTITY_RE.test(value)) {
    throw new Error(
      `${label} must be a canonical non-negative Quantity string.`,
    );
  }
  const mantissaText = value.replace(".", "").replace(/^0+/u, "") || "0";
  if (
    mantissaText.length > 154 ||
    BigInt(mantissaText) > MAX_QUANTITY_MANTISSA
  ) {
    throw new Error(`${label} exceeds the canonical Quantity range.`);
  }
  return value;
};

const crc16 = (value: string): number => {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(value)) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc =
        (crc & 0x8000) !== 0
          ? ((crc << 1) ^ 0x1021) & 0xffff
          : (crc << 1) & 0xffff;
    }
  }
  return crc;
};

const requireCanonicalHashLiteral = (
  value: unknown,
  label: string,
): string | null => {
  if (value === null) return null;
  const literal = requireCanonicalText(value, label);
  const match = CANONICAL_HASH_LITERAL_RE.exec(literal);
  if (!match) {
    throw new Error(`${label} must be a canonical hash literal or null.`);
  }
  const expectedChecksum = crc16(`hash:${match[1]}`)
    .toString(16)
    .toUpperCase()
    .padStart(4, "0");
  if (match[2] !== expectedChecksum) {
    throw new Error(`${label} has an invalid hash literal checksum.`);
  }
  return literal;
};

const requireTaggedUnitEnum = <TValue extends string>(
  value: unknown,
  tag: string,
  allowedValues: readonly TValue[],
  label: string,
): Record<string, unknown> => {
  const record = requireRecord(value, label);
  requireExactKeys(record, [tag, "value"], label);
  if (
    typeof record[tag] !== "string" ||
    !allowedValues.includes(record[tag] as TValue)
  ) {
    throw new Error(
      `${label}.${tag} must be one of ${allowedValues.join(", ")}.`,
    );
  }
  if (record.value !== null) {
    throw new Error(`${label}.value must be null.`);
  }
  return { [tag]: record[tag], value: null };
};

const decodeSubscriptionCadence = (
  value: unknown,
  label: string,
): Record<string, unknown> => {
  const cadence = requireRecord(value, label);
  requireExactKeys(cadence, ["kind", "detail"], label);
  const detail = requireRecord(cadence.detail, `${label}.detail`);
  if (cadence.kind === "monthly_calendar") {
    requireExactKeys(
      detail,
      ["anchor_day", "anchor_time_ms"],
      `${label}.detail`,
    );
    const anchorDay = requireBoundedInteger(
      detail.anchor_day,
      `${label}.detail.anchor_day`,
      MAX_U8,
    );
    const anchorTimeMs = requireBoundedInteger(
      detail.anchor_time_ms,
      `${label}.detail.anchor_time_ms`,
      MAX_U32,
    );
    if (anchorDay < 1 || anchorDay > 31) {
      throw new Error(`${label}.detail.anchor_day must be between 1 and 31.`);
    }
    if (anchorTimeMs >= 86_400_000) {
      throw new Error(
        `${label}.detail.anchor_time_ms must be within one UTC day.`,
      );
    }
    return {
      kind: "monthly_calendar",
      detail: { anchor_day: anchorDay, anchor_time_ms: anchorTimeMs },
    };
  }
  if (cadence.kind === "fixed_period") {
    requireExactKeys(detail, ["period_ms"], `${label}.detail`);
    const periodMs = requireNonNegativeSafeInteger(
      detail.period_ms,
      `${label}.detail.period_ms`,
    );
    if (periodMs === 0) {
      throw new Error(`${label}.detail.period_ms must be greater than zero.`);
    }
    return { kind: "fixed_period", detail: { period_ms: periodMs } };
  }
  throw new Error(
    `${label}.kind must be "monthly_calendar" or "fixed_period".`,
  );
};

const decodeSubscriptionBilling = (
  value: unknown,
  label: string,
): Record<string, unknown> => {
  const billing = requireRecord(value, label);
  requireExactKeys(
    billing,
    ["cadence", "bill_for", "retry_backoff_ms", "max_failures", "grace_ms"],
    label,
  );
  return {
    cadence: decodeSubscriptionCadence(billing.cadence, `${label}.cadence`),
    bill_for: requireTaggedUnitEnum(
      billing.bill_for,
      "period",
      ["previous_period", "next_period"],
      `${label}.bill_for`,
    ),
    retry_backoff_ms: requireNonNegativeSafeInteger(
      billing.retry_backoff_ms,
      `${label}.retry_backoff_ms`,
    ),
    max_failures: requireBoundedInteger(
      billing.max_failures,
      `${label}.max_failures`,
      MAX_U32,
    ),
    grace_ms: requireNonNegativeSafeInteger(
      billing.grace_ms,
      `${label}.grace_ms`,
    ),
  };
};

const decodeSubscriptionPricing = (
  value: unknown,
  label: string,
): Record<string, unknown> => {
  const pricing = requireRecord(value, label);
  requireExactKeys(pricing, ["kind", "detail"], label);
  const detail = requireRecord(pricing.detail, `${label}.detail`);
  if (pricing.kind === "fixed") {
    requireExactKeys(detail, ["amount", "asset_definition"], `${label}.detail`);
    return {
      kind: "fixed",
      detail: {
        amount: requireCanonicalQuantity(
          detail.amount,
          `${label}.detail.amount`,
        ),
        asset_definition: requireCanonicalAssetDefinitionId(
          detail.asset_definition,
          `${label}.detail.asset_definition`,
        ),
      },
    };
  }
  if (pricing.kind === "usage") {
    requireExactKeys(
      detail,
      ["unit_price", "unit_key", "asset_definition"],
      `${label}.detail`,
    );
    return {
      kind: "usage",
      detail: {
        unit_price: requireCanonicalQuantity(
          detail.unit_price,
          `${label}.detail.unit_price`,
        ),
        unit_key: requireCanonicalName(
          detail.unit_key,
          `${label}.detail.unit_key`,
        ),
        asset_definition: requireCanonicalAssetDefinitionId(
          detail.asset_definition,
          `${label}.detail.asset_definition`,
        ),
      },
    };
  }
  throw new Error(`${label}.kind must be "fixed" or "usage".`);
};

const decodeSubscriptionPlan = (
  value: unknown,
  label: string,
): Record<string, unknown> => {
  const plan = requireRecord(value, label);
  requireExactKeys(plan, ["provider", "billing", "pricing"], label);
  return {
    provider: requireCanonicalAccountId(plan.provider, `${label}.provider`),
    billing: decodeSubscriptionBilling(plan.billing, `${label}.billing`),
    pricing: decodeSubscriptionPricing(plan.pricing, `${label}.pricing`),
  };
};

const decodeUsageAccumulated = (
  value: unknown,
  label: string,
): Record<string, string> => {
  const usage = requireRecord(value, label);
  const entries = Object.entries(usage);
  if (entries.length > MAX_USAGE_ACCUMULATED_KEYS) {
    throw new Error(
      `${label} exceeds the first-release limit of ${MAX_USAGE_ACCUMULATED_KEYS} keys.`,
    );
  }
  const decoded: Array<[string, string]> = [];
  for (const [key, quantity] of entries) {
    const canonicalKey = requireCanonicalName(key, `${label} key`);
    decoded.push([
      canonicalKey,
      requireCanonicalQuantity(quantity, `${label}.${canonicalKey}`),
    ]);
  }
  return Object.fromEntries(decoded);
};

const decodeSubscriptionState = (
  value: unknown,
  label: string,
): Record<string, unknown> => {
  const state = requireRecord(value, label);
  requireExactKeys(
    state,
    [
      "plan_id",
      "provider",
      "subscriber",
      "status",
      "current_period_start_ms",
      "current_period_end_ms",
      "next_charge_ms",
      "cancel_at_period_end",
      "cancel_at_ms",
      "failure_count",
      "usage_accumulated",
      "billing_trigger_id",
    ],
    label,
  );
  return {
    plan_id: requireCanonicalAssetDefinitionId(
      state.plan_id,
      `${label}.plan_id`,
    ),
    provider: requireCanonicalAccountId(state.provider, `${label}.provider`),
    subscriber: requireCanonicalAccountId(
      state.subscriber,
      `${label}.subscriber`,
    ),
    status: requireTaggedUnitEnum(
      state.status,
      "status",
      SUBSCRIPTION_STATUS_VALUES,
      `${label}.status`,
    ),
    current_period_start_ms: requireNonNegativeSafeInteger(
      state.current_period_start_ms,
      `${label}.current_period_start_ms`,
    ),
    current_period_end_ms: requireNonNegativeSafeInteger(
      state.current_period_end_ms,
      `${label}.current_period_end_ms`,
    ),
    next_charge_ms: requireNonNegativeSafeInteger(
      state.next_charge_ms,
      `${label}.next_charge_ms`,
    ),
    cancel_at_period_end: requireBoolean(
      state.cancel_at_period_end,
      `${label}.cancel_at_period_end`,
    ),
    cancel_at_ms: requireNullableNonNegativeSafeInteger(
      state.cancel_at_ms,
      `${label}.cancel_at_ms`,
    ),
    failure_count: requireBoundedInteger(
      state.failure_count,
      `${label}.failure_count`,
      MAX_U32,
    ),
    usage_accumulated: decodeUsageAccumulated(
      state.usage_accumulated,
      `${label}.usage_accumulated`,
    ),
    billing_trigger_id: requireCanonicalName(
      state.billing_trigger_id,
      `${label}.billing_trigger_id`,
    ),
  };
};

const decodeSubscriptionInvoice = (
  value: unknown,
  label: string,
): Record<string, unknown> => {
  const invoice = requireRecord(value, label);
  requireExactKeys(
    invoice,
    [
      "subscription_nft_id",
      "period_start_ms",
      "period_end_ms",
      "attempted_at_ms",
      "amount",
      "asset_definition",
      "status",
      "tx_hash",
    ],
    label,
  );
  return {
    subscription_nft_id: requireCanonicalNftId(
      invoice.subscription_nft_id,
      `${label}.subscription_nft_id`,
    ),
    period_start_ms: requireNonNegativeSafeInteger(
      invoice.period_start_ms,
      `${label}.period_start_ms`,
    ),
    period_end_ms: requireNonNegativeSafeInteger(
      invoice.period_end_ms,
      `${label}.period_end_ms`,
    ),
    attempted_at_ms: requireNonNegativeSafeInteger(
      invoice.attempted_at_ms,
      `${label}.attempted_at_ms`,
    ),
    amount: requireCanonicalQuantity(invoice.amount, `${label}.amount`),
    asset_definition: requireCanonicalAssetDefinitionId(
      invoice.asset_definition,
      `${label}.asset_definition`,
    ),
    status: requireTaggedUnitEnum(
      invoice.status,
      "status",
      INVOICE_STATUS_VALUES,
      `${label}.status`,
    ),
    tx_hash: requireCanonicalHashLiteral(invoice.tx_hash, `${label}.tx_hash`),
  };
};

const requireExactPagination = (
  payload: Record<string, unknown>,
  itemCount: number,
  label: string,
): number => {
  const total = requireNonNegativeSafeInteger(payload.total, `${label}.total`);
  if (typeof payload.has_more !== "boolean") {
    throw new Error(`${label}.has_more must be a boolean.`);
  }
  if (payload.count_mode !== "exact") {
    throw new Error(`${label}.count_mode must be "exact".`);
  }
  if (total < itemCount) {
    throw new Error(`${label} pagination metadata does not match its items.`);
  }
  return total;
};

const decodePlanListItem = (
  value: unknown,
  index: number,
): SubscriptionPlanListItemResponse => {
  const label = `Subscription plans.items[${index}]`;
  const item = requireRecord(value, label);
  requireExactKeys(item, ["plan_id", "plan"], label);
  return {
    plan_id: requireCanonicalAssetDefinitionId(
      item.plan_id,
      `${label}.plan_id`,
    ),
    plan: decodeSubscriptionPlan(item.plan, `${label}.plan`),
  };
};

export const decodeSubscriptionPlanListResponse = (
  value: unknown,
): SubscriptionPlanListResponse => {
  const label = "Subscription plans response";
  const payload = requireRecord(value, label);
  requireExactKeys(
    payload,
    ["items", "total", "has_more", "count_mode"],
    label,
  );
  if (!Array.isArray(payload.items)) {
    throw new Error(`${label}.items must be an array.`);
  }
  if (payload.items.length > MAX_SUBSCRIPTION_PAGE_ITEMS) {
    throw new Error(
      `${label}.items exceeds the first-release page limit of ${MAX_SUBSCRIPTION_PAGE_ITEMS}.`,
    );
  }
  const items = payload.items.map(decodePlanListItem);
  return {
    items,
    total: requireExactPagination(payload, items.length, label),
  };
};

export const decodeSubscriptionListItemResponse = (
  value: unknown,
  label = "Subscription response",
): SubscriptionListItemResponse => {
  const item = requireRecord(value, label);
  requireExactKeys(
    item,
    ["subscription_id", "subscription", "invoice", "plan"],
    label,
  );
  const subscriptionId = requireCanonicalNftId(
    item.subscription_id,
    `${label}.subscription_id`,
  );
  const subscription = decodeSubscriptionState(
    item.subscription,
    `${label}.subscription`,
  );
  const invoice =
    item.invoice === null
      ? null
      : decodeSubscriptionInvoice(item.invoice, `${label}.invoice`);
  if (invoice !== null && invoice.subscription_nft_id !== subscriptionId) {
    throw new Error(
      `${label}.invoice.subscription_nft_id does not match ${label}.subscription_id.`,
    );
  }
  return {
    subscription_id: subscriptionId,
    subscription,
    invoice,
    plan:
      item.plan === null
        ? null
        : decodeSubscriptionPlan(item.plan, `${label}.plan`),
  };
};

export const decodeSubscriptionListResponse = (
  value: unknown,
): SubscriptionListResponse => {
  const label = "Subscriptions response";
  const payload = requireRecord(value, label);
  requireExactKeys(
    payload,
    ["items", "total", "has_more", "count_mode"],
    label,
  );
  if (!Array.isArray(payload.items)) {
    throw new Error(`${label}.items must be an array.`);
  }
  if (payload.items.length > MAX_SUBSCRIPTION_PAGE_ITEMS) {
    throw new Error(
      `${label}.items exceeds the first-release page limit of ${MAX_SUBSCRIPTION_PAGE_ITEMS}.`,
    );
  }
  const items = payload.items.map((item, index) =>
    decodeSubscriptionListItemResponse(
      item,
      `Subscriptions response.items[${index}]`,
    ),
  );
  return {
    items,
    total: requireExactPagination(payload, items.length, label),
  };
};

const requireSuccessfulMutationBase = (
  payload: Record<string, unknown>,
  expectedSubscriptionId: string,
  label: string,
) => {
  if (payload.ok !== true) {
    throw new Error(`${label}.ok must be true.`);
  }
  const subscriptionId = requireCanonicalText(
    payload.subscription_id,
    `${label}.subscription_id`,
  );
  if (subscriptionId !== expectedSubscriptionId) {
    throw new Error(
      `${label}.subscription_id does not match the requested subscription.`,
    );
  }
  const txHashHex = requireCanonicalText(
    payload.tx_hash_hex,
    `${label}.tx_hash_hex`,
  );
  if (!TRANSACTION_HASH_RE.test(txHashHex)) {
    throw new Error(
      `${label}.tx_hash_hex must be a canonical 32-byte lowercase hex hash.`,
    );
  }
  return { subscriptionId, txHashHex };
};

export const decodeSubscriptionCreateResponse = (
  value: unknown,
  expectedSubscriptionId: string,
): SubscriptionActionResponse => {
  const label = "Create subscription response";
  const payload = requireRecord(value, label);
  requireExactKeys(
    payload,
    [
      "ok",
      "subscription_id",
      "billing_trigger_id",
      "usage_trigger_id",
      "first_charge_ms",
      "tx_hash_hex",
    ],
    label,
  );
  const { subscriptionId, txHashHex } = requireSuccessfulMutationBase(
    payload,
    expectedSubscriptionId,
    label,
  );
  const usageTriggerId =
    payload.usage_trigger_id === null
      ? null
      : requireCanonicalText(
          payload.usage_trigger_id,
          `${label}.usage_trigger_id`,
        );
  return {
    ok: true,
    subscription_id: subscriptionId,
    tx_hash_hex: txHashHex,
    billing_trigger_id: requireCanonicalText(
      payload.billing_trigger_id,
      `${label}.billing_trigger_id`,
    ),
    usage_trigger_id: usageTriggerId,
    first_charge_ms: requireNonNegativeSafeInteger(
      payload.first_charge_ms,
      `${label}.first_charge_ms`,
    ),
  };
};

export const decodeSubscriptionActionResponse = (
  value: unknown,
  expectedSubscriptionId: string,
): SubscriptionActionResponse => {
  const label = "Subscription action response";
  const payload = requireRecord(value, label);
  requireExactKeys(payload, ["ok", "subscription_id", "tx_hash_hex"], label);
  const { subscriptionId, txHashHex } = requireSuccessfulMutationBase(
    payload,
    expectedSubscriptionId,
    label,
  );
  return {
    ok: true,
    subscription_id: subscriptionId,
    tx_hash_hex: txHashHex,
  };
};

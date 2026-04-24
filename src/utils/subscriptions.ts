import { deriveAssetSymbol } from "@/utils/assetId";

export type SubscriptionStatus =
  | "active"
  | "paused"
  | "past_due"
  | "canceled"
  | "suspended"
  | "unknown";

export type SubscriptionPricingKind = "fixed" | "usage" | "unknown";

type LocalizeFn = (
  key: string,
  params?: Record<string, string | number>,
) => string;
type FormatNumberFn = (value: number) => string;

export const SUBSCRIPTION_I18N_KEYS = {
  usageBased: "Usage based",
  unitDash: "{unit} --",
  unitAmount: "{unit} {amount}",
  unitPerUsage: "{unit} {amount} per {usage}",
  priceUnavailable: "Price unavailable",
  fixedPeriodDays: "{count} day period",
} as const;

const formatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});
const defaultFormatNumber: FormatNumberFn = (value) => formatter.format(value);

const defaultLocalize: LocalizeFn = (key, params) => {
  if (!params) {
    return key;
  }
  return key.replace(/\{([\w]+)\}/g, (_match, token) => {
    const value = params[token];
    return value === undefined ? `{${token}}` : String(value);
  });
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

export const normalizeSubscriptionStatus = (
  value: unknown,
): SubscriptionStatus => {
  const raw = isRecord(value) ? value.status : value;
  const status = String(raw ?? "")
    .trim()
    .toLowerCase();
  switch (status) {
    case "active":
    case "paused":
    case "past_due":
    case "canceled":
    case "suspended":
      return status;
    default:
      return "unknown";
  }
};

export const subscriptionStatusFromItem = (
  item: Record<string, unknown>,
): SubscriptionStatus => {
  const subscription = isRecord(item.subscription) ? item.subscription : {};
  return normalizeSubscriptionStatus(subscription.status);
};

export const subscriptionIdFromItem = (item: Record<string, unknown>): string =>
  String(item.subscription_id ?? item.subscriptionId ?? item.id ?? "").trim();

export const subscriptionPlanIdFromItem = (
  item: Record<string, unknown>,
): string => {
  const subscription = isRecord(item.subscription) ? item.subscription : {};
  return String(subscription.plan_id ?? subscription.planId ?? "").trim();
};

export const subscriptionProviderFromItem = (
  item: Record<string, unknown>,
): string => {
  const subscription = isRecord(item.subscription) ? item.subscription : {};
  return String(subscription.provider ?? "").trim();
};

export const subscriptionNextChargeMs = (
  item: Record<string, unknown>,
): number | null => {
  const subscription = isRecord(item.subscription) ? item.subscription : {};
  return normalizeTimestampMs(
    subscription.next_charge_ms ?? subscription.nextChargeMs,
  );
};

export const subscriptionPeriodEndMs = (
  item: Record<string, unknown>,
): number | null => {
  const subscription = isRecord(item.subscription) ? item.subscription : {};
  return normalizeTimestampMs(
    subscription.current_period_end_ms ?? subscription.currentPeriodEndMs,
  );
};

export const subscriptionCancelAtPeriodEnd = (
  item: Record<string, unknown>,
): boolean => {
  const subscription = isRecord(item.subscription) ? item.subscription : {};
  return Boolean(
    subscription.cancel_at_period_end ?? subscription.cancelAtPeriodEnd,
  );
};

export const subscriptionLatestInvoice = (
  item: Record<string, unknown>,
): Record<string, unknown> | null =>
  isRecord(item.invoice) ? item.invoice : null;

export const planFromSubscriptionItem = (
  item: Record<string, unknown>,
): Record<string, unknown> | null => (isRecord(item.plan) ? item.plan : null);

export const planIdFromPlanItem = (item: Record<string, unknown>): string =>
  String(item.plan_id ?? item.planId ?? item.id ?? "").trim();

export const planPayloadFromPlanItem = (
  item: Record<string, unknown>,
): Record<string, unknown> | null => (isRecord(item.plan) ? item.plan : null);

export const pricingKindFromPlan = (
  plan: Record<string, unknown> | null | undefined,
): SubscriptionPricingKind => {
  const pricing = isRecord(plan?.pricing) ? plan.pricing : {};
  const kind = String(pricing.kind ?? "")
    .trim()
    .toLowerCase();
  if (kind === "fixed" || kind === "usage") {
    return kind;
  }
  return "unknown";
};

export const planChargeAssetDefinition = (
  plan: Record<string, unknown> | null | undefined,
): string => {
  const detail = pricingDetail(plan);
  return String(
    detail.asset_definition ?? detail.assetDefinition ?? "",
  ).trim();
};

export const formatAmount = (
  amount: unknown,
  unit: string,
  localize: LocalizeFn = defaultLocalize,
  formatNumber: FormatNumberFn = defaultFormatNumber,
): string => {
  const displayAmount = formatNumericValue(amount, formatNumber);
  if (!displayAmount) {
    return localize(SUBSCRIPTION_I18N_KEYS.unitDash, { unit });
  }
  return localize(SUBSCRIPTION_I18N_KEYS.unitAmount, {
    unit,
    amount: displayAmount,
  });
};

export const formatPlanPricing = (
  plan: Record<string, unknown> | null | undefined,
  fallbackUnit: string,
  localize: LocalizeFn = defaultLocalize,
  formatNumber: FormatNumberFn = defaultFormatNumber,
): string => {
  const detail = pricingDetail(plan);
  const assetDefinitionId = planChargeAssetDefinition(plan);
  const unit = assetDefinitionId
    ? deriveAssetSymbol(assetDefinitionId, fallbackUnit)
    : fallbackUnit;
  switch (pricingKindFromPlan(plan)) {
    case "fixed":
      return formatAmount(detail.amount, unit, localize, formatNumber);
    case "usage": {
      const unitPrice = formatNumericValue(
        detail.unit_price ?? detail.unitPrice,
        formatNumber,
      );
      const unitKey = String(detail.unit_key ?? detail.unitKey ?? "").trim();
      if (!unitPrice) {
        return localize(SUBSCRIPTION_I18N_KEYS.usageBased);
      }
      return localize(SUBSCRIPTION_I18N_KEYS.unitPerUsage, {
        unit,
        amount: unitPrice,
        usage: unitKey || localize("unit"),
      });
    }
    default:
      return localize(SUBSCRIPTION_I18N_KEYS.priceUnavailable);
  }
};

export const formatPlanCadence = (
  plan: Record<string, unknown> | null | undefined,
  localize: LocalizeFn = defaultLocalize,
): string => {
  const billing = isRecord(plan?.billing) ? plan.billing : {};
  const cadence = isRecord(billing.cadence) ? billing.cadence : {};
  const kind = String(cadence.kind ?? "")
    .trim()
    .toLowerCase();
  if (kind === "monthly_calendar") {
    return localize("Monthly");
  }
  if (kind !== "fixed_period") {
    return localize("Unknown");
  }
  const detail = isRecord(cadence.detail) ? cadence.detail : {};
  const periodMs = Number(detail.period_ms ?? detail.periodMs);
  if (!Number.isFinite(periodMs) || periodMs <= 0) {
    return localize("Unknown");
  }
  const days = Math.round(periodMs / 86_400_000);
  if (days >= 27 && days <= 31) {
    return localize("Monthly");
  }
  if (days >= 89 && days <= 92) {
    return localize("Quarterly");
  }
  if (days >= 365 && days <= 366) {
    return localize("Yearly");
  }
  return localize(SUBSCRIPTION_I18N_KEYS.fixedPeriodDays, { count: days });
};

export const buildSubscriptionNftId = (
  accountId: string,
  planId: string,
  nowMs = Date.now(),
  entropy = Math.random(),
): string => {
  const seed = `${accountId}-${planId}`
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 28);
  const suffix = Math.floor(Math.max(0, Math.min(0.999999999, entropy)) * 0xffffffff)
    .toString(16)
    .padStart(8, "0");
  return `sub_${seed || "wallet"}_${Math.trunc(nowMs).toString(36)}_${suffix}$subscriptions.universal`;
};

const pricingDetail = (
  plan: Record<string, unknown> | null | undefined,
): Record<string, unknown> => {
  const pricing = isRecord(plan?.pricing) ? plan.pricing : {};
  return isRecord(pricing.detail) ? pricing.detail : {};
};

const normalizeTimestampMs = (value: unknown): number | null => {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) && timestamp > 0
    ? Math.trunc(timestamp)
    : null;
};

const formatNumericValue = (
  value: unknown,
  formatNumber: FormatNumberFn,
): string => {
  if (value === null || value === undefined || value === "") {
    return "";
  }
  const raw = String(value).trim();
  const parsed = Number(raw);
  if (
    Number.isFinite(parsed) &&
    Math.abs(parsed) <= Number.MAX_SAFE_INTEGER
  ) {
    return formatNumber(parsed);
  }
  return raw;
};

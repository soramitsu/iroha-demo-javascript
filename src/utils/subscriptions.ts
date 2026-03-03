export type SubscriptionCadence = "monthly" | "quarterly" | "yearly";
export type SubscriptionStatus = "active" | "paused" | "canceled";
export type SubscriptionAmountType = "fixed" | "variable";

export type SubscriptionRecord = {
  id: string;
  merchant: string;
  amount: number | null;
  maxAmount: number | null;
  amountType: SubscriptionAmountType;
  cadence: SubscriptionCadence;
  nextChargeAt: string;
  status: SubscriptionStatus;
  cancelAtPeriodEnd: boolean;
  lastChargeAt: string | null;
  lastChargeAmount: number | null;
  note: string | null;
};

const CADENCE_MONTHS: Record<SubscriptionCadence, number> = {
  monthly: 1,
  quarterly: 3,
  yearly: 12,
};

const formatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});

export const advanceNextDate = (
  iso: string,
  cadence: SubscriptionCadence,
): string => {
  const date = new Date(iso);
  const base = new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      12,
      0,
      0,
      0,
    ),
  );
  base.setUTCMonth(base.getUTCMonth() + CADENCE_MONTHS[cadence]);
  return base.toISOString();
};

export const formatAmount = (
  amountType: SubscriptionAmountType,
  amount: number | null,
  maxAmount: number | null,
  unit: string,
): string => {
  if (amountType === "variable") {
    if (maxAmount != null) {
      return `Up to ${unit} ${formatter.format(maxAmount)}`;
    }
    return "Usage based";
  }
  if (amount == null) {
    return `${unit} --`;
  }
  return `${unit} ${formatter.format(amount)}`;
};

export const applyAutoDeductions = (
  records: SubscriptionRecord[],
  now: Date = new Date(),
): SubscriptionRecord[] => {
  const nowMs = now.getTime();
  return records.map((record) => {
    if (record.status !== "active") {
      return record;
    }
    let nextChargeAt = record.nextChargeAt;
    let updated: SubscriptionRecord = { ...record };
    let guard = 0;
    while (new Date(nextChargeAt).getTime() <= nowMs && guard < 24) {
      updated.lastChargeAt = nextChargeAt;
      updated.lastChargeAmount = computeChargeAmount(updated, nextChargeAt);
      if (updated.cancelAtPeriodEnd) {
        updated.status = "canceled";
        updated.cancelAtPeriodEnd = false;
        return updated;
      }
      nextChargeAt = advanceNextDate(nextChargeAt, updated.cadence);
      guard += 1;
      updated = { ...updated, nextChargeAt };
    }
    return updated;
  });
};

const computeChargeAmount = (
  record: SubscriptionRecord,
  chargeAt: string,
): number => {
  if (record.amountType === "fixed") {
    return record.amount ?? 0;
  }
  if (record.maxAmount == null) {
    return 0;
  }
  const percent = usagePercent(`${record.id}-${chargeAt}`);
  return Math.round(((record.maxAmount * percent) / 100) * 100) / 100;
};

const usagePercent = (seed: string): number => {
  const hash = hashString(seed);
  return 40 + (hash % 60);
};

const hashString = (value: string): number => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

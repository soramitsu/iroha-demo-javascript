import { normalizeCanonicalAccountIdLiteral } from "./accountAddress";
import { normalizeFirstReleaseAssetDefinitionId } from "./assetDefinitionId";

export const SUBSCRIPTION_MUTATION_DRAFT_VERSION = 1 as const;

export type SubscriptionCancelMode = "immediate" | "period_end";
export type SubscriptionActionDraftName =
  | "pause"
  | "resume"
  | "cancel"
  | "keep"
  | "charge_now";
export type SubscriptionBillingTriggerOperation =
  | "none"
  | "register"
  | "unregister"
  | "replace";

export interface SubscriptionInstructionDraft {
  wire_id: string;
  payload_hex: string;
}

export interface SubscriptionStateDraft {
  plan_id: string;
  provider: string;
  subscriber: string;
  status: {
    status: "active" | "paused" | "past_due" | "canceled" | "suspended";
    value: null;
  };
  current_period_start_ms: number;
  current_period_end_ms: number;
  next_charge_ms: number;
  cancel_at_period_end: boolean;
  cancel_at_ms: number | null;
  failure_count: number;
  usage_accumulated: Record<string, string>;
  billing_trigger_id: string;
}

interface SubscriptionPlanExpectation {
  provider: string;
  billing: {
    cadence:
      | {
          kind: "fixed_period";
          periodMs: number;
        }
      | {
          kind: "monthly_calendar";
          anchorDay: number;
          anchorTimeMs: number;
        };
    billFor: "previous_period" | "next_period";
    retryBackoffMs: number;
    maxFailures: number;
    graceMs: number;
  };
  pricing:
    | {
        kind: "fixed";
        amount: string;
        assetDefinition: string;
      }
    | {
        kind: "usage";
        unitPrice: string;
        unitKey: string;
        assetDefinition: string;
      };
}

export interface SubscriptionResolvedChargeWindow {
  requestStartedAtMs: number;
  responseReceivedAtMs: number;
  clockSkewMs: number;
}

export interface SubscriptionCreateMutationDraft {
  version: 1;
  authority: string;
  action: "create";
  subscription_id: string;
  plan_id: string;
  billing_trigger_id: string;
  usage_trigger_id: string | null;
  first_charge_ms: number;
  provider_usage_grant_included: boolean;
  resulting_subscription: SubscriptionStateDraft;
  tx_instructions: SubscriptionInstructionDraft[];
  decoded_instructions: Record<string, unknown>[];
}

export interface SubscriptionActionMutationDraft {
  version: 1;
  authority: string;
  action: SubscriptionActionDraftName;
  subscription_id: string;
  details: {
    billing_trigger_id: string;
    billing_trigger_operation: SubscriptionBillingTriggerOperation;
    effective_charge_ms: number | null;
    cancel_mode: { mode: SubscriptionCancelMode; value: null } | null;
    resulting_subscription: SubscriptionStateDraft;
  };
  tx_instructions: SubscriptionInstructionDraft[];
  decoded_instructions: Record<string, unknown>[];
}

type DecodeInstruction = (payloadHex: string) => unknown;
type InspectTriggerAction = (encodedAction: string) => unknown;

const STATUS_VALUES = new Set([
  "active",
  "paused",
  "past_due",
  "canceled",
  "suspended",
]);
const TRIGGER_OPERATIONS = new Set([
  "none",
  "register",
  "unregister",
  "replace",
]);
const LOWERCASE_EVEN_HEX = /^(?:[0-9a-f]{2})+$/u;
const CANONICAL_QUANTITY = /^(?:0|[1-9][0-9]*)(?:\.(?:[0-9]{0,27}[1-9]))?$/u;
const POSITIVE_DECIMAL_INTEGER = /^[1-9][0-9]*$/u;
const UTC_DAY_MS = 86_400_000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

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
  const missing = expectedKeys.filter(
    (key) => !Object.prototype.hasOwnProperty.call(value, key),
  );
  const unexpected = actual.filter((key) => !expected.has(key));
  if (missing.length > 0 || unexpected.length > 0) {
    const details = [
      missing.length > 0 ? `missing ${missing.join(", ")}` : "",
      unexpected.length > 0 ? `unexpected ${unexpected.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("; ");
    throw new Error(`${label} has invalid fields (${details}).`);
  }
};

const requireText = (value: unknown, label: string): string => {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value
  ) {
    throw new Error(`${label} must be a canonical non-empty string.`);
  }
  return value;
};

const requireName = (value: unknown, label: string): string => {
  const name = requireText(value, label);
  if (
    /\s/u.test(name) ||
    /[$@#]/u.test(name) ||
    name.normalize("NFC") !== name
  ) {
    throw new Error(`${label} must be a canonical Iroha Name.`);
  }
  return name;
};

const requireSafeInteger = (value: unknown, label: string): number => {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`${label} must be a non-negative safe integer.`);
  }
  return value as number;
};

const requireBoolean = (value: unknown, label: string): boolean => {
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be a boolean.`);
  }
  return value;
};

const requireEqual = (actual: unknown, expected: unknown, label: string) => {
  if (actual !== expected) {
    throw new Error(`${label} does not match the reviewed request.`);
  }
};

const sortedJson = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(sortedJson);
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortedJson(value[key])]),
    );
  }
  return value;
};

const jsonEqual = (left: unknown, right: unknown): boolean =>
  JSON.stringify(sortedJson(left)) === JSON.stringify(sortedJson(right));

const requireJsonEqual = (
  actual: unknown,
  expected: unknown,
  label: string,
) => {
  if (!jsonEqual(actual, expected)) {
    throw new Error(`${label} does not match the reviewed state transition.`);
  }
};

const decodeTaggedStatus = (
  value: unknown,
  label: string,
): SubscriptionStateDraft["status"] => {
  const status = requireRecord(value, label);
  requireExactKeys(status, ["status", "value"], label);
  const statusName = requireText(status.status, `${label}.status`);
  if (!STATUS_VALUES.has(statusName)) {
    throw new Error(`${label}.status is not a first-release status.`);
  }
  if (status.value !== null) {
    throw new Error(`${label}.value must be null.`);
  }
  return {
    status: statusName as SubscriptionStateDraft["status"]["status"],
    value: null,
  };
};

const decodeUsage = (value: unknown, label: string): Record<string, string> => {
  const usage = requireRecord(value, label);
  const decoded: Record<string, string> = {};
  for (const [key, quantity] of Object.entries(usage)) {
    const name = requireName(key, `${label} key`);
    if (typeof quantity !== "string" || !CANONICAL_QUANTITY.test(quantity)) {
      throw new Error(`${label}.${name} must be a canonical Quantity string.`);
    }
    decoded[name] = quantity;
  }
  return decoded;
};

const decodeSubscriptionPlanExpectation = (
  value: unknown,
  label: string,
  networkPrefix: number,
): SubscriptionPlanExpectation => {
  const plan = requireRecord(value, label);
  requireExactKeys(plan, ["provider", "billing", "pricing"], label);
  const provider = normalizeCanonicalAccountIdLiteral(
    requireText(plan.provider, `${label}.provider`),
    `${label}.provider`,
    networkPrefix,
  );

  const billing = requireRecord(plan.billing, `${label}.billing`);
  requireExactKeys(
    billing,
    ["cadence", "bill_for", "retry_backoff_ms", "max_failures", "grace_ms"],
    `${label}.billing`,
  );
  const retryBackoffMs = requireSafeInteger(
    billing.retry_backoff_ms,
    `${label}.billing.retry_backoff_ms`,
  );
  const maxFailures = requireSafeInteger(
    billing.max_failures,
    `${label}.billing.max_failures`,
  );
  if (maxFailures > 0xffff_ffff) {
    throw new Error(`${label}.billing.max_failures exceeds u32.`);
  }
  const graceMs = requireSafeInteger(
    billing.grace_ms,
    `${label}.billing.grace_ms`,
  );

  const billFor = requireRecord(billing.bill_for, `${label}.billing.bill_for`);
  requireExactKeys(billFor, ["period", "value"], `${label}.billing.bill_for`);
  if (
    billFor.period !== "previous_period" &&
    billFor.period !== "next_period"
  ) {
    throw new Error(`${label}.billing.bill_for.period is not first-release.`);
  }
  if (billFor.value !== null) {
    throw new Error(`${label}.billing.bill_for.value must be null.`);
  }

  const cadence = requireRecord(billing.cadence, `${label}.billing.cadence`);
  requireExactKeys(cadence, ["kind", "detail"], `${label}.billing.cadence`);
  const cadenceDetail = requireRecord(
    cadence.detail,
    `${label}.billing.cadence.detail`,
  );
  let normalizedCadence: SubscriptionPlanExpectation["billing"]["cadence"];
  if (cadence.kind === "fixed_period") {
    requireExactKeys(
      cadenceDetail,
      ["period_ms"],
      `${label}.billing.cadence.detail`,
    );
    const periodMs = requireSafeInteger(
      cadenceDetail.period_ms,
      `${label}.billing.cadence.detail.period_ms`,
    );
    if (periodMs === 0) {
      throw new Error(
        `${label}.billing.cadence.detail.period_ms must be positive.`,
      );
    }
    normalizedCadence = { kind: "fixed_period", periodMs };
  } else if (cadence.kind === "monthly_calendar") {
    requireExactKeys(
      cadenceDetail,
      ["anchor_day", "anchor_time_ms"],
      `${label}.billing.cadence.detail`,
    );
    const anchorDay = requireSafeInteger(
      cadenceDetail.anchor_day,
      `${label}.billing.cadence.detail.anchor_day`,
    );
    const anchorTimeMs = requireSafeInteger(
      cadenceDetail.anchor_time_ms,
      `${label}.billing.cadence.detail.anchor_time_ms`,
    );
    if (anchorDay < 1 || anchorDay > 31) {
      throw new Error(
        `${label}.billing.cadence.detail.anchor_day must be between 1 and 31.`,
      );
    }
    if (anchorTimeMs >= UTC_DAY_MS) {
      throw new Error(
        `${label}.billing.cadence.detail.anchor_time_ms must be within one UTC day.`,
      );
    }
    normalizedCadence = {
      kind: "monthly_calendar",
      anchorDay,
      anchorTimeMs,
    };
  } else {
    throw new Error(`${label}.billing.cadence.kind is not first-release.`);
  }

  const pricing = requireRecord(plan.pricing, `${label}.pricing`);
  requireExactKeys(pricing, ["kind", "detail"], `${label}.pricing`);
  const pricingDetail = requireRecord(
    pricing.detail,
    `${label}.pricing.detail`,
  );
  let normalizedPricing: SubscriptionPlanExpectation["pricing"];
  if (pricing.kind === "fixed") {
    requireExactKeys(
      pricingDetail,
      ["amount", "asset_definition"],
      `${label}.pricing.detail`,
    );
    const amount = pricingDetail.amount;
    if (typeof amount !== "string" || !CANONICAL_QUANTITY.test(amount)) {
      throw new Error(`${label}.pricing.detail.amount is not canonical.`);
    }
    const assetDefinition = normalizeFirstReleaseAssetDefinitionId(
      pricingDetail.asset_definition,
      `${label}.pricing.detail.asset_definition`,
    );
    normalizedPricing = { kind: "fixed", amount, assetDefinition };
  } else if (pricing.kind === "usage") {
    requireExactKeys(
      pricingDetail,
      ["unit_price", "unit_key", "asset_definition"],
      `${label}.pricing.detail`,
    );
    const unitPrice = pricingDetail.unit_price;
    if (typeof unitPrice !== "string" || !CANONICAL_QUANTITY.test(unitPrice)) {
      throw new Error(`${label}.pricing.detail.unit_price is not canonical.`);
    }
    const unitKey = requireName(
      pricingDetail.unit_key,
      `${label}.pricing.detail.unit_key`,
    );
    const assetDefinition = normalizeFirstReleaseAssetDefinitionId(
      pricingDetail.asset_definition,
      `${label}.pricing.detail.asset_definition`,
    );
    normalizedPricing = {
      kind: "usage",
      unitPrice,
      unitKey,
      assetDefinition,
    };
  } else {
    throw new Error(`${label}.pricing.kind is not first-release.`);
  }

  return {
    provider,
    billing: {
      cadence: normalizedCadence,
      billFor: billFor.period,
      retryBackoffMs,
      maxFailures,
      graceMs,
    },
    pricing: normalizedPricing,
  };
};

const checkedTimestamp = (value: number, label: string): number => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} is outside the supported timestamp range.`);
  }
  return value;
};

const utcAnchorForMonth = (
  year: number,
  month: number,
  anchorDay: number,
  anchorTimeMs: number,
): number => {
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const start = Date.UTC(year, month, Math.min(anchorDay, lastDay));
  return checkedTimestamp(
    start + anchorTimeMs,
    "Subscription monthly billing anchor",
  );
};

const monthlyAnchorAtOrBefore = (
  timestampMs: number,
  anchorDay: number,
  anchorTimeMs: number,
): number => {
  const date = new Date(timestampMs);
  if (Number.isNaN(date.getTime())) {
    throw new Error(
      "Subscription charge time is outside the UTC calendar range.",
    );
  }
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const candidate = utcAnchorForMonth(year, month, anchorDay, anchorTimeMs);
  return timestampMs < candidate
    ? utcAnchorForMonth(
        month === 0 ? year - 1 : year,
        month === 0 ? 11 : month - 1,
        anchorDay,
        anchorTimeMs,
      )
    : candidate;
};

const monthlyAnchorAfter = (
  timestampMs: number,
  anchorDay: number,
  anchorTimeMs: number,
): number => {
  const date = new Date(timestampMs);
  if (Number.isNaN(date.getTime())) {
    throw new Error(
      "Subscription charge time is outside the UTC calendar range.",
    );
  }
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const candidate = utcAnchorForMonth(year, month, anchorDay, anchorTimeMs);
  return timestampMs < candidate
    ? candidate
    : utcAnchorForMonth(
        month === 11 ? year + 1 : year,
        month === 11 ? 0 : month + 1,
        anchorDay,
        anchorTimeMs,
      );
};

const expectedBillingPeriod = (
  plan: SubscriptionPlanExpectation,
  chargeAtMs: number,
): { startMs: number; endMs: number } => {
  const { cadence, billFor } = plan.billing;
  if (cadence.kind === "fixed_period") {
    if (billFor === "previous_period") {
      return {
        startMs: checkedTimestamp(
          chargeAtMs - cadence.periodMs,
          "Subscription fixed billing period start",
        ),
        endMs: chargeAtMs,
      };
    }
    return {
      startMs: chargeAtMs,
      endMs: checkedTimestamp(
        chargeAtMs + cadence.periodMs,
        "Subscription fixed billing period end",
      ),
    };
  }
  const currentAnchor = monthlyAnchorAtOrBefore(
    chargeAtMs,
    cadence.anchorDay,
    cadence.anchorTimeMs,
  );
  if (billFor === "previous_period") {
    return {
      startMs: monthlyAnchorAtOrBefore(
        checkedTimestamp(
          currentAnchor - 1,
          "Subscription previous monthly anchor",
        ),
        cadence.anchorDay,
        cadence.anchorTimeMs,
      ),
      endMs: currentAnchor,
    };
  }
  return {
    startMs: currentAnchor,
    endMs: monthlyAnchorAfter(
      currentAnchor,
      cadence.anchorDay,
      cadence.anchorTimeMs,
    ),
  };
};

const resolvedChargeBounds = (
  window: SubscriptionResolvedChargeWindow,
): { minimumMs: number; maximumMs: number } => {
  const requestStartedAtMs = requireSafeInteger(
    window.requestStartedAtMs,
    "Subscription request start",
  );
  const responseReceivedAtMs = requireSafeInteger(
    window.responseReceivedAtMs,
    "Subscription response time",
  );
  const clockSkewMs = requireSafeInteger(
    window.clockSkewMs,
    "Subscription clock skew",
  );
  if (responseReceivedAtMs < requestStartedAtMs) {
    throw new Error("Subscription response time precedes its request.");
  }
  return {
    minimumMs: Math.max(0, requestStartedAtMs - clockSkewMs),
    maximumMs: checkedTimestamp(
      responseReceivedAtMs + clockSkewMs,
      "Subscription response clock-skew bound",
    ),
  };
};

const defaultChargeAt = (
  plan: SubscriptionPlanExpectation,
  nowMs: number,
): number => {
  const { cadence, billFor } = plan.billing;
  if (cadence.kind === "fixed_period") {
    return billFor === "previous_period"
      ? checkedTimestamp(
          nowMs + cadence.periodMs,
          "Subscription default fixed charge time",
        )
      : nowMs;
  }
  const currentAnchor = monthlyAnchorAtOrBefore(
    nowMs,
    cadence.anchorDay,
    cadence.anchorTimeMs,
  );
  return currentAnchor === nowMs
    ? nowMs
    : monthlyAnchorAfter(nowMs, cadence.anchorDay, cadence.anchorTimeMs);
};

const assertImplicitResolvedCharge = (
  resolvedChargeMs: number,
  window: SubscriptionResolvedChargeWindow,
  plan: SubscriptionPlanExpectation | null,
  label: string,
) => {
  const { minimumMs, maximumMs } = resolvedChargeBounds(window);
  if (!plan) {
    if (resolvedChargeMs < minimumMs || resolvedChargeMs > maximumMs) {
      throw new Error(`${label} is outside the reviewed request-time window.`);
    }
    return;
  }
  if (plan.billing.cadence.kind === "fixed_period") {
    const minimumCharge = defaultChargeAt(plan, minimumMs);
    const maximumCharge = defaultChargeAt(plan, maximumMs);
    if (resolvedChargeMs < minimumCharge || resolvedChargeMs > maximumCharge) {
      throw new Error(
        `${label} is outside the plan-bound request-time window.`,
      );
    }
    return;
  }
  const allowedCharges = new Set([
    defaultChargeAt(plan, minimumMs),
    defaultChargeAt(plan, maximumMs),
  ]);
  if (!allowedCharges.has(resolvedChargeMs)) {
    throw new Error(
      `${label} is not the plan-bound monthly charge resolved during the request window.`,
    );
  }
};

const decodeSubscriptionState = (
  value: unknown,
  label: string,
  networkPrefix: number,
): SubscriptionStateDraft => {
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
  const currentPeriodStartMs = requireSafeInteger(
    state.current_period_start_ms,
    `${label}.current_period_start_ms`,
  );
  const currentPeriodEndMs = requireSafeInteger(
    state.current_period_end_ms,
    `${label}.current_period_end_ms`,
  );
  if (currentPeriodEndMs <= currentPeriodStartMs) {
    throw new Error(`${label} must contain a positive billing period.`);
  }
  const cancelAtMs =
    state.cancel_at_ms === null
      ? null
      : requireSafeInteger(state.cancel_at_ms, `${label}.cancel_at_ms`);
  const failureCount = requireSafeInteger(
    state.failure_count,
    `${label}.failure_count`,
  );
  if (failureCount > 0xffff_ffff) {
    throw new Error(`${label}.failure_count exceeds u32.`);
  }
  return {
    plan_id: normalizeFirstReleaseAssetDefinitionId(
      state.plan_id,
      `${label}.plan_id`,
    ),
    provider: normalizeCanonicalAccountIdLiteral(
      requireText(state.provider, `${label}.provider`),
      `${label}.provider`,
      networkPrefix,
    ),
    subscriber: normalizeCanonicalAccountIdLiteral(
      requireText(state.subscriber, `${label}.subscriber`),
      `${label}.subscriber`,
      networkPrefix,
    ),
    status: decodeTaggedStatus(state.status, `${label}.status`),
    current_period_start_ms: currentPeriodStartMs,
    current_period_end_ms: currentPeriodEndMs,
    next_charge_ms: requireSafeInteger(
      state.next_charge_ms,
      `${label}.next_charge_ms`,
    ),
    cancel_at_period_end: requireBoolean(
      state.cancel_at_period_end,
      `${label}.cancel_at_period_end`,
    ),
    cancel_at_ms: cancelAtMs,
    failure_count: failureCount,
    usage_accumulated: decodeUsage(
      state.usage_accumulated,
      `${label}.usage_accumulated`,
    ),
    billing_trigger_id: requireName(
      state.billing_trigger_id,
      `${label}.billing_trigger_id`,
    ),
  };
};

const decodeInstructionDrafts = (
  value: unknown,
  decodeInstruction: DecodeInstruction,
  label: string,
) => {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label} must be a non-empty array.`);
  }
  const txInstructions: SubscriptionInstructionDraft[] = [];
  const decodedInstructions: Record<string, unknown>[] = [];
  for (const [index, entry] of value.entries()) {
    const itemLabel = `${label}[${index}]`;
    const item = requireRecord(entry, itemLabel);
    requireExactKeys(item, ["wire_id", "payload_hex"], itemLabel);
    const wireId = requireText(item.wire_id, `${itemLabel}.wire_id`);
    const payloadHex = requireText(
      item.payload_hex,
      `${itemLabel}.payload_hex`,
    );
    if (!LOWERCASE_EVEN_HEX.test(payloadHex)) {
      throw new Error(
        `${itemLabel}.payload_hex must be lowercase canonical framed hex.`,
      );
    }
    let decoded: unknown;
    try {
      decoded = decodeInstruction(payloadHex);
    } catch (error) {
      const detail = error instanceof Error ? ` ${error.message}` : "";
      throw new Error(`${itemLabel} could not be decoded.${detail}`);
    }
    txInstructions.push({ wire_id: wireId, payload_hex: payloadHex });
    decodedInstructions.push(requireRecord(decoded, `${itemLabel} decoded`));
  }
  return { txInstructions, decodedInstructions };
};

const requireInstructionVariant = (
  wireId: string,
  decoded: Record<string, unknown>,
  outerVariant: string,
  innerVariant: string,
  expectedWireId: string,
  label: string,
): unknown => {
  requireEqual(wireId, expectedWireId, `${label}.wire_id`);
  requireExactKeys(decoded, [outerVariant], `${label} decoded`);
  const outer = requireRecord(
    decoded[outerVariant],
    `${label} decoded.${outerVariant}`,
  );
  requireExactKeys(outer, [innerVariant], `${label} decoded.${outerVariant}`);
  return outer[innerVariant];
};

const requireRegisterNft = (
  draft: SubscriptionInstructionDraft,
  decoded: Record<string, unknown>,
  subscriptionId: string,
  state: SubscriptionStateDraft,
  label: string,
) => {
  const nft = requireRecord(
    requireInstructionVariant(
      draft.wire_id,
      decoded,
      "Register",
      "Nft",
      "iroha.register",
      label,
    ),
    `${label} decoded.Register.Nft`,
  );
  requireExactKeys(nft, ["id", "content"], `${label} decoded.Register.Nft`);
  requireEqual(nft.id, subscriptionId, `${label} decoded.Register.Nft.id`);
  const content = requireRecord(
    nft.content,
    `${label} decoded.Register.Nft.content`,
  );
  requireExactKeys(
    content,
    ["subscription"],
    `${label} decoded.Register.Nft.content`,
  );
  requireJsonEqual(
    content.subscription,
    state,
    `${label} decoded subscription metadata`,
  );
};

const requireRegisterTrigger = (
  draft: SubscriptionInstructionDraft,
  decoded: Record<string, unknown>,
  expected: {
    triggerId: string;
    kind: "billing" | "usage";
    authority: string;
    maxCycles: string;
    subscriptionId?: string;
    chargeAtMs?: number;
  },
  inspectTriggerAction: InspectTriggerAction,
  label: string,
) => {
  const trigger = requireRecord(
    requireInstructionVariant(
      draft.wire_id,
      decoded,
      "Register",
      "Trigger",
      "iroha.register",
      label,
    ),
    `${label} decoded.Register.Trigger`,
  );
  requireExactKeys(
    trigger,
    ["id", "action"],
    `${label} decoded.Register.Trigger`,
  );
  requireEqual(
    trigger.id,
    expected.triggerId,
    `${label} decoded.Register.Trigger.id`,
  );
  const encodedAction = requireText(
    trigger.action,
    `${label} decoded.Register.Trigger.action`,
  );
  let inspected: unknown;
  try {
    inspected = inspectTriggerAction(encodedAction);
  } catch (error) {
    const detail = error instanceof Error ? ` ${error.message}` : "";
    throw new Error(`${label} trigger action is not permitted.${detail}`);
  }
  const summary = requireRecord(inspected, `${label} trigger action summary`);
  const expectedKeys =
    expected.kind === "billing"
      ? [
          "version",
          "kind",
          "authority",
          "max_cycles",
          "charge_at_ms",
          "subscription_id",
        ]
      : ["version", "kind", "authority", "max_cycles", "trigger_id"];
  requireExactKeys(summary, expectedKeys, `${label} trigger action summary`);
  requireEqual(summary.version, 1, `${label} trigger action summary.version`);
  requireEqual(
    summary.kind,
    expected.kind,
    `${label} trigger action summary.kind`,
  );
  requireEqual(
    summary.authority,
    expected.authority,
    `${label} trigger action summary.authority`,
  );
  const maxCycles = requireText(
    summary.max_cycles,
    `${label} trigger action summary.max_cycles`,
  );
  if (!POSITIVE_DECIMAL_INTEGER.test(maxCycles)) {
    throw new Error(
      `${label} trigger action summary.max_cycles must be a positive decimal integer.`,
    );
  }
  requireEqual(
    maxCycles,
    expected.maxCycles,
    `${label} trigger action summary.max_cycles`,
  );
  if (expected.kind === "billing") {
    requireEqual(
      summary.subscription_id,
      expected.subscriptionId,
      `${label} trigger action summary.subscription_id`,
    );
    requireEqual(
      summary.charge_at_ms,
      expected.chargeAtMs,
      `${label} trigger action summary.charge_at_ms`,
    );
  } else {
    requireEqual(
      summary.trigger_id,
      expected.triggerId,
      `${label} trigger action summary.trigger_id`,
    );
  }
};

const requireUnregisterTrigger = (
  draft: SubscriptionInstructionDraft,
  decoded: Record<string, unknown>,
  triggerId: string,
  label: string,
) => {
  const decodedTriggerId = requireInstructionVariant(
    draft.wire_id,
    decoded,
    "Unregister",
    "Trigger",
    "iroha.unregister",
    label,
  );
  requireEqual(
    decodedTriggerId,
    triggerId,
    `${label} decoded.Unregister.Trigger`,
  );
};

const requireSetSubscriptionState = (
  draft: SubscriptionInstructionDraft,
  decoded: Record<string, unknown>,
  subscriptionId: string,
  state: SubscriptionStateDraft,
  label: string,
) => {
  const set = requireRecord(
    requireInstructionVariant(
      draft.wire_id,
      decoded,
      "SetKeyValue",
      "Nft",
      "iroha.set_key_value",
      label,
    ),
    `${label} decoded.SetKeyValue.Nft`,
  );
  requireExactKeys(
    set,
    ["object", "key", "value"],
    `${label} decoded.SetKeyValue.Nft`,
  );
  requireEqual(
    set.object,
    subscriptionId,
    `${label} decoded.SetKeyValue.Nft.object`,
  );
  requireEqual(set.key, "subscription", `${label} decoded.SetKeyValue.Nft.key`);
  requireJsonEqual(set.value, state, `${label} decoded.SetKeyValue.Nft.value`);
};

const requireUsageGrant = (
  draft: SubscriptionInstructionDraft,
  decoded: Record<string, unknown>,
  provider: string,
  triggerId: string,
  label: string,
) => {
  const grant = requireRecord(
    requireInstructionVariant(
      draft.wire_id,
      decoded,
      "Grant",
      "Permission",
      "iroha.grant",
      label,
    ),
    `${label} decoded.Grant.Permission`,
  );
  requireExactKeys(
    grant,
    ["object", "destination"],
    `${label} decoded.Grant.Permission`,
  );
  requireEqual(
    grant.destination,
    provider,
    `${label} decoded.Grant.Permission.destination`,
  );
  const permission = requireRecord(
    grant.object,
    `${label} decoded.Grant.Permission.object`,
  );
  requireExactKeys(
    permission,
    ["name", "payload"],
    `${label} decoded.Grant.Permission.object`,
  );
  const permissionName = requireText(
    permission.name,
    `${label} decoded.Grant.Permission.object.name`,
  );
  if (
    permissionName !==
    "iroha_executor_data_model::permission::trigger::CanExecuteTrigger"
  ) {
    throw new Error(`${label} grants an unexpected permission.`);
  }
  const payload = requireRecord(
    permission.payload,
    `${label} decoded.Grant.Permission.object.payload`,
  );
  requireExactKeys(
    payload,
    ["trigger"],
    `${label} decoded.Grant.Permission.object.payload`,
  );
  requireEqual(
    payload.trigger,
    triggerId,
    `${label} decoded.Grant.Permission.object.payload.trigger`,
  );
};

const decodeCancelMode = (
  value: unknown,
  label: string,
): { mode: SubscriptionCancelMode; value: null } => {
  const cancelMode = requireRecord(value, label);
  requireExactKeys(cancelMode, ["mode", "value"], label);
  if (cancelMode.mode !== "immediate" && cancelMode.mode !== "period_end") {
    throw new Error(`${label}.mode is not a first-release cancel mode.`);
  }
  if (cancelMode.value !== null) {
    throw new Error(`${label}.value must be null.`);
  }
  return { mode: cancelMode.mode, value: null };
};

const statusName = (state: SubscriptionStateDraft) => state.status.status;

const assertCreateState = (
  state: SubscriptionStateDraft,
  input: {
    authority: string;
    planId: string;
    plan: SubscriptionPlanExpectation;
    billingTriggerId: string;
    firstChargeMs: number;
  },
) => {
  requireEqual(state.plan_id, input.planId, "Create draft resulting plan_id");
  requireEqual(
    state.subscriber,
    input.authority,
    "Create draft resulting subscriber",
  );
  requireEqual(
    state.provider,
    input.plan.provider,
    "Create draft resulting provider",
  );
  requireEqual(
    state.billing_trigger_id,
    input.billingTriggerId,
    "Create draft resulting billing_trigger_id",
  );
  requireEqual(statusName(state), "active", "Create draft resulting status");
  requireEqual(
    state.next_charge_ms,
    input.firstChargeMs,
    "Create draft resulting next_charge_ms",
  );
  const expectedPeriod = expectedBillingPeriod(input.plan, input.firstChargeMs);
  requireEqual(
    state.current_period_start_ms,
    expectedPeriod.startMs,
    "Create draft resulting current_period_start_ms",
  );
  requireEqual(
    state.current_period_end_ms,
    expectedPeriod.endMs,
    "Create draft resulting current_period_end_ms",
  );
  requireEqual(
    state.cancel_at_period_end,
    false,
    "Create draft resulting cancel_at_period_end",
  );
  requireEqual(state.cancel_at_ms, null, "Create draft resulting cancel_at_ms");
  requireEqual(state.failure_count, 0, "Create draft resulting failure_count");
  requireJsonEqual(
    state.usage_accumulated,
    {},
    "Create draft resulting usage_accumulated",
  );
};

export const decodeSubscriptionCreateMutationDraft = (
  value: unknown,
  expected: {
    authority: string;
    subscriptionId: string;
    planId: string;
    plan: Record<string, unknown>;
    firstChargeMs?: number;
    resolvedChargeWindow?: SubscriptionResolvedChargeWindow;
    ivmMaxCycles: string;
    networkPrefix: number;
  },
  decodeInstruction: DecodeInstruction,
  inspectTriggerAction: InspectTriggerAction,
): SubscriptionCreateMutationDraft => {
  const label = "Subscription create draft";
  const payload = requireRecord(value, label);
  requireExactKeys(
    payload,
    [
      "version",
      "authority",
      "action",
      "subscription_id",
      "plan_id",
      "billing_trigger_id",
      "usage_trigger_id",
      "first_charge_ms",
      "provider_usage_grant_included",
      "resulting_subscription",
      "tx_instructions",
    ],
    label,
  );
  requireEqual(
    payload.version,
    SUBSCRIPTION_MUTATION_DRAFT_VERSION,
    `${label}.version`,
  );
  requireEqual(payload.authority, expected.authority, `${label}.authority`);
  requireEqual(payload.action, "create", `${label}.action`);
  requireEqual(
    payload.subscription_id,
    expected.subscriptionId,
    `${label}.subscription_id`,
  );
  requireEqual(payload.plan_id, expected.planId, `${label}.plan_id`);
  const billingTriggerId = requireName(
    payload.billing_trigger_id,
    `${label}.billing_trigger_id`,
  );
  const usageTriggerId =
    payload.usage_trigger_id === null
      ? null
      : requireName(payload.usage_trigger_id, `${label}.usage_trigger_id`);
  const firstChargeMs = requireSafeInteger(
    payload.first_charge_ms,
    `${label}.first_charge_ms`,
  );
  if (
    expected.firstChargeMs !== undefined &&
    firstChargeMs !== expected.firstChargeMs
  ) {
    throw new Error(
      `${label}.first_charge_ms does not match the reviewed request.`,
    );
  }
  const providerUsageGrantIncluded = requireBoolean(
    payload.provider_usage_grant_included,
    `${label}.provider_usage_grant_included`,
  );
  const plan = decodeSubscriptionPlanExpectation(
    expected.plan,
    "Reviewed subscription plan",
    expected.networkPrefix,
  );
  if (expected.firstChargeMs === undefined && !expected.resolvedChargeWindow) {
    throw new Error(
      `${label} requires a request-time window for an implicit first charge.`,
    );
  }
  if (expected.firstChargeMs === undefined) {
    assertImplicitResolvedCharge(
      firstChargeMs,
      expected.resolvedChargeWindow!,
      plan,
      `${label}.first_charge_ms`,
    );
  }
  if (!POSITIVE_DECIMAL_INTEGER.test(expected.ivmMaxCycles)) {
    throw new Error("Reviewed IVM max cycle limit is not canonical.");
  }
  const usagePlan = plan.pricing.kind === "usage";
  requireEqual(
    usageTriggerId !== null,
    usagePlan,
    `${label}.usage_trigger_id presence`,
  );
  requireEqual(
    providerUsageGrantIncluded,
    usagePlan && plan.provider !== expected.authority,
    `${label}.provider_usage_grant_included`,
  );
  const resultingSubscription = decodeSubscriptionState(
    payload.resulting_subscription,
    `${label}.resulting_subscription`,
    expected.networkPrefix,
  );
  assertCreateState(resultingSubscription, {
    authority: expected.authority,
    planId: expected.planId,
    plan,
    billingTriggerId,
    firstChargeMs,
  });

  const { txInstructions, decodedInstructions } = decodeInstructionDrafts(
    payload.tx_instructions,
    decodeInstruction,
    `${label}.tx_instructions`,
  );
  const expectedLength =
    2 +
    (usageTriggerId === null ? 0 : 1) +
    (providerUsageGrantIncluded ? 1 : 0);
  if (txInstructions.length !== expectedLength) {
    throw new Error(
      `${label}.tx_instructions has an unexpected instruction sequence.`,
    );
  }
  requireRegisterNft(
    txInstructions[0]!,
    decodedInstructions[0]!,
    expected.subscriptionId,
    resultingSubscription,
    `${label}.tx_instructions[0]`,
  );
  requireRegisterTrigger(
    txInstructions[1]!,
    decodedInstructions[1]!,
    {
      triggerId: billingTriggerId,
      kind: "billing",
      authority: expected.authority,
      maxCycles: expected.ivmMaxCycles,
      subscriptionId: expected.subscriptionId,
      chargeAtMs: firstChargeMs,
    },
    inspectTriggerAction,
    `${label}.tx_instructions[1]`,
  );
  let cursor = 2;
  if (usageTriggerId !== null) {
    requireRegisterTrigger(
      txInstructions[cursor]!,
      decodedInstructions[cursor]!,
      {
        triggerId: usageTriggerId,
        kind: "usage",
        authority: expected.authority,
        maxCycles: expected.ivmMaxCycles,
      },
      inspectTriggerAction,
      `${label}.tx_instructions[${cursor}]`,
    );
    cursor += 1;
  }
  if (providerUsageGrantIncluded) {
    requireUsageGrant(
      txInstructions[cursor]!,
      decodedInstructions[cursor]!,
      resultingSubscription.provider,
      usageTriggerId!,
      `${label}.tx_instructions[${cursor}]`,
    );
  }

  return {
    version: SUBSCRIPTION_MUTATION_DRAFT_VERSION,
    authority: expected.authority,
    action: "create",
    subscription_id: expected.subscriptionId,
    plan_id: expected.planId,
    billing_trigger_id: billingTriggerId,
    usage_trigger_id: usageTriggerId,
    first_charge_ms: firstChargeMs,
    provider_usage_grant_included: providerUsageGrantIncluded,
    resulting_subscription: resultingSubscription,
    tx_instructions: txInstructions,
    decoded_instructions: decodedInstructions,
  };
};

const assertPreservedFields = (
  current: SubscriptionStateDraft,
  resulting: SubscriptionStateDraft,
  fields: Array<keyof SubscriptionStateDraft>,
  label: string,
) => {
  for (const field of fields) {
    requireJsonEqual(
      resulting[field],
      current[field],
      `${label}.${String(field)}`,
    );
  }
};

const assertActionStateTransition = (
  action: SubscriptionActionDraftName,
  current: SubscriptionStateDraft,
  resulting: SubscriptionStateDraft,
  details: {
    effectiveChargeMs: number | null;
    cancelMode: { mode: SubscriptionCancelMode; value: null } | null;
    plan: SubscriptionPlanExpectation | null;
  },
) => {
  const label = `Subscription ${action} draft resulting_subscription`;
  if (action === "pause") {
    const expected = {
      ...current,
      status: { status: "paused", value: null },
    };
    requireJsonEqual(resulting, expected, label);
    return;
  }
  if (action === "cancel") {
    if (details.cancelMode?.mode === "immediate") {
      const expected = {
        ...current,
        status: { status: "canceled", value: null },
        cancel_at_period_end: false,
        cancel_at_ms: null,
      };
      requireJsonEqual(resulting, expected, label);
      return;
    }
    if (details.cancelMode?.mode !== "period_end") {
      throw new Error("Subscription cancel draft is missing cancel_mode.");
    }
    const expected = {
      ...current,
      cancel_at_period_end: true,
      cancel_at_ms: current.current_period_end_ms,
    };
    requireJsonEqual(resulting, expected, label);
    return;
  }
  if (action === "keep") {
    const expected = {
      ...current,
      cancel_at_period_end: false,
      cancel_at_ms: null,
    };
    requireJsonEqual(resulting, expected, label);
    return;
  }
  if (details.effectiveChargeMs === null) {
    throw new Error(
      `Subscription ${action} draft is missing effective_charge_ms.`,
    );
  }
  if (action === "charge_now") {
    const expected = {
      ...current,
      next_charge_ms: details.effectiveChargeMs,
    };
    requireJsonEqual(resulting, expected, label);
    return;
  }

  assertPreservedFields(
    current,
    resulting,
    [
      "plan_id",
      "provider",
      "subscriber",
      "cancel_at_period_end",
      "cancel_at_ms",
      "usage_accumulated",
      "billing_trigger_id",
    ],
    label,
  );
  requireEqual(statusName(resulting), "active", `${label}.status`);
  requireEqual(resulting.failure_count, 0, `${label}.failure_count`);
  requireEqual(
    resulting.next_charge_ms,
    details.effectiveChargeMs,
    `${label}.next_charge_ms`,
  );
  if (!details.plan) {
    throw new Error("Subscription resume requires the current live plan.");
  }
  const expectedPeriod = expectedBillingPeriod(
    details.plan,
    details.effectiveChargeMs,
  );
  requireEqual(
    resulting.current_period_start_ms,
    expectedPeriod.startMs,
    `${label}.current_period_start_ms`,
  );
  requireEqual(
    resulting.current_period_end_ms,
    expectedPeriod.endMs,
    `${label}.current_period_end_ms`,
  );
};

const assertActionInstructionSequence = (
  draft: SubscriptionActionMutationDraft,
  inspectTriggerAction: InspectTriggerAction,
  ivmMaxCycles: string,
) => {
  const { tx_instructions, decoded_instructions, subscription_id, details } =
    draft;
  requireSetSubscriptionState(
    tx_instructions[0]!,
    decoded_instructions[0]!,
    subscription_id,
    details.resulting_subscription,
    "Subscription action draft.tx_instructions[0]",
  );

  const expectedLength =
    details.billing_trigger_operation === "none"
      ? 1
      : details.billing_trigger_operation === "replace"
        ? 3
        : 2;
  if (tx_instructions.length !== expectedLength) {
    throw new Error(
      "Subscription action draft.tx_instructions has an unexpected instruction sequence.",
    );
  }
  if (
    details.billing_trigger_operation === "unregister" ||
    details.billing_trigger_operation === "replace"
  ) {
    requireUnregisterTrigger(
      tx_instructions[1]!,
      decoded_instructions[1]!,
      details.billing_trigger_id,
      "Subscription action draft.tx_instructions[1]",
    );
  }
  if (details.billing_trigger_operation === "register") {
    requireRegisterTrigger(
      tx_instructions[1]!,
      decoded_instructions[1]!,
      {
        triggerId: details.billing_trigger_id,
        kind: "billing",
        authority: draft.authority,
        maxCycles: ivmMaxCycles,
        subscriptionId: subscription_id,
        chargeAtMs: details.effective_charge_ms ?? undefined,
      },
      inspectTriggerAction,
      "Subscription action draft.tx_instructions[1]",
    );
  } else if (details.billing_trigger_operation === "replace") {
    requireRegisterTrigger(
      tx_instructions[2]!,
      decoded_instructions[2]!,
      {
        triggerId: details.billing_trigger_id,
        kind: "billing",
        authority: draft.authority,
        maxCycles: ivmMaxCycles,
        subscriptionId: subscription_id,
        chargeAtMs: details.effective_charge_ms ?? undefined,
      },
      inspectTriggerAction,
      "Subscription action draft.tx_instructions[2]",
    );
  }
};

const assertActionTriggerOperation = (
  action: SubscriptionActionDraftName,
  operation: SubscriptionBillingTriggerOperation,
  cancelMode: { mode: SubscriptionCancelMode; value: null } | null,
) => {
  const allowed =
    action === "pause"
      ? new Set(["none", "unregister"])
      : action === "resume" || action === "charge_now"
        ? new Set(["register", "replace"])
        : action === "cancel" && cancelMode?.mode === "immediate"
          ? new Set(["none", "unregister"])
          : new Set(["none"]);
  if (!allowed.has(operation)) {
    throw new Error(
      `Subscription ${action} draft has an invalid billing trigger operation.`,
    );
  }
};

export const decodeSubscriptionActionMutationDraft = (
  value: unknown,
  expected: {
    authority: string;
    subscriptionId: string;
    action: SubscriptionActionDraftName;
    currentSubscription: Record<string, unknown>;
    currentPlan: Record<string, unknown> | null;
    chargeAtMs?: number;
    resolvedChargeWindow?: SubscriptionResolvedChargeWindow;
    cancelMode?: SubscriptionCancelMode;
    ivmMaxCycles: string;
    networkPrefix: number;
  },
  decodeInstruction: DecodeInstruction,
  inspectTriggerAction: InspectTriggerAction,
): SubscriptionActionMutationDraft => {
  const label = "Subscription action draft";
  const payload = requireRecord(value, label);
  requireExactKeys(
    payload,
    [
      "version",
      "authority",
      "action",
      "subscription_id",
      "details",
      "tx_instructions",
    ],
    label,
  );
  requireEqual(
    payload.version,
    SUBSCRIPTION_MUTATION_DRAFT_VERSION,
    `${label}.version`,
  );
  requireEqual(payload.authority, expected.authority, `${label}.authority`);
  requireEqual(payload.action, expected.action, `${label}.action`);
  requireEqual(
    payload.subscription_id,
    expected.subscriptionId,
    `${label}.subscription_id`,
  );
  const currentSubscription = decodeSubscriptionState(
    expected.currentSubscription,
    "Current live subscription",
    expected.networkPrefix,
  );
  requireEqual(
    currentSubscription.subscriber,
    expected.authority,
    "Current live subscription subscriber",
  );
  const currentPlan =
    expected.currentPlan === null
      ? null
      : decodeSubscriptionPlanExpectation(
          expected.currentPlan,
          "Current live subscription plan",
          expected.networkPrefix,
        );
  if (currentPlan) {
    requireEqual(
      currentPlan.provider,
      currentSubscription.provider,
      "Current live subscription plan provider",
    );
  }
  if (!POSITIVE_DECIMAL_INTEGER.test(expected.ivmMaxCycles)) {
    throw new Error("Reviewed IVM max cycle limit is not canonical.");
  }
  const details = requireRecord(payload.details, `${label}.details`);
  requireExactKeys(
    details,
    [
      "billing_trigger_id",
      "billing_trigger_operation",
      "effective_charge_ms",
      "cancel_mode",
      "resulting_subscription",
    ],
    `${label}.details`,
  );
  const billingTriggerId = requireName(
    details.billing_trigger_id,
    `${label}.details.billing_trigger_id`,
  );
  requireEqual(
    billingTriggerId,
    currentSubscription.billing_trigger_id,
    `${label}.details.billing_trigger_id`,
  );
  const operation = requireText(
    details.billing_trigger_operation,
    `${label}.details.billing_trigger_operation`,
  );
  if (!TRIGGER_OPERATIONS.has(operation)) {
    throw new Error(
      `${label}.details.billing_trigger_operation is not first-release.`,
    );
  }
  const billingTriggerOperation =
    operation as SubscriptionBillingTriggerOperation;
  const effectiveChargeMs =
    details.effective_charge_ms === null
      ? null
      : requireSafeInteger(
          details.effective_charge_ms,
          `${label}.details.effective_charge_ms`,
        );
  const cancelMode =
    details.cancel_mode === null
      ? null
      : decodeCancelMode(details.cancel_mode, `${label}.details.cancel_mode`);
  if (expected.action === "cancel") {
    if (!expected.cancelMode) {
      throw new Error("Cancel requires an explicit reviewed cancel mode.");
    }
    requireEqual(
      cancelMode?.mode,
      expected.cancelMode,
      `${label}.details.cancel_mode.mode`,
    );
  } else if (cancelMode !== null) {
    throw new Error(`${label}.details.cancel_mode must be null.`);
  }
  if (expected.action === "resume" || expected.action === "charge_now") {
    if (effectiveChargeMs === null) {
      throw new Error(`${label}.details.effective_charge_ms is required.`);
    }
    if (
      expected.chargeAtMs !== undefined &&
      effectiveChargeMs !== expected.chargeAtMs
    ) {
      throw new Error(
        `${label}.details.effective_charge_ms does not match the reviewed request.`,
      );
    }
    if (expected.chargeAtMs === undefined && !expected.resolvedChargeWindow) {
      throw new Error(
        `${label} requires a request-time window for an implicit charge.`,
      );
    }
    if (expected.chargeAtMs === undefined) {
      assertImplicitResolvedCharge(
        effectiveChargeMs,
        expected.resolvedChargeWindow!,
        expected.action === "resume" ? currentPlan : null,
        `${label}.details.effective_charge_ms`,
      );
    }
  } else if (effectiveChargeMs !== null) {
    throw new Error(`${label}.details.effective_charge_ms must be null.`);
  }
  assertActionTriggerOperation(
    expected.action,
    billingTriggerOperation,
    cancelMode,
  );
  const resultingSubscription = decodeSubscriptionState(
    details.resulting_subscription,
    `${label}.details.resulting_subscription`,
    expected.networkPrefix,
  );
  assertActionStateTransition(
    expected.action,
    currentSubscription,
    resultingSubscription,
    { effectiveChargeMs, cancelMode, plan: currentPlan },
  );

  const { txInstructions, decodedInstructions } = decodeInstructionDrafts(
    payload.tx_instructions,
    decodeInstruction,
    `${label}.tx_instructions`,
  );
  const draft: SubscriptionActionMutationDraft = {
    version: SUBSCRIPTION_MUTATION_DRAFT_VERSION,
    authority: expected.authority,
    action: expected.action,
    subscription_id: expected.subscriptionId,
    details: {
      billing_trigger_id: billingTriggerId,
      billing_trigger_operation: billingTriggerOperation,
      effective_charge_ms: effectiveChargeMs,
      cancel_mode: cancelMode,
      resulting_subscription: resultingSubscription,
    },
    tx_instructions: txInstructions,
    decoded_instructions: decodedInstructions,
  };
  assertActionInstructionSequence(
    draft,
    inspectTriggerAction,
    expected.ivmMaxCycles,
  );
  return draft;
};

export const subscriptionStateMatchesDraft = (
  actual: Record<string, unknown>,
  expected: SubscriptionStateDraft,
  networkPrefix: number,
): boolean => {
  try {
    return jsonEqual(
      decodeSubscriptionState(
        actual,
        "Committed subscription state",
        networkPrefix,
      ),
      expected,
    );
  } catch {
    return false;
  }
};

export const subscriptionPlanSnapshotsMatch = (
  left: Record<string, unknown>,
  right: Record<string, unknown>,
  networkPrefix: number,
): boolean => {
  try {
    decodeSubscriptionPlanExpectation(
      left,
      "First subscription plan snapshot",
      networkPrefix,
    );
    decodeSubscriptionPlanExpectation(
      right,
      "Second subscription plan snapshot",
      networkPrefix,
    );
    return jsonEqual(left, right);
  } catch {
    return false;
  }
};

export const subscriptionStateSnapshotsMatch = (
  left: Record<string, unknown>,
  right: Record<string, unknown>,
  networkPrefix: number,
): boolean => {
  try {
    return jsonEqual(
      decodeSubscriptionState(
        left,
        "First subscription state snapshot",
        networkPrefix,
      ),
      decodeSubscriptionState(
        right,
        "Second subscription state snapshot",
        networkPrefix,
      ),
    );
  } catch {
    return false;
  }
};

const multiplyCanonicalQuantities = (left: string, right: string): string => {
  const parse = (value: string) => {
    const [whole, fraction = ""] = value.split(".");
    return {
      coefficient: BigInt(`${whole}${fraction}`),
      scale: fraction.length,
    };
  };
  const lhs = parse(left);
  const rhs = parse(right);
  const coefficient = lhs.coefficient * rhs.coefficient;
  if (coefficient === 0n) return "0";
  const scale = lhs.scale + rhs.scale;
  if (scale === 0) return coefficient.toString();
  const digits = coefficient.toString().padStart(scale + 1, "0");
  const whole = digits.slice(0, -scale);
  const fraction = digits.slice(-scale).replace(/0+$/u, "");
  return fraction ? `${whole}.${fraction}` : whole;
};

/**
 * Classifies the first indexed state after a committed subscription mutation.
 *
 * A due one-shot billing trigger can execute before the read index exposes the
 * draft's intermediate state. In that case, accept exactly one deterministic
 * billing successor only when the accompanying invoice proves the reviewed
 * plan, period, amount, asset, attempt time, and paid/failed transition.
 */
export const classifySubscriptionStateConfirmation = (input: {
  actual: Record<string, unknown>;
  expected: SubscriptionStateDraft;
  plan: Record<string, unknown> | null;
  invoice: Record<string, unknown> | null;
  subscriptionId: string;
  networkPrefix: number;
}): "exact" | "advanced" | null => {
  if (
    subscriptionStateMatchesDraft(
      input.actual,
      input.expected,
      input.networkPrefix,
    )
  ) {
    return "exact";
  }
  if (input.plan === null || input.invoice === null) {
    return null;
  }

  try {
    const actual = decodeSubscriptionState(
      input.actual,
      "Indexed subscription state",
      input.networkPrefix,
    );
    const plan = decodeSubscriptionPlanExpectation(
      input.plan,
      "Reviewed subscription plan",
      input.networkPrefix,
    );
    const invoice = requireRecord(
      input.invoice,
      "Indexed subscription invoice",
    );
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
      "Indexed subscription invoice",
    );
    requireEqual(
      invoice.subscription_nft_id,
      input.subscriptionId,
      "Indexed subscription invoice.subscription_nft_id",
    );
    requireEqual(
      input.expected.plan_id,
      actual.plan_id,
      "Indexed subscription successor plan_id",
    );
    requireEqual(
      input.expected.provider,
      plan.provider,
      "Indexed subscription successor provider",
    );
    if (
      statusName(input.expected) === "paused" ||
      statusName(input.expected) === "canceled" ||
      statusName(input.expected) === "suspended"
    ) {
      return null;
    }

    const scheduledAtMs = input.expected.next_charge_ms;
    const chargePeriod = expectedBillingPeriod(plan, scheduledAtMs);
    requireEqual(
      requireSafeInteger(
        invoice.period_start_ms,
        "Indexed subscription invoice.period_start_ms",
      ),
      chargePeriod.startMs,
      "Indexed subscription invoice.period_start_ms",
    );
    requireEqual(
      requireSafeInteger(
        invoice.period_end_ms,
        "Indexed subscription invoice.period_end_ms",
      ),
      chargePeriod.endMs,
      "Indexed subscription invoice.period_end_ms",
    );
    const attemptedAtMs = requireSafeInteger(
      invoice.attempted_at_ms,
      "Indexed subscription invoice.attempted_at_ms",
    );
    if (attemptedAtMs < scheduledAtMs) {
      throw new Error(
        "Indexed subscription invoice predates the signed billing schedule.",
      );
    }

    const expectedAmount =
      plan.pricing.kind === "fixed"
        ? plan.pricing.amount
        : multiplyCanonicalQuantities(
            input.expected.usage_accumulated[plan.pricing.unitKey] ?? "0",
            plan.pricing.unitPrice,
          );
    const invoiceAmount = requireText(
      invoice.amount,
      "Indexed subscription invoice.amount",
    );
    if (!CANONICAL_QUANTITY.test(invoiceAmount)) {
      throw new Error(
        "Indexed subscription invoice.amount is not a canonical Quantity.",
      );
    }
    requireEqual(
      invoiceAmount,
      expectedAmount,
      "Indexed subscription invoice.amount",
    );
    requireEqual(
      invoice.asset_definition,
      plan.pricing.assetDefinition,
      "Indexed subscription invoice.asset_definition",
    );
    const invoiceStatus = requireRecord(
      invoice.status,
      "Indexed subscription invoice.status",
    );
    requireExactKeys(
      invoiceStatus,
      ["status", "value"],
      "Indexed subscription invoice.status",
    );
    if (invoiceStatus.status !== "paid" && invoiceStatus.status !== "failed") {
      throw new Error(
        "Indexed subscription invoice.status is not first-release.",
      );
    }
    requireEqual(
      invoiceStatus.value,
      null,
      "Indexed subscription invoice.status.value",
    );
    if (
      invoice.tx_hash !== null &&
      (typeof invoice.tx_hash !== "string" || invoice.tx_hash.length === 0)
    ) {
      throw new Error(
        "Indexed subscription invoice.tx_hash must be a hash or null.",
      );
    }

    let successor: SubscriptionStateDraft;
    if (invoiceStatus.status === "paid") {
      const nextChargeMs =
        plan.billing.cadence.kind === "fixed_period"
          ? checkedTimestamp(
              scheduledAtMs + plan.billing.cadence.periodMs,
              "Subscription successor next charge",
            )
          : monthlyAnchorAfter(
              scheduledAtMs,
              plan.billing.cadence.anchorDay,
              plan.billing.cadence.anchorTimeMs,
            );
      const nextPeriod =
        plan.billing.billFor === "previous_period"
          ? expectedBillingPeriod(
              {
                ...plan,
                billing: {
                  ...plan.billing,
                  billFor: "next_period",
                },
              },
              scheduledAtMs,
            )
          : chargePeriod;
      const usageAccumulated = { ...input.expected.usage_accumulated };
      if (plan.pricing.kind === "usage") {
        delete usageAccumulated[plan.pricing.unitKey];
      }
      successor = {
        ...input.expected,
        status: { status: "active", value: null },
        current_period_start_ms: nextPeriod.startMs,
        current_period_end_ms: nextPeriod.endMs,
        next_charge_ms: nextChargeMs,
        failure_count: 0,
        usage_accumulated: usageAccumulated,
      };
    } else {
      const failureCount = Math.min(
        0xffff_ffff,
        input.expected.failure_count + 1,
      );
      const graceDeadline = checkedTimestamp(
        scheduledAtMs + plan.billing.graceMs,
        "Subscription successor grace deadline",
      );
      const failedStatus =
        failureCount >= plan.billing.maxFailures
          ? "suspended"
          : attemptedAtMs >= graceDeadline
            ? "past_due"
            : statusName(input.expected);
      successor = {
        ...input.expected,
        status: { status: failedStatus, value: null },
        failure_count: failureCount,
        ...(failedStatus === "suspended"
          ? {}
          : {
              next_charge_ms: checkedTimestamp(
                attemptedAtMs + plan.billing.retryBackoffMs,
                "Subscription successor retry time",
              ),
            }),
      };
    }

    if (successor.cancel_at_period_end) {
      const cancelAtMs =
        successor.cancel_at_ms ?? successor.current_period_end_ms;
      if (chargePeriod.endMs >= cancelAtMs) {
        successor = {
          ...successor,
          status: { status: "canceled", value: null },
          cancel_at_period_end: false,
          cancel_at_ms: null,
        };
      }
    }
    return jsonEqual(actual, successor) ? "advanced" : null;
  } catch {
    return null;
  }
};

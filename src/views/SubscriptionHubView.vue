<template>
  <div class="subscriptions-shell">
    <RouteHeaderAction>
      <AppButton
        variant="secondary"
        :disabled="subscriptions.loading"
        @click="refresh"
      >
        {{ subscriptions.loading ? t("Refreshing…") : t("Refresh") }}
      </AppButton>
    </RouteHeaderAction>

    <section class="card subscriptions-summary-card">
      <header class="card-header">
        <div>
          <h2>{{ t("Active subscriptions") }}</h2>
          <p class="helper">
            {{ t("Live subscription NFTs and plan metadata from Torii.") }}
          </p>
        </div>
        <div class="subscription-header-actions">
          <span class="pill positive">{{ t("Live Torii data") }}</span>
        </div>
      </header>
      <div class="subscriptions-overview">
        <div class="grid-2 subscriptions-summary-grid">
          <div class="kv">
            <span class="kv-label">{{ t("Active") }}</span>
            <span class="kv-value">{{
              subscriptions.recordsError ? t("Unavailable") : activeCount
            }}</span>
          </div>
          <div class="kv">
            <span class="kv-label">{{ t("Paused") }}</span>
            <span class="kv-value">{{
              subscriptions.recordsError ? t("Unavailable") : pausedCount
            }}</span>
          </div>
          <div class="kv">
            <span class="kv-label">{{ t("Past due") }}</span>
            <span class="kv-value">{{
              subscriptions.recordsError ? t("Unavailable") : pastDueCount
            }}</span>
          </div>
          <div class="kv">
            <span class="kv-label">{{ t("Plan catalog") }}</span>
            <span class="kv-value">{{
              subscriptions.plansError
                ? t("Unavailable")
                : subscriptions.planTotal
            }}</span>
          </div>
        </div>
        <div class="subscriptions-next-panel">
          <p class="meta-label">{{ t("Next auto-deduct") }}</p>
          <p class="subscriptions-next-label">{{ nextDueLabel }}</p>
          <p class="helper">
            {{
              lastUpdatedLabel ||
              t("Refresh to sync real subscription state from Torii.")
            }}
          </p>
        </div>
      </div>
      <p v-if="activeAccount?.localOnly" class="message warning">
        {{
          t(
            "This wallet is local-only. Subscription records appear after the account exists on-chain.",
          )
        }}
      </p>
    </section>

    <InlineAlert
      v-for="pending in currentPendingReconciliations"
      :key="pending.transactionHash"
      tone="warning"
      :title="t('Transaction finalized; subscription state is still indexing')"
    >
      <p class="helper">
        {{
          t("{action} finalized in block {height}.", {
            action: pendingActionLabel(pending),
            height: pending.finality.blockHeight,
          })
        }}
      </p>
      <p class="helper mono">
        {{ pending.subscriptionId }} · {{ pending.transactionHash }}
      </p>
      <p class="helper">{{ pending.message }}</p>
      <AppButton
        variant="secondary"
        :disabled="subscriptions.isReconciling(pending)"
        @click="reconcilePendingTransaction(pending)"
      >
        {{
          subscriptions.isReconciling(pending)
            ? t("Checking live state…")
            : t("Refresh and reconcile")
        }}
      </AppButton>
      <p v-if="subscriptions.reconciliationError" class="message error">
        {{ subscriptions.reconciliationError }}
      </p>
    </InlineAlert>

    <InlineAlert
      v-if="subscriptions.loading"
      tone="neutral"
      :title="t('Loading subscriptions…')"
    >
      <p class="helper">{{ t("Reading live plans and wallet records.") }}</p>
    </InlineAlert>
    <InlineAlert
      v-else-if="!anySubscriptionWriteSupported"
      tone="warning"
      :title="t('Subscription writes unavailable')"
    >
      <p class="helper">{{ subscriptionWriteReason() }}</p>
    </InlineAlert>

    <SegmentedControl
      v-model="workspaceMode"
      :label="t('Subscription workspace')"
      :options="[
        { value: 'current', label: t('All subscriptions') },
        { value: 'add', label: t('Subscribe to plan') },
      ]"
    />

    <section
      v-if="workspaceMode === 'add'"
      class="card subscriptions-form-card"
    >
      <header class="card-header">
        <div>
          <h2>{{ t("Subscribe to plan") }}</h2>
          <p class="helper">
            {{
              t("Create a real subscription NFT for an existing on-chain plan.")
            }}
          </p>
        </div>
      </header>
      <p v-if="subscriptions.plansError" class="message warning">
        {{ subscriptions.plansError }}
      </p>
      <form
        v-if="subscriptions.plans.length && subscriptionCreateSupported"
        class="form-grid subscription-form-grid"
        @submit.prevent="subscribe"
      >
        <label class="subscription-span-2">
          {{ t("Plan ID") }}
          <select v-model="form.planId">
            <option value="">{{ t("Select plan") }}</option>
            <option
              v-for="plan in subscriptions.plans"
              :key="plan.plan_id"
              :value="plan.plan_id"
            >
              {{ planLabel(plan) }}
            </option>
          </select>
        </label>
        <label class="subscription-span-2">
          {{ t("Subscription NFT ID") }}
          <input
            v-model.trim="form.subscriptionId"
            :placeholder="generatedSubscriptionId"
          />
        </label>
        <label class="subscription-span-2">
          {{ t("First charge time") }}
          <input v-model="form.firstChargeAt" type="datetime-local" />
        </label>
        <p class="transaction-fee-note subscription-span-2">
          <span>{{ t("Fee") }}</span>
          <strong>{{ formatTransactionFee(null, t) }}</strong>
        </p>
        <button
          type="submit"
          class="subscription-submit"
          data-ui-primary-action
          :disabled="
            actionBusy === 'create' || pendingBlocksGeneratedSubscription
          "
        >
          {{
            actionBusy === "create"
              ? t("Submitting…")
              : t("Create subscription")
          }}
        </button>
      </form>
      <EmptyState
        v-else-if="!subscriptions.plansError"
        :title="
          subscriptions.plans.length
            ? t('Subscription writes unavailable')
            : t('No live plans found')
        "
        :description="
          subscriptions.plans.length
            ? subscriptionWriteReason(SUBSCRIPTION_WRITE_OPERATIONS.create)
            : t(
                'This Torii endpoint has no subscription plans to subscribe to.',
              )
        "
      />
      <p v-if="formError" class="message error">{{ formError }}</p>
      <p v-if="actionMessage" class="message success">{{ actionMessage }}</p>

      <div class="subscription-plan-list">
        <p class="meta-label">{{ t("Available plans") }}</p>
        <div
          v-if="subscriptions.plans.length"
          class="subscription-stack compact"
        >
          <article
            v-for="plan in subscriptions.plans"
            :key="plan.plan_id"
            class="subscription-card compact"
          >
            <div class="subscription-card-main">
              <div class="subscription-header">
                <div class="subscription-headline">
                  <h3>{{ planLabel(plan) }}</h3>
                  <p class="helper mono">{{ plan.plan_id }}</p>
                </div>
              </div>
              <div class="subscription-meta">
                <span>{{
                  t("Provider: {value}", { value: planProvider(plan) })
                }}</span>
                <span>{{ planPricingLabel(plan) }}</span>
                <span>{{ planCadenceLabel(plan) }}</span>
              </div>
            </div>
          </article>
        </div>
        <p
          v-else-if="!subscriptions.plansError"
          class="helper subscription-empty"
        >
          {{ t("No live plans found.") }}
        </p>
      </div>
    </section>

    <section v-else class="card subscriptions-list-card">
      <header class="card-header">
        <div>
          <h2>{{ t("All subscriptions") }}</h2>
          <p class="helper">
            {{ t("Owned subscription NFTs for the active wallet.") }}
          </p>
        </div>
        <span class="pill">
          {{
            subscriptions.recordsError
              ? t("Unavailable")
              : t("{count} total", { count: subscriptions.total })
          }}
        </span>
      </header>
      <p v-if="subscriptions.recordsError" class="message warning">
        {{ subscriptions.recordsError }}
      </p>
      <div v-else-if="sortedRecords.length" class="subscription-stack">
        <article
          v-for="record in sortedRecords"
          :key="record.subscription_id"
          class="subscription-card"
        >
          <div class="subscription-card-main">
            <div class="subscription-header">
              <div class="subscription-headline">
                <h3>{{ recordTitle(record) }}</h3>
                <p class="helper">
                  {{ recordPricingLabel(record) }}
                  ·
                  {{ recordCadenceLabel(record) }}
                </p>
              </div>
              <span class="pill" :class="statusTone(record)">{{
                statusLabel(record)
              }}</span>
            </div>
            <div class="subscription-meta">
              <span>{{
                t("Next: {date}", {
                  date: formatDateMs(recordNextCharge(record)),
                })
              }}</span>
              <span>{{
                t("Period end: {date}", {
                  date: formatDateMs(subscriptionPeriodEndMs(record)),
                })
              }}</span>
              <span v-if="subscriptionCancelAtPeriodEnd(record)">
                {{ t("Canceling at period end") }}
              </span>
            </div>
            <div
              v-if="subscriptionLatestInvoice(record)"
              class="subscription-meta"
            >
              <span>{{ invoiceLabel(record) }}</span>
            </div>
            <details class="technical-details compact">
              <summary>{{ t("Subscription details") }}</summary>
              <div class="grid-2">
                <div class="kv">
                  <span class="kv-label">{{ t("Subscription NFT ID") }}</span>
                  <span class="kv-value mono">{{
                    record.subscription_id
                  }}</span>
                </div>
                <div class="kv">
                  <span class="kv-label">{{ t("Plan ID") }}</span>
                  <span class="kv-value mono">{{
                    subscriptionPlanIdFromItem(record) || t("—")
                  }}</span>
                </div>
                <div class="kv">
                  <span class="kv-label">{{ t("Provider") }}</span>
                  <span class="kv-value mono">{{
                    subscriptionProviderFromItem(record) || t("—")
                  }}</span>
                </div>
                <div class="kv">
                  <span class="kv-label">{{ t("Billing trigger") }}</span>
                  <span class="kv-value mono">{{
                    billingTriggerId(record) || t("—")
                  }}</span>
                </div>
              </div>
            </details>
          </div>
          <p class="transaction-fee-note">
            <span>{{ t("Fee") }}</span>
            <strong>{{ formatTransactionFee(null, t) }}</strong>
          </p>
          <div class="subscription-actions">
            <button
              class="secondary"
              :disabled="
                !subscriptionOperationSupported(
                  pauseOperationForRecord(record),
                ) ||
                !recordBelongsToCurrentContext(record) ||
                recordHasPendingReconciliation(record) ||
                Boolean(actionBusy) ||
                !canPauseOrResume(record)
              "
              @click="togglePause(record)"
            >
              {{ pauseLabel(record) }}
            </button>
            <button
              class="secondary"
              :disabled="
                !subscriptionOperationSupported(
                  cancelOperationForRecord(record),
                ) ||
                !recordBelongsToCurrentContext(record) ||
                recordHasPendingReconciliation(record) ||
                Boolean(actionBusy) ||
                !canCancelOrKeep(record)
              "
              @click="toggleCancel(record)"
            >
              {{ cancelLabel(record) }}
            </button>
            <button
              class="ghost"
              :disabled="
                !subscriptionOperationSupported(
                  SUBSCRIPTION_WRITE_OPERATIONS.charge,
                ) ||
                !recordBelongsToCurrentContext(record) ||
                recordHasPendingReconciliation(record) ||
                Boolean(actionBusy) ||
                !canChargeNow(record)
              "
              @click="chargeNow(record)"
            >
              {{ t("Charge now") }}
            </button>
          </div>
        </article>
      </div>
      <EmptyState
        v-else-if="!subscriptions.recordsError"
        :title="t('No subscriptions yet')"
        :description="
          t('This account has no subscriptions on the active network.')
        "
      >
        <template #actions>
          <AppButton
            v-if="subscriptions.plans.length && subscriptionCreateSupported"
            @click="workspaceMode = 'add'"
          >
            {{ t("Subscribe to plan") }}
          </AppButton>
        </template>
      </EmptyState>
      <p v-if="formError" class="message error">{{ formError }}</p>
      <p v-if="actionMessage" class="message success">{{ actionMessage }}</p>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { useAppI18n } from "@/composables/useAppI18n";
import {
  AppButton,
  EmptyState,
  InlineAlert,
  RouteHeaderAction,
  SegmentedControl,
} from "@/components/ui";
import { useEndpointStore } from "@/stores/endpoint";
import {
  useSubscriptionStore,
  type SubscriptionPendingReconciliation,
} from "@/stores/subscriptions";
import { useSessionStore } from "@/stores/session";
import { isEndpointFeatureOperationSupported } from "@/utils/endpointFeatures";
import type {
  SubscriptionActionResponseView,
  SubscriptionListItemView,
  SubscriptionMutationActionView,
  SubscriptionPlanListItemView,
} from "@/types/iroha";
import {
  buildSubscriptionNftId,
  formatPlanCadence,
  formatPlanPricing,
  formatSubscriptionQuantity,
  planFromSubscriptionItem,
  planIdFromPlanItem,
  planPayloadFromPlanItem,
  subscriptionCancelAtPeriodEnd,
  subscriptionLatestInvoice,
  subscriptionNextChargeMs,
  subscriptionPeriodEndMs,
  subscriptionPlanIdFromItem,
  subscriptionProviderFromItem,
  subscriptionStatusFromItem,
} from "@/utils/subscriptions";
import { deriveAssetSymbol } from "@/utils/assetId";
import {
  appendTransactionFee,
  formatTransactionFee,
} from "@/utils/transactionFee";

const subscriptions = useSubscriptionStore();
const session = useSessionStore();
const endpointStore = useEndpointStore();
subscriptions.hydrate();
const { localeStore, t, n } = useAppI18n();

const form = reactive({
  planId: "",
  subscriptionId: "",
  firstChargeAt: "",
});
const formError = ref("");
const actionBusy = ref("");
const actionMessage = ref("");
const workspaceMode = ref<"current" | "add">("current");
let actionGeneration = 0;

const SUBSCRIPTION_WRITE_OPERATIONS = {
  create: "POST /v1/subscriptions",
  pause: "POST /v1/subscriptions/{subscription_id}/pause",
  resume: "POST /v1/subscriptions/{subscription_id}/resume",
  cancel: "POST /v1/subscriptions/{subscription_id}/cancel",
  keep: "POST /v1/subscriptions/{subscription_id}/keep",
  charge: "POST /v1/subscriptions/{subscription_id}/charge-now",
} as const;

type SubscriptionWriteOperation =
  (typeof SUBSCRIPTION_WRITE_OPERATIONS)[keyof typeof SUBSCRIPTION_WRITE_OPERATIONS];

const activeAccount = computed(() => session.activeAccount);
const activeAccountId = computed(() => activeAccount.value?.accountId ?? "");
const subscriptionOperationSupported = (
  operation: SubscriptionWriteOperation,
) =>
  endpointStore.writeAllowed &&
  isEndpointFeatureOperationSupported(
    endpointStore.inspection,
    "subscriptionWrites",
    operation,
  );
const subscriptionCreateSupported = computed(() =>
  subscriptionOperationSupported(SUBSCRIPTION_WRITE_OPERATIONS.create),
);
const anySubscriptionWriteSupported = computed(() =>
  Object.values(SUBSCRIPTION_WRITE_OPERATIONS).some((operation) =>
    subscriptionOperationSupported(operation),
  ),
);
const subscriptionWriteReason = (operation?: SubscriptionWriteOperation) => {
  if (endpointStore.state === "checking") {
    return t("Wait for endpoint capability inspection to finish.");
  }
  if (!endpointStore.writeAllowed) {
    return (
      endpointStore.diagnostic ||
      t("Writes are blocked until the endpoint identity is verified.")
    );
  }
  if (operation) {
    return t("This endpoint does not advertise {operation}.", { operation });
  }
  return t(
    "This endpoint does not advertise the required subscription write operations.",
  );
};

const unitLabel = computed(() => {
  const asset = session.connection.assetDefinitionId || "";
  if (!asset) return "units";
  return deriveAssetSymbol(asset, "units");
});

const sortedRecords = computed(() =>
  [...subscriptions.records].sort((a, b) => {
    const left = recordNextCharge(a) ?? Number.MAX_SAFE_INTEGER;
    const right = recordNextCharge(b) ?? Number.MAX_SAFE_INTEGER;
    return left - right;
  }),
);

const activeCount = computed(
  () =>
    subscriptions.records.filter(
      (record) => subscriptionStatusFromItem(record) === "active",
    ).length,
);
const pausedCount = computed(
  () =>
    subscriptions.records.filter(
      (record) => subscriptionStatusFromItem(record) === "paused",
    ).length,
);
const pastDueCount = computed(
  () =>
    subscriptions.records.filter(
      (record) => subscriptionStatusFromItem(record) === "past_due",
    ).length,
);

const generatedSubscriptionId = computed(() =>
  activeAccountId.value && form.planId
    ? buildSubscriptionNftId(activeAccountId.value, form.planId)
    : "sub_...$subscriptions.universal",
);

const formatDateMs = (timestampMs: number | null) => {
  if (timestampMs === null) return t("—");
  return new Intl.DateTimeFormat(localeStore.current, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestampMs));
};

const formatSubscriptionAmount = (value: number) =>
  n(value, { maximumFractionDigits: 6 });

const lastUpdatedLabel = computed(() => {
  if (!subscriptions.lastUpdatedAtMs) return "";
  return t("Loaded from Torii at {time}", {
    time: formatDateMs(subscriptions.lastUpdatedAtMs),
  });
});

const nextDueLabel = computed(() => {
  if (subscriptions.recordsError) return t("Unavailable");
  const next = sortedRecords.value.find(
    (record) => subscriptionStatusFromItem(record) === "active",
  );
  if (!next) return t("None scheduled");
  return t("{merchant} on {date}", {
    merchant: recordTitle(next),
    date: formatDateMs(recordNextCharge(next)),
  });
});

const currentSubscriptionContext = () => {
  const inspection = endpointStore.inspection;
  return {
    toriiUrl: session.connection.toriiUrl.trim(),
    accountId: activeAccountId.value.trim(),
    chainId: session.connection.chainId.trim(),
    networkPrefix: session.connection.networkPrefix,
    observedChainId: inspection?.observed?.chainId?.trim() ?? "",
    observedNetworkPrefix: inspection?.observed?.networkPrefix ?? null,
    observedGenesisHash: inspection?.observed?.genesisHash ?? "",
    identityStatus: inspection?.identityStatus ?? "uninspected",
  };
};

const currentPendingReconciliations = computed(() => {
  const context = currentSubscriptionContext();
  return context.toriiUrl ? subscriptions.pendingForContext(context) : [];
});

const pendingBlocksGeneratedSubscription = computed(() => {
  const subscriptionId =
    form.subscriptionId.trim() || generatedSubscriptionId.value;
  const context = currentSubscriptionContext();
  return Boolean(
    context.toriiUrl &&
      subscriptionId &&
      subscriptions.hasPendingForSubscription(context, subscriptionId),
  );
});

const recordHasPendingReconciliation = (record: SubscriptionListItemView) => {
  const context = currentSubscriptionContext();
  return Boolean(
    context.toriiUrl &&
      subscriptions.hasPendingForSubscription(context, record.subscription_id),
  );
};

const pendingActionLabel = (pending: SubscriptionPendingReconciliation) => {
  switch (pending.action) {
    case "create":
      return t("Subscription creation");
    case "pause":
      return t("Pause");
    case "resume":
      return t("Resume");
    case "cancel":
      return t("Cancel");
    case "keep":
      return t("Keep subscription");
    case "charge_now":
      return t("Charge now");
  }
};

const refresh = async () => {
  const context = currentSubscriptionContext();
  if (!context.toriiUrl) {
    subscriptions.activateContext(null);
    return;
  }
  await subscriptions.refresh(context);
};

watch(
  () => subscriptions.plans.map((plan) => plan.plan_id).join("|"),
  () => {
    if (!form.planId && subscriptions.plans[0]) {
      form.planId = subscriptions.plans[0].plan_id;
    }
  },
);

watch(
  () => JSON.stringify(currentSubscriptionContext()),
  () => {
    actionGeneration += 1;
    actionBusy.value = "";
    actionMessage.value = "";
    formError.value = "";
    form.planId = "";
    form.subscriptionId = "";
    form.firstChargeAt = "";
    const context = currentSubscriptionContext();
    if (!context.toriiUrl) {
      subscriptions.activateContext(null);
      return;
    }
    subscriptions.activateContext(context);
    void subscriptions.refresh(context);
  },
  { flush: "sync", immediate: true },
);

const planLabel = (plan: SubscriptionPlanListItemView) => {
  const planId = planIdFromPlanItem(plan);
  const symbol = deriveAssetSymbol(planId, "");
  return symbol || shortenIdentifier(planId);
};

const planProvider = (plan: SubscriptionPlanListItemView) => {
  const payload = planPayloadFromPlanItem(plan);
  return String(payload?.provider ?? t("—"));
};

const planPricingLabel = (plan: SubscriptionPlanListItemView) =>
  formatPlanPricing(
    planPayloadFromPlanItem(plan),
    unitLabel.value,
    t,
    formatSubscriptionAmount,
  );

const planCadenceLabel = (plan: SubscriptionPlanListItemView) =>
  formatPlanCadence(planPayloadFromPlanItem(plan), t);

const recordPlanPayload = (record: SubscriptionListItemView) => {
  const embedded = planFromSubscriptionItem(record);
  if (embedded) return embedded;
  const planId = subscriptionPlanIdFromItem(record);
  const listed = subscriptions.plans.find((plan) => plan.plan_id === planId);
  return listed ? planPayloadFromPlanItem(listed) : null;
};

const recordTitle = (record: SubscriptionListItemView) => {
  const planId = subscriptionPlanIdFromItem(record);
  const symbol = deriveAssetSymbol(planId, "");
  return symbol || shortenIdentifier(planId || record.subscription_id);
};

const recordPricingLabel = (record: SubscriptionListItemView) =>
  formatPlanPricing(
    recordPlanPayload(record),
    unitLabel.value,
    t,
    formatSubscriptionAmount,
  );

const recordCadenceLabel = (record: SubscriptionListItemView) =>
  formatPlanCadence(recordPlanPayload(record), t);

const recordNextCharge = (record: SubscriptionListItemView) =>
  subscriptionNextChargeMs(record);

const statusLabel = (record: SubscriptionListItemView) => {
  if (subscriptionCancelAtPeriodEnd(record)) return t("Canceling");
  switch (subscriptionStatusFromItem(record)) {
    case "active":
      return t("Active");
    case "paused":
      return t("Paused");
    case "past_due":
      return t("Past due");
    case "canceled":
      return t("Canceled");
    case "suspended":
      return t("Suspended");
    default:
      return t("Unknown");
  }
};

const statusTone = (record: SubscriptionListItemView) => {
  if (subscriptionCancelAtPeriodEnd(record)) return "warning";
  switch (subscriptionStatusFromItem(record)) {
    case "active":
      return "positive";
    case "paused":
      return "muted";
    case "past_due":
    case "suspended":
      return "warning";
    case "canceled":
      return "error";
    default:
      return "muted";
  }
};

const canPauseOrResume = (record: SubscriptionListItemView) =>
  !["canceled", "suspended", "unknown"].includes(
    subscriptionStatusFromItem(record),
  );

const canCancelOrKeep = (record: SubscriptionListItemView) =>
  subscriptionCancelAtPeriodEnd(record) ||
  ["active", "past_due"].includes(subscriptionStatusFromItem(record));

const canChargeNow = (record: SubscriptionListItemView) =>
  ["active", "past_due"].includes(subscriptionStatusFromItem(record));

const pauseOperationForRecord = (
  record: SubscriptionListItemView,
): SubscriptionWriteOperation =>
  subscriptionStatusFromItem(record) === "paused"
    ? SUBSCRIPTION_WRITE_OPERATIONS.resume
    : SUBSCRIPTION_WRITE_OPERATIONS.pause;

const cancelOperationForRecord = (
  record: SubscriptionListItemView,
): SubscriptionWriteOperation =>
  subscriptionCancelAtPeriodEnd(record)
    ? SUBSCRIPTION_WRITE_OPERATIONS.keep
    : SUBSCRIPTION_WRITE_OPERATIONS.cancel;

const recordBelongsToCurrentContext = (record: SubscriptionListItemView) =>
  subscriptions.ownsRecord(record, currentSubscriptionContext());

const pauseLabel = (record: SubscriptionListItemView) =>
  subscriptionStatusFromItem(record) === "paused" ? t("Resume") : t("Pause");

const cancelLabel = (record: SubscriptionListItemView) =>
  subscriptionCancelAtPeriodEnd(record)
    ? t("Keep subscription")
    : t("Cancel at period end");

const billingTriggerId = (record: SubscriptionListItemView) =>
  String(record.subscription.billing_trigger_id ?? "").trim();

const invoiceLabel = (record: SubscriptionListItemView) => {
  const invoice = subscriptionLatestInvoice(record);
  if (!invoice) return "";
  const assetDefinition = String(invoice.asset_definition ?? "").trim();
  const unit = assetDefinition
    ? deriveAssetSymbol(assetDefinition, unitLabel.value)
    : unitLabel.value;
  const amount =
    formatSubscriptionQuantity(invoice.amount, formatSubscriptionAmount) ||
    t("—");
  const rawStatus = invoice.status;
  const status =
    typeof rawStatus === "object" && rawStatus
      ? String((rawStatus as Record<string, unknown>).status ?? "")
      : String(rawStatus ?? "");
  return t("Last invoice: {amount} {unit} ({status})", {
    amount,
    unit,
    status: status || t("unknown"),
  });
};

const parseFirstChargeMs = () => {
  if (!form.firstChargeAt) return undefined;
  const timestamp = new Date(form.firstChargeAt).getTime();
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    throw new Error(t("First charge time is invalid."));
  }
  return timestamp;
};

const resetForm = () => {
  form.subscriptionId = "";
  form.firstChargeAt = "";
};

const captureActionContext = () => currentSubscriptionContext();

const isCurrentAction = (
  generation: number,
  context: ReturnType<typeof captureActionContext>,
) => generation === actionGeneration && subscriptions.isCurrentContext(context);

const assertSuccessfulSubscriptionResult = (
  result: SubscriptionActionResponseView,
  expectedSubscriptionId: string,
  expectedAction: SubscriptionMutationActionView,
) => {
  if (result.ok !== true) {
    throw new Error("Subscription response did not confirm success.");
  }
  if (result.subscription_id !== expectedSubscriptionId) {
    throw new Error(
      "Subscription response does not match the requested subscription.",
    );
  }
  if (result.action !== expectedAction) {
    throw new Error(
      "Subscription response does not match the requested action.",
    );
  }
  if (!/^[0-9a-f]{64}$/u.test(result.tx_hash_hex)) {
    throw new Error(
      "Subscription response did not include a valid transaction hash.",
    );
  }
  if (
    result.finality?.status !== "finalized" ||
    result.finality.transactionHash !== result.tx_hash_hex ||
    !Number.isSafeInteger(result.finality.blockHeight) ||
    result.finality.blockHeight < 1 ||
    !/^[0-9a-f]{64}$/u.test(result.finality.blockHash) ||
    !Number.isSafeInteger(result.finality.finalizedBlockHeight) ||
    result.finality.finalizedBlockHeight < result.finality.blockHeight
  ) {
    throw new Error(
      "Subscription response did not prove the transaction in a finalized block.",
    );
  }
  if (
    result.state_status !== "confirmed" &&
    result.state_status !== "advanced" &&
    result.state_status !== "indexing"
  ) {
    throw new Error(
      "Subscription response did not include authoritative state reconciliation.",
    );
  }
};

const appendSubscriptionReconciliation = (
  message: string,
  result: SubscriptionActionResponseView,
) =>
  result.state_status === "indexing" && result.reconciliation_message
    ? `${message} ${result.reconciliation_message}`
    : message;

const subscribe = async () => {
  formError.value = "";
  actionMessage.value = "";
  const accountId = activeAccountId.value;
  const planId = form.planId.trim();
  if (!subscriptionCreateSupported.value) {
    formError.value = subscriptionWriteReason(
      SUBSCRIPTION_WRITE_OPERATIONS.create,
    );
    return;
  }
  if (!accountId) {
    formError.value = t("Configure account first");
    return;
  }
  if (!planId) {
    formError.value = t("Enter a plan ID.");
    return;
  }
  const context = captureActionContext();
  const generation = ++actionGeneration;
  actionBusy.value = "create";
  try {
    const subscriptionId =
      form.subscriptionId.trim() || generatedSubscriptionId.value;
    const result = await subscriptions.create({
      ...context,
      subscriptionId,
      planId,
      firstChargeMs: parseFirstChargeMs(),
    });
    assertSuccessfulSubscriptionResult(result, subscriptionId, "create");
    if (!isCurrentAction(generation, context)) {
      return;
    }
    actionMessage.value = appendSubscriptionReconciliation(
      appendTransactionFee(
        `${t("Subscription finalized: {hash}", {
          hash: shortenIdentifier(result.tx_hash_hex),
        })} · ${t("Block {height}", {
          height: result.finality.blockHeight,
        })}`,
        result.feeQuote,
        t,
      ),
      result,
    );
    if (result.state_status !== "indexing") {
      resetForm();
    }
    await subscriptions.refresh(context);
  } catch (error) {
    if (!isCurrentAction(generation, context)) {
      return;
    }
    formError.value =
      error instanceof Error ? error.message : t("Action failed.");
  } finally {
    if (isCurrentAction(generation, context)) {
      actionBusy.value = "";
    }
  }
};

const runRecordAction = async (
  record: SubscriptionListItemView,
  kind: "pause" | "resume" | "cancel" | "keep" | "charge",
) => {
  const accountId = activeAccountId.value;
  const operation =
    kind === "pause"
      ? SUBSCRIPTION_WRITE_OPERATIONS.pause
      : kind === "resume"
        ? SUBSCRIPTION_WRITE_OPERATIONS.resume
        : kind === "cancel"
          ? SUBSCRIPTION_WRITE_OPERATIONS.cancel
          : kind === "keep"
            ? SUBSCRIPTION_WRITE_OPERATIONS.keep
            : SUBSCRIPTION_WRITE_OPERATIONS.charge;
  if (!accountId || !subscriptionOperationSupported(operation)) {
    formError.value = subscriptionWriteReason(operation);
    return;
  }
  const context = captureActionContext();
  const generation = ++actionGeneration;
  const subscriptionId = record.subscription_id;
  actionBusy.value = `${subscriptionId}:${kind}`;
  actionMessage.value = "";
  formError.value = "";
  try {
    const input = {
      ...context,
      subscriptionId,
    };
    const result =
      kind === "pause"
        ? await subscriptions.pause(record, input)
        : kind === "resume"
          ? await subscriptions.resume(record, input)
          : kind === "cancel"
            ? await subscriptions.cancel(record, {
                ...input,
                cancelMode: "period_end",
              })
            : kind === "keep"
              ? await subscriptions.keep(record, input)
              : await subscriptions.chargeNow(record, input);
    assertSuccessfulSubscriptionResult(
      result,
      subscriptionId,
      kind === "charge" ? "charge_now" : kind,
    );
    if (!isCurrentAction(generation, context)) {
      return;
    }
    actionMessage.value = appendSubscriptionReconciliation(
      appendTransactionFee(
        `${t("Subscription action finalized: {hash}", {
          hash: shortenIdentifier(result.tx_hash_hex),
        })} · ${t("Block {height}", {
          height: result.finality.blockHeight,
        })}`,
        result.feeQuote,
        t,
      ),
      result,
    );
    await subscriptions.refresh(context);
  } catch (error) {
    if (!isCurrentAction(generation, context)) {
      return;
    }
    formError.value =
      error instanceof Error ? error.message : t("Action failed.");
  } finally {
    if (isCurrentAction(generation, context)) {
      actionBusy.value = "";
    }
  }
};

const reconcilePendingTransaction = async (
  pending: SubscriptionPendingReconciliation,
) => {
  const context = captureActionContext();
  const generation = ++actionGeneration;
  actionBusy.value = `reconcile:${pending.transactionHash}`;
  actionMessage.value = "";
  formError.value = "";
  try {
    const result = await subscriptions.reconcilePending(pending, context);
    if (!isCurrentAction(generation, context)) {
      return;
    }
    const message =
      result.state_status === "indexing"
        ? t("Finalized transaction is still indexing: {hash}", {
            hash: shortenIdentifier(result.tx_hash_hex),
          })
        : t("Finalized subscription state reconciled: {hash}", {
            hash: shortenIdentifier(result.tx_hash_hex),
          });
    actionMessage.value = appendSubscriptionReconciliation(
      appendTransactionFee(
        `${message} · ${t("Block {height}", {
          height: result.finality.blockHeight,
        })}`,
        result.feeQuote,
        t,
      ),
      result,
    );
    await subscriptions.refresh(context);
  } catch (error) {
    if (!isCurrentAction(generation, context)) {
      return;
    }
    formError.value =
      error instanceof Error ? error.message : t("Action failed.");
  } finally {
    if (isCurrentAction(generation, context)) {
      actionBusy.value = "";
    }
  }
};

const togglePause = (record: SubscriptionListItemView) => {
  void runRecordAction(
    record,
    subscriptionStatusFromItem(record) === "paused" ? "resume" : "pause",
  );
};

const toggleCancel = (record: SubscriptionListItemView) => {
  void runRecordAction(
    record,
    subscriptionCancelAtPeriodEnd(record) ? "keep" : "cancel",
  );
};

const chargeNow = (record: SubscriptionListItemView) => {
  void runRecordAction(record, "charge");
};

const shortenIdentifier = (value: string) => {
  if (value.length <= 22) {
    return value;
  }
  return `${value.slice(0, 10)}…${value.slice(-10)}`;
};
</script>

<style scoped>
.subscriptions-summary-card,
.subscriptions-form-card,
.subscriptions-list-card {
  background: var(--frost-panel-raised);
  -webkit-backdrop-filter: var(--frost-filter-panel);
  backdrop-filter: var(--frost-filter-panel);
}

.subscriptions-summary-grid,
.subscriptions-next-panel {
  background: var(--frost-panel-inset);
  -webkit-backdrop-filter: var(--frost-filter-soft);
  backdrop-filter: var(--frost-filter-soft);
}
</style>

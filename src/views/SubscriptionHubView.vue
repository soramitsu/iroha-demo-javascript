<template>
  <div class="subscriptions-shell">
    <section class="card subscriptions-summary-card">
      <header class="card-header">
        <div>
          <h2>{{ t("Subscription Hub") }}</h2>
          <p class="helper">
            {{ t("Live subscription NFTs and plan metadata from Torii.") }}
          </p>
        </div>
        <div class="subscription-header-actions">
          <span class="pill positive">{{ t("Live Torii data") }}</span>
          <button
            class="secondary"
            :disabled="subscriptions.loading"
            @click="refresh"
          >
            {{ subscriptions.loading ? t("Refreshing…") : t("Refresh") }}
          </button>
        </div>
      </header>
      <div class="subscriptions-overview">
        <div class="grid-2 subscriptions-summary-grid">
          <div class="kv">
            <span class="kv-label">{{ t("Active") }}</span>
            <span class="kv-value">{{ activeCount }}</span>
          </div>
          <div class="kv">
            <span class="kv-label">{{ t("Paused") }}</span>
            <span class="kv-value">{{ pausedCount }}</span>
          </div>
          <div class="kv">
            <span class="kv-label">{{ t("Past due") }}</span>
            <span class="kv-value">{{ pastDueCount }}</span>
          </div>
          <div class="kv">
            <span class="kv-label">{{ t("Plan catalog") }}</span>
            <span class="kv-value">{{ subscriptions.planTotal }}</span>
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
      <p v-if="subscriptions.error" class="message warning">
        {{ subscriptions.error }}
      </p>
      <p v-if="activeAccount?.localOnly" class="message warning">
        {{
          t(
            "This wallet is local-only. Subscription records appear after the account exists on-chain.",
          )
        }}
      </p>
    </section>

    <section class="card subscriptions-form-card">
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
      <form
        class="form-grid subscription-form-grid"
        @submit.prevent="subscribe"
      >
        <label class="subscription-span-2">
          {{ t("Plan ID") }}
          <select v-if="subscriptions.plans.length" v-model="form.planId">
            <option value="">{{ t("Select plan") }}</option>
            <option
              v-for="plan in subscriptions.plans"
              :key="plan.plan_id"
              :value="plan.plan_id"
            >
              {{ planLabel(plan) }}
            </option>
          </select>
          <input
            v-else
            v-model.trim="form.planId"
            :placeholder="t('Manual plan ID')"
          />
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
        <button
          type="submit"
          class="subscription-submit"
          :disabled="actionBusy === 'create'"
        >
          {{
            actionBusy === "create"
              ? t("Submitting…")
              : t("Create subscription")
          }}
        </button>
      </form>
      <p v-if="formError" class="message error">{{ formError }}</p>

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
        <p v-else class="helper subscription-empty">
          {{ t("No live plans found.") }}
        </p>
      </div>
    </section>

    <section class="card subscriptions-list-card">
      <header class="card-header">
        <div>
          <h2>{{ t("All subscriptions") }}</h2>
          <p class="helper">
            {{ t("Owned subscription NFTs for the active wallet.") }}
          </p>
        </div>
        <span class="pill">{{
          t("{count} total", { count: subscriptions.total })
        }}</span>
      </header>
      <div v-if="sortedRecords.length" class="subscription-stack">
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
          <div class="subscription-actions">
            <button
              class="secondary"
              :disabled="!canPauseOrResume(record)"
              @click="togglePause(record)"
            >
              {{ pauseLabel(record) }}
            </button>
            <button
              class="secondary"
              :disabled="!canCancelOrKeep(record)"
              @click="toggleCancel(record)"
            >
              {{ cancelLabel(record) }}
            </button>
            <button
              class="ghost"
              :disabled="!canChargeNow(record)"
              @click="chargeNow(record)"
            >
              {{ t("Charge now") }}
            </button>
          </div>
        </article>
      </div>
      <p v-else class="helper subscription-empty">
        {{ t("This account has no subscriptions on the active network.") }}
      </p>
      <p v-if="actionMessage" class="message success">{{ actionMessage }}</p>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useAppI18n } from "@/composables/useAppI18n";
import { useSubscriptionStore } from "@/stores/subscriptions";
import { useSessionStore } from "@/stores/session";
import type {
  SubscriptionListItemView,
  SubscriptionPlanListItemView,
} from "@/types/iroha";
import {
  buildSubscriptionNftId,
  formatPlanCadence,
  formatPlanPricing,
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

const subscriptions = useSubscriptionStore();
const session = useSessionStore();
const { localeStore, t, n } = useAppI18n();

const form = reactive({
  planId: "",
  subscriptionId: "",
  firstChargeAt: "",
});
const formError = ref("");
const actionBusy = ref("");
const actionMessage = ref("");

const activeAccount = computed(() => session.activeAccount);
const activeAccountId = computed(() => activeAccount.value?.accountId ?? "");

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
  if (!timestampMs) return t("—");
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
  const next = sortedRecords.value.find(
    (record) => subscriptionStatusFromItem(record) === "active",
  );
  if (!next) return t("None scheduled");
  return t("{merchant} on {date}", {
    merchant: recordTitle(next),
    date: formatDateMs(recordNextCharge(next)),
  });
});

watch(
  () => subscriptions.plans.map((plan) => plan.plan_id).join("|"),
  () => {
    if (!form.planId && subscriptions.plans[0]) {
      form.planId = subscriptions.plans[0].plan_id;
    }
  },
);

watch(
  () => [session.connection.toriiUrl, activeAccountId.value],
  () => {
    void refresh();
  },
);

const refresh = async () => {
  const toriiUrl = session.connection.toriiUrl;
  if (!toriiUrl) return;
  await subscriptions.refresh({
    toriiUrl,
    accountId: activeAccountId.value || undefined,
  });
};

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
  const amount = n(Number(invoice.amount ?? 0), { maximumFractionDigits: 6 });
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

const subscribe = async () => {
  formError.value = "";
  actionMessage.value = "";
  const accountId = activeAccountId.value;
  const planId = form.planId.trim();
  if (!accountId) {
    formError.value = t("Configure account first");
    return;
  }
  if (!planId) {
    formError.value = t("Enter a plan ID.");
    return;
  }
  actionBusy.value = "create";
  try {
    const subscriptionId =
      form.subscriptionId.trim() || buildSubscriptionNftId(accountId, planId);
    const result = await subscriptions.create({
      toriiUrl: session.connection.toriiUrl,
      accountId,
      privateKeyHex: activeAccount.value?.privateKeyHex || undefined,
      subscriptionId,
      planId,
      firstChargeMs: parseFirstChargeMs(),
    });
    actionMessage.value = t("Subscription submitted: {hash}", {
      hash: shortenIdentifier(result.tx_hash_hex),
    });
    resetForm();
    await refresh();
  } catch (error) {
    formError.value =
      error instanceof Error ? error.message : t("Action failed.");
  } finally {
    actionBusy.value = "";
  }
};

const runRecordAction = async (
  record: SubscriptionListItemView,
  kind: "pause" | "resume" | "cancel" | "keep" | "charge",
) => {
  const accountId = activeAccountId.value;
  if (!accountId) return;
  const subscriptionId = record.subscription_id;
  actionBusy.value = `${subscriptionId}:${kind}`;
  actionMessage.value = "";
  formError.value = "";
  try {
    const input = {
      toriiUrl: session.connection.toriiUrl,
      accountId,
      privateKeyHex: activeAccount.value?.privateKeyHex || undefined,
      subscriptionId,
    };
    const result =
      kind === "pause"
        ? await subscriptions.pause(input)
        : kind === "resume"
          ? await subscriptions.resume(input)
          : kind === "cancel"
            ? await subscriptions.cancel({
                ...input,
                cancelMode: "period_end",
              })
            : kind === "keep"
              ? await subscriptions.keep(input)
              : await subscriptions.chargeNow(input);
    actionMessage.value = t("Subscription action submitted: {hash}", {
      hash: shortenIdentifier(result.tx_hash_hex),
    });
    await refresh();
  } catch (error) {
    formError.value =
      error instanceof Error ? error.message : t("Action failed.");
  } finally {
    actionBusy.value = "";
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

onMounted(() => {
  subscriptions.hydrate();
  void refresh();
});
</script>

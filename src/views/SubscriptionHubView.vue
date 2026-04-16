<template>
  <div class="subscriptions-shell">
    <section class="card subscriptions-summary-card">
      <header class="card-header">
        <div>
          <h2>{{ t("Subscription Hub") }}</h2>
          <p class="helper">
            {{
              t(
                "Auto-deduct runs on due dates. Usage-based subscriptions can fluctuate each billing cycle.",
              )
            }}
          </p>
        </div>
        <span class="pill positive">{{ t("Auto-deduct on") }}</span>
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
            <span class="kv-label">{{ t("Canceled") }}</span>
            <span class="kv-value">{{ canceledCount }}</span>
          </div>
          <div class="kv">
            <span class="kv-label">{{ t("Next auto-deduct") }}</span>
            <span class="kv-value">{{ nextDueLabel }}</span>
          </div>
        </div>
        <div class="subscriptions-next-panel">
          <p class="meta-label">{{ t("Next auto-deduct") }}</p>
          <p class="subscriptions-next-label">{{ nextDueLabel }}</p>
          <p class="helper">
            {{
              t(
                "Leave amount blank and set a max for usage-based billing. Auto-deduct runs automatically.",
              )
            }}
          </p>
        </div>
      </div>
    </section>

    <section class="card subscriptions-form-card">
      <header class="card-header">
        <div>
          <h2>{{ t("Add subscription") }}</h2>
          <p class="helper">
            {{
              t(
                "Leave amount blank and set a max for usage-based billing. Auto-deduct runs automatically.",
              )
            }}
          </p>
        </div>
      </header>
      <form
        class="form-grid subscription-form-grid"
        @submit.prevent="addSubscription"
      >
        <label class="subscription-span-2">
          {{ t("Service name") }}
          <input v-model.trim="form.merchant" />
        </label>
        <label>
          {{ t("Amount ({unit})", { unit: unitLabel }) }}
          <input v-model.trim="form.amount" type="number" min="0" step="0.01" />
        </label>
        <label>
          {{ t("Max for usage-based ({unit})", { unit: unitLabel }) }}
          <input
            v-model.trim="form.maxAmount"
            type="number"
            min="0"
            step="0.01"
          />
        </label>
        <label>
          {{ t("Cadence") }}
          <select v-model="form.cadence">
            <option value="monthly">{{ t("Monthly") }}</option>
            <option value="quarterly">{{ t("Quarterly") }}</option>
            <option value="yearly">{{ t("Yearly") }}</option>
          </select>
        </label>
        <label class="subscription-span-2">
          {{ t("Note") }}
          <input v-model.trim="form.note" />
        </label>
        <button type="submit" class="subscription-submit">
          {{ t("Add subscription") }}
        </button>
      </form>
      <p v-if="formError" class="message error">{{ formError }}</p>
    </section>

    <section class="card subscriptions-list-card">
      <header class="card-header">
        <div>
          <h2>{{ t("All subscriptions") }}</h2>
          <p class="helper">
            {{
              t(
                "Auto-deduct runs on due dates. Usage-based subscriptions can fluctuate each billing cycle.",
              )
            }}
          </p>
        </div>
        <span class="pill">{{
          t("{count} total", { count: sortedRecords.length })
        }}</span>
      </header>
      <div v-if="sortedRecords.length" class="subscription-stack">
        <article
          v-for="record in sortedRecords"
          :key="record.id"
          class="subscription-card"
        >
          <div class="subscription-card-main">
            <div class="subscription-header">
              <div class="subscription-headline">
                <h3>{{ record.merchant }}</h3>
                <p class="helper">
                  {{
                    formatAmount(
                      record.amountType,
                      record.amount,
                      record.maxAmount,
                      unitLabel,
                      t,
                      formatSubscriptionAmount,
                    )
                  }}
                  ·
                  {{ cadenceLabel(record.cadence) }}
                </p>
              </div>
              <span class="pill" :class="statusTone(record)">{{
                statusLabel(record)
              }}</span>
            </div>
            <div class="subscription-meta">
              <span>{{
                t("Next: {date}", { date: formatDate(record.nextChargeAt) })
              }}</span>
              <span v-if="record.lastChargeAt">
                {{ t("Last:") }}
                {{
                  formatAmount(
                    "fixed",
                    record.lastChargeAmount,
                    null,
                    unitLabel,
                    t,
                    formatSubscriptionAmount,
                  )
                }}
                {{ t("on {date}", { date: formatDate(record.lastChargeAt) }) }}
              </span>
              <span v-if="record.cancelAtPeriodEnd">{{
                t("Canceling at period end")
              }}</span>
            </div>
            <p v-if="record.note" class="subscription-note">
              {{ record.note }}
            </p>
          </div>
          <div class="subscription-actions">
            <button
              class="secondary"
              :disabled="record.status === 'canceled'"
              @click="togglePause(record)"
            >
              {{ pauseLabel(record) }}
            </button>
            <button
              class="secondary"
              :disabled="record.status === 'canceled'"
              @click="toggleCancel(record)"
            >
              {{ cancelLabel(record) }}
            </button>
            <button class="ghost" @click="removeSubscription(record)">
              {{ t("Remove") }}
            </button>
          </div>
        </article>
      </div>
      <p v-else class="helper subscription-empty">
        {{ t("No subscriptions yet.") }}
      </p>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { useAppI18n } from "@/composables/useAppI18n";
import { useSubscriptionStore } from "@/stores/subscriptions";
import { useSessionStore } from "@/stores/session";
import {
  formatAmount,
  type SubscriptionCadence,
  type SubscriptionRecord,
} from "@/utils/subscriptions";
import { deriveAssetSymbol } from "@/utils/assetId";

const subscriptions = useSubscriptionStore();
const session = useSessionStore();
const { localeStore, t, n } = useAppI18n();

const form = reactive({
  merchant: "",
  amount: "",
  maxAmount: "",
  cadence: "monthly",
  note: "",
});
const formError = ref("");

const unitLabel = computed(() => {
  const asset = session.connection.assetDefinitionId || "";
  if (!asset) return "units";
  return deriveAssetSymbol(asset, "units");
});

const sortedRecords = computed(() =>
  [...subscriptions.records].sort(
    (a, b) =>
      new Date(a.nextChargeAt).getTime() - new Date(b.nextChargeAt).getTime(),
  ),
);

const activeCount = computed(
  () =>
    subscriptions.records.filter((record) => record.status === "active").length,
);
const pausedCount = computed(
  () =>
    subscriptions.records.filter((record) => record.status === "paused").length,
);
const canceledCount = computed(
  () =>
    subscriptions.records.filter((record) => record.status === "canceled")
      .length,
);

const formatDate = (iso: string | null) => {
  if (!iso) return t("—");
  return new Intl.DateTimeFormat(localeStore.current, {
    dateStyle: "medium",
  }).format(new Date(iso));
};

const formatSubscriptionAmount = (value: number) =>
  n(value, { maximumFractionDigits: 2 });

const nextDueLabel = computed(() => {
  const next = sortedRecords.value.find((record) => record.status === "active");
  if (!next) return t("None scheduled");
  return t("{merchant} on {date}", {
    merchant: next.merchant,
    date: formatDate(next.nextChargeAt),
  });
});

const cadenceLabel = (cadence: SubscriptionCadence) => {
  switch (cadence) {
    case "quarterly":
      return t("Quarterly");
    case "yearly":
      return t("Yearly");
    default:
      return t("Monthly");
  }
};

const statusLabel = (record: SubscriptionRecord) => {
  if (record.status === "canceled") return t("Canceled");
  if (record.cancelAtPeriodEnd) return t("Canceling");
  if (record.status === "paused") return t("Paused");
  return t("Active");
};

const statusTone = (record: SubscriptionRecord) => {
  if (record.status === "canceled") return "error";
  if (record.cancelAtPeriodEnd) return "warning";
  if (record.status === "paused") return "muted";
  return "positive";
};

const pauseLabel = (record: SubscriptionRecord) =>
  record.status === "paused" ? t("Resume") : t("Pause");
const cancelLabel = (record: SubscriptionRecord) =>
  record.cancelAtPeriodEnd ? t("Keep subscription") : t("Cancel at period end");

const parseNumber = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

const resetForm = () => {
  form.merchant = "";
  form.amount = "";
  form.maxAmount = "";
  form.cadence = "monthly";
  form.note = "";
};

const addSubscription = () => {
  formError.value = "";
  const merchant = form.merchant.trim();
  if (!merchant) {
    formError.value = t("Enter a service name.");
    return;
  }
  const amount = parseNumber(form.amount);
  const maxAmount = parseNumber(form.maxAmount);
  if (amount == null && maxAmount == null) {
    formError.value = t("Enter an amount or max limit.");
    return;
  }
  subscriptions.addSubscription({
    merchant,
    amount,
    maxAmount,
    cadence: form.cadence as SubscriptionCadence,
    note: form.note.trim() || null,
  });
  resetForm();
};

const togglePause = (record: SubscriptionRecord) => {
  subscriptions.togglePause(record.id);
};

const toggleCancel = (record: SubscriptionRecord) => {
  subscriptions.toggleCancelAtPeriodEnd(record.id);
};

const removeSubscription = (record: SubscriptionRecord) => {
  if (window.confirm(t("Remove {merchant}?", { merchant: record.merchant }))) {
    subscriptions.removeSubscription(record.id);
  }
};

onMounted(() => {
  subscriptions.hydrate();
  subscriptions.syncAutoDeductions();
});
</script>

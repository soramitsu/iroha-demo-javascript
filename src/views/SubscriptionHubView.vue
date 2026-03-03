<template>
  <div class="card-grid">
    <section class="card">
      <header class="card-header">
        <h2>Subscription Hub</h2>
        <span class="pill positive">Auto-deduct on</span>
      </header>
      <div class="grid-2">
        <div class="kv">
          <span class="kv-label">Active</span>
          <span class="kv-value">{{ activeCount }}</span>
        </div>
        <div class="kv">
          <span class="kv-label">Paused</span>
          <span class="kv-value">{{ pausedCount }}</span>
        </div>
        <div class="kv">
          <span class="kv-label">Canceled</span>
          <span class="kv-value">{{ canceledCount }}</span>
        </div>
        <div class="kv">
          <span class="kv-label">Next auto-deduct</span>
          <span class="kv-value">{{ nextDueLabel }}</span>
        </div>
      </div>
      <p class="helper">
        Auto-deduct runs on due dates. Usage-based subscriptions can fluctuate
        each billing cycle.
      </p>
    </section>

    <section class="card">
      <header class="card-header">
        <h2>Add subscription</h2>
      </header>
      <form class="form-grid" @submit.prevent="addSubscription">
        <label>
          Service name
          <input
            v-model.trim="form.merchant"
            placeholder="Service or merchant"
          />
        </label>
        <label>
          Amount ({{ unitLabel }})
          <input
            v-model.trim="form.amount"
            type="number"
            min="0"
            step="0.01"
            placeholder="1500"
          />
        </label>
        <label>
          Max for usage-based ({{ unitLabel }})
          <input
            v-model.trim="form.maxAmount"
            type="number"
            min="0"
            step="0.01"
            placeholder="9000"
          />
        </label>
        <label>
          Cadence
          <select v-model="form.cadence">
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="yearly">Yearly</option>
          </select>
        </label>
        <label>
          Note
          <input v-model.trim="form.note" placeholder="Optional note" />
        </label>
        <button type="submit">Add subscription</button>
      </form>
      <p v-if="formError" class="helper">{{ formError }}</p>
      <p v-else class="helper">
        Leave amount blank and set a max for usage-based billing. Auto-deduct
        runs automatically.
      </p>
    </section>
  </div>

  <section class="card">
    <header class="card-header">
      <h2>All subscriptions</h2>
      <span class="pill">{{ sortedRecords.length }} total</span>
    </header>
    <div v-if="sortedRecords.length" class="subscription-stack">
      <article
        v-for="record in sortedRecords"
        :key="record.id"
        class="subscription-card"
      >
        <div class="subscription-header">
          <div>
            <h3>{{ record.merchant }}</h3>
            <p class="helper">
              {{
                formatAmount(
                  record.amountType,
                  record.amount,
                  record.maxAmount,
                  unitLabel,
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
          <span>Next: {{ formatDate(record.nextChargeAt) }}</span>
          <span v-if="record.lastChargeAt">
            Last:
            {{
              formatAmount("fixed", record.lastChargeAmount, null, unitLabel)
            }}
            on {{ formatDate(record.lastChargeAt) }}
          </span>
          <span v-if="record.cancelAtPeriodEnd">Canceling at period end</span>
        </div>
        <p v-if="record.note" class="subscription-note">{{ record.note }}</p>
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
            Remove
          </button>
        </div>
      </article>
    </div>
    <p v-else class="helper">No subscriptions yet.</p>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { useSubscriptionStore } from "@/stores/subscriptions";
import { useSessionStore } from "@/stores/session";
import {
  formatAmount,
  type SubscriptionCadence,
  type SubscriptionRecord,
} from "@/utils/subscriptions";

const subscriptions = useSubscriptionStore();
const session = useSessionStore();

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
  const [symbol] = asset.split("#");
  return symbol || asset;
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
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(
    new Date(iso),
  );
};

const nextDueLabel = computed(() => {
  const next = sortedRecords.value.find((record) => record.status === "active");
  if (!next) return "None scheduled";
  return `${next.merchant} on ${formatDate(next.nextChargeAt)}`;
});

const cadenceLabel = (cadence: SubscriptionCadence) => {
  switch (cadence) {
    case "quarterly":
      return "Quarterly";
    case "yearly":
      return "Yearly";
    default:
      return "Monthly";
  }
};

const statusLabel = (record: SubscriptionRecord) => {
  if (record.status === "canceled") return "Canceled";
  if (record.cancelAtPeriodEnd) return "Canceling";
  if (record.status === "paused") return "Paused";
  return "Active";
};

const statusTone = (record: SubscriptionRecord) => {
  if (record.status === "canceled") return "error";
  if (record.cancelAtPeriodEnd) return "warning";
  if (record.status === "paused") return "muted";
  return "positive";
};

const pauseLabel = (record: SubscriptionRecord) =>
  record.status === "paused" ? "Resume" : "Pause";
const cancelLabel = (record: SubscriptionRecord) =>
  record.cancelAtPeriodEnd ? "Keep subscription" : "Cancel at period end";

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
    formError.value = "Enter a service name.";
    return;
  }
  const amount = parseNumber(form.amount);
  const maxAmount = parseNumber(form.maxAmount);
  if (amount == null && maxAmount == null) {
    formError.value = "Enter an amount or max limit.";
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
  if (window.confirm(`Remove ${record.merchant}?`)) {
    subscriptions.removeSubscription(record.id);
  }
};

onMounted(() => {
  subscriptions.hydrate();
  subscriptions.syncAutoDeductions();
});
</script>

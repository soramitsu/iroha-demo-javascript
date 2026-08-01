<template>
  <section class="governance-catalog" :aria-label="t('Proposal list')">
    <header class="catalog-header">
      <div>
        <p class="catalog-kicker">{{ t("Ledger proposals") }}</p>
        <h2>{{ t("Proposal queue") }}</h2>
      </div>
      <span class="catalog-count">{{ proposals.length }}</span>
    </header>

    <div class="catalog-filters" role="group" :aria-label="t('List filter')">
      <button
        v-for="option in filters"
        :key="option.value"
        type="button"
        :class="{ active: modelValue === option.value }"
        @click="$emit('update:modelValue', option.value)"
      >
        {{ option.label }}
      </button>
    </div>

    <form class="proposal-lookup" @submit.prevent="$emit('lookup', lookupId)">
      <label>
        <span>{{ t("Proposal ID (0x...)") }}</span>
        <input
          v-model.trim="lookupId"
          class="mono"
          autocomplete="off"
          spellcheck="false"
        />
      </label>
      <button type="submit" :disabled="!lookupId.trim()">
        {{ t("Load") }}
      </button>
    </form>

    <p v-if="error" class="catalog-message error">{{ error }}</p>
    <p v-else-if="loading && !proposals.length" class="catalog-message">
      {{ t("Reading proposals from Torii…") }}
    </p>
    <p v-else-if="!proposals.length" class="catalog-message">
      {{ t("No live proposals match this view.") }}
    </p>

    <div v-else class="proposal-stack">
      <button
        v-for="proposal in proposals"
        :key="proposal.proposalId"
        type="button"
        class="proposal-row"
        :class="{ selected: selectedId === proposal.proposalId }"
        :aria-pressed="selectedId === proposal.proposalId"
        :data-proposal-id="proposal.proposalId"
        @click="$emit('select', proposal.proposalId)"
      >
        <span class="proposal-row-topline">
          <span class="proposal-kind">{{ t(proposal.kindLabelKey) }}</span>
          <span class="proposal-status">{{ t(proposal.status) }}</span>
        </span>
        <strong>{{ shortId(proposal.proposalId) }}</strong>
        <span class="proposal-row-meta">
          <span>{{ t(proposal.currentStage) }}</span>
          <span aria-hidden="true">·</span>
          <span>{{
            t("Block {height}", { height: proposal.createdHeight })
          }}</span>
        </span>
      </button>
    </div>

    <button
      v-if="nextCursor"
      type="button"
      class="load-more"
      :disabled="loading"
      @click="$emit('load-more')"
    >
      {{ loading ? t("Loading…") : t("Load more") }}
    </button>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useAppI18n } from "@/composables/useAppI18n";
import type { GovernanceProposalSummary } from "@/governance/model";
import type { GovernanceCatalogFilter } from "@/stores/parliament";

defineProps<{
  proposals: GovernanceProposalSummary[];
  selectedId: string | null;
  modelValue: GovernanceCatalogFilter;
  nextCursor: string | null;
  loading: boolean;
  error: string;
}>();

defineEmits<{
  "update:modelValue": [value: GovernanceCatalogFilter];
  select: [proposalId: string];
  lookup: [proposalId: string];
  "load-more": [];
}>();

const { t } = useAppI18n();
const lookupId = ref("");
const filters = computed<
  Array<{ value: GovernanceCatalogFilter; label: string }>
>(() => [
  { value: "open", label: t("Open") },
  { value: "all", label: t("All") },
  { value: "mine", label: t("Mine") },
]);

const shortId = (value: string) =>
  value.length > 18 ? `${value.slice(0, 10)}…${value.slice(-6)}` : value;
</script>

<style scoped>
.governance-catalog {
  min-width: 0;
  height: fit-content;
  max-height: calc(100dvh - 186px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--frost-border);
  border-radius: var(--radius-panel);
  background: var(--frost-panel-raised);
  box-shadow: var(--shadow-raised);
  backdrop-filter: var(--frost-filter-panel);
  -webkit-backdrop-filter: var(--frost-filter-panel);
}

.catalog-header {
  padding: 17px 18px 13px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--color-border);
}

.catalog-kicker {
  margin: 0 0 4px;
  color: var(--color-text-muted);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

h2 {
  margin: 0;
  font-size: 1rem;
}

.catalog-count {
  min-width: 28px;
  min-height: 28px;
  display: grid;
  place-items: center;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  color: var(--color-text-muted);
  font-size: 0.75rem;
}

.catalog-filters {
  margin: 12px 14px 8px;
  padding: 3px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 3px;
  border-radius: var(--radius-control);
  background: var(--color-surface-inset);
}

.catalog-filters button {
  min-height: 44px;
  padding: 5px 8px;
  border: 0;
  border-radius: calc(var(--radius-control) - 3px);
  color: var(--color-text-muted);
  background: transparent;
  box-shadow: none;
  font-size: 0.75rem;
}

.catalog-filters button.active {
  color: var(--color-text);
  background: var(--color-surface-raised);
  box-shadow: var(--shadow-control);
}

.proposal-lookup {
  margin: 2px 14px 10px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 7px;
  align-items: end;
}

.proposal-lookup label {
  min-width: 0;
  display: grid;
  gap: 5px;
  color: var(--color-text-muted);
  font-size: 0.65rem;
}

.proposal-lookup input {
  min-width: 0;
  min-height: 44px;
  padding: 6px 8px;
  font-size: 0.68rem;
}

.proposal-lookup button {
  min-height: 44px;
  padding: 6px 10px;
}

.proposal-stack {
  min-height: 0;
  padding: 4px 8px 10px;
  overflow-y: auto;
}

.proposal-row {
  position: relative;
  min-width: 0;
  width: 100%;
  min-height: 94px;
  padding: 13px 12px 12px 15px;
  display: grid;
  gap: 7px;
  overflow: hidden;
  border: 0;
  border-bottom: 1px solid var(--color-border);
  border-radius: 0;
  color: var(--color-text);
  background: transparent;
  box-shadow: none;
  text-align: start;
}

.proposal-row::before {
  content: "";
  position: absolute;
  inset: 12px auto 12px 0;
  width: 2px;
  border-radius: 999px;
  background: transparent;
}

.proposal-row:hover {
  background: color-mix(in srgb, var(--color-surface-soft) 64%, transparent);
}

.proposal-row.selected {
  background: color-mix(in srgb, var(--color-accent-soft) 34%, transparent);
}

.proposal-row.selected::before {
  background: var(--color-accent);
}

.proposal-row-topline,
.proposal-row-meta {
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 7px;
}

.proposal-kind,
.proposal-status,
.proposal-row-meta {
  color: var(--color-text-muted);
  font-size: 0.69rem;
}

.proposal-kind {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.proposal-status {
  flex: none;
}

.proposal-row strong {
  min-width: 0;
  overflow: hidden;
  font-family: var(--mono-font);
  font-size: 0.78rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.proposal-row-meta {
  justify-content: flex-start;
  flex-wrap: wrap;
}

.catalog-message {
  margin: 20px 18px;
  color: var(--color-text-muted);
  font-size: 0.78rem;
  line-height: 1.55;
}

.catalog-message.error {
  color: var(--color-danger);
}

.load-more {
  margin: 0 14px 14px;
  min-height: 44px;
  border-color: var(--color-border);
  color: var(--color-text-muted);
  background: var(--color-surface-soft);
}
</style>

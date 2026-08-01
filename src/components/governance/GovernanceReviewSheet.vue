<template>
  <AppDialog
    :open="Boolean(governance.review)"
    :title="governance.review?.title || t('Review governance action')"
    :eyebrow="t('Decoded transaction')"
    :description="
      t(
        'The exact decoded instruction and ABI21 fee quote are shown before vault signing.',
      )
    "
    :busy="governance.busy === 'commit'"
    :close-label="t('Close')"
    variant="drawer"
    @close="governance.cancelReview"
  >
    <template v-if="governance.review">
      <dl class="review-summary">
        <div>
          <dt>{{ t("Operation") }}</dt>
          <dd>{{ t(governance.review.operation) }}</dd>
        </div>
        <div>
          <dt>{{ t("Fee payer") }}</dt>
          <dd>{{ t(governance.review.fee.payer) }}</dd>
        </div>
        <div>
          <dt>{{ t("Quote height") }}</dt>
          <dd>{{ governance.review.fee.nextBlockHeight }}</dd>
        </div>
        <div>
          <dt>{{ t("Review expires") }}</dt>
          <dd>{{ expiresLabel }}</dd>
        </div>
      </dl>

      <section class="fee-section">
        <h3>{{ t("Maximum charges") }}</h3>
        <p v-if="!governance.review.fee.components.length" class="helper">
          {{ t("No fee components were quoted.") }}
        </p>
        <div
          v-for="component in governance.review.fee.components"
          :key="`${component.kind}:${component.assetDefinitionId}`"
          class="fee-row"
        >
          <span>{{ component.kind }}</span>
          <strong>
            {{ component.maxAmount }} {{ component.assetDefinitionId }}
          </strong>
        </div>
      </section>

      <section class="instruction-section">
        <h3>{{ t("Decoded instruction") }}</h3>
        <pre><code>{{ decodedInstruction }}</code></pre>
      </section>

      <p class="vault-note">
        {{
          t(
            "Confirming asks the local vault to sign this already-quoted payload. Private key material is not displayed or sent to the renderer.",
          )
        }}
      </p>
      <p v-if="governance.actionError" class="message error">
        {{ governance.actionError }}
      </p>
    </template>

    <template #actions>
      <AppButton
        variant="secondary"
        :disabled="governance.busy === 'commit'"
        @click="governance.cancelReview"
      >
        {{ t("Cancel") }}
      </AppButton>
      <AppButton
        :loading="governance.busy === 'commit'"
        @click="governance.confirmReview"
      >
        {{ t("Sign and commit") }}
      </AppButton>
    </template>
  </AppDialog>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useAppI18n } from "@/composables/useAppI18n";
import { useParliamentStore } from "@/stores/parliament";
import { AppButton, AppDialog } from "@/components/ui";

const governance = useParliamentStore();
const { t } = useAppI18n();

const decodedInstruction = computed(() =>
  JSON.stringify(governance.review?.decodedInstruction ?? {}, null, 2),
);
const expiresLabel = computed(() => {
  if (!governance.review) return t("—");
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(governance.review.expiresAtMs);
});
</script>

<style scoped>
.review-summary {
  margin: 0 0 20px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.review-summary > div {
  padding: 11px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  background: var(--color-surface-soft);
}

dt {
  margin-bottom: 5px;
  color: var(--color-text-muted);
  font-size: 0.65rem;
}

dd {
  margin: 0;
  overflow-wrap: anywhere;
  font-size: 0.76rem;
}

.fee-section,
.instruction-section {
  margin-top: 18px;
}

h3 {
  margin: 0 0 9px;
  font-size: 0.8rem;
}

.fee-row {
  padding: 10px 0;
  display: flex;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid var(--color-border);
  font-size: 0.72rem;
}

.fee-row span {
  color: var(--color-text-muted);
}

.fee-row strong {
  overflow-wrap: anywhere;
  text-align: end;
}

pre {
  max-height: 310px;
  margin: 0;
  padding: 14px;
  overflow: auto;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  background: var(--color-surface-inset);
  color: var(--color-text-muted);
  font-size: 0.66rem;
  line-height: 1.5;
  white-space: pre-wrap;
}

.vault-note {
  margin: 16px 0 0;
  color: var(--color-text-muted);
  font-size: 0.69rem;
  line-height: 1.55;
}
</style>

<template>
  <AppDialog
    :open="governance.composerOpen"
    :title="t('New governance proposal')"
    :eyebrow="t('Typed composer')"
    :description="
      t(
        'Build one supported proposal draft, then decode and quote it before signing.',
      )
    "
    :busy="governance.busy === 'prepare'"
    :close-label="t('Close')"
    variant="drawer"
    @close="governance.closeComposer"
  >
    <div
      class="kind-selector"
      role="radiogroup"
      :aria-label="t('Proposal kind')"
    >
      <button
        v-for="kind in supportedKinds"
        :key="kind"
        type="button"
        role="radio"
        :aria-checked="governance.composerKind === kind"
        :class="{ active: governance.composerKind === kind }"
        @click="governance.composerKind = kind"
      >
        <strong>{{ t(adapters[kind].labelKey) }}</strong>
        <span>{{ t(adapters[kind].descriptionKey) }}</span>
      </button>
    </div>

    <section class="protocol-notice">
      <strong>{{ t("Mandatory private Parliament") }}</strong>
      <p>
        {{
          t(
            "Every binding ballot uses the timed-OVN threshold protocol. Proposal-backed PLAIN ballots are not supported.",
          )
        }}
      </p>
    </section>

    <form class="composer-form" @submit.prevent="governance.prepareProposal">
      <template
        v-if="governance.composerKind === 'ValidationFeePayoutLifecycle'"
      >
        <section class="policy-provenance span-2">
          <div>
            <span>{{ t("Sequence") }}</span>
            <strong>{{ t("Step 1 of 2") }}</strong>
          </div>
          <div>
            <span>{{ t("Proposal operator") }}</span>
            <strong class="mono">{{ shortValue(governance.accountId) }}</strong>
          </div>
        </section>
        <label class="span-2">
          {{ t("Exact treasury payout binding") }}
          <textarea
            v-model="governance.validationFeePayoutBindingJson"
            class="mono payload-editor"
            spellcheck="false"
          ></textarea>
        </label>
        <ul
          v-if="governance.validationFeePayoutLifecycleErrors.length"
          class="validation-errors span-2"
        >
          <li
            v-for="error in governance.validationFeePayoutLifecycleErrors"
            :key="error"
          >
            {{ t(error) }}
          </li>
        </ul>
      </template>

      <template v-else-if="governance.composerKind === 'ValidationFeePolicy'">
        <section class="policy-provenance span-2">
          <div>
            <span>{{ t("Observed height") }}</span>
            <strong>{{
              governance.validationFeePolicy?.observedHeight ?? t("Unavailable")
            }}</strong>
          </div>
          <div>
            <span>{{ t("Sequence") }}</span>
            <strong>{{ t("Step 2 of 2") }}</strong>
          </div>
          <div>
            <span>{{ t("Registry head") }}</span>
            <strong class="mono">{{
              shortValue(
                governance.validationFeePolicy?.registryHead?.policyHash,
              )
            }}</strong>
          </div>
          <p v-if="governance.policyError">{{ governance.policyError }}</p>
        </section>

        <label class="span-2">
          {{ t("Network ID") }}
          <input
            v-model.trim="governance.validationFeeComposer.network_id"
            class="mono"
            disabled
          />
        </label>
        <label>
          {{ t("Policy version") }}
          <input
            v-model.trim="governance.validationFeeComposer.policy_version"
            disabled
          />
        </label>
        <label>
          {{ t("Fee amount") }}
          <input
            v-model.trim="governance.validationFeeComposer.fee"
            inputmode="decimal"
            disabled
          />
        </label>
        <label class="span-2">
          {{ t("Previous policy hash") }}
          <input
            :value="governance.validationFeeComposer.previous_policy_hash ?? ''"
            class="mono"
            disabled
          />
        </label>
        <label>
          {{ t("Fee asset ID") }}
          <input
            v-model.trim="governance.validationFeeComposer.ds_asset_id"
            class="mono"
            disabled
          />
        </label>
        <label>
          {{ t("Asset scale") }}
          <input
            v-model.number="governance.validationFeeComposer.ds_scale"
            type="number"
            disabled
          />
        </label>
        <label>
          {{ t("Effective height") }}
          <input
            v-model.trim="
              governance.validationFeeComposer.effective_from_height
            "
            inputmode="numeric"
          />
        </label>
        <label>
          {{ t("Expiry height (optional)") }}
          <input
            :value="governance.validationFeeComposer.expires_after_height ?? ''"
            inputmode="numeric"
            @input="
              governance.validationFeeComposer.expires_after_height =
                ($event.target as HTMLInputElement).value.trim() || null
            "
          />
        </label>
        <label class="span-2">
          {{ t("Treasury account") }}
          <input
            v-model.trim="governance.validationFeeComposer.treasury_account_id"
            class="mono"
          />
        </label>
        <label class="span-2">
          {{ t("Enacted treasury payout binding") }}
          <textarea
            v-model="governance.validationFeePayoutBindingJson"
            class="mono payload-editor"
            spellcheck="false"
          ></textarea>
        </label>
        <label class="span-2">
          {{ t("Payout lifecycle proposal ID (required with binding)") }}
          <input
            v-model.trim="governance.validationFeePayoutLifecycleProposalId"
            class="mono"
            autocomplete="off"
          />
        </label>
        <ul
          v-if="governance.validationFeeComposerErrors.length"
          class="validation-errors span-2"
        >
          <li
            v-for="error in governance.validationFeeComposerErrors"
            :key="error"
          >
            {{ t(error) }}
          </li>
        </ul>
      </template>

      <p v-if="governance.actionError" class="message error span-2">
        {{ governance.actionError }}
      </p>
    </form>

    <template #actions>
      <AppButton
        variant="secondary"
        :disabled="governance.busy === 'prepare'"
        @click="governance.closeComposer"
      >
        {{ t("Cancel") }}
      </AppButton>
      <AppButton
        :loading="governance.busy === 'prepare'"
        :disabled="!canPrepare"
        @click="governance.prepareProposal"
      >
        {{ t("Decode and quote") }}
      </AppButton>
    </template>
  </AppDialog>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useAppI18n } from "@/composables/useAppI18n";
import { GOVERNANCE_KIND_ADAPTERS } from "@/governance/model";
import { useParliamentStore } from "@/stores/parliament";
import { AppButton, AppDialog } from "@/components/ui";

const governance = useParliamentStore();
const { t } = useAppI18n();
const adapters = GOVERNANCE_KIND_ADAPTERS;
const supportedKinds = computed(() => governance.supportedComposerKinds);
const shortValue = (value: string | null | undefined) => {
  if (!value) return t("Unavailable");
  return value.length > 24 ? `${value.slice(0, 12)}…${value.slice(-8)}` : value;
};
const canPrepare = computed(() => {
  if (
    !governance.capabilities ||
    !governance.proposalGate.allowed ||
    governance.busy === "prepare"
  ) {
    return false;
  }
  return governance.composerKind === "ValidationFeePayoutLifecycle"
    ? governance.validationFeePayoutLifecycleErrors.length === 0
    : governance.validationFeeComposerErrors.length === 0;
});
</script>

<style scoped>
.kind-selector {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.kind-selector button {
  min-height: 86px;
  padding: 12px;
  display: grid;
  align-content: start;
  gap: 5px;
  border-color: var(--color-border);
  color: var(--color-text);
  background: var(--color-surface-soft);
  box-shadow: none;
  text-align: start;
}

.kind-selector button.active {
  border-color: color-mix(
    in srgb,
    var(--color-accent) 54%,
    var(--color-border)
  );
  background: var(--color-accent-soft);
}

.kind-selector strong,
.policy-provenance strong {
  font-size: 0.75rem;
}

.kind-selector span,
.policy-provenance span {
  color: var(--color-text-muted);
  font-size: 0.64rem;
}

.protocol-notice,
.policy-provenance {
  padding: 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  background: var(--color-surface-inset);
}

.protocol-notice {
  margin: 15px 0;
}

.protocol-notice strong {
  color: var(--color-accent);
  font-size: 0.74rem;
}

.protocol-notice p,
.policy-provenance p {
  margin: 5px 0 0;
  color: var(--color-text-muted);
  font-size: 0.64rem;
  line-height: 1.5;
}

.composer-form {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.policy-provenance {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.policy-provenance > div {
  display: grid;
  gap: 4px;
}

.policy-provenance p {
  grid-column: 1 / -1;
}

label {
  display: grid;
  align-content: start;
  gap: 6px;
  color: var(--color-text-muted);
  font-size: 0.67rem;
}

.span-2 {
  grid-column: span 2;
}

input,
textarea {
  width: 100%;
  font-size: 0.72rem;
}

.payload-editor {
  min-height: 120px;
  resize: vertical;
}

.validation-errors {
  margin: 0;
  padding: 11px 11px 11px 29px;
  border: 1px solid
    color-mix(in srgb, var(--color-danger) 35%, var(--color-border));
  border-radius: var(--radius-control);
  color: var(--color-danger);
  background: color-mix(in srgb, var(--color-danger) 7%, transparent);
  font-size: 0.65rem;
  line-height: 1.5;
}

.mono {
  font-family: var(--mono-font);
}

@media (max-width: 620px) {
  .kind-selector,
  .composer-form,
  .policy-provenance {
    grid-template-columns: 1fr;
  }

  .span-2,
  .policy-provenance p {
    grid-column: auto;
  }
}
</style>

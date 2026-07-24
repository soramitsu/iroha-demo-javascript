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

    <div class="plain-mode">
      <span class="mode-mark" aria-hidden="true"></span>
      <div>
        <strong>{{ t("Plain voting") }}</strong>
        <p>
          {{ t("The first release submits only reviewable plain referenda.") }}
        </p>
      </div>
      <label>
        <input type="checkbox" disabled />
        {{ t("ZK") }}
      </label>
    </div>

    <form class="composer-form" @submit.prevent="governance.prepareProposal">
      <p class="window-safety span-2">
        {{
          t(
            "Before review, the wallet refreshes Taira and rebases this exact {span}-block window with a {margin}-block submission safety margin above the 600-block minimum.",
            {
              span: governance.capabilities?.windowSpan ?? 3_600,
              margin: governance.proposalReviewSafetyMarginBlocks,
            },
          )
        }}
      </p>
      <template
        v-if="governance.composerKind === 'ValidationFeePayoutLifecycle'"
      >
        <section class="policy-provenance span-2">
          <div>
            <span>{{ t("Sequence") }}</span>
            <strong>{{ t("Step 1 of 2") }}</strong>
          </div>
          <div>
            <span>{{ t("Voting mode") }}</span>
            <strong>{{ t("PLAIN / auto-finalized") }}</strong>
          </div>
          <p>
            {{
              t(
                "Citizens must enact this exact payout lifecycle before its 0.10 SBD policy can be proposed.",
              )
            }}
          </p>
        </section>
        <label class="span-2">
          {{ t("Exact treasury payout binding") }}
          <textarea
            v-model="governance.validationFeePayoutBindingJson"
            class="mono payload-editor"
            spellcheck="false"
          ></textarea>
        </label>
        <label>
          {{ t("Referendum start height") }}
          <input
            v-model.trim="governance.validationFeeLifecycleWindowLower"
            inputmode="numeric"
          />
        </label>
        <label>
          {{ t("Referendum end height") }}
          <input
            v-model.trim="governance.validationFeeLifecycleWindowUpper"
            inputmode="numeric"
          />
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
              shortHash(
                governance.validationFeePolicy?.registryHead?.policyHash,
              )
            }}</strong>
          </div>
          <p v-if="governance.policyError">{{ governance.policyError }}</p>
        </section>

        <label>
          {{ t("Chain ID") }}
          <input
            v-model.trim="governance.validationFeeComposer.chain_id"
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
        <label class="span-2">
          {{ t("Genesis hash") }}
          <input
            v-model.trim="governance.validationFeeComposer.genesis_hash"
            class="mono"
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
            disabled
          />
        </label>
        <label>
          {{ t("Asset scale") }}
          <input
            v-model.number="governance.validationFeeComposer.ds_scale"
            type="number"
            min="2"
            max="2"
            step="1"
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
        <label>
          {{ t("Referendum start height") }}
          <input
            v-model.trim="governance.validationFeeWindowLower"
            inputmode="numeric"
          />
        </label>
        <label>
          {{ t("Referendum end height") }}
          <input
            v-model.trim="governance.validationFeeWindowUpper"
            inputmode="numeric"
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
        <label class="span-2">
          {{ t("Treasury account") }}
          <input
            v-model.trim="governance.validationFeeComposer.treasury_account_id"
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
        <label>
          {{ t("Exemption classes (comma-separated)") }}
          <input v-model="governance.validationFeeExemptions" disabled />
        </label>
        <label class="span-2">
          {{ t("Enacted treasury payout binding") }}
          <textarea
            v-model="governance.validationFeePayoutBindingJson"
            class="mono"
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
const shortHash = (value: string | null | undefined) => {
  if (!value) return t("Genesis policy");
  return value.length > 20 ? `${value.slice(0, 10)}…${value.slice(-7)}` : value;
};
const canPrepare = computed(() => {
  if (!governance.capabilities || governance.busy === "prepare") return false;
  if (governance.composerKind === "ValidationFeePayoutLifecycle") {
    return governance.validationFeePayoutLifecycleErrors.length === 0;
  }
  if (governance.composerKind === "ValidationFeePolicy") {
    return governance.validationFeeComposerErrors.length === 0;
  }
  return governance.supportedComposerKinds.includes(governance.composerKind);
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

.kind-selector strong {
  font-size: 0.75rem;
}

.kind-selector span {
  color: var(--color-text-muted);
  font-size: 0.64rem;
  line-height: 1.4;
}

.plain-mode {
  margin: 15px 0;
  padding: 11px 12px;
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  background: var(--color-surface-inset);
}

.mode-mark {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-accent);
}

.plain-mode strong {
  font-size: 0.72rem;
}

.plain-mode p {
  margin: 2px 0 0;
  color: var(--color-text-muted);
  font-size: 0.62rem;
}

.plain-mode label {
  display: flex;
  align-items: center;
  gap: 5px;
}

.composer-form {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.window-safety {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.64rem;
  line-height: 1.5;
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

textarea {
  min-height: 88px;
  resize: vertical;
}

.payload-editor {
  min-height: 210px;
}

.mono {
  font-family: var(--mono-font);
}

.policy-provenance {
  padding: 11px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  background: var(--color-surface-soft);
}

.policy-provenance div {
  display: grid;
  gap: 4px;
}

.policy-provenance span {
  color: var(--color-text-muted);
  font-size: 0.63rem;
}

.policy-provenance strong {
  overflow-wrap: anywhere;
  font-size: 0.7rem;
}

.policy-provenance p {
  grid-column: span 2;
  margin: 0;
  color: var(--color-warning);
  font-size: 0.65rem;
}

.validation-errors {
  margin: 0;
  padding: 10px 10px 10px 27px;
  border: 1px solid
    color-mix(in srgb, var(--color-warning) 35%, var(--color-border));
  border-radius: var(--radius-control);
  color: var(--color-warning);
  background: color-mix(in srgb, var(--color-warning) 8%, transparent);
  font-size: 0.67rem;
}

@media (max-width: 560px) {
  .kind-selector,
  .composer-form {
    grid-template-columns: 1fr;
  }

  .span-2 {
    grid-column: auto;
  }
}
</style>

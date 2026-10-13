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
      <p>
        {{
          t(
            "Payout-lifecycle proposals are inspect-only: the reviewed Iroha SDK cannot decode that instruction for review, so this wallet does not draft or sign it.",
          )
        }}
      </p>
    </section>

    <form class="composer-form" @submit.prevent="governance.prepareProposal">
      <template v-if="governance.composerKind === 'ValidationFeePolicy'">
        <section class="policy-provenance span-2">
          <div>
            <span>{{ t("Observed height") }}</span>
            <strong>{{
              governance.validationFeePolicy?.observedHeight ?? t("Unavailable")
            }}</strong>
          </div>
          <div>
            <span>{{ t("Effective policy version") }}</span>
            <strong>{{
              governance.validationFeePolicy?.effective.policy_version ??
              t("Unavailable")
            }}</strong>
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
          <p v-else>
            {{
              t(
                "Treasury and reward custody are immutable and must equal the enacted conversion binding. Activation is a Honiara month start at least thirty days after the notice and after Parliament enactment.",
              )
            }}
          </p>
        </section>

        <label class="span-2">
          {{ t("Network ID") }}
          <input
            :value="governance.validationFeeComposer.network_id"
            class="mono"
            disabled
          />
        </label>
        <label>
          {{ t("Policy version") }}
          <input
            :value="governance.validationFeeComposer.policy_version"
            disabled
          />
        </label>
        <label>
          {{ t("Charging mode") }}
          <input :value="t('Retail monthly allowance')" disabled />
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
            :value="governance.validationFeeComposer.ds_asset_id"
            class="mono"
            disabled
          />
        </label>
        <label>
          {{ t("Asset scale") }}
          <input :value="governance.validationFeeComposer.ds_scale" disabled />
        </label>
        <label>
          {{ t("Institutional payment fee (SBD)") }}
          <input
            v-model.trim="governance.validationFeeComposer.fee"
            inputmode="decimal"
            autocomplete="off"
            aria-describedby="validation-fee-institutional-hint"
          />
          <small id="validation-fee-institutional-hint" class="field-hint">
            {{
              t(
                "Charged on each qualifying institutional transfer, separately from the retail monthly allowance.",
              )
            }}
          </small>
        </label>
        <label>
          {{ t("Included payments per month") }}
          <input
            v-model.number="
              governance.validationFeeComposer.retail_schedule.included_payments
            "
            type="number"
            min="1"
            step="1"
          />
        </label>
        <label>
          {{ t("Overage fee (minor units)") }}
          <input
            v-model.number="
              governance.validationFeeComposer.retail_schedule.overage_minor
            "
            type="number"
            min="1"
            step="1"
          />
        </label>
        <fieldset class="tier-editor span-2">
          <legend>{{ t("Maintenance tiers (minor units)") }}</legend>
          <div
            v-for="(tier, index) in governance.validationFeeComposer
              .retail_schedule.maintenance_tiers"
            :key="index"
            class="tier-row"
          >
            <label>
              {{ t("Minimum average balance") }}
              <input
                v-model.number="tier.minimum_average_balance_minor"
                type="number"
                min="0"
                step="1"
                :disabled="index === 0"
              />
            </label>
            <label>
              {{ t("Monthly fee") }}
              <input
                v-model.number="tier.monthly_fee_minor"
                type="number"
                min="1"
                step="1"
              />
            </label>
            <AppButton
              variant="ghost"
              size="sm"
              :disabled="index === 0"
              @click="governance.removeValidationFeeMaintenanceTier(index)"
            >
              {{ t("Remove tier") }}
            </AppButton>
          </div>
          <AppButton
            variant="secondary"
            size="sm"
            :disabled="
              governance.validationFeeComposer.retail_schedule.maintenance_tiers
                .length >= tierLimit
            "
            @click="governance.addValidationFeeMaintenanceTier"
          >
            {{ t("Add tier") }}
          </AppButton>
        </fieldset>
        <label>
          {{ t("Notice published") }}
          <input
            :value="
              honiaraTime(
                governance.validationFeeComposer.notice_published_at_ms,
              )
            "
            disabled
          />
        </label>
        <label>
          {{ t("Activation month") }}
          <select
            v-model.number="governance.validationFeeComposer.effective_from_ms"
          >
            <option
              v-for="choice in governance.validationFeeActivationChoices"
              :key="choice"
              :value="choice"
            >
              {{ honiaraTime(choice) }}
            </option>
          </select>
        </label>
        <label class="span-2">
          {{ t("Treasury account") }}
          <input
            :value="governance.validationFeeComposer.treasury_account_id"
            class="mono"
            disabled
          />
        </label>
        <label class="span-2">
          {{ t("Reward custody contract") }}
          <input
            :value="
              governance.validationFeeComposer.reward_custody.contract_address
            "
            class="mono"
            disabled
          />
        </label>
        <label class="span-2">
          {{ t("Reward pool account") }}
          <input
            :value="
              governance.validationFeeComposer.reward_custody
                .reward_pool_account_id
            "
            class="mono"
            disabled
          />
        </label>
        <label>
          {{ t("XOR asset ID") }}
          <input
            :value="
              governance.validationFeeComposer.reward_custody.xor_asset_id
            "
            class="mono"
            disabled
          />
        </label>
        <label>
          {{ t("Validator lane") }}
          <input
            :value="
              governance.validationFeeComposer.reward_custody.validator_lane_id
            "
            disabled
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
import {
  GOVERNANCE_KIND_ADAPTERS,
  RETAIL_MAINTENANCE_TIER_LIMIT,
  formatHoniaraTimestamp,
} from "@/governance/model";
import { useParliamentStore } from "@/stores/parliament";
import { AppButton, AppDialog } from "@/components/ui";

const governance = useParliamentStore();
const { t } = useAppI18n();
const adapters = GOVERNANCE_KIND_ADAPTERS;
const supportedKinds = computed(() => governance.supportedComposerKinds);
const tierLimit = RETAIL_MAINTENANCE_TIER_LIMIT;
const honiaraTime = (ms: number) => {
  const time = formatHoniaraTimestamp(ms);
  return time ? t("{time} Honiara time", { time }) : t("Unavailable");
};
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
  return governance.validationFeeComposerErrors.length === 0;
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
select {
  width: 100%;
  font-size: 0.72rem;
}

.field-hint {
  color: var(--color-text-muted);
  font-size: 0.6rem;
  line-height: 1.4;
}

.tier-editor {
  margin: 0;
  padding: 12px;
  display: grid;
  gap: 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
}

.tier-editor legend {
  padding: 0 4px;
  color: var(--color-text-muted);
  font-size: 0.67rem;
}

.tier-row {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  align-items: end;
  gap: 10px;
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
  .policy-provenance,
  .tier-row {
    grid-template-columns: 1fr;
  }

  .span-2,
  .policy-provenance p {
    grid-column: auto;
  }
}
</style>

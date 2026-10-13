<template>
  <aside
    class="governance-inspector"
    :aria-label="t('Eligibility and actions')"
  >
    <section class="inspector-section identity">
      <p class="inspector-kicker">{{ t("Active wallet") }}</p>
      <h2>{{ t("Eligibility") }}</h2>
      <dl>
        <div>
          <dt>{{ t("Citizen") }}</dt>
          <dd :class="{ positive: governance.isCitizen }">
            {{
              governance.citizenshipLoading
                ? t("Checking citizenship…")
                : governance.citizenState === "citizen"
                  ? t("Eligible")
                  : governance.citizenState === "not-citizen"
                    ? t("Not a citizen yet")
                    : t("Citizen status unavailable")
            }}
          </dd>
        </div>
        <div>
          <dt>{{ t("Account") }}</dt>
          <dd class="mono">{{ shortAccount }}</dd>
        </div>
        <div>
          <dt>{{ t("Required Bond") }}</dt>
          <dd>{{ governance.citizenshipBondAmount }} XOR</dd>
        </div>
        <div>
          <dt>{{ t("XOR Balance") }}</dt>
          <dd>
            {{
              governance.citizenshipBalance === null
                ? t("Unavailable")
                : `${governance.citizenshipBalance} XOR`
            }}
          </dd>
        </div>
      </dl>
      <div
        v-if="governance.citizenState === 'not-citizen'"
        class="citizenship-action"
      >
        <AppButton
          data-testid="governance-bond-citizen"
          size="sm"
          :disabled="!governance.canBondCitizen"
          :loading="governance.busy === 'prepare'"
          @click="governance.handleBondCitizen"
        >
          {{
            t("Bond {amount} XOR", {
              amount: governance.citizenshipBondAmount,
            })
          }}
        </AppButton>
        <p v-if="governance.bondGate.reason" class="gate-reason">
          {{ governance.bondGate.reason }}
        </p>
      </div>
    </section>

    <section class="inspector-section">
      <p class="inspector-kicker">{{ t("Strict contract verified") }}</p>
      <h2>{{ t("Mandatory private Parliament") }}</h2>
      <dl>
        <div>
          <dt>{{ t("Private ballot protocol") }}</dt>
          <dd class="mono">{{ protocolLabel }}</dd>
        </div>
        <div>
          <dt>{{ t("Parliament bodies") }}</dt>
          <dd>{{ bodyCount }}</dd>
        </div>
        <div>
          <dt>{{ t("Maximum retries") }}</dt>
          <dd>
            {{ governance.capabilities?.maxBallotRetries ?? t("Unavailable") }}
          </dd>
        </div>
        <div>
          <dt>{{ t("Corpus bound") }}</dt>
          <dd>
            {{ governance.capabilities?.maxCorpusEntries ?? t("Unavailable") }}
          </dd>
        </div>
      </dl>
    </section>

    <section class="inspector-section actions">
      <div class="inspector-heading">
        <h2>{{ t("Available actions") }}</h2>
        <span v-if="governance.selectedProposal">
          {{ t(governance.selectedProposal.summary.status) }}
        </span>
      </div>
      <div class="fail-closed">
        <strong>{{ t("Private ballot controls unavailable") }}</strong>
        <p>
          {{
            t(
              "This wallet can prepare validation-fee policy proposals only; payout-lifecycle proposals are inspect-only, and Parliament ceremony and enactment controls are not exposed.",
            )
          }}
        </p>
      </div>
      <p v-if="governance.proposalGate.reason" class="gate-reason">
        {{ governance.proposalGate.reason }}
      </p>
    </section>
  </aside>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useAppI18n } from "@/composables/useAppI18n";
import { useParliamentStore } from "@/stores/parliament";
import { AppButton } from "@/components/ui";

const governance = useParliamentStore();
const { t } = useAppI18n();

const shortAccount = computed(() => {
  const value = governance.accountId;
  return value.length > 20
    ? `${value.slice(0, 11)}…${value.slice(-7)}`
    : value || t("Not connected");
});
const protocolLabel = computed(
  () => governance.capabilities?.privateBallotProtocol ?? t("Unavailable"),
);
const bodyCount = computed(() =>
  governance.capabilities
    ? Object.keys(governance.capabilities.targetBodySizes).length
    : t("Unavailable"),
);
</script>

<style scoped>
.governance-inspector {
  min-width: 0;
  height: fit-content;
  display: grid;
  gap: 12px;
}

.inspector-section {
  padding: 17px;
  border: 1px solid var(--frost-border);
  border-radius: var(--radius-panel);
  background: var(--frost-panel-raised);
  box-shadow: var(--shadow-raised);
  backdrop-filter: var(--frost-filter-panel);
  -webkit-backdrop-filter: var(--frost-filter-panel);
}

.inspector-kicker {
  margin: 0 0 4px;
  color: var(--color-text-muted);
  font-size: 0.66rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

h2 {
  margin: 0;
  font-size: 0.95rem;
}

dl {
  margin: 15px 0 0;
  display: grid;
  gap: 10px;
}

dl > div {
  display: grid;
  grid-template-columns: minmax(78px, auto) minmax(0, 1fr);
  gap: 8px;
}

dt {
  color: var(--color-text-muted);
  font-size: 0.67rem;
}

dd {
  margin: 0;
  overflow: hidden;
  font-size: 0.7rem;
  text-align: end;
  text-overflow: ellipsis;
}

dd.positive {
  color: var(--color-success);
}

.citizenship-action {
  margin-top: 14px;
  padding-top: 14px;
  display: grid;
  gap: 7px;
  border-top: 1px solid var(--color-border);
}

.inspector-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.inspector-heading span {
  color: var(--color-accent);
  font-size: 0.66rem;
}

.fail-closed {
  margin-top: 14px;
  padding: 11px;
  border: 1px solid
    color-mix(in srgb, var(--color-warning) 35%, var(--color-border));
  border-radius: var(--radius-control);
  background: color-mix(in srgb, var(--color-warning) 8%, transparent);
}

.fail-closed strong {
  color: var(--color-warning);
  font-size: 0.72rem;
}

.fail-closed p,
.gate-reason {
  margin: 4px 0 0;
  color: var(--color-text-muted);
  font-size: 0.65rem;
  line-height: 1.5;
}

.mono {
  font-family: var(--mono-font);
}

.governance-inspector :deep(button) {
  min-height: 44px;
}
</style>

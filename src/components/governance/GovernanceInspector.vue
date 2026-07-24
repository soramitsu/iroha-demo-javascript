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
            {{ governance.isCitizen ? t("Eligible") : t("Not detected") }}
          </dd>
        </div>
        <div>
          <dt>{{ t("Account") }}</dt>
          <dd class="mono">{{ shortAccount }}</dd>
        </div>
        <div>
          <dt>{{ t("Seated bodies") }}</dt>
          <dd>{{ governance.eligibleParliamentBodies.length }}</dd>
        </div>
        <div>
          <dt>{{ t("Required Bond") }}</dt>
          <dd>{{ governance.citizenshipBondAmount }} XOR</dd>
        </div>
        <div>
          <dt>{{ t("XOR Balance") }}</dt>
          <dd>{{ governance.citizenshipBalance }} XOR</dd>
        </div>
      </dl>
      <div v-if="!governance.isCitizen" class="citizenship-action">
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

    <section class="inspector-section actions">
      <div class="inspector-heading">
        <h2>{{ t("Available actions") }}</h2>
        <span v-if="governance.selectedProposal">{{
          t(governance.selectedProposal.summary.currentStage)
        }}</span>
      </div>

      <div
        v-if="governance.selectedProposal?.referendum?.mode === 'Zk'"
        class="fail-closed"
      >
        <strong>{{ t("ZK voting unavailable") }}</strong>
        <p>
          {{
            t(
              "Proof creation is not enabled in this release. No fallback ballot will be submitted.",
            )
          }}
        </p>
      </div>

      <div class="action-block">
        <div class="action-copy">
          <strong>{{ t("Citizen ballot") }}</strong>
          <p>
            {{ governance.plainVoteGate.reason || t("Plain voting is open.") }}
          </p>
        </div>
        <div class="ballot-fields">
          <label>
            {{ t("Decision") }}
            <select v-model="governance.ballotDirection">
              <option value="Aye">{{ t("Approve") }}</option>
              <option value="Nay">{{ t("Reject") }}</option>
              <option value="Abstain">{{ t("Abstain") }}</option>
            </select>
          </label>
          <label>
            {{ t("Amount") }}
            <input v-model.trim="governance.ballotAmount" inputmode="decimal" />
          </label>
          <label class="span-2">
            {{ t("Lock blocks") }}
            <input
              v-model.trim="governance.ballotDurationBlocks"
              inputmode="numeric"
            />
          </label>
        </div>
        <AppButton
          size="sm"
          :variant="primaryAction === 'citizen' ? 'primary' : 'secondary'"
          :disabled="!governance.plainVoteGate.allowed"
          :loading="governance.busy === 'prepare'"
          @click="governance.prepareCitizenBallot"
        >
          {{ t("Review citizen ballot") }}
        </AppButton>
      </div>

      <div class="action-block">
        <div class="action-copy">
          <strong>{{ t("Seven-body Parliament ballots") }}</strong>
          <p>
            {{
              governance.parliamentBallotGate.reason ||
              t(
                "Each seated body decides independently before the citizen referendum opens.",
              )
            }}
          </p>
        </div>
        <label>
          {{ t("Decision") }}
          <select v-model="governance.parliamentDecision">
            <option value="approve">{{ t("Approve") }}</option>
            <option value="reject">{{ t("Reject") }}</option>
            <option value="abstain">{{ t("Abstain") }}</option>
          </select>
        </label>
        <div class="body-ballots">
          <div v-for="body in bodies" :key="body" class="body-ballot">
            <div>
              <strong>{{ t(body) }}</strong>
              <span>
                {{
                  bodyOutcome(body)?.currentAccountDecision
                    ? t("Voted: {decision}", {
                        decision:
                          bodyOutcome(body)?.currentAccountDecision ?? "",
                      })
                    : isSeated(body)
                      ? t("Seated member")
                      : t("Not seated")
                }}
              </span>
            </div>
            <AppButton
              size="sm"
              :variant="
                primaryAction === 'parliament' &&
                governance.parliamentBodyGates[body]?.allowed
                  ? 'primary'
                  : 'secondary'
              "
              :disabled="!governance.parliamentBodyGates[body]?.allowed"
              :loading="governance.busy === 'prepare'"
              @click="governance.prepareStageBallot(body)"
            >
              {{ t("Review") }}
            </AppButton>
          </div>
        </div>
      </div>

      <div class="action-block crank">
        <div class="action-copy">
          <strong>{{ t("Deterministic close and enact") }}</strong>
          <p>
            {{
              t(
                "PLAIN referenda close automatically after the inclusive end height. The wallet never submits manual finalization.",
              )
            }}
          </p>
        </div>
        <AppButton
          size="sm"
          :variant="primaryAction === 'enact' ? 'primary' : 'secondary'"
          :disabled="!governance.enactGate.allowed"
          :loading="governance.busy === 'prepare'"
          @click="governance.prepareEnact"
        >
          {{ t("Review enact") }}
        </AppButton>
        <p v-if="!governance.enactGate.allowed" class="gate-reason">
          {{ governance.enactGate.reason }}
        </p>
      </div>
    </section>
  </aside>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useAppI18n } from "@/composables/useAppI18n";
import { GOVERNANCE_PARLIAMENT_BODIES } from "@/governance/model";
import { useParliamentStore } from "@/stores/parliament";
import { AppButton } from "@/components/ui";

const governance = useParliamentStore();
const { t } = useAppI18n();
const bodies = GOVERNANCE_PARLIAMENT_BODIES;

const shortAccount = computed(() => {
  const value = governance.accountId;
  return value.length > 20
    ? `${value.slice(0, 11)}…${value.slice(-7)}`
    : value || t("Not connected");
});

const primaryAction = computed<"citizen" | "parliament" | "enact" | null>(
  () => {
    if (governance.plainVoteGate.allowed) return "citizen";
    if (governance.parliamentBallotGate.allowed) return "parliament";
    if (governance.enactGate.allowed) return "enact";
    return null;
  },
);

const bodyOutcome = (body: string) =>
  governance.selectedProposal?.parliamentOutcomes.find(
    (outcome) => outcome.body === body,
  );
const isSeated = (body: string) =>
  governance.selectedProposal?.parliamentRosters
    .find((roster) => roster.body === body)
    ?.members.includes(governance.accountId) === true;
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
  grid-template-columns: 74px minmax(0, 1fr);
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

.mono {
  font-family: var(--mono-font);
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
.action-copy p,
.gate-reason {
  margin: 4px 0 0;
  color: var(--color-text-muted);
  font-size: 0.65rem;
  line-height: 1.5;
}

.action-block {
  padding: 15px 0;
  display: grid;
  gap: 11px;
  border-bottom: 1px solid var(--color-border);
}

.action-block:last-child {
  padding-bottom: 0;
  border-bottom: 0;
}

.action-copy strong {
  font-size: 0.76rem;
}

.ballot-fields {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

label {
  display: grid;
  gap: 5px;
  color: var(--color-text-muted);
  font-size: 0.64rem;
}

.span-2 {
  grid-column: span 2;
}

input,
select {
  width: 100%;
  min-height: 44px;
  padding: 7px 9px;
  font-size: 0.7rem;
}

.governance-inspector :deep(button) {
  min-height: 44px;
}

.body-ballots {
  display: grid;
  gap: 6px;
}

.body-ballot {
  min-width: 0;
  padding: 8px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  background: var(--color-surface-soft);
}

.body-ballot > div {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.body-ballot strong {
  overflow: hidden;
  font-size: 0.67rem;
  text-overflow: ellipsis;
}

.body-ballot span {
  color: var(--color-text-muted);
  font-size: 0.6rem;
}

.body-ballot :deep(button) {
  min-height: 44px;
}

.crank-buttons {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 7px;
}
</style>

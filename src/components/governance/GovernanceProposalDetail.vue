<template>
  <section class="proposal-detail" :aria-label="t('Selected proposal')">
    <template v-if="proposal">
      <header class="detail-header">
        <div>
          <div class="detail-badges">
            <span class="status-badge">{{ t(proposal.summary.status) }}</span>
            <span
              class="mode-badge"
              :class="{ unavailable: proposal.summary.votingMode === 'Zk' }"
            >
              {{ t("{mode} vote", { mode: proposal.summary.votingMode }) }}
            </span>
          </div>
          <h2>{{ t(adapter.labelKey) }}</h2>
          <p>{{ t(adapter.descriptionKey) }}</p>
        </div>
        <span class="height-chip">
          {{ t("Height {height}", { height: proposal.currentHeight ?? "—" }) }}
        </span>
      </header>

      <dl class="identity-grid">
        <div>
          <dt>{{ t("Proposal ID") }}</dt>
          <dd class="mono">{{ proposal.summary.proposalId }}</dd>
        </div>
        <div>
          <dt>{{ t("Proposer") }}</dt>
          <dd class="mono">{{ proposal.summary.proposer || t("Unknown") }}</dd>
        </div>
        <div>
          <dt>{{ t("Referendum") }}</dt>
          <dd class="mono">
            {{ proposal.referendum?.id || proposal.summary.referendumId }}
          </dd>
        </div>
        <div>
          <dt>{{ t("Created") }}</dt>
          <dd>
            {{
              t("Block {height}", { height: proposal.summary.createdHeight })
            }}
          </dd>
        </div>
      </dl>

      <div class="timeline-panel">
        <div class="section-heading">
          <h3>{{ t("Lifecycle") }}</h3>
          <span>{{ t(proposal.summary.currentStage) }}</span>
        </div>
        <GovernanceTimeline
          :pipeline="proposal.pipeline"
          :current-stage="proposal.summary.currentStage"
        />
      </div>

      <section class="payload-panel">
        <div class="section-heading">
          <h3>{{ t("Proposal payload") }}</h3>
          <span>{{ t("Decoded from ledger state") }}</span>
        </div>

        <dl v-if="proposal.kind.type === 'DeployContract'" class="payload-grid">
          <div>
            <dt>{{ t("Contract address") }}</dt>
            <dd class="mono">{{ proposal.kind.contractAddress || t("—") }}</dd>
          </div>
          <div>
            <dt>{{ t("ABI version") }}</dt>
            <dd>{{ proposal.kind.abiVersion }}</dd>
          </div>
          <div class="span-2">
            <dt>{{ t("Code hash") }}</dt>
            <dd class="mono">{{ proposal.kind.codeHash || t("—") }}</dd>
          </div>
          <div class="span-2">
            <dt>{{ t("ABI hash") }}</dt>
            <dd class="mono">{{ proposal.kind.abiHash || t("—") }}</dd>
          </div>
        </dl>

        <div
          v-else-if="proposal.kind.type === 'ValidationFeePayoutLifecycle'"
          class="verified-payload"
        >
          <p>
            {{
              t(
                "This exact payout lifecycle must be enacted before a policy can bind it.",
              )
            }}
          </p>
          <pre><code>{{ pretty(proposal.kind.payoutBinding) }}</code></pre>
        </div>

        <div
          v-else-if="proposal.kind.type === 'ValidationFeePolicy'"
          class="unknown-payload"
        >
          <p>
            {{
              t(
                "Validation-fee policy fields stay hidden until the current SDK locally verifies their consensus proof and immutable ledger binding.",
              )
            }}
          </p>
        </div>

        <pre
          v-else-if="proposal.kind.type === 'RuntimeUpgrade'"
        ><code>{{ pretty(proposal.kind.manifest) }}</code></pre>
        <pre
          v-else-if="proposal.kind.type === 'SccpRouteGovernance'"
        ><code>{{ pretty(proposal.kind.action) }}</code></pre>
        <div v-else class="unknown-payload">
          <p>
            {{
              t(
                "This proposal kind is not supported by this wallet. It remains inspect-only.",
              )
            }}
          </p>
          <pre><code>{{ pretty(proposal.kind.raw) }}</code></pre>
        </div>
      </section>

      <section class="decision-panel">
        <div class="section-heading">
          <h3>{{ t("Citizen decision") }}</h3>
          <span>{{ t(proposal.summary.referendumStatus) }}</span>
        </div>
        <div class="tally-grid">
          <div>
            <span>{{ t("Approve") }}</span>
            <strong>{{ proposal.tally?.approve ?? "0" }}</strong>
          </div>
          <div>
            <span>{{ t("Reject") }}</span>
            <strong>{{ proposal.tally?.reject ?? "0" }}</strong>
          </div>
          <div>
            <span>{{ t("Abstain") }}</span>
            <strong>{{ proposal.tally?.abstain ?? "0" }}</strong>
          </div>
          <div>
            <span>{{ t("Locks") }}</span>
            <strong>{{ proposal.locks.length }}</strong>
          </div>
        </div>
      </section>

      <section class="parliament-panel">
        <div class="section-heading">
          <h3>{{ t("Seven-body Parliament") }}</h3>
          <span>{{ t("Members vote; alternates are ineligible") }}</span>
        </div>
        <div class="body-grid">
          <article v-for="body in bodies" :key="body" class="body-card">
            <header>
              <strong>{{ t(body) }}</strong>
              <span>
                {{
                  t("{approve}/{required} approvals", {
                    approve: bodyOutcome(body)?.approvals ?? "0",
                    required: bodyOutcome(body)?.required ?? "—",
                  })
                }}
              </span>
            </header>
            <dl>
              <div>
                <dt>{{ t("Members") }}</dt>
                <dd>
                  <span
                    v-for="member in bodyRoster(body)?.members ?? []"
                    :key="member"
                    class="seat mono"
                  >
                    {{ member }}
                  </span>
                  <span
                    v-if="!bodyRoster(body)?.members.length"
                    class="empty-seat"
                  >
                    {{ t("No verified roster") }}
                  </span>
                </dd>
              </div>
              <div class="alternates">
                <dt>{{ t("Alternates (not eligible)") }}</dt>
                <dd>
                  <span
                    v-for="alternate in bodyRoster(body)?.alternates ?? []"
                    :key="alternate"
                    class="seat mono"
                  >
                    {{ alternate }}
                  </span>
                  <span
                    v-if="!bodyRoster(body)?.alternates.length"
                    class="empty-seat"
                  >
                    {{ t("None") }}
                  </span>
                </dd>
              </div>
            </dl>
            <footer>
              <span
                >{{ t("Reject") }}
                {{ bodyOutcome(body)?.rejections ?? "0" }}</span
              >
              <span
                >{{ t("Abstain") }}
                {{ bodyOutcome(body)?.abstentions ?? "0" }}</span
              >
            </footer>
          </article>
        </div>
      </section>

      <section class="finalization-panel">
        <div class="section-heading">
          <h3>{{ t("Deterministic finalization") }}</h3>
          <span>
            {{
              proposal.finalizationEvidence
                ? t("Finalized ledger evidence")
                : t("Awaiting automatic close")
            }}
          </span>
        </div>
        <p>
          {{
            t(
              "PLAIN referenda finalize automatically after the inclusive end height. This wallet does not offer a manual finalize action.",
            )
          }}
        </p>
        <dl v-if="proposal.enactedAtHeight" class="payload-grid">
          <div>
            <dt>{{ t("Enacted at height") }}</dt>
            <dd>{{ proposal.enactedAtHeight }}</dd>
          </div>
        </dl>
        <pre v-if="proposal.finalizationEvidence"><code>{{
          pretty(proposal.finalizationEvidence)
        }}</code></pre>
      </section>
    </template>

    <div v-else class="detail-empty">
      <p v-if="error" class="error">{{ error }}</p>
      <template v-else>
        <span aria-hidden="true">花</span>
        <h2>{{ loading ? t("Loading proposal…") : t("Select a proposal") }}</h2>
        <p>
          {{
            t(
              "Choose a ledger proposal to inspect its payload, lifecycle, and decision state.",
            )
          }}
        </p>
      </template>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useAppI18n } from "@/composables/useAppI18n";
import {
  GOVERNANCE_KIND_ADAPTERS,
  GOVERNANCE_PARLIAMENT_BODIES,
  type GovernanceParliamentBody,
  type GovernanceProposalDetail,
} from "@/governance/model";
import GovernanceTimeline from "./GovernanceTimeline.vue";

const props = defineProps<{
  proposal: GovernanceProposalDetail | null;
  loading: boolean;
  error: string;
}>();

const { t } = useAppI18n();
const adapter = computed(
  () => GOVERNANCE_KIND_ADAPTERS[props.proposal?.kind.type ?? "Unknown"],
);
const bodies = GOVERNANCE_PARLIAMENT_BODIES;
const bodyRoster = (body: GovernanceParliamentBody) =>
  props.proposal?.parliamentRosters.find((roster) => roster.body === body);
const bodyOutcome = (body: GovernanceParliamentBody) =>
  props.proposal?.parliamentOutcomes.find((outcome) => outcome.body === body);
const pretty = (value: unknown) => JSON.stringify(value, null, 2);
</script>

<style scoped>
.proposal-detail {
  min-width: 0;
  min-height: 570px;
  border: 1px solid var(--frost-border);
  border-radius: var(--radius-panel);
  background: var(--frost-panel-raised);
  box-shadow: var(--shadow-raised);
  backdrop-filter: var(--frost-filter-panel);
  -webkit-backdrop-filter: var(--frost-filter-panel);
}

.detail-header {
  padding: 24px 26px 20px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  border-bottom: 1px solid var(--color-border);
}

.detail-badges {
  margin-bottom: 9px;
  display: flex;
  gap: 7px;
}

.status-badge,
.mode-badge,
.height-chip {
  padding: 4px 8px;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  color: var(--color-text-muted);
  background: color-mix(in srgb, var(--color-surface-soft) 72%, transparent);
  font-size: 0.65rem;
}

.status-badge {
  border-color: color-mix(
    in srgb,
    var(--color-accent) 40%,
    var(--color-border)
  );
  color: var(--color-accent);
  background: var(--color-accent-soft);
}

.mode-badge.unavailable {
  color: var(--color-warning);
}

.height-chip {
  flex: none;
}

.detail-header h2 {
  margin: 0;
  font-size: clamp(1.25rem, 2vw, 1.7rem);
  letter-spacing: -0.02em;
}

.detail-header p {
  max-width: 620px;
  margin: 7px 0 0;
  color: var(--color-text-muted);
  font-size: 0.8rem;
  line-height: 1.55;
}

.identity-grid,
.payload-grid {
  margin: 0;
  padding: 18px 26px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px 24px;
}

.identity-grid {
  border-bottom: 1px solid var(--color-border);
}

dt {
  margin-bottom: 5px;
  color: var(--color-text-muted);
  font-size: 0.64rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

dd {
  margin: 0;
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: 0.76rem;
}

.mono {
  font-family: var(--mono-font);
}

.timeline-panel,
.payload-panel,
.decision-panel,
.parliament-panel,
.finalization-panel {
  padding: 20px 26px;
  border-bottom: 1px solid var(--color-border);
}

.finalization-panel {
  border-bottom: 0;
}

.section-heading {
  margin-bottom: 16px;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.section-heading h3 {
  margin: 0;
  font-size: 0.88rem;
}

.section-heading span {
  color: var(--color-text-muted);
  font-size: 0.66rem;
}

.payload-grid {
  padding: 0;
}

.span-2 {
  grid-column: span 2;
}

pre {
  max-height: 300px;
  margin: 0;
  padding: 14px;
  overflow: auto;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  background: var(--color-surface-inset);
  color: var(--color-text-muted);
  font-size: 0.68rem;
  line-height: 1.55;
  white-space: pre-wrap;
}

.unknown-payload p {
  margin: 0 0 12px;
  color: var(--color-warning);
  font-size: 0.78rem;
}

.verified-payload > p,
.finalization-panel > p {
  margin: 0 0 12px;
  color: var(--color-text-muted);
  font-size: 0.74rem;
  line-height: 1.55;
}

.tally-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1px;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  background: var(--color-border);
}

.tally-grid > div {
  padding: 13px;
  display: grid;
  gap: 5px;
  background: var(--color-surface-soft);
}

.tally-grid span {
  color: var(--color-text-muted);
  font-size: 0.65rem;
}

.tally-grid strong {
  font-size: 0.95rem;
}

.body-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.body-card {
  min-width: 0;
  padding: 12px;
  display: grid;
  gap: 11px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  background: var(--color-surface-soft);
}

.body-card header,
.body-card footer {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

.body-card header strong {
  font-size: 0.72rem;
}

.body-card header span,
.body-card footer {
  color: var(--color-text-muted);
  font-size: 0.61rem;
}

.body-card dl {
  margin: 0;
  display: grid;
  gap: 9px;
}

.body-card dd {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.seat,
.empty-seat {
  padding: 3px 5px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  font-size: 0.58rem;
}

.alternates {
  opacity: 0.55;
}

.empty-seat {
  color: var(--color-text-muted);
}

.detail-empty {
  min-height: 570px;
  padding: 40px;
  display: grid;
  place-content: center;
  justify-items: center;
  text-align: center;
}

.detail-empty > span {
  margin-bottom: 14px;
  color: var(--color-accent);
  font-size: 1.5rem;
  opacity: 0.55;
}

.detail-empty h2 {
  margin: 0;
  font-size: 1.1rem;
}

.detail-empty p {
  max-width: 390px;
  margin: 8px 0 0;
  color: var(--color-text-muted);
  font-size: 0.78rem;
  line-height: 1.55;
}

.detail-empty .error {
  color: var(--color-danger);
}

@media (max-width: 720px) {
  .detail-header,
  .identity-grid,
  .timeline-panel,
  .payload-panel,
  .decision-panel,
  .parliament-panel,
  .finalization-panel {
    padding-right: 18px;
    padding-left: 18px;
  }

  .identity-grid,
  .payload-grid {
    grid-template-columns: 1fr;
  }

  .span-2 {
    grid-column: auto;
  }

  .tally-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .body-grid {
    grid-template-columns: 1fr;
  }
}
</style>

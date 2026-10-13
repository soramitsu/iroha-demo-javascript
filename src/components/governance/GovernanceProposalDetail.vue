<template>
  <section class="proposal-detail" :aria-label="t('Selected proposal')">
    <template v-if="proposal">
      <header class="detail-header">
        <div>
          <div class="detail-badges">
            <span class="status-badge">{{ t(proposal.summary.status) }}</span>
            <span class="mode-badge">{{
              t("Mandatory private Parliament")
            }}</span>
          </div>
          <h2>{{ t(adapter.labelKey) }}</h2>
          <p>{{ t(adapter.descriptionKey) }}</p>
        </div>
        <span class="height-chip">
          {{ t("Height {height}", { height: proposal.currentHeight }) }}
        </span>
      </header>

      <dl class="identity-grid">
        <div class="span-2">
          <dt>{{ t("Proposal ID") }}</dt>
          <dd class="mono">{{ proposal.summary.proposalId }}</dd>
        </div>
        <div>
          <dt>{{ t("Proposer") }}</dt>
          <dd class="mono">{{ proposal.summary.proposer }}</dd>
        </div>
        <div>
          <dt>{{ t("Proposal operator") }}</dt>
          <dd class="mono">{{ proposal.kind.proposalOperator }}</dd>
        </div>
        <div>
          <dt>{{ t("Created") }}</dt>
          <dd>
            {{
              t("Block {height}", { height: proposal.summary.createdHeight })
            }}
          </dd>
        </div>
        <div>
          <dt>{{ t("Operation") }}</dt>
          <dd>{{ t(proposal.summary.status) }}</dd>
        </div>
      </dl>

      <section class="payload-panel">
        <div class="section-heading">
          <h3>{{ t("Proposal payload") }}</h3>
          <span>{{ t("Decoded from ledger state") }}</span>
        </div>

        <div
          v-if="proposal.kind.type === 'ValidationFeePayoutLifecycle'"
          class="verified-payload"
        >
          <p>
            {{
              t(
                "The exact operator-bound conversion and reward binding is inspectable here; binding approval remains private Parliament work.",
              )
            }}
          </p>
          <dl class="payload-grid policy-facts">
            <div>
              <dt>{{ t("Reference feed") }}</dt>
              <dd class="mono">
                {{ proposal.kind.payoutBinding.reference_feed_id[0] }}
              </dd>
            </div>
            <div>
              <dt>{{ t("Reference providers") }}</dt>
              <dd>
                {{
                  proposal.kind.payoutBinding.reference_provider_accounts.length
                }}
              </dd>
            </div>
            <div>
              <dt>{{ t("Validator lane") }}</dt>
              <dd>{{ proposal.kind.payoutBinding.validator_lane_id }}</dd>
            </div>
            <div>
              <dt>{{ t("Maximum slippage (bps)") }}</dt>
              <dd>{{ proposal.kind.payoutBinding.max_slippage_bps }}</dd>
            </div>
            <div class="span-2">
              <dt>{{ t("Reward pool account") }}</dt>
              <dd class="mono">
                {{ proposal.kind.payoutBinding.reward_pool_account_id }}
              </dd>
            </div>
          </dl>
          <pre
            tabindex="0"
          ><code>{{ pretty(proposal.kind.payoutBinding) }}</code></pre>
        </div>

        <div
          v-else
          class="verified-payload"
          data-testid="governance-public-policy"
        >
          <dl class="payload-grid policy-facts">
            <div>
              <dt>{{ t("Institutional payment fee") }}</dt>
              <dd>{{ proposal.kind.policy.fee }} SBD</dd>
            </div>
            <div>
              <dt>{{ t("Policy version") }}</dt>
              <dd>{{ proposal.kind.policy.policy_version }}</dd>
            </div>
            <div>
              <dt>{{ t("Effective from") }}</dt>
              <dd>{{ honiaraTime(proposal.kind.policy.effective_from_ms) }}</dd>
            </div>
            <div>
              <dt>{{ t("Notice published") }}</dt>
              <dd>
                {{ honiaraTime(proposal.kind.policy.notice_published_at_ms) }}
              </dd>
            </div>
            <div>
              <dt>{{ t("Included payments") }}</dt>
              <dd>
                {{ proposal.kind.policy.retail_schedule.included_payments }}
              </dd>
            </div>
            <div>
              <dt>{{ t("Overage fee (minor units)") }}</dt>
              <dd>{{ proposal.kind.policy.retail_schedule.overage_minor }}</dd>
            </div>
            <div class="span-2">
              <dt>{{ t("Maintenance tiers (minor units)") }}</dt>
              <dd>
                <ul class="tier-list">
                  <li
                    v-for="(tier, index) in proposal.kind.policy.retail_schedule
                      .maintenance_tiers"
                    :key="index"
                  >
                    {{
                      t("From {balance}: {fee} per month", {
                        balance: tier.minimum_average_balance_minor,
                        fee: tier.monthly_fee_minor,
                      })
                    }}
                  </li>
                </ul>
              </dd>
            </div>
            <div class="span-2">
              <dt>{{ t("Reward pool account") }}</dt>
              <dd class="mono">
                {{ proposal.kind.policy.reward_custody.reward_pool_account_id }}
              </dd>
            </div>
            <div class="span-2">
              <dt>{{ t("Network ID") }}</dt>
              <dd class="mono">{{ proposal.kind.policy.network_id }}</dd>
            </div>
            <div class="span-2">
              <dt>{{ t("SBD asset ID") }}</dt>
              <dd class="mono">{{ proposal.kind.policy.ds_asset_id }}</dd>
            </div>
          </dl>
          <details class="technical-projection">
            <summary>{{ t("Exact public proposal payload") }}</summary>
            <pre tabindex="0"><code>{{ pretty(proposal.kind.raw) }}</code></pre>
          </details>
        </div>
      </section>

      <section class="certificate-panel">
        <div class="section-heading">
          <h3>{{ t("Timed-OVN certificate") }}</h3>
          <span>
            {{
              proposal.governanceCertificate
                ? t("Finalized ledger evidence")
                : t("No Parliament certificate yet")
            }}
          </span>
        </div>
        <template v-if="proposal.governanceCertificate">
          <dl class="payload-grid">
            <div class="span-2">
              <dt>{{ t("Attempt ID") }}</dt>
              <dd class="mono">
                {{ proposal.governanceCertificate.governanceAttemptId }}
              </dd>
            </div>
            <div>
              <dt>{{ t("Attempt sequence") }}</dt>
              <dd>
                {{ proposal.governanceCertificate.governanceAttemptSequence }}
              </dd>
            </div>
            <div>
              <dt>{{ t("Required body bindings") }}</dt>
              <dd>{{ proposal.governanceCertificate.bodyBindingCount }}</dd>
            </div>
            <div>
              <dt>{{ t("Certified at height") }}</dt>
              <dd>{{ proposal.governanceCertificate.certifiedAtHeight }}</dd>
            </div>
            <div>
              <dt>{{ t("Enacted at height") }}</dt>
              <dd>{{ proposal.governanceCertificate.enactAtHeight }}</dd>
            </div>
          </dl>
          <details class="technical-projection">
            <summary>{{ t("Exact certificate payload") }}</summary>
            <pre
              tabindex="0"
            ><code>{{ pretty(proposal.governanceCertificate.raw) }}</code></pre>
          </details>
        </template>
        <p v-else class="certificate-empty">
          {{
            t(
              "The proposal remains inspect-only until Torii returns its successful private Parliament certificate.",
            )
          }}
        </p>
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
  formatHoniaraTimestamp,
  type GovernanceProposalDetail,
} from "@/governance/model";

const props = defineProps<{
  proposal: GovernanceProposalDetail | null;
  loading: boolean;
  error: string;
}>();

const { t } = useAppI18n();
const adapter = computed(
  () =>
    GOVERNANCE_KIND_ADAPTERS[
      props.proposal?.kind.type ?? "ValidationFeePayoutLifecycle"
    ],
);
const pretty = (value: unknown) => JSON.stringify(value, null, 2);
const honiaraTime = (ms: number) => {
  const time = formatHoniaraTimestamp(ms);
  return time ? t("{time} Honiara time", { time }) : t("Unavailable");
};
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
  flex-wrap: wrap;
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

.height-chip {
  flex: none;
}

.detail-header h2 {
  margin: 0;
  font-size: clamp(1.25rem, 2vw, 1.7rem);
}

.detail-header p,
.verified-payload > p,
.certificate-empty {
  margin: 7px 0 0;
  color: var(--color-text-muted);
  font-size: 0.74rem;
  line-height: 1.55;
}

.identity-grid,
.payload-grid {
  margin: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px 24px;
}

.tier-list {
  margin: 0;
  padding-inline-start: 16px;
  display: grid;
  gap: 2px;
}

.identity-grid {
  padding: 18px 26px;
  border-bottom: 1px solid var(--color-border);
}

.payload-grid {
  padding: 16px 0 0;
}

.span-2 {
  grid-column: span 2;
}

dt {
  color: var(--color-text-muted);
  font-size: 0.66rem;
}

dd {
  margin: 4px 0 0;
  overflow-wrap: anywhere;
  font-size: 0.74rem;
}

.payload-panel,
.certificate-panel {
  padding: 20px 26px;
  border-bottom: 1px solid var(--color-border);
}

.certificate-panel {
  border-bottom: 0;
}

.section-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.section-heading h3 {
  margin: 0;
  font-size: 0.86rem;
}

.section-heading span {
  color: var(--color-text-muted);
  font-size: 0.63rem;
}

pre {
  max-height: 340px;
  margin: 14px 0 0;
  padding: 14px;
  overflow: auto;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  background: var(--color-surface-inset);
  color: var(--color-text-muted);
  font-size: 0.65rem;
  line-height: 1.5;
  white-space: pre-wrap;
}

.technical-projection {
  margin-top: 14px;
}

.technical-projection summary {
  cursor: pointer;
  color: var(--color-accent);
  font-size: 0.68rem;
}

.mono {
  font-family: var(--mono-font);
}

.detail-empty {
  min-height: 570px;
  padding: 48px 28px;
  display: grid;
  place-content: center;
  justify-items: center;
  text-align: center;
}

.detail-empty > span {
  color: var(--color-accent);
  font-size: 2.4rem;
}

.detail-empty h2 {
  margin: 10px 0 0;
}

.detail-empty p {
  max-width: 360px;
  color: var(--color-text-muted);
  font-size: 0.75rem;
  line-height: 1.55;
}

@media (max-width: 620px) {
  .detail-header {
    display: grid;
  }

  .identity-grid,
  .payload-grid {
    grid-template-columns: 1fr;
  }

  .span-2 {
    grid-column: auto;
  }
}
</style>

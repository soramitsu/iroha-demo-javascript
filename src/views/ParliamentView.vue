<template>
  <div class="governance-shell">
    <RouteHeaderAction>
      <div class="header-actions">
        <AppButton
          variant="secondary"
          :disabled="governance.refreshing"
          @click="governance.refresh"
        >
          {{ governance.refreshing ? t("Refreshing…") : t("Refresh ledger") }}
        </AppButton>
        <AppButton
          data-testid="new-governance-proposal"
          :disabled="
            !governance.canWrite ||
            governance.supportedComposerKinds.length === 0
          "
          @click="governance.openComposer()"
        >
          {{ t("New proposal") }}
        </AppButton>
      </div>
    </RouteHeaderAction>

    <section class="governance-context" aria-label="Governance connection">
      <div class="context-intro">
        <span
          class="live-dot"
          :class="{ unavailable: !governance.canWrite }"
          aria-hidden="true"
        ></span>
        <div>
          <strong>
            {{
              governance.canWrite
                ? t("Verified Taira Parliament workspace")
                : t("Read-only Parliament workspace")
            }}
          </strong>
          <p>
            {{
              governance.capabilitiesError ||
              t(
                "Ledger state is authoritative. Actions are decoded and fee-quoted before vault signing.",
              )
            }}
          </p>
        </div>
      </div>
      <dl>
        <div>
          <dt>{{ t("Capabilities") }}</dt>
          <dd :class="{ positive: governance.canWrite }">
            {{
              governance.canWrite
                ? t("Strict contract verified")
                : t("Unavailable")
            }}
          </dd>
        </div>
        <div>
          <dt>{{ t("Citizen") }}</dt>
          <dd :class="{ positive: governance.isCitizen }">
            {{ governance.isCitizen ? t("Eligible") : t("Not detected") }}
          </dd>
        </div>
        <div>
          <dt>{{ t("Policy proof") }}</dt>
          <dd :class="{ positive: governance.validationFeePolicy }">
            {{
              governance.validationFeePolicy
                ? t("Locally verified")
                : t("Unavailable")
            }}
          </dd>
        </div>
        <div>
          <dt>{{ t("Torii") }}</dt>
          <dd class="mono">{{ endpointLabel }}</dd>
        </div>
      </dl>
    </section>

    <p v-if="governance.actionMessage" class="message success">
      {{ governance.actionMessage }}
    </p>
    <p
      v-if="governance.actionError && !governance.review"
      class="message error"
    >
      {{ governance.actionError }}
    </p>

    <main
      class="governance-workspace"
      :class="{ 'committed-refresh': governance.committedRefresh }"
    >
      <GovernanceProposalList
        v-model="governance.catalogFilter"
        :proposals="governance.proposals"
        :selected-id="governance.selectedProposalId"
        :next-cursor="governance.nextCursor"
        :loading="governance.busy === 'list'"
        :error="governance.listError"
        @select="governance.selectProposal"
        @lookup="governance.selectProposal"
        @load-more="
          governance.loadProposals({ append: true, preserveSelection: true })
        "
      />

      <GovernanceProposalDetail
        :proposal="governance.selectedProposal"
        :loading="
          governance.busy === 'detail' || governance.busy === 'bootstrap'
        "
        :error="governance.detailError"
      />

      <GovernanceInspector />
    </main>

    <GovernanceComposer />
    <GovernanceReviewSheet />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAppI18n } from "@/composables/useAppI18n";
import { useParliamentStore } from "@/stores/parliament";
import { AppButton, RouteHeaderAction } from "@/components/ui";
import GovernanceComposer from "@/components/governance/GovernanceComposer.vue";
import GovernanceInspector from "@/components/governance/GovernanceInspector.vue";
import GovernanceProposalDetail from "@/components/governance/GovernanceProposalDetail.vue";
import GovernanceProposalList from "@/components/governance/GovernanceProposalList.vue";
import GovernanceReviewSheet from "@/components/governance/GovernanceReviewSheet.vue";

const governance = useParliamentStore();
const route = useRoute();
const router = useRouter();
const { t } = useAppI18n();
let pollTimer: ReturnType<typeof setInterval> | null = null;

const proposalQuery = computed(() => {
  const value = route.query.proposal;
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
});

const endpointLabel = computed(() => {
  try {
    return new URL(governance.toriiUrl).host;
  } catch {
    return governance.toriiUrl || t("Unavailable");
  }
});

watch(
  () => governance.selectedProposalId,
  (proposalId) => {
    if ((proposalId ?? "") === proposalQuery.value) return;
    const query = { ...route.query };
    if (proposalId) query.proposal = proposalId;
    else delete query.proposal;
    void router.replace({ query });
  },
);

watch(proposalQuery, (proposalId) => {
  if (proposalId && proposalId !== governance.selectedProposalId) {
    void governance.selectProposal(proposalId);
  }
});

onMounted(async () => {
  await governance.bootstrap(proposalQuery.value);
  pollTimer = setInterval(() => {
    if (
      document.visibilityState === "visible" &&
      !governance.busy &&
      !governance.review
    ) {
      void Promise.all([
        governance.loadProposals({ preserveSelection: true }),
        governance.refreshSelectedProposal(),
      ]);
    }
  }, 15_000);
});

onBeforeUnmount(() => {
  if (pollTimer) clearInterval(pollTimer);
});
</script>

<style scoped>
.governance-shell {
  display: grid;
  gap: 14px;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.governance-context {
  padding: 14px 17px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  border: 1px solid var(--frost-border);
  border-color: var(--frost-border);
  border-radius: var(--radius-panel);
  background: var(--frost-panel-raised);
  box-shadow: var(--shadow-raised);
  backdrop-filter: var(--frost-filter-panel);
  -webkit-backdrop-filter: var(--frost-filter-panel);
}

.context-intro {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 11px;
}

.live-dot {
  width: 8px;
  height: 8px;
  flex: none;
  border-radius: 50%;
  background: var(--color-success);
  box-shadow: 0 0 0 4px
    color-mix(in srgb, var(--color-success) 15%, transparent);
}

.live-dot.unavailable {
  background: var(--color-warning);
  box-shadow: 0 0 0 4px
    color-mix(in srgb, var(--color-warning) 15%, transparent);
}

.context-intro strong {
  font-size: 0.78rem;
}

.context-intro p {
  margin: 3px 0 0;
  color: var(--color-text-muted);
  font-size: 0.68rem;
}

.governance-context dl {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 24px;
}

.governance-context dl > div {
  display: grid;
  gap: 3px;
}

.governance-context dt {
  color: var(--color-text-muted);
  font-size: 0.59rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.governance-context dd {
  max-width: 190px;
  margin: 0;
  overflow: hidden;
  font-size: 0.68rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.governance-context dd.positive {
  color: var(--color-success);
}

.mono {
  font-family: var(--mono-font);
}

.governance-workspace {
  display: grid;
  grid-template-columns:
    minmax(218px, 0.78fr)
    minmax(480px, 2fr)
    minmax(224px, 0.8fr);
  align-items: start;
  gap: 12px;
  transition:
    opacity var(--duration-route) var(--ease-standard),
    transform var(--duration-route) var(--ease-standard);
}

.governance-workspace.committed-refresh {
  animation: committed-state-refresh 720ms var(--ease-standard);
}

@keyframes committed-state-refresh {
  0% {
    opacity: 0.68;
    transform: translateY(3px);
  }

  52% {
    filter: saturate(1.08);
  }

  100% {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 1180px) {
  .governance-workspace {
    grid-template-columns: minmax(210px, 0.7fr) minmax(460px, 1.6fr);
  }

  .governance-workspace :deep(.governance-inspector) {
    grid-column: 1 / -1;
    grid-template-columns: 0.55fr 1.45fr;
  }
}

@media (max-width: 820px) {
  .governance-context {
    align-items: flex-start;
    flex-direction: column;
  }

  .governance-context dl {
    width: 100%;
    justify-content: space-between;
    gap: 12px;
  }

  .governance-workspace {
    grid-template-columns: 1fr;
  }

  .governance-workspace :deep(.governance-catalog) {
    max-height: 350px;
  }

  .governance-workspace :deep(.governance-inspector) {
    grid-column: auto;
    grid-template-columns: 1fr;
  }
}

@media (max-width: 560px) {
  .header-actions {
    width: 100%;
  }

  .header-actions > * {
    flex: 1;
  }

  .context-intro p {
    display: none;
  }

  .governance-context dl {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }

  .governance-context dl > div:last-child {
    grid-column: span 2;
  }
}

@media (prefers-reduced-motion: reduce) {
  .governance-workspace.committed-refresh {
    animation: none;
  }
}
</style>

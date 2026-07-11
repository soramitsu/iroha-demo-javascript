<template>
  <div class="parliament-shell parliament-workbench">
    <RouteHeaderAction>
      <AppButton
        variant="secondary"
        :disabled="loadingBootstrap"
        @click="refresh"
      >
        {{ loadingBootstrap ? t("Refreshing…") : t("Refresh") }}
      </AppButton>
    </RouteHeaderAction>

    <section
      class="parliament-status-card parliament-readiness-card"
      aria-labelledby="voting-eligibility-heading"
    >
      <header class="card-header parliament-readiness-header">
        <div>
          <p class="parliament-kicker">{{ t("SORA Parliament") }}</p>
          <h2 id="voting-eligibility-heading">{{ t("Voting eligibility") }}</h2>
        </div>
      </header>

      <div
        class="parliament-citizenship-panel"
        :class="{ 'parliament-citizenship-panel-positive': alreadyCitizen }"
      >
        <div class="parliament-citizenship-copy">
          <p class="kv-label">{{ t("Citizenship") }}</p>
          <h3>{{ citizenshipHeadline }}</h3>
          <p class="helper">{{ citizenshipPanelDetail }}</p>
        </div>
        <div class="parliament-citizen-count">
          <span class="kv-label">{{ t("Citizens") }}</span>
          <span class="kv-value">{{ citizenCountDisplay }}</span>
        </div>
      </div>

      <div class="parliament-readiness-grid">
        <div class="kv">
          <span class="kv-label">{{ t("XOR Balance") }}</span>
          <span class="kv-value">{{ xorBalance }} XOR</span>
        </div>
        <div class="kv">
          <span class="kv-label">{{ t("Required Bond") }}</span>
          <span class="kv-value">{{ citizenshipBondAmount }} XOR</span>
        </div>
        <div class="kv">
          <span class="kv-label">{{ t("Role") }}</span>
          <span class="kv-value">{{ governanceRoleLabel }}</span>
        </div>
        <div class="kv">
          <span class="kv-label">{{ t("Endpoint") }}</span>
          <span class="kv-value mono">{{ toriiUrl || t("—") }}</span>
        </div>
      </div>

      <div class="parliament-next-action">
        <div>
          <span class="kv-label">{{ t("Next action") }}</span>
          <strong>{{ nextActionLabel }}</strong>
          <p v-if="nextActionReason" class="helper tight">
            {{ nextActionReason }}
          </p>
        </div>
        <button
          type="button"
          data-ui-primary-action
          :disabled="!canBondCitizen"
          @click="handleBondCitizen"
        >
          {{
            actionBusy === "bond"
              ? t("Submitting…")
              : t("Bond {amount} XOR", { amount: citizenshipBondAmount })
          }}
        </button>
      </div>

      <p v-if="!alreadyCitizen" class="transaction-fee-note">
        <span>{{ t("Fee") }}</span>
        <strong>{{ bondFeeLabel }}</strong>
      </p>
      <p v-if="alreadyCitizen" class="message success">
        {{
          t(
            "Citizenship voting permission detected. Bonding is no longer required.",
          )
        }}
      </p>
      <p v-if="!alreadyCitizen && bondGate.reason" class="message warning">
        {{ bondGate.reason }}
      </p>
      <p v-if="statusMessage" class="helper">{{ statusMessage }}</p>
      <p v-if="actionMessage" class="message success">{{ actionMessage }}</p>
      <p v-if="errorMessage" class="message error">{{ errorMessage }}</p>

      <details class="technical-details compact">
        <summary>{{ t("Voting details") }}</summary>
        <div class="grid-2">
          <div class="kv">
            <span class="kv-label">{{ t("Account") }}</span>
            <span class="kv-value mono">{{
              activeAccountDisplayId || t("—")
            }}</span>
          </div>
          <div class="kv">
            <span class="kv-label">{{ t("Chain") }}</span>
            <span class="kv-value">{{ chainId || t("—") }}</span>
          </div>
          <div class="kv">
            <span class="kv-label">{{ t("Asset") }}</span>
            <span class="kv-value mono">{{
              citizenshipAssetDefinitionId || assetDefinitionId || t("—")
            }}</span>
          </div>
        </div>
        <div class="permission-stack">
          <span
            class="pill mini"
            :class="hasBallotPermission ? 'positive' : 'muted'"
          >
            {{
              t("Ballot: {state}", {
                state: hasBallotPermission ? t("enabled") : t("missing"),
              })
            }}
          </span>
          <span
            class="pill mini"
            :class="hasCitizenRecord ? 'positive' : 'muted'"
          >
            {{
              t("Citizenship: {state}", {
                state: hasCitizenRecord ? t("registered") : t("missing"),
              })
            }}
          </span>
          <span
            class="pill mini"
            :class="hasParliamentPermission ? 'positive' : 'muted'"
          >
            {{
              t("Parliament: {state}", {
                state: hasParliamentPermission ? t("enabled") : t("missing"),
              })
            }}
          </span>
          <span
            class="pill mini"
            :class="hasEnactPermission ? 'positive' : 'muted'"
          >
            {{
              t("Enact: {state}", {
                state: hasEnactPermission ? t("enabled") : t("missing"),
              })
            }}
          </span>
        </div>
      </details>
    </section>

    <section
      class="parliament-decision-workspace"
      :aria-label="t('Active proposal')"
    >
      <section
        id="parliament-panel-summary"
        class="parliament-lookup-card parliament-proposal-workspace"
        :class="{ active: activePanel === 'summary' }"
        role="tabpanel"
        aria-labelledby="parliament-tab-summary"
      >
        <header class="card-header">
          <div>
            <h2>{{ t("Active proposal") }}</h2>
            <p class="helper tight">{{ proposalSummaryDetail }}</p>
          </div>
          <button
            type="button"
            class="secondary"
            :disabled="!canLookupGovernance"
            @click="lookupGovernance"
          >
            {{ lookupLoading ? t("Loading…") : t("Load") }}
          </button>
        </header>

        <div class="form-grid">
          <label>
            {{ t("Referendum ID") }}
            <input
              v-model.trim="referendumId"
              type="text"
              data-testid="referendum-id-input"
            />
          </label>
          <label>
            {{ t("Proposal ID (0x...)") }}
            <input
              v-model.trim="proposalId"
              type="text"
              data-testid="proposal-id-input"
            />
          </label>
        </div>
        <p v-if="proposalIdFormatError" class="message warning">
          {{
            t("Proposal ID must be 32-byte hex (with or without 0x prefix).")
          }}
        </p>

        <div class="parliament-selected-record">
          <div>
            <span class="kv-label">{{ t("Selection") }}</span>
            <h3>{{ proposalSummaryTitle }}</h3>
          </div>
          <span
            class="pill mini"
            :class="lifecycleSnapshot.source === 'torii' ? 'positive' : 'muted'"
          >
            {{
              lifecycleSnapshot.source === "torii"
                ? t("Lifecycle endpoint")
                : t("Fallback lifecycle")
            }}
          </span>
        </div>

        <div v-if="tally?.tally" class="grid-2 parliament-tally">
          <div class="kv">
            <span class="kv-label">{{ t("Aye") }}</span>
            <span class="kv-value">{{ tally.tally.approve }}</span>
          </div>
          <div class="kv">
            <span class="kv-label">{{ t("Nay") }}</span>
            <span class="kv-value">{{ tally.tally.reject }}</span>
          </div>
          <div class="kv">
            <span class="kv-label">{{ t("Abstain") }}</span>
            <span class="kv-value">{{ tally.tally.abstain }}</span>
          </div>
          <div class="kv">
            <span class="kv-label">{{ t("Lock Records") }}</span>
            <span class="kv-value">{{ lockCount }}</span>
          </div>
        </div>

        <div class="parliament-lookup-status">
          <p v-if="referendum" class="helper">
            {{
              t("Referendum found: {value}.", {
                value: referendum.found ? t("yes") : t("no"),
              })
            }}
          </p>
          <p v-if="proposal" class="helper">
            {{
              t("Proposal found: {value}.", {
                value: proposal.found ? t("yes") : t("no"),
              })
            }}
          </p>
          <p v-if="lifecycleCapabilityMessage" class="helper">
            {{ lifecycleCapabilityMessage }}
          </p>
        </div>

        <div
          v-if="recentReferenda.length || recentProposals.length"
          class="history-stack"
        >
          <div v-if="recentReferenda.length">
            <p class="helper tight">{{ t("Recent referenda") }}</p>
            <div class="history-chips">
              <button
                v-for="recentReferendumId in recentReferenda"
                :key="`referendum-${recentReferendumId}`"
                class="ghost history-chip"
                type="button"
                :title="recentReferendumId"
                @click="applyRecentReferendum(recentReferendumId)"
              >
                {{ recentReferendumId }}
              </button>
            </div>
          </div>
          <div v-if="recentProposals.length">
            <p class="helper tight">{{ t("Recent proposals") }}</p>
            <div class="history-chips">
              <button
                v-for="recentProposalId in recentProposals"
                :key="`proposal-${recentProposalId}`"
                class="ghost history-chip mono"
                type="button"
                :title="recentProposalId"
                @click="applyRecentProposal(recentProposalId)"
              >
                {{ shortenIdentifier(recentProposalId) }}
              </button>
            </div>
          </div>
          <div class="history-actions">
            <button
              class="secondary history-clear"
              type="button"
              @click="clearHistory"
            >
              {{ t("Clear history") }}
            </button>
          </div>
        </div>
      </section>

      <section class="parliament-lifecycle-card">
        <header class="card-header">
          <div>
            <h2>{{ t("Lifecycle") }}</h2>
            <p class="helper tight">
              {{ t("Select a stage to inspect only the relevant evidence.") }}
            </p>
          </div>
        </header>

        <div
          class="parliament-mobile-tabs"
          role="tablist"
          :aria-label="t('Lifecycle')"
          @keydown="handlePanelTabKeydown"
        >
          <button
            id="parliament-tab-summary"
            type="button"
            role="tab"
            aria-controls="parliament-panel-summary"
            :aria-selected="activePanel === 'summary'"
            :tabindex="activePanel === 'summary' ? 0 : -1"
            :class="{ active: activePanel === 'summary' }"
            @click="activePanel = 'summary'"
          >
            {{ t("Summary") }}
          </button>
          <button
            id="parliament-tab-stage"
            type="button"
            role="tab"
            aria-controls="parliament-panel-stage"
            :aria-selected="activePanel === 'stage'"
            :tabindex="activePanel === 'stage' ? 0 : -1"
            :class="{ active: activePanel === 'stage' }"
            @click="activePanel = 'stage'"
          >
            {{ t("Stage") }}
          </button>
          <button
            id="parliament-tab-actions"
            type="button"
            role="tab"
            aria-controls="parliament-panel-actions"
            :aria-selected="activePanel === 'actions'"
            :tabindex="activePanel === 'actions' ? 0 : -1"
            :class="{ active: activePanel === 'actions' }"
            @click="activePanel = 'actions'"
          >
            {{ t("Actions") }}
          </button>
        </div>

        <div
          id="parliament-panel-stage"
          class="parliament-lifecycle-layout"
          :class="{ active: activePanel === 'stage' }"
          role="tabpanel"
          aria-labelledby="parliament-tab-stage"
        >
          <nav class="parliament-stepper" :aria-label="t('Lifecycle')">
            <button
              v-for="stage in lifecycleStages"
              :key="stage.id"
              type="button"
              :class="[
                `status-${stage.status}`,
                { active: selectedStageId === stage.id },
              ]"
              @click="selectedStageId = stage.id"
            >
              <span>{{ t(stage.labelKey) }}</span>
              <small>{{ t(stage.status) }}</small>
            </button>
          </nav>

          <div class="parliament-stage-detail">
            <span class="kv-label">{{ t("Selected stage") }}</span>
            <h3>{{ t(activeLifecycleStage.labelKey) }}</h3>
            <p class="helper">{{ selectedStageDetail }}</p>

            <div
              v-if="activeLifecycleStage.id === 'briefs'"
              class="parliament-evidence-grid"
            >
              <div class="kv">
                <span class="kv-label">{{ t("Expert briefs") }}</span>
                <span class="kv-value">{{
                  lifecycleSnapshot.briefStatus.endpointAvailable
                    ? lifecycleSnapshot.briefStatus.submitted
                    : t("Unavailable")
                }}</span>
              </div>
              <div class="kv">
                <span class="kv-label">{{ t("Red-team briefs") }}</span>
                <span class="kv-value">{{
                  lifecycleSnapshot.briefStatus.endpointAvailable
                    ? lifecycleSnapshot.briefStatus.redTeamSubmitted
                    : t("Unavailable")
                }}</span>
              </div>
            </div>

            <div
              v-else-if="activeLifecycleStage.id === 'challenge'"
              class="parliament-evidence-grid"
            >
              <div class="kv">
                <span class="kv-label">{{ t("Challenge window") }}</span>
                <span class="kv-value">{{
                  lifecycleSnapshot.challengeStatus.endpointAvailable
                    ? t(
                        lifecycleSnapshot.challengeStatus.open
                          ? "open"
                          : "closed",
                      )
                    : t("Unavailable")
                }}</span>
              </div>
              <div class="kv">
                <span class="kv-label">{{ t("Active challenges") }}</span>
                <span class="kv-value">{{
                  lifecycleSnapshot.challengeStatus.endpointAvailable
                    ? lifecycleSnapshot.challengeStatus.activeChallenges
                    : t("Unavailable")
                }}</span>
              </div>
              <div class="kv">
                <span class="kv-label">{{ t("Challenge bond") }}</span>
                <span class="kv-value">{{
                  lifecycleSnapshot.challengeStatus.endpointAvailable
                    ? lifecycleSnapshot.challengeStatus.bondRequired
                      ? `${lifecycleSnapshot.challengeStatus.bondRequired} XOR`
                      : t("Unavailable")
                    : t("Unavailable")
                }}</span>
              </div>
            </div>

            <div
              v-else-if="activeLifecycleStage.id === 'canary'"
              class="parliament-evidence-grid"
            >
              <div class="kv">
                <span class="kv-label">{{ t("Rollout") }}</span>
                <span class="kv-value">{{
                  lifecycleSnapshot.rolloutStatus.endpointAvailable
                    ? t(lifecycleSnapshot.rolloutStatus.phase)
                    : t("Unavailable")
                }}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        id="parliament-panel-actions"
        class="parliament-ballot-card parliament-action-card"
        :class="{ active: activePanel === 'actions' }"
        role="tabpanel"
        aria-labelledby="parliament-tab-actions"
      >
        <header class="card-header">
          <div>
            <h2>{{ t("Vote") }}</h2>
            <p class="helper tight">
              {{ t("Plain ballots use the current referendum and wallet.") }}
            </p>
          </div>
        </header>
        <div class="form-grid">
          <label>
            {{ t("Amount (XOR)") }}
            <input
              v-model.trim="ballotAmount"
              type="text"
              data-testid="ballot-amount-input"
            />
          </label>
          <label>
            {{ t("Lock duration (blocks)") }}
            <input
              v-model.number="durationBlocks"
              type="number"
              min="1"
              step="1"
            />
          </label>
          <label>
            {{ t("Direction") }}
            <select v-model="direction">
              <option value="Aye">{{ t("Aye") }}</option>
              <option value="Nay">{{ t("Nay") }}</option>
              <option value="Abstain">{{ t("Abstain") }}</option>
            </select>
          </label>
        </div>
        <div class="actions">
          <button
            type="button"
            :disabled="!canSubmitBallot"
            @click="handleBallot"
          >
            {{
              actionBusy === "ballot" ? t("Submitting…") : t("Submit ballot")
            }}
          </button>
          <button class="secondary" type="button" disabled>
            {{ t("Stage ballot") }}
          </button>
        </div>
        <p class="transaction-fee-note">
          <span>{{ t("Fee") }}</span>
          <strong>{{ ballotFeeLabel }}</strong>
        </p>
        <p v-if="ballotGate.reason" class="message warning">
          {{ ballotGate.reason }}
        </p>
        <p v-if="stageBallotGate.reason" class="message warning">
          {{ stageBallotGate.reason }}
        </p>
      </section>
    </section>

    <details
      class="parliament-advanced-card technical-details"
      data-testid="parliament-advanced-drawer"
    >
      <summary>
        <span>{{ t("Advanced governance tools") }}</span>
        <small>{{
          t("Proposal drafts, council state, finalize, enact")
        }}</small>
      </summary>

      <div class="parliament-advanced-grid">
        <section class="parliament-proposal-card">
          <header class="card-header">
            <h2>{{ t("Prepare proposal") }}</h2>
          </header>
          <div class="form-grid">
            <label>
              {{ t("Contract target") }}
              <select v-model="deployTargetKind">
                <option value="address">{{ t("Contract address") }}</option>
                <option value="alias">{{ t("Contract alias") }}</option>
              </select>
            </label>
            <label>
              {{
                deployTargetKind === "address"
                  ? t("Contract address")
                  : t("Contract alias")
              }}
              <input
                v-model.trim="deployTargetValue"
                type="text"
                data-testid="proposal-contract-target-input"
              />
            </label>
            <label>
              {{ t("Code hash") }}
              <input
                v-model.trim="deployCodeHash"
                type="text"
                data-testid="proposal-code-hash-input"
              />
            </label>
            <label>
              {{ t("ABI hash") }}
              <input
                v-model.trim="deployAbiHash"
                type="text"
                data-testid="proposal-abi-hash-input"
              />
            </label>
            <label>
              {{ t("ABI version") }}
              <input v-model.trim="deployAbiVersion" type="text" />
            </label>
            <label>
              {{ t("Voting mode") }}
              <select v-model="deployVotingMode">
                <option value="Plain">{{ t("Plain") }}</option>
                <option value="Zk">{{ t("ZK") }}</option>
              </select>
            </label>
            <label>
              {{ t("Window lower") }}
              <input
                v-model.trim="deployWindowLower"
                type="text"
                inputmode="numeric"
              />
            </label>
            <label>
              {{ t("Window upper") }}
              <input
                v-model.trim="deployWindowUpper"
                type="text"
                inputmode="numeric"
              />
            </label>
            <label class="form-span-2">
              {{ t("Limits JSON") }}
              <textarea v-model.trim="deployLimitsJson" rows="3"></textarea>
            </label>
          </div>
          <div class="actions">
            <button
              type="button"
              class="secondary"
              :disabled="!canPrepareDeployProposal"
              @click="handleDeployProposalDraft"
            >
              {{
                actionBusy === "proposal" ? t("Preparing…") : t("Prepare draft")
              }}
            </button>
          </div>
          <p v-if="deployWindowError" class="message warning">
            {{ deployWindowError }}
          </p>
          <p v-if="deployLimitsError" class="message warning">
            {{ deployLimitsError }}
          </p>
          <p v-if="deployProposalDraft" class="helper">
            {{
              t("Proposal draft: {summary}", {
                summary: summarizeDraft(deployProposalDraft),
              })
            }}
          </p>
        </section>

        <section class="parliament-council-card">
          <header class="card-header">
            <h2>{{ t("Council & Draft Ops") }}</h2>
          </header>
          <div class="grid-2">
            <div class="kv">
              <span class="kv-label">{{ t("Current Epoch") }}</span>
              <span class="kv-value">{{ council?.epoch ?? t("—") }}</span>
            </div>
            <div class="kv">
              <span class="kv-label">{{ t("Members") }}</span>
              <span class="kv-value">{{ council?.members.length ?? 0 }}</span>
            </div>
            <div class="kv">
              <span class="kv-label">{{ t("Alternates") }}</span>
              <span class="kv-value">{{
                council?.alternates.length ?? 0
              }}</span>
            </div>
            <div class="kv">
              <span class="kv-label">{{ t("Derived By") }}</span>
              <span class="kv-value">{{ council?.derived_by ?? t("—") }}</span>
            </div>
          </div>

          <div class="grid-2 parliament-unlock-stats">
            <div class="kv">
              <span class="kv-label">{{ t("Current Height") }}</span>
              <span class="kv-value">{{
                unlockStats?.height_current ?? t("—")
              }}</span>
            </div>
            <div class="kv">
              <span class="kv-label">{{ t("Expired Locks") }}</span>
              <span class="kv-value">{{
                unlockStats?.expired_locks_now ?? t("—")
              }}</span>
            </div>
            <div class="kv">
              <span class="kv-label">{{
                t("Referenda With Expired Locks")
              }}</span>
              <span class="kv-value">{{
                unlockStats?.referenda_with_expired ?? t("—")
              }}</span>
            </div>
            <div class="kv">
              <span class="kv-label">{{ t("Last Sweep") }}</span>
              <span class="kv-value">{{
                unlockStats?.last_sweep_height ?? t("—")
              }}</span>
            </div>
          </div>

          <div class="actions">
            <button
              type="button"
              class="secondary"
              :disabled="!canFinalizeDraft"
              @click="handleFinalize"
            >
              {{
                actionBusy === "finalize"
                  ? t("Preparing…")
                  : t("Finalize draft")
              }}
            </button>
            <button
              type="button"
              class="secondary"
              :disabled="!canEnactDraft"
              @click="handleEnact"
            >
              {{ actionBusy === "enact" ? t("Preparing…") : t("Enact draft") }}
            </button>
          </div>
          <p v-if="finalizeGate.reason" class="message warning">
            {{ finalizeGate.reason }}
          </p>
          <p v-if="enactGate.reason" class="message warning">
            {{ enactGate.reason }}
          </p>

          <p v-if="finalizeDraft" class="helper">
            {{
              t("Finalize draft: {summary}", {
                summary: summarizeDraft(finalizeDraft),
              })
            }}
          </p>
          <p v-if="enactDraft" class="helper">
            {{
              t("Enact draft: {summary}", {
                summary: summarizeDraft(enactDraft),
              })
            }}
          </p>

          <details
            v-if="council?.members.length"
            class="technical-details compact"
          >
            <summary>{{ t("Council members") }}</summary>
            <ul class="member-list mono">
              <li v-for="member in council.members" :key="member.account_id">
                {{ member.account_id }}
              </li>
            </ul>
          </details>

          <div
            v-if="referendum?.referendum || proposal?.proposal"
            class="payload-stack"
          >
            <details class="technical-details">
              <summary>{{ t("Raw proposal data") }}</summary>
              <pre v-if="referendum?.referendum" class="payload mono">{{
                JSON.stringify(referendum.referendum, null, 2)
              }}</pre>
              <pre v-if="proposal?.proposal" class="payload mono">{{
                JSON.stringify(proposal.proposal, null, 2)
              }}</pre>
            </details>
          </div>
        </section>
      </div>
    </details>
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useAppI18n } from "@/composables/useAppI18n";
import { AppButton, RouteHeaderAction } from "@/components/ui";
import { useParliamentStore } from "@/stores/parliament";

const { t } = useAppI18n();
const parliament = useParliamentStore();
const {
  activeAccountDisplayId,
  activeLifecycleStage,
  activePanel,
  alreadyCitizen,
  assetDefinitionId,
  ballotAmount,
  ballotFeeLabel,
  ballotGate,
  bondFeeLabel,
  bondGate,
  canBondCitizen,
  canEnactDraft,
  canFinalizeDraft,
  canLookupGovernance,
  canPrepareDeployProposal,
  canSubmitBallot,
  chainId,
  citizenCountDisplay,
  citizenshipAssetDefinitionId,
  citizenshipBondAmount,
  citizenshipHeadline,
  citizenshipPanelDetail,
  council,
  deployAbiHash,
  deployAbiVersion,
  deployCodeHash,
  deployLimitsError,
  deployLimitsJson,
  deployProposalDraft,
  deployTargetKind,
  deployTargetValue,
  deployVotingMode,
  deployWindowError,
  deployWindowLower,
  deployWindowUpper,
  direction,
  durationBlocks,
  enactDraft,
  enactGate,
  errorMessage,
  finalizeDraft,
  finalizeGate,
  governanceRoleLabel,
  hasBallotPermission,
  hasCitizenRecord,
  hasEnactPermission,
  hasParliamentPermission,
  lifecycleCapabilityMessage,
  lifecycleSnapshot,
  lifecycleStages,
  loadingBootstrap,
  lockCount,
  lookupLoading,
  nextActionLabel,
  nextActionReason,
  proposal,
  proposalId,
  proposalIdFormatError,
  proposalSummaryDetail,
  proposalSummaryTitle,
  recentProposals,
  recentReferenda,
  referendum,
  referendumId,
  selectedStageDetail,
  selectedStageId,
  stageBallotGate,
  statusMessage,
  actionBusy,
  actionMessage,
  tally,
  toriiUrl,
  unlockStats,
  xorBalance,
} = storeToRefs(parliament);

const {
  applyRecentProposal,
  applyRecentReferendum,
  clearHistory,
  handleBallot,
  handleBondCitizen,
  handleDeployProposalDraft,
  handleEnact,
  handleFinalize,
  lookupGovernance,
  refresh,
  shortenIdentifier,
  summarizeDraft,
} = parliament;

const parliamentPanels = ["summary", "stage", "actions"] as const;
const handlePanelTabKeydown = (event: KeyboardEvent) => {
  const currentIndex = parliamentPanels.indexOf(activePanel.value);
  let nextIndex: number | null = null;
  if (event.key === "ArrowRight" || event.key === "ArrowDown") {
    nextIndex = (currentIndex + 1) % parliamentPanels.length;
  } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
    nextIndex =
      (currentIndex - 1 + parliamentPanels.length) % parliamentPanels.length;
  } else if (event.key === "Home") {
    nextIndex = 0;
  } else if (event.key === "End") {
    nextIndex = parliamentPanels.length - 1;
  }
  if (nextIndex === null) return;
  event.preventDefault();
  const nextPanel = parliamentPanels[nextIndex];
  activePanel.value = nextPanel;
  document.getElementById(`parliament-tab-${nextPanel}`)?.focus();
};
</script>

<style scoped>
.helper {
  margin-top: 10px;
  font-size: 0.85rem;
  color: var(--iroha-muted);
}

.helper.tight {
  margin-top: 6px;
}

.parliament-workbench {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 24px;
}

.parliament-readiness-card,
.parliament-advanced-card {
  min-width: 0;
  border: 1px solid var(--panel-border);
  border-radius: 22px;
  background: var(--surface-strong);
  box-shadow: var(--shadow-raised);
}

.parliament-readiness-card {
  padding: clamp(20px, 3vw, 32px);
  border-color: var(--frost-border);
  background: var(--frost-panel-raised);
  -webkit-backdrop-filter: var(--frost-filter-panel);
  backdrop-filter: var(--frost-filter-panel);
}

.parliament-kicker {
  margin: 0 0 6px;
  color: var(--iroha-muted);
  font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}

.parliament-readiness-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
}

.parliament-readiness-header h2 {
  margin: 0;
}

.parliament-readiness-header .ghost {
  min-height: 40px;
  padding-inline: 10px;
  background: transparent;
  box-shadow: none;
}

.parliament-citizenship-panel {
  display: flex;
  gap: 18px;
  align-items: center;
  justify-content: space-between;
  margin: 18px 0 0;
  padding: 18px 0;
  border-block: 1px solid var(--panel-border);
}

.parliament-citizenship-panel-positive {
  border-color: color-mix(
    in srgb,
    var(--color-success) 38%,
    var(--color-border)
  );
}

.parliament-citizenship-copy {
  min-width: 0;
}

.parliament-citizenship-panel h3,
.parliament-selected-record h3,
.parliament-stage-detail h3 {
  margin: 6px 0 0;
  font-size: clamp(1.2rem, 2.2vw, 1.65rem);
  line-height: 1.08;
}

.parliament-citizenship-panel .helper {
  margin-top: 8px;
  max-width: 62ch;
}

.parliament-citizen-count {
  display: grid;
  gap: 4px;
  min-width: 128px;
  padding-inline-start: 20px;
  border-inline-start: 1px solid var(--panel-border);
}

.parliament-citizen-count .kv-value {
  font-size: 1.45rem;
  font-variant-numeric: tabular-nums;
}

.parliament-readiness-grid,
.parliament-evidence-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin-top: 0;
  border-radius: 14px;
  background: var(--color-surface-inset);
  box-shadow: var(--shadow-inset);
  overflow: hidden;
}

.parliament-readiness-grid .kv {
  min-width: 0;
  padding: 16px 14px;
  border-bottom: 1px solid var(--panel-border);
}

.parliament-readiness-grid .kv + .kv {
  border-inline-start: 1px solid var(--panel-border);
}

.parliament-readiness-grid .kv-value {
  overflow-wrap: anywhere;
}

.parliament-next-action {
  display: flex;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
  margin-top: 18px;
  padding: 18px 20px;
  border-radius: 16px;
  border: 1px solid var(--frost-border);
  background: var(--frost-panel-soft);
  box-shadow: var(--shadow-inset);
  -webkit-backdrop-filter: var(--frost-filter-soft);
  backdrop-filter: var(--frost-filter-soft);
}

.parliament-next-action strong {
  display: block;
  margin-top: 4px;
}

.parliament-selected-record {
  display: flex;
  gap: 14px;
  align-items: flex-start;
  justify-content: space-between;
  margin-top: 20px;
  padding: 18px 0;
  border-block: 1px solid var(--panel-border);
}

.parliament-lookup-status {
  margin-top: 8px;
}

.parliament-decision-workspace {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(300px, 0.65fr);
  overflow: hidden;
  border: 1px solid var(--frost-border);
  border-radius: 22px;
  background: var(--frost-panel-raised);
  box-shadow: var(--shadow-raised);
  -webkit-backdrop-filter: var(--frost-filter-panel);
  backdrop-filter: var(--frost-filter-panel);
}

.parliament-proposal-workspace,
.parliament-lifecycle-card,
.parliament-action-card {
  min-width: 0;
  padding: clamp(18px, 2.5vw, 28px);
}

.parliament-proposal-workspace {
  grid-column: 1 / -1;
  border-bottom: 1px solid var(--panel-border);
}

.parliament-proposal-workspace .card-header,
.parliament-lifecycle-card .card-header,
.parliament-action-card .card-header,
.parliament-advanced-grid .card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.parliament-proposal-workspace .card-header h2,
.parliament-lifecycle-card .card-header h2,
.parliament-action-card .card-header h2,
.parliament-advanced-grid .card-header h2 {
  margin: 0;
}

.parliament-proposal-workspace > .form-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.parliament-lifecycle-card {
  border-inline-end: 1px solid var(--panel-border);
}

.parliament-action-card {
  background: var(--frost-panel-soft);
  -webkit-backdrop-filter: var(--frost-filter-soft);
  backdrop-filter: var(--frost-filter-soft);
}

.parliament-action-card > .form-grid {
  grid-template-columns: minmax(0, 1fr);
}

.parliament-action-card .actions {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
}

.parliament-action-card .actions button {
  width: 100%;
}

.parliament-mobile-tabs {
  display: none;
  gap: 8px;
  margin: 14px 0;
  padding: 0;
  border-bottom: 1px solid var(--panel-border);
}

.parliament-mobile-tabs button {
  position: relative;
  flex: 1 1 0;
  min-height: 44px;
  padding: 8px 10px;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--iroha-muted);
  box-shadow: none;
}

.parliament-mobile-tabs button.active {
  color: var(--iroha-text);
}

.parliament-mobile-tabs button.active::after {
  content: "";
  position: absolute;
  inset: auto 10px -1px;
  height: 2px;
  background: var(--iroha-accent);
}

.parliament-lifecycle-layout {
  display: grid;
  gap: 20px;
  grid-template-columns: minmax(190px, 0.38fr) minmax(0, 1fr);
  align-items: start;
}

.parliament-stepper {
  display: grid;
  gap: 8px;
}

.parliament-stepper button {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
  min-height: 46px;
  padding: 10px 4px;
  border: 0;
  border-bottom: 1px solid var(--panel-border);
  border-radius: 0;
  background: transparent;
  color: var(--iroha-text);
  box-shadow: none;
  text-align: start;
}

.parliament-stepper button.active {
  border-bottom-color: var(--iroha-accent);
  color: var(--iroha-accent);
}

.parliament-stepper small {
  color: var(--iroha-muted);
  font-size: 0.72rem;
  text-transform: uppercase;
}

.parliament-stepper .status-unavailable,
.parliament-stepper .status-blocked {
  color: var(--color-text-muted);
}

.parliament-stage-detail {
  min-height: 220px;
  padding-inline-start: 20px;
  border-inline-start: 1px solid var(--panel-border);
}

.parliament-advanced-card {
  padding: 0;
  overflow: hidden;
  margin-top: 0;
  border-color: var(--frost-border);
  background: var(--frost-panel-raised);
  -webkit-backdrop-filter: var(--frost-filter-panel);
  backdrop-filter: var(--frost-filter-panel);
}

.parliament-advanced-card > summary {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
  min-height: 58px;
  padding: 14px 20px;
  cursor: pointer;
}

.parliament-advanced-card > summary small {
  color: var(--iroha-muted);
}

.parliament-advanced-card > summary::-webkit-details-marker {
  display: none;
}

.parliament-advanced-grid {
  display: grid;
  gap: 0;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  padding: 0 20px 20px;
  border-top: 1px solid var(--panel-border);
}

.parliament-proposal-card,
.parliament-council-card {
  min-width: 0;
  padding: 22px;
}

.parliament-proposal-card {
  border-inline-end: 1px solid var(--panel-border);
}

.permission-stack {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 14px;
}

.form-span-2 {
  grid-column: 1 / -1;
}

.parliament-unlock-stats,
.parliament-tally {
  margin-top: 16px;
}

.parliament-tally {
  padding: var(--space-3);
  border-radius: 14px;
  background: var(--color-surface-inset);
  box-shadow: var(--shadow-inset);
}

.history-stack {
  margin-top: 14px;
  display: grid;
  gap: 8px;
}

.history-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.history-chip {
  padding: 6px 10px;
  border-radius: 8px;
  font-size: 0.76rem;
  background: transparent;
  box-shadow: none;
}

.history-actions {
  display: flex;
  justify-content: flex-end;
}

.history-clear {
  padding: 6px 10px;
  border-radius: 10px;
  font-size: 0.75rem;
}

.message {
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: 12px;
  font-size: 0.85rem;
  white-space: pre-line;
}

.message.success {
  border: 1px solid color-mix(in srgb, var(--color-success) 40%, transparent);
  background: var(--color-success-soft);
  color: var(--color-success);
}

.message.warning {
  border: 1px solid color-mix(in srgb, var(--color-warning) 40%, transparent);
  background: var(--color-warning-soft);
  color: var(--color-warning);
}

.message.error {
  border: 1px solid color-mix(in srgb, var(--color-danger) 42%, transparent);
  background: var(--color-danger-soft);
  color: var(--color-danger);
}

.mono {
  font-family: var(--mono-font);
  font-size: 0.8rem;
}

.payload {
  margin-top: 12px;
  border-radius: 12px;
  padding: 12px;
  background: var(--color-surface-inset);
  border: 1px solid var(--panel-border);
  max-height: 240px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
}

.member-list {
  margin: 14px 0 0;
  padding-inline-start: 18px;
  font-size: 0.78rem;
  display: grid;
  gap: 4px;
  max-height: 160px;
  overflow: auto;
}

@media (max-width: 1120px) {
  .parliament-readiness-grid,
  .parliament-evidence-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .parliament-readiness-grid .kv:nth-child(3) {
    border-inline-start: 0;
  }

  .parliament-readiness-grid .kv:nth-child(n + 3) {
    border-top: 1px solid var(--panel-border);
  }

  .parliament-decision-workspace,
  .parliament-advanced-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .parliament-lifecycle-card,
  .parliament-proposal-card {
    border-inline-end: 0;
    border-bottom: 1px solid var(--panel-border);
  }

  .parliament-action-card {
    background: var(--frost-panel-soft);
  }
}

@media (max-width: 720px) {
  .parliament-readiness-card {
    padding: 20px;
  }

  .parliament-readiness-header,
  .parliament-citizenship-panel,
  .parliament-next-action,
  .parliament-selected-record {
    align-items: stretch;
    flex-direction: column;
  }

  .parliament-citizen-count {
    min-width: 0;
    padding: 14px 0 0;
    border-inline-start: 0;
    border-top: 1px solid var(--panel-border);
  }

  .parliament-readiness-grid,
  .parliament-evidence-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .parliament-mobile-tabs {
    display: flex;
    order: -1;
    padding-inline: 18px;
    background: var(--surface-strong);
  }

  .parliament-decision-workspace {
    display: flex;
    flex-direction: column;
  }

  .parliament-lifecycle-card {
    display: contents;
  }

  .parliament-lifecycle-card > .card-header {
    display: none;
  }

  .parliament-proposal-workspace:not(.active),
  .parliament-lifecycle-layout:not(.active),
  .parliament-action-card:not(.active) {
    display: none;
  }

  .parliament-proposal-workspace,
  .parliament-lifecycle-layout,
  .parliament-action-card {
    order: 1;
  }

  .parliament-lifecycle-layout.active {
    display: grid;
    padding: 20px 18px;
  }

  .parliament-stepper {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: minmax(132px, 46vw);
    overflow-x: auto;
    padding-bottom: 8px;
    scroll-snap-type: x proximity;
  }

  .parliament-stepper button {
    scroll-snap-align: start;
  }

  .parliament-stage-detail {
    display: block;
    min-height: 0;
    padding: 18px 0 0;
    border-inline-start: 0;
    border-top: 1px solid var(--panel-border);
  }

  .parliament-proposal-workspace > .form-grid,
  .parliament-advanced-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .parliament-proposal-card {
    border-inline-end: 0;
    border-bottom: 1px solid var(--panel-border);
  }

  .parliament-next-action button {
    width: 100%;
  }
}

.mono {
  unicode-bidi: plaintext;
}
</style>

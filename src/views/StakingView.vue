<template>
  <div class="staking-shell npos-workspace">
    <RouteHeaderAction>
      <AppButton
        variant="secondary"
        :disabled="loadingBootstrap"
        @click="refresh"
      >
        {{ loadingBootstrap ? t("Refreshing…") : t("Refresh") }}
      </AppButton>
    </RouteHeaderAction>

    <section class="staking-command-card" aria-labelledby="staking-heading">
      <header class="staking-command-header">
        <div>
          <p class="staking-kicker">{{ t("Nominated proof of stake") }}</p>
          <h2 id="staking-heading">{{ t("Staking position") }}</h2>
          <p class="helper">
            {{
              t(
                "Nominate validators, manage unbonding, claim rewards, or register this wallet as a public-lane validator.",
              )
            }}
          </p>
        </div>
      </header>

      <div class="staking-stat-grid" :aria-label="t('Stake XOR')">
        <div class="staking-stat">
          <span>{{ t("Available to stake") }}</span>
          <strong>{{ stakeTokenBalance }} {{ stakeTokenSymbol }}</strong>
        </div>
        <div class="staking-stat">
          <span>{{ t("Bonded across lane") }}</span>
          <strong
            >{{ bondedStakeForAccountLabel }} {{ stakeTokenSymbol }}</strong
          >
        </div>
        <div class="staking-stat">
          <span>{{ t("Pending rewards / fees") }}</span>
          <strong>{{ pendingRewardTotalLabel }} {{ stakeTokenSymbol }}</strong>
        </div>
        <div class="staking-stat">
          <span>{{ t("APY estimate") }}</span>
          <strong>{{ rewardApyLabel }}</strong>
        </div>
      </div>

      <div class="staking-messages" aria-live="polite">
        <p v-if="statusMessage" class="helper staking-status-message">
          {{ statusMessage }}
        </p>
        <p v-if="errorMessage" class="message error" role="alert">
          {{ errorMessage }}
        </p>
        <p v-if="actionMessage" class="message success">
          {{ actionMessage }}
        </p>
      </div>
    </section>

    <section
      class="staking-context-card"
      aria-labelledby="lane-context-heading"
    >
      <div class="staking-context-control">
        <label id="lane-context-heading" for="staking-group-select">
          {{ t("Staking group") }}
        </label>
        <select
          id="staking-group-select"
          v-model.number="selectedDataspaceId"
          :disabled="loadingBootstrap || !dataspaceOptions.length"
          @change="handleDataspaceChange"
        >
          <option
            v-for="option in dataspaceOptions"
            :key="option.dataspaceId"
            :value="option.dataspaceId"
          >
            {{
              t("{label} · {lanes} lane(s) · {validators} validator(s)", {
                label: option.label,
                lanes: option.lanes.length,
                validators: option.totalValidators,
              })
            }}
          </option>
        </select>
      </div>
      <div class="staking-context-facts">
        <div class="kv">
          <span class="kv-label">{{ t("Lane") }}</span>
          <span class="kv-value">{{
            laneContext ? `#${laneContext.laneId}` : t("—")
          }}</span>
        </div>
        <div class="kv">
          <span class="kv-label">{{ t("Active validators") }}</span>
          <span class="kv-value">{{ activeValidatorCount }}</span>
        </div>
        <div class="kv">
          <span class="kv-label">{{ t("Stake Token Balance") }}</span>
          <span class="kv-value"
            >{{ stakeTokenBalance }} {{ stakeTokenSymbol }}</span
          >
        </div>
        <div class="kv">
          <span class="kv-label">{{ t("Unbond Delay") }}</span>
          <span class="kv-value">
            {{ policy ? formatDuration(policy.unbondingDelayMs) : t("—") }}
          </span>
        </div>
      </div>
    </section>

    <section class="staking-workspace" aria-labelledby="validators-heading">
      <div class="validator-market-card">
        <header class="staking-section-heading">
          <div>
            <h2 id="validators-heading">{{ t("Validator nominations") }}</h2>
            <p class="helper tight">
              {{ t("Select a validator, then bond XOR to nominate it.") }}
            </p>
          </div>
          <span class="staking-count" aria-hidden="true">{{
            validators.length
          }}</span>
        </header>

        <div
          v-if="validators.length"
          class="validator-list"
          role="listbox"
          :aria-label="t('Validator nominations')"
        >
          <button
            v-for="entry in validators"
            :key="entry.validator"
            type="button"
            class="validator-row"
            role="option"
            :aria-selected="entry.validator === selectedValidator"
            :class="{ selected: entry.validator === selectedValidator }"
            :disabled="loadingLaneData"
            @click="selectValidator(entry.validator)"
          >
            <span class="validator-row-main">
              <strong class="mono">{{ entry.validator }}</strong>
              <span class="validator-peer mono">
                {{ entry.peer_id || t("Peer id unavailable") }}
              </span>
            </span>
            <span class="validator-row-data">
              <span class="status-pill" :class="validatorStatusClass(entry)">
                {{ entry.status.type }}
              </span>
              <span>
                <small>{{ t("Total stake") }}</small>
                {{ entry.total_stake }} {{ stakeTokenSymbol }}
              </span>
              <span>
                <small>{{ t("Commission") }}</small>
                {{ formatValidatorCommission(entry) }}
              </span>
            </span>
          </button>
        </div>
        <p v-else class="staking-empty">
          {{ t("No validators found for this lane.") }}
        </p>
      </div>

      <aside
        class="staking-actions-card"
        aria-labelledby="stake-actions-heading"
      >
        <header class="selected-validator-header">
          <div>
            <span class="kv-label">{{ t("Selected validator") }}</span>
            <h2 id="stake-actions-heading" class="mono">
              {{ selectedValidator || t("None") }}
            </h2>
          </div>
          <span
            v-if="selectedValidatorRecord"
            class="status-pill"
            :class="validatorStatusClass(selectedValidatorRecord)"
          >
            {{ selectedValidatorRecord.status.type }}
          </span>
        </header>

        <dl v-if="selectedValidatorRecord" class="validator-inspector-facts">
          <div>
            <dt>{{ t("Lane share") }}</dt>
            <dd>{{ validatorStakeShareLabel(selectedValidatorRecord) }}</dd>
          </div>
          <div>
            <dt>{{ t("Self stake") }}</dt>
            <dd>
              {{ selectedValidatorRecord.self_stake }} {{ stakeTokenSymbol }}
            </dd>
          </div>
          <div>
            <dt>{{ t("Nominators") }}</dt>
            <dd>
              {{ validatorNominatorCount(selectedValidatorRecord.validator) }}
            </dd>
          </div>
          <div>
            <dt>{{ t("Last reward") }}</dt>
            <dd>
              {{ formatRewardEpoch(selectedValidatorRecord.last_reward_epoch) }}
            </dd>
          </div>
        </dl>

        <div
          class="staking-action-tabs"
          role="tablist"
          :aria-label="t('Nominate and manage stake')"
          @keydown="handleStakingTabKeydown"
        >
          <button
            id="staking-tab-bond"
            type="button"
            role="tab"
            :aria-selected="stakingActionMode === 'bond'"
            :tabindex="stakingActionMode === 'bond' ? 0 : -1"
            aria-controls="staking-panel-bond"
            :class="{ active: stakingActionMode === 'bond' }"
            @click="stakingActionMode = 'bond'"
          >
            {{ t("Bond XOR") }}
          </button>
          <button
            id="staking-tab-unbond"
            type="button"
            role="tab"
            :aria-selected="stakingActionMode === 'unbond'"
            :tabindex="stakingActionMode === 'unbond' ? 0 : -1"
            aria-controls="staking-panel-unbond"
            :class="{ active: stakingActionMode === 'unbond' }"
            @click="stakingActionMode = 'unbond'"
          >
            {{ t("Schedule Unbond") }}
          </button>
          <button
            id="staking-tab-rewards"
            type="button"
            role="tab"
            :aria-selected="stakingActionMode === 'rewards'"
            :tabindex="stakingActionMode === 'rewards' ? 0 : -1"
            aria-controls="staking-panel-rewards"
            :class="{ active: stakingActionMode === 'rewards' }"
            @click="stakingActionMode = 'rewards'"
          >
            {{ t("Claim Rewards") }}
          </button>
        </div>

        <section
          v-show="stakingActionMode === 'bond'"
          id="staking-panel-bond"
          class="staking-action-panel"
          role="tabpanel"
          aria-labelledby="staking-tab-bond"
        >
          <div class="amount-field-row">
            <label>
              {{ t("Bond amount (XOR)") }}
              <input
                v-model.trim="bondAmount"
                type="text"
                inputmode="decimal"
              />
            </label>
            <button
              class="ghost amount-max"
              type="button"
              :disabled="!hasBondableBalance"
              @click="bondAmount = stakeTokenBalance"
            >
              {{ t("Max") }}
            </button>
          </div>
          <div class="staking-action-footer">
            <p class="transaction-fee-note">
              <span>{{ t("Fee") }}</span>
              <strong>{{
                formatTransactionFee(
                  transactionFeeHintForEndpoint(session.connection.toriiUrl),
                  t,
                )
              }}</strong>
            </p>
            <button
              data-ui-primary-action
              :disabled="!canSubmit || !hasBondableBalance || isActionBusy"
              @click="handleBond"
            >
              {{ actionBusy === "bond" ? t("Submitting…") : t("Bond XOR") }}
            </button>
          </div>
        </section>

        <section
          v-show="stakingActionMode === 'unbond'"
          id="staking-panel-unbond"
          class="staking-action-panel"
          role="tabpanel"
          aria-labelledby="staking-tab-unbond"
        >
          <div class="amount-field-row">
            <label>
              {{ t("Unbond amount (XOR)") }}
              <input
                v-model.trim="unbondAmount"
                type="text"
                inputmode="decimal"
              />
            </label>
            <button
              class="ghost amount-max"
              type="button"
              :disabled="!hasBondedStake"
              @click="unbondAmount = selectedStakeShare?.bonded || ''"
            >
              {{ t("Max") }}
            </button>
          </div>
          <p v-if="policy" class="helper">
            {{
              t("Release is set from on-chain policy: {datetime}.", {
                datetime: formatDateTime(releasePreviewMs),
              })
            }}
          </p>
          <div class="staking-action-footer">
            <p class="transaction-fee-note">
              <span>{{ t("Fee") }}</span>
              <strong>{{
                formatTransactionFee(
                  transactionFeeHintForEndpoint(session.connection.toriiUrl),
                  t,
                )
              }}</strong>
            </p>
            <button
              data-ui-primary-action
              :disabled="
                !canSubmit || !policy || !hasBondedStake || isActionBusy
              "
              @click="handleScheduleUnbond"
            >
              {{
                actionBusy === "unbond"
                  ? t("Submitting…")
                  : t("Schedule Unbond")
              }}
            </button>
          </div>

          <div class="staking-position-card">
            <div class="staking-position-grid">
              <div class="kv">
                <span class="kv-label">{{
                  t("Bonded with selected validator")
                }}</span>
                <span class="kv-value">
                  {{ selectedStakeShare?.bonded || t("0") }}
                  {{ stakeTokenSymbol }}
                </span>
              </div>
              <div class="kv">
                <span class="kv-label">{{ t("Pending Unbonds") }}</span>
                <span class="kv-value">{{ pendingUnbonds.length }}</span>
              </div>
            </div>
            <label v-if="pendingUnbonds.length" class="finalize-select">
              {{ t("Finalize request") }}
              <select v-model="selectedFinalizeRequestId">
                <option
                  v-for="request in pendingUnbonds"
                  :key="request.request_id"
                  :value="request.request_id"
                >
                  {{ request.request_id }} · {{ request.amount }}
                  {{ stakeTokenSymbol }} ·
                  {{ formatDateTime(request.release_at_ms) }}
                </option>
              </select>
            </label>
            <div class="staking-action-footer finalize-footer">
              <p v-if="!pendingUnbonds.length" class="helper">
                {{
                  t("No pending unbond requests for the selected validator.")
                }}
              </p>
              <button
                :disabled="
                  !canSubmit ||
                  !pendingUnbonds.length ||
                  !selectedFinalizeRequestId ||
                  isActionBusy
                "
                @click="handleFinalizeUnbond"
              >
                {{
                  actionBusy === "finalize"
                    ? t("Submitting…")
                    : t("Finalize Unbond")
                }}
              </button>
            </div>
          </div>
        </section>

        <section
          v-show="stakingActionMode === 'rewards'"
          id="staking-panel-rewards"
          class="staking-action-panel staking-rewards-card"
          role="tabpanel"
          aria-labelledby="staking-tab-rewards"
        >
          <div class="rewards-summary-grid">
            <div class="kv">
              <span class="kv-label">{{ t("Claimable amount") }}</span>
              <span class="kv-value"
                >{{ pendingRewardTotalLabel }} {{ stakeTokenSymbol }}</span
              >
            </div>
            <div class="kv">
              <span class="kv-label">{{ t("APY estimate") }}</span>
              <span class="kv-value">{{ rewardApyLabel }}</span>
            </div>
            <div class="kv">
              <span class="kv-label">{{ t("Observed reward epochs") }}</span>
              <span class="kv-value">{{ rewardEpochSpan || t("—") }}</span>
            </div>
          </div>
          <div
            v-if="rewardsForAccount.length"
            class="table-wrap rewards-table-wrap"
          >
            <table class="table">
              <thead>
                <tr>
                  <th>{{ t("Asset") }}</th>
                  <th>{{ t("Amount") }}</th>
                  <th>{{ t("Last claimed") }}</th>
                  <th>{{ t("Through Epoch") }}</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="reward in rewardsForAccount"
                  :key="`${reward.asset}:${reward.pending_through_epoch}`"
                >
                  <td>{{ reward.asset }}</td>
                  <td>{{ reward.amount }}</td>
                  <td>{{ reward.last_claimed_epoch }}</td>
                  <td>{{ reward.pending_through_epoch }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-else class="helper">
            {{ t("No pending rewards for this lane/account.") }}
          </p>
          <div class="staking-action-footer">
            <p class="transaction-fee-note">
              <span>{{ t("Fee") }}</span>
              <strong>{{
                formatTransactionFee(
                  transactionFeeHintForEndpoint(session.connection.toriiUrl),
                  t,
                )
              }}</strong>
            </p>
            <button
              data-ui-primary-action
              :disabled="!canSubmit || !hasClaimableRewards || isActionBusy"
              @click="handleClaimRewards"
            >
              {{
                actionBusy === "claim" ? t("Submitting…") : t("Claim Rewards")
              }}
            </button>
          </div>
        </section>
      </aside>
    </section>

    <details class="staking-advanced technical-details">
      <summary>
        <span>{{ t("Operate a validator") }}</span>
        <small>{{ t("Staking details") }}</small>
      </summary>
      <section
        class="validator-operator-card"
        aria-labelledby="operator-heading"
      >
        <header class="staking-section-heading">
          <div>
            <h2 id="operator-heading">{{ t("Operate a validator") }}</h2>
            <p class="helper tight">
              {{
                t(
                  "Register this wallet as validator authority and bond self stake before joining consensus.",
                )
              }}
            </p>
          </div>
          <span
            class="status-pill"
            :class="selfValidatorRecord ? 'ok' : undefined"
          >
            {{
              selfValidatorRecord
                ? selfValidatorRecord.status.type
                : t("Not registered")
            }}
          </span>
        </header>

        <div v-if="selfValidatorRecord" class="operator-status-grid">
          <div class="kv">
            <span class="kv-label">{{ t("Validator account") }}</span>
            <span class="kv-value mono">{{
              selfValidatorRecord.validator
            }}</span>
          </div>
          <div class="kv">
            <span class="kv-label">{{ t("Peer ID") }}</span>
            <span class="kv-value mono">{{
              selfValidatorRecord.peer_id || t("—")
            }}</span>
          </div>
          <div class="kv">
            <span class="kv-label">{{ t("Delegated stake") }}</span>
            <span class="kv-value"
              >{{ selfValidatorRecord.total_stake }}
              {{ stakeTokenSymbol }}</span
            >
          </div>
          <div class="kv">
            <span class="kv-label">{{ t("Fees / rewards pending") }}</span>
            <span class="kv-value"
              >{{ pendingRewardTotalLabel }} {{ stakeTokenSymbol }}</span
            >
          </div>
        </div>

        <div class="operator-detail-grid">
          <div class="operator-form-grid">
            <label>
              {{ t("Consensus peer ID") }}
              <input v-model.trim="operatorPeerId" type="text" />
            </label>
            <label>
              {{ t("Validator endpoint") }}
              <input v-model.trim="operatorEndpoint" type="text" />
            </label>
            <label>
              {{ t("Commission (bps)") }}
              <input
                v-model.trim="operatorCommissionBps"
                type="text"
                inputmode="numeric"
              />
            </label>
            <label>
              {{ t("Self stake (XOR)") }}
              <input
                v-model.trim="operatorSelfStake"
                type="text"
                inputmode="decimal"
              />
            </label>
          </div>
          <div class="staking-network-details">
            <label>
              {{ t("Reward epoch duration (hours)") }}
              <input
                v-model.trim="epochDurationHours"
                type="text"
                inputmode="decimal"
              />
            </label>
            <div class="kv">
              <span class="kv-label">{{ t("Alias") }}</span>
              <span class="kv-value">{{ laneContext?.alias || t("—") }}</span>
            </div>
            <div class="kv">
              <span class="kv-label">{{ t("Signer") }}</span>
              <span class="kv-value mono">{{
                stakerAccountId || t("Not configured")
              }}</span>
            </div>
            <div class="kv">
              <span class="kv-label">{{ t("Endpoint") }}</span>
              <span class="kv-value mono">{{
                session.connection.toriiUrl
              }}</span>
            </div>
          </div>
        </div>

        <details class="technical-details compact">
          <summary>{{ t("Validator registration payload") }}</summary>
          <pre class="staking-json-preview">{{ operatorPayloadPreview }}</pre>
        </details>

        <div class="operator-actions">
          <button
            class="secondary"
            type="button"
            :disabled="!selfValidatorRecord"
            @click="selectSelfValidator"
          >
            {{ t("Select my validator") }}
          </button>
          <button
            type="button"
            :disabled="!canRegisterValidator || isActionBusy"
            @click="handleRegisterValidator"
          >
            {{
              actionBusy === "register" ? t("Submitting…") : t("Join consensus")
            }}
          </button>
        </div>
        <p class="transaction-fee-note">
          <span>{{ t("Fee") }}</span>
          <strong>{{
            formatTransactionFee(
              transactionFeeHintForEndpoint(session.connection.toriiUrl),
              t,
            )
          }}</strong>
        </p>
      </section>
    </details>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useAppI18n } from "@/composables/useAppI18n";
import { AppButton, RouteHeaderAction } from "@/components/ui";
import {
  bondPublicLaneStake,
  claimPublicLaneRewards,
  fetchAccountAssets,
  finalizePublicLaneUnbond,
  getNexusPublicLaneRewards,
  getNexusPublicLaneStake,
  getNexusPublicLaneValidators,
  getNexusStakingPolicy,
  registerPublicLaneValidator,
  getSumeragiStatus,
  schedulePublicLaneUnbond,
} from "@/services/iroha";
import { useSessionStore } from "@/stores/session";
import type {
  NexusStakingPolicy,
  PublicLaneRewardsResponseView,
  PublicLaneStakeResponseView,
  PublicLaneValidatorRecordView,
} from "@/types/iroha";
import {
  chooseDefaultDataspaceId,
  compareDecimalStrings,
  collectDataspaceOptions,
  computeUnbondReleaseAtMs,
  createUnbondRequestId,
  calculateRewardApyEstimate,
  extractValidatorCommissionBps,
  hasClaimableRewards as hasClaimableRewardsInList,
  pickDefaultValidator,
  readValidatorEndpoint,
  resolveRewardEpochSpan,
  resolveLaneForDataspace,
  sumDecimalAmounts,
  sumRewardAmounts,
  sumStakeShares,
  type DataspaceOption,
} from "@/utils/staking";
import { deriveAssetSymbol, resolveToriiXorAsset } from "@/utils/assetId";
import { toUserFacingErrorMessage } from "@/utils/errorMessage";
import {
  appendTransactionFee,
  formatTransactionFee,
  transactionFeeHintForEndpoint,
} from "@/utils/transactionFee";

const session = useSessionStore();
const activeAccount = computed(() => session.activeAccount);
const { localeStore, t } = useAppI18n();

const loadingBootstrap = ref(false);
const loadingLaneData = ref(false);
const actionBusy = ref<
  "bond" | "unbond" | "finalize" | "claim" | "register" | null
>(null);
const refreshGeneration = ref(0);
const laneRequestGeneration = ref(0);
const suppressValidatorReload = ref(false);

const statusMessage = ref("");
const actionMessage = ref("");
const errorMessage = ref("");

const dataspaceOptions = ref<DataspaceOption[]>([]);
const selectedDataspaceId = ref<number | null>(null);
const validators = ref<PublicLaneValidatorRecordView[]>([]);
const selectedValidator = ref("");
const stakingActionMode = ref<"bond" | "unbond" | "rewards">("bond");
const bondAmount = ref("");
const unbondAmount = ref("");
const epochDurationHours = ref("24");
const operatorPeerId = ref("");
const operatorEndpoint = ref("");
const operatorCommissionBps = ref("");
const operatorSelfStake = ref("");
const selectedFinalizeRequestId = ref("");
const policy = ref<NexusStakingPolicy | null>(null);
const stakeTokenBalance = ref("0");
const stakeTokenSymbol = ref("XOR");

const stakeResponse = ref<PublicLaneStakeResponseView | null>(null);
const laneStakeResponse = ref<PublicLaneStakeResponseView | null>(null);
const rewardsResponse = ref<PublicLaneRewardsResponseView | null>(null);

const stakerAccountId = computed(() => activeAccount.value?.accountId ?? "");
const laneContext = computed(() =>
  resolveLaneForDataspace(dataspaceOptions.value, selectedDataspaceId.value),
);
const laneId = computed(() => laneContext.value?.laneId ?? null);

const selfValidatorRecord = computed(() =>
  validators.value.find((entry) => entry.validator === stakerAccountId.value),
);
const selectedValidatorRecord = computed(() =>
  validators.value.find((entry) => entry.validator === selectedValidator.value),
);

const stakingActionModes = ["bond", "unbond", "rewards"] as const;
const handleStakingTabKeydown = (event: KeyboardEvent) => {
  const currentIndex = stakingActionModes.indexOf(stakingActionMode.value);
  let nextIndex: number | null = null;
  if (event.key === "ArrowRight" || event.key === "ArrowDown") {
    nextIndex = (currentIndex + 1) % stakingActionModes.length;
  } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
    nextIndex =
      (currentIndex - 1 + stakingActionModes.length) %
      stakingActionModes.length;
  } else if (event.key === "Home") {
    nextIndex = 0;
  } else if (event.key === "End") {
    nextIndex = stakingActionModes.length - 1;
  }
  if (nextIndex === null) return;
  event.preventDefault();
  const nextMode = stakingActionModes[nextIndex];
  stakingActionMode.value = nextMode;
  document.getElementById(`staking-tab-${nextMode}`)?.focus();
};

const selectedStakeShare = computed(() => {
  if (
    !stakeResponse.value ||
    !stakerAccountId.value ||
    !selectedValidator.value
  ) {
    return null;
  }
  return (
    stakeResponse.value.items.find(
      (entry) =>
        entry.staker === stakerAccountId.value &&
        entry.validator === selectedValidator.value,
    ) ?? null
  );
});

const accountStakeShares = computed(() => {
  if (!laneStakeResponse.value || !stakerAccountId.value) {
    return [];
  }
  return laneStakeResponse.value.items.filter(
    (entry) => entry.staker === stakerAccountId.value,
  );
});

const bondedStakeForAccount = computed(() =>
  sumStakeShares(accountStakeShares.value),
);

const pendingUnbonds = computed(
  () => selectedStakeShare.value?.pending_unbonds ?? [],
);

const rewardsForAccount = computed(() => rewardsResponse.value?.items ?? []);
const pendingRewardTotal = computed(() =>
  sumRewardAmounts(rewardsForAccount.value),
);
const rewardEpochSpan = computed(() =>
  resolveRewardEpochSpan(rewardsForAccount.value),
);
const hasClaimableRewards = computed(() =>
  hasClaimableRewardsInList(rewardsForAccount.value),
);

const parsedEpochDurationHours = computed(() => {
  const parsed = Number(epochDurationHours.value.trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 24;
});

const rewardApyEstimate = computed(() =>
  calculateRewardApyEstimate({
    rewards: rewardsForAccount.value,
    bondedAmount:
      bondedStakeForAccount.value > 0
        ? bondedStakeForAccount.value
        : (selectedStakeShare.value?.bonded ?? "0"),
    epochDurationHours: parsedEpochDurationHours.value,
  }),
);

const activeValidatorCount = computed(
  () =>
    validators.value.filter((entry) => entry.status.type === "Active").length,
);

const totalLaneStake = computed(() =>
  sumDecimalAmounts(validators.value.map((entry) => entry.total_stake)),
);

const hasActiveLaneContext = computed(() =>
  Boolean(
    session.connection.toriiUrl &&
      session.connection.chainId &&
      activeAccount.value?.accountId &&
      laneId.value !== null &&
      !loadingBootstrap.value &&
      !loadingLaneData.value,
  ),
);

const canSubmit = computed(() =>
  Boolean(hasActiveLaneContext.value && selectedValidator.value),
);

const isActionBusy = computed(() => actionBusy.value !== null);

const hasBondableBalance = computed(() => {
  try {
    return compareDecimalStrings(stakeTokenBalance.value, "0") > 0;
  } catch (_error) {
    return false;
  }
});

const hasBondedStake = computed(() => {
  try {
    return (
      compareDecimalStrings(selectedStakeShare.value?.bonded ?? "0", "0") > 0
    );
  } catch (_error) {
    return false;
  }
});

const canRegisterValidator = computed(() =>
  Boolean(
    hasActiveLaneContext.value &&
      activeAccount.value?.accountId &&
      operatorPeerId.value.trim() &&
      operatorSelfStake.value.trim() &&
      hasBondableBalance.value,
  ),
);

const releasePreviewMs = computed(() => {
  if (!policy.value) return Date.now();
  return computeUnbondReleaseAtMs(policy.value.unbondingDelayMs);
});

const formatDateTime = (value: number) =>
  new Intl.DateTimeFormat(localeStore.current, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

const formatNumber = (value: number, maximumFractionDigits = 4) =>
  new Intl.NumberFormat(localeStore.current, {
    maximumFractionDigits,
  }).format(value);

const formatPercent = (value: number) =>
  new Intl.NumberFormat(localeStore.current, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(value);

const bondedStakeForAccountLabel = computed(() =>
  formatNumber(bondedStakeForAccount.value),
);

const pendingRewardTotalLabel = computed(() =>
  formatNumber(pendingRewardTotal.value),
);

const rewardApyLabel = computed(() =>
  rewardApyEstimate.value
    ? t("{value}%", {
        value: formatPercent(rewardApyEstimate.value.apyPercent),
      })
    : t("—"),
);

const formatDuration = (milliseconds: number) => {
  if (milliseconds < 1000) return t("{value} ms", { value: milliseconds });
  const seconds = Math.floor(milliseconds / 1000);
  if (seconds < 60) return t("{value} sec", { value: seconds });
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    return remainingSeconds
      ? t("{min} min {sec} sec", { min: minutes, sec: remainingSeconds })
      : t("{value} min", { value: minutes });
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes
    ? t("{hr} hr {min} min", { hr: hours, min: remainingMinutes })
    : t("{value} hr", { value: hours });
};

const formatRewardEpoch = (epoch: number | null) =>
  epoch === null ? t("—") : String(epoch);

const formatValidatorCommission = (
  validator: PublicLaneValidatorRecordView,
) => {
  const commissionBps = extractValidatorCommissionBps(validator.metadata);
  if (commissionBps === null) {
    return t("—");
  }
  return t("{value}%", { value: formatPercent(commissionBps / 100) });
};

const validatorStatusClass = (validator: PublicLaneValidatorRecordView) => {
  if (validator.status.type === "Active") return "ok";
  if (["Slashed", "Jailed"].includes(validator.status.type)) return "error";
  return "";
};

const validatorNominatorCount = (validator: string) => {
  if (!laneStakeResponse.value) {
    return 0;
  }
  return laneStakeResponse.value.items.filter((entry) => {
    if (entry.validator !== validator) {
      return false;
    }
    try {
      return compareDecimalStrings(entry.bonded, "0") > 0;
    } catch (_error) {
      return false;
    }
  }).length;
};

const validatorStakeShareLabel = (validator: PublicLaneValidatorRecordView) => {
  if (totalLaneStake.value <= 0) {
    return t("—");
  }
  const stake = Number(validator.total_stake);
  if (!Number.isFinite(stake) || stake < 0) {
    return t("—");
  }
  return t("{value}%", {
    value: formatPercent((stake / totalLaneStake.value) * 100),
  });
};

const selectValidator = (validator: string) => {
  selectedValidator.value = validator;
};

const selectSelfValidator = () => {
  if (selfValidatorRecord.value) {
    selectedValidator.value = selfValidatorRecord.value.validator;
  }
};

const operatorCommissionValue = () => {
  const raw = operatorCommissionBps.value.trim();
  if (!raw) {
    return null;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 10_000) {
    throw new Error(t("Commission must be a whole number from 0 to 10000."));
  }
  return parsed;
};

const operatorMetadata = computed(() => {
  const metadata: Record<string, unknown> = {};
  if (operatorEndpoint.value.trim()) {
    metadata.endpoint = operatorEndpoint.value.trim();
  }
  const commissionBps =
    operatorCommissionBps.value.trim() === ""
      ? null
      : Number(operatorCommissionBps.value.trim());
  if (
    commissionBps !== null &&
    Number.isInteger(commissionBps) &&
    commissionBps >= 0 &&
    commissionBps <= 10_000
  ) {
    metadata.commission_bps = commissionBps;
  }
  return metadata;
});

const operatorPayloadPreview = computed(() =>
  JSON.stringify(
    {
      lane_id: laneId.value,
      validator: stakerAccountId.value || null,
      stake_account: stakerAccountId.value || null,
      peer_id: operatorPeerId.value.trim() || null,
      initial_stake: operatorSelfStake.value.trim() || null,
      metadata: operatorMetadata.value,
    },
    null,
    2,
  ),
);

const toPositiveAmount = (value: string, label: string) => {
  const normalized = value.trim();
  if (!/^\d+(\.\d+)?$/.test(normalized) || /^0+(\.0+)?$/.test(normalized)) {
    throw new Error(t("{label} must be greater than zero.", { label }));
  }
  return normalized;
};

const enforceAmountWithinLimit = (
  amount: string,
  maxAmount: string,
  maxAmountLabel: string,
) => {
  if (compareDecimalStrings(amount, maxAmount) > 0) {
    throw new Error(
      t("Amount exceeds available {label} ({amount} {symbol}).", {
        label: maxAmountLabel,
        amount: maxAmount,
        symbol: stakeTokenSymbol.value,
      }),
    );
  }
};

const resetLaneState = () => {
  validators.value = [];
  selectedValidator.value = "";
  stakeResponse.value = null;
  laneStakeResponse.value = null;
  rewardsResponse.value = null;
  selectedFinalizeRequestId.value = "";
};

const resetBootstrapState = () => {
  dataspaceOptions.value = [];
  selectedDataspaceId.value = null;
  policy.value = null;
  stakeTokenBalance.value = "0";
  stakeTokenSymbol.value = "XOR";
  suppressValidatorReload.value = false;
  loadingLaneData.value = false;
  resetLaneState();
};

const loadLaneData = async () => {
  const toriiUrl = session.connection.toriiUrl;
  const accountId = stakerAccountId.value;
  const currentLaneId = laneId.value;
  if (!toriiUrl || !accountId || currentLaneId === null) {
    laneRequestGeneration.value += 1;
    resetLaneState();
    return;
  }

  const requestGeneration = laneRequestGeneration.value + 1;
  laneRequestGeneration.value = requestGeneration;
  loadingLaneData.value = true;
  errorMessage.value = "";

  try {
    const [validatorsPayload, rewardsPayload] = await Promise.all([
      getNexusPublicLaneValidators({
        toriiUrl,
        laneId: currentLaneId,
      }),
      getNexusPublicLaneRewards({
        toriiUrl,
        laneId: currentLaneId,
        account: accountId,
      }),
    ]);
    if (
      requestGeneration !== laneRequestGeneration.value ||
      session.connection.toriiUrl !== toriiUrl ||
      stakerAccountId.value !== accountId ||
      laneId.value !== currentLaneId
    ) {
      return;
    }

    const nextValidator = pickDefaultValidator(
      validatorsPayload.items,
      selectedValidator.value,
    );
    const [stakePayload, laneStakePayload] = await Promise.all([
      getNexusPublicLaneStake({
        toriiUrl,
        laneId: currentLaneId,
        validator: nextValidator || undefined,
      }),
      getNexusPublicLaneStake({
        toriiUrl,
        laneId: currentLaneId,
      }),
    ]);
    if (
      requestGeneration !== laneRequestGeneration.value ||
      session.connection.toriiUrl !== toriiUrl ||
      stakerAccountId.value !== accountId ||
      laneId.value !== currentLaneId
    ) {
      return;
    }

    validators.value = validatorsPayload.items;
    suppressValidatorReload.value = nextValidator !== selectedValidator.value;
    selectedValidator.value = nextValidator;
    stakeResponse.value = stakePayload;
    laneStakeResponse.value = laneStakePayload;
    rewardsResponse.value = rewardsPayload;
  } catch (error) {
    if (
      requestGeneration !== laneRequestGeneration.value ||
      session.connection.toriiUrl !== toriiUrl ||
      stakerAccountId.value !== accountId ||
      laneId.value !== currentLaneId
    ) {
      return;
    }
    resetLaneState();
    errorMessage.value = toUserFacingErrorMessage(
      error,
      t("Failed to load lane validators."),
    );
  } finally {
    if (requestGeneration === laneRequestGeneration.value) {
      loadingLaneData.value = false;
    }
  }
};

const refresh = async () => {
  const toriiUrl = session.connection.toriiUrl;
  const accountId = activeAccount.value?.accountId;
  if (!toriiUrl || !accountId) {
    refreshGeneration.value += 1;
    laneRequestGeneration.value += 1;
    errorMessage.value = "";
    actionMessage.value = "";
    statusMessage.value = t("Set up network and wallet first.");
    resetBootstrapState();
    return;
  }

  const requestGeneration = refreshGeneration.value + 1;
  refreshGeneration.value = requestGeneration;
  laneRequestGeneration.value += 1;
  loadingBootstrap.value = true;
  errorMessage.value = "";
  actionMessage.value = "";

  try {
    const [status, stakingPolicy, accountAssets] = await Promise.all([
      getSumeragiStatus(toriiUrl),
      getNexusStakingPolicy(toriiUrl),
      fetchAccountAssets({
        toriiUrl,
        accountId,
        limit: 200,
      }),
    ]);
    if (
      requestGeneration !== refreshGeneration.value ||
      session.connection.toriiUrl !== toriiUrl ||
      activeAccount.value?.accountId !== accountId
    ) {
      return;
    }
    const detectedStakeAsset = resolveToriiXorAsset(accountAssets.items);
    stakeTokenBalance.value = detectedStakeAsset?.quantity ?? "0";
    stakeTokenSymbol.value = detectedStakeAsset
      ? deriveAssetSymbol(detectedStakeAsset.asset_id, "ASSET")
      : "XOR";

    const options = collectDataspaceOptions(status);
    dataspaceOptions.value = options;
    selectedDataspaceId.value = chooseDefaultDataspaceId(
      options,
      selectedDataspaceId.value,
    );
    policy.value = stakingPolicy;

    if (!options.length) {
      statusMessage.value = t(
        "No dataspace governance found on this Torii endpoint.",
      );
      resetLaneState();
      return;
    }

    statusMessage.value = t("Loaded {count} dataspace option(s).", {
      count: options.length,
    });
    await loadLaneData();
  } catch (error) {
    if (
      requestGeneration !== refreshGeneration.value ||
      session.connection.toriiUrl !== toriiUrl ||
      activeAccount.value?.accountId !== accountId
    ) {
      return;
    }
    statusMessage.value = "";
    resetBootstrapState();
    errorMessage.value = toUserFacingErrorMessage(
      error,
      t("Failed to load staking state."),
    );
  } finally {
    if (requestGeneration === refreshGeneration.value) {
      loadingBootstrap.value = false;
    }
  }
};

const handleDataspaceChange = () => {
  selectedValidator.value = "";
  selectedFinalizeRequestId.value = "";
  loadLaneData();
};

const runAction = async (
  mode: "bond" | "unbond" | "finalize" | "claim" | "register",
  run: () => Promise<string>,
) => {
  actionBusy.value = mode;
  errorMessage.value = "";
  actionMessage.value = "";
  try {
    const message = await run();
    actionMessage.value = message;
    await loadLaneData();
  } catch (error) {
    errorMessage.value = toUserFacingErrorMessage(error, t("Action failed."));
  } finally {
    actionBusy.value = null;
  }
};

const handleBond = () =>
  runAction("bond", async () => {
    if (!canSubmit.value || !activeAccount.value) {
      throw new Error(
        t("Connection, account, dataspace, and validator are required."),
      );
    }
    if (!hasBondableBalance.value) {
      throw new Error(
        t("No {symbol} balance available to bond.", {
          symbol: stakeTokenSymbol.value,
        }),
      );
    }
    const amount = toPositiveAmount(bondAmount.value, t("Bond amount"));
    enforceAmountWithinLimit(
      amount,
      stakeTokenBalance.value,
      t("stake balance"),
    );
    const result = await bondPublicLaneStake({
      toriiUrl: session.connection.toriiUrl,
      chainId: session.connection.chainId,
      stakeAccountId: activeAccount.value.accountId,
      validator: selectedValidator.value,
      amount,
      privateKeyHex: activeAccount.value.privateKeyHex,
    });
    bondAmount.value = "";
    return appendTransactionFee(
      t("Bond submitted: {hash}", { hash: result.hash }),
      result,
      t,
      transactionFeeHintForEndpoint(session.connection.toriiUrl),
    );
  });

const handleRegisterValidator = () =>
  runAction("register", async () => {
    if (
      !hasActiveLaneContext.value ||
      !activeAccount.value ||
      laneId.value === null
    ) {
      throw new Error(
        t("Connection, account, dataspace, and validator are required."),
      );
    }
    const amount = toPositiveAmount(operatorSelfStake.value, t("Self stake"));
    enforceAmountWithinLimit(
      amount,
      stakeTokenBalance.value,
      t("stake balance"),
    );
    const commissionBps = operatorCommissionValue();
    const metadata: Record<string, unknown> = { ...operatorMetadata.value };
    if (commissionBps !== null) {
      metadata.commission_bps = commissionBps;
    }
    const result = await registerPublicLaneValidator({
      toriiUrl: session.connection.toriiUrl,
      chainId: session.connection.chainId,
      laneId: laneId.value,
      validatorAccountId: activeAccount.value.accountId,
      stakeAccountId: activeAccount.value.accountId,
      peerId: operatorPeerId.value,
      selfStake: amount,
      metadata,
      privateKeyHex: activeAccount.value.privateKeyHex,
    });
    operatorSelfStake.value = "";
    selectedValidator.value = activeAccount.value.accountId;
    return appendTransactionFee(
      t("Validator registration submitted: {hash}", { hash: result.hash }),
      result,
      t,
      transactionFeeHintForEndpoint(session.connection.toriiUrl),
    );
  });

const handleScheduleUnbond = () =>
  runAction("unbond", async () => {
    if (!canSubmit.value || !activeAccount.value || !policy.value) {
      throw new Error(
        t("Connection, account, validator, and staking policy are required."),
      );
    }
    if (!selectedStakeShare.value || !hasBondedStake.value) {
      throw new Error(t("No bonded stake available to unbond."));
    }
    const amount = toPositiveAmount(unbondAmount.value, t("Unbond amount"));
    enforceAmountWithinLimit(
      amount,
      selectedStakeShare.value.bonded,
      t("bonded stake"),
    );
    const requestId = createUnbondRequestId();
    const releaseAtMs = computeUnbondReleaseAtMs(policy.value.unbondingDelayMs);
    const result = await schedulePublicLaneUnbond({
      toriiUrl: session.connection.toriiUrl,
      chainId: session.connection.chainId,
      stakeAccountId: activeAccount.value.accountId,
      validator: selectedValidator.value,
      amount,
      requestId,
      releaseAtMs,
      privateKeyHex: activeAccount.value.privateKeyHex,
    });
    unbondAmount.value = "";
    return appendTransactionFee(
      t("Unbond scheduled ({requestId}) for {datetime}. Tx: {hash}", {
        requestId,
        datetime: formatDateTime(releaseAtMs),
        hash: result.hash,
      }),
      result,
      t,
      transactionFeeHintForEndpoint(session.connection.toriiUrl),
    );
  });

const handleFinalizeUnbond = () =>
  runAction("finalize", async () => {
    if (
      !canSubmit.value ||
      !activeAccount.value ||
      !selectedFinalizeRequestId.value
    ) {
      throw new Error(t("Select a pending unbond request first."));
    }
    const result = await finalizePublicLaneUnbond({
      toriiUrl: session.connection.toriiUrl,
      chainId: session.connection.chainId,
      stakeAccountId: activeAccount.value.accountId,
      validator: selectedValidator.value,
      requestId: selectedFinalizeRequestId.value,
      privateKeyHex: activeAccount.value.privateKeyHex,
    });
    return appendTransactionFee(
      t("Finalize submitted: {hash}", { hash: result.hash }),
      result,
      t,
      transactionFeeHintForEndpoint(session.connection.toriiUrl),
    );
  });

const handleClaimRewards = () =>
  runAction("claim", async () => {
    if (!canSubmit.value || !activeAccount.value) {
      throw new Error(t("Connection, account, and validator are required."));
    }
    if (!hasClaimableRewards.value) {
      throw new Error(t("No pending rewards available to claim."));
    }
    const result = await claimPublicLaneRewards({
      toriiUrl: session.connection.toriiUrl,
      chainId: session.connection.chainId,
      stakeAccountId: activeAccount.value.accountId,
      validator: selectedValidator.value,
      privateKeyHex: activeAccount.value.privateKeyHex,
    });
    return appendTransactionFee(
      t("Reward claim submitted: {hash}", { hash: result.hash }),
      result,
      t,
      transactionFeeHintForEndpoint(session.connection.toriiUrl),
    );
  });

watch(
  selfValidatorRecord,
  (record) => {
    if (!record) {
      return;
    }
    if (!operatorPeerId.value.trim() && record.peer_id) {
      operatorPeerId.value = record.peer_id;
    }
    if (!operatorEndpoint.value.trim()) {
      operatorEndpoint.value = readValidatorEndpoint(record.metadata);
    }
    if (!operatorCommissionBps.value.trim()) {
      const commissionBps = extractValidatorCommissionBps(record.metadata);
      if (commissionBps !== null) {
        operatorCommissionBps.value = String(commissionBps);
      }
    }
  },
  { immediate: true },
);

watch(
  selectedValidator,
  async (next, previous) => {
    if (suppressValidatorReload.value) {
      suppressValidatorReload.value = false;
      return;
    }
    const toriiUrl = session.connection.toriiUrl;
    const accountId = stakerAccountId.value;
    const currentLaneId = laneId.value;
    if (
      !next ||
      next === previous ||
      !toriiUrl ||
      !accountId ||
      currentLaneId === null
    ) {
      return;
    }
    const requestGeneration = laneRequestGeneration.value + 1;
    laneRequestGeneration.value = requestGeneration;
    loadingLaneData.value = true;
    errorMessage.value = "";
    try {
      const nextStakeResponse = await getNexusPublicLaneStake({
        toriiUrl,
        laneId: currentLaneId,
        validator: next,
      });
      if (
        requestGeneration !== laneRequestGeneration.value ||
        session.connection.toriiUrl !== toriiUrl ||
        stakerAccountId.value !== accountId ||
        laneId.value !== currentLaneId ||
        selectedValidator.value !== next
      ) {
        return;
      }
      stakeResponse.value = nextStakeResponse;
    } catch (error) {
      if (
        requestGeneration !== laneRequestGeneration.value ||
        session.connection.toriiUrl !== toriiUrl ||
        stakerAccountId.value !== accountId ||
        laneId.value !== currentLaneId ||
        selectedValidator.value !== next
      ) {
        return;
      }
      stakeResponse.value = null;
      errorMessage.value = toUserFacingErrorMessage(
        error,
        t("Failed to load lane validators."),
      );
    } finally {
      if (requestGeneration === laneRequestGeneration.value) {
        loadingLaneData.value = false;
      }
    }
  },
  { flush: "post" },
);

watch(
  pendingUnbonds,
  (items) => {
    if (!items.length) {
      selectedFinalizeRequestId.value = "";
      return;
    }
    const stillExists = items.some(
      (item) => item.request_id === selectedFinalizeRequestId.value,
    );
    if (!stillExists) {
      selectedFinalizeRequestId.value = items[0].request_id;
    }
  },
  { immediate: true },
);

watch(
  () => [
    session.connection.toriiUrl,
    session.connection.chainId,
    activeAccount.value?.accountId,
  ],
  () => {
    refresh();
  },
  { immediate: true },
);
</script>

<style scoped>
.npos-workspace {
  display: grid;
  position: relative;
  z-index: 1;
  grid-template-columns: minmax(0, 1fr);
  gap: 24px;
}

.staking-command-card,
.staking-context-card,
.validator-market-card,
.staking-actions-card,
.validator-operator-card {
  min-width: 0;
}

.staking-command-card {
  padding: clamp(18px, 2.4vw, 28px);
  border: 1px solid var(--frost-border);
  border-radius: 22px;
  background: var(--frost-panel);
  box-shadow: var(--shadow-raised);
  -webkit-backdrop-filter: var(--frost-filter-panel);
  backdrop-filter: var(--frost-filter-panel);
}

.staking-command-header,
.staking-section-heading,
.selected-validator-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
}

.staking-command-header h2,
.staking-section-heading h2,
.selected-validator-header h2 {
  margin: 0;
}

.staking-command-header .helper {
  max-width: 68ch;
}

.staking-kicker {
  margin: 0 0 6px;
  color: var(--iroha-accent);
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.staking-refresh {
  min-height: 40px;
  padding-inline: 10px;
  background: transparent;
  box-shadow: none;
}

.staking-stat-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin-top: 22px;
  border-block: 1px solid var(--panel-border);
}

.staking-stat {
  min-width: 0;
  padding: 18px 20px;
}

.staking-stat + .staking-stat {
  border-inline-start: 1px solid var(--panel-border);
}

.staking-stat span {
  display: block;
  color: var(--iroha-muted);
  font-size: 0.76rem;
  font-weight: 700;
}

.staking-stat strong {
  display: block;
  margin-top: 6px;
  overflow-wrap: anywhere;
  font-size: clamp(1.05rem, 1.8vw, 1.4rem);
  font-variant-numeric: tabular-nums;
}

.staking-messages:empty {
  display: none;
}

.staking-context-card {
  display: grid;
  grid-template-columns: minmax(240px, 0.9fr) minmax(0, 2fr);
  gap: 24px;
  align-items: center;
  padding: 18px 20px;
  border: 1px solid var(--frost-border);
  border-radius: 18px;
  background: var(--frost-panel-raised);
  box-shadow: var(--shadow-control);
  -webkit-backdrop-filter: var(--frost-filter-soft);
  backdrop-filter: var(--frost-filter-soft);
}

.staking-context-control {
  min-width: 0;
  display: grid;
  gap: 7px;
}

.staking-context-control select {
  width: 100%;
  min-width: 0;
}

.staking-context-control label {
  color: var(--iroha-muted);
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.staking-context-facts {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  border-radius: 14px;
  background: var(--color-surface-inset);
  box-shadow: var(--shadow-inset);
  overflow: hidden;
}

.staking-context-facts .kv {
  min-width: 0;
  padding: 4px 16px;
}

.staking-context-facts .kv + .kv {
  border-inline-start: 1px solid var(--panel-border);
}

.staking-workspace {
  display: grid;
  grid-template-columns: minmax(340px, 0.82fr) minmax(440px, 1.18fr);
  min-height: 560px;
  overflow: hidden;
  border: 1px solid var(--frost-border);
  border-radius: 22px;
  background: var(--frost-panel-raised);
  box-shadow: var(--shadow-raised);
  -webkit-backdrop-filter: var(--frost-filter-panel);
  backdrop-filter: var(--frost-filter-panel);
}

.validator-market-card,
.staking-actions-card {
  display: grid;
  align-content: start;
  gap: 18px;
  padding: clamp(18px, 2.4vw, 28px);
}

.staking-actions-card {
  background: var(--frost-panel-soft);
  -webkit-backdrop-filter: var(--frost-filter-soft);
  backdrop-filter: var(--frost-filter-soft);
}

.validator-market-card {
  border-inline-end: 1px solid var(--panel-border);
}

.staking-count {
  min-width: 32px;
  padding: 5px 8px;
  border: 1px solid var(--panel-border);
  border-radius: 999px;
  color: var(--iroha-muted);
  font-size: 0.76rem;
  text-align: center;
}

.validator-list {
  display: grid;
  max-height: 600px;
  overflow: auto;
  margin-inline: calc(clamp(18px, 2.4vw, 28px) * -1);
  border-top: 1px solid var(--panel-border);
  background: var(--color-surface-inset);
  box-shadow: var(--shadow-inset);
}

.validator-row {
  display: grid;
  gap: 12px;
  width: 100%;
  min-height: 92px;
  padding: 16px clamp(18px, 2.4vw, 28px);
  border: 0;
  border-bottom: 1px solid var(--panel-border);
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  color: inherit;
  text-align: start;
  transition: background 160ms ease;
}

.validator-row:hover:not(:disabled),
.validator-row:focus-visible {
  background: var(--surface-soft);
  transform: none;
}

.validator-row.selected {
  background: color-mix(in srgb, var(--iroha-accent) 9%, transparent);
  box-shadow: inset 3px 0 0 var(--iroha-accent);
}

.validator-row-main {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.validator-row-main strong,
.validator-peer {
  overflow-wrap: anywhere;
}

.validator-peer {
  color: var(--iroha-muted);
  font-size: 0.72rem;
}

.validator-row-data {
  display: flex;
  align-items: center;
  gap: 10px 16px;
  flex-wrap: wrap;
  color: inherit;
  font-size: 0.78rem;
}

.validator-row-data > span:not(.status-pill) {
  display: grid;
  gap: 2px;
}

.validator-row-data small {
  color: var(--iroha-muted);
  font-size: 0.66rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.staking-empty {
  margin: 24px 0;
  color: var(--iroha-muted);
  text-align: center;
}

.selected-validator-header h2 {
  max-width: 42ch;
  margin-top: 6px;
  overflow-wrap: anywhere;
  font-size: 1rem;
}

.validator-inspector-facts {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin: 0;
  border-block: 1px solid var(--panel-border);
  background: var(--color-surface-inset);
  box-shadow: var(--shadow-inset);
}

.validator-inspector-facts > div {
  min-width: 0;
  padding: 14px 10px;
}

.validator-inspector-facts > div + div {
  border-inline-start: 1px solid var(--panel-border);
}

.validator-inspector-facts dt {
  color: var(--iroha-muted);
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
}

.validator-inspector-facts dd {
  margin: 5px 0 0;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.staking-action-tabs {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  border-bottom: 1px solid var(--panel-border);
}

.staking-action-tabs button {
  position: relative;
  min-height: 44px;
  padding: 8px 10px;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  color: var(--iroha-muted);
  white-space: nowrap;
}

.staking-action-tabs button::after {
  content: "";
  position: absolute;
  inset: auto 10px -1px;
  height: 2px;
  border-radius: 2px;
  background: transparent;
}

.staking-action-tabs button.active {
  color: inherit;
}

.staking-action-tabs button.active::after {
  background: var(--iroha-accent);
}

.staking-action-panel {
  display: grid;
  gap: 16px;
  min-width: 0;
}

.amount-field-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: end;
}

.amount-max {
  min-width: 64px;
  min-height: 44px;
  background: transparent;
  box-shadow: none;
}

.staking-action-footer,
.operator-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.staking-action-footer .transaction-fee-note,
.validator-operator-card > .transaction-fee-note {
  margin: 0;
}

.staking-position-card {
  display: grid;
  gap: 14px;
  padding: 16px;
  border: 1px solid var(--panel-border);
  border-radius: 14px;
  background: var(--color-surface-inset);
  box-shadow: var(--shadow-inset);
}

.staking-position-grid,
.rewards-summary-grid,
.operator-status-grid,
.operator-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.finalize-select {
  margin-top: 0;
}

.finalize-footer .helper {
  max-width: 34ch;
}

.rewards-table-wrap {
  max-height: 220px;
  border: 1px solid var(--panel-border);
  border-radius: 12px;
}

.staking-advanced {
  margin-top: 0;
  border-color: var(--frost-border);
  border-radius: 18px;
  background: var(--frost-panel-raised);
  box-shadow: var(--shadow-control);
  -webkit-backdrop-filter: var(--frost-filter-panel);
  backdrop-filter: var(--frost-filter-panel);
}

.staking-advanced > summary small {
  color: var(--iroha-muted);
  font-size: 0.72rem;
  font-weight: 500;
  letter-spacing: 0;
  text-transform: none;
}

.validator-operator-card {
  display: grid;
  gap: 20px;
  padding-top: 8px;
}

.operator-detail-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(280px, 0.75fr);
  gap: 24px;
  align-items: start;
}

.staking-network-details {
  display: grid;
  gap: 12px;
  padding-inline-start: 24px;
  border-inline-start: 1px solid var(--panel-border);
}

.staking-json-preview {
  max-height: 220px;
  overflow: auto;
  margin: 12px 0 0;
  padding: 12px;
  border: 1px solid var(--panel-border);
  border-radius: 12px;
  background: var(--surface-soft);
  color: inherit;
  font-size: 0.78rem;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.helper {
  margin-top: 10px;
  color: var(--iroha-muted);
  font-size: 0.85rem;
}

.helper.tight {
  margin-top: 4px;
}

.message {
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: 12px;
  font-size: 0.85rem;
}

.message.success {
  border: 1px solid color-mix(in srgb, var(--qs-success) 40%, transparent);
  background: var(--qs-success-soft);
  color: var(--qs-success);
}

.message.error {
  border: 1px solid color-mix(in srgb, var(--qs-danger) 42%, transparent);
  background: var(--qs-danger-soft);
  color: var(--qs-danger);
}

.mono {
  font-family:
    ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono",
    "Courier New", monospace;
  font-size: 0.8rem;
  unicode-bidi: plaintext;
}

@media (max-width: 1120px) {
  .staking-context-card,
  .operator-detail-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .staking-context-facts {
    border-top: 1px solid var(--panel-border);
    padding-top: 14px;
  }

  .staking-network-details {
    padding: 20px 0 0;
    border-inline-start: 0;
    border-top: 1px solid var(--panel-border);
  }
}

@media (max-width: 900px) {
  .staking-workspace {
    grid-template-columns: minmax(0, 1fr);
  }

  .validator-market-card {
    border-inline-end: 0;
    border-bottom: 1px solid var(--panel-border);
  }

  .validator-list {
    max-height: 360px;
  }
}

@media (min-width: 901px) and (max-height: 760px) {
  .npos-workspace {
    gap: 10px;
  }

  .staking-command-card {
    padding: 0 16px;
  }

  .staking-command-header {
    display: none;
  }

  .staking-stat-grid {
    margin-top: 0;
  }

  .staking-stat {
    padding-block: 10px;
  }

  .staking-status-message {
    display: none;
  }

  .staking-context-card {
    grid-template-columns: minmax(220px, 0.8fr) minmax(0, 2fr);
    gap: 14px;
    padding-block: 10px;
  }

  .staking-context-facts .kv {
    padding-block: 0;
  }

  .staking-workspace {
    min-height: 0;
  }

  .validator-market-card,
  .staking-actions-card {
    gap: 12px;
    padding-block: 16px;
  }

  .validator-list {
    max-height: 330px;
  }

  .validator-row {
    min-height: 76px;
    padding-block: 11px;
  }

  .validator-inspector-facts > div {
    padding-block: 9px;
  }

  .staking-action-panel {
    gap: 10px;
  }
}

@media (max-width: 760px) {
  .staking-command-header,
  .staking-action-footer,
  .operator-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .staking-refresh {
    align-self: flex-start;
  }

  .staking-stat-grid,
  .staking-context-facts,
  .validator-inspector-facts {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .staking-stat:nth-child(3),
  .staking-context-facts .kv:nth-child(3),
  .validator-inspector-facts > div:nth-child(3) {
    border-inline-start: 0;
  }

  .staking-stat:nth-child(n + 3),
  .staking-context-facts .kv:nth-child(n + 3),
  .validator-inspector-facts > div:nth-child(n + 3) {
    border-top: 1px solid var(--panel-border);
  }

  .staking-context-card,
  .validator-market-card,
  .staking-actions-card {
    padding-inline: 18px;
  }

  .operator-actions button,
  .staking-action-footer button {
    width: 100%;
  }
}

@media (max-width: 520px) {
  .staking-stat {
    padding-inline: 10px;
  }

  .validator-row-data {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .amount-field-row,
  .staking-position-grid,
  .rewards-summary-grid,
  .operator-status-grid,
  .operator-form-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .amount-max {
    width: 100%;
  }
}
</style>

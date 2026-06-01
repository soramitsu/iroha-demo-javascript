<template>
  <div class="staking-shell npos-workspace">
    <section class="card staking-command-card">
      <header class="card-header staking-command-header">
        <div>
          <p class="staking-kicker">{{ t("Nominated proof of stake") }}</p>
          <h2>{{ t("Stake XOR") }}</h2>
        </div>
        <button class="secondary" :disabled="loadingBootstrap" @click="refresh">
          {{ loadingBootstrap ? t("Refreshing…") : t("Refresh") }}
        </button>
      </header>
      <p class="helper">
        {{
          t(
            "Nominate validators, manage unbonding, claim rewards, or register this wallet as a public-lane validator.",
          )
        }}
      </p>
      <div class="staking-stat-grid">
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
      <p v-if="statusMessage" class="helper">{{ statusMessage }}</p>
      <p v-if="errorMessage" class="message error">{{ errorMessage }}</p>
      <p v-if="actionMessage" class="message success">{{ actionMessage }}</p>
    </section>

    <section class="card staking-context-card">
      <header class="card-header">
        <h2>{{ t("Lane context") }}</h2>
      </header>
      <div class="form-grid staking-controls">
        <label>
          {{ t("Staking group") }}
          <select
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
        </label>
        <label>
          {{ t("Reward epoch duration (hours)") }}
          <input v-model.trim="epochDurationHours" type="text" />
        </label>
      </div>

      <div class="grid-2 staking-metrics">
        <div class="kv">
          <span class="kv-label">{{ t("Lane") }}</span>
          <span class="kv-value">{{
            laneContext ? `#${laneContext.laneId}` : t("—")
          }}</span>
        </div>
        <div class="kv">
          <span class="kv-label">{{ t("Alias") }}</span>
          <span class="kv-value">{{ laneContext?.alias || t("—") }}</span>
        </div>
        <div class="kv">
          <span class="kv-label">{{ t("Active validators") }}</span>
          <span class="kv-value">{{ activeValidatorCount }}</span>
        </div>
        <div class="kv">
          <span class="kv-label">{{ t("Unbond Delay") }}</span>
          <span class="kv-value">
            {{ policy ? formatDuration(policy.unbondingDelayMs) : t("—") }}
          </span>
        </div>
        <div class="kv">
          <span class="kv-label">{{ t("Stake Token Balance") }}</span>
          <span class="kv-value"
            >{{ stakeTokenBalance }} {{ stakeTokenSymbol }}</span
          >
        </div>
      </div>

      <details class="technical-details compact">
        <summary>{{ t("Staking details") }}</summary>
        <div class="grid-2">
          <div class="kv">
            <span class="kv-label">{{ t("Signer") }}</span>
            <span class="kv-value mono">{{
              stakerAccountId || t("Not configured")
            }}</span>
          </div>
          <div class="kv">
            <span class="kv-label">{{ t("Endpoint") }}</span>
            <span class="kv-value mono">{{ session.connection.toriiUrl }}</span>
          </div>
        </div>
      </details>
    </section>

    <section class="card validator-market-card">
      <header class="card-header">
        <div>
          <h2>{{ t("Validator nominations") }}</h2>
          <p class="helper tight">
            {{ t("Select a validator, then bond XOR to nominate it.") }}
          </p>
        </div>
      </header>

      <div v-if="validators.length" class="table-wrap validator-table-wrap">
        <table class="table validator-table">
          <thead>
            <tr>
              <th>{{ t("Validator") }}</th>
              <th>{{ t("Status") }}</th>
              <th>{{ t("Total stake") }}</th>
              <th>{{ t("Lane share") }}</th>
              <th>{{ t("Self stake") }}</th>
              <th>{{ t("Commission") }}</th>
              <th>{{ t("Nominators") }}</th>
              <th>{{ t("Last reward") }}</th>
              <th>{{ t("Action") }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="entry in validators"
              :key="entry.validator"
              :class="{ selected: entry.validator === selectedValidator }"
            >
              <td>
                <strong class="mono">{{ entry.validator }}</strong>
                <span class="validator-peer mono">{{
                  entry.peer_id || t("Peer id unavailable")
                }}</span>
              </td>
              <td>
                <span class="status-pill" :class="validatorStatusClass(entry)">
                  {{ entry.status.type }}
                </span>
              </td>
              <td>{{ entry.total_stake }} {{ stakeTokenSymbol }}</td>
              <td>{{ validatorStakeShareLabel(entry) }}</td>
              <td>{{ entry.self_stake }} {{ stakeTokenSymbol }}</td>
              <td>{{ formatValidatorCommission(entry) }}</td>
              <td>{{ validatorNominatorCount(entry.validator) }}</td>
              <td>{{ formatRewardEpoch(entry.last_reward_epoch) }}</td>
              <td>
                <button
                  type="button"
                  class="secondary table-action"
                  :disabled="loadingLaneData"
                  @click="selectValidator(entry.validator)"
                >
                  {{
                    entry.validator === selectedValidator
                      ? t("Selected")
                      : t("Select")
                  }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="helper">
        {{ t("No validators found for this lane.") }}
      </p>
    </section>

    <div class="staking-workbench">
      <section class="card staking-actions-card">
        <header class="card-header">
          <h2>{{ t("Nominate and manage stake") }}</h2>
        </header>
        <div class="selected-validator-strip">
          <span>{{ t("Selected validator") }}</span>
          <strong class="mono">{{ selectedValidator || t("None") }}</strong>
        </div>
        <div class="form-grid staking-action-grid">
          <label>
            {{ t("Bond amount (XOR)") }}
            <input v-model.trim="bondAmount" type="text" />
          </label>
          <div class="actions-inline">
            <button
              class="secondary"
              type="button"
              :disabled="!hasBondableBalance"
              @click="bondAmount = stakeTokenBalance"
            >
              {{ t("Max") }}
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
          <div class="actions">
            <button
              :disabled="!canSubmit || !hasBondableBalance || isActionBusy"
              @click="handleBond"
            >
              {{ actionBusy === "bond" ? t("Submitting…") : t("Bond XOR") }}
            </button>
          </div>

          <label>
            {{ t("Unbond amount (XOR)") }}
            <input v-model.trim="unbondAmount" type="text" />
          </label>
          <div class="actions-inline">
            <button
              class="secondary"
              type="button"
              :disabled="!hasBondedStake"
              @click="unbondAmount = selectedStakeShare?.bonded || ''"
            >
              {{ t("Max") }}
            </button>
          </div>
          <p v-if="policy" class="helper tight">
            {{
              t("Release is set from on-chain policy: {datetime}.", {
                datetime: formatDateTime(releasePreviewMs),
              })
            }}
          </p>
          <p class="transaction-fee-note">
            <span>{{ t("Fee") }}</span>
            <strong>{{
              formatTransactionFee(
                transactionFeeHintForEndpoint(session.connection.toriiUrl),
                t,
              )
            }}</strong>
          </p>
          <div class="actions">
            <button
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
        </div>
      </section>

      <section class="card staking-position-card">
        <header class="card-header">
          <h2>{{ t("Your nomination") }}</h2>
        </header>
        <div class="grid-2 staking-position-grid">
          <div class="kv">
            <span class="kv-label">{{
              t("Bonded with selected validator")
            }}</span>
            <span class="kv-value"
              >{{ selectedStakeShare?.bonded || t("0") }}
              {{ stakeTokenSymbol }}</span
            >
          </div>
          <div class="kv">
            <span class="kv-label">{{ t("Pending Unbonds") }}</span>
            <span class="kv-value">{{ pendingUnbonds.length }}</span>
          </div>
          <div class="kv">
            <span class="kv-label">{{ t("Pending rewards / fees") }}</span>
            <span class="kv-value"
              >{{ pendingRewardTotalLabel }} {{ stakeTokenSymbol }}</span
            >
          </div>
          <div class="kv">
            <span class="kv-label">{{ t("Observed reward epochs") }}</span>
            <span class="kv-value">{{ rewardEpochSpan || t("—") }}</span>
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
        <div class="actions">
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
        <p class="transaction-fee-note">
          <span>{{ t("Fee") }}</span>
          <strong>{{
            formatTransactionFee(
              transactionFeeHintForEndpoint(session.connection.toriiUrl),
              t,
            )
          }}</strong>
        </p>
        <p v-if="!pendingUnbonds.length" class="helper">
          {{ t("No pending unbond requests for the selected validator.") }}
        </p>
      </section>
    </div>

    <section class="card validator-operator-card">
      <header class="card-header">
        <div>
          <h2>{{ t("Operate a validator") }}</h2>
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

      <div v-if="selfValidatorRecord" class="grid-2 operator-status-grid">
        <div class="kv">
          <span class="kv-label">{{ t("Validator account") }}</span>
          <span class="kv-value mono">{{ selfValidatorRecord.validator }}</span>
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
            >{{ selfValidatorRecord.total_stake }} {{ stakeTokenSymbol }}</span
          >
        </div>
        <div class="kv">
          <span class="kv-label">{{ t("Fees / rewards pending") }}</span>
          <span class="kv-value"
            >{{ pendingRewardTotalLabel }} {{ stakeTokenSymbol }}</span
          >
        </div>
      </div>

      <div class="form-grid operator-form-grid">
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
          <input v-model.trim="operatorCommissionBps" type="text" />
        </label>
        <label>
          {{ t("Self stake (XOR)") }}
          <input v-model.trim="operatorSelfStake" type="text" />
        </label>
      </div>

      <details class="technical-details compact">
        <summary>{{ t("Validator registration payload") }}</summary>
        <pre class="staking-json-preview">{{ operatorPayloadPreview }}</pre>
      </details>

      <div class="actions operator-actions">
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

    <section class="card staking-rewards-card">
      <header class="card-header">
        <div>
          <h2>{{ t("Rewards and APY") }}</h2>
          <p class="helper tight">
            {{
              t(
                "APY is estimated from pending rewards, bonded stake, and the configured reward epoch duration.",
              )
            }}
          </p>
        </div>
      </header>
      <div class="grid-2 rewards-summary-grid">
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
      </div>
      <div v-if="rewardsForAccount.length" class="table-wrap">
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
      <div class="actions">
        <button
          :disabled="!canSubmit || !hasClaimableRewards || isActionBusy"
          @click="handleClaimRewards"
        >
          {{ actionBusy === "claim" ? t("Submitting…") : t("Claim Rewards") }}
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
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useAppI18n } from "@/composables/useAppI18n";
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
  grid-template-columns: minmax(0, 1fr);
  gap: 18px;
  position: relative;
  z-index: 1;
}

.npos-workspace > .card,
.npos-workspace > .staking-workbench {
  grid-column: 1 / -1;
}

.staking-workbench > .card {
  grid-column: auto;
}

.staking-command-card,
.staking-context-card,
.validator-market-card,
.staking-actions-card,
.staking-position-card,
.validator-operator-card,
.staking-rewards-card {
  min-width: 0;
}

.staking-command-header,
.card-header {
  gap: 16px;
}

.staking-kicker {
  margin: 0 0 4px;
  color: var(--iroha-accent);
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0;
  text-transform: uppercase;
}

.staking-stat-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-top: 18px;
}

.staking-stat {
  min-width: 0;
  padding: 14px;
  border: 1px solid var(--panel-border);
  border-radius: 14px;
  background: var(--surface-soft);
}

.staking-stat span {
  display: block;
  color: var(--iroha-muted);
  font-size: 0.76rem;
  font-weight: 700;
}

.staking-stat strong {
  display: block;
  margin-top: 8px;
  overflow-wrap: anywhere;
  font-size: clamp(1rem, 1.8vw, 1.35rem);
}

.staking-workbench {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(320px, 0.9fr);
  gap: 18px;
  align-items: start;
}

.validator-table-wrap {
  max-height: 440px;
  border: 1px solid var(--panel-border);
  border-radius: 14px;
}

.validator-table th,
.validator-table td {
  vertical-align: middle;
}

.validator-table tbody tr {
  transition:
    background 0.18s ease,
    box-shadow 0.18s ease;
}

.validator-table tbody tr.selected {
  background: rgba(255, 76, 102, 0.08);
  box-shadow: inset 3px 0 0 var(--iroha-accent);
}

.validator-peer {
  display: block;
  max-width: 260px;
  margin-top: 5px;
  color: var(--iroha-muted);
  overflow-wrap: anywhere;
}

.table-action {
  padding: 7px 12px;
  border-radius: 10px;
  font-size: 0.78rem;
  white-space: nowrap;
}

.selected-validator-strip {
  display: grid;
  gap: 4px;
  margin-bottom: 14px;
  padding: 12px 14px;
  border: 1px solid var(--panel-border);
  border-radius: 14px;
  background: var(--surface-soft);
}

.selected-validator-strip span {
  color: var(--iroha-muted);
  font-size: 0.78rem;
  font-weight: 700;
}

.selected-validator-strip strong {
  overflow-wrap: anywhere;
}

.operator-form-grid {
  margin-top: 16px;
}

.operator-status-grid {
  margin-top: 12px;
}

.operator-actions {
  justify-content: space-between;
}

.staking-json-preview {
  max-height: 220px;
  overflow: auto;
  margin: 12px 0 0;
  padding: 12px;
  border: 1px solid var(--panel-border);
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.06);
  color: inherit;
  font-size: 0.78rem;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.finalize-select {
  margin-top: 12px;
}

.helper {
  margin-top: 12px;
  font-size: 0.85rem;
  color: var(--iroha-muted);
}

.helper.tight {
  margin-top: 2px;
}

.actions-inline {
  display: flex;
  justify-content: flex-end;
  margin-top: -4px;
}

.actions-inline button {
  padding: 6px 12px;
  border-radius: 10px;
  font-size: 0.8rem;
}

.message {
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: 12px;
  font-size: 0.85rem;
}

.message.success {
  border: 1px solid rgba(34, 197, 94, 0.4);
  background: rgba(34, 197, 94, 0.1);
  color: #15803d;
}

.message.error {
  border: 1px solid rgba(239, 68, 68, 0.5);
  background: rgba(239, 68, 68, 0.12);
  color: #b91c1c;
}

.mono {
  font-family:
    ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono",
    "Courier New", monospace;
  font-size: 0.8rem;
}

@media (max-width: 980px) {
  .staking-stat-grid,
  .staking-workbench {
    grid-template-columns: 1fr;
  }
}
</style>

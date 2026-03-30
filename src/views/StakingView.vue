<template>
  <div class="staking-shell">
    <section class="card staking-context-card">
      <header class="card-header">
        <h2>{{ t("Nominate Validators") }}</h2>
        <button class="secondary" :disabled="loadingBootstrap" @click="refresh">
          {{ loadingBootstrap ? t("Refreshing…") : t("Refresh") }}
        </button>
      </header>
      <p class="helper">
        {{
          t(
            "Stake XOR by dataspace. Lane selection is automatic from live governance, then validators are loaded for that lane.",
          )
        }}
      </p>
      <div class="form-grid staking-controls">
        <label>
          {{ t("Dataspace") }}
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
              {{ option.label }} · {{ option.lanes.length }} lane(s) ·
              {{ option.totalValidators }} validator(s)
            </option>
          </select>
        </label>

        <label>
          {{ t("Validator") }}
          <select
            v-model="selectedValidator"
            :disabled="loadingLaneData || !validators.length"
          >
            <option
              v-for="entry in validators"
              :key="entry.validator"
              :value="entry.validator"
            >
              {{ entry.validator }} · {{ entry.status.type }}
            </option>
          </select>
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
          <span class="kv-label">{{ t("Signer") }}</span>
          <span class="kv-value mono">{{
            stakerAccountId || t("Not configured")
          }}</span>
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

      <p v-if="selectedValidatorRecord" class="helper">
        {{
          t(
            "Validator total stake {total} XOR, self stake {self} XOR, status {status}.",
            {
              total: selectedValidatorRecord.total_stake,
              self: selectedValidatorRecord.self_stake,
              status: selectedValidatorRecord.status.type,
            },
          )
        }}
      </p>
      <p v-if="statusMessage" class="helper">{{ statusMessage }}</p>
      <p v-if="errorMessage" class="message error">{{ errorMessage }}</p>
    </section>

    <section class="card staking-actions-card">
      <header class="card-header">
        <h2>{{ t("Bond / Unbond") }}</h2>
      </header>
      <div class="form-grid staking-action-grid">
        <label>
          {{ t("Bond amount (XOR)") }}
          <input
            v-model.trim="bondAmount"
            type="text"
            :placeholder="t('100')"
          />
        </label>
        <p class="helper tight">
          {{
            t("Available: {balance} {symbol}", {
              balance: stakeTokenBalance,
              symbol: stakeTokenSymbol,
            })
          }}
        </p>
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
          <input
            v-model.trim="unbondAmount"
            type="text"
            :placeholder="t('50')"
          />
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
        <div class="actions">
          <button
            :disabled="!canSubmit || !policy || !hasBondedStake || isActionBusy"
            @click="handleScheduleUnbond"
          >
            {{
              actionBusy === "unbond" ? t("Submitting…") : t("Schedule Unbond")
            }}
          </button>
        </div>
      </div>
      <p v-if="actionMessage" class="message success">{{ actionMessage }}</p>
    </section>

    <section class="card staking-position-card">
      <header class="card-header">
        <h2>{{ t("Your Position") }}</h2>
      </header>
      <div class="grid-2 staking-position-grid">
        <div class="kv">
          <span class="kv-label">{{ t("Bonded") }}</span>
          <span class="kv-value"
            >{{ selectedStakeShare?.bonded || t("0") }} XOR</span
          >
        </div>
        <div class="kv">
          <span class="kv-label">{{ t("Pending Unbonds") }}</span>
          <span class="kv-value">{{ pendingUnbonds.length }}</span>
        </div>
      </div>
      <label v-if="pendingUnbonds.length" style="margin-top: 12px">
        {{ t("Finalize request") }}
        <select v-model="selectedFinalizeRequestId">
          <option
            v-for="request in pendingUnbonds"
            :key="request.request_id"
            :value="request.request_id"
          >
            {{ request.request_id }} · {{ request.amount }} XOR ·
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
            actionBusy === "finalize" ? t("Submitting…") : t("Finalize Unbond")
          }}
        </button>
      </div>
      <p v-if="!pendingUnbonds.length" class="helper">
        {{ t("No pending unbond requests for the selected validator.") }}
      </p>
    </section>

    <section class="card staking-rewards-card">
      <header class="card-header">
        <h2>{{ t("Pending Rewards") }}</h2>
      </header>
      <div v-if="rewardsForAccount.length" class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>{{ t("Asset") }}</th>
              <th>{{ t("Amount") }}</th>
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
  hasClaimableRewards as hasClaimableRewardsInList,
  pickDefaultValidator,
  resolveLaneForDataspace,
  type DataspaceOption,
} from "@/utils/staking";
import { deriveAssetSymbol } from "@/utils/assetId";
import { toUserFacingErrorMessage } from "@/utils/errorMessage";

const session = useSessionStore();
const activeAccount = computed(() => session.activeAccount);
const { localeStore, t } = useAppI18n();

const loadingBootstrap = ref(false);
const loadingLaneData = ref(false);
const actionBusy = ref<"bond" | "unbond" | "finalize" | "claim" | null>(null);
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
const selectedFinalizeRequestId = ref("");
const policy = ref<NexusStakingPolicy | null>(null);
const stakeTokenBalance = ref("0");
const stakeTokenSymbol = ref("XOR");

const stakeResponse = ref<PublicLaneStakeResponseView | null>(null);
const rewardsResponse = ref<PublicLaneRewardsResponseView | null>(null);

const stakerAccountId = computed(() => activeAccount.value?.accountId ?? "");
const laneContext = computed(() =>
  resolveLaneForDataspace(dataspaceOptions.value, selectedDataspaceId.value),
);
const laneId = computed(() => laneContext.value?.laneId ?? null);

const selectedValidatorRecord = computed(() =>
  validators.value.find((entry) => entry.validator === selectedValidator.value),
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

const pendingUnbonds = computed(
  () => selectedStakeShare.value?.pending_unbonds ?? [],
);

const rewardsForAccount = computed(() => rewardsResponse.value?.items ?? []);
const hasClaimableRewards = computed(() =>
  hasClaimableRewardsInList(rewardsForAccount.value),
);

const canSubmit = computed(() =>
  Boolean(
    session.connection.toriiUrl &&
      session.connection.chainId &&
      activeAccount.value?.accountId &&
      activeAccount.value.privateKeyHex &&
      laneId.value !== null &&
      selectedValidator.value &&
      !loadingBootstrap.value &&
      !loadingLaneData.value,
  ),
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

const releasePreviewMs = computed(() => {
  if (!policy.value) return Date.now();
  return computeUnbondReleaseAtMs(policy.value.unbondingDelayMs);
});

const formatDateTime = (value: number) =>
  new Intl.DateTimeFormat(localeStore.current, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

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
    const stakePayload = await getNexusPublicLaneStake({
      toriiUrl,
      laneId: currentLaneId,
      validator: nextValidator || undefined,
    });
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
    const normalizedTargetAsset = session.connection.assetDefinitionId
      .trim()
      .toLowerCase();
    const scoredAssets = accountAssets.items
      .map((asset) => {
        const assetId = String(asset.asset_id ?? "");
        const normalizedAssetId = assetId.toLowerCase();
        const quantity = Number(String(asset.quantity ?? ""));
        const quantityScore =
          Number.isFinite(quantity) && quantity > 0
            ? Math.min(quantity, 1_000_000)
            : 0;

        let score = 0;
        if (normalizedTargetAsset) {
          if (normalizedAssetId === normalizedTargetAsset) score += 1_000_000;
          if (normalizedAssetId.startsWith(normalizedTargetAsset)) {
            score += 100_000;
          }
          if (normalizedAssetId.includes(normalizedTargetAsset)) {
            score += 50_000;
          }
        }
        if (normalizedAssetId.startsWith("xor#")) score += 25_000;
        else if (normalizedAssetId.includes("xor")) score += 15_000;
        if (normalizedAssetId.startsWith("norito:")) score += 5_000;

        return {
          asset,
          score: score + quantityScore,
        };
      })
      .sort((left, right) => right.score - left.score);
    const detectedStakeAsset = scoredAssets[0]?.asset ?? null;
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
  mode: "bond" | "unbond" | "finalize" | "claim",
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
    return t("Bond submitted: {hash}", { hash: result.hash });
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
    return t("Unbond scheduled ({requestId}) for {datetime}. Tx: {hash}", {
      requestId,
      datetime: formatDateTime(releaseAtMs),
      hash: result.hash,
    });
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
    return t("Finalize submitted: {hash}", { hash: result.hash });
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
    return t("Reward claim submitted: {hash}", { hash: result.hash });
  });

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
</style>

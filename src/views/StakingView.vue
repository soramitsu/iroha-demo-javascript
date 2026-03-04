<template>
  <div class="card-grid">
    <section class="card">
      <header class="card-header">
        <h2>Nominate Validators</h2>
        <button class="secondary" :disabled="loadingBootstrap" @click="refresh">
          {{ loadingBootstrap ? "Refreshing…" : "Refresh" }}
        </button>
      </header>
      <p class="helper">
        Stake XOR by dataspace. Lane selection is automatic from live
        governance, then validators are loaded for that lane.
      </p>
      <div class="form-grid">
        <label>
          Dataspace
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
          Validator
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

      <div class="grid-2" style="margin-top: 12px">
        <div class="kv">
          <span class="kv-label">Lane</span>
          <span class="kv-value">{{
            laneContext ? `#${laneContext.laneId}` : "—"
          }}</span>
        </div>
        <div class="kv">
          <span class="kv-label">Alias</span>
          <span class="kv-value">{{ laneContext?.alias || "—" }}</span>
        </div>
        <div class="kv">
          <span class="kv-label">Signer</span>
          <span class="kv-value mono">{{
            stakerAccountId || "Not configured"
          }}</span>
        </div>
        <div class="kv">
          <span class="kv-label">Unbond Delay</span>
          <span class="kv-value">
            {{ policy ? formatDuration(policy.unbondingDelayMs) : "—" }}
          </span>
        </div>
        <div class="kv">
          <span class="kv-label">Stake Token Balance</span>
          <span class="kv-value"
            >{{ stakeTokenBalance }} {{ stakeTokenSymbol }}</span
          >
        </div>
      </div>

      <p v-if="selectedValidatorRecord" class="helper">
        Validator total stake {{ selectedValidatorRecord.total_stake }} XOR,
        self stake {{ selectedValidatorRecord.self_stake }} XOR, status
        {{ selectedValidatorRecord.status.type }}.
      </p>
      <p v-if="statusMessage" class="helper">{{ statusMessage }}</p>
      <p v-if="errorMessage" class="message error">{{ errorMessage }}</p>
    </section>

    <section class="card">
      <header class="card-header">
        <h2>Bond / Unbond</h2>
      </header>
      <div class="form-grid">
        <label>
          Bond amount (XOR)
          <input v-model.trim="bondAmount" type="text" placeholder="100" />
        </label>
        <p class="helper tight">
          Available: {{ stakeTokenBalance }} {{ stakeTokenSymbol }}
        </p>
        <div class="actions-inline">
          <button
            class="secondary"
            type="button"
            :disabled="!hasBondableBalance"
            @click="bondAmount = stakeTokenBalance"
          >
            Max
          </button>
        </div>
        <div class="actions">
          <button
            :disabled="!canSubmit || !hasBondableBalance || isActionBusy"
            @click="handleBond"
          >
            {{ actionBusy === "bond" ? "Submitting…" : "Bond XOR" }}
          </button>
        </div>

        <label>
          Unbond amount (XOR)
          <input v-model.trim="unbondAmount" type="text" placeholder="50" />
        </label>
        <div class="actions-inline">
          <button
            class="secondary"
            type="button"
            :disabled="!hasBondedStake"
            @click="unbondAmount = selectedStakeShare?.bonded || ''"
          >
            Max
          </button>
        </div>
        <p v-if="policy" class="helper tight">
          Release is set from on-chain policy:
          {{ formatDateTime(releasePreviewMs) }}.
        </p>
        <div class="actions">
          <button
            :disabled="!canSubmit || !policy || !hasBondedStake || isActionBusy"
            @click="handleScheduleUnbond"
          >
            {{ actionBusy === "unbond" ? "Submitting…" : "Schedule Unbond" }}
          </button>
        </div>
      </div>
      <p v-if="actionMessage" class="message success">{{ actionMessage }}</p>
    </section>

    <section class="card">
      <header class="card-header">
        <h2>Your Position</h2>
      </header>
      <div class="grid-2">
        <div class="kv">
          <span class="kv-label">Bonded</span>
          <span class="kv-value"
            >{{ selectedStakeShare?.bonded || "0" }} XOR</span
          >
        </div>
        <div class="kv">
          <span class="kv-label">Pending Unbonds</span>
          <span class="kv-value">{{ pendingUnbonds.length }}</span>
        </div>
      </div>
      <label v-if="pendingUnbonds.length" style="margin-top: 12px">
        Finalize request
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
          {{ actionBusy === "finalize" ? "Submitting…" : "Finalize Unbond" }}
        </button>
      </div>
      <p v-if="!pendingUnbonds.length" class="helper">
        No pending unbond requests for the selected validator.
      </p>
    </section>

    <section class="card">
      <header class="card-header">
        <h2>Pending Rewards</h2>
      </header>
      <table v-if="rewardsForAccount.length" class="table">
        <thead>
          <tr>
            <th>Asset</th>
            <th>Amount</th>
            <th>Through Epoch</th>
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
      <p v-else class="helper">No pending rewards for this lane/account.</p>
      <div class="actions">
        <button
          :disabled="!canSubmit || !hasClaimableRewards || isActionBusy"
          @click="handleClaimRewards"
        >
          {{ actionBusy === "claim" ? "Submitting…" : "Claim Rewards" }}
        </button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
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

const session = useSessionStore();
const activeAccount = computed(() => session.activeAccount);

const loadingBootstrap = ref(false);
const loadingLaneData = ref(false);
const actionBusy = ref<"bond" | "unbond" | "finalize" | "claim" | null>(null);

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
  new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

const formatDuration = (milliseconds: number) => {
  if (milliseconds < 1000) return `${milliseconds} ms`;
  const seconds = Math.floor(milliseconds / 1000);
  if (seconds < 60) return `${seconds} sec`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    return remainingSeconds
      ? `${minutes} min ${remainingSeconds} sec`
      : `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes
    ? `${hours} hr ${remainingMinutes} min`
    : `${hours} hr`;
};

const toPositiveAmount = (value: string, label: string) => {
  const normalized = value.trim();
  if (!/^\d+(\.\d+)?$/.test(normalized) || /^0+(\.0+)?$/.test(normalized)) {
    throw new Error(`${label} must be greater than zero.`);
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
      `Amount exceeds available ${maxAmountLabel} (${maxAmount} ${stakeTokenSymbol.value}).`,
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

const loadLaneData = async () => {
  if (
    !session.connection.toriiUrl ||
    !stakerAccountId.value ||
    laneId.value === null
  ) {
    resetLaneState();
    return;
  }

  loadingLaneData.value = true;
  errorMessage.value = "";

  try {
    const [validatorsPayload, rewardsPayload] = await Promise.all([
      getNexusPublicLaneValidators({
        toriiUrl: session.connection.toriiUrl,
        laneId: laneId.value,
      }),
      getNexusPublicLaneRewards({
        toriiUrl: session.connection.toriiUrl,
        laneId: laneId.value,
        account: stakerAccountId.value,
      }),
    ]);

    const nextValidator = pickDefaultValidator(
      validatorsPayload.items,
      selectedValidator.value,
    );
    const stakePayload = await getNexusPublicLaneStake({
      toriiUrl: session.connection.toriiUrl,
      laneId: laneId.value,
      validator: nextValidator || undefined,
    });

    validators.value = validatorsPayload.items;
    selectedValidator.value = nextValidator;
    stakeResponse.value = stakePayload;
    rewardsResponse.value = rewardsPayload;
  } catch (error) {
    resetLaneState();
    errorMessage.value = error instanceof Error ? error.message : String(error);
  } finally {
    loadingLaneData.value = false;
  }
};

const refresh = async () => {
  if (!session.connection.toriiUrl || !activeAccount.value?.accountId) {
    statusMessage.value =
      "Configure Torii and complete account onboarding first.";
    resetLaneState();
    return;
  }

  loadingBootstrap.value = true;
  errorMessage.value = "";
  actionMessage.value = "";

  try {
    const [status, stakingPolicy, accountAssets] = await Promise.all([
      getSumeragiStatus(session.connection.toriiUrl),
      getNexusStakingPolicy(session.connection.toriiUrl),
      fetchAccountAssets({
        toriiUrl: session.connection.toriiUrl,
        accountId: activeAccount.value.accountId,
        limit: 200,
      }),
    ]);
    const preferredStakeAsset = accountAssets.items.find((asset) =>
      asset.asset_id.toLowerCase().startsWith("xor#"),
    );
    const fallbackStakeAsset = session.connection.assetDefinitionId
      ? accountAssets.items.find((asset) =>
          asset.asset_id.startsWith(session.connection.assetDefinitionId),
        )
      : null;
    const detectedStakeAsset =
      preferredStakeAsset ?? fallbackStakeAsset ?? null;
    stakeTokenBalance.value = detectedStakeAsset?.quantity ?? "0";
    stakeTokenSymbol.value =
      detectedStakeAsset?.asset_id.split("#")[0]?.toUpperCase() || "XOR";

    const options = collectDataspaceOptions(status);
    dataspaceOptions.value = options;
    selectedDataspaceId.value = chooseDefaultDataspaceId(
      options,
      selectedDataspaceId.value,
    );
    policy.value = stakingPolicy;

    if (!options.length) {
      statusMessage.value =
        "No dataspace governance found on this Torii endpoint.";
      resetLaneState();
      return;
    }

    statusMessage.value = `Loaded ${options.length} dataspace option(s).`;
    await loadLaneData();
  } catch (error) {
    statusMessage.value = "";
    resetLaneState();
    errorMessage.value = error instanceof Error ? error.message : String(error);
  } finally {
    loadingBootstrap.value = false;
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
    errorMessage.value = error instanceof Error ? error.message : String(error);
  } finally {
    actionBusy.value = null;
  }
};

const handleBond = () =>
  runAction("bond", async () => {
    if (!canSubmit.value || !activeAccount.value) {
      throw new Error(
        "Connection, account, dataspace, and validator are required.",
      );
    }
    if (!hasBondableBalance.value) {
      throw new Error(
        `No ${stakeTokenSymbol.value} balance available to bond.`,
      );
    }
    const amount = toPositiveAmount(bondAmount.value, "Bond amount");
    enforceAmountWithinLimit(amount, stakeTokenBalance.value, "stake balance");
    const result = await bondPublicLaneStake({
      toriiUrl: session.connection.toriiUrl,
      chainId: session.connection.chainId,
      stakeAccountId: activeAccount.value.accountId,
      validator: selectedValidator.value,
      amount,
      privateKeyHex: activeAccount.value.privateKeyHex,
    });
    bondAmount.value = "";
    return `Bond submitted: ${result.hash}`;
  });

const handleScheduleUnbond = () =>
  runAction("unbond", async () => {
    if (!canSubmit.value || !activeAccount.value || !policy.value) {
      throw new Error(
        "Connection, account, validator, and staking policy are required.",
      );
    }
    if (!selectedStakeShare.value || !hasBondedStake.value) {
      throw new Error("No bonded stake available to unbond.");
    }
    const amount = toPositiveAmount(unbondAmount.value, "Unbond amount");
    enforceAmountWithinLimit(
      amount,
      selectedStakeShare.value.bonded,
      "bonded stake",
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
    return `Unbond scheduled (${requestId}) for ${formatDateTime(releaseAtMs)}. Tx: ${result.hash}`;
  });

const handleFinalizeUnbond = () =>
  runAction("finalize", async () => {
    if (
      !canSubmit.value ||
      !activeAccount.value ||
      !selectedFinalizeRequestId.value
    ) {
      throw new Error("Select a pending unbond request first.");
    }
    const result = await finalizePublicLaneUnbond({
      toriiUrl: session.connection.toriiUrl,
      chainId: session.connection.chainId,
      stakeAccountId: activeAccount.value.accountId,
      validator: selectedValidator.value,
      requestId: selectedFinalizeRequestId.value,
      privateKeyHex: activeAccount.value.privateKeyHex,
    });
    return `Finalize submitted: ${result.hash}`;
  });

const handleClaimRewards = () =>
  runAction("claim", async () => {
    if (!canSubmit.value || !activeAccount.value) {
      throw new Error("Connection, account, and validator are required.");
    }
    if (!hasClaimableRewards.value) {
      throw new Error("No pending rewards available to claim.");
    }
    const result = await claimPublicLaneRewards({
      toriiUrl: session.connection.toriiUrl,
      chainId: session.connection.chainId,
      stakeAccountId: activeAccount.value.accountId,
      validator: selectedValidator.value,
      privateKeyHex: activeAccount.value.privateKeyHex,
    });
    return `Reward claim submitted: ${result.hash}`;
  });

watch(
  selectedValidator,
  async (next, previous) => {
    if (
      loadingLaneData.value ||
      !next ||
      next === previous ||
      !session.connection.toriiUrl ||
      laneId.value === null
    ) {
      return;
    }
    loadingLaneData.value = true;
    errorMessage.value = "";
    try {
      stakeResponse.value = await getNexusPublicLaneStake({
        toriiUrl: session.connection.toriiUrl,
        laneId: laneId.value,
        validator: next,
      });
    } catch (error) {
      stakeResponse.value = null;
      errorMessage.value =
        error instanceof Error ? error.message : String(error);
    } finally {
      loadingLaneData.value = false;
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

<template>
  <div class="parliament-shell">
    <section class="card parliament-status-card">
      <header class="card-header">
        <h2>{{ t("Voting eligibility") }}</h2>
        <button class="secondary" :disabled="loadingBootstrap" @click="refresh">
          {{ loadingBootstrap ? t("Refreshing…") : t("Refresh") }}
        </button>
      </header>
      <p v-if="!alreadyCitizen" class="helper">
        {{
          t("Bond {amount} XOR once to enable voting for this wallet.", {
            amount: CITIZEN_BOND_XOR,
          })
        }}
      </p>
      <div class="grid-2 parliament-summary">
        <div class="kv">
          <span class="kv-label">{{ t("XOR Balance") }}</span>
          <span class="kv-value">{{ xorBalance }} XOR</span>
        </div>
        <div class="kv">
          <span class="kv-label">{{ t("Required Bond") }}</span>
          <span class="kv-value">{{ CITIZEN_BOND_XOR }} XOR</span>
        </div>
      </div>

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
            <span class="kv-value">{{
              session.connection.chainId || t("—")
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

      <div class="actions">
        <button :disabled="!canBondCitizen" @click="handleBondCitizen">
          {{
            actionBusy === "bond"
              ? t("Submitting…")
              : t("Bond {amount} XOR", { amount: CITIZEN_BOND_XOR })
          }}
        </button>
      </div>
      <p v-if="!alreadyCitizen" class="transaction-fee-note">
        <span>{{ t("Fee") }}</span>
        <strong>{{ formatTransactionFee(null, t) }}</strong>
      </p>
      <p v-if="alreadyCitizen" class="message success">
        {{
          t(
            "Citizenship voting permission detected. Bonding is no longer required.",
          )
        }}
      </p>
      <p v-if="!alreadyCitizen && !hasXorForBond" class="message warning">
        {{
          t("Available XOR balance is below the required citizen bond amount.")
        }}
      </p>
      <p v-if="statusMessage" class="helper">{{ statusMessage }}</p>
      <p v-if="actionMessage" class="message success">{{ actionMessage }}</p>
      <p v-if="errorMessage" class="message error">{{ errorMessage }}</p>
    </section>

    <section class="card parliament-lookup-card">
      <header class="card-header">
        <h2>{{ t("Load proposal") }}</h2>
        <button
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
        {{ t("Proposal ID must be 32-byte hex (with or without 0x prefix).") }}
      </p>
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

    <section class="card parliament-ballot-card">
      <header class="card-header">
        <h2>{{ t("Vote") }}</h2>
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
        <button :disabled="!canSubmitBallot" @click="handleBallot">
          {{ actionBusy === "ballot" ? t("Submitting…") : t("Submit ballot") }}
        </button>
      </div>
      <p class="transaction-fee-note">
        <span>{{ t("Fee") }}</span>
        <strong>{{ formatTransactionFee(null, t) }}</strong>
      </p>
      <p v-if="missingBallotPermission" class="message warning">
        {{
          t(
            "Ballot permission is missing on this account. Submit the citizenship bond and refresh before voting.",
          )
        }}
      </p>
      <p v-if="!hasValidBallotAmount" class="message warning">
        {{ t("Ballot amount must be a whole number greater than zero.") }}
      </p>
      <p v-else-if="!hasXorForBallot" class="message warning">
        {{ t("Ballot amount exceeds the available XOR balance.") }}
      </p>
      <p v-if="!hasValidDurationBlocks" class="message warning">
        {{ t("Lock duration must be a positive integer number of blocks.") }}
      </p>
    </section>

    <section class="card parliament-council-card">
      <details class="technical-details">
        <summary>{{ t("Advanced governance tools") }}</summary>
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
            <span class="kv-value">{{ council?.alternates.length ?? 0 }}</span>
          </div>
          <div class="kv">
            <span class="kv-label">{{ t("Derived By") }}</span>
            <span class="kv-value">{{ council?.derived_by ?? t("—") }}</span>
          </div>
        </div>

        <div class="actions">
          <button
            class="secondary"
            :disabled="!canFinalizeDraft"
            @click="handleFinalize"
          >
            {{
              actionBusy === "finalize" ? t("Preparing…") : t("Finalize draft")
            }}
          </button>
          <button
            class="secondary"
            :disabled="!canEnactDraft"
            @click="handleEnact"
          >
            {{ actionBusy === "enact" ? t("Preparing…") : t("Enact draft") }}
          </button>
        </div>
        <p v-if="missingParliamentPermission" class="message warning">
          {{ t("Finalize requires CanManageParliament permission.") }}
        </p>
        <p v-if="missingEnactPermission" class="message warning">
          {{ t("Enact requires CanEnactGovernance permission.") }}
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
            t("Enact draft: {summary}", { summary: summarizeDraft(enactDraft) })
          }}
        </p>

        <ul v-if="council?.members.length" class="member-list mono">
          <li v-for="member in council.members" :key="member.account_id">
            {{ member.account_id }}
          </li>
        </ul>
      </details>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useAppI18n } from "@/composables/useAppI18n";
import {
  enactGovernanceProposal,
  fetchAccountAssets,
  finalizeGovernanceReferendum,
  getGovernanceCouncilCurrent,
  getGovernanceLocks,
  getGovernanceProposal,
  getGovernanceReferendum,
  getGovernanceTally,
  listAccountPermissions,
  registerCitizen,
  submitGovernancePlainBallot,
} from "@/services/iroha";
import { useSessionStore } from "@/stores/session";
import { getPublicAccountId } from "@/utils/accountId";
import type {
  AccountPermissionItem,
  GovernanceBallotDirection,
  GovernanceDraftResponse,
  GovernanceLocksResult,
  GovernanceProposalResult,
  GovernanceReferendumResult,
  GovernanceTallyResult,
  GovernanceCouncilCurrentResponse,
} from "@/types/iroha";
import { compareDecimalStrings } from "@/utils/staking";
import {
  CITIZEN_BOND_XOR,
  hasGovernancePermission,
  canonicalizeProposalId,
  extractProposalIdFromReferendum,
  isValidProposalId,
  isPositiveInteger,
  isPositiveWholeNumberString,
  parseParliamentHistory,
  pushRecentValue,
  resolveXorBalance,
  sanitizeReferendumId,
} from "@/utils/parliament";
import { toUserFacingErrorMessage } from "@/utils/errorMessage";
import {
  appendTransactionFee,
  formatTransactionFee,
} from "@/utils/transactionFee";

const session = useSessionStore();
const activeAccount = computed(() => session.activeAccount);
const activeAccountDisplayId = computed(() =>
  getPublicAccountId(activeAccount.value, session.connection.networkPrefix),
);
const requestAccountId = computed(
  () => activeAccountDisplayId.value || activeAccount.value?.accountId || "",
);
const { t } = useAppI18n();

const loadingBootstrap = ref(false);
const permissionsLoaded = ref(false);
const lookupLoading = ref(false);
const actionBusy = ref<"bond" | "ballot" | "finalize" | "enact" | null>(null);

const statusMessage = ref("");
const actionMessage = ref("");
const errorMessage = ref("");

const xorBalance = ref("0");
const permissions = ref<AccountPermissionItem[]>([]);
const council = ref<GovernanceCouncilCurrentResponse | null>(null);

const referendumId = ref("");
const proposalId = ref("");
const ballotAmount = ref(CITIZEN_BOND_XOR);
const durationBlocks = ref(7_200);
const direction = ref<GovernanceBallotDirection>("Aye");
const recentReferenda = ref<string[]>([]);
const recentProposals = ref<string[]>([]);

const referendum = ref<GovernanceReferendumResult | null>(null);
const proposal = ref<GovernanceProposalResult | null>(null);
const tally = ref<GovernanceTallyResult | null>(null);
const locks = ref<GovernanceLocksResult | null>(null);
const finalizeDraft = ref<GovernanceDraftResponse | null>(null);
const enactDraft = ref<GovernanceDraftResponse | null>(null);
const loadedReferendumInput = ref<string | null>(null);
const loadedProposalInput = ref<string | null>(null);
const lookupGeneration = ref(0);
const refreshGeneration = ref(0);

const canSubmit = computed(() =>
  Boolean(
    session.connection.toriiUrl &&
      session.connection.chainId &&
      requestAccountId.value,
  ),
);

const isActionBusy = computed(() => actionBusy.value !== null);
const hasBallotPermission = computed(() =>
  hasGovernancePermission(permissions.value, "CanSubmitGovernanceBallot"),
);
const hasParliamentPermission = computed(() =>
  hasGovernancePermission(permissions.value, "CanManageParliament"),
);
const hasEnactPermission = computed(() =>
  hasGovernancePermission(permissions.value, "CanEnactGovernance"),
);
const lockCount = computed(() => Object.keys(locks.value?.locks ?? {}).length);
const trimmedReferendumId = computed(() => referendumId.value.trim());
const proposalLiteral = computed(() => proposalId.value.trim());
const canonicalProposalId = computed(() =>
  proposalLiteral.value ? canonicalizeProposalId(proposalLiteral.value) : null,
);
const proposalIdFormatError = computed(
  () => Boolean(proposalLiteral.value) && !canonicalProposalId.value,
);
const ballotAmountLiteral = computed(() => ballotAmount.value.trim());
const hasValidBallotAmount = computed(() =>
  isPositiveWholeNumberString(ballotAmountLiteral.value),
);
const hasXorForBallot = computed(() => {
  if (!hasValidBallotAmount.value) {
    return false;
  }
  try {
    return (
      compareDecimalStrings(xorBalance.value, ballotAmountLiteral.value) >= 0
    );
  } catch (_error) {
    return false;
  }
});
const hasValidDurationBlocks = computed(() =>
  isPositiveInteger(durationBlocks.value),
);
const missingBallotPermission = computed(
  () => permissionsLoaded.value && !hasBallotPermission.value,
);
const alreadyCitizen = computed(
  () => permissionsLoaded.value && hasBallotPermission.value,
);
const missingParliamentPermission = computed(
  () => permissionsLoaded.value && !hasParliamentPermission.value,
);
const missingEnactPermission = computed(
  () => permissionsLoaded.value && !hasEnactPermission.value,
);
const canBondCitizen = computed(
  () =>
    canSubmit.value &&
    hasXorForBond.value &&
    !alreadyCitizen.value &&
    !isActionBusy.value,
);
const canSubmitBallot = computed(
  () =>
    canSubmit.value &&
    Boolean(trimmedReferendumId.value) &&
    hasValidBallotAmount.value &&
    hasXorForBallot.value &&
    hasValidDurationBlocks.value &&
    !missingBallotPermission.value &&
    !isActionBusy.value,
);
const canFinalizeDraft = computed(
  () =>
    Boolean(session.connection.toriiUrl) &&
    Boolean(trimmedReferendumId.value) &&
    Boolean(canonicalProposalId.value) &&
    !missingParliamentPermission.value &&
    !isActionBusy.value,
);
const canEnactDraft = computed(
  () =>
    Boolean(session.connection.toriiUrl) &&
    Boolean(canonicalProposalId.value) &&
    !missingEnactPermission.value &&
    !isActionBusy.value,
);
const canLookupGovernance = computed(
  () =>
    Boolean(session.connection.toriiUrl) &&
    (Boolean(trimmedReferendumId.value) || Boolean(proposalLiteral.value)) &&
    (Boolean(trimmedReferendumId.value) || !proposalIdFormatError.value) &&
    !lookupLoading.value,
);

const hasXorForBond = computed(() => {
  try {
    return compareDecimalStrings(xorBalance.value, CITIZEN_BOND_XOR) >= 0;
  } catch (_error) {
    return false;
  }
});
const historyStorageKey = computed(() =>
  activeAccount.value?.accountId
    ? `iroha-demo:parliament-history:${activeAccount.value.accountId}`
    : null,
);

const resetGovernanceLookup = () => {
  referendum.value = null;
  proposal.value = null;
  tally.value = null;
  locks.value = null;
  finalizeDraft.value = null;
  enactDraft.value = null;
  loadedReferendumInput.value = null;
  loadedProposalInput.value = null;
  lookupLoading.value = false;
  lookupGeneration.value += 1;
};

const loadHistory = () => {
  if (!historyStorageKey.value) {
    recentReferenda.value = [];
    recentProposals.value = [];
    return;
  }
  const raw = localStorage.getItem(historyStorageKey.value);
  if (!raw) {
    recentReferenda.value = [];
    recentProposals.value = [];
    return;
  }
  try {
    const parsed = parseParliamentHistory(JSON.parse(raw));
    recentReferenda.value = parsed.referenda;
    recentProposals.value = parsed.proposals;
  } catch (_error) {
    recentReferenda.value = [];
    recentProposals.value = [];
    localStorage.removeItem(historyStorageKey.value);
  }
};

const saveHistory = () => {
  if (!historyStorageKey.value) {
    return;
  }
  localStorage.setItem(
    historyStorageKey.value,
    JSON.stringify({
      referenda: recentReferenda.value,
      proposals: recentProposals.value,
    }),
  );
};

const rememberHistory = (input: {
  referendumId?: string | null;
  proposalId?: string | null;
}) => {
  if (input.referendumId) {
    recentReferenda.value = pushRecentValue(
      recentReferenda.value,
      sanitizeReferendumId(input.referendumId),
    );
  }
  if (input.proposalId) {
    const normalizedProposalId = canonicalizeProposalId(input.proposalId);
    if (normalizedProposalId) {
      recentProposals.value = pushRecentValue(
        recentProposals.value,
        normalizedProposalId,
      );
    }
  }
  saveHistory();
};

const clearHistory = () => {
  recentReferenda.value = [];
  recentProposals.value = [];
  if (historyStorageKey.value) {
    localStorage.removeItem(historyStorageKey.value);
  }
};

const applyRecentReferendum = async (value: string) => {
  referendumId.value = value;
  if (canLookupGovernance.value) {
    await lookupGovernance();
  }
};

const applyRecentProposal = async (value: string) => {
  proposalId.value = value;
  if (canLookupGovernance.value) {
    await lookupGovernance();
  }
};

const shortenIdentifier = (value: string) => {
  if (value.length <= 22) {
    return value;
  }
  return `${value.slice(0, 10)}…${value.slice(-10)}`;
};

const refresh = async () => {
  const toriiUrl = session.connection.toriiUrl;
  const accountId = requestAccountId.value;
  if (!toriiUrl || !accountId) {
    refreshGeneration.value += 1;
    loadingBootstrap.value = false;
    errorMessage.value = "";
    statusMessage.value = t("Set up network and wallet first.");
    permissionsLoaded.value = false;
    permissions.value = [];
    council.value = null;
    xorBalance.value = "0";
    resetGovernanceLookup();
    return;
  }

  const requestGeneration = refreshGeneration.value + 1;
  refreshGeneration.value = requestGeneration;
  loadingBootstrap.value = true;
  statusMessage.value = "";
  errorMessage.value = "";

  try {
    const [assetsPayload, permissionsPayload, councilPayload] =
      await Promise.all([
        fetchAccountAssets({
          toriiUrl,
          accountId,
          limit: 200,
        }),
        listAccountPermissions({
          toriiUrl,
          accountId,
          limit: 200,
        }),
        getGovernanceCouncilCurrent(toriiUrl),
      ]);

    if (
      requestGeneration !== refreshGeneration.value ||
      session.connection.toriiUrl !== toriiUrl ||
      requestAccountId.value !== accountId
    ) {
      return;
    }

    xorBalance.value = resolveXorBalance(assetsPayload.items);
    permissionsLoaded.value = true;
    permissions.value = permissionsPayload.items;
    council.value = councilPayload;
    statusMessage.value = t("Loaded {count} permission token(s).", {
      count: permissionsPayload.total,
    });
  } catch (error) {
    if (requestGeneration !== refreshGeneration.value) {
      return;
    }
    permissionsLoaded.value = false;
    permissions.value = [];
    council.value = null;
    xorBalance.value = "0";
    resetGovernanceLookup();
    errorMessage.value = toUserFacingErrorMessage(
      error,
      t("Failed to load governance state."),
    );
  } finally {
    if (requestGeneration === refreshGeneration.value) {
      loadingBootstrap.value = false;
    }
  }
};

const lookupGovernance = async () => {
  if (!session.connection.toriiUrl) {
    errorMessage.value = t("Torii connection is required.");
    return;
  }
  if (!trimmedReferendumId.value && !proposalLiteral.value) {
    errorMessage.value = t("Provide a referendum id or proposal id first.");
    return;
  }
  if (!trimmedReferendumId.value && proposalIdFormatError.value) {
    errorMessage.value = t(
      "Proposal ID must be 32-byte hex (with or without 0x prefix).",
    );
    return;
  }

  const requestGeneration = lookupGeneration.value + 1;
  lookupGeneration.value = requestGeneration;
  lookupLoading.value = true;
  statusMessage.value = "";
  errorMessage.value = "";

  try {
    const referendumLiteral = trimmedReferendumId.value;
    const proposalLiteralInput = proposalLiteral.value;
    const proposalInputWasInvalid = proposalIdFormatError.value;
    const proposalLiteralNormalized = proposalInputWasInvalid
      ? null
      : canonicalProposalId.value;
    let inferredProposalId: string | null = null;
    let nextReferendum: GovernanceReferendumResult | null = null;
    let nextTally: GovernanceTallyResult | null = null;
    let nextLocks: GovernanceLocksResult | null = null;
    let nextProposal: GovernanceProposalResult | null = null;
    let nextProposalField = proposalLiteralInput;

    if (referendumLiteral) {
      const [referendumPayload, tallyPayload, lockPayload] = await Promise.all([
        getGovernanceReferendum({
          toriiUrl: session.connection.toriiUrl,
          referendumId: referendumLiteral,
        }),
        getGovernanceTally({
          toriiUrl: session.connection.toriiUrl,
          referendumId: referendumLiteral,
        }),
        getGovernanceLocks({
          toriiUrl: session.connection.toriiUrl,
          referendumId: referendumLiteral,
        }),
      ]);
      nextReferendum = referendumPayload;
      nextTally = tallyPayload;
      nextLocks = lockPayload;
      inferredProposalId = extractProposalIdFromReferendum(
        referendumPayload.referendum,
      );
    }

    const lookupProposalId = proposalLiteralNormalized ?? inferredProposalId;
    if (lookupProposalId) {
      nextProposal = await getGovernanceProposal({
        toriiUrl: session.connection.toriiUrl,
        proposalId: lookupProposalId,
      });
      if (!proposalLiteralNormalized) {
        nextProposalField = lookupProposalId;
      }
    }

    // Ignore stale async results if user changed lookup ids while request was in flight.
    if (
      requestGeneration !== lookupGeneration.value ||
      trimmedReferendumId.value !== referendumLiteral ||
      proposalLiteral.value !== proposalLiteralInput
    ) {
      return;
    }

    const finalReferendumInput = referendumLiteral || null;
    const finalProposalInput =
      (canonicalizeProposalId(nextProposalField) ?? nextProposalField) || null;
    loadedReferendumInput.value = finalReferendumInput;
    loadedProposalInput.value = finalProposalInput;

    referendum.value = nextReferendum;
    tally.value = nextTally;
    locks.value = nextLocks;
    proposal.value = nextProposal;
    if (nextProposalField !== proposalLiteralInput) {
      proposalId.value = nextProposalField;
    }

    rememberHistory({
      referendumId: referendumLiteral || null,
      proposalId: lookupProposalId,
    });
    statusMessage.value =
      referendumLiteral && proposalInputWasInvalid
        ? t("Governance records refreshed. Invalid proposal ID was ignored.")
        : t("Governance records refreshed.");
  } catch (error) {
    if (requestGeneration !== lookupGeneration.value) {
      return;
    }
    referendum.value = null;
    proposal.value = null;
    tally.value = null;
    locks.value = null;
    finalizeDraft.value = null;
    enactDraft.value = null;
    loadedReferendumInput.value = null;
    loadedProposalInput.value = null;
    errorMessage.value = toUserFacingErrorMessage(
      error,
      t("Failed to refresh governance records."),
    );
  } finally {
    if (requestGeneration === lookupGeneration.value) {
      lookupLoading.value = false;
    }
  }
};

const runAction = async (
  mode: "bond" | "ballot" | "finalize" | "enact",
  run: () => Promise<string>,
) => {
  actionBusy.value = mode;
  errorMessage.value = "";
  actionMessage.value = "";
  try {
    actionMessage.value = await run();
  } catch (error) {
    errorMessage.value = toUserFacingErrorMessage(error, t("Action failed."));
  } finally {
    actionBusy.value = null;
  }
};

const handleBondCitizen = () =>
  runAction("bond", async () => {
    if (!canSubmit.value || !activeAccount.value || !requestAccountId.value) {
      throw new Error(t("Connection, chain, and active account are required."));
    }
    if (alreadyCitizen.value) {
      throw new Error(
        t(
          "This account already has governance ballot permission and does not need another citizenship bond.",
        ),
      );
    }
    if (!hasXorForBond.value) {
      throw new Error(
        t("A minimum of {amount} XOR is required to register citizenship.", {
          amount: CITIZEN_BOND_XOR,
        }),
      );
    }
    const result = await registerCitizen({
      toriiUrl: session.connection.toriiUrl,
      chainId: session.connection.chainId,
      accountId: requestAccountId.value,
      amount: CITIZEN_BOND_XOR,
      privateKeyHex: activeAccount.value.privateKeyHex,
    });
    await refresh();
    return appendTransactionFee(
      t("Citizenship bond submitted: {hash}", { hash: result.hash }),
      result,
      t,
    );
  });

const handleBallot = () =>
  runAction("ballot", async () => {
    if (!canSubmit.value || !activeAccount.value || !requestAccountId.value) {
      throw new Error(t("Connection, chain, and active account are required."));
    }
    if (missingBallotPermission.value) {
      throw new Error(
        t(
          "CanSubmitGovernanceBallot permission is missing on the active account.",
        ),
      );
    }
    const referendumLiteral = trimmedReferendumId.value;
    if (!referendumLiteral) {
      throw new Error(
        t("referendumId is required before submitting a ballot."),
      );
    }
    if (!hasValidBallotAmount.value) {
      throw new Error(
        t("Ballot amount must be a whole number greater than zero."),
      );
    }
    if (!hasXorForBallot.value) {
      throw new Error(t("Ballot amount exceeds the available XOR balance."));
    }
    if (!hasValidDurationBlocks.value) {
      throw new Error(
        t("Lock duration must be a positive integer number of blocks."),
      );
    }
    const result = await submitGovernancePlainBallot({
      toriiUrl: session.connection.toriiUrl,
      chainId: session.connection.chainId,
      accountId: requestAccountId.value,
      referendumId: referendumLiteral,
      amount: ballotAmountLiteral.value,
      durationBlocks: durationBlocks.value,
      direction: direction.value,
      privateKeyHex: activeAccount.value.privateKeyHex,
    });
    rememberHistory({ referendumId: referendumLiteral });
    await lookupGovernance();
    return appendTransactionFee(
      t("Ballot submitted: {hash}", { hash: result.hash }),
      result,
      t,
    );
  });

const handleFinalize = () =>
  runAction("finalize", async () => {
    if (!session.connection.toriiUrl) {
      throw new Error(t("Torii connection is required."));
    }
    if (missingParliamentPermission.value) {
      throw new Error(
        t("CanManageParliament permission is required for finalize."),
      );
    }
    const referendumLiteral = trimmedReferendumId.value;
    const proposalLiteral = proposalId.value.trim();
    const proposalLiteralNormalized = canonicalProposalId.value;
    if (!referendumLiteral || !proposalLiteral) {
      throw new Error(
        t("referendumId and proposalId are required for finalize."),
      );
    }
    if (!proposalLiteralNormalized) {
      throw new Error(
        t("Proposal ID must be 32-byte hex (with or without 0x prefix)."),
      );
    }
    finalizeDraft.value = await finalizeGovernanceReferendum({
      toriiUrl: session.connection.toriiUrl,
      referendumId: referendumLiteral,
      proposalId: proposalLiteralNormalized,
    });
    proposalId.value = proposalLiteralNormalized;
    rememberHistory({
      referendumId: referendumLiteral,
      proposalId: proposalLiteralNormalized,
    });
    return t("Finalize draft prepared with {count} instruction(s).", {
      count: finalizeDraft.value.tx_instructions.length,
    });
  });

const handleEnact = () =>
  runAction("enact", async () => {
    if (!session.connection.toriiUrl) {
      throw new Error(t("Torii connection is required."));
    }
    if (missingEnactPermission.value) {
      throw new Error(
        t("CanEnactGovernance permission is required for enact."),
      );
    }
    const proposalLiteral = proposalId.value.trim();
    const proposalLiteralNormalized = canonicalProposalId.value;
    if (!proposalLiteral) {
      throw new Error(t("proposalId is required for enact."));
    }
    if (!proposalLiteralNormalized) {
      throw new Error(
        t("Proposal ID must be 32-byte hex (with or without 0x prefix)."),
      );
    }
    enactDraft.value = await enactGovernanceProposal({
      toriiUrl: session.connection.toriiUrl,
      proposalId: proposalLiteralNormalized,
    });
    proposalId.value = proposalLiteralNormalized;
    rememberHistory({ proposalId: proposalLiteralNormalized });
    return t("Enact draft prepared with {count} instruction(s).", {
      count: enactDraft.value.tx_instructions.length,
    });
  });

const summarizeDraft = (draft: GovernanceDraftResponse) => {
  const accepted =
    draft.accepted === undefined ? t("n/a") : String(draft.accepted);
  const reason = draft.reason
    ? ` ${t("reason: {reason}", { reason: draft.reason })}`
    : "";
  return t("accepted={accepted}, instructions={count}.{reason}", {
    accepted,
    count: draft.tx_instructions.length,
    reason,
  });
};

watch(
  () => requestAccountId.value,
  (nextAccountId, previousAccountId) => {
    loadHistory();
    if (
      previousAccountId !== undefined &&
      nextAccountId !== previousAccountId
    ) {
      resetGovernanceLookup();
    }
  },
  { immediate: true },
);

watch(
  () => [trimmedReferendumId.value, proposalLiteral.value],
  ([nextReferendumId, nextProposalId]) => {
    const nextReferendumLiteral = nextReferendumId || null;
    const nextCanonicalProposalId = nextProposalId
      ? canonicalizeProposalId(nextProposalId)
      : null;
    const nextProposalLiteral =
      (nextCanonicalProposalId ?? nextProposalId) || null;
    if (
      loadedReferendumInput.value === null &&
      loadedProposalInput.value === null
    ) {
      return;
    }
    if (
      nextReferendumLiteral !== loadedReferendumInput.value ||
      nextProposalLiteral !== loadedProposalInput.value
    ) {
      referendum.value = null;
      proposal.value = null;
      tally.value = null;
      locks.value = null;
      finalizeDraft.value = null;
      enactDraft.value = null;
      statusMessage.value = "";
    }
  },
);

watch(
  proposalId,
  (next) => {
    if (!next.trim()) return;
    if (isValidProposalId(next)) {
      const normalized = canonicalizeProposalId(next);
      if (normalized && normalized !== next) {
        proposalId.value = normalized;
      }
    }
  },
  { flush: "post" },
);

watch(
  () => [
    session.connection.toriiUrl,
    session.connection.chainId,
    requestAccountId.value,
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
  margin-top: 6px;
}

.permission-stack {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 14px;
}

.history-stack {
  margin-top: 12px;
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
  border-radius: 999px;
  font-size: 0.76rem;
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
}

.message.success {
  border: 1px solid rgba(34, 197, 94, 0.4);
  background: rgba(34, 197, 94, 0.1);
  color: #15803d;
}

.message.warning {
  border: 1px solid rgba(217, 119, 6, 0.4);
  background: rgba(217, 119, 6, 0.1);
  color: #b45309;
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

.payload {
  margin-top: 12px;
  border-radius: 12px;
  padding: 12px;
  background: var(--surface-soft);
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
</style>

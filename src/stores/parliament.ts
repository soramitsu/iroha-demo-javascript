import { computed, ref, watch } from "vue";
import { defineStore } from "pinia";
import { useAppI18n } from "@/composables/useAppI18n";
import {
  GOVERNANCE_KIND_ADAPTERS,
  NATIVE_SBD_ASSET_DEFINITION_ID,
  VALIDATION_FEE_CHARGING_MODE,
  VALIDATION_FEE_TREASURY_PAYOUT_EXEMPTION,
  appendRetailMaintenanceTier,
  canonicalGovernanceProposalId,
  draftNextValidationFeePolicy,
  removeRetailMaintenanceTier,
  validateValidationFeePolicy,
  validationFeeActivationChoices as nextValidationFeeActivationChoices,
  validationFeeEnactmentWindowError,
  type GovernanceProposalDetail,
  type GovernanceProposalSummary,
  type GovernanceWritableProposalKindId,
  type ValidationFeePolicyPayload,
} from "@/governance/model";
import {
  confirmGovernanceAction,
  fetchAccountAssets,
  getGovernanceCapabilities,
  getGovernanceCitizenCount,
  getGovernanceCitizenStatus,
  getGovernanceCouncilCurrent,
  getGovernanceCurrentValidationFeePolicy,
  getGovernanceProposalDetail,
  getGovernanceUnlockStats,
  listGovernanceProposals,
  prepareGovernanceCitizenRegistration,
  prepareGovernanceProposal,
} from "@/services/iroha";
import { useEndpointStore } from "@/stores/endpoint";
import { useSessionStore } from "@/stores/session";
import type {
  GovernanceCapabilitiesV1,
  GovernanceCitizenCountResponse,
  GovernanceCitizenState,
  GovernanceCitizenStatusResponse,
  GovernanceCouncilCurrentResponse,
  GovernancePreparedAction,
  GovernanceUnlockStatsResponse,
  GovernanceValidationFeePolicyView,
} from "@/types/iroha";
import { getPublicAccountId } from "@/utils/accountId";
import { toUserFacingErrorMessage } from "@/utils/errorMessage";
import { resolveGovernanceBondBalance } from "@/utils/parliament";
import { compareDecimalStrings } from "@/utils/staking";
import { assertFinalizedSubmissionResult } from "@/utils/transactionFinality";
import { TAIRA_CHAIN_ID } from "@/utils/firstReleaseNetworkIdentity";
import { trustedNetworkIdFromInspection } from "@/utils/networkIdentity";

export type GovernanceCatalogFilter = "open" | "all" | "mine";
export type GovernanceBusyAction =
  | "bootstrap"
  | "list"
  | "detail"
  | "prepare"
  | "commit"
  | null;

export interface GovernanceActionGate {
  allowed: boolean;
  reason: string;
}

interface GovernanceCapabilitiesRequestContext {
  toriiUrl: string;
  accountId: string;
  chainId: string;
  networkPrefix: number;
}

const VALIDATION_FEE_ACTIVATION_CHOICES = 12;
/** How often an open composer re-checks the activation against the clock. */
export const VALIDATION_FEE_COMPOSER_CLOCK_INTERVAL_MS = 60_000;

const emptyValidationFeePolicy = (): ValidationFeePolicyPayload => ({
  schema_version: 1,
  // Filled from the endpoint's pinned NetworkId once capabilities load.
  network_id: "",
  policy_version: "1",
  previous_policy_hash: null,
  ds_asset_id: NATIVE_SBD_ASSET_DEFINITION_ID,
  ds_scale: 2,
  retail_schedule: {
    included_payments: 0,
    overage_minor: 0,
    maintenance_tiers: [
      { minimum_average_balance_minor: 0, monthly_fee_minor: 0 },
    ],
  },
  effective_from_ms: 0,
  notice_published_at_ms: 0,
  fee: "",
  treasury_account_id: "",
  charging_mode: { charging_mode: VALIDATION_FEE_CHARGING_MODE, value: null },
  exemption_classes: [VALIDATION_FEE_TREASURY_PAYOUT_EXEMPTION],
  reward_custody: {
    contract_address: "",
    treasury_account_id: "",
    ds_asset_id: NATIVE_SBD_ASSET_DEFINITION_ID,
    xor_asset_id: "",
    reward_pool_account_id: "",
    validator_lane_id: 0,
  },
});

const contextKey = (context: GovernanceCapabilitiesRequestContext) =>
  JSON.stringify([
    context.toriiUrl,
    context.accountId,
    context.chainId,
    context.networkPrefix,
  ]);

export const useParliamentStore = defineStore("parliament", () => {
  const session = useSessionStore();
  const endpointStore = useEndpointStore();
  const { t } = useAppI18n();

  const activeAccount = computed(() => session.activeAccount);
  const accountId = computed(() =>
    getPublicAccountId(activeAccount.value, session.connection.networkPrefix),
  );
  const toriiUrl = computed(() => session.connection.toriiUrl.trim());
  const chainId = computed(() => session.connection.chainId.trim());
  const networkPrefix = computed(() => session.connection.networkPrefix);
  const currentContext = computed<GovernanceCapabilitiesRequestContext>(() => ({
    toriiUrl: toriiUrl.value,
    accountId: accountId.value,
    chainId: chainId.value,
    networkPrefix: networkPrefix.value,
  }));
  const currentContextKey = computed(() => contextKey(currentContext.value));

  const capabilities = ref<GovernanceCapabilitiesV1 | null>(null);
  const capabilitiesLoading = ref(false);
  const capabilitiesError = ref("");
  const capabilitiesContextKey = ref("");
  const catalogFilter = ref<GovernanceCatalogFilter>("open");
  const proposals = ref<GovernanceProposalSummary[]>([]);
  const nextCursor = ref<string | null>(null);
  const visibleProposals = computed(() =>
    proposals.value.filter((proposal) => {
      if (catalogFilter.value === "open") return proposal.status === "Proposed";
      if (catalogFilter.value === "mine") {
        return (
          Boolean(accountId.value) && proposal.proposer === accountId.value
        );
      }
      return true;
    }),
  );
  const selectedProposalId = ref<string | null>(null);
  const selectedProposal = ref<GovernanceProposalDetail | null>(null);
  const citizenStatus = ref<GovernanceCitizenStatusResponse | null>(null);
  const citizenshipLoading = ref(false);
  const citizenshipBalance = ref<string | null>(null);
  const citizenshipStatusError = ref("");
  const citizenshipBalanceError = ref("");
  const governanceCitizenCount = ref<GovernanceCitizenCountResponse | null>(
    null,
  );
  const governanceCitizenCountLoading = ref(false);
  const governanceCitizenCountError = ref("");
  const currentCouncil = ref<GovernanceCouncilCurrentResponse | null>(null);
  const currentCouncilLoading = ref(false);
  const currentCouncilError = ref("");
  const unlockStats = ref<GovernanceUnlockStatsResponse | null>(null);
  const unlockStatsLoading = ref(false);
  const unlockStatsError = ref("");
  const validationFeePolicy = ref<GovernanceValidationFeePolicyView | null>(
    null,
  );
  const policyError = ref("");

  const busy = ref<GovernanceBusyAction>(null);
  const refreshing = ref(false);
  const finalizedRefresh = ref(false);
  const listError = ref("");
  const detailError = ref("");
  const actionError = ref("");
  const actionMessage = ref("");

  const composerOpen = ref(false);
  const composerKind = ref<GovernanceWritableProposalKindId>(
    "ValidationFeePolicy",
  );
  const validationFeeComposer = ref<ValidationFeePolicyPayload>(
    emptyValidationFeePolicy(),
  );
  const validationFeeComposerSeedKey = ref("");
  /**
   * Wallet clock for the drafted revision. The proposal is its own public
   * notice, so the notice time follows this clock, and the ledger can enact
   * the proposal no earlier than it.
   */
  const validationFeeNowMs = ref(Date.now());
  let validationFeeClockTimer: ReturnType<typeof setInterval> | null = null;
  const review = ref<GovernancePreparedAction | null>(null);

  let contextGeneration = 0;
  let listGeneration = 0;
  let detailGeneration = 0;
  let refreshPulseTimer: ReturnType<typeof setTimeout> | null = null;

  const endpointGovernanceWriteError = computed(() => {
    if (!endpointStore.writeAllowed) {
      return (
        endpointStore.diagnostic ||
        t("Endpoint identity inspection has not authorized writes.")
      );
    }
    if (
      endpointStore.inspection?.features.governanceWrites?.supported !== true
    ) {
      return t(
        "The active endpoint does not advertise governance write operations.",
      );
    }
    return "";
  });
  const canWrite = computed(
    () =>
      Boolean(toriiUrl.value && chainId.value && accountId.value) &&
      !endpointGovernanceWriteError.value &&
      capabilitiesContextKey.value === currentContextKey.value &&
      chainId.value === TAIRA_CHAIN_ID &&
      capabilities.value !== null &&
      capabilities.value.networkId ===
        trustedNetworkIdFromInspection(endpointStore.inspection) &&
      capabilities.value.networkPrefix === networkPrefix.value &&
      capabilities.value.mandatoryPrivateBallots === true &&
      capabilities.value.proposalBackedReferendumBallotsSupported === false &&
      !capabilitiesError.value,
  );
  const governanceWriteUnavailableReason = computed(() => {
    if (endpointGovernanceWriteError.value) {
      return endpointGovernanceWriteError.value;
    }
    if (capabilitiesError.value) return capabilitiesError.value;
    if (!toriiUrl.value || !chainId.value || !accountId.value) {
      return t("Connect the reviewed Taira network and wallet first.");
    }
    if (!capabilities.value)
      return t("Governance capabilities are unavailable.");
    return "";
  });
  const citizenState = computed<GovernanceCitizenState>(
    () => citizenStatus.value?.state ?? "unavailable",
  );
  const isCitizen = computed(() => citizenState.value === "citizen");
  const supportedComposerKinds = computed<GovernanceWritableProposalKindId[]>(
    () => {
      // Payout-lifecycle proposals stay inspect-only: the pinned native codec
      // cannot decode ProposeValidationFeePayoutLifecycle for review.
      const kinds = capabilities.value?.supportedProposalKinds ?? [];
      return kinds.includes("VALIDATION_FEE_POLICY")
        ? ["ValidationFeePolicy"]
        : [];
    },
  );
  const proposalGate = computed<GovernanceActionGate>(() => {
    if (!canWrite.value) {
      return { allowed: false, reason: governanceWriteUnavailableReason.value };
    }
    if (citizenshipLoading.value) {
      return { allowed: false, reason: t("Checking citizenship…") };
    }
    if (citizenshipStatusError.value) {
      return { allowed: false, reason: citizenshipStatusError.value };
    }
    if (!isCitizen.value) {
      return {
        allowed: false,
        reason: t(
          "A current bonded Taira citizen is required to create a proposal.",
        ),
      };
    }
    if (supportedComposerKinds.value.length === 0) {
      return {
        allowed: false,
        reason: t("Taira advertises no writable proposal kinds."),
      };
    }
    return { allowed: true, reason: "" };
  });
  const citizenshipBondAmount = computed(
    () => capabilities.value?.citizenshipBondAmount ?? "",
  );
  const citizenshipAssetDefinitionId = computed(
    () => capabilities.value?.citizenshipAssetId ?? "",
  );
  const hasCitizenshipBondBalance = computed(() => {
    if (citizenshipBalance.value === null) return false;
    try {
      return (
        compareDecimalStrings(
          citizenshipBalance.value,
          citizenshipBondAmount.value,
        ) >= 0
      );
    } catch {
      return false;
    }
  });
  const canBondCitizen = computed(
    () =>
      canWrite.value &&
      citizenState.value === "not-citizen" &&
      hasCitizenshipBondBalance.value &&
      !citizenshipStatusError.value &&
      !citizenshipBalanceError.value &&
      busy.value === null,
  );
  const bondGate = computed<GovernanceActionGate>(() => {
    if (canBondCitizen.value) return { allowed: true, reason: "" };
    if (!canWrite.value) {
      return { allowed: false, reason: governanceWriteUnavailableReason.value };
    }
    if (isCitizen.value) {
      return {
        allowed: false,
        reason: t("This account is already a citizen."),
      };
    }
    if (citizenshipStatusError.value || citizenshipBalanceError.value) {
      return {
        allowed: false,
        reason: citizenshipStatusError.value || citizenshipBalanceError.value,
      };
    }
    return {
      allowed: false,
      reason: t(
        "Available XOR balance is below the required citizen bond amount.",
      ),
    };
  });
  const selectedAdapter = computed(() =>
    selectedProposal.value
      ? GOVERNANCE_KIND_ADAPTERS[selectedProposal.value.kind.type]
      : null,
  );

  // A plain JSON copy: reactive proxies must not cross the preload bridge.
  const materializeValidationFeePolicy = (): ValidationFeePolicyPayload =>
    JSON.parse(
      JSON.stringify({
        ...validationFeeComposer.value,
        network_id: capabilities.value?.networkId ?? "",
        ds_asset_id: NATIVE_SBD_ASSET_DEFINITION_ID,
        ds_scale: 2,
        charging_mode: {
          charging_mode: VALIDATION_FEE_CHARGING_MODE,
          value: null,
        },
        exemption_classes: [VALIDATION_FEE_TREASURY_PAYOUT_EXEMPTION],
      }),
    ) as ValidationFeePolicyPayload;

  const validationFeeActivationChoices = computed<number[]>(() => {
    const current = validationFeePolicy.value;
    if (!current) return [];
    return nextValidationFeeActivationChoices(
      validationFeeComposer.value.notice_published_at_ms,
      current.effective.effective_from_ms,
      VALIDATION_FEE_ACTIVATION_CHOICES,
    );
  });

  const validationFeeComposerErrors = computed(() => {
    const current = validationFeePolicy.value;
    return [
      ...new Set(
        validateValidationFeePolicy(
          materializeValidationFeePolicy(),
          current
            ? {
                effective: current.effective,
                registryHead: current.registryHead,
              }
            : null,
          { nowMs: validationFeeNowMs.value },
        ),
      ),
    ];
  });

  /**
   * Advance the composer clock and the notice time that follows it. When
   * `reselectActivation` is set (opening the composer or reloading verified
   * policy state, not the periodic tick or Decode and quote), an activation
   * month that has fallen inside the thirty-day window moves to the earliest
   * valid month; otherwise it stays and the composer reports it as invalid.
   */
  const advanceValidationFeeClock = (
    options: Readonly<{ reselectActivation?: boolean }> = {},
  ) => {
    const now = Date.now();
    validationFeeNowMs.value = now;
    const current = validationFeePolicy.value;
    if (!current || !validationFeeComposerSeedKey.value) return;
    const composer = validationFeeComposer.value;
    composer.notice_published_at_ms = now;
    if (!options.reselectActivation) return;
    const [earliest] = nextValidationFeeActivationChoices(
      now,
      current.effective.effective_from_ms,
      1,
    );
    if (earliest !== undefined && composer.effective_from_ms < earliest) {
      composer.effective_from_ms = earliest;
    }
  };

  const addValidationFeeMaintenanceTier = () => {
    const schedule = validationFeeComposer.value.retail_schedule;
    schedule.maintenance_tiers = appendRetailMaintenanceTier(
      schedule.maintenance_tiers,
    );
  };

  const removeValidationFeeMaintenanceTier = (index: number) => {
    const schedule = validationFeeComposer.value.retail_schedule;
    schedule.maintenance_tiers = removeRetailMaintenanceTier(
      schedule.maintenance_tiers,
      index,
    );
  };

  const resetActionFeedback = () => {
    actionError.value = "";
    actionMessage.value = "";
  };

  const isCurrent = (key: string, generation: number) =>
    key === currentContextKey.value && generation === contextGeneration;

  const loadCapabilities =
    async (): Promise<GovernanceCapabilitiesV1 | null> => {
      const generation = contextGeneration;
      const request = currentContext.value;
      const key = contextKey(request);
      capabilities.value = null;
      capabilitiesContextKey.value = "";
      capabilitiesError.value = "";
      capabilitiesLoading.value = Boolean(request.toriiUrl);
      if (!request.toriiUrl) {
        capabilitiesError.value = t("A Torii endpoint is required.");
        capabilitiesLoading.value = false;
        return null;
      }
      try {
        const loaded = await getGovernanceCapabilities(request.toriiUrl);
        if (!isCurrent(key, generation)) return null;
        if (
          request.chainId !== TAIRA_CHAIN_ID ||
          loaded.networkId !==
            trustedNetworkIdFromInspection(endpointStore.inspection) ||
          loaded.networkPrefix !== request.networkPrefix ||
          !loaded.mandatoryPrivateBallots ||
          loaded.proposalBackedReferendumBallotsSupported
        ) {
          throw new Error(
            "The endpoint governance capabilities do not match the reviewed Taira private-Parliament contract.",
          );
        }
        capabilities.value = loaded;
        capabilitiesContextKey.value = key;
        validationFeeComposer.value = {
          ...validationFeeComposer.value,
          network_id: loaded.networkId,
        };
        return loaded;
      } catch (error) {
        if (isCurrent(key, generation)) {
          capabilitiesError.value = toUserFacingErrorMessage(
            error,
            t("Taira governance capabilities are unavailable."),
          );
        }
        return null;
      } finally {
        if (isCurrent(key, generation)) capabilitiesLoading.value = false;
      }
    };

  const loadCitizenState = async () => {
    const generation = contextGeneration;
    const request = currentContext.value;
    const key = contextKey(request);
    citizenshipStatusError.value = "";
    if (!request.toriiUrl || !request.accountId) {
      citizenStatus.value = null;
      citizenshipLoading.value = false;
      return;
    }
    citizenshipLoading.value = true;
    try {
      const status = await getGovernanceCitizenStatus({
        toriiUrl: request.toriiUrl,
        accountId: request.accountId,
        networkPrefix: request.networkPrefix,
      });
      if (isCurrent(key, generation)) citizenStatus.value = status;
    } catch (error) {
      if (isCurrent(key, generation)) {
        citizenStatus.value = null;
        citizenshipStatusError.value = toUserFacingErrorMessage(
          error,
          t("Failed to load governance state."),
        );
      }
    } finally {
      if (isCurrent(key, generation)) citizenshipLoading.value = false;
    }
  };

  const loadGovernanceCitizenCount = async () => {
    const generation = contextGeneration;
    const key = currentContextKey.value;
    governanceCitizenCountError.value = "";
    if (!toriiUrl.value) {
      governanceCitizenCount.value = null;
      return;
    }
    governanceCitizenCountLoading.value = true;
    try {
      const count = await getGovernanceCitizenCount(toriiUrl.value);
      if (isCurrent(key, generation)) governanceCitizenCount.value = count;
    } catch (error) {
      if (isCurrent(key, generation)) {
        governanceCitizenCount.value = null;
        governanceCitizenCountError.value = toUserFacingErrorMessage(
          error,
          t("Failed to load governance state."),
        );
      }
    } finally {
      if (isCurrent(key, generation))
        governanceCitizenCountLoading.value = false;
    }
  };

  const loadCurrentCouncil = async () => {
    const generation = contextGeneration;
    const key = currentContextKey.value;
    currentCouncilError.value = "";
    if (!toriiUrl.value) {
      currentCouncil.value = null;
      return;
    }
    currentCouncilLoading.value = true;
    try {
      const council = await getGovernanceCouncilCurrent(toriiUrl.value);
      if (isCurrent(key, generation)) currentCouncil.value = council;
    } catch (error) {
      if (isCurrent(key, generation)) {
        currentCouncil.value = null;
        currentCouncilError.value = toUserFacingErrorMessage(
          error,
          t("Failed to load governance state."),
        );
      }
    } finally {
      if (isCurrent(key, generation)) currentCouncilLoading.value = false;
    }
  };

  const loadUnlockStats = async () => {
    const generation = contextGeneration;
    const request = currentContext.value;
    const key = contextKey(request);
    unlockStatsError.value = "";
    if (!request.toriiUrl || !request.accountId) {
      unlockStats.value = null;
      return;
    }
    unlockStatsLoading.value = true;
    try {
      const stats = await getGovernanceUnlockStats(request);
      if (isCurrent(key, generation)) unlockStats.value = stats;
    } catch (error) {
      if (isCurrent(key, generation)) {
        unlockStats.value = null;
        unlockStatsError.value = toUserFacingErrorMessage(
          error,
          t("Failed to load governance state."),
        );
      }
    } finally {
      if (isCurrent(key, generation)) unlockStatsLoading.value = false;
    }
  };

  const loadCitizenshipBalance = async () => {
    const generation = contextGeneration;
    const request = currentContext.value;
    const key = contextKey(request);
    const assetDefinitionId = capabilities.value?.citizenshipAssetId ?? "";
    citizenshipBalanceError.value = "";
    if (!request.toriiUrl || !request.accountId || !assetDefinitionId) {
      citizenshipBalance.value = null;
      return;
    }
    try {
      const page = await fetchAccountAssets({
        toriiUrl: request.toriiUrl,
        accountId: request.accountId,
        networkPrefix: request.networkPrefix,
        assetDefinitionId,
        limit: 200,
        offset: 0,
      });
      if (page.total > page.items.length) {
        throw new Error(
          "Governance bond balance exceeded the bounded exact-asset page.",
        );
      }
      if (isCurrent(key, generation)) {
        citizenshipBalance.value = resolveGovernanceBondBalance(
          page.items,
          assetDefinitionId,
        );
      }
    } catch (error) {
      if (isCurrent(key, generation)) {
        citizenshipBalance.value = null;
        citizenshipBalanceError.value = toUserFacingErrorMessage(
          error,
          t("Failed to load governance state."),
        );
      }
    }
  };

  /**
   * Seed the next contiguous revision from the verified effective policy:
   * immutable treasury and reward custody, the head hash and next version,
   * and the current tariff as the editable starting point. Edits survive
   * refreshes until the verified registry head or effective policy changes.
   */
  const syncValidationFeeComposer = (
    current: GovernanceValidationFeePolicyView,
  ) => {
    const seedKey = JSON.stringify([
      current.effectivePolicyHash,
      current.registryHead.policyHash,
      current.registryHead.policyVersion,
    ]);
    if (seedKey === validationFeeComposerSeedKey.value) {
      advanceValidationFeeClock({ reselectActivation: true });
      return;
    }
    validationFeeComposerSeedKey.value = seedKey;
    validationFeeNowMs.value = Date.now();
    validationFeeComposer.value = draftNextValidationFeePolicy(current, {
      networkId: capabilities.value?.networkId ?? current.effective.network_id,
      noticePublishedAtMs: validationFeeNowMs.value,
    });
  };

  const loadValidationFeePolicy = async () => {
    const generation = contextGeneration;
    const request = currentContext.value;
    const key = contextKey(request);
    validationFeePolicy.value = null;
    policyError.value = "";
    if (!request.toriiUrl) return;
    try {
      const current = await getGovernanceCurrentValidationFeePolicy({
        toriiUrl: request.toriiUrl,
        chainId: request.chainId,
        networkPrefix: request.networkPrefix,
      });
      if (!isCurrent(key, generation)) return;
      validationFeePolicy.value = current;
      syncValidationFeeComposer(current);
    } catch (error) {
      if (isCurrent(key, generation)) {
        policyError.value = toUserFacingErrorMessage(
          error,
          t("Validation-fee policy state is unavailable."),
        );
      }
    }
  };

  const loadProposals = async (
    options: { append?: boolean; preserveSelection?: boolean } = {},
  ) => {
    if (!toriiUrl.value) {
      proposals.value = [];
      nextCursor.value = null;
      return;
    }
    const generation = ++listGeneration;
    const key = currentContextKey.value;
    listError.value = "";
    busy.value = "list";
    try {
      const result = await listGovernanceProposals({
        toriiUrl: toriiUrl.value,
        limit: 30,
        cursor: options.append ? nextCursor.value : null,
      });
      if (generation !== listGeneration || key !== currentContextKey.value)
        return;
      proposals.value = options.append
        ? [
            ...proposals.value,
            ...result.items.filter(
              (item) =>
                !proposals.value.some(
                  (existing) => existing.proposalId === item.proposalId,
                ),
            ),
          ]
        : result.items;
      nextCursor.value = result.nextCursor;
      if (
        !options.preserveSelection &&
        !selectedProposalId.value &&
        proposals.value[0]
      ) {
        await selectProposal(proposals.value[0].proposalId);
      }
    } catch (error) {
      if (generation === listGeneration && key === currentContextKey.value) {
        listError.value = toUserFacingErrorMessage(
          error,
          t("Live governance proposals could not be loaded."),
        );
        if (!options.append) {
          proposals.value = [];
          nextCursor.value = null;
        }
      }
    } finally {
      if (generation === listGeneration && busy.value === "list") {
        busy.value = null;
      }
    }
  };

  const selectProposal = async (proposalId: string) => {
    const normalizedId = canonicalGovernanceProposalId(proposalId);
    if (!normalizedId) {
      detailError.value = t(
        "Proposal ID must be exact lowercase 32-byte hex (with or without 0x prefix).",
      );
      return;
    }
    if (!toriiUrl.value) return;
    selectedProposalId.value = normalizedId;
    selectedProposal.value = null;
    detailError.value = "";
    const generation = ++detailGeneration;
    const key = currentContextKey.value;
    busy.value = "detail";
    try {
      const detail = await getGovernanceProposalDetail({
        toriiUrl: toriiUrl.value,
        networkPrefix: networkPrefix.value,
        proposalId: normalizedId,
      });
      if (
        generation === detailGeneration &&
        key === currentContextKey.value &&
        selectedProposalId.value === normalizedId
      ) {
        selectedProposal.value = detail;
      }
    } catch (error) {
      if (generation === detailGeneration && key === currentContextKey.value) {
        detailError.value = toUserFacingErrorMessage(
          error,
          t("Proposal detail could not be loaded."),
        );
      }
    } finally {
      if (generation === detailGeneration && busy.value === "detail") {
        busy.value = null;
      }
    }
  };

  const refreshSelectedProposal = async () => {
    if (selectedProposalId.value) {
      await selectProposal(selectedProposalId.value);
    }
  };

  const bootstrap = async (deepLinkedProposalId?: string | null) => {
    const generation = contextGeneration;
    const key = currentContextKey.value;
    busy.value = "bootstrap";
    const capabilitiesRequest = loadCapabilities();
    const independentReads = Promise.allSettled([
      loadCitizenState(),
      loadGovernanceCitizenCount(),
      loadCurrentCouncil(),
      loadUnlockStats(),
      loadValidationFeePolicy(),
    ]);
    const loaded = await capabilitiesRequest;
    await independentReads;
    if (!isCurrent(key, generation)) return;
    if (loaded) await loadCitizenshipBalance();
    if (!isCurrent(key, generation)) return;
    busy.value = null;
    if (deepLinkedProposalId?.trim()) {
      await selectProposal(deepLinkedProposalId.trim());
    }
    await loadProposals({ preserveSelection: true });
    if (!selectedProposalId.value && proposals.value[0]) {
      await selectProposal(proposals.value[0].proposalId);
    }
  };

  const refresh = async () => {
    refreshing.value = true;
    const loaded = await loadCapabilities();
    await Promise.allSettled([
      loadCitizenState(),
      loadGovernanceCitizenCount(),
      loadCurrentCouncil(),
      loadUnlockStats(),
      loadValidationFeePolicy(),
      loadProposals({ preserveSelection: true }),
      refreshSelectedProposal(),
    ]);
    if (loaded) await loadCitizenshipBalance();
    refreshing.value = false;
  };

  const commonPrepareContext = () => {
    if (!canWrite.value) {
      throw new Error(
        governanceWriteUnavailableReason.value ||
          "Governance writes are unavailable.",
      );
    }
    return {
      toriiUrl: toriiUrl.value,
      chainId: chainId.value,
      accountId: accountId.value,
      networkPrefix: networkPrefix.value,
    };
  };

  const handleBondCitizen = async () => {
    resetActionFeedback();
    if (!bondGate.value.allowed) {
      actionError.value = bondGate.value.reason;
      return;
    }
    busy.value = "prepare";
    try {
      review.value = await prepareGovernanceCitizenRegistration({
        ...commonPrepareContext(),
        amount: citizenshipBondAmount.value,
      });
    } catch (error) {
      actionError.value = toUserFacingErrorMessage(error, t("Action failed."));
    } finally {
      busy.value = null;
    }
  };

  const openComposer = (
    kind: GovernanceWritableProposalKindId = "ValidationFeePolicy",
  ) => {
    resetActionFeedback();
    if (!proposalGate.value.allowed) {
      actionError.value = proposalGate.value.reason;
      return;
    }
    if (!supportedComposerKinds.value.includes(kind)) {
      actionError.value = t("This proposal kind is not advertised by Taira.");
      return;
    }
    composerKind.value = kind;
    advanceValidationFeeClock({ reselectActivation: true });
    composerOpen.value = true;
  };

  const closeComposer = () => {
    if (busy.value !== "prepare") composerOpen.value = false;
  };

  const prepareProposal = async () => {
    resetActionFeedback();
    if (!proposalGate.value.allowed) {
      actionError.value = proposalGate.value.reason;
      return;
    }
    busy.value = "prepare";
    try {
      const loaded = await loadCapabilities();
      if (!loaded) {
        throw new Error(
          capabilitiesError.value ||
            "Taira governance capabilities are unavailable.",
        );
      }
      await loadCitizenState();
      if (!isCitizen.value) {
        throw new Error(
          citizenshipStatusError.value ||
            "A current bonded Taira citizen is required to create a proposal.",
        );
      }
      if (!supportedComposerKinds.value.includes(composerKind.value)) {
        throw new Error(
          "This proposal kind is not advertised by the exact capabilities contract.",
        );
      }
      if (!validationFeePolicy.value) {
        throw new Error(
          "Validation-fee policy proposals require locally verified consensus proof state.",
        );
      }
      // Re-check against the current clock: the proposal cannot be enacted
      // before it is prepared, whatever time the draft was seeded.
      advanceValidationFeeClock();
      const policy = materializeValidationFeePolicy();
      if (validationFeeComposerErrors.value.length) {
        throw new Error(validationFeeComposerErrors.value[0]);
      }
      const enactmentError = validationFeeEnactmentWindowError(
        policy,
        Date.now(),
      );
      if (enactmentError) throw new Error(enactmentError);
      review.value = await prepareGovernanceProposal({
        ...commonPrepareContext(),
        kind: composerKind.value,
        payload: { policy },
      });
    } catch (error) {
      actionError.value = toUserFacingErrorMessage(
        error,
        t("The proposal could not be prepared."),
      );
    } finally {
      busy.value = null;
    }
  };

  const cancelReview = () => {
    if (busy.value !== "commit") review.value = null;
  };

  const confirmReview = async () => {
    if (!review.value) return;
    resetActionFeedback();
    if (!canWrite.value) {
      actionError.value = governanceWriteUnavailableReason.value;
      return;
    }
    busy.value = "commit";
    const prepared = review.value;
    try {
      const finalized = await confirmGovernanceAction({
        reviewId: prepared.reviewId,
        accountId: accountId.value,
      });
      assertFinalizedSubmissionResult(finalized);
      review.value = null;
      composerOpen.value = false;
      actionMessage.value = t("Finalized in block {block}: {hash}", {
        block: finalized.finality.blockHeight,
        hash: finalized.hash,
      });
      if (finalized.proposalId) {
        selectedProposalId.value = finalized.proposalId;
      }
      finalizedRefresh.value = true;
      if (refreshPulseTimer) clearTimeout(refreshPulseTimer);
      refreshPulseTimer = setTimeout(() => {
        finalizedRefresh.value = false;
      }, 900);
      await refresh();
    } catch (error) {
      actionError.value = toUserFacingErrorMessage(
        error,
        t("The reviewed action was not finalized."),
      );
    } finally {
      busy.value = null;
    }
  };

  watch(catalogFilter, () => {
    void loadProposals({ preserveSelection: true });
  });

  // While the composer is open, keep the clock (and the notice that follows
  // it) current so an activation month that falls inside the thirty-day
  // enactment window is reported and blocks Decode and quote.
  watch(composerOpen, (open) => {
    if (validationFeeClockTimer) {
      clearInterval(validationFeeClockTimer);
      validationFeeClockTimer = null;
    }
    if (open) {
      validationFeeClockTimer = setInterval(
        () => advanceValidationFeeClock(),
        VALIDATION_FEE_COMPOSER_CLOCK_INTERVAL_MS,
      );
    }
  });

  watch(
    currentContextKey,
    (next, previous) => {
      if (next === previous) return;
      contextGeneration += 1;
      capabilities.value = null;
      capabilitiesContextKey.value = "";
      capabilitiesError.value = "";
      citizenStatus.value = null;
      citizenshipBalance.value = null;
      governanceCitizenCount.value = null;
      currentCouncil.value = null;
      unlockStats.value = null;
      validationFeePolicy.value = null;
      validationFeeComposerSeedKey.value = "";
      validationFeeComposer.value = emptyValidationFeePolicy();
      selectedProposalId.value = null;
      selectedProposal.value = null;
      proposals.value = [];
      nextCursor.value = null;
      review.value = null;
      void bootstrap();
    },
    { flush: "sync" },
  );

  return {
    accountId,
    toriiUrl,
    chainId,
    canWrite,
    capabilities,
    capabilitiesLoading,
    capabilitiesError,
    endpointGovernanceWriteError,
    governanceWriteUnavailableReason,
    catalogFilter,
    proposals,
    visibleProposals,
    nextCursor,
    selectedProposalId,
    selectedProposal,
    selectedAdapter,
    citizenStatus,
    citizenState,
    citizenshipLoading,
    isCitizen,
    proposalGate,
    citizenshipBalance,
    citizenshipBondAmount,
    citizenshipAssetDefinitionId,
    canBondCitizen,
    bondGate,
    governanceCitizenCount,
    governanceCitizenCountLoading,
    governanceCitizenCountError,
    currentCouncil,
    currentCouncilLoading,
    currentCouncilError,
    unlockStats,
    unlockStatsLoading,
    unlockStatsError,
    validationFeePolicy,
    busy,
    refreshing,
    finalizedRefresh,
    listError,
    detailError,
    policyError,
    actionError,
    actionMessage,
    composerOpen,
    composerKind,
    supportedComposerKinds,
    validationFeeComposer,
    validationFeeComposerErrors,
    validationFeeActivationChoices,
    addValidationFeeMaintenanceTier,
    removeValidationFeeMaintenanceTier,
    review,
    bootstrap,
    refresh,
    loadCitizenState,
    loadGovernanceCitizenCount,
    loadCurrentCouncil,
    loadUnlockStats,
    loadProposals,
    selectProposal,
    refreshSelectedProposal,
    handleBondCitizen,
    openComposer,
    closeComposer,
    prepareProposal,
    cancelReview,
    confirmReview,
  };
});

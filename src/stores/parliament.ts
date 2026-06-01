import { computed, ref, watch } from "vue";
import { defineStore } from "pinia";
import { useAppI18n } from "@/composables/useAppI18n";
import {
  enactGovernanceProposal,
  fetchAccountAssets,
  finalizeGovernanceReferendum,
  getGovernanceCitizenCount,
  getGovernanceCitizenStatus,
  getGovernanceCouncilCurrent,
  getGovernanceLifecycle,
  getGovernanceLocks,
  getGovernanceProposal,
  getGovernanceRegistrationPolicy,
  getGovernanceReferendum,
  getGovernanceTally,
  getGovernanceUnlockStats,
  listAccountPermissions,
  proposeGovernanceDeployContract,
  registerCitizen,
  submitGovernancePlainBallot,
} from "@/services/iroha";
import { useSessionStore } from "@/stores/session";
import { getPublicAccountId } from "@/utils/accountId";
import type {
  AccountPermissionItem,
  GovernanceActionGate,
  GovernanceBallotDirection,
  GovernanceCitizenCountResponse,
  GovernanceCitizenStatusResponse,
  GovernanceCouncilCurrentResponse,
  GovernanceDraftResponse,
  GovernanceLifecycleSnapshot,
  GovernanceLifecycleStageId,
  GovernanceLocksResult,
  GovernanceProposalResult,
  GovernanceRegistrationPolicyResponse,
  GovernanceReferendumResult,
  GovernanceTallyResult,
  GovernanceUnlockStatsResponse,
} from "@/types/iroha";
import { compareDecimalStrings } from "@/utils/staking";
import {
  CITIZEN_BOND_XOR,
  canonicalizeProposalId,
  extractProposalIdFromReferendum,
  hasGovernancePermission,
  isPositiveInteger,
  isPositiveWholeNumberString,
  isRegisteredGovernanceCitizen,
  isValidProposalId,
  parseParliamentHistory,
  pushRecentValue,
  resolveGovernanceBondBalance,
  resolveGovernanceCitizenCount,
  sanitizeReferendumId,
} from "@/utils/parliament";
import {
  buildFallbackGovernanceLifecycle,
  makeGovernanceActionGate,
  resolveGovernanceRole,
  roleLabelKey,
} from "@/utils/parliamentLifecycle";
import { toUserFacingErrorMessage } from "@/utils/errorMessage";
import {
  appendTransactionFee,
  formatTransactionFee,
  transactionFeeHintForEndpoint,
} from "@/utils/transactionFee";

type ActionMode = "bond" | "ballot" | "proposal" | "finalize" | "enact";
type DeployTargetKind = "address" | "alias";

export const useParliamentStore = defineStore("parliament", () => {
  const session = useSessionStore();
  const { localeStore, t } = useAppI18n();

  const activeAccount = computed(() => session.activeAccount);
  const activeAccountDisplayId = computed(() =>
    getPublicAccountId(activeAccount.value, session.connection.networkPrefix),
  );
  const requestAccountId = computed(
    () => activeAccountDisplayId.value || activeAccount.value?.accountId || "",
  );
  const toriiUrl = computed(() => session.connection.toriiUrl);
  const chainId = computed(() => session.connection.chainId);
  const assetDefinitionId = computed(
    () => session.connection.assetDefinitionId,
  );

  const loadingBootstrap = ref(false);
  const permissionsLoaded = ref(false);
  const lookupLoading = ref(false);
  const actionBusy = ref<ActionMode | null>(null);
  const selectedStageId = ref<GovernanceLifecycleStageId>("submitted");
  const activePanel = ref<"summary" | "stage" | "actions">("summary");

  const statusMessage = ref("");
  const actionMessage = ref("");
  const errorMessage = ref("");

  const xorBalance = ref("0");
  const permissions = ref<AccountPermissionItem[]>([]);
  const citizenshipStatus = ref<GovernanceCitizenStatusResponse | null>(null);
  const citizenCountStatus = ref<GovernanceCitizenCountResponse | null>(null);
  const council = ref<GovernanceCouncilCurrentResponse | null>(null);
  const unlockStats = ref<GovernanceUnlockStatsResponse | null>(null);
  const governanceRegistrationPolicy =
    ref<GovernanceRegistrationPolicyResponse | null>(null);

  const referendumId = ref("");
  const proposalId = ref("");
  const ballotAmount = ref(CITIZEN_BOND_XOR);
  const durationBlocks = ref(7_200);
  const direction = ref<GovernanceBallotDirection>("Aye");
  const deployTargetKind = ref<DeployTargetKind>("address");
  const deployTargetValue = ref("");
  const deployCodeHash = ref("");
  const deployAbiHash = ref("");
  const deployAbiVersion = ref("1");
  const deployVotingMode = ref<"Plain" | "Zk">("Plain");
  const deployWindowLower = ref("");
  const deployWindowUpper = ref("");
  const deployLimitsJson = ref("");
  const recentReferenda = ref<string[]>([]);
  const recentProposals = ref<string[]>([]);

  const referendum = ref<GovernanceReferendumResult | null>(null);
  const proposal = ref<GovernanceProposalResult | null>(null);
  const tally = ref<GovernanceTallyResult | null>(null);
  const locks = ref<GovernanceLocksResult | null>(null);
  const lifecycleFromEndpoint = ref<GovernanceLifecycleSnapshot | null>(null);
  const lifecycleEndpointUnavailable = ref(false);
  const deployProposalDraft = ref<GovernanceDraftResponse | null>(null);
  const finalizeDraft = ref<GovernanceDraftResponse | null>(null);
  const enactDraft = ref<GovernanceDraftResponse | null>(null);
  const loadedReferendumInput = ref<string | null>(null);
  const loadedProposalInput = ref<string | null>(null);
  const lookupGeneration = ref(0);
  const refreshGeneration = ref(0);

  const canSubmit = computed(() =>
    Boolean(toriiUrl.value && chainId.value && requestAccountId.value),
  );
  const isActionBusy = computed(() => actionBusy.value !== null);
  const hasBallotPermissionToken = computed(() =>
    hasGovernancePermission(permissions.value, "CanSubmitGovernanceBallot"),
  );
  const hasCitizenRecord = computed(() =>
    isRegisteredGovernanceCitizen(citizenshipStatus.value),
  );
  const hasBallotPermission = computed(
    () => hasBallotPermissionToken.value || hasCitizenRecord.value,
  );
  const hasParliamentPermission = computed(() =>
    hasGovernancePermission(permissions.value, "CanManageParliament"),
  );
  const hasEnactPermission = computed(() =>
    hasGovernancePermission(permissions.value, "CanEnactGovernance"),
  );
  const hasOperatorRole = computed(
    () => hasParliamentPermission.value || hasEnactPermission.value,
  );
  const lockCount = computed(
    () => Object.keys(locks.value?.locks ?? {}).length,
  );
  const trimmedReferendumId = computed(() => referendumId.value.trim());
  const proposalLiteral = computed(() => proposalId.value.trim());
  const canonicalProposalId = computed(() =>
    proposalLiteral.value
      ? canonicalizeProposalId(proposalLiteral.value)
      : null,
  );
  const proposalIdFormatError = computed(
    () => Boolean(proposalLiteral.value) && !canonicalProposalId.value,
  );
  const ballotAmountLiteral = computed(() => ballotAmount.value.trim());
  const hasValidBallotAmount = computed(() =>
    isPositiveWholeNumberString(ballotAmountLiteral.value),
  );
  const hasXorForBallot = computed(() => {
    if (!hasValidBallotAmount.value) return false;
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
  const deployTargetLiteral = computed(() => deployTargetValue.value.trim());
  const deployCodeHashLiteral = computed(() => deployCodeHash.value.trim());
  const deployAbiHashLiteral = computed(() => deployAbiHash.value.trim());
  const deployAbiVersionLiteral = computed(
    () => deployAbiVersion.value.trim() || "1",
  );
  const deployWindowLowerLiteral = computed(() =>
    deployWindowLower.value.trim(),
  );
  const deployWindowUpperLiteral = computed(() =>
    deployWindowUpper.value.trim(),
  );
  const deployWindowHasLower = computed(() =>
    Boolean(deployWindowLowerLiteral.value),
  );
  const deployWindowHasUpper = computed(() =>
    Boolean(deployWindowUpperLiteral.value),
  );
  const deployWindowError = computed(() => {
    if (deployWindowHasLower.value !== deployWindowHasUpper.value) {
      return t("Set both window bounds or leave both empty.");
    }
    if (!deployWindowHasLower.value) return "";
    if (
      !isPositiveWholeNumberString(deployWindowLowerLiteral.value) ||
      !isPositiveWholeNumberString(deployWindowUpperLiteral.value)
    ) {
      return t("Voting window bounds must be positive whole numbers.");
    }
    const lower = Number(deployWindowLowerLiteral.value);
    const upper = Number(deployWindowUpperLiteral.value);
    if (!Number.isSafeInteger(lower) || !Number.isSafeInteger(upper)) {
      return t("Voting window bounds must be positive whole numbers.");
    }
    if (lower > upper) {
      return t(
        "Voting window lower bound must be less than or equal to the upper bound.",
      );
    }
    return "";
  });
  const deployWindowPayload = computed(() => {
    if (deployWindowError.value || !deployWindowHasLower.value) return null;
    return {
      lower: Number(deployWindowLowerLiteral.value),
      upper: Number(deployWindowUpperLiteral.value),
    };
  });
  const deployLimitsError = computed(() => {
    const literal = deployLimitsJson.value.trim();
    if (!literal) return "";
    try {
      const parsed = JSON.parse(literal);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return t("Limits JSON must be a JSON object.");
      }
    } catch (_error) {
      return t("Invalid limits JSON.");
    }
    return "";
  });
  const deployLimitsPayload = computed(() => {
    const literal = deployLimitsJson.value.trim();
    if (!literal || deployLimitsError.value) return null;
    return JSON.parse(literal) as Record<string, unknown>;
  });
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
  const citizenshipAssetDefinitionId = computed(
    () =>
      governanceRegistrationPolicy.value?.citizenshipAssetDefinitionId ?? "",
  );
  const citizenshipBondAmount = computed(
    () =>
      governanceRegistrationPolicy.value?.citizenshipBondAmount ??
      CITIZEN_BOND_XOR,
  );
  const citizenshipAssetDefinitionMissingMessage = computed(() => {
    if (
      !citizenshipAssetDefinitionId.value ||
      governanceRegistrationPolicy.value?.citizenshipAssetDefinitionExists !==
        false
    ) {
      return "";
    }
    return `Citizenship bonding is blocked because this Torii endpoint is configured to use missing governance citizenship asset definition ${citizenshipAssetDefinitionId.value}. Ask the endpoint operator to register that asset definition or set GOV_CITIZENSHIP_ASSET_ID to the live XOR asset definition.`;
  });
  const hasXorForBond = computed(() => {
    try {
      return (
        compareDecimalStrings(xorBalance.value, citizenshipBondAmount.value) >=
        0
      );
    } catch (_error) {
      return false;
    }
  });

  const canBondCitizen = computed(
    () =>
      canSubmit.value &&
      hasXorForBond.value &&
      !alreadyCitizen.value &&
      !citizenshipAssetDefinitionMissingMessage.value &&
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
  const canPrepareDeployProposal = computed(
    () =>
      Boolean(toriiUrl.value) &&
      Boolean(deployTargetLiteral.value) &&
      Boolean(deployCodeHashLiteral.value) &&
      Boolean(deployAbiHashLiteral.value) &&
      !deployWindowError.value &&
      !deployLimitsError.value &&
      !isActionBusy.value,
  );
  const canFinalizeDraft = computed(
    () =>
      Boolean(toriiUrl.value) &&
      Boolean(trimmedReferendumId.value) &&
      Boolean(canonicalProposalId.value) &&
      !missingParliamentPermission.value &&
      !isActionBusy.value,
  );
  const canEnactDraft = computed(
    () =>
      Boolean(toriiUrl.value) &&
      Boolean(canonicalProposalId.value) &&
      !missingEnactPermission.value &&
      !isActionBusy.value,
  );
  const canLookupGovernance = computed(
    () =>
      Boolean(toriiUrl.value) &&
      (Boolean(trimmedReferendumId.value) || Boolean(proposalLiteral.value)) &&
      (Boolean(trimmedReferendumId.value) || !proposalIdFormatError.value) &&
      !lookupLoading.value,
  );

  const citizenCount = computed(() =>
    resolveGovernanceCitizenCount(citizenCountStatus.value),
  );
  const citizenCountDisplay = computed(() => {
    if (citizenCount.value === null) return t("—");
    return new Intl.NumberFormat(localeStore.current).format(
      citizenCount.value,
    );
  });
  const citizenshipHeadline = computed(() => {
    if (loadingBootstrap.value && !permissionsLoaded.value) {
      return t("Checking citizenship…");
    }
    return alreadyCitizen.value
      ? t("You are a citizen")
      : t("Not a citizen yet");
  });
  const citizenshipPanelDetail = computed(() => {
    if (!canSubmit.value) {
      return t("Set up network and wallet first.");
    }
    if (alreadyCitizen.value) {
      const bondedAmount = citizenshipStatus.value?.amount?.trim();
      return bondedAmount
        ? t("Bonded {amount} XOR", { amount: bondedAmount })
        : t(
            "Citizenship voting permission detected. Bonding is no longer required.",
          );
    }
    return t("Bond {amount} XOR once to enable voting for this wallet.", {
      amount: citizenshipBondAmount.value,
    });
  });
  const governanceRole = computed(() =>
    resolveGovernanceRole({
      accountId: requestAccountId.value,
      council: council.value,
      hasCitizenRole: hasBallotPermission.value,
      hasOperatorRole: hasOperatorRole.value,
    }),
  );
  const governanceRoleLabel = computed(() =>
    t(roleLabelKey(governanceRole.value)),
  );
  const lifecycleSnapshot = computed(() => {
    if (lifecycleFromEndpoint.value) {
      return lifecycleFromEndpoint.value;
    }
    return buildFallbackGovernanceLifecycle({
      referendumId: trimmedReferendumId.value || null,
      proposalId: canonicalProposalId.value,
      proposalFound: proposal.value?.found === true,
      referendumFound: referendum.value?.found === true,
      hasTally: Boolean(tally.value?.tally),
      hasLocks: lockCount.value > 0,
      hasCouncil: Boolean(council.value),
      role: governanceRole.value,
    });
  });
  const lifecycleStages = computed(() => lifecycleSnapshot.value.stages);
  const activeLifecycleStage = computed(
    () =>
      lifecycleStages.value.find(
        (stage) => stage.id === selectedStageId.value,
      ) ?? lifecycleStages.value[0],
  );
  const selectedStageDetail = computed(() =>
    activeLifecycleStage.value ? t(activeLifecycleStage.value.detailKey) : "",
  );
  const lifecycleCapabilityMessage = computed(() =>
    lifecycleSnapshot.value.futureStagesUnavailable
      ? t(
          "Full adversarial lifecycle data is not available on this endpoint yet.",
        )
      : "",
  );
  const proposalSummaryTitle = computed(() => {
    if (proposal.value?.found) return t("Proposal loaded");
    if (referendum.value?.found) return t("Referendum loaded");
    if (trimmedReferendumId.value || proposalLiteral.value) {
      return t("No governance record loaded");
    }
    return t("Choose a referendum or proposal");
  });
  const proposalSummaryDetail = computed(() => {
    if (proposal.value?.found || referendum.value?.found) {
      return t("Review the active stage, then vote or open advanced tools.");
    }
    return t(
      "Load a referendum or proposal to assemble the available lifecycle data.",
    );
  });
  const bondFeeLabel = computed(() =>
    formatTransactionFee(transactionFeeHintForEndpoint(toriiUrl.value), t),
  );
  const ballotFeeLabel = bondFeeLabel;

  const gate = (
    enabled: boolean,
    code: GovernanceActionGate["code"],
    reason: string,
  ) => makeGovernanceActionGate(enabled, code, reason);

  const bondGate = computed(() => {
    if (canBondCitizen.value) return gate(true, "ready", "");
    if (isActionBusy.value)
      return gate(false, "busy", t("Action in progress."));
    if (!canSubmit.value) {
      return gate(
        false,
        "wallet-required",
        t("Set up network and wallet first."),
      );
    }
    if (alreadyCitizen.value) {
      return gate(
        false,
        "already-citizen",
        t(
          "Citizenship voting permission detected. Bonding is no longer required.",
        ),
      );
    }
    if (citizenshipAssetDefinitionMissingMessage.value) {
      return gate(
        false,
        "missing-backend-capability",
        citizenshipAssetDefinitionMissingMessage.value,
      );
    }
    if (!hasXorForBond.value) {
      return gate(
        false,
        "insufficient-bond",
        t("Available XOR balance is below the required citizen bond amount."),
      );
    }
    return gate(false, "endpoint-unavailable", t("Bonding is unavailable."));
  });

  const ballotGate = computed(() => {
    if (canSubmitBallot.value) return gate(true, "ready", "");
    if (isActionBusy.value)
      return gate(false, "busy", t("Action in progress."));
    if (!canSubmit.value) {
      return gate(
        false,
        "wallet-required",
        t("Set up network and wallet first."),
      );
    }
    if (!trimmedReferendumId.value) {
      return gate(
        false,
        "missing-referendum",
        t("Load or enter a referendum before voting."),
      );
    }
    if (missingBallotPermission.value) {
      return gate(
        false,
        "missing-permission",
        t(
          "Ballot permission is missing on this account. Submit the citizenship bond and refresh before voting.",
        ),
      );
    }
    if (!hasValidBallotAmount.value) {
      return gate(
        false,
        "invalid-amount",
        t("Ballot amount must be a whole number greater than zero."),
      );
    }
    if (!hasXorForBallot.value) {
      return gate(
        false,
        "invalid-amount",
        t("Ballot amount exceeds the available XOR balance."),
      );
    }
    if (!hasValidDurationBlocks.value) {
      return gate(
        false,
        "invalid-duration",
        t("Lock duration must be a positive integer number of blocks."),
      );
    }
    return gate(false, "endpoint-unavailable", t("Voting is unavailable."));
  });

  const stageBallotGate = computed(() =>
    gate(
      false,
      "missing-backend-capability",
      t("Parliament stage ballots are not available on this endpoint yet."),
    ),
  );

  const finalizeGate = computed(() => {
    if (canFinalizeDraft.value) return gate(true, "ready", "");
    if (missingParliamentPermission.value) {
      return gate(
        false,
        "missing-permission",
        t("Finalize requires CanManageParliament permission."),
      );
    }
    if (!trimmedReferendumId.value || !canonicalProposalId.value) {
      return gate(
        false,
        "invalid-proposal",
        t("referendumId and proposalId are required for finalize."),
      );
    }
    return gate(false, "busy", t("Action in progress."));
  });

  const enactGate = computed(() => {
    if (canEnactDraft.value) return gate(true, "ready", "");
    if (missingEnactPermission.value) {
      return gate(
        false,
        "missing-permission",
        t("Enact requires CanEnactGovernance permission."),
      );
    }
    if (!canonicalProposalId.value) {
      return gate(
        false,
        "invalid-proposal",
        t("proposalId is required for enact."),
      );
    }
    return gate(false, "busy", t("Action in progress."));
  });

  const nextActionLabel = computed(() => {
    if (!canSubmit.value) return t("Create or restore a wallet");
    if (!alreadyCitizen.value) return t("Bond citizenship");
    if (!trimmedReferendumId.value) return t("Load proposal");
    if (canSubmitBallot.value) return t("Submit ballot");
    return t("Review voting requirements");
  });
  const nextActionReason = computed(() => {
    if (!alreadyCitizen.value) return bondGate.value.reason;
    return ballotGate.value.reason || t("Ready for governance actions.");
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
    lifecycleFromEndpoint.value = null;
    lifecycleEndpointUnavailable.value = false;
    deployProposalDraft.value = null;
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
    if (!historyStorageKey.value) return;
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
    if (canLookupGovernance.value) await lookupGovernance();
  };

  const applyRecentProposal = async (value: string) => {
    proposalId.value = value;
    if (canLookupGovernance.value) await lookupGovernance();
  };

  const shortenIdentifier = (value: string) => {
    if (value.length <= 22) return value;
    return `${value.slice(0, 10)}...${value.slice(-10)}`;
  };

  const refresh = async () => {
    const requestToriiUrl = toriiUrl.value;
    const accountId = requestAccountId.value;
    if (!requestToriiUrl || !accountId) {
      refreshGeneration.value += 1;
      loadingBootstrap.value = false;
      errorMessage.value = "";
      statusMessage.value = t("Set up network and wallet first.");
      permissionsLoaded.value = false;
      permissions.value = [];
      citizenshipStatus.value = null;
      citizenCountStatus.value = null;
      council.value = null;
      unlockStats.value = null;
      governanceRegistrationPolicy.value = null;
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
      const [
        assetsResult,
        permissionsResult,
        citizenCountResult,
        councilResult,
        unlockStatsResult,
        policyResult,
        citizenshipResult,
      ] = await Promise.allSettled([
        fetchAccountAssets({
          toriiUrl: requestToriiUrl,
          accountId,
          networkPrefix: session.connection.networkPrefix,
          limit: 200,
        }),
        listAccountPermissions({
          toriiUrl: requestToriiUrl,
          accountId,
          limit: 200,
        }),
        getGovernanceCitizenCount(requestToriiUrl),
        getGovernanceCouncilCurrent(requestToriiUrl),
        getGovernanceUnlockStats(requestToriiUrl),
        getGovernanceRegistrationPolicy(requestToriiUrl),
        getGovernanceCitizenStatus({
          toriiUrl: requestToriiUrl,
          accountId,
        }),
      ] as const);

      if (
        requestGeneration !== refreshGeneration.value ||
        toriiUrl.value !== requestToriiUrl ||
        requestAccountId.value !== accountId
      ) {
        return;
      }

      if (assetsResult.status === "rejected") throw assetsResult.reason;
      if (permissionsResult.status === "rejected") {
        throw permissionsResult.reason;
      }

      const nextPolicy =
        policyResult.status === "fulfilled" ? policyResult.value : null;
      xorBalance.value = resolveGovernanceBondBalance(
        assetsResult.value.items,
        nextPolicy?.citizenshipAssetDefinitionId,
        [assetDefinitionId.value],
      );
      permissionsLoaded.value = true;
      permissions.value = permissionsResult.value.items;
      citizenshipStatus.value =
        citizenshipResult.status === "fulfilled"
          ? citizenshipResult.value
          : null;
      citizenCountStatus.value =
        citizenCountResult.status === "fulfilled"
          ? citizenCountResult.value
          : null;
      council.value =
        councilResult.status === "fulfilled" ? councilResult.value : null;
      unlockStats.value =
        unlockStatsResult.status === "fulfilled"
          ? unlockStatsResult.value
          : null;
      governanceRegistrationPolicy.value = nextPolicy;
      const loadedStatus = t("Loaded {count} permission token(s).", {
        count: permissionsResult.value.total,
      });
      statusMessage.value = hasCitizenRecord.value
        ? `${loadedStatus} ${t("Citizenship registered.")}`
        : loadedStatus;
      const optionalErrors: string[] = [];
      for (const result of [
        citizenCountResult,
        councilResult,
        unlockStatsResult,
        policyResult,
        citizenshipResult,
      ]) {
        if (result.status === "rejected") {
          optionalErrors.push(
            toUserFacingErrorMessage(
              result.reason,
              t("Failed to load governance state."),
            ),
          );
        }
      }
      if (optionalErrors.length) {
        errorMessage.value = optionalErrors.join("\n");
      }
    } catch (error) {
      if (requestGeneration !== refreshGeneration.value) return;
      permissionsLoaded.value = false;
      permissions.value = [];
      citizenshipStatus.value = null;
      citizenCountStatus.value = null;
      council.value = null;
      unlockStats.value = null;
      governanceRegistrationPolicy.value = null;
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
    if (!toriiUrl.value) {
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
    const requestToriiUrl = toriiUrl.value;
    lookupGeneration.value = requestGeneration;
    lookupLoading.value = true;
    statusMessage.value = "";
    errorMessage.value = "";
    lifecycleFromEndpoint.value = null;
    lifecycleEndpointUnavailable.value = false;

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
        const [referendumPayload, tallyPayload, lockPayload] =
          await Promise.all([
            getGovernanceReferendum({
              toriiUrl: requestToriiUrl,
              referendumId: referendumLiteral,
            }),
            getGovernanceTally({
              toriiUrl: requestToriiUrl,
              referendumId: referendumLiteral,
            }),
            getGovernanceLocks({
              toriiUrl: requestToriiUrl,
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
          toriiUrl: requestToriiUrl,
          proposalId: lookupProposalId,
        });
        if (!proposalLiteralNormalized) {
          nextProposalField = lookupProposalId;
        }
      }

      let endpointLifecycle: GovernanceLifecycleSnapshot | null = null;
      try {
        endpointLifecycle = await getGovernanceLifecycle({
          toriiUrl: requestToriiUrl,
          referendumId: referendumLiteral || null,
          proposalId: lookupProposalId,
        });
      } catch (_error) {
        lifecycleEndpointUnavailable.value = true;
      }

      if (
        requestGeneration !== lookupGeneration.value ||
        toriiUrl.value !== requestToriiUrl ||
        trimmedReferendumId.value !== referendumLiteral ||
        proposalLiteral.value !== proposalLiteralInput
      ) {
        return;
      }

      const finalReferendumInput = referendumLiteral || null;
      const finalProposalInput =
        (canonicalizeProposalId(nextProposalField) ?? nextProposalField) ||
        null;
      loadedReferendumInput.value = finalReferendumInput;
      loadedProposalInput.value = finalProposalInput;

      referendum.value = nextReferendum;
      tally.value = nextTally;
      locks.value = nextLocks;
      proposal.value = nextProposal;
      lifecycleFromEndpoint.value = endpointLifecycle;
      if (nextProposalField !== proposalLiteralInput) {
        proposalId.value = nextProposalField;
      }

      rememberHistory({
        referendumId: referendumLiteral || null,
        proposalId: lookupProposalId,
      });
      selectedStageId.value =
        endpointLifecycle?.currentStageId ??
        lifecycleSnapshot.value.currentStageId;
      activePanel.value = "stage";
      statusMessage.value =
        referendumLiteral && proposalInputWasInvalid
          ? t("Governance records refreshed. Invalid proposal ID was ignored.")
          : t("Governance records refreshed.");
    } catch (error) {
      if (requestGeneration !== lookupGeneration.value) return;
      referendum.value = null;
      proposal.value = null;
      tally.value = null;
      locks.value = null;
      lifecycleFromEndpoint.value = null;
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

  const runAction = async (mode: ActionMode, run: () => Promise<string>) => {
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
        throw new Error(
          t("Connection, chain, and active account are required."),
        );
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
            amount: citizenshipBondAmount.value,
          }),
        );
      }
      if (citizenshipAssetDefinitionMissingMessage.value) {
        throw new Error(citizenshipAssetDefinitionMissingMessage.value);
      }
      const result = await registerCitizen({
        toriiUrl: toriiUrl.value,
        chainId: chainId.value,
        accountId: requestAccountId.value,
        amount: citizenshipBondAmount.value,
        privateKeyHex: activeAccount.value.privateKeyHex,
      });
      await refresh();
      return appendTransactionFee(
        t("Citizenship bond submitted: {hash}", { hash: result.hash }),
        result,
        t,
        transactionFeeHintForEndpoint(toriiUrl.value),
      );
    });

  const handleDeployProposalDraft = () =>
    runAction("proposal", async () => {
      if (!toriiUrl.value) throw new Error(t("Torii connection is required."));
      if (
        !deployTargetLiteral.value ||
        !deployCodeHashLiteral.value ||
        !deployAbiHashLiteral.value
      ) {
        throw new Error(
          t("Enter a contract target, code hash, and ABI hash first."),
        );
      }
      if (deployWindowError.value) throw new Error(deployWindowError.value);
      if (deployLimitsError.value) throw new Error(deployLimitsError.value);
      deployProposalDraft.value = await proposeGovernanceDeployContract({
        toriiUrl: toriiUrl.value,
        contractAddress:
          deployTargetKind.value === "address"
            ? deployTargetLiteral.value
            : null,
        contractAlias:
          deployTargetKind.value === "alias" ? deployTargetLiteral.value : null,
        codeHash: deployCodeHashLiteral.value,
        abiHash: deployAbiHashLiteral.value,
        abiVersion: deployAbiVersionLiteral.value,
        mode: deployVotingMode.value,
        window: deployWindowPayload.value,
        limits: deployLimitsPayload.value,
      });
      if (deployProposalDraft.value.proposal_id) {
        const normalizedProposalId = canonicalizeProposalId(
          deployProposalDraft.value.proposal_id,
        );
        if (normalizedProposalId) {
          proposalId.value = normalizedProposalId;
          rememberHistory({ proposalId: normalizedProposalId });
        }
      }
      return t("Proposal draft prepared with {count} instruction(s).", {
        count: deployProposalDraft.value.tx_instructions.length,
      });
    });

  const handleBallot = () =>
    runAction("ballot", async () => {
      if (!canSubmit.value || !activeAccount.value || !requestAccountId.value) {
        throw new Error(
          t("Connection, chain, and active account are required."),
        );
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
        toriiUrl: toriiUrl.value,
        chainId: chainId.value,
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
        transactionFeeHintForEndpoint(toriiUrl.value),
      );
    });

  const handleFinalize = () =>
    runAction("finalize", async () => {
      if (!toriiUrl.value) throw new Error(t("Torii connection is required."));
      if (missingParliamentPermission.value) {
        throw new Error(
          t("CanManageParliament permission is required for finalize."),
        );
      }
      const referendumLiteral = trimmedReferendumId.value;
      const proposalLiteralInput = proposalId.value.trim();
      const proposalLiteralNormalized = canonicalProposalId.value;
      if (!referendumLiteral || !proposalLiteralInput) {
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
        toriiUrl: toriiUrl.value,
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
      if (!toriiUrl.value) throw new Error(t("Torii connection is required."));
      if (missingEnactPermission.value) {
        throw new Error(
          t("CanEnactGovernance permission is required for enact."),
        );
      }
      const proposalLiteralInput = proposalId.value.trim();
      const proposalLiteralNormalized = canonicalProposalId.value;
      if (!proposalLiteralInput) {
        throw new Error(t("proposalId is required for enact."));
      }
      if (!proposalLiteralNormalized) {
        throw new Error(
          t("Proposal ID must be 32-byte hex (with or without 0x prefix)."),
        );
      }
      enactDraft.value = await enactGovernanceProposal({
        toriiUrl: toriiUrl.value,
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
        lifecycleFromEndpoint.value = null;
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
      deployTargetKind.value,
      deployTargetLiteral.value,
      deployCodeHashLiteral.value,
      deployAbiHashLiteral.value,
      deployAbiVersionLiteral.value,
      deployVotingMode.value,
      deployWindowLowerLiteral.value,
      deployWindowUpperLiteral.value,
      deployLimitsJson.value.trim(),
    ],
    () => {
      deployProposalDraft.value = null;
    },
  );

  watch(
    () => [toriiUrl.value, chainId.value, requestAccountId.value],
    () => {
      refresh();
    },
    { immediate: true },
  );

  return {
    activeAccount,
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
    citizenshipAssetDefinitionMissingMessage,
    citizenshipBondAmount,
    citizenshipHeadline,
    citizenshipPanelDetail,
    clearHistory,
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
    governanceRole,
    governanceRoleLabel,
    handleBallot,
    handleBondCitizen,
    handleDeployProposalDraft,
    handleEnact,
    handleFinalize,
    hasBallotPermission,
    hasCitizenRecord,
    hasEnactPermission,
    hasParliamentPermission,
    hasValidBallotAmount,
    hasValidDurationBlocks,
    hasXorForBallot,
    hasXorForBond,
    lifecycleCapabilityMessage,
    lifecycleEndpointUnavailable,
    lifecycleSnapshot,
    lifecycleStages,
    loadingBootstrap,
    lockCount,
    locks,
    lookupGovernance,
    lookupLoading,
    missingBallotPermission,
    missingEnactPermission,
    missingParliamentPermission,
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
    refresh,
    requestAccountId,
    selectedStageDetail,
    selectedStageId,
    shortenIdentifier,
    stageBallotGate,
    statusMessage,
    actionBusy,
    actionMessage,
    summarizeDraft,
    tally,
    toriiUrl,
    unlockStats,
    xorBalance,
    applyRecentProposal,
    applyRecentReferendum,
  };
});

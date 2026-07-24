import { computed, ref, watch } from "vue";
import { defineStore } from "pinia";
import { useAppI18n } from "@/composables/useAppI18n";
import {
  GOVERNANCE_PROPOSAL_REVIEW_SAFETY_MARGIN_BLOCKS,
  GOVERNANCE_KIND_ADAPTERS,
  GOVERNANCE_PARLIAMENT_BODIES,
  canonicalGovernanceProposalId,
  canonicalValidationFeeHash,
  isAccountInParliamentRoster,
  isCanonicalUnsignedDecimal,
  isEnactActionable,
  isReferendumPlainVoteOpen,
  plainBallotLockCoversReferendum,
  rebaseGovernanceReferendumWindow,
  validateValidationFeePolicy,
  validationFeePolicyEffectiveHeight,
  validationFeePolicyEnactmentTiming,
  type GovernanceParliamentDecision,
  type GovernanceProposalDetail,
  type GovernanceProposalSummary,
  type GovernanceWritableProposalKindId,
  type ValidationFeePolicyPayload,
} from "@/governance/model";
import {
  confirmGovernanceAction,
  fetchAccountAssets,
  getGovernanceCapabilities,
  getGovernanceCitizenStatus,
  getGovernanceCurrentValidationFeePolicy,
  getGovernanceProposalDetail,
  listGovernanceProposals,
  prepareGovernanceCitizenRegistration,
  prepareGovernanceEnact,
  prepareGovernanceParliamentBallot,
  prepareGovernancePlainBallot,
  prepareGovernanceProposal,
} from "@/services/iroha";
import { useSessionStore } from "@/stores/session";
import type {
  GovernanceBallotDirection,
  GovernanceCapabilitiesV1,
  GovernanceCitizenStatusResponse,
  GovernancePreparedAction,
  GovernanceValidationFeePolicyView,
} from "@/types/iroha";
import { getPublicAccountId } from "@/utils/accountId";
import { toUserFacingErrorMessage } from "@/utils/errorMessage";
import { resolveGovernanceBondBalance } from "@/utils/parliament";
import { compareDecimalStrings } from "@/utils/staking";

export type GovernanceCatalogFilter = "open" | "all" | "mine";
export type GovernanceBusyAction =
  | "bootstrap"
  | "list"
  | "detail"
  | "bond"
  | "prepare"
  | "commit"
  | null;

export interface GovernanceActionGate {
  allowed: boolean;
  reason: string;
}

const emptyHash = "";
const CBSI_SBD_ASSET_ID = "7ZepsJTHCVLKsrFFNZGSRGZgvBhv";

const emptyValidationFeePolicy = (): ValidationFeePolicyPayload => ({
  schema_version: 1,
  chain_id: "",
  genesis_hash: emptyHash,
  policy_version: "1",
  previous_policy_hash: null,
  ds_asset_id: "",
  ds_scale: 2,
  fee: "0.10",
  treasury_account_id: "",
  charging_mode: {
    charging_mode: "PER_QUALIFYING_TRANSFER_INSTRUCTION",
    value: null,
  },
  effective_from_height: "",
  expires_after_height: null,
  exemption_classes: [],
  treasury_payout_binding: null,
});

const stringValue = (
  record: Record<string, unknown> | null | undefined,
  ...keys: string[]
) => {
  for (const key of keys) {
    const value = record?.[key];
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "bigint"
    ) {
      return String(value).trim();
    }
  }
  return "";
};

const integerAfter = (value: string) => {
  try {
    return (BigInt(value || "0") + 1n).toString();
  } catch {
    return "1";
  }
};

const parseJsonRecord = (literal: string, label: string) => {
  let value: unknown;
  try {
    value = JSON.parse(literal);
  } catch {
    throw new Error(`${label} must be valid JSON.`);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return value as Record<string, unknown>;
};

const optionalWindow = (lower: string, upper: string) => {
  const normalizedLower = lower.trim();
  const normalizedUpper = upper.trim();
  if (!normalizedLower && !normalizedUpper) return undefined;
  if (!/^\d+$/u.test(normalizedLower) || !/^\d+$/u.test(normalizedUpper)) {
    throw new Error("Voting window heights must be whole numbers.");
  }
  if (BigInt(normalizedUpper) < BigInt(normalizedLower)) {
    throw new Error("Voting window end must not be before its start.");
  }
  const maxU64 = (1n << 64n) - 1n;
  if (BigInt(normalizedLower) > maxU64 || BigInt(normalizedUpper) > maxU64) {
    throw new Error("Voting window heights exceed the unsigned 64-bit range.");
  }
  return { lower: normalizedLower, upper: normalizedUpper };
};

export const useParliamentStore = defineStore("parliament", () => {
  const session = useSessionStore();
  const { t } = useAppI18n();

  const activeAccount = computed(() => session.activeAccount);
  const accountId = computed(() =>
    getPublicAccountId(activeAccount.value, session.connection.networkPrefix),
  );
  const toriiUrl = computed(() => session.connection.toriiUrl.trim());
  const chainId = computed(() => session.connection.chainId.trim());
  const capabilities = ref<GovernanceCapabilitiesV1 | null>(null);
  const capabilitiesError = ref("");
  const canWrite = computed(
    () =>
      Boolean(toriiUrl.value && chainId.value && accountId.value) &&
      capabilities.value?.chainId === chainId.value &&
      capabilities.value.networkPrefix === session.connection.networkPrefix &&
      !capabilitiesError.value,
  );

  const catalogFilter = ref<GovernanceCatalogFilter>("open");
  const proposals = ref<GovernanceProposalSummary[]>([]);
  const nextCursor = ref<string | null>(null);
  const selectedProposalId = ref<string | null>(null);
  const selectedProposal = ref<GovernanceProposalDetail | null>(null);
  const citizenStatus = ref<GovernanceCitizenStatusResponse | null>(null);
  const citizenshipBalance = ref("0");
  const citizenshipLoadError = ref("");
  const validationFeePolicy = ref<GovernanceValidationFeePolicyView | null>(
    null,
  );

  const busy = ref<GovernanceBusyAction>(null);
  const refreshing = ref(false);
  const committedRefresh = ref(false);
  const listError = ref("");
  const detailError = ref("");
  const policyError = ref("");
  const actionError = ref("");
  const actionMessage = ref("");

  const composerOpen = ref(false);
  const composerKind = ref<GovernanceWritableProposalKindId>(
    "ValidationFeePayoutLifecycle",
  );
  const validationFeeComposer = ref<ValidationFeePolicyPayload>(
    emptyValidationFeePolicy(),
  );
  const validationFeeExemptions = ref("TREASURY_PAYOUT");
  const validationFeePayoutBindingJson = ref("");
  const validationFeePayoutLifecycleProposalId = ref("");
  const validationFeeLifecycleWindowLower = ref("");
  const validationFeeLifecycleWindowUpper = ref("");
  const validationFeeWindowLower = ref("");
  const validationFeeWindowUpper = ref("");

  const ballotDirection = ref<GovernanceBallotDirection>("Aye");
  const ballotAmount = ref("1");
  const ballotDurationBlocks = ref("7200");
  const parliamentDecision = ref<GovernanceParliamentDecision>("approve");

  const review = ref<GovernancePreparedAction | null>(null);
  let listGeneration = 0;
  let detailGeneration = 0;
  let refreshPulseTimer: ReturnType<typeof setTimeout> | null = null;

  const selectedAdapter = computed(() =>
    selectedProposal.value
      ? GOVERNANCE_KIND_ADAPTERS[selectedProposal.value.kind.type]
      : null,
  );
  const selectedKindSupported = computed(() => {
    const kind = selectedProposal.value?.kind.type;
    if (kind === "ValidationFeePayoutLifecycle") {
      return (
        capabilities.value?.supportedProposalKinds.includes(
          "VALIDATION_FEE_PAYOUT_LIFECYCLE",
        ) === true
      );
    }
    if (kind === "ValidationFeePolicy") {
      return (
        capabilities.value?.supportedProposalKinds.includes(
          "VALIDATION_FEE_POLICY",
        ) === true
      );
    }
    return false;
  });
  const supportedComposerKinds = computed<GovernanceWritableProposalKindId[]>(
    () => {
      if (!capabilities.value) return [];
      return [
        ...(capabilities.value.supportedProposalKinds.includes(
          "VALIDATION_FEE_PAYOUT_LIFECYCLE",
        )
          ? (["ValidationFeePayoutLifecycle"] as const)
          : []),
        ...(capabilities.value.supportedProposalKinds.includes(
          "VALIDATION_FEE_POLICY",
        )
          ? (["ValidationFeePolicy"] as const)
          : []),
      ];
    },
  );
  const isCitizen = computed(() => citizenStatus.value?.isCitizen === true);
  const citizenshipBondAmount = computed(
    () => capabilities.value?.citizenshipBondAmount ?? "",
  );
  const citizenshipAssetDefinitionId = computed(
    () => capabilities.value?.citizenshipAssetId ?? "",
  );
  const hasCitizenshipBondBalance = computed(() => {
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
      Boolean(capabilities.value) &&
      !isCitizen.value &&
      hasCitizenshipBondBalance.value &&
      !citizenshipLoadError.value &&
      busy.value === null,
  );
  const bondGate = computed<GovernanceActionGate>(() => {
    if (canBondCitizen.value) return { allowed: true, reason: "" };
    if (!canWrite.value) {
      return {
        allowed: false,
        reason:
          capabilitiesError.value ||
          t("Connect the reviewed Taira network and wallet first."),
      };
    }
    if (isCitizen.value) {
      return {
        allowed: false,
        reason: t(
          "Citizenship voting permission detected. Bonding is no longer required.",
        ),
      };
    }
    if (citizenshipLoadError.value) {
      return { allowed: false, reason: citizenshipLoadError.value };
    }
    if (!hasCitizenshipBondBalance.value) {
      return {
        allowed: false,
        reason: t(
          "Available XOR balance is below the required citizen bond amount.",
        ),
      };
    }
    return { allowed: false, reason: t("Action in progress.") };
  });

  const plainVoteGate = computed<GovernanceActionGate>(() => {
    const detail = selectedProposal.value;
    if (!detail) {
      return { allowed: false, reason: t("Select a proposal first.") };
    }
    if (detail.kind.type === "Unknown") {
      return {
        allowed: false,
        reason: t("Unknown proposal kinds are inspect-only."),
      };
    }
    if (!selectedKindSupported.value) {
      return {
        allowed: false,
        reason: t(
          "This proposal kind is not advertised by Taira and remains inspect-only.",
        ),
      };
    }
    if (detail.referendum?.mode === "Zk") {
      return {
        allowed: false,
        reason: t(
          "ZK voting is unavailable in this release. This action fails closed.",
        ),
      };
    }
    if (!isCitizen.value) {
      return {
        allowed: false,
        reason: t("A current citizen bond is required to vote."),
      };
    }
    if (!isReferendumPlainVoteOpen(detail)) {
      return {
        allowed: false,
        reason: t("The plain citizen voting window is not open."),
      };
    }
    if (
      !isCanonicalUnsignedDecimal(ballotAmount.value.trim()) ||
      !/^[1-9]\d*$/u.test(ballotDurationBlocks.value.trim())
    ) {
      return {
        allowed: false,
        reason: t("Enter a positive ballot amount and lock duration."),
      };
    }
    try {
      if (
        compareDecimalStrings(
          ballotAmount.value.trim(),
          capabilities.value?.minBondAmount ?? "",
        ) < 0
      ) {
        return {
          allowed: false,
          reason: t("Ballot amount is below the network minimum bond."),
        };
      }
    } catch {
      return {
        allowed: false,
        reason: t("Governance capabilities are unavailable."),
      };
    }
    if (
      !plainBallotLockCoversReferendum(
        detail,
        ballotDurationBlocks.value.trim(),
      )
    ) {
      return {
        allowed: false,
        reason: t("Ballot lock duration must cover the referendum end height."),
      };
    }
    return { allowed: canWrite.value, reason: "" };
  });

  const parliamentBallotGateForBody = (body: string): GovernanceActionGate => {
    const detail = selectedProposal.value;
    if (!detail || !body) {
      return {
        allowed: false,
        reason: t("Select a proposal and Parliament body first."),
      };
    }
    if (detail.kind.type === "Unknown") {
      return {
        allowed: false,
        reason: t("Unknown proposal kinds are inspect-only."),
      };
    }
    if (!selectedKindSupported.value) {
      return {
        allowed: false,
        reason: t(
          "This proposal kind is not advertised by Taira and remains inspect-only.",
        ),
      };
    }
    if (detail.referendum?.mode !== "Plain") {
      return {
        allowed: false,
        reason: t(
          "ZK voting is unavailable in this release. This action fails closed.",
        ),
      };
    }
    if (detail.referendum.status !== "Proposed") {
      return {
        allowed: false,
        reason: t(
          "Parliament body ballots close when the citizen referendum opens.",
        ),
      };
    }
    if (!isAccountInParliamentRoster(detail, accountId.value, body)) {
      return {
        allowed: false,
        reason: t(
          "The active account is not a seated member of this Parliament body.",
        ),
      };
    }
    if (
      detail.parliamentOutcomes.find((outcome) => outcome.body === body)
        ?.currentAccountDecision
    ) {
      return {
        allowed: false,
        reason: t("This account already voted in this Parliament body."),
      };
    }
    return { allowed: canWrite.value, reason: "" };
  };

  const parliamentBodyGates = computed(() =>
    Object.fromEntries(
      GOVERNANCE_PARLIAMENT_BODIES.map((body) => [
        body,
        parliamentBallotGateForBody(body),
      ]),
    ),
  );
  const eligibleParliamentBodies = computed(() =>
    GOVERNANCE_PARLIAMENT_BODIES.filter(
      (body) => parliamentBodyGates.value[body]?.allowed,
    ),
  );
  const parliamentBallotGate = computed<GovernanceActionGate>(() =>
    eligibleParliamentBodies.value.length > 0
      ? { allowed: true, reason: "" }
      : {
          allowed: false,
          reason:
            GOVERNANCE_PARLIAMENT_BODIES.map(
              (body) => parliamentBodyGates.value[body]?.reason,
            ).find(Boolean) ?? t("No Parliament body ballot is available."),
        },
  );

  const policyEnactmentTiming = computed(() =>
    selectedProposal.value
      ? validationFeePolicyEnactmentTiming(selectedProposal.value)
      : null,
  );

  const enactGate = computed<GovernanceActionGate>(() => {
    const detail = selectedProposal.value;
    if (!detail) {
      return { allowed: false, reason: t("Select a proposal first.") };
    }
    if (detail.kind.type === "Unknown") {
      return {
        allowed: false,
        reason: t("Unknown proposal kinds are inspect-only."),
      };
    }
    if (!selectedKindSupported.value) {
      return {
        allowed: false,
        reason: t(
          "This proposal kind is not advertised by Taira and remains inspect-only.",
        ),
      };
    }
    if (detail.referendum?.mode !== "Plain") {
      return {
        allowed: false,
        reason: t(
          "ZK voting is unavailable in this release. This action fails closed.",
        ),
      };
    }
    if (
      !isEnactActionable(detail) ||
      detail.referendum.status !== "Closed" ||
      detail.finalizationEvidence?.approved !== true
    ) {
      return {
        allowed: false,
        reason: t("Enact becomes available after final approval."),
      };
    }
    if (detail.kind.type === "ValidationFeePolicy") {
      const timing = policyEnactmentTiming.value;
      if (!timing || timing.status === "unavailable") {
        return {
          allowed: false,
          reason: t(
            "Validation-fee policy enactment timing is unavailable or inconsistent with the finalized referendum.",
          ),
        };
      }
      if (timing.status === "not-yet") {
        return {
          allowed: false,
          reason: t(
            "Validation-fee policy enactment is not ready: {blocks} committed blocks remain before exact target {height}.",
            {
              blocks: timing.blocksRemaining ?? "",
              height: timing.targetHeight ?? "",
            },
          ),
        };
      }
      if (timing.status === "missed") {
        return {
          allowed: false,
          reason: t(
            "Validation-fee policy enactment target {height} was missed. This proposal can no longer be enacted.",
            { height: timing.targetHeight ?? "" },
          ),
        };
      }
      if (timing.status !== "ready") {
        return {
          allowed: false,
          reason: t(
            "Validation-fee policy enactment timing is unavailable or inconsistent with the finalized referendum.",
          ),
        };
      }
    }
    return canWrite.value
      ? { allowed: true, reason: "" }
      : {
          allowed: false,
          reason:
            capabilitiesError.value ||
            t("Connect the reviewed Taira network and wallet first."),
        };
  });

  const materializeValidationFeePolicy = (): ValidationFeePolicyPayload => ({
    ...validationFeeComposer.value,
    exemption_classes: validationFeeExemptions.value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
    treasury_payout_binding: validationFeePayoutBindingJson.value.trim()
      ? parseJsonRecord(
          validationFeePayoutBindingJson.value,
          "Treasury payout binding",
        )
      : null,
  });

  const referendumWindowError = (lower: string, upper: string) => {
    const window = optionalWindow(lower, upper);
    if (!window) return "An explicit referendum window is required.";
    if (
      capabilities.value &&
      BigInt(window.upper) - BigInt(window.lower) + 1n !==
        BigInt(capabilities.value.windowSpan)
    ) {
      return `Referendum window must span exactly ${capabilities.value.windowSpan} blocks.`;
    }
    return "";
  };

  const validationFeePayoutLifecycleErrors = computed(() => {
    const errors: string[] = [];
    try {
      if (!validationFeePayoutBindingJson.value.trim()) {
        errors.push("The exact treasury payout binding is required.");
      } else {
        parseJsonRecord(
          validationFeePayoutBindingJson.value,
          "Treasury payout binding",
        );
      }
    } catch (error) {
      errors.push(
        error instanceof Error
          ? error.message
          : "Treasury payout binding must be valid JSON.",
      );
    }
    try {
      const windowError = referendumWindowError(
        validationFeeLifecycleWindowLower.value,
        validationFeeLifecycleWindowUpper.value,
      );
      if (windowError) errors.push(windowError);
    } catch (error) {
      errors.push(
        error instanceof Error ? error.message : "Invalid referendum window.",
      );
    }
    return errors;
  });

  const validationFeeComposerErrors = computed(() => {
    let policy: ValidationFeePolicyPayload;
    try {
      policy = materializeValidationFeePolicy();
    } catch (error) {
      return [
        error instanceof Error
          ? error.message
          : "Treasury payout binding must be valid JSON.",
      ];
    }
    const errors = validateValidationFeePolicy(
      policy,
      {
        lower: validationFeeWindowLower.value,
        upper: validationFeeWindowUpper.value,
      },
      validationFeePayoutLifecycleProposalId.value,
    );
    if (
      capabilities.value &&
      (policy.chain_id !== capabilities.value.chainId ||
        policy.genesis_hash !== capabilities.value.genesisHash)
    ) {
      errors.push(
        "Policy chain and genesis must match the Taira capabilities projection.",
      );
    }
    if (policy.ds_asset_id !== CBSI_SBD_ASSET_ID) {
      errors.push(
        `Fee asset must be the canonical CBSI SBD ${CBSI_SBD_ASSET_ID}.`,
      );
    }
    if (policy.treasury_payout_binding === null) {
      errors.push(
        "The first Taira policy requires its enacted payout binding.",
      );
    }
    try {
      const windowError = referendumWindowError(
        validationFeeWindowLower.value,
        validationFeeWindowUpper.value,
      );
      if (windowError) errors.push(windowError);
      if (/^[1-9]\d*$/u.test(validationFeeWindowUpper.value)) {
        const expectedEffectiveHeight = validationFeePolicyEffectiveHeight(
          validationFeeWindowUpper.value,
        );
        if (!expectedEffectiveHeight) {
          errors.push("Invalid referendum window.");
        } else if (policy.effective_from_height !== expectedEffectiveHeight) {
          errors.push(
            `Effective height must be exactly ${expectedEffectiveHeight} for the reviewed activation buffer.`,
          );
        }
      }
    } catch (error) {
      errors.push(
        error instanceof Error ? error.message : "Invalid referendum window.",
      );
    }
    return [...new Set(errors)];
  });

  const commonPrepareContext = () => {
    if (!canWrite.value) {
      throw new Error("Connect an account and a verified Torii chain first.");
    }
    return {
      toriiUrl: toriiUrl.value,
      chainId: chainId.value,
      accountId: accountId.value,
      networkPrefix: session.connection.networkPrefix,
    };
  };

  const resetActionFeedback = () => {
    actionError.value = "";
    actionMessage.value = "";
  };

  const rebaseComposerWindow = (
    kind: GovernanceWritableProposalKindId,
    loaded: GovernanceCapabilitiesV1,
  ) => {
    const window = rebaseGovernanceReferendumWindow({
      currentHeight: loaded.currentHeight,
      minStagingBlocks: loaded.minEnactmentDelay,
      windowSpan: loaded.windowSpan,
    });
    if (kind === "ValidationFeePayoutLifecycle") {
      validationFeeLifecycleWindowLower.value = window.lower;
      validationFeeLifecycleWindowUpper.value = window.upper;
      return;
    }
    validationFeeWindowLower.value = window.lower;
    validationFeeWindowUpper.value = window.upper;
    const effectiveHeight = validationFeePolicyEffectiveHeight(window.upper);
    if (!effectiveHeight) {
      throw new Error(
        "The rebased validation-fee activation height exceeds the uint64 range.",
      );
    }
    validationFeeComposer.value.effective_from_height = effectiveHeight;
  };

  const seedReferendumWindows = (loaded: GovernanceCapabilitiesV1) => {
    if (
      !validationFeeLifecycleWindowLower.value &&
      !validationFeeLifecycleWindowUpper.value
    ) {
      rebaseComposerWindow("ValidationFeePayoutLifecycle", loaded);
    }
    if (!validationFeeWindowLower.value && !validationFeeWindowUpper.value) {
      rebaseComposerWindow("ValidationFeePolicy", loaded);
    }
  };

  const loadCapabilities =
    async (): Promise<GovernanceCapabilitiesV1 | null> => {
      capabilitiesError.value = "";
      capabilities.value = null;
      if (!toriiUrl.value) {
        capabilitiesError.value = t("A Torii endpoint is required.");
        return null;
      }
      try {
        const loaded = await getGovernanceCapabilities(toriiUrl.value);
        if (
          loaded.chainId !== chainId.value ||
          loaded.networkPrefix !== session.connection.networkPrefix
        ) {
          throw new Error(
            "The endpoint governance capabilities do not match the active wallet connection.",
          );
        }
        capabilities.value = loaded;
        ballotAmount.value = loaded.minBondAmount;
        validationFeeComposer.value = {
          ...validationFeeComposer.value,
          chain_id: loaded.chainId,
          genesis_hash: loaded.genesisHash,
          ds_asset_id: CBSI_SBD_ASSET_ID,
          ds_scale: 2,
          fee: "0.10",
        };
        seedReferendumWindows(loaded);
        return loaded;
      } catch (error) {
        capabilitiesError.value = toUserFacingErrorMessage(
          error,
          t("Taira governance capabilities are unavailable."),
        );
        return null;
      }
    };

  const loadCitizenState = async () => {
    if (!toriiUrl.value || !accountId.value || !capabilities.value) {
      citizenStatus.value = null;
      citizenshipBalance.value = "0";
      citizenshipLoadError.value = capabilitiesError.value;
      return;
    }
    const [statusResult, assetsResult] = await Promise.allSettled([
      getGovernanceCitizenStatus({
        toriiUrl: toriiUrl.value,
        accountId: accountId.value,
      }),
      fetchAccountAssets({
        toriiUrl: toriiUrl.value,
        accountId: accountId.value,
        networkPrefix: session.connection.networkPrefix,
        limit: 200,
      }),
    ]);
    citizenStatus.value =
      statusResult.status === "fulfilled" ? statusResult.value : null;
    citizenshipBalance.value =
      assetsResult.status === "fulfilled"
        ? resolveGovernanceBondBalance(
            assetsResult.value.items,
            capabilities.value.citizenshipAssetId,
            [],
          )
        : "0";
    const requiredFailure = [statusResult, assetsResult].find(
      (result) => result.status === "rejected",
    );
    citizenshipLoadError.value =
      requiredFailure?.status === "rejected"
        ? toUserFacingErrorMessage(
            requiredFailure.reason,
            t("Failed to load governance state."),
          )
        : "";
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

  const syncValidationFeeComposer = (
    current: GovernanceValidationFeePolicyView,
  ) => {
    const latest = current.latestEnacted ?? current.effective;
    const registry = current.registryHead;
    validationFeeComposer.value = {
      ...emptyValidationFeePolicy(),
      chain_id: capabilities.value?.chainId ?? chainId.value,
      genesis_hash:
        capabilities.value?.genesisHash ?? stringValue(latest, "genesis_hash"),
      policy_version: integerAfter(
        registry?.policyVersion || stringValue(latest, "policy_version") || "0",
      ),
      previous_policy_hash:
        canonicalValidationFeeHash(registry?.policyHash) ||
        canonicalValidationFeeHash(stringValue(latest, "policy_hash")) ||
        null,
      ds_asset_id: CBSI_SBD_ASSET_ID,
      ds_scale: 2,
      fee: "0.10",
      treasury_account_id:
        validationFeeComposer.value.treasury_account_id ||
        stringValue(latest, "treasury_account_id"),
      effective_from_height: validationFeeComposer.value.effective_from_height,
      expires_after_height: null,
    };
  };

  const loadValidationFeePolicy = async () => {
    if (!toriiUrl.value) return;
    policyError.value = "";
    try {
      const current = await getGovernanceCurrentValidationFeePolicy(
        toriiUrl.value,
      );
      validationFeePolicy.value = current;
      syncValidationFeeComposer(current);
    } catch (error) {
      validationFeePolicy.value = null;
      policyError.value = toUserFacingErrorMessage(
        error,
        t("Validation-fee policy state is unavailable."),
      );
    }
  };

  const loadProposals = async (
    options: {
      append?: boolean;
      preserveSelection?: boolean;
    } = {},
  ) => {
    if (!toriiUrl.value) {
      proposals.value = [];
      nextCursor.value = null;
      return;
    }
    const generation = ++listGeneration;
    listError.value = "";
    busy.value = "list";
    try {
      const result = await listGovernanceProposals({
        toriiUrl: toriiUrl.value,
        status: catalogFilter.value === "open" ? "Proposed" : null,
        proposer:
          catalogFilter.value === "mine" ? accountId.value || null : null,
        limit: 30,
        cursor: options.append ? nextCursor.value : null,
      });
      if (generation !== listGeneration) return;
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
      if (generation !== listGeneration) return;
      listError.value = toUserFacingErrorMessage(
        error,
        t("Live governance proposals could not be loaded."),
      );
      if (!options.append) {
        proposals.value = [];
        nextCursor.value = null;
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
        "Proposal ID must be 32-byte hex (with or without 0x prefix).",
      );
      return;
    }
    if (!toriiUrl.value) return;
    selectedProposalId.value = normalizedId;
    selectedProposal.value = null;
    detailError.value = "";
    const generation = ++detailGeneration;
    busy.value = "detail";
    try {
      const detail = await getGovernanceProposalDetail({
        toriiUrl: toriiUrl.value,
        proposalId: normalizedId,
        accountId: accountId.value || null,
      });
      if (
        generation === detailGeneration &&
        selectedProposalId.value === normalizedId
      ) {
        selectedProposal.value = detail;
      }
    } catch (error) {
      if (generation === detailGeneration) {
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
    busy.value = "bootstrap";
    await loadCapabilities();
    await Promise.all([loadCitizenState(), loadValidationFeePolicy()]);
    busy.value = null;
    if (deepLinkedProposalId?.trim()) {
      selectedProposalId.value = deepLinkedProposalId.trim();
    }
    await Promise.all([
      loadProposals({ preserveSelection: true }),
      selectedProposalId.value
        ? selectProposal(selectedProposalId.value)
        : Promise.resolve(),
    ]);
    if (!selectedProposalId.value && proposals.value[0]) {
      await selectProposal(proposals.value[0].proposalId);
    }
  };

  const refresh = async () => {
    refreshing.value = true;
    await loadCapabilities();
    await Promise.all([
      loadCitizenState(),
      loadValidationFeePolicy(),
      loadProposals({ preserveSelection: true }),
      refreshSelectedProposal(),
    ]);
    refreshing.value = false;
  };

  const openComposer = (
    kind: GovernanceWritableProposalKindId = "ValidationFeePayoutLifecycle",
  ) => {
    if (!supportedComposerKinds.value.includes(kind)) {
      actionError.value =
        capabilitiesError.value ||
        t("This proposal kind is not advertised by Taira.");
      return;
    }
    if (capabilities.value) rebaseComposerWindow(kind, capabilities.value);
    composerKind.value = kind;
    composerOpen.value = true;
    resetActionFeedback();
  };

  const closeComposer = () => {
    if (busy.value !== "prepare") composerOpen.value = false;
  };

  const prepareProposal = async () => {
    resetActionFeedback();
    busy.value = "prepare";
    try {
      const refreshedCapabilities = await loadCapabilities();
      if (!refreshedCapabilities) {
        throw new Error(
          capabilitiesError.value ||
            "Taira governance capabilities are unavailable.",
        );
      }
      rebaseComposerWindow(composerKind.value, refreshedCapabilities);
      if (!supportedComposerKinds.value.includes(composerKind.value)) {
        throw new Error(
          "This proposal kind is not advertised by the Taira capabilities contract.",
        );
      }
      let payload: Record<string, unknown>;
      switch (composerKind.value) {
        case "ValidationFeePayoutLifecycle": {
          if (validationFeePayoutLifecycleErrors.value.length) {
            throw new Error(validationFeePayoutLifecycleErrors.value[0]);
          }
          const referendumWindow = optionalWindow(
            validationFeeLifecycleWindowLower.value,
            validationFeeLifecycleWindowUpper.value,
          );
          if (!referendumWindow) {
            throw new Error(
              "Payout lifecycle proposals require an explicit referendum window.",
            );
          }
          payload = {
            payout_binding: parseJsonRecord(
              validationFeePayoutBindingJson.value,
              "Treasury payout binding",
            ),
            referendum_window: referendumWindow,
          };
          break;
        }
        case "ValidationFeePolicy": {
          if (!validationFeePolicy.value) {
            throw new Error(
              "Validation-fee proposals require locally verified consensus proof state.",
            );
          }
          const policy = materializeValidationFeePolicy();
          const errors = validateValidationFeePolicy(
            policy,
            {
              lower: validationFeeWindowLower.value,
              upper: validationFeeWindowUpper.value,
            },
            validationFeePayoutLifecycleProposalId.value,
          );
          if (errors.length) throw new Error(errors[0]);
          const lifecycleProposalId = canonicalValidationFeeHash(
            validationFeePayoutLifecycleProposalId.value.trim(),
          );
          if (!lifecycleProposalId) {
            throw new Error(
              "Select the enacted payout lifecycle proposal first.",
            );
          }
          const lifecycle = await getGovernanceProposalDetail({
            toriiUrl: toriiUrl.value,
            proposalId: lifecycleProposalId,
            accountId: accountId.value || null,
          });
          if (
            lifecycle.kind.type !== "ValidationFeePayoutLifecycle" ||
            lifecycle.summary.status !== "Enacted"
          ) {
            throw new Error(
              "The selected payout lifecycle must be enacted before the policy is proposed.",
            );
          }
          const referendumWindow = optionalWindow(
            validationFeeWindowLower.value,
            validationFeeWindowUpper.value,
          );
          if (!referendumWindow) {
            throw new Error(
              "Validation-fee proposals require an explicit referendum window.",
            );
          }
          validationFeeComposer.value = policy;
          payload = {
            policy,
            referendum_window: referendumWindow,
            payout_lifecycle_proposal_id: lifecycleProposalId,
          };
          break;
        }
      }
      review.value = await prepareGovernanceProposal({
        ...commonPrepareContext(),
        kind: composerKind.value,
        payload,
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

  const prepareCitizenBallot = async () => {
    if (!plainVoteGate.value.allowed || !selectedProposal.value?.referendum) {
      actionError.value = plainVoteGate.value.reason;
      return;
    }
    resetActionFeedback();
    busy.value = "prepare";
    try {
      review.value = await prepareGovernancePlainBallot({
        ...commonPrepareContext(),
        proposalId: selectedProposal.value.summary.proposalId,
        referendumId: selectedProposal.value.referendum.id,
        amount: ballotAmount.value.trim(),
        durationBlocks: ballotDurationBlocks.value.trim(),
        direction: ballotDirection.value,
      });
    } catch (error) {
      actionError.value = toUserFacingErrorMessage(
        error,
        t("The citizen ballot could not be prepared."),
      );
    } finally {
      busy.value = null;
    }
  };

  const prepareStageBallot = async (body: string) => {
    const gate = parliamentBallotGateForBody(body);
    if (!gate.allowed || !selectedProposal.value) {
      actionError.value = gate.reason;
      return;
    }
    resetActionFeedback();
    busy.value = "prepare";
    try {
      review.value = await prepareGovernanceParliamentBallot({
        ...commonPrepareContext(),
        proposalId: selectedProposal.value.summary.proposalId,
        body,
        decision: parliamentDecision.value,
      });
    } catch (error) {
      actionError.value = toUserFacingErrorMessage(
        error,
        t("The Parliament ballot could not be prepared."),
      );
    } finally {
      busy.value = null;
    }
  };

  const prepareEnact = async () => {
    const proposalId =
      selectedProposal.value?.summary.proposalId ?? selectedProposalId.value;
    if (!proposalId) {
      actionError.value = t("Select a proposal first.");
      return;
    }
    resetActionFeedback();
    await selectProposal(proposalId);
    if (!enactGate.value.allowed || !selectedProposal.value) {
      actionError.value = detailError.value || enactGate.value.reason;
      return;
    }
    busy.value = "prepare";
    try {
      review.value = await prepareGovernanceEnact({
        ...commonPrepareContext(),
        proposalId: selectedProposal.value.summary.proposalId,
      });
    } catch (error) {
      actionError.value = toUserFacingErrorMessage(
        error,
        t("Enact could not be prepared."),
      );
    } finally {
      busy.value = null;
    }
  };

  const cancelReview = () => {
    if (busy.value !== "commit") review.value = null;
  };

  const pulseCommittedState = () => {
    committedRefresh.value = true;
    if (refreshPulseTimer) clearTimeout(refreshPulseTimer);
    refreshPulseTimer = setTimeout(() => {
      committedRefresh.value = false;
    }, 900);
  };

  const confirmReview = async () => {
    if (!review.value) return;
    resetActionFeedback();
    busy.value = "commit";
    const prepared = review.value;
    try {
      const committed = await confirmGovernanceAction({
        reviewId: prepared.reviewId,
        accountId: accountId.value,
      });
      review.value = null;
      composerOpen.value = false;
      actionMessage.value = t("Committed to the ledger: {hash}", {
        hash: committed.hash,
      });
      if (committed.proposalId) {
        selectedProposalId.value = committed.proposalId;
        if (composerKind.value === "ValidationFeePayoutLifecycle") {
          validationFeePayoutLifecycleProposalId.value =
            committed.proposalId.replace(/^0x/u, "");
        }
      }
      pulseCommittedState();
      await Promise.all([
        loadCitizenState(),
        loadValidationFeePolicy(),
        loadProposals({ preserveSelection: true }),
        selectedProposalId.value
          ? selectProposal(selectedProposalId.value)
          : Promise.resolve(),
      ]);
    } catch (error) {
      actionError.value = toUserFacingErrorMessage(
        error,
        t("The reviewed action was not committed."),
      );
    } finally {
      busy.value = null;
    }
  };

  watch(catalogFilter, () => {
    void loadProposals({ preserveSelection: true });
  });

  watch(validationFeeWindowUpper, (upper) => {
    if (!/^[1-9]\d*$/u.test(upper)) return;
    const effectiveHeight = validationFeePolicyEffectiveHeight(upper);
    if (effectiveHeight) {
      validationFeeComposer.value.effective_from_height = effectiveHeight;
    }
  });

  watch(
    [toriiUrl, chainId, accountId],
    ([nextTorii, nextChain, nextAccount], previous) => {
      if (!previous) return;
      const [previousTorii, previousChain, previousAccount] = previous;
      if (
        nextTorii === previousTorii &&
        nextChain === previousChain &&
        nextAccount === previousAccount
      ) {
        return;
      }
      selectedProposalId.value = null;
      selectedProposal.value = null;
      review.value = null;
      proposals.value = [];
      void bootstrap();
    },
  );

  return {
    accountId,
    toriiUrl,
    chainId,
    canWrite,
    capabilities,
    capabilitiesError,
    catalogFilter,
    proposals,
    nextCursor,
    selectedProposalId,
    selectedProposal,
    selectedAdapter,
    citizenStatus,
    isCitizen,
    citizenshipBalance,
    citizenshipBondAmount,
    citizenshipAssetDefinitionId,
    canBondCitizen,
    bondGate,
    validationFeePolicy,
    busy,
    refreshing,
    committedRefresh,
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
    validationFeePayoutLifecycleErrors,
    validationFeeExemptions,
    validationFeePayoutBindingJson,
    validationFeePayoutLifecycleProposalId,
    validationFeeLifecycleWindowLower,
    validationFeeLifecycleWindowUpper,
    validationFeeWindowLower,
    validationFeeWindowUpper,
    ballotDirection,
    ballotAmount,
    ballotDurationBlocks,
    parliamentDecision,
    review,
    parliamentBodyGates,
    eligibleParliamentBodies,
    plainVoteGate,
    parliamentBallotGate,
    parliamentBallotGateForBody,
    enactGate,
    policyEnactmentTiming,
    proposalReviewSafetyMarginBlocks:
      GOVERNANCE_PROPOSAL_REVIEW_SAFETY_MARGIN_BLOCKS.toString(),
    bootstrap,
    refresh,
    loadProposals,
    selectProposal,
    refreshSelectedProposal,
    handleBondCitizen,
    openComposer,
    closeComposer,
    prepareProposal,
    prepareCitizenBallot,
    prepareStageBallot,
    prepareEnact,
    cancelReview,
    confirmReview,
  };
});

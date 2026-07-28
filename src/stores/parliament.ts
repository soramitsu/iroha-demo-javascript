import { computed, ref, watch } from "vue";
import { defineStore } from "pinia";
import { useAppI18n } from "@/composables/useAppI18n";
import {
  GOVERNANCE_PROPOSAL_REVIEW_SAFETY_MARGIN_BLOCKS,
  GOVERNANCE_KIND_ADAPTERS,
  GOVERNANCE_PARLIAMENT_BODIES,
  canonicalGovernanceProposalId,
  canonicalValidationFeeHash,
  governanceCitizenVoteProjection,
  isAccountInParliamentRoster,
  isReferendumPlainVoteOpen,
  plainBallotLockCoversReferendum,
  rebaseGovernanceReferendumWindow,
  validateValidationFeePolicy,
  validationFeePolicyEnactmentTargetHeight,
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
  getGovernanceCitizenCount,
  getGovernanceCitizenStatus,
  getGovernanceCouncilCurrent,
  getGovernanceCurrentValidationFeePolicy,
  getGovernancePlainReferendumContract,
  getGovernanceUnlockStats,
  getGovernanceProposalDetail,
  listGovernanceProposals,
  prepareGovernanceCitizenRegistration,
  prepareGovernanceParliamentBallot,
  prepareGovernancePlainBallot,
  prepareGovernanceProposal,
} from "@/services/iroha";
import { useEndpointStore } from "@/stores/endpoint";
import { useSessionStore } from "@/stores/session";
import type {
  GovernanceBallotDirection,
  GovernanceCapabilitiesV1,
  GovernanceCitizenCountResponse,
  GovernanceCitizenState,
  GovernanceCitizenStatusResponse,
  GovernanceCouncilCurrentResponse,
  GovernancePreparedAction,
  GovernancePlainReferendumContractResult,
  GovernanceUnlockStatsResponse,
  GovernanceValidationFeePolicyView,
} from "@/types/iroha";
import { getPublicAccountId } from "@/utils/accountId";
import { toUserFacingErrorMessage } from "@/utils/errorMessage";
import { resolveGovernanceBondBalance } from "@/utils/parliament";
import { compareDecimalStrings } from "@/utils/staking";
import { assertFinalizedSubmissionResult } from "@/utils/transactionFinality";

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

export type GovernanceCitizenBallotSubmissionState =
  | "idle"
  | "preparing"
  | "reviewing"
  | "submitting"
  | "finalized"
  | "error";

interface GovernanceCapabilitiesRequestContext {
  toriiUrl: string;
  accountId: string;
  chainId: string;
  networkPrefix: number;
}

const emptyHash = "";
const CBSI_SBD_APP_ASSET_ID = "sbd#cbsi";
const CBSI_SBD_ASSET_DEFINITION_ID = "7ZepsJTHCVLKsrFFNZGSRGZgvBhv";

const validationFeePolicyForNativeValidation = (
  policy: ValidationFeePolicyPayload,
): ValidationFeePolicyPayload => ({
  ...policy,
  ds_asset_id: CBSI_SBD_ASSET_DEFINITION_ID,
  treasury_payout_binding:
    policy.treasury_payout_binding === null
      ? null
      : {
          ...policy.treasury_payout_binding,
          sbd_asset_id: CBSI_SBD_ASSET_DEFINITION_ID,
        },
});

const governanceCapabilitiesContextKey = (
  context: GovernanceCapabilitiesRequestContext,
) =>
  JSON.stringify([
    context.toriiUrl,
    context.accountId,
    context.chainId,
    context.networkPrefix,
  ]);

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
  const endpointStore = useEndpointStore();
  const { t } = useAppI18n();

  const activeAccount = computed(() => session.activeAccount);
  const accountId = computed(() =>
    getPublicAccountId(activeAccount.value, session.connection.networkPrefix),
  );
  const toriiUrl = computed(() => session.connection.toriiUrl.trim());
  const chainId = computed(() => session.connection.chainId.trim());
  const networkPrefix = computed(() => session.connection.networkPrefix);
  const capabilities = ref<GovernanceCapabilitiesV1 | null>(null);
  const capabilitiesLoading = ref(false);
  const capabilitiesError = ref("");
  const capabilitiesContextKey = ref("");
  const currentCapabilitiesContext =
    computed<GovernanceCapabilitiesRequestContext>(() => ({
      toriiUrl: toriiUrl.value,
      accountId: accountId.value,
      chainId: chainId.value,
      networkPrefix: networkPrefix.value,
    }));
  const currentCapabilitiesContextKey = computed(() =>
    governanceCapabilitiesContextKey(currentCapabilitiesContext.value),
  );
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
      capabilitiesContextKey.value === currentCapabilitiesContextKey.value &&
      capabilities.value?.chainId === chainId.value &&
      capabilities.value.networkPrefix === session.connection.networkPrefix &&
      !capabilitiesError.value,
  );
  const governanceWriteUnavailableReason = computed(() => {
    if (endpointGovernanceWriteError.value) {
      return endpointGovernanceWriteError.value;
    }
    if (capabilitiesError.value) {
      return capabilitiesError.value;
    }
    if (!toriiUrl.value || !chainId.value || !accountId.value) {
      return t("Connect the reviewed Taira network and wallet first.");
    }
    if (!capabilities.value) {
      return t("Governance capabilities are unavailable.");
    }
    return "";
  });

  const catalogFilter = ref<GovernanceCatalogFilter>("open");
  const proposals = ref<GovernanceProposalSummary[]>([]);
  const nextCursor = ref<string | null>(null);
  const selectedProposalId = ref<string | null>(null);
  const selectedProposal = ref<GovernanceProposalDetail | null>(null);
  const citizenStatus = ref<GovernanceCitizenStatusResponse | null>(null);
  const citizenshipLoading = ref(false);
  const citizenshipBalance = ref<string | null>(null);
  const citizenshipStatusError = ref("");
  const citizenshipBalanceError = ref("");
  const citizenshipLoadError = computed(
    () => citizenshipStatusError.value || citizenshipBalanceError.value,
  );
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
  const plainReferendumContract =
    ref<GovernancePlainReferendumContractResult | null>(null);
  const plainReferendumContractLoading = ref(false);
  const plainReferendumContractError = ref("");

  const busy = ref<GovernanceBusyAction>(null);
  const refreshing = ref(false);
  const finalizedRefresh = ref(false);
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
  const ballotAmount = ref("150");
  const ballotDurationBlocks = ref("3600");
  const parliamentDecision = ref<GovernanceParliamentDecision>("approve");
  const citizenBallotSubmissionState =
    ref<GovernanceCitizenBallotSubmissionState>("idle");
  const citizenBallotError = ref("");

  const review = ref<GovernancePreparedAction | null>(null);
  let capabilitiesGeneration = 0;
  let listGeneration = 0;
  let detailGeneration = 0;
  let citizenGeneration = 0;
  let citizenBalanceGeneration = 0;
  let citizenCountGeneration = 0;
  let councilGeneration = 0;
  let unlockStatsGeneration = 0;
  let validationFeePolicyGeneration = 0;
  let plainReferendumContractGeneration = 0;
  let bootstrapGeneration = 0;
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
  const citizenState = computed<GovernanceCitizenState>(
    () => citizenStatus.value?.state ?? "unavailable",
  );
  const isCitizen = computed(() => citizenState.value === "citizen");
  const citizenVoteProjection = computed(() =>
    governanceCitizenVoteProjection(selectedProposal.value, accountId.value),
  );
  const selectedPublicProposalError = computed(() => {
    const detail = selectedProposal.value;
    const referendum = detail?.referendum;
    const activeCapabilities = capabilities.value;
    if (!detail || !referendum || !activeCapabilities) return "";
    if (referendum.mode !== "Plain") {
      return "";
    }
    if (
      BigInt(referendum.hEnd) - BigInt(referendum.hStart) + 1n !==
      BigInt(activeCapabilities.windowSpan)
    ) {
      return t(
        "The public referendum window differs from the exact Taira 3,600-block contract.",
      );
    }
    if (
      detail.kind.type === "ValidationFeePayoutLifecycle" ||
      detail.kind.type === "ValidationFeePolicy"
    ) {
      const proposalRules = detail.kind.plainElectorateRules;
      const capabilityRules =
        activeCapabilities.validationFeePlainElectorateRules;
      if (
        proposalRules.voting_asset_id !== capabilityRules.votingAssetId ||
        proposalRules.bond_escrow_account !==
          capabilityRules.bondEscrowAccount ||
        proposalRules.slash_receiver_account !==
          capabilityRules.slashReceiverAccount ||
        proposalRules.ballot_amount !== capabilityRules.ballotAmount ||
        proposalRules.ballot_duration_blocks !==
          capabilityRules.ballotDurationBlocks ||
        proposalRules.citizenship_amount !==
          capabilityRules.citizenshipAmount ||
        proposalRules.max_members !== capabilityRules.maxMembers ||
        proposalRules.conviction_step_blocks !==
          capabilityRules.convictionStepBlocks ||
        proposalRules.max_conviction !== capabilityRules.maxConviction ||
        proposalRules.min_turnout !== capabilityRules.minTurnout ||
        proposalRules.approval_threshold_numerator !==
          capabilityRules.approvalThresholdNumerator ||
        proposalRules.approval_threshold_denominator !==
          capabilityRules.approvalThresholdDenominator ||
        proposalRules.eligibility_rule.rule !==
          capabilityRules.eligibilityRule.rule ||
        proposalRules.eligibility_rule.value !==
          capabilityRules.eligibilityRule.value
      ) {
        return t(
          "The public validation-fee PLAIN electorate rules differ from the exact endpoint capabilities.",
        );
      }
    }
    if (detail.kind.type === "ValidationFeePayoutLifecycle") {
      if (
        detail.kind.payoutBinding.sbd_asset_id !==
          CBSI_SBD_ASSET_DEFINITION_ID ||
        detail.kind.payoutBinding.entrypoint !==
          "autonomous_validation_fee_tick"
      ) {
        return t(
          "The public payout lifecycle differs from the exact reviewed Taira binding.",
        );
      }
      return "";
    }
    if (detail.kind.type !== "ValidationFeePolicy") return "";
    const policy = detail.kind.policy;
    const enactmentTargetHeight = validationFeePolicyEnactmentTargetHeight(
      policy.effective_from_height,
    );
    const referendumStart = BigInt(referendum.hStart);
    const referendumEnd = BigInt(referendum.hEnd);
    const finalizationHeight = detail.finalizationEvidence
      ? BigInt(detail.finalizationEvidence.finalized_at_height)
      : null;
    if (
      policy.chain_id !== activeCapabilities.chainId ||
      policy.genesis_hash.toLowerCase() !==
        activeCapabilities.genesisHash.toLowerCase() ||
      policy.ds_asset_id !== CBSI_SBD_ASSET_DEFINITION_ID ||
      policy.ds_scale !== 2 ||
      policy.fee !== "0.1" ||
      policy.charging_mode.charging_mode !==
        "PER_QUALIFYING_TRANSFER_INSTRUCTION" ||
      policy.charging_mode.value !== null ||
      policy.exemption_classes.length !== 1 ||
      policy.exemption_classes[0] !== "TREASURY_PAYOUT" ||
      policy.treasury_payout_binding === null ||
      detail.kind.payoutLifecycleProposalId === null ||
      enactmentTargetHeight === null ||
      BigInt(enactmentTargetHeight) <= referendumEnd ||
      (finalizationHeight !== null &&
        (finalizationHeight < referendumStart ||
          finalizationHeight > referendumEnd ||
          BigInt(enactmentTargetHeight) <= finalizationHeight))
    ) {
      return t(
        "The public validation-fee payload differs from the exact reviewed Taira policy.",
      );
    }
    return "";
  });
  const activeAccountEligibleForPlainReferendum = computed(() => {
    const contract = plainReferendumContract.value?.contract;
    return Boolean(
      contract &&
        accountId.value &&
        contract.eligibleCitizens.some(
          (citizen) => citizen.accountId === accountId.value,
        ),
    );
  });
  const selectedPlainReferendumContractError = computed(() => {
    const detail = selectedProposal.value;
    if (!detail || detail.kind.type !== "ValidationFeePolicy") return "";
    if (plainReferendumContractLoading.value) {
      return t("Checking the immutable eligible-citizen snapshot…");
    }
    if (plainReferendumContractError.value) {
      return plainReferendumContractError.value;
    }
    const contract = plainReferendumContract.value?.contract;
    if (!contract) {
      return t("The immutable PLAIN referendum contract is unavailable.");
    }
    const referendum = detail.referendum;
    const contractRules = contract.plainElectorate.rules;
    const proposalRules = detail.kind.plainElectorateRules;
    if (
      !referendum ||
      contract.chainId !== chainId.value ||
      `0x${contract.proposalId}` !== detail.summary.proposalId ||
      contract.referendumId !== referendum.id ||
      contract.hStart !== referendum.hStart ||
      contract.hEnd !== referendum.hEnd ||
      contract.mode !== referendum.mode ||
      contractRules.bondEscrowAccount !== proposalRules.bond_escrow_account ||
      contractRules.slashReceiverAccount !==
        proposalRules.slash_receiver_account
    ) {
      return t(
        "The selected proposal differs from the immutable PLAIN referendum contract.",
      );
    }
    if (!activeAccountEligibleForPlainReferendum.value) {
      return t(
        "The active account is outside the immutable eligible-citizen snapshot.",
      );
    }
    return "";
  });
  const proposalGate = computed<GovernanceActionGate>(() => {
    if (!canWrite.value) {
      return {
        allowed: false,
        reason: governanceWriteUnavailableReason.value,
      };
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
      Boolean(capabilities.value) &&
      citizenState.value === "not-citizen" &&
      hasCitizenshipBondBalance.value &&
      !citizenshipLoadError.value &&
      busy.value === null,
  );
  const bondGate = computed<GovernanceActionGate>(() => {
    if (canBondCitizen.value) return { allowed: true, reason: "" };
    if (!canWrite.value) {
      return {
        allowed: false,
        reason: governanceWriteUnavailableReason.value,
      };
    }
    if (citizenshipLoading.value) {
      return { allowed: false, reason: t("Checking citizenship…") };
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
    if (citizenState.value === "unavailable") {
      return { allowed: false, reason: t("Citizen status unavailable") };
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
    if (!canWrite.value) {
      return {
        allowed: false,
        reason: governanceWriteUnavailableReason.value,
      };
    }
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
    if (detail.kind.type !== "ValidationFeePolicy") {
      return {
        allowed: false,
        reason: t(
          "This release only enables public PLAIN voting for the frozen-electorate validation-fee policy.",
        ),
      };
    }
    if (selectedPublicProposalError.value) {
      return {
        allowed: false,
        reason: selectedPublicProposalError.value,
      };
    }
    if (selectedPlainReferendumContractError.value) {
      return {
        allowed: false,
        reason: selectedPlainReferendumContractError.value,
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
    if (citizenVoteProjection.value.state === "recorded") {
      return {
        allowed: false,
        reason: t(
          "This account already has a PLAIN citizen ballot recorded for this referendum.",
        ),
      };
    }
    if (!isReferendumPlainVoteOpen(detail)) {
      return {
        allowed: false,
        reason: t("The plain citizen voting window is not open."),
      };
    }
    const amount = ballotAmount.value.trim();
    const durationBlocks = ballotDurationBlocks.value.trim();
    if (!/^[1-9]\d*$/u.test(amount) || !/^[1-9]\d*$/u.test(durationBlocks)) {
      return {
        allowed: false,
        reason: t(
          "Enter a positive whole-number ballot amount and lock duration.",
        ),
      };
    }
    const ballotContract = plainReferendumContract.value?.contract.ballot;
    if (
      !ballotContract ||
      amount !== ballotContract.amount ||
      durationBlocks !== ballotContract.durationBlocks ||
      !ballotContract.directions.includes(ballotDirection.value)
    ) {
      return {
        allowed: false,
        reason: t(
          "The ballot must use the immutable 150 XOR / 3,600-block PLAIN contract.",
        ),
      };
    }
    const activeCapabilities = capabilities.value;
    if (!activeCapabilities) {
      return {
        allowed: false,
        reason: t("Governance capabilities are unavailable."),
      };
    }
    try {
      if (compareDecimalStrings(amount, activeCapabilities.minBondAmount) < 0) {
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
      BigInt(durationBlocks) < BigInt(activeCapabilities.convictionStepBlocks)
    ) {
      return {
        allowed: false,
        reason: t(
          "Ballot lock duration is below the network conviction minimum.",
        ),
      };
    }
    if (!plainBallotLockCoversReferendum(detail, durationBlocks)) {
      return {
        allowed: false,
        reason: t("Ballot lock duration must cover the referendum end height."),
      };
    }
    return { allowed: true, reason: "" };
  });

  const parliamentBallotGateForBody = (body: string): GovernanceActionGate => {
    if (!canWrite.value) {
      return {
        allowed: false,
        reason: governanceWriteUnavailableReason.value,
      };
    }
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
    if (selectedPublicProposalError.value) {
      return {
        allowed: false,
        reason: selectedPublicProposalError.value,
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
    return { allowed: true, reason: "" };
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

  const enactGate = computed<GovernanceActionGate>(() => ({
    allowed: false,
    reason: t(
      "Validation-fee finalization and enactment use the proposal-bound operator workflow; the public wallet only prepares eligible citizen ballots.",
    ),
  }));

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
      validationFeePolicyForNativeValidation(policy),
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
    if (policy.ds_asset_id !== CBSI_SBD_APP_ASSET_ID) {
      errors.push(
        `Fee asset must use the CBSI SBD selector ${CBSI_SBD_APP_ASSET_ID}.`,
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
    } catch (error) {
      errors.push(
        error instanceof Error ? error.message : "Invalid referendum window.",
      );
    }
    return [...new Set(errors)];
  });

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
      const generation = ++capabilitiesGeneration;
      const requestContext = currentCapabilitiesContext.value;
      const requestContextKey =
        governanceCapabilitiesContextKey(requestContext);
      const isCurrentRequest = () =>
        generation === capabilitiesGeneration &&
        requestContextKey === currentCapabilitiesContextKey.value;

      capabilitiesError.value = "";
      capabilities.value = null;
      capabilitiesContextKey.value = "";
      capabilitiesLoading.value = Boolean(requestContext.toriiUrl);
      if (!requestContext.toriiUrl) {
        capabilitiesError.value = t("A Torii endpoint is required.");
        capabilitiesLoading.value = false;
        return null;
      }
      try {
        const loaded = await getGovernanceCapabilities(requestContext.toriiUrl);
        if (!isCurrentRequest()) return null;
        if (
          loaded.chainId !== requestContext.chainId ||
          loaded.networkPrefix !== requestContext.networkPrefix
        ) {
          throw new Error(
            "The endpoint governance capabilities do not match the active wallet connection.",
          );
        }
        capabilities.value = loaded;
        capabilitiesContextKey.value = requestContextKey;
        ballotAmount.value = "150";
        ballotDurationBlocks.value = "3600";
        validationFeeComposer.value = {
          ...validationFeeComposer.value,
          chain_id: loaded.chainId,
          genesis_hash: loaded.genesisHash,
          ds_asset_id: CBSI_SBD_APP_ASSET_ID,
          ds_scale: 2,
          fee: "0.10",
        };
        seedReferendumWindows(loaded);
        return loaded;
      } catch (error) {
        if (isCurrentRequest()) {
          capabilitiesError.value = toUserFacingErrorMessage(
            error,
            t("Taira governance capabilities are unavailable."),
          );
        }
        return null;
      } finally {
        if (isCurrentRequest()) {
          capabilitiesLoading.value = false;
        }
      }
    };

  const loadCitizenState = async () => {
    const generation = ++citizenGeneration;
    const requestToriiUrl = toriiUrl.value;
    const requestAccountId = accountId.value;
    const requestNetworkPrefix = networkPrefix.value;
    if (!requestToriiUrl || !requestAccountId) {
      citizenStatus.value = null;
      citizenshipLoading.value = false;
      citizenshipStatusError.value = "";
      return;
    }
    citizenshipLoading.value = true;
    citizenshipStatusError.value = "";
    try {
      const status = await Promise.resolve().then(() =>
        getGovernanceCitizenStatus({
          toriiUrl: requestToriiUrl,
          accountId: requestAccountId,
          networkPrefix: requestNetworkPrefix,
        }),
      );
      if (
        generation === citizenGeneration &&
        requestToriiUrl === toriiUrl.value &&
        requestAccountId === accountId.value &&
        requestNetworkPrefix === networkPrefix.value
      ) {
        citizenStatus.value = status;
      }
    } catch (error) {
      if (
        generation === citizenGeneration &&
        requestToriiUrl === toriiUrl.value &&
        requestAccountId === accountId.value &&
        requestNetworkPrefix === networkPrefix.value
      ) {
        citizenStatus.value = null;
        citizenshipStatusError.value = toUserFacingErrorMessage(
          error,
          t("Failed to load governance state."),
        );
      }
    } finally {
      if (
        generation === citizenGeneration &&
        requestToriiUrl === toriiUrl.value &&
        requestAccountId === accountId.value &&
        requestNetworkPrefix === networkPrefix.value
      ) {
        citizenshipLoading.value = false;
      }
    }
  };

  const loadGovernanceCitizenCount = async () => {
    const generation = ++citizenCountGeneration;
    const requestToriiUrl = toriiUrl.value;
    governanceCitizenCountError.value = "";
    if (!requestToriiUrl) {
      governanceCitizenCount.value = null;
      governanceCitizenCountLoading.value = false;
      return;
    }
    governanceCitizenCountLoading.value = true;
    try {
      const count = await Promise.resolve().then(() =>
        getGovernanceCitizenCount(requestToriiUrl),
      );
      if (
        generation === citizenCountGeneration &&
        requestToriiUrl === toriiUrl.value
      ) {
        governanceCitizenCount.value = count;
      }
    } catch (error) {
      if (
        generation === citizenCountGeneration &&
        requestToriiUrl === toriiUrl.value
      ) {
        governanceCitizenCount.value = null;
        governanceCitizenCountError.value = toUserFacingErrorMessage(
          error,
          t("Failed to load governance state."),
        );
      }
    } finally {
      if (
        generation === citizenCountGeneration &&
        requestToriiUrl === toriiUrl.value
      ) {
        governanceCitizenCountLoading.value = false;
      }
    }
  };

  const loadCurrentCouncil = async () => {
    const generation = ++councilGeneration;
    const requestToriiUrl = toriiUrl.value;
    currentCouncilError.value = "";
    if (!requestToriiUrl) {
      currentCouncil.value = null;
      currentCouncilLoading.value = false;
      return;
    }
    currentCouncilLoading.value = true;
    try {
      const council = await Promise.resolve().then(() =>
        getGovernanceCouncilCurrent(requestToriiUrl),
      );
      if (
        generation === councilGeneration &&
        requestToriiUrl === toriiUrl.value
      ) {
        currentCouncil.value = council;
      }
    } catch (error) {
      if (
        generation === councilGeneration &&
        requestToriiUrl === toriiUrl.value
      ) {
        currentCouncil.value = null;
        currentCouncilError.value = toUserFacingErrorMessage(
          error,
          t("Failed to load governance state."),
        );
      }
    } finally {
      if (
        generation === councilGeneration &&
        requestToriiUrl === toriiUrl.value
      ) {
        currentCouncilLoading.value = false;
      }
    }
  };

  const loadUnlockStats = async () => {
    const generation = ++unlockStatsGeneration;
    const requestToriiUrl = toriiUrl.value;
    unlockStatsError.value = "";
    if (!requestToriiUrl) {
      unlockStats.value = null;
      unlockStatsLoading.value = false;
      return;
    }
    unlockStatsLoading.value = true;
    try {
      const stats = await Promise.resolve().then(() =>
        getGovernanceUnlockStats(requestToriiUrl),
      );
      if (
        generation === unlockStatsGeneration &&
        requestToriiUrl === toriiUrl.value
      ) {
        unlockStats.value = stats;
      }
    } catch (error) {
      if (
        generation === unlockStatsGeneration &&
        requestToriiUrl === toriiUrl.value
      ) {
        unlockStats.value = null;
        unlockStatsError.value = toUserFacingErrorMessage(
          error,
          t("Failed to load governance state."),
        );
      }
    } finally {
      if (
        generation === unlockStatsGeneration &&
        requestToriiUrl === toriiUrl.value
      ) {
        unlockStatsLoading.value = false;
      }
    }
  };

  const loadCitizenshipBalance = async () => {
    const generation = ++citizenBalanceGeneration;
    const requestToriiUrl = toriiUrl.value;
    const requestAccountId = accountId.value;
    const requestNetworkPrefix = networkPrefix.value;
    const citizenshipAssetId =
      capabilities.value?.citizenshipAssetId.trim() ?? "";
    citizenshipBalanceError.value = "";
    if (!requestToriiUrl || !requestAccountId || !citizenshipAssetId) {
      citizenshipBalance.value = null;
      return;
    }
    try {
      const items: Awaited<ReturnType<typeof fetchAccountAssets>>["items"] = [];
      let offset = 0;
      let expectedTotal: number | null = null;
      while (expectedTotal === null || offset < expectedTotal) {
        const page = await Promise.resolve().then(() =>
          fetchAccountAssets({
            toriiUrl: requestToriiUrl,
            accountId: requestAccountId,
            networkPrefix: requestNetworkPrefix,
            assetDefinitionId: citizenshipAssetId,
            limit: 200,
            offset,
          }),
        );
        if (
          !Number.isSafeInteger(page.total) ||
          page.total < 0 ||
          (expectedTotal !== null && page.total !== expectedTotal)
        ) {
          throw new Error(
            "Governance bond balance pagination returned an invalid total.",
          );
        }
        expectedTotal ??= page.total;
        if (page.items.length === 0 && offset < expectedTotal) {
          throw new Error(
            "Governance bond balance pagination ended before its declared total.",
          );
        }
        items.push(...page.items);
        offset += page.items.length;
        if (offset > expectedTotal) {
          throw new Error(
            "Governance bond balance pagination exceeded its declared total.",
          );
        }
      }
      if (
        generation === citizenBalanceGeneration &&
        requestToriiUrl === toriiUrl.value &&
        requestAccountId === accountId.value &&
        requestNetworkPrefix === networkPrefix.value &&
        citizenshipAssetId ===
          (capabilities.value?.citizenshipAssetId.trim() ?? "")
      ) {
        citizenshipBalance.value = resolveGovernanceBondBalance(
          items,
          citizenshipAssetId,
          [],
        );
      }
    } catch (error) {
      if (
        generation === citizenBalanceGeneration &&
        requestToriiUrl === toriiUrl.value &&
        requestAccountId === accountId.value &&
        requestNetworkPrefix === networkPrefix.value &&
        citizenshipAssetId ===
          (capabilities.value?.citizenshipAssetId.trim() ?? "")
      ) {
        citizenshipBalance.value = null;
        citizenshipBalanceError.value = toUserFacingErrorMessage(
          error,
          t("Failed to load governance state."),
        );
      }
    }
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
      ds_asset_id: CBSI_SBD_APP_ASSET_ID,
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
    const generation = ++validationFeePolicyGeneration;
    const requestContext = currentCapabilitiesContext.value;
    const requestContextKey = governanceCapabilitiesContextKey(requestContext);
    const isCurrentRequest = () =>
      generation === validationFeePolicyGeneration &&
      requestContextKey === currentCapabilitiesContextKey.value;
    validationFeePolicy.value = null;
    policyError.value = "";
    if (!requestContext.toriiUrl) {
      policyError.value = t("A Torii endpoint is required.");
      return;
    }
    try {
      const current = await getGovernanceCurrentValidationFeePolicy({
        toriiUrl: requestContext.toriiUrl,
        chainId: requestContext.chainId,
        networkPrefix: requestContext.networkPrefix,
      });
      if (!isCurrentRequest()) return;
      validationFeePolicy.value = current;
      syncValidationFeeComposer(current);
    } catch (error) {
      if (!isCurrentRequest()) return;
      validationFeePolicy.value = null;
      policyError.value = toUserFacingErrorMessage(
        error,
        t("Validation-fee policy state is unavailable."),
      );
    }
  };

  const loadPlainReferendumContract = async (
    activeCapabilities: GovernanceCapabilitiesV1 | null = capabilities.value,
  ) => {
    const generation = ++plainReferendumContractGeneration;
    const requestContextKey = currentCapabilitiesContextKey.value;
    const isCurrentRequest = () =>
      generation === plainReferendumContractGeneration &&
      requestContextKey === currentCapabilitiesContextKey.value;
    plainReferendumContract.value = null;
    plainReferendumContractError.value = "";
    plainReferendumContractLoading.value = true;
    try {
      if (
        !activeCapabilities ||
        capabilitiesContextKey.value !== requestContextKey
      ) {
        throw new Error(
          "Verified Taira governance capabilities are required before loading the referendum handoff.",
        );
      }
      const loaded = await getGovernancePlainReferendumContract({
        chainId: activeCapabilities.chainId,
        networkPrefix: activeCapabilities.networkPrefix,
        genesisHash: activeCapabilities.genesisHash,
      });
      if (!isCurrentRequest()) return;
      plainReferendumContract.value = loaded;
      ballotAmount.value = loaded.contract.ballot.amount;
      ballotDurationBlocks.value = loaded.contract.ballot.durationBlocks;
    } catch (error) {
      if (!isCurrentRequest()) return;
      plainReferendumContract.value = null;
      plainReferendumContractError.value = toUserFacingErrorMessage(
        error,
        t("The immutable PLAIN referendum contract is unavailable."),
      );
    } finally {
      if (isCurrentRequest()) {
        plainReferendumContractLoading.value = false;
      }
    }
  };

  const loadProposals = async (
    options: {
      append?: boolean;
      preserveSelection?: boolean;
      verifiedCapabilities?: GovernanceCapabilitiesV1 | null;
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
        await selectProposal(
          proposals.value[0].proposalId,
          options.verifiedCapabilities,
        );
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

  const selectProposal = async (
    proposalId: string,
    verifiedCapabilities?: GovernanceCapabilitiesV1 | null,
  ) => {
    const normalizedId = canonicalGovernanceProposalId(proposalId);
    if (!normalizedId) {
      detailError.value = t(
        "Proposal ID must be 32-byte hex (with or without 0x prefix).",
      );
      return;
    }
    if (!toriiUrl.value) return;
    const proposalChanged = selectedProposalId.value !== normalizedId;
    selectedProposalId.value = normalizedId;
    selectedProposal.value = null;
    detailError.value = "";
    if (proposalChanged) {
      citizenBallotSubmissionState.value = "idle";
      citizenBallotError.value = "";
    }
    const generation = ++detailGeneration;
    busy.value = "detail";
    const contractRequest = (async () => {
      const activeCapabilities =
        verifiedCapabilities === undefined
          ? (capabilities.value ?? (await loadCapabilities()))
          : verifiedCapabilities;
      await loadPlainReferendumContract(activeCapabilities);
    })();
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
      await contractRequest;
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
    const generation = ++bootstrapGeneration;
    const requestContextKey = currentCapabilitiesContextKey.value;
    const isCurrentRequest = () =>
      generation === bootstrapGeneration &&
      requestContextKey === currentCapabilitiesContextKey.value;
    busy.value = "bootstrap";
    void loadCitizenState();
    await Promise.resolve();
    const capabilitiesRequest = loadCapabilities();
    const citizenCountRequest = loadGovernanceCitizenCount();
    const councilRequest = loadCurrentCouncil();
    const unlockStatsRequest = loadUnlockStats();
    const validationFeePolicyRequest = loadValidationFeePolicy();
    const activeCapabilities = await capabilitiesRequest;
    if (!isCurrentRequest()) return;
    await Promise.all([
      citizenCountRequest,
      councilRequest,
      unlockStatsRequest,
      validationFeePolicyRequest,
      loadPlainReferendumContract(activeCapabilities),
    ]);
    if (!isCurrentRequest()) return;
    await loadCitizenshipBalance();
    if (!isCurrentRequest()) return;
    busy.value = null;
    if (deepLinkedProposalId?.trim()) {
      selectedProposalId.value = deepLinkedProposalId.trim();
    }
    await Promise.all([
      loadProposals({
        preserveSelection: true,
        verifiedCapabilities: activeCapabilities,
      }),
      selectedProposalId.value
        ? selectProposal(selectedProposalId.value, activeCapabilities)
        : Promise.resolve(),
    ]);
    if (!isCurrentRequest()) return;
    if (!selectedProposalId.value && proposals.value[0]) {
      await selectProposal(proposals.value[0].proposalId, activeCapabilities);
    }
  };

  const refresh = async () => {
    refreshing.value = true;
    void loadCitizenState();
    await Promise.resolve();
    const capabilitiesRequest = loadCapabilities();
    const citizenCountRequest = loadGovernanceCitizenCount();
    const councilRequest = loadCurrentCouncil();
    const unlockStatsRequest = loadUnlockStats();
    const validationFeePolicyRequest = loadValidationFeePolicy();
    const activeCapabilities = await capabilitiesRequest;
    await Promise.all([
      citizenCountRequest,
      councilRequest,
      unlockStatsRequest,
      validationFeePolicyRequest,
      selectedProposalId.value
        ? Promise.resolve()
        : loadPlainReferendumContract(activeCapabilities),
      loadProposals({ preserveSelection: true }),
      refreshSelectedProposal(),
    ]);
    await loadCitizenshipBalance();
    refreshing.value = false;
  };

  const openComposer = (
    kind: GovernanceWritableProposalKindId = "ValidationFeePayoutLifecycle",
  ) => {
    if (!proposalGate.value.allowed) {
      actionError.value = proposalGate.value.reason;
      return;
    }
    if (!supportedComposerKinds.value.includes(kind)) {
      actionError.value =
        governanceWriteUnavailableReason.value ||
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
    if (!proposalGate.value.allowed) {
      actionError.value = proposalGate.value.reason;
      return;
    }
    busy.value = "prepare";
    try {
      const refreshedCapabilities = await loadCapabilities();
      if (!refreshedCapabilities) {
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
            validationFeePolicyForNativeValidation(policy),
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
          const policyEnactmentTarget =
            validationFeePolicyEnactmentTargetHeight(
              policy.effective_from_height,
            );
          if (
            policyEnactmentTarget === null ||
            lifecycle.enactedAtHeight === null ||
            BigInt(lifecycle.enactedAtHeight) > BigInt(policyEnactmentTarget)
          ) {
            throw new Error(
              "The selected payout lifecycle must enact no later than the policy enactment target.",
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
      citizenBallotError.value = plainVoteGate.value.reason;
      citizenBallotSubmissionState.value = "error";
      return;
    }
    resetActionFeedback();
    citizenBallotError.value = "";
    citizenBallotSubmissionState.value = "preparing";
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
      citizenBallotSubmissionState.value = "reviewing";
    } catch (error) {
      const message = toUserFacingErrorMessage(
        error,
        t("The citizen ballot could not be prepared."),
      );
      actionError.value = message;
      citizenBallotError.value = message;
      citizenBallotSubmissionState.value = "error";
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
    resetActionFeedback();
    actionError.value = enactGate.value.reason;
  };

  const cancelReview = () => {
    if (busy.value !== "commit") {
      if (review.value?.operation === "plain-ballot") {
        citizenBallotSubmissionState.value = "idle";
      }
      review.value = null;
    }
  };

  const pulseFinalizedState = () => {
    finalizedRefresh.value = true;
    if (refreshPulseTimer) clearTimeout(refreshPulseTimer);
    refreshPulseTimer = setTimeout(() => {
      finalizedRefresh.value = false;
    }, 900);
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
    if (prepared.operation === "plain-ballot") {
      citizenBallotError.value = "";
      citizenBallotSubmissionState.value = "submitting";
    }
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
      if (prepared.operation === "plain-ballot") {
        citizenBallotSubmissionState.value = "finalized";
      }
      if (finalized.proposalId) {
        selectedProposalId.value = finalized.proposalId;
        if (composerKind.value === "ValidationFeePayoutLifecycle") {
          validationFeePayoutLifecycleProposalId.value =
            finalized.proposalId.replace(/^0x/u, "");
        }
      }
      pulseFinalizedState();
      await Promise.all([
        loadCitizenState(),
        loadGovernanceCitizenCount(),
        loadCurrentCouncil(),
        loadUnlockStats(),
        loadCitizenshipBalance(),
        loadValidationFeePolicy(),
        loadProposals({ preserveSelection: true }),
        selectedProposalId.value
          ? selectProposal(selectedProposalId.value)
          : Promise.resolve(),
      ]);
    } catch (error) {
      const message = toUserFacingErrorMessage(
        error,
        t("The reviewed action was not finalized."),
      );
      actionError.value = message;
      if (prepared.operation === "plain-ballot") {
        citizenBallotError.value = message;
        citizenBallotSubmissionState.value = "error";
      }
    } finally {
      busy.value = null;
    }
  };

  watch(catalogFilter, () => {
    void loadProposals({ preserveSelection: true });
  });

  watch(
    currentCapabilitiesContextKey,
    (nextContextKey, previousContextKey) => {
      if (nextContextKey === previousContextKey) return;
      capabilitiesGeneration += 1;
      capabilities.value = null;
      capabilitiesContextKey.value = "";
      capabilitiesLoading.value = false;
      capabilitiesError.value = "";
    },
    { flush: "sync" },
  );

  watch(
    [toriiUrl, chainId, accountId, networkPrefix],
    ([nextTorii, nextChain, nextAccount, nextNetworkPrefix], previous) => {
      if (!previous) return;
      const [
        previousTorii,
        previousChain,
        previousAccount,
        previousNetworkPrefix,
      ] = previous;
      if (
        nextTorii === previousTorii &&
        nextChain === previousChain &&
        nextAccount === previousAccount &&
        nextNetworkPrefix === previousNetworkPrefix
      ) {
        return;
      }
      citizenGeneration += 1;
      citizenBalanceGeneration += 1;
      citizenCountGeneration += 1;
      councilGeneration += 1;
      unlockStatsGeneration += 1;
      validationFeePolicyGeneration += 1;
      plainReferendumContractGeneration += 1;
      citizenStatus.value = null;
      citizenshipLoading.value = false;
      citizenshipBalance.value = null;
      citizenshipStatusError.value = "";
      citizenshipBalanceError.value = "";
      governanceCitizenCount.value = null;
      governanceCitizenCountLoading.value = false;
      governanceCitizenCountError.value = "";
      currentCouncil.value = null;
      currentCouncilLoading.value = false;
      currentCouncilError.value = "";
      unlockStats.value = null;
      unlockStatsLoading.value = false;
      unlockStatsError.value = "";
      validationFeePolicy.value = null;
      policyError.value = "";
      plainReferendumContract.value = null;
      plainReferendumContractLoading.value = false;
      plainReferendumContractError.value = "";
      selectedProposalId.value = null;
      selectedProposal.value = null;
      review.value = null;
      citizenBallotSubmissionState.value = "idle";
      citizenBallotError.value = "";
      proposals.value = [];
      bootstrapGeneration += 1;
      void bootstrap();
    },
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
    plainReferendumContract,
    plainReferendumContractLoading,
    plainReferendumContractError,
    activeAccountEligibleForPlainReferendum,
    selectedPlainReferendumContractError,
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
    citizenVoteProjection,
    selectedPublicProposalError,
    citizenBallotSubmissionState,
    citizenBallotError,
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
    loadCitizenState,
    loadGovernanceCitizenCount,
    loadCurrentCouncil,
    loadUnlockStats,
    loadPlainReferendumContract,
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

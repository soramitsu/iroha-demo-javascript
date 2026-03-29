import type {
  AccountAddressView,
  AccountAssetsResponse,
  AccountFaucetResponse,
  AccountOnboardingResponse,
  AccountPermissionsResponse,
  AccountTransactionsResponse,
  ConfidentialAssetPolicyView,
  ConnectPreview,
  ExplorerAccountQrResponse,
  ExplorerMetricsResponse,
  FaucetRequestProgress,
  GovernanceCouncilCurrentResponse,
  GovernanceDraftResponse,
  GovernanceLocksResult,
  GovernanceProposalResult,
  GovernanceReferendumResult,
  GovernanceTallyResult,
  IrohaBridge,
  KaigiCallEvent,
  KaigiMeetingView,
  KaigiMeetingSignalRecord,
  KaigiSignalKeyPair,
  NexusStakingPolicy,
  NexusSumeragiStatus,
  OfflineAllowanceResponse,
  PublicLaneRewardsResponseView,
  PublicLaneStakeResponseView,
  PublicLaneValidatorsResponseView,
  ToriiHealth,
  VpnAvailability,
  VpnAuthContext,
  VpnProfile,
  VpnReceipt,
  VpnStatus,
} from "@/types/iroha";

const bridge = (): IrohaBridge => {
  if (!window.iroha) {
    throw new Error(
      "Iroha bridge is unavailable. Ensure preload script loaded correctly.",
    );
  }
  return window.iroha;
};

export const pingTorii = (toriiUrl: string): Promise<ToriiHealth> =>
  bridge().ping({ toriiUrl });

export const generateKeyPair = () => bridge().generateKeyPair();

export const generateKaigiSignalKeyPair = (): KaigiSignalKeyPair =>
  bridge().generateKaigiSignalKeyPair();

export const deriveAccountAddress = (params: {
  domain: string;
  publicKeyHex: string;
  networkPrefix?: number;
}): AccountAddressView => bridge().deriveAccountAddress(params);

export const derivePublicKey = (privateKeyHex: string) =>
  bridge().derivePublicKey(privateKeyHex);

export const registerAccount = (
  input: Parameters<IrohaBridge["registerAccount"]>[0],
) => bridge().registerAccount(input);

export const transferAsset = (
  input: Parameters<IrohaBridge["transferAsset"]>[0],
) => bridge().transferAsset(input);

export const getConfidentialAssetPolicy = (
  input: Parameters<IrohaBridge["getConfidentialAssetPolicy"]>[0],
): Promise<ConfidentialAssetPolicyView> =>
  bridge().getConfidentialAssetPolicy(input);

export const fetchAccountAssets = (
  input: Parameters<IrohaBridge["fetchAccountAssets"]>[0],
): Promise<AccountAssetsResponse> => bridge().fetchAccountAssets(input);

export const fetchAccountTransactions = (
  input: Parameters<IrohaBridge["fetchAccountTransactions"]>[0],
): Promise<AccountTransactionsResponse> =>
  bridge().fetchAccountTransactions(input);

export const listAccountPermissions = (
  input: Parameters<IrohaBridge["listAccountPermissions"]>[0],
): Promise<AccountPermissionsResponse> =>
  bridge().listAccountPermissions(input);

export const registerCitizen = (
  input: Parameters<IrohaBridge["registerCitizen"]>[0],
) => bridge().registerCitizen(input);

export const getGovernanceProposal = (
  input: Parameters<IrohaBridge["getGovernanceProposal"]>[0],
): Promise<GovernanceProposalResult> => bridge().getGovernanceProposal(input);

export const getGovernanceReferendum = (
  input: Parameters<IrohaBridge["getGovernanceReferendum"]>[0],
): Promise<GovernanceReferendumResult> =>
  bridge().getGovernanceReferendum(input);

export const getGovernanceTally = (
  input: Parameters<IrohaBridge["getGovernanceTally"]>[0],
): Promise<GovernanceTallyResult> => bridge().getGovernanceTally(input);

export const getGovernanceLocks = (
  input: Parameters<IrohaBridge["getGovernanceLocks"]>[0],
): Promise<GovernanceLocksResult> => bridge().getGovernanceLocks(input);

export const getGovernanceCouncilCurrent = (
  toriiUrl: string,
): Promise<GovernanceCouncilCurrentResponse> =>
  bridge().getGovernanceCouncilCurrent({ toriiUrl });

export const submitGovernancePlainBallot = (
  input: Parameters<IrohaBridge["submitGovernancePlainBallot"]>[0],
) => bridge().submitGovernancePlainBallot(input);

export const finalizeGovernanceReferendum = (
  input: Parameters<IrohaBridge["finalizeGovernanceReferendum"]>[0],
): Promise<GovernanceDraftResponse> =>
  bridge().finalizeGovernanceReferendum(input);

export const enactGovernanceProposal = (
  input: Parameters<IrohaBridge["enactGovernanceProposal"]>[0],
): Promise<GovernanceDraftResponse> => bridge().enactGovernanceProposal(input);

export const getExplorerMetrics = (
  toriiUrl: string,
): Promise<ExplorerMetricsResponse | null> =>
  bridge().getExplorerMetrics({ toriiUrl });

export const getExplorerAccountQr = (
  input: Parameters<IrohaBridge["getExplorerAccountQr"]>[0],
): Promise<ExplorerAccountQrResponse> => bridge().getExplorerAccountQr(input);

export const getVpnAvailability = (
  input: Parameters<IrohaBridge["getVpnAvailability"]>[0],
): Promise<VpnAvailability> => bridge().getVpnAvailability(input);

export const getVpnProfile = (
  input: Parameters<IrohaBridge["getVpnProfile"]>[0],
): Promise<VpnProfile | null> => bridge().getVpnProfile(input);

export const getVpnStatus = (
  input?: Partial<VpnAuthContext>,
): Promise<VpnStatus> => bridge().getVpnStatus(input);

export const connectVpn = (
  input: Parameters<IrohaBridge["connectVpn"]>[0],
): Promise<VpnStatus> => bridge().connectVpn(input);

export const disconnectVpn = (
  input: Parameters<IrohaBridge["disconnectVpn"]>[0],
): Promise<VpnStatus> => bridge().disconnectVpn(input);

export const repairVpn = (
  input: Parameters<IrohaBridge["repairVpn"]>[0],
): Promise<VpnStatus> => bridge().repairVpn(input);

export const listVpnReceipts = (
  input?: Partial<VpnAuthContext>,
): Promise<VpnReceipt[]> => bridge().listVpnReceipts(input);

export const listOfflineAllowances = (
  input: Parameters<IrohaBridge["listOfflineAllowances"]>[0],
): Promise<OfflineAllowanceResponse> => bridge().listOfflineAllowances(input);

export const onboardAccount = (input: {
  toriiUrl: string;
  alias: string;
  accountId: string;
  identity?: Record<string, unknown>;
}): Promise<AccountOnboardingResponse> => bridge().onboardAccount(input);

export const requestFaucetFunds = (
  input: {
    toriiUrl: string;
    accountId: string;
  },
  onProgress?: (progress: FaucetRequestProgress) => void | Promise<void>,
): Promise<AccountFaucetResponse> =>
  bridge().requestFaucetFunds(input, onProgress);

export const createKaigiMeeting = (
  input: Parameters<IrohaBridge["createKaigiMeeting"]>[0],
) => bridge().createKaigiMeeting(input);

export const getKaigiCall = (
  input: Parameters<IrohaBridge["getKaigiCall"]>[0],
): Promise<KaigiMeetingView> => bridge().getKaigiCall(input);

export const joinKaigiMeeting = (
  input: Parameters<IrohaBridge["joinKaigiMeeting"]>[0],
) => bridge().joinKaigiMeeting(input);

export const watchKaigiCallEvents = (
  input: Parameters<IrohaBridge["watchKaigiCallEvents"]>[0],
  onEvent: (event: KaigiCallEvent) => void | Promise<void>,
): Promise<string> => bridge().watchKaigiCallEvents(input, onEvent);

export const stopWatchingKaigiCallEvents = (subscriptionId: string): void =>
  bridge().stopWatchingKaigiCallEvents(subscriptionId);

export const pollKaigiMeetingSignals = (
  input: Parameters<IrohaBridge["pollKaigiMeetingSignals"]>[0],
): Promise<KaigiMeetingSignalRecord[]> => bridge().pollKaigiMeetingSignals(input);

export const endKaigiMeeting = (
  input: Parameters<IrohaBridge["endKaigiMeeting"]>[0],
) => bridge().endKaigiMeeting(input);

export const createConnectPreview = (input: {
  toriiUrl: string;
  chainId: string;
  node?: string | null;
}): Promise<ConnectPreview> => bridge().createConnectPreview(input);

export const getSumeragiStatus = (
  toriiUrl: string,
): Promise<NexusSumeragiStatus> => bridge().getSumeragiStatus({ toriiUrl });

export const getNexusPublicLaneValidators = (
  input: Parameters<IrohaBridge["getNexusPublicLaneValidators"]>[0],
): Promise<PublicLaneValidatorsResponseView> =>
  bridge().getNexusPublicLaneValidators(input);

export const getNexusPublicLaneStake = (
  input: Parameters<IrohaBridge["getNexusPublicLaneStake"]>[0],
): Promise<PublicLaneStakeResponseView> =>
  bridge().getNexusPublicLaneStake(input);

export const getNexusPublicLaneRewards = (
  input: Parameters<IrohaBridge["getNexusPublicLaneRewards"]>[0],
): Promise<PublicLaneRewardsResponseView> =>
  bridge().getNexusPublicLaneRewards(input);

export const getNexusStakingPolicy = (
  toriiUrl: string,
): Promise<NexusStakingPolicy> => bridge().getNexusStakingPolicy({ toriiUrl });

export const bondPublicLaneStake = (
  input: Parameters<IrohaBridge["bondPublicLaneStake"]>[0],
) => bridge().bondPublicLaneStake(input);

export const schedulePublicLaneUnbond = (
  input: Parameters<IrohaBridge["schedulePublicLaneUnbond"]>[0],
) => bridge().schedulePublicLaneUnbond(input);

export const finalizePublicLaneUnbond = (
  input: Parameters<IrohaBridge["finalizePublicLaneUnbond"]>[0],
) => bridge().finalizePublicLaneUnbond(input);

export const claimPublicLaneRewards = (
  input: Parameters<IrohaBridge["claimPublicLaneRewards"]>[0],
) => bridge().claimPublicLaneRewards(input);

import type {
  AccountAliasResolutionResponse,
  AccountAddressView,
  AccountAssetsResponse,
  ConfidentialAssetBalanceView,
  AccountFaucetResponse,
  AccountOnboardingResponse,
  AccountPermissionsResponse,
  AccountTransactionsResponse,
  ChainMetadataResponse,
  ConfidentialAssetPolicyView,
  ExplorerAccountQrResponse,
  ExplorerMetricsResponse,
  FaucetRequestProgress,
  GovernanceCitizenCountResponse,
  GovernanceCitizenStatusResponse,
  GovernanceCapabilitiesV1,
  GovernanceCouncilCurrentResponse,
  GovernancePreparedAction,
  GovernanceProposalDetailInput,
  GovernanceProposalListInput,
  GovernanceLifecycleSnapshot,
  GovernancePlainReferendumContractResult,
  GovernanceLocksResult,
  GovernanceProposalResult,
  GovernanceReferendumResult,
  GovernanceTallyResult,
  GovernanceUnlockStatsResponse,
  IrohaBridge,
  KaigiCallEvent,
  KaigiMeetingView,
  KaigiMeetingSignalRecord,
  KaigiSignalKeyPair,
  NexusLifecycleView,
  NexusStakingPolicy,
  NexusSumeragiStatus,
  NetworkStatsResponse,
  OfflineReadinessView,
  PublicLaneRewardsResponseView,
  PublicLaneStakeResponseView,
  PublicLaneValidatorsResponseView,
  SubscriptionActionResponseView,
  SubscriptionListResponseView,
  SubscriptionPlanListResponseView,
  SubscriptionListItemView,
  SoraCloudHfDeployResponseView,
  SoraCloudHfStatusResponseView,
  SoraCloudStatusResponseView,
  SccpCapabilitiesResponse,
  SccpProofManifestSetResponse,
  SccpSoraOutboundMaterialResponse,
  SccpRecentMessagesResponse,
  SigningAlgorithmOption,
  ToriiHealth,
  VpnAvailability,
  VpnAuthContext,
  VpnProfile,
  VpnReceipt,
  VpnStatus,
} from "@/types/iroha";
import type {
  EndpointInspection,
  EndpointNetworkContext,
} from "@/types/endpointInspection";

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

export const getChainMetadata = (
  toriiUrl: string,
): Promise<ChainMetadataResponse> => bridge().getChainMetadata({ toriiUrl });

export const inspectEndpoint = (
  input: EndpointNetworkContext,
): Promise<EndpointInspection> => bridge().inspectEndpoint(input);

export const getSigningAlgorithms = (
  toriiUrl?: string,
): Promise<SigningAlgorithmOption[]> =>
  bridge().getSigningAlgorithms(toriiUrl ? { toriiUrl } : undefined);

export const generateKeyPair = (input?: {
  signingAlgorithm?: string;
  seedHex?: string;
}) => bridge().generateKeyPair(input);

export const generateKaigiSignalKeyPair = (): KaigiSignalKeyPair =>
  bridge().generateKaigiSignalKeyPair();

export const isSecureVaultAvailable = (): Promise<boolean> =>
  bridge().isSecureVaultAvailable();

export const storeAccountSecret = (input: {
  accountId: string;
  privateKeyHex: string;
  signingAlgorithm?: string;
}): Promise<void> => bridge().storeAccountSecret(input);

export const listAccountSecretFlags = (input: {
  accountIds: string[];
}): Promise<Record<string, boolean>> => bridge().listAccountSecretFlags(input);

export const copyTextToClipboard = (text: string): Promise<void> =>
  bridge().copyTextToClipboard({ text });

export const deriveAccountAddress = (params: {
  domain: string;
  publicKeyHex: string;
  networkPrefix?: number;
  signingAlgorithm?: string;
}): AccountAddressView => bridge().deriveAccountAddress(params);

export const derivePublicKey = (
  input:
    | string
    | {
        privateKeyHex: string;
        signingAlgorithm?: string;
      },
) => bridge().derivePublicKey(input);

export const resolveAccountAlias = (input: {
  toriiUrl: string;
  alias: string;
  networkPrefix?: number;
}): Promise<AccountAliasResolutionResponse> =>
  bridge().resolveAccountAlias(input);

export const createConfidentialPaymentAddress = (
  input: Parameters<IrohaBridge["createConfidentialPaymentAddress"]>[0],
) => bridge().createConfidentialPaymentAddress(input);

export const exportConfidentialWalletBackup = (
  input: Parameters<IrohaBridge["exportConfidentialWalletBackup"]>[0],
) => bridge().exportConfidentialWalletBackup(input);

export const importConfidentialWalletBackup = (
  input: Parameters<IrohaBridge["importConfidentialWalletBackup"]>[0],
) => bridge().importConfidentialWalletBackup(input);

export const registerAccount = (
  input: Parameters<IrohaBridge["registerAccount"]>[0],
) => bridge().registerAccount(input);

export const transferAsset = (
  input: Parameters<IrohaBridge["transferAsset"]>[0],
) => bridge().transferAsset(input);

export const setIrohaConnectContext = (
  input: Parameters<IrohaBridge["setIrohaConnectContext"]>[0],
) => bridge().setIrohaConnectContext(input);

export const resetIrohaConnectBoundary = () =>
  bridge().resetIrohaConnectBoundary();

export const prepareIrohaConnectSession = (
  input: Parameters<IrohaBridge["prepareIrohaConnectSession"]>[0],
) => bridge().prepareIrohaConnectSession(input);

export const approveIrohaConnectSession = (
  input: Parameters<IrohaBridge["approveIrohaConnectSession"]>[0],
) => bridge().approveIrohaConnectSession(input);

export const processIrohaConnectFrame = (
  input: Parameters<IrohaBridge["processIrohaConnectFrame"]>[0],
) => bridge().processIrohaConnectFrame(input);

export const approveIrohaConnectRequest = (
  input: Parameters<IrohaBridge["approveIrohaConnectRequest"]>[0],
) => bridge().approveIrohaConnectRequest(input);

export const rejectIrohaConnectRequest = (
  input: Parameters<IrohaBridge["rejectIrohaConnectRequest"]>[0],
) => bridge().rejectIrohaConnectRequest(input);

export const closeIrohaConnectSession = (
  input: Parameters<IrohaBridge["closeIrohaConnectSession"]>[0],
) => bridge().closeIrohaConnectSession(input);

export const getConfidentialAssetPolicy = (
  input: Parameters<IrohaBridge["getConfidentialAssetPolicy"]>[0],
): Promise<ConfidentialAssetPolicyView> =>
  bridge().getConfidentialAssetPolicy(input);

export const getConfidentialAssetBalance = (
  input: Parameters<IrohaBridge["getConfidentialAssetBalance"]>[0],
): Promise<ConfidentialAssetBalanceView> =>
  bridge().getConfidentialAssetBalance(input);

export const scanConfidentialWallet = (
  input: Parameters<IrohaBridge["scanConfidentialWallet"]>[0],
): Promise<ConfidentialAssetBalanceView> =>
  bridge().scanConfidentialWallet(input);

export const getPrivateKaigiConfidentialXorState = (
  input: Parameters<IrohaBridge["getPrivateKaigiConfidentialXorState"]>[0],
) => bridge().getPrivateKaigiConfidentialXorState(input);

export const selfShieldPrivateKaigiXor = (
  input: Parameters<IrohaBridge["selfShieldPrivateKaigiXor"]>[0],
) => bridge().selfShieldPrivateKaigiXor(input);

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

export const getGovernanceCapabilities = (
  toriiUrl: string,
): Promise<GovernanceCapabilitiesV1> =>
  bridge().getGovernanceCapabilities({ toriiUrl });

export const getGovernanceCitizenStatus = (input: {
  toriiUrl: string;
  accountId: string;
  networkPrefix: number;
}): Promise<GovernanceCitizenStatusResponse> =>
  bridge().getGovernanceCitizenStatus(input);

export const getGovernanceCitizenCount = (
  toriiUrl: string,
): Promise<GovernanceCitizenCountResponse> =>
  bridge().getGovernanceCitizenCount({ toriiUrl });

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

export const getGovernanceUnlockStats = (
  toriiUrl: string,
): Promise<GovernanceUnlockStatsResponse> =>
  bridge().getGovernanceUnlockStats({ toriiUrl });

export const getGovernanceCouncilCurrent = (
  toriiUrl: string,
): Promise<GovernanceCouncilCurrentResponse> =>
  bridge().getGovernanceCouncilCurrent({ toriiUrl });

export const listGovernanceProposals = (input: GovernanceProposalListInput) =>
  bridge().listGovernanceProposals(input);

export const getGovernanceProposalDetail = (
  input: GovernanceProposalDetailInput,
) => bridge().getGovernanceProposalDetail(input);

export const getGovernanceCurrentValidationFeePolicy = (
  input: Parameters<IrohaBridge["getGovernanceCurrentValidationFeePolicy"]>[0],
) => bridge().getGovernanceCurrentValidationFeePolicy(input);

export const getGovernancePlainReferendumContract = (
  input: Parameters<IrohaBridge["getGovernancePlainReferendumContract"]>[0],
): Promise<GovernancePlainReferendumContractResult> =>
  bridge().getGovernancePlainReferendumContract(input);

export const prepareGovernanceCitizenRegistration = (
  input: Parameters<IrohaBridge["prepareGovernanceCitizenRegistration"]>[0],
): Promise<GovernancePreparedAction> =>
  bridge().prepareGovernanceCitizenRegistration(input);

export const prepareGovernanceProposal = (
  input: Parameters<IrohaBridge["prepareGovernanceProposal"]>[0],
): Promise<GovernancePreparedAction> =>
  bridge().prepareGovernanceProposal(input);

export const prepareGovernancePlainBallot = (
  input: Parameters<IrohaBridge["prepareGovernancePlainBallot"]>[0],
): Promise<GovernancePreparedAction> =>
  bridge().prepareGovernancePlainBallot(input);

export const prepareGovernanceParliamentBallot = (
  input: Parameters<IrohaBridge["prepareGovernanceParliamentBallot"]>[0],
): Promise<GovernancePreparedAction> =>
  bridge().prepareGovernanceParliamentBallot(input);

export const prepareGovernanceEnact = (
  input: Parameters<IrohaBridge["prepareGovernanceEnact"]>[0],
): Promise<GovernancePreparedAction> => bridge().prepareGovernanceEnact(input);

export const confirmGovernanceAction = (
  input: Parameters<IrohaBridge["confirmGovernanceAction"]>[0],
) => bridge().confirmGovernanceAction(input);

export const getGovernanceLifecycle = (input: {
  toriiUrl: string;
  proposalId?: string | null;
  referendumId?: string | null;
}): Promise<GovernanceLifecycleSnapshot> => {
  const lifecycleLoader = bridge().getGovernanceLifecycle;
  if (!lifecycleLoader) {
    return Promise.reject(
      new Error("Governance lifecycle endpoint is unavailable."),
    );
  }
  return lifecycleLoader(input);
};

export const getExplorerMetrics = (
  toriiUrl: string,
): Promise<ExplorerMetricsResponse | null> =>
  bridge().getExplorerMetrics({ toriiUrl });

export const getNetworkStats = (input: {
  toriiUrl: string;
  assetDefinitionId?: string;
}): Promise<NetworkStatsResponse> => bridge().getNetworkStats(input);

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
  input?: Parameters<IrohaBridge["disconnectVpn"]>[0],
): Promise<VpnStatus> => bridge().disconnectVpn(input);

export const repairVpn = (): Promise<VpnStatus> => bridge().repairVpn();

export const listVpnReceipts = (
  input?: Partial<VpnAuthContext>,
): Promise<VpnReceipt[]> => bridge().listVpnReceipts(input);

export const getOfflineReadiness = (
  input: Parameters<IrohaBridge["getOfflineReadiness"]>[0],
): Promise<OfflineReadinessView> => bridge().getOfflineReadiness(input);

export const onboardAccount = (input: {
  toriiUrl: string;
  chainId: string;
  networkPrefix: number;
  alias: string;
  accountId: string;
  identity?: Record<string, unknown>;
}): Promise<AccountOnboardingResponse> => bridge().onboardAccount(input);

export const requestFaucetFunds = (
  input: {
    toriiUrl: string;
    chainId: string;
    accountId: string;
    networkPrefix: number;
    requestId?: string;
  },
  onProgress?: (progress: FaucetRequestProgress) => void | Promise<void>,
): Promise<AccountFaucetResponse> =>
  bridge().requestFaucetFunds(input, onProgress);

export const cancelFaucetRequest = (input: {
  requestId: string;
}): Promise<{ canceled: boolean }> => bridge().cancelFaucetRequest(input);

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
): Promise<KaigiMeetingSignalRecord[]> =>
  bridge().pollKaigiMeetingSignals(input);

export const endKaigiMeeting = (
  input: Parameters<IrohaBridge["endKaigiMeeting"]>[0],
) => bridge().endKaigiMeeting(input);

export const getSumeragiStatus = (
  toriiUrl: string,
): Promise<NexusSumeragiStatus> => bridge().getSumeragiStatus({ toriiUrl });

export const getNexusLifecycle = (
  toriiUrl: string,
): Promise<NexusLifecycleView> => bridge().getNexusLifecycle({ toriiUrl });

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

export const listSubscriptionPlans = (
  input: Parameters<IrohaBridge["listSubscriptionPlans"]>[0],
): Promise<SubscriptionPlanListResponseView> =>
  bridge().listSubscriptionPlans(input);

export const listSubscriptions = (
  input: Parameters<IrohaBridge["listSubscriptions"]>[0],
): Promise<SubscriptionListResponseView> => bridge().listSubscriptions(input);

export const getSubscription = (
  input: Parameters<IrohaBridge["getSubscription"]>[0],
): Promise<SubscriptionListItemView> => bridge().getSubscription(input);

export const createSubscription = (
  input: Parameters<IrohaBridge["createSubscription"]>[0],
): Promise<SubscriptionActionResponseView> =>
  bridge().createSubscription(input);

export const pauseSubscription = (
  input: Parameters<IrohaBridge["pauseSubscription"]>[0],
): Promise<SubscriptionActionResponseView> => bridge().pauseSubscription(input);

export const resumeSubscription = (
  input: Parameters<IrohaBridge["resumeSubscription"]>[0],
): Promise<SubscriptionActionResponseView> =>
  bridge().resumeSubscription(input);

export const cancelSubscription = (
  input: Parameters<IrohaBridge["cancelSubscription"]>[0],
): Promise<SubscriptionActionResponseView> =>
  bridge().cancelSubscription(input);

export const keepSubscription = (
  input: Parameters<IrohaBridge["keepSubscription"]>[0],
): Promise<SubscriptionActionResponseView> => bridge().keepSubscription(input);

export const chargeSubscriptionNow = (
  input: Parameters<IrohaBridge["chargeSubscriptionNow"]>[0],
): Promise<SubscriptionActionResponseView> =>
  bridge().chargeSubscriptionNow(input);

export const reconcileSubscriptionMutation = (
  input: Parameters<IrohaBridge["reconcileSubscriptionMutation"]>[0],
): Promise<SubscriptionActionResponseView> =>
  bridge().reconcileSubscriptionMutation(input);

export const getSoraCloudStatus = (
  input: Parameters<IrohaBridge["getSoraCloudStatus"]>[0],
): Promise<SoraCloudStatusResponseView> => bridge().getSoraCloudStatus(input);

export const deploySoraCloudHf = (
  input: Parameters<IrohaBridge["deploySoraCloudHf"]>[0],
): Promise<SoraCloudHfDeployResponseView> => bridge().deploySoraCloudHf(input);

export const reconcileSoraCloudHfLaunch = (
  input: Parameters<IrohaBridge["reconcileSoraCloudHfLaunch"]>[0],
): Promise<SoraCloudHfDeployResponseView> =>
  bridge().reconcileSoraCloudHfLaunch(input);

export const getSoraCloudHfStatus = (
  input: Parameters<IrohaBridge["getSoraCloudHfStatus"]>[0],
): Promise<SoraCloudHfStatusResponseView> =>
  bridge().getSoraCloudHfStatus(input);

export const getParameters = (
  input: Parameters<IrohaBridge["getParameters"]>[0],
): Promise<Record<string, unknown>> => bridge().getParameters(input);

export const getSccpCapabilities = (
  input: Parameters<IrohaBridge["getSccpCapabilities"]>[0],
): Promise<SccpCapabilitiesResponse> => bridge().getSccpCapabilities(input);

export const getSccpProofManifests = (
  input: Parameters<IrohaBridge["getSccpProofManifests"]>[0],
): Promise<SccpProofManifestSetResponse> =>
  bridge().getSccpProofManifests(input);

export const getSccpSoraOutboundMaterial = (
  input: Parameters<IrohaBridge["getSccpSoraOutboundMaterial"]>[0],
): Promise<SccpSoraOutboundMaterialResponse> =>
  bridge().getSccpSoraOutboundMaterial(input);

export const listSccpRecentMessages = (
  input: Parameters<IrohaBridge["listSccpRecentMessages"]>[0],
): Promise<SccpRecentMessagesResponse> =>
  bridge().listSccpRecentMessages(input);

export const getSccpMessageProofBundle = (
  input: Parameters<IrohaBridge["getSccpMessageProofBundle"]>[0],
): Promise<Record<string, unknown>> =>
  bridge().getSccpMessageProofBundle(input);

export const getSccpMessageProofArtifact = (
  input: Parameters<IrohaBridge["getSccpMessageProofArtifact"]>[0],
): Promise<Record<string, unknown>> =>
  bridge().getSccpMessageProofArtifact(input);

export const getSccpMessageProofJob = (
  input: Parameters<IrohaBridge["getSccpMessageProofJob"]>[0],
): Promise<Record<string, unknown>> => bridge().getSccpMessageProofJob(input);

export const submitSccpBridgeProof = (
  input: Parameters<IrohaBridge["submitSccpBridgeProof"]>[0],
): Promise<Record<string, unknown>> => bridge().submitSccpBridgeProof(input);

export const submitSccpBridgeMessage = (
  input: Parameters<IrohaBridge["submitSccpBridgeMessage"]>[0],
): Promise<Record<string, unknown>> => bridge().submitSccpBridgeMessage(input);

export const waitForSccpTransactionCommit = (
  input: Parameters<IrohaBridge["waitForSccpTransactionCommit"]>[0],
): Promise<Record<string, unknown>> =>
  bridge().waitForSccpTransactionCommit(input);

export const deploySccpTairaInboundSettlementContract = (
  input: Parameters<IrohaBridge["deploySccpTairaInboundSettlementContract"]>[0],
): Promise<Record<string, unknown> | null> =>
  bridge().deploySccpTairaInboundSettlementContract(input);

export const deriveZkIvmPayload = (
  input: Parameters<IrohaBridge["deriveZkIvmPayload"]>[0],
): Promise<Record<string, unknown>> => bridge().deriveZkIvmPayload(input);

export const startZkIvmProveJob = (
  input: Parameters<IrohaBridge["startZkIvmProveJob"]>[0],
): Promise<Record<string, unknown>> => bridge().startZkIvmProveJob(input);

export const getZkIvmProveJob = (
  input: Parameters<IrohaBridge["getZkIvmProveJob"]>[0],
): Promise<Record<string, unknown>> => bridge().getZkIvmProveJob(input);

export const cancelZkIvmProveJob = (
  input: Parameters<IrohaBridge["cancelZkIvmProveJob"]>[0],
): Promise<Record<string, unknown>> => bridge().cancelZkIvmProveJob(input);

export const submitZkIvmProvedTransaction = (
  input: Parameters<IrohaBridge["submitZkIvmProvedTransaction"]>[0],
): Promise<Record<string, unknown>> =>
  bridge().submitZkIvmProvedTransaction(input);

export const getTronTransaction = (
  input: Parameters<IrohaBridge["getTronTransaction"]>[0],
): Promise<Record<string, unknown>> => bridge().getTronTransaction(input);

export const getTronAccount = (
  input: Parameters<IrohaBridge["getTronAccount"]>[0],
): Promise<Record<string, unknown>> => bridge().getTronAccount(input);

export const getTronTransactionReceipt = (
  input: Parameters<IrohaBridge["getTronTransactionReceipt"]>[0],
): Promise<Record<string, unknown>> =>
  bridge().getTronTransactionReceipt(input);

export const getTronTransactionEvents = (
  input: Parameters<IrohaBridge["getTronTransactionEvents"]>[0],
): Promise<Record<string, unknown>> => bridge().getTronTransactionEvents(input);

export const getTronSolidBlock = (
  input?: Parameters<IrohaBridge["getTronSolidBlock"]>[0],
): Promise<Record<string, unknown>> => bridge().getTronSolidBlock(input);

export const getTronWitnesses = (
  input?: Parameters<IrohaBridge["getTronWitnesses"]>[0],
): Promise<Record<string, unknown>> => bridge().getTronWitnesses(input);

export const getTronFinalityData = (
  input?: Parameters<IrohaBridge["getTronFinalityData"]>[0],
): Promise<Record<string, unknown>> => bridge().getTronFinalityData(input);

export const getSccpNileTestTronSigner = (): ReturnType<
  IrohaBridge["getSccpNileTestTronSigner"]
> => bridge().getSccpNileTestTronSigner();

export const signSccpNileTestTronTransaction = (
  input: Parameters<IrohaBridge["signSccpNileTestTronTransaction"]>[0],
): ReturnType<IrohaBridge["signSccpNileTestTronTransaction"]> =>
  bridge().signSccpNileTestTronTransaction(input);

export const broadcastTronTransaction = (
  input: Parameters<IrohaBridge["broadcastTronTransaction"]>[0],
): Promise<Record<string, unknown>> => bridge().broadcastTronTransaction(input);

export const triggerTronSmartContract = (
  input: Parameters<IrohaBridge["triggerTronSmartContract"]>[0],
): Promise<Record<string, unknown>> => bridge().triggerTronSmartContract(input);

export const triggerTronConstantContract = (
  input: Parameters<IrohaBridge["triggerTronConstantContract"]>[0],
): Promise<Record<string, unknown>> =>
  bridge().triggerTronConstantContract(input);

export const callEvmRpc = (
  input: Parameters<IrohaBridge["callEvmRpc"]>[0],
): Promise<unknown> => bridge().callEvmRpc(input);

export const getEvmChainId = (
  input?: Parameters<IrohaBridge["getEvmChainId"]>[0],
): Promise<string> => bridge().getEvmChainId(input);

export const getEvmBalance = (
  input: Parameters<IrohaBridge["getEvmBalance"]>[0],
): Promise<string> => bridge().getEvmBalance(input);

export const getEvmCode = (
  input: Parameters<IrohaBridge["getEvmCode"]>[0],
): Promise<string> => bridge().getEvmCode(input);

export const callEvmContract = (
  input: Parameters<IrohaBridge["callEvmContract"]>[0],
): Promise<string> => bridge().callEvmContract(input);

export const getEvmTransactionReceipt = (
  input: Parameters<IrohaBridge["getEvmTransactionReceipt"]>[0],
): Promise<Record<string, unknown> | null> =>
  bridge().getEvmTransactionReceipt(input);

export const getEvmTransaction = (
  input: Parameters<IrohaBridge["getEvmTransaction"]>[0],
): Promise<Record<string, unknown> | null> => bridge().getEvmTransaction(input);

export const getEvmBlockByHash = (
  input: Parameters<IrohaBridge["getEvmBlockByHash"]>[0],
): Promise<Record<string, unknown> | null> => bridge().getEvmBlockByHash(input);

export const getEvmLogs = (
  input: Parameters<IrohaBridge["getEvmLogs"]>[0],
): Promise<Record<string, unknown>[]> => bridge().getEvmLogs(input);

export const callSolanaRpc = (
  input: Parameters<IrohaBridge["callSolanaRpc"]>[0],
): Promise<unknown> => bridge().callSolanaRpc(input);

export const getSolanaBalance = (
  input: Parameters<IrohaBridge["getSolanaBalance"]>[0],
): Promise<string> => bridge().getSolanaBalance(input);

export const getSolanaTokenBalance = (
  input: Parameters<IrohaBridge["getSolanaTokenBalance"]>[0],
): Promise<Record<string, unknown>> => bridge().getSolanaTokenBalance(input);

export const prepareSolanaAssociatedTokenAccount = (
  input: Parameters<IrohaBridge["prepareSolanaAssociatedTokenAccount"]>[0],
) => bridge().prepareSolanaAssociatedTokenAccount(input);

export const getSolanaSignatureStatus = (
  input: Parameters<IrohaBridge["getSolanaSignatureStatus"]>[0],
): Promise<Record<string, unknown> | null> =>
  bridge().getSolanaSignatureStatus(input);

export const getSolanaTransaction = (
  input: Parameters<IrohaBridge["getSolanaTransaction"]>[0],
): Promise<Record<string, unknown> | null> =>
  bridge().getSolanaTransaction(input);

export const buildSolanaTransaction = (
  input: Parameters<IrohaBridge["buildSolanaTransaction"]>[0],
): Promise<string> => bridge().buildSolanaTransaction(input);

export const broadcastSolanaTransaction = (
  input: Parameters<IrohaBridge["broadcastSolanaTransaction"]>[0],
): Promise<string> => bridge().broadcastSolanaTransaction(input);

export const bondPublicLaneStake = (
  input: Parameters<IrohaBridge["bondPublicLaneStake"]>[0],
) => bridge().bondPublicLaneStake(input);

export const registerPublicLaneValidator = (
  input: Parameters<IrohaBridge["registerPublicLaneValidator"]>[0],
) => bridge().registerPublicLaneValidator(input);

export const schedulePublicLaneUnbond = (
  input: Parameters<IrohaBridge["schedulePublicLaneUnbond"]>[0],
) => bridge().schedulePublicLaneUnbond(input);

export const finalizePublicLaneUnbond = (
  input: Parameters<IrohaBridge["finalizePublicLaneUnbond"]>[0],
) => bridge().finalizePublicLaneUnbond(input);

export const claimPublicLaneRewards = (
  input: Parameters<IrohaBridge["claimPublicLaneRewards"]>[0],
) => bridge().claimPublicLaneRewards(input);

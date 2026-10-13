import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import type { FirstReleaseIpcInputKind } from "../electron/firstReleaseIpcInput";

const preloadSource = readFileSync(resolve("electron/preload.ts"), "utf8");
const apiStart = preloadSource.indexOf("const api: IrohaBridge = {");
const apiEnd = preloadSource.indexOf(
  "contextBridge.exposeInMainWorld(",
  apiStart,
);
const apiSource = preloadSource.slice(apiStart, apiEnd);

type MethodBoundary = Readonly<{
  name: string;
  firstArgument: string;
  start: number;
}>;

const methodBoundaries = (): MethodBoundary[] => {
  const methods: MethodBoundary[] = [];
  const pattern = /^ {2}(?:async )?([A-Za-z][A-Za-z0-9]*)\(([^)]*)\) \{/gmu;
  for (const match of apiSource.matchAll(pattern)) {
    const firstArgument = match[2]?.split(",", 1)[0]?.trim() ?? "";
    methods.push({
      name: match[1] ?? "",
      firstArgument,
      start: match.index,
    });
  }
  return methods;
};

const EXPECTED_INPUT_KINDS = {
  ping: "toriiConfig",
  getChainMetadata: "toriiConfig",
  inspectEndpoint: "endpointInspection",
  confirmEndpointNetworkIdentity: "endpointNetworkIdentityConfirm",
  getSigningAlgorithms: "toriiConfig",
  generateKeyPair: "generateKeyPair",
  storeAccountSecret: "storeAccountSecret",
  listAccountSecretFlags: "listAccountSecretFlags",
  copyTextToClipboard: "copyTextToClipboard",
  deriveAccountAddress: "deriveAccountAddress",
  validateCanonicalAccountId: "validateCanonicalAccountId",
  derivePublicKey: "derivePublicKey",
  resolveAccountAlias: "resolveAccountAlias",
  createConfidentialPaymentAddress: "createConfidentialPaymentAddress",
  exportConfidentialWalletBackup: "exportConfidentialWalletBackup",
  importConfidentialWalletBackup: "importConfidentialWalletBackup",
  registerAccount: "registerAccount",
  transferAsset: "transferAsset",
  setIrohaConnectContext: "irohaConnectContext",
  prepareIrohaConnectSession: "irohaConnectPrepareSession",
  approveIrohaConnectSession: "irohaConnectApproveSession",
  processIrohaConnectFrame: "irohaConnectProcessFrame",
  approveIrohaConnectRequest: "irohaConnectApproveRequest",
  rejectIrohaConnectRequest: "irohaConnectRejectRequest",
  closeIrohaConnectSession: "irohaConnectCloseSession",
  getConfidentialAssetPolicy: "confidentialAssetPolicy",
  getConfidentialAssetBalance: "confidentialAssetBalance",
  scanConfidentialWallet: "confidentialAssetBalance",
  fetchAccountAssets: "accountAssets",
  fetchAccountTransactions: "accountTransactions",
  listAccountPermissions: "accountPermissions",
  getGovernanceCapabilities: "governanceCapabilities",
  getGovernanceCitizenStatus: "governanceCitizenStatus",
  getGovernanceCitizenCount: "governanceCitizenCount",
  getGovernanceUnlockStats: "governanceUnlockStats",
  getGovernanceCouncilCurrent: "governanceCouncilCurrent",
  listGovernanceProposals: "governanceProposalList",
  getGovernanceProposalDetail: "governanceProposalDetail",
  getGovernanceCurrentValidationFeePolicy: "governanceValidationFeePolicy",
  prepareGovernanceCitizenRegistration: "governanceCitizenRegistration",
  prepareGovernanceProposal: "governanceProposalPrepare",
  confirmGovernanceAction: "governanceConfirm",
  getExplorerMetrics: "toriiConfig",
  getNetworkStats: "networkStats",
  getExplorerAccountQr: "explorerAccountQr",
  getVpnAvailability: "vpnAvailability",
  getVpnProfile: "vpnAvailability",
  getVpnStatus: "vpnAuthenticatedContext",
  connectVpn: "vpnConnect",
  disconnectVpn: "vpnAuthenticatedContext",
  listVpnReceipts: "vpnAuthenticatedContext",
  onboardAccount: "onboardAccount",
  requestFaucetFunds: "faucetRequest",
  cancelFaucetRequest: "faucetCancel",
  createKaigiMeeting: "kaigiCreate",
  getKaigiCall: "kaigiGet",
  joinKaigiMeeting: "kaigiJoin",
  watchKaigiCallEvents: "kaigiWatch",
  stopWatchingKaigiCallEvents: "kaigiStopWatch",
  pollKaigiMeetingSignals: "kaigiPoll",
  endKaigiMeeting: "kaigiEnd",
  getSumeragiStatus: "toriiConfig",
  getNexusLifecycle: "toriiConfig",
  getNexusPublicLaneValidators: "publicLaneValidators",
  getNexusPublicLaneStake: "publicLaneStake",
  getNexusPublicLaneRewards: "publicLaneRewards",
  getNexusStakingPolicy: "toriiConfig",
  listSubscriptionPlans: "subscriptionListPlans",
  listSubscriptions: "subscriptionList",
  getSubscription: "subscriptionGet",
  createSubscription: "subscriptionCreate",
  pauseSubscription: "subscriptionPause",
  resumeSubscription: "subscriptionResume",
  cancelSubscription: "subscriptionCancel",
  keepSubscription: "subscriptionKeep",
  chargeSubscriptionNow: "subscriptionChargeNow",
  reconcileSubscriptionMutation: "subscriptionReconcile",
  getSoraCloudStatus: "soraCloudStatus",
  getSoraCloudHfSharedLeaseStatus: "soraCloudHfSharedLeaseStatus",
  getParameters: "toriiConfig",
  bondPublicLaneStake: "stakingBond",
  registerPublicLaneValidator: "stakingRegisterValidator",
  schedulePublicLaneUnbond: "stakingScheduleUnbond",
  finalizePublicLaneUnbond: "stakingFinalizeUnbond",
  claimPublicLaneRewards: "stakingClaimRewards",
} as const satisfies Record<string, FirstReleaseIpcInputKind>;

describe("preload renderer input coverage", () => {
  it("enumerates every argument-bearing exposed method", () => {
    expect(apiStart).toBeGreaterThanOrEqual(0);
    expect(apiEnd).toBeGreaterThan(apiStart);
    const exposedInputMethods = methodBoundaries()
      .filter(({ firstArgument }) => firstArgument.length > 0)
      .map(({ name }) => name);

    expect(exposedInputMethods).toEqual(Object.keys(EXPECTED_INPUT_KINDS));
  });

  it("applies the method's exact-key schema before using renderer fields", () => {
    const methods = methodBoundaries();
    for (const [index, method] of methods.entries()) {
      if (!method.firstArgument) continue;
      const kind = Object.prototype.hasOwnProperty.call(
        EXPECTED_INPUT_KINDS,
        method.name,
      )
        ? EXPECTED_INPUT_KINDS[method.name as keyof typeof EXPECTED_INPUT_KINDS]
        : undefined;
      expect(
        kind,
        `missing schema declaration for ${method.name}`,
      ).toBeDefined();
      const nextStart = methods[index + 1]?.start ?? apiSource.length;
      const implementation = apiSource.slice(method.start, nextStart);
      const boundaryPattern = new RegExp(
        `requireFirstReleaseIpcInput\\(\\s*${method.firstArgument},\\s*"${kind}"`,
        "u",
      );
      expect(
        implementation,
        `${method.name} must snapshot its exact renderer DTO`,
      ).toMatch(boundaryPattern);
      const boundaryIndex = implementation.search(boundaryPattern);
      const beforeBoundary = implementation.slice(0, boundaryIndex);
      expect(beforeBoundary).not.toMatch(
        new RegExp(`\\b${method.firstArgument}\\s*(?:\\.|\\[)`, "u"),
      );
      expect(beforeBoundary).not.toMatch(
        new RegExp(
          `(?:const|let|var)\\s*\\{[^;]*\\}\\s*=\\s*${method.firstArgument}\\b`,
          "su",
        ),
      );
    }
  });
});

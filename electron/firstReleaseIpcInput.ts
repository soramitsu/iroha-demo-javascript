export type FirstReleaseIpcObjectSchema = Readonly<{
  label: string;
  required: readonly string[];
  optional?: readonly string[];
}>;

const hasOwn = (value: object, key: PropertyKey): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

/**
 * Copy one renderer-supplied DTO after proving it is a plain, exact-key data
 * object. The copy prevents callers from validating one object shape and then
 * reading a subsequently mutated set of fields.
 */
export const requireFirstReleaseIpcInputObject = <T extends object>(
  value: unknown,
  schema: FirstReleaseIpcObjectSchema,
): Readonly<T> => {
  let prototype: object | null;
  try {
    prototype =
      value !== null && typeof value === "object"
        ? Object.getPrototypeOf(value)
        : null;
  } catch {
    throw new Error(`${schema.label} must be an exact object.`);
  }
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (prototype !== Object.prototype && prototype !== null)
  ) {
    throw new Error(`${schema.label} must be an exact object.`);
  }

  const allowed = new Set([...schema.required, ...(schema.optional ?? [])]);
  const enumerableOwnKeys: string[] = [];
  try {
    // Do not materialize every key on an untrusted object. An oversized object
    // must fail after at most one more field than this exact schema permits.
    for (const key in value as object) {
      if (!hasOwn(value as object, key)) continue;
      if (!allowed.has(key) || enumerableOwnKeys.length >= allowed.size) {
        throw new Error(`${schema.label} has an unsupported shape.`);
      }
      enumerableOwnKeys.push(key);
    }
  } catch {
    throw new Error(`${schema.label} has an unsupported shape.`);
  }
  // Symbols cannot cross Electron's data-object bridge. Retain the explicit
  // same-realm rejection without building a string-key list proportional to
  // attacker-controlled input.
  if (Object.getOwnPropertySymbols(value as object).length !== 0) {
    throw new Error(`${schema.label} must contain only named fields.`);
  }

  if (
    schema.required.some((key) => !hasOwn(value, key)) ||
    enumerableOwnKeys.length < schema.required.length
  ) {
    throw new Error(`${schema.label} has an unsupported shape.`);
  }

  const snapshot: Record<string, unknown> = {};
  for (const key of allowed) {
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Object.getOwnPropertyDescriptor(value, key);
    } catch {
      throw new Error(`${schema.label} has an unsupported shape.`);
    }
    if (!descriptor) continue;
    if (
      !descriptor.enumerable ||
      !("value" in descriptor) ||
      descriptor.value === undefined
    ) {
      throw new Error(`${schema.label} has an unsupported shape.`);
    }
    snapshot[key] = descriptor.value;
  }
  return Object.freeze(snapshot) as Readonly<T>;
};

export const FIRST_RELEASE_IPC_INPUT_SCHEMAS = {
  toriiConfig: {
    label: "Torii configuration input",
    required: ["toriiUrl"],
  },
  endpointInspection: {
    label: "Endpoint inspection input",
    required: ["toriiUrl", "chainId", "networkPrefix"],
  },
  endpointNetworkIdentityConfirm: {
    label: "Endpoint network identity confirmation input",
    required: ["toriiUrl", "networkId"],
  },
  generateKeyPair: {
    label: "Generate key pair input",
    required: ["signingAlgorithm"],
    optional: ["seedHex"],
  },
  storeAccountSecret: {
    label: "Store account secret input",
    required: [
      "accountId",
      "networkPrefix",
      "privateKeyHex",
      "signingAlgorithm",
    ],
  },
  listAccountSecretFlags: {
    label: "List account secret flags input",
    required: ["accountIds", "networkPrefix"],
  },
  copyTextToClipboard: {
    label: "Copy text to clipboard input",
    required: ["text"],
  },
  deriveAccountAddress: {
    label: "Derive account address input",
    required: ["domain", "publicKeyHex", "networkPrefix", "signingAlgorithm"],
  },
  validateCanonicalAccountId: {
    label: "Validate canonical account ID input",
    required: ["accountId"],
    optional: ["networkPrefix"],
  },
  derivePublicKey: {
    label: "Derive public key input",
    required: ["privateKeyHex", "signingAlgorithm"],
  },
  resolveAccountAlias: {
    label: "Resolve account alias input",
    required: ["toriiUrl", "alias", "networkPrefix"],
  },
  createConfidentialPaymentAddress: {
    label: "Create confidential payment address input",
    required: ["accountId", "networkPrefix"],
  },
  exportConfidentialWalletBackup: {
    label: "Export confidential wallet backup input",
    required: ["toriiUrl", "chainId", "networkPrefix", "accountId", "mnemonic"],
  },
  importConfidentialWalletBackup: {
    label: "Import confidential wallet backup input",
    required: [
      "toriiUrl",
      "chainId",
      "networkPrefix",
      "accountId",
      "mnemonic",
      "confidentialWallet",
    ],
  },
  registerAccount: {
    label: "Register account input",
    required: [
      "toriiUrl",
      "chainId",
      "networkPrefix",
      "accountId",
      "authorityAccountId",
    ],
    optional: ["metadata"],
  },
  transferAsset: {
    label: "Transfer asset input",
    required: [
      "toriiUrl",
      "chainId",
      "assetDefinitionId",
      "accountId",
      "destinationAccountId",
      "networkPrefix",
      "quantity",
    ],
    optional: ["memo"],
  },
  confidentialAssetPolicy: {
    label: "Confidential asset policy input",
    required: ["toriiUrl", "accountId", "assetDefinitionId"],
  },
  confidentialAssetBalance: {
    label: "Confidential asset balance input",
    required: [
      "toriiUrl",
      "chainId",
      "networkPrefix",
      "accountId",
      "assetDefinitionId",
    ],
  },
  accountAssets: {
    label: "Account assets input",
    required: ["toriiUrl", "accountId", "networkPrefix"],
    optional: ["assetDefinitionId", "limit", "offset"],
  },
  accountTransactions: {
    label: "Account transactions input",
    required: ["toriiUrl", "accountId", "networkPrefix"],
    optional: ["limit", "offset"],
  },
  accountPermissions: {
    label: "Account permissions input",
    required: ["toriiUrl", "accountId", "networkPrefix"],
    optional: ["limit", "offset"],
  },
  networkStats: {
    label: "Network statistics input",
    required: ["toriiUrl", "assetDefinitionId", "networkPrefix"],
  },
  explorerAccountQr: {
    label: "Explorer account QR input",
    required: ["toriiUrl", "accountId", "networkPrefix"],
  },
  vpnAvailability: {
    label: "VPN availability input",
    required: ["toriiUrl"],
  },
  irohaConnectContext: {
    label: "IrohaConnect wallet context",
    required: [
      "toriiUrl",
      "chainId",
      "networkPrefix",
      "networkId",
      "accountId",
    ],
  },
  irohaConnectPrepareSession: {
    label: "Prepare IrohaConnect session input",
    required: [
      "context",
      "sid",
      "appPublicKeyHex",
      "nonceBase64Url",
      "relayToken",
      "requestedNetworkId",
      "permissions",
    ],
  },
  irohaConnectApproveSession: {
    label: "Approve IrohaConnect session input",
    required: ["approvalToken"],
  },
  irohaConnectProcessFrame: {
    label: "Process IrohaConnect frame input",
    required: ["sessionToken", "frameBase64"],
  },
  irohaConnectApproveRequest: {
    label: "Approve IrohaConnect request input",
    required: ["sessionToken", "requestToken"],
  },
  irohaConnectRejectRequest: {
    label: "Reject IrohaConnect request input",
    required: ["sessionToken", "requestToken"],
  },
  irohaConnectCloseSession: {
    label: "Close IrohaConnect session input",
    required: ["sessionToken"],
  },
  vpnAuthenticatedContext: {
    label: "Authenticated VPN context",
    required: ["toriiUrl", "chainId", "accountId", "networkPrefix"],
  },
  vpnConnect: {
    label: "Connect VPN input",
    required: [
      "toriiUrl",
      "chainId",
      "accountId",
      "networkPrefix",
      "exitClass",
    ],
  },
  onboardAccount: {
    label: "Onboard account input",
    required: ["toriiUrl", "chainId", "networkPrefix", "alias", "accountId"],
    optional: ["identity"],
  },
  faucetRequest: {
    label: "Faucet request input",
    required: [
      "toriiUrl",
      "chainId",
      "accountId",
      "networkPrefix",
      "requestId",
    ],
  },
  faucetCancel: {
    label: "Faucet cancellation input",
    required: ["requestId"],
  },
  governanceCapabilities: {
    label: "Governance capabilities input",
    required: ["toriiUrl"],
  },
  governanceCitizenStatus: {
    label: "Governance citizen status input",
    required: ["toriiUrl", "accountId", "networkPrefix"],
  },
  governanceCitizenCount: {
    label: "Governance citizen count input",
    required: ["toriiUrl"],
  },
  governanceUnlockStats: {
    label: "Governance unlock statistics input",
    required: ["toriiUrl", "chainId", "networkPrefix", "accountId"],
  },
  governanceCouncilCurrent: {
    label: "Governance current council input",
    required: ["toriiUrl"],
  },
  governanceProposalList: {
    label: "Governance proposal list input",
    required: ["toriiUrl"],
    optional: ["limit", "cursor"],
  },
  governanceProposalDetail: {
    label: "Governance proposal detail input",
    required: ["toriiUrl", "networkPrefix", "proposalId"],
  },
  governanceValidationFeePolicy: {
    label: "Governance validation-fee policy input",
    required: ["toriiUrl", "chainId", "networkPrefix"],
  },
  governanceCitizenRegistration: {
    label: "Governance citizen registration input",
    required: ["toriiUrl", "chainId", "accountId", "networkPrefix", "amount"],
  },
  governanceProposalPrepare: {
    label: "Governance proposal prepare input",
    required: [
      "toriiUrl",
      "chainId",
      "accountId",
      "networkPrefix",
      "kind",
      "payload",
    ],
  },
  governanceConfirm: {
    label: "Governance confirmation input",
    required: ["reviewId", "accountId"],
  },
  kaigiCreate: {
    label: "Create Kaigi meeting input",
    required: [
      "toriiUrl",
      "chainId",
      "networkPrefix",
      "hostAccountId",
      "callId",
      "scheduledStartMs",
      "meetingCode",
      "inviteSecretBase64Url",
      "hostDisplayName",
      "hostParticipantId",
      "hostKaigiPublicKeyBase64Url",
      "offerDescription",
      "privacyMode",
    ],
    optional: ["title"],
  },
  kaigiGet: {
    label: "Get Kaigi meeting input",
    required: ["toriiUrl", "networkPrefix", "callId", "inviteSecretBase64Url"],
  },
  kaigiJoin: {
    label: "Join Kaigi meeting input",
    required: [
      "toriiUrl",
      "chainId",
      "networkPrefix",
      "participantAccountId",
      "callId",
      "inviteSecretBase64Url",
      "participantId",
      "participantName",
      "answerDescription",
    ],
  },
  kaigiWatch: {
    label: "Watch Kaigi meeting input",
    required: ["toriiUrl", "callId"],
  },
  kaigiStopWatch: {
    label: "Stop watching Kaigi meeting input",
    required: ["subscriptionId"],
  },
  kaigiPoll: {
    label: "Poll Kaigi meeting signals input",
    required: [
      "toriiUrl",
      "chainId",
      "networkPrefix",
      "accountId",
      "callId",
      "hostKaigiKeys",
    ],
    optional: ["afterTimestampMs", "limit"],
  },
  kaigiEnd: {
    label: "End Kaigi meeting input",
    required: [
      "toriiUrl",
      "chainId",
      "networkPrefix",
      "hostAccountId",
      "callId",
    ],
    optional: ["endedAtMs"],
  },
  publicLaneValidators: {
    label: "Public lane validators input",
    required: ["toriiUrl", "laneId"],
  },
  publicLaneStake: {
    label: "Public lane stake input",
    required: ["toriiUrl", "networkPrefix", "laneId"],
    optional: ["validator"],
  },
  publicLaneRewards: {
    label: "Public lane rewards input",
    required: ["toriiUrl", "networkPrefix", "laneId", "account"],
    optional: ["assetId", "uptoEpoch"],
  },
  subscriptionListPlans: {
    label: "List subscription plans input",
    required: ["toriiUrl"],
    optional: ["provider", "limit", "offset"],
  },
  subscriptionList: {
    label: "List subscriptions input",
    required: ["toriiUrl"],
    optional: ["ownedBy", "provider", "status", "limit", "offset"],
  },
  subscriptionGet: {
    label: "Get subscription input",
    required: ["toriiUrl", "subscriptionId"],
  },
  subscriptionCreate: {
    label: "Create subscription input",
    required: [
      "toriiUrl",
      "chainId",
      "networkPrefix",
      "accountId",
      "subscriptionId",
      "planId",
    ],
    optional: ["firstChargeMs"],
  },
  subscriptionPause: {
    label: "Pause subscription input",
    required: [
      "toriiUrl",
      "chainId",
      "networkPrefix",
      "accountId",
      "subscriptionId",
    ],
  },
  subscriptionResume: {
    label: "Resume subscription input",
    required: [
      "toriiUrl",
      "chainId",
      "networkPrefix",
      "accountId",
      "subscriptionId",
    ],
    optional: ["chargeAtMs"],
  },
  subscriptionCancel: {
    label: "Cancel subscription input",
    required: [
      "toriiUrl",
      "chainId",
      "networkPrefix",
      "accountId",
      "subscriptionId",
      "cancelMode",
    ],
  },
  subscriptionKeep: {
    label: "Keep subscription input",
    required: [
      "toriiUrl",
      "chainId",
      "networkPrefix",
      "accountId",
      "subscriptionId",
    ],
  },
  subscriptionChargeNow: {
    label: "Charge subscription input",
    required: [
      "toriiUrl",
      "chainId",
      "networkPrefix",
      "accountId",
      "subscriptionId",
    ],
    optional: ["chargeAtMs"],
  },
  subscriptionReconcile: {
    label: "Subscription reconciliation input",
    required: [
      "toriiUrl",
      "chainId",
      "networkPrefix",
      "accountId",
      "subscriptionId",
      "action",
      "transactionHash",
    ],
  },
  soraCloudStatus: {
    label: "SoraCloud status input",
    required: ["toriiUrl"],
  },
  soraCloudHfSharedLeaseStatus: {
    label: "SoraCloud Hugging Face shared-lease status input",
    required: ["toriiUrl", "repoId", "revision", "storageClass", "leaseTermMs"],
    optional: ["accountId"],
  },
  stakingBond: {
    label: "Bond stake input",
    required: [
      "toriiUrl",
      "chainId",
      "networkPrefix",
      "stakeAccountId",
      "validator",
      "amount",
    ],
  },
  stakingRegisterValidator: {
    label: "Register validator input",
    required: [
      "toriiUrl",
      "chainId",
      "networkPrefix",
      "laneId",
      "validatorAccountId",
      "peerId",
      "selfStake",
    ],
    optional: ["stakeAccountId", "metadata"],
  },
  stakingScheduleUnbond: {
    label: "Schedule unbond input",
    required: [
      "toriiUrl",
      "chainId",
      "networkPrefix",
      "stakeAccountId",
      "validator",
      "amount",
      "requestId",
      "releaseAtMs",
    ],
  },
  stakingFinalizeUnbond: {
    label: "Finalize unbond input",
    required: [
      "toriiUrl",
      "chainId",
      "networkPrefix",
      "stakeAccountId",
      "validator",
      "requestId",
    ],
  },
  stakingClaimRewards: {
    label: "Claim rewards input",
    required: [
      "toriiUrl",
      "chainId",
      "networkPrefix",
      "stakeAccountId",
      "validator",
    ],
  },
} as const satisfies Record<string, FirstReleaseIpcObjectSchema>;

export type FirstReleaseIpcInputKind =
  keyof typeof FIRST_RELEASE_IPC_INPUT_SCHEMAS;

export const requireFirstReleaseIpcInput = <T extends object>(
  value: T,
  kind: FirstReleaseIpcInputKind,
): Readonly<T> =>
  requireFirstReleaseIpcInputObject<T>(
    value,
    FIRST_RELEASE_IPC_INPUT_SCHEMAS[kind],
  );

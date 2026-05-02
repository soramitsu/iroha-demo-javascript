import { afterEach, describe, expect, it, vi } from "vitest";
import {
  bondPublicLaneStake,
  claimPublicLaneRewards,
  connectVpn,
  disconnectVpn,
  enactGovernanceProposal,
  fetchAccountAssets,
  fetchAccountTransactions,
  getChainMetadata,
  getConfidentialAssetBalance,
  finalizeGovernanceReferendum,
  finalizePublicLaneUnbond,
  getGovernanceCitizenStatus,
  getGovernanceCouncilCurrent,
  getGovernanceLocks,
  getGovernanceProposal,
  getGovernanceRegistrationPolicy,
  getGovernanceReferendum,
  getGovernanceTally,
  getConfidentialAssetPolicy,
  getExplorerAccountQr,
  getNexusPublicLaneRewards,
  getNexusPublicLaneStake,
  getNexusPublicLaneValidators,
  getNexusStakingPolicy,
  getSumeragiStatus,
  getVpnAvailability,
  getVpnProfile,
  getVpnStatus,
  listAccountPermissions,
  listSubscriptionPlans,
  listSubscriptions,
  listVpnReceipts,
  repairVpn,
  registerCitizen,
  resolveAccountAlias,
  requestFaucetFunds,
  schedulePublicLaneUnbond,
  cancelSubscription,
  chargeSubscriptionNow,
  createSubscription,
  getSubscription,
  keepSubscription,
  pauseSubscription,
  resumeSubscription,
  signIrohaConnectMessage,
  submitGovernancePlainBallot,
  transferAsset,
} from "@/services/iroha";

describe("iroha services bridge", () => {
  afterEach(() => {
    delete (window as any).iroha;
  });

  it("forwards chain metadata checks to the bridge", async () => {
    const getChainMetadataMock = vi.fn().mockResolvedValue({
      chainId: "chain-alpha",
      networkPrefix: 42,
    });

    (window as any).iroha = {
      getChainMetadata: getChainMetadataMock,
    };

    await expect(getChainMetadata("http://localhost:8080")).resolves.toEqual({
      chainId: "chain-alpha",
      networkPrefix: 42,
    });
    expect(getChainMetadataMock).toHaveBeenCalledWith({
      toriiUrl: "http://localhost:8080",
    });
  });

  it("forwards IrohaConnect signing requests to the bridge", async () => {
    const signIrohaConnectMessageMock = vi.fn().mockResolvedValue({
      publicKeyHex: "ed0120public",
      signatureB64: "signature",
    });

    (window as any).iroha = {
      signIrohaConnectMessage: signIrohaConnectMessageMock,
    };

    const input = {
      accountId: "alice@wonderland",
      signingMessageB64: "bWVzc2FnZQ==",
    };
    await expect(signIrohaConnectMessage(input)).resolves.toEqual({
      publicKeyHex: "ed0120public",
      signatureB64: "signature",
    });
    expect(signIrohaConnectMessageMock).toHaveBeenCalledWith(input);
  });

  it("forwards offset-based pagination to asset and transaction fetchers", async () => {
    const fetchAccountAssetsMock = vi
      .fn()
      .mockResolvedValue({ items: [], total: 0 });
    const fetchAccountTransactionsMock = vi
      .fn()
      .mockResolvedValue({ items: [], total: 0 });

    (window as any).iroha = {
      fetchAccountAssets: fetchAccountAssetsMock,
      fetchAccountTransactions: fetchAccountTransactionsMock,
    };

    const assetsInput = {
      toriiUrl: "http://localhost:8080",
      accountId: "alice@wonderland",
      limit: 10,
      offset: 5,
    };
    const txInput = {
      toriiUrl: "http://localhost:8080",
      accountId: "alice@wonderland",
      privateKeyHex: "ab".repeat(32),
      limit: 6,
      offset: 0,
    };

    await fetchAccountAssets(assetsInput);
    await fetchAccountTransactions(txInput);

    expect(fetchAccountAssetsMock).toHaveBeenCalledWith(assetsInput);
    expect(fetchAccountTransactionsMock).toHaveBeenCalledWith(txInput);
  });

  it("forwards confidential asset balance requests to the bridge", async () => {
    const getConfidentialAssetBalanceMock = vi.fn().mockResolvedValue({
      resolvedAssetId: "xor#universal",
      quantity: "4",
      onChainQuantity: null,
      spendableQuantity: "4",
      exact: false,
    });
    (window as any).iroha = {
      getConfidentialAssetBalance: getConfidentialAssetBalanceMock,
    };

    const input = {
      toriiUrl: "http://localhost:8080",
      chainId: "chain",
      accountId: "alice@wonderland",
      privateKeyHex: "ab".repeat(32),
      assetDefinitionId: "xor#universal",
    };
    const result = await getConfidentialAssetBalance(input);

    expect(getConfidentialAssetBalanceMock).toHaveBeenCalledWith(input);
    expect(result.spendableQuantity).toBe("4");
    expect(result.exact).toBe(false);
  });

  it("returns explorer QR snapshots with svg markup", async () => {
    const snapshot = {
      canonicalId: "testuAliceCanonical",
      literal: "testuAliceLiteral",
      networkPrefix: 369,
      errorCorrection: "Q",
      modules: 21,
      qrVersion: 6,
      svg: '<svg aria-label="qr"></svg>',
    };
    const getExplorerAccountQrMock = vi.fn().mockResolvedValue(snapshot);
    (window as any).iroha = {
      getExplorerAccountQr: getExplorerAccountQrMock,
    };

    const input = {
      toriiUrl: "http://localhost:8080",
      accountId: "testuAliceCanonical",
    };
    const result = await getExplorerAccountQr(input);

    expect(getExplorerAccountQrMock).toHaveBeenCalledWith(input);
    expect(result.svg).toBe(snapshot.svg);
    expect(result.qrVersion).toBe(snapshot.qrVersion);
  });

  it("forwards account alias resolution to the bridge", async () => {
    const resolution = {
      alias: "bob@universal",
      accountId: "testuBobResolved",
      resolved: true,
      source: "on_chain",
    };
    const resolveAccountAliasMock = vi.fn().mockResolvedValue(resolution);
    (window as any).iroha = {
      resolveAccountAlias: resolveAccountAliasMock,
    };

    const input = {
      toriiUrl: "http://localhost:8080",
      alias: "bob@universal",
      networkPrefix: 369,
    };
    await expect(resolveAccountAlias(input)).resolves.toEqual(resolution);
    expect(resolveAccountAliasMock).toHaveBeenCalledWith(input);
  });

  it("forwards VPN bridge methods", async () => {
    const getVpnAvailabilityMock = vi.fn().mockResolvedValue({
      platformSupported: true,
      helperManaged: true,
      helperReady: true,
      serverReachable: true,
      profileAvailable: true,
      actionsEnabled: true,
      status: "ready",
      message: "ready",
      helperVersion: "embedded-1.0.0",
      platform: "darwin",
      controllerInstalled: true,
      controllerVersion: "1.0.0",
      controllerKind: "macos-network-extension",
      controllerPath: "/tmp/sora-vpn-controller",
      repairRequired: false,
      systemTunnelConfigured: true,
      systemTunnelActive: false,
      systemTunnelKind: "macos-networksetup",
      systemTunnelInterface: "utun7",
      systemTunnelService: "Wi-Fi",
    });
    const getVpnProfileMock = vi.fn().mockResolvedValue({
      available: true,
      relayEndpoint: "/dns/torii.exit.example/udp/9443/quic",
      supportedExitClasses: ["standard", "low-latency", "high-security"],
      defaultExitClass: "standard",
      leaseSecs: 600,
      dnsPushIntervalSecs: 90,
      meterFamily: "soranet.vpn.standard",
      routePushes: [],
      excludedRoutes: [],
      dnsServers: ["1.1.1.1"],
      tunnelAddresses: ["10.208.0.2/32"],
      mtuBytes: 1280,
      displayBillingLabel: "standard · soranet.vpn.standard",
    });
    const getVpnStatusMock = vi.fn().mockResolvedValue({
      state: "idle",
      sessionId: null,
      exitClass: null,
      relayEndpoint: null,
      connectedAtMs: null,
      expiresAtMs: null,
      durationMs: 0,
      bytesIn: 0,
      bytesOut: 0,
      routePushes: [],
      excludedRoutes: [],
      dnsServers: [],
      tunnelAddresses: [],
      mtuBytes: 0,
      helperStatus: "idle",
      controllerInstalled: true,
      controllerVersion: "1.0.0",
      controllerKind: "macos-network-extension",
      reconcileState: null,
      repairRequired: false,
      remoteSessionActive: false,
      systemTunnelActive: false,
      systemTunnelKind: "macos-networksetup",
      systemTunnelInterface: "utun7",
      systemTunnelService: "Wi-Fi",
      errorMessage: null,
      lastReceipt: null,
    });
    const connectVpnMock = vi.fn().mockResolvedValue({
      state: "connected",
      sessionId: "sess_1",
      exitClass: "standard",
      relayEndpoint: "/dns/torii.exit.example/udp/9443/quic",
      connectedAtMs: 1,
      expiresAtMs: 2,
      durationMs: 1,
      bytesIn: 0,
      bytesOut: 0,
      routePushes: [],
      excludedRoutes: [],
      dnsServers: [],
      tunnelAddresses: [],
      mtuBytes: 1280,
      helperStatus: "embedded-connected",
      controllerInstalled: true,
      controllerVersion: "1.0.0",
      controllerKind: "macos-network-extension",
      reconcileState: null,
      repairRequired: false,
      remoteSessionActive: true,
      systemTunnelActive: true,
      systemTunnelKind: "macos-networksetup",
      systemTunnelInterface: "utun7",
      systemTunnelService: "Wi-Fi",
      errorMessage: null,
      lastReceipt: null,
    });
    const repairVpnMock = vi.fn().mockResolvedValue({
      state: "idle",
      sessionId: null,
      exitClass: null,
      relayEndpoint: null,
      connectedAtMs: null,
      expiresAtMs: null,
      durationMs: 0,
      bytesIn: 0,
      bytesOut: 0,
      routePushes: [],
      excludedRoutes: [],
      dnsServers: [],
      tunnelAddresses: [],
      mtuBytes: 0,
      helperStatus: "idle",
      controllerInstalled: true,
      controllerVersion: "1.0.0",
      controllerKind: "macos-network-extension",
      reconcileState: null,
      repairRequired: false,
      remoteSessionActive: false,
      systemTunnelActive: false,
      systemTunnelKind: "macos-networksetup",
      systemTunnelInterface: "utun7",
      systemTunnelService: "Wi-Fi",
      errorMessage: null,
      lastReceipt: null,
    });
    const disconnectVpnMock = vi.fn().mockResolvedValue({
      state: "idle",
      sessionId: null,
      exitClass: null,
      relayEndpoint: null,
      connectedAtMs: null,
      expiresAtMs: null,
      durationMs: 0,
      bytesIn: 0,
      bytesOut: 0,
      routePushes: [],
      excludedRoutes: [],
      dnsServers: [],
      tunnelAddresses: [],
      mtuBytes: 0,
      helperStatus: "idle",
      controllerInstalled: true,
      controllerVersion: "1.0.0",
      controllerKind: "macos-network-extension",
      reconcileState: null,
      repairRequired: false,
      remoteSessionActive: false,
      systemTunnelActive: false,
      systemTunnelKind: "macos-networksetup",
      systemTunnelInterface: "utun7",
      systemTunnelService: "Wi-Fi",
      errorMessage: null,
      lastReceipt: null,
    });
    const listVpnReceiptsMock = vi.fn().mockResolvedValue([
      {
        sessionId: "sess_1",
        accountId: "alice@wonderland",
        exitClass: "standard",
        relayEndpoint: "/dns/torii.exit.example/udp/9443/quic",
        meterFamily: "soranet.vpn.standard",
        connectedAtMs: 1,
        disconnectedAtMs: 2,
        durationMs: 1,
        bytesIn: 0,
        bytesOut: 0,
        status: "disconnected",
        receiptSource: "torii",
      },
    ]);

    (window as any).iroha = {
      getVpnAvailability: getVpnAvailabilityMock,
      getVpnProfile: getVpnProfileMock,
      getVpnStatus: getVpnStatusMock,
      connectVpn: connectVpnMock,
      repairVpn: repairVpnMock,
      disconnectVpn: disconnectVpnMock,
      listVpnReceipts: listVpnReceiptsMock,
    };

    const availabilityInput = { toriiUrl: "https://taira.sora.org" };
    const connectInput = {
      toriiUrl: "https://taira.sora.org",
      accountId: "alice@wonderland",
      privateKeyHex: "aa".repeat(32),
      exitClass: "standard" as const,
    };
    const disconnectInput = {
      toriiUrl: "https://taira.sora.org",
      accountId: "alice@wonderland",
      privateKeyHex: "aa".repeat(32),
    };
    const statusInput = disconnectInput;

    await getVpnAvailability(availabilityInput);
    await getVpnProfile(availabilityInput);
    await getVpnStatus(statusInput);
    await connectVpn(connectInput);
    await repairVpn(statusInput);
    await disconnectVpn(disconnectInput);
    await listVpnReceipts(statusInput);

    expect(getVpnAvailabilityMock).toHaveBeenCalledWith(availabilityInput);
    expect(getVpnProfileMock).toHaveBeenCalledWith(availabilityInput);
    expect(getVpnStatusMock).toHaveBeenCalledWith(statusInput);
    expect(connectVpnMock).toHaveBeenCalledWith(connectInput);
    expect(repairVpnMock).toHaveBeenCalledWith(statusInput);
    expect(disconnectVpnMock).toHaveBeenCalledWith(disconnectInput);
    expect(listVpnReceiptsMock).toHaveBeenCalledWith(statusInput);
  });

  it("forwards faucet requests", async () => {
    const requestFaucetFundsMock = vi.fn().mockResolvedValue({
      account_id: "alice@wonderland",
      asset_definition_id: "61CtjvNd9T3THAR65GsMVHr82Bjc",
      asset_id: "norito:abcdef0123456789",
      amount: "25000",
      tx_hash_hex: "0xabc",
      status: "QUEUED",
    });
    (window as any).iroha = {
      requestFaucetFunds: requestFaucetFundsMock,
    };

    const input = {
      toriiUrl: "http://localhost:8080",
      accountId: "alice@wonderland",
    };
    const onProgress = vi.fn();
    const result = await requestFaucetFunds(input, onProgress);

    expect(requestFaucetFundsMock).toHaveBeenCalledWith(input, onProgress);
    expect(result.asset_definition_id).toBe("61CtjvNd9T3THAR65GsMVHr82Bjc");
    expect(result.asset_id).toBe("norito:abcdef0123456789");
    expect(result.amount).toBe("25000");
  });

  it("forwards transfer payloads including shield flags", async () => {
    const transferAssetMock = vi.fn().mockResolvedValue({ hash: "0xabc" });
    (window as any).iroha = {
      transferAsset: transferAssetMock,
    };
    const input = {
      toriiUrl: "http://localhost:8080",
      chainId: "chain",
      assetDefinitionId: "norito:abcdef0123456789",
      accountId: "alice@wonderland",
      destinationAccountId: "bob@wonderland",
      quantity: "12.5",
      privateKeyHex: "aa".repeat(32),
      shielded: true,
    };

    const result = await transferAsset(input);

    expect(transferAssetMock).toHaveBeenCalledWith(input);
    expect(result.hash).toBe("0xabc");
  });

  it("forwards confidential policy lookups", async () => {
    const getConfidentialAssetPolicyMock = vi.fn().mockResolvedValue({
      asset_id: "norito:abcdef0123456789",
      block_height: 12,
      current_mode: "TransparentOnly",
      effective_mode: "TransparentOnly",
      vk_set_hash: null,
      poseidon_params_id: null,
      pedersen_params_id: null,
      pending_transition: null,
    });
    (window as any).iroha = {
      getConfidentialAssetPolicy: getConfidentialAssetPolicyMock,
    };

    const input = {
      toriiUrl: "http://localhost:8080",
      accountId: "testuAlice",
      assetDefinitionId: "norito:abcdef0123456789",
    };
    const result = await getConfidentialAssetPolicy(input);

    expect(getConfidentialAssetPolicyMock).toHaveBeenCalledWith(input);
    expect(result.asset_id).toBe("norito:abcdef0123456789");
  });

  it("forwards staking bridge methods", async () => {
    const getSumeragiStatusMock = vi
      .fn()
      .mockResolvedValue({ lane_governance: [] });
    const getNexusPublicLaneValidatorsMock = vi
      .fn()
      .mockResolvedValue({ lane_id: 1, total: 0, items: [] });
    const getNexusPublicLaneStakeMock = vi
      .fn()
      .mockResolvedValue({ lane_id: 1, total: 0, items: [] });
    const getNexusPublicLaneRewardsMock = vi
      .fn()
      .mockResolvedValue({ lane_id: 1, total: 0, items: [] });
    const getNexusStakingPolicyMock = vi
      .fn()
      .mockResolvedValue({ unbondingDelayMs: 60_000 });
    const bondPublicLaneStakeMock = vi.fn().mockResolvedValue({ hash: "0x1" });
    const schedulePublicLaneUnbondMock = vi
      .fn()
      .mockResolvedValue({ hash: "0x2" });
    const finalizePublicLaneUnbondMock = vi
      .fn()
      .mockResolvedValue({ hash: "0x3" });
    const claimPublicLaneRewardsMock = vi
      .fn()
      .mockResolvedValue({ hash: "0x4" });

    (window as any).iroha = {
      getSumeragiStatus: getSumeragiStatusMock,
      getNexusPublicLaneValidators: getNexusPublicLaneValidatorsMock,
      getNexusPublicLaneStake: getNexusPublicLaneStakeMock,
      getNexusPublicLaneRewards: getNexusPublicLaneRewardsMock,
      getNexusStakingPolicy: getNexusStakingPolicyMock,
      bondPublicLaneStake: bondPublicLaneStakeMock,
      schedulePublicLaneUnbond: schedulePublicLaneUnbondMock,
      finalizePublicLaneUnbond: finalizePublicLaneUnbondMock,
      claimPublicLaneRewards: claimPublicLaneRewardsMock,
    };

    const validatorsInput = {
      toriiUrl: "http://localhost:8080",
      laneId: 1,
    };
    const stakeInput = {
      toriiUrl: "http://localhost:8080",
      laneId: 1,
      validator: "validator@wonderland",
    };
    const rewardsInput = {
      toriiUrl: "http://localhost:8080",
      laneId: 1,
      account: "alice@wonderland",
    };
    const bondInput = {
      toriiUrl: "http://localhost:8080",
      chainId: "chain",
      stakeAccountId: "alice@wonderland",
      validator: "validator@wonderland",
      amount: "10",
      privateKeyHex: "aa".repeat(32),
    };
    const unbondInput = {
      ...bondInput,
      amount: "5",
      requestId: "request-1",
      releaseAtMs: 12345,
    };
    const finalizeInput = {
      toriiUrl: "http://localhost:8080",
      chainId: "chain",
      stakeAccountId: "alice@wonderland",
      validator: "validator@wonderland",
      requestId: "request-1",
      privateKeyHex: "aa".repeat(32),
    };
    const claimInput = {
      toriiUrl: "http://localhost:8080",
      chainId: "chain",
      stakeAccountId: "alice@wonderland",
      validator: "validator@wonderland",
      privateKeyHex: "aa".repeat(32),
    };

    await getSumeragiStatus("http://localhost:8080");
    await getNexusPublicLaneValidators(validatorsInput);
    await getNexusPublicLaneStake(stakeInput);
    await getNexusPublicLaneRewards(rewardsInput);
    await getNexusStakingPolicy("http://localhost:8080");
    await bondPublicLaneStake(bondInput);
    await schedulePublicLaneUnbond(unbondInput);
    await finalizePublicLaneUnbond(finalizeInput);
    await claimPublicLaneRewards(claimInput);

    expect(getSumeragiStatusMock).toHaveBeenCalledWith({
      toriiUrl: "http://localhost:8080",
    });
    expect(getNexusPublicLaneValidatorsMock).toHaveBeenCalledWith(
      validatorsInput,
    );
    expect(getNexusPublicLaneStakeMock).toHaveBeenCalledWith(stakeInput);
    expect(getNexusPublicLaneRewardsMock).toHaveBeenCalledWith(rewardsInput);
    expect(getNexusStakingPolicyMock).toHaveBeenCalledWith({
      toriiUrl: "http://localhost:8080",
    });
    expect(bondPublicLaneStakeMock).toHaveBeenCalledWith(bondInput);
    expect(schedulePublicLaneUnbondMock).toHaveBeenCalledWith(unbondInput);
    expect(finalizePublicLaneUnbondMock).toHaveBeenCalledWith(finalizeInput);
    expect(claimPublicLaneRewardsMock).toHaveBeenCalledWith(claimInput);
  });

  it("forwards subscription bridge methods", async () => {
    const listSubscriptionPlansMock = vi
      .fn()
      .mockResolvedValue({ items: [], total: 0 });
    const listSubscriptionsMock = vi
      .fn()
      .mockResolvedValue({ items: [], total: 0 });
    const getSubscriptionMock = vi.fn().mockResolvedValue({
      subscription_id: "sub_1$subscriptions.universal",
      subscription: { status: "active" },
      invoice: null,
      plan: null,
    });
    const actionResult = {
      ok: true,
      subscription_id: "sub_1$subscriptions.universal",
      tx_hash_hex: "0xabc",
    };
    const createSubscriptionMock = vi.fn().mockResolvedValue(actionResult);
    const pauseSubscriptionMock = vi.fn().mockResolvedValue(actionResult);
    const resumeSubscriptionMock = vi.fn().mockResolvedValue(actionResult);
    const cancelSubscriptionMock = vi.fn().mockResolvedValue(actionResult);
    const keepSubscriptionMock = vi.fn().mockResolvedValue(actionResult);
    const chargeSubscriptionNowMock = vi.fn().mockResolvedValue(actionResult);

    (window as any).iroha = {
      listSubscriptionPlans: listSubscriptionPlansMock,
      listSubscriptions: listSubscriptionsMock,
      getSubscription: getSubscriptionMock,
      createSubscription: createSubscriptionMock,
      pauseSubscription: pauseSubscriptionMock,
      resumeSubscription: resumeSubscriptionMock,
      cancelSubscription: cancelSubscriptionMock,
      keepSubscription: keepSubscriptionMock,
      chargeSubscriptionNow: chargeSubscriptionNowMock,
    };

    const plansInput = {
      toriiUrl: "http://localhost:8080",
      provider: "provider@commerce",
      limit: 20,
      offset: 0,
    };
    const listInput = {
      toriiUrl: "http://localhost:8080",
      ownedBy: "alice@wonderland",
      status: "active" as const,
      limit: 20,
    };
    const getInput = {
      toriiUrl: "http://localhost:8080",
      subscriptionId: "sub_1$subscriptions.universal",
    };
    const signedInput = {
      ...getInput,
      accountId: "alice@wonderland",
      privateKeyHex: "aa".repeat(32),
    };
    const createInput = {
      ...signedInput,
      planId: "plan_1$subscriptions.universal",
      firstChargeMs: 1_704_067_200_000,
    };
    const cancelInput = {
      ...signedInput,
      cancelMode: "period_end" as const,
    };
    const chargeInput = {
      ...signedInput,
      chargeAtMs: 1_704_067_200_000,
    };

    await listSubscriptionPlans(plansInput);
    await listSubscriptions(listInput);
    await getSubscription(getInput);
    await createSubscription(createInput);
    await pauseSubscription(signedInput);
    await resumeSubscription(chargeInput);
    await cancelSubscription(cancelInput);
    await keepSubscription(signedInput);
    await chargeSubscriptionNow(chargeInput);

    expect(listSubscriptionPlansMock).toHaveBeenCalledWith(plansInput);
    expect(listSubscriptionsMock).toHaveBeenCalledWith(listInput);
    expect(getSubscriptionMock).toHaveBeenCalledWith(getInput);
    expect(createSubscriptionMock).toHaveBeenCalledWith(createInput);
    expect(pauseSubscriptionMock).toHaveBeenCalledWith(signedInput);
    expect(resumeSubscriptionMock).toHaveBeenCalledWith(chargeInput);
    expect(cancelSubscriptionMock).toHaveBeenCalledWith(cancelInput);
    expect(keepSubscriptionMock).toHaveBeenCalledWith(signedInput);
    expect(chargeSubscriptionNowMock).toHaveBeenCalledWith(chargeInput);
  });

  it("forwards parliament governance bridge methods", async () => {
    const listAccountPermissionsMock = vi
      .fn()
      .mockResolvedValue({ items: [], total: 0 });
    const getGovernanceCitizenStatusMock = vi.fn().mockResolvedValue({
      accountId: "alice@wonderland",
      isCitizen: true,
      amount: "10000",
      bondedHeight: 12,
      seatsInEpoch: 0,
      lastEpochSeen: 0,
      cooldownUntil: 0,
      endpointAvailable: true,
    });
    const registerCitizenMock = vi.fn().mockResolvedValue({ hash: "0x10" });
    const getGovernanceRegistrationPolicyMock = vi.fn().mockResolvedValue({
      citizenshipAssetDefinitionId: null,
      citizenshipBondAmount: null,
      citizenshipAssetDefinitionExists: null,
      configurationLoaded: false,
      configurationError: null,
      assetDefinitionError: null,
    });
    const getGovernanceProposalMock = vi
      .fn()
      .mockResolvedValue({ found: false, proposal: null });
    const getGovernanceReferendumMock = vi
      .fn()
      .mockResolvedValue({ found: false, referendum: null });
    const getGovernanceTallyMock = vi
      .fn()
      .mockResolvedValue({ found: false, referendum_id: "r1", tally: null });
    const getGovernanceLocksMock = vi
      .fn()
      .mockResolvedValue({ found: false, referendum_id: "r1", locks: {} });
    const getGovernanceCouncilCurrentMock = vi.fn().mockResolvedValue({
      epoch: 1,
      members: [],
      alternates: [],
      candidate_count: 0,
      verified: 0,
      derived_by: "Fallback",
    });
    const submitGovernancePlainBallotMock = vi
      .fn()
      .mockResolvedValue({ hash: "0x11" });
    const finalizeGovernanceReferendumMock = vi.fn().mockResolvedValue({
      ok: true,
      proposal_id: "0x".padEnd(66, "1"),
      tx_instructions: [],
    });
    const enactGovernanceProposalMock = vi.fn().mockResolvedValue({
      ok: true,
      proposal_id: "0x".padEnd(66, "2"),
      tx_instructions: [],
    });

    (window as any).iroha = {
      listAccountPermissions: listAccountPermissionsMock,
      getGovernanceCitizenStatus: getGovernanceCitizenStatusMock,
      registerCitizen: registerCitizenMock,
      getGovernanceRegistrationPolicy: getGovernanceRegistrationPolicyMock,
      getGovernanceProposal: getGovernanceProposalMock,
      getGovernanceReferendum: getGovernanceReferendumMock,
      getGovernanceTally: getGovernanceTallyMock,
      getGovernanceLocks: getGovernanceLocksMock,
      getGovernanceCouncilCurrent: getGovernanceCouncilCurrentMock,
      submitGovernancePlainBallot: submitGovernancePlainBallotMock,
      finalizeGovernanceReferendum: finalizeGovernanceReferendumMock,
      enactGovernanceProposal: enactGovernanceProposalMock,
    };

    const permissionsInput = {
      toriiUrl: "http://localhost:8080",
      accountId: "alice@wonderland",
      limit: 100,
    };
    const registerInput = {
      toriiUrl: "http://localhost:8080",
      chainId: "chain",
      accountId: "alice@wonderland",
      amount: "10000",
      privateKeyHex: "aa".repeat(32),
    };
    const referendumInput = {
      toriiUrl: "http://localhost:8080",
      referendumId: "ref-1",
    };
    const proposalInput = {
      toriiUrl: "http://localhost:8080",
      proposalId: "0x".padEnd(66, "f"),
    };
    const ballotInput = {
      toriiUrl: "http://localhost:8080",
      chainId: "chain",
      accountId: "alice@wonderland",
      referendumId: "ref-1",
      amount: "10",
      durationBlocks: 120,
      direction: "Aye" as const,
      privateKeyHex: "bb".repeat(32),
    };
    const finalizeInput = {
      toriiUrl: "http://localhost:8080",
      referendumId: "ref-1",
      proposalId: "0x".padEnd(66, "e"),
    };
    const enactInput = {
      toriiUrl: "http://localhost:8080",
      proposalId: "0x".padEnd(66, "d"),
    };

    await listAccountPermissions(permissionsInput);
    await getGovernanceCitizenStatus({
      toriiUrl: "http://localhost:8080",
      accountId: "alice@wonderland",
    });
    await registerCitizen(registerInput);
    await getGovernanceRegistrationPolicy("http://localhost:8080");
    await getGovernanceProposal(proposalInput);
    await getGovernanceReferendum(referendumInput);
    await getGovernanceTally(referendumInput);
    await getGovernanceLocks(referendumInput);
    await getGovernanceCouncilCurrent("http://localhost:8080");
    await submitGovernancePlainBallot(ballotInput);
    await finalizeGovernanceReferendum(finalizeInput);
    await enactGovernanceProposal(enactInput);

    expect(listAccountPermissionsMock).toHaveBeenCalledWith(permissionsInput);
    expect(getGovernanceCitizenStatusMock).toHaveBeenCalledWith({
      toriiUrl: "http://localhost:8080",
      accountId: "alice@wonderland",
    });
    expect(registerCitizenMock).toHaveBeenCalledWith(registerInput);
    expect(getGovernanceRegistrationPolicyMock).toHaveBeenCalledWith({
      toriiUrl: "http://localhost:8080",
    });
    expect(getGovernanceProposalMock).toHaveBeenCalledWith(proposalInput);
    expect(getGovernanceReferendumMock).toHaveBeenCalledWith(referendumInput);
    expect(getGovernanceTallyMock).toHaveBeenCalledWith(referendumInput);
    expect(getGovernanceLocksMock).toHaveBeenCalledWith(referendumInput);
    expect(getGovernanceCouncilCurrentMock).toHaveBeenCalledWith({
      toriiUrl: "http://localhost:8080",
    });
    expect(submitGovernancePlainBallotMock).toHaveBeenCalledWith(ballotInput);
    expect(finalizeGovernanceReferendumMock).toHaveBeenCalledWith(
      finalizeInput,
    );
    expect(enactGovernanceProposalMock).toHaveBeenCalledWith(enactInput);
  });
});

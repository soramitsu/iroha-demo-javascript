import { afterEach, describe, expect, it, vi } from "vitest";
import {
  bondPublicLaneStake,
  claimPublicLaneRewards,
  enactGovernanceProposal,
  fetchAccountAssets,
  fetchAccountTransactions,
  finalizeGovernanceReferendum,
  finalizePublicLaneUnbond,
  getGovernanceCouncilCurrent,
  getGovernanceLocks,
  getGovernanceProposal,
  getGovernanceReferendum,
  getGovernanceTally,
  getConfidentialAssetPolicy,
  getExplorerAccountQr,
  getNexusPublicLaneRewards,
  getNexusPublicLaneStake,
  getNexusPublicLaneValidators,
  getNexusStakingPolicy,
  getSumeragiStatus,
  listAccountPermissions,
  registerCitizen,
  requestFaucetFunds,
  schedulePublicLaneUnbond,
  submitGovernancePlainBallot,
  transferAsset,
} from "@/services/iroha";

describe("iroha services bridge", () => {
  afterEach(() => {
    delete (window as any).iroha;
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
      limit: 6,
      offset: 0,
    };

    await fetchAccountAssets(assetsInput);
    await fetchAccountTransactions(txInput);

    expect(fetchAccountAssetsMock).toHaveBeenCalledWith(assetsInput);
    expect(fetchAccountTransactionsMock).toHaveBeenCalledWith(txInput);
  });

  it("returns explorer QR snapshots with svg markup", async () => {
    const snapshot = {
      canonicalId: "n42uAliceCanonical",
      literal: "n42uAliceLiteral",
      networkPrefix: 42,
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
      accountId: "n42uAliceCanonical",
    };
    const result = await getExplorerAccountQr(input);

    expect(getExplorerAccountQrMock).toHaveBeenCalledWith(input);
    expect(result.svg).toBe(snapshot.svg);
    expect(result.qrVersion).toBe(snapshot.qrVersion);
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
    const result = await requestFaucetFunds(input);

    expect(requestFaucetFundsMock).toHaveBeenCalledWith(input);
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

  it("forwards parliament governance bridge methods", async () => {
    const listAccountPermissionsMock = vi
      .fn()
      .mockResolvedValue({ items: [], total: 0 });
    const registerCitizenMock = vi.fn().mockResolvedValue({ hash: "0x10" });
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
      registerCitizen: registerCitizenMock,
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
    await registerCitizen(registerInput);
    await getGovernanceProposal(proposalInput);
    await getGovernanceReferendum(referendumInput);
    await getGovernanceTally(referendumInput);
    await getGovernanceLocks(referendumInput);
    await getGovernanceCouncilCurrent("http://localhost:8080");
    await submitGovernancePlainBallot(ballotInput);
    await finalizeGovernanceReferendum(finalizeInput);
    await enactGovernanceProposal(enactInput);

    expect(listAccountPermissionsMock).toHaveBeenCalledWith(permissionsInput);
    expect(registerCitizenMock).toHaveBeenCalledWith(registerInput);
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

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  bondPublicLaneStake,
  claimPublicLaneRewards,
  fetchAccountAssets,
  fetchAccountTransactions,
  finalizePublicLaneUnbond,
  getExplorerAccountQr,
  getNexusPublicLaneRewards,
  getNexusPublicLaneStake,
  getNexusPublicLaneValidators,
  getNexusStakingPolicy,
  getSumeragiStatus,
  schedulePublicLaneUnbond,
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
      canonicalId: "alice@wonderland",
      literal: "snx1alice",
      addressFormat: "ih58" as const,
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
      accountId: "alice@wonderland",
      addressFormat: "compressed" as const,
    };
    const result = await getExplorerAccountQr(input);

    expect(getExplorerAccountQrMock).toHaveBeenCalledWith(input);
    expect(result.svg).toBe(snapshot.svg);
    expect(result.qrVersion).toBe(snapshot.qrVersion);
    expect(result.addressFormat).toBe("ih58");
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
});

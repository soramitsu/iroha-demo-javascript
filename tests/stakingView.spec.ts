import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import StakingView from "@/views/StakingView.vue";
import { translate } from "@/i18n/messages";
import { useSessionStore } from "@/stores/session";

const getSumeragiStatusMock = vi.fn();
const getNexusStakingPolicyMock = vi.fn();
const fetchAccountAssetsMock = vi.fn();
const getNexusPublicLaneValidatorsMock = vi.fn();
const getNexusPublicLaneRewardsMock = vi.fn();
const getNexusPublicLaneStakeMock = vi.fn();
const bondPublicLaneStakeMock = vi.fn();
const schedulePublicLaneUnbondMock = vi.fn();
const finalizePublicLaneUnbondMock = vi.fn();
const claimPublicLaneRewardsMock = vi.fn();

vi.mock("@/services/iroha", () => ({
  getSumeragiStatus: (toriiUrl: string) => getSumeragiStatusMock(toriiUrl),
  getNexusStakingPolicy: (toriiUrl: string) =>
    getNexusStakingPolicyMock(toriiUrl),
  fetchAccountAssets: (input: unknown) => fetchAccountAssetsMock(input),
  getNexusPublicLaneValidators: (input: unknown) =>
    getNexusPublicLaneValidatorsMock(input),
  getNexusPublicLaneRewards: (input: unknown) =>
    getNexusPublicLaneRewardsMock(input),
  getNexusPublicLaneStake: (input: unknown) =>
    getNexusPublicLaneStakeMock(input),
  bondPublicLaneStake: (input: unknown) => bondPublicLaneStakeMock(input),
  schedulePublicLaneUnbond: (input: unknown) =>
    schedulePublicLaneUnbondMock(input),
  finalizePublicLaneUnbond: (input: unknown) =>
    finalizePublicLaneUnbondMock(input),
  claimPublicLaneRewards: (input: unknown) => claimPublicLaneRewardsMock(input),
}));

const t = (key: string, params?: Record<string, string | number>) =>
  translate("en-US", key, params);

describe("StakingView", () => {
  beforeEach(() => {
    getSumeragiStatusMock.mockReset();
    getNexusStakingPolicyMock.mockReset();
    fetchAccountAssetsMock.mockReset();
    getNexusPublicLaneValidatorsMock.mockReset();
    getNexusPublicLaneRewardsMock.mockReset();
    getNexusPublicLaneStakeMock.mockReset();
    bondPublicLaneStakeMock.mockReset();
    schedulePublicLaneUnbondMock.mockReset();
    finalizePublicLaneUnbondMock.mockReset();
    claimPublicLaneRewardsMock.mockReset();

    getSumeragiStatusMock.mockResolvedValue({
      lane_governance: [
        {
          dataspace_id: 1,
          lane_id: 7,
          alias: "Primary",
          validator_ids: ["validator@wonderland"],
        },
      ],
      dataspace_commitments: [],
    });
    getNexusStakingPolicyMock.mockResolvedValue({ unbondingDelayMs: 60_000 });
    fetchAccountAssetsMock.mockResolvedValue({
      items: [
        {
          asset_id: "xor#wonderland##alice@wonderland",
          quantity: "10",
        },
      ],
      total: 1,
    });
    getNexusPublicLaneValidatorsMock.mockResolvedValue({
      lane_id: 7,
      total: 1,
      items: [
        {
          lane_id: 7,
          validator: "validator@wonderland",
          stake_account: "stake@wonderland",
          total_stake: "100",
          self_stake: "10",
          status: {
            type: "Active",
            activates_at_epoch: null,
            reason: null,
            releases_at_ms: null,
            slash_id: null,
          },
          activation_epoch: null,
          activation_height: null,
          last_reward_epoch: null,
          metadata: {},
        },
      ],
    });
    getNexusPublicLaneRewardsMock.mockResolvedValue({
      lane_id: 7,
      total: 0,
      items: [],
    });
    getNexusPublicLaneStakeMock.mockResolvedValue({
      lane_id: 7,
      total: 0,
      items: [],
    });

    setActivePinia(createPinia());
  });

  const mountView = () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const session = useSessionStore();
    session.$patch({
      connection: {
        toriiUrl: "http://localhost:8080",
        chainId: "chain",
        assetDefinitionId: "xor#wonderland",
        networkPrefix: 369,
      },
      accounts: [
        {
          displayName: "Alice",
          domain: "wonderland",
          accountId: "alice@wonderland",
          publicKeyHex: "ab".repeat(32),
          privateKeyHex: "cd".repeat(32),
        },
      ],
      activeAccountId: "alice@wonderland",
    });
    return mount(StakingView, {
      global: {
        plugins: [pinia],
      },
    });
  };

  const switchToBob = async () => {
    const session = useSessionStore();
    session.$patch({
      accounts: [
        ...session.accounts,
        {
          displayName: "Bob",
          domain: "wonderland",
          accountId: "bob@wonderland",
          publicKeyHex: "ef".repeat(32),
          privateKeyHex: "12".repeat(32),
        },
      ],
      activeAccountId: "bob@wonderland",
    });
    await flushPromises();
  };

  const getStakeBalanceRow = (wrapper: ReturnType<typeof mount>) => {
    const row = wrapper
      .findAll(".kv")
      .find((node) => node.text().includes(t("Stake Token Balance")));
    if (!row) {
      throw new Error(`${t("Stake Token Balance")} row not found`);
    }
    return row;
  };

  const getRewardsAmountCell = (wrapper: ReturnType<typeof mount>) => {
    const row = wrapper.findAll("tbody tr")[0];
    if (!row) {
      throw new Error("Rewards row not found");
    }
    return row.findAll("td")[1];
  };

  const getUnbondDelayRow = (wrapper: ReturnType<typeof mount>) => {
    const row = wrapper
      .findAll(".kv")
      .find((node) => node.text().includes(t("Unbond Delay")));
    if (!row) {
      throw new Error(`${t("Unbond Delay")} row not found`);
    }
    return row;
  };

  it("ignores stale refresh payload after active account switch", async () => {
    let resolveAliceAssets: (value: unknown) => void = () => {};
    const aliceAssetsDeferred = new Promise((resolve) => {
      resolveAliceAssets = resolve;
    });
    fetchAccountAssetsMock.mockReturnValueOnce(aliceAssetsDeferred);
    fetchAccountAssetsMock.mockResolvedValueOnce({
      items: [
        {
          asset_id: "xor#wonderland##bob@wonderland",
          quantity: "20",
        },
      ],
      total: 1,
    });

    const wrapper = mountView();
    await flushPromises();

    await switchToBob();
    await flushPromises();
    expect(getStakeBalanceRow(wrapper).text()).toContain("20 XOR");

    resolveAliceAssets({
      items: [
        {
          asset_id: "xor#wonderland##alice@wonderland",
          quantity: "1",
        },
      ],
      total: 1,
    });
    await flushPromises();
    await flushPromises();

    expect(getStakeBalanceRow(wrapper).text()).toContain("20 XOR");
    expect(wrapper.text()).toContain("bob@wonderland");
  });

  it("ignores stale refresh error after active account switch", async () => {
    let rejectAliceAssets: (reason: unknown) => void = () => {};
    const aliceAssetsDeferred = new Promise((_, reject) => {
      rejectAliceAssets = reject;
    });
    fetchAccountAssetsMock.mockReturnValueOnce(aliceAssetsDeferred);
    fetchAccountAssetsMock.mockResolvedValueOnce({
      items: [
        {
          asset_id: "xor#wonderland##bob@wonderland",
          quantity: "20",
        },
      ],
      total: 1,
    });

    const wrapper = mountView();
    await flushPromises();

    await switchToBob();
    await flushPromises();
    expect(getStakeBalanceRow(wrapper).text()).toContain("20 XOR");

    rejectAliceAssets(new Error("assets down"));
    await flushPromises();
    await flushPromises();

    expect(getStakeBalanceRow(wrapper).text()).toContain("20 XOR");
    expect(wrapper.text()).not.toContain("assets down");
  });

  it("ignores stale lane-data payload after active account switch", async () => {
    fetchAccountAssetsMock.mockResolvedValue({
      items: [
        {
          asset_id: "xor#wonderland##bob@wonderland",
          quantity: "20",
        },
      ],
      total: 1,
    });
    let resolveAliceRewards: (value: unknown) => void = () => {};
    const aliceRewardsDeferred = new Promise((resolve) => {
      resolveAliceRewards = resolve;
    });
    getNexusPublicLaneRewardsMock.mockReturnValueOnce(aliceRewardsDeferred);
    getNexusPublicLaneRewardsMock.mockResolvedValueOnce({
      lane_id: 7,
      total: 1,
      items: [
        {
          lane_id: 7,
          account: "bob@wonderland",
          asset: "xor#wonderland",
          last_claimed_epoch: 1,
          pending_through_epoch: 2,
          amount: "20",
        },
      ],
    });
    getNexusPublicLaneStakeMock.mockResolvedValue({
      lane_id: 7,
      total: 0,
      items: [],
    });

    const wrapper = mountView();
    await flushPromises();

    await switchToBob();
    await flushPromises();

    expect(getRewardsAmountCell(wrapper)?.text()).toBe("20");
    expect(wrapper.text()).toContain("bob@wonderland");

    resolveAliceRewards({
      lane_id: 7,
      total: 1,
      items: [
        {
          lane_id: 7,
          account: "alice@wonderland",
          asset: "xor#wonderland",
          last_claimed_epoch: 1,
          pending_through_epoch: 2,
          amount: "1",
        },
      ],
    });
    await flushPromises();
    await flushPromises();

    expect(getRewardsAmountCell(wrapper)?.text()).toBe("20");
    expect(wrapper.text()).toContain("bob@wonderland");
  });

  it("clears stale staking bootstrap state when account context is missing", async () => {
    const wrapper = mountView();
    await flushPromises();

    expect(getStakeBalanceRow(wrapper).text()).toContain("10 XOR");
    expect(getUnbondDelayRow(wrapper).text()).toContain("1 min");

    const session = useSessionStore();
    session.$patch({ activeAccountId: null });
    await flushPromises();
    await flushPromises();

    expect(wrapper.text()).toContain(
      t("Set up network and wallet first."),
    );
    expect(getStakeBalanceRow(wrapper).text()).toContain("0 XOR");
    expect(getUnbondDelayRow(wrapper).text()).toContain("—");
    expect(wrapper.findAll("select")[0]?.attributes("disabled")).toBeDefined();
  });

  it("clears stale staking bootstrap state when refresh fails", async () => {
    const wrapper = mountView();
    await flushPromises();

    expect(getStakeBalanceRow(wrapper).text()).toContain("10 XOR");
    expect(getUnbondDelayRow(wrapper).text()).toContain("1 min");

    fetchAccountAssetsMock.mockRejectedValueOnce(new Error("assets down"));
    const refreshButton = wrapper
      .findAll("button")
      .find((node) => node.text() === t("Refresh"));
    if (!refreshButton) {
      throw new Error("Refresh button not found");
    }

    await refreshButton.trigger("click");
    await flushPromises();
    await flushPromises();

    expect(wrapper.text()).toContain("assets down");
    expect(getStakeBalanceRow(wrapper).text()).toContain("0 XOR");
    expect(getUnbondDelayRow(wrapper).text()).toContain("—");
    expect(wrapper.findAll("select")[0]?.attributes("disabled")).toBeDefined();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { defineComponent } from "vue";
import StakingView from "@/views/StakingView.vue";
import { translate } from "@/i18n/messages";
import { useEndpointStore } from "@/stores/endpoint";
import { useSessionStore } from "@/stores/session";

const getSumeragiStatusMock = vi.fn();
const getNexusLifecycleMock = vi.fn();
const getNexusStakingPolicyMock = vi.fn();
const fetchAccountAssetsMock = vi.fn();
const getNexusPublicLaneValidatorsMock = vi.fn();
const getNexusPublicLaneRewardsMock = vi.fn();
const getNexusPublicLaneStakeMock = vi.fn();
const bondPublicLaneStakeMock = vi.fn();
const registerPublicLaneValidatorMock = vi.fn();
const schedulePublicLaneUnbondMock = vi.fn();
const finalizePublicLaneUnbondMock = vi.fn();
const claimPublicLaneRewardsMock = vi.fn();
const finalizedTransaction = (hashCharacter: string) => {
  const hash = hashCharacter.repeat(64);
  return {
    hash,
    finality: {
      status: "finalized" as const,
      transactionHash: hash,
      blockHeight: 17,
      blockHash: "f".repeat(64),
      finalizedBlockHeight: 19,
    },
  };
};

vi.mock("@/services/iroha", () => ({
  getSumeragiStatus: (toriiUrl: string) => getSumeragiStatusMock(toriiUrl),
  getNexusLifecycle: (toriiUrl: string) => getNexusLifecycleMock(toriiUrl),
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
  registerPublicLaneValidator: (input: unknown) =>
    registerPublicLaneValidatorMock(input),
  schedulePublicLaneUnbond: (input: unknown) =>
    schedulePublicLaneUnbondMock(input),
  finalizePublicLaneUnbond: (input: unknown) =>
    finalizePublicLaneUnbondMock(input),
  claimPublicLaneRewards: (input: unknown) => claimPublicLaneRewardsMock(input),
}));

const t = (key: string, params?: Record<string, string | number>) =>
  translate("en-US", key, params);

const StakingViewHarness = defineComponent({
  components: { StakingView },
  template: `
    <div data-testid="staking-view-harness">
      <header aria-label="Route header">
        <div id="route-header-actions"></div>
      </header>
      <main><StakingView /></main>
    </div>
  `,
});

const mountedWrappers: Array<{ unmount: () => void }> = [];

describe("StakingView", () => {
  beforeEach(() => {
    document.body.replaceChildren();
    getSumeragiStatusMock.mockReset();
    getNexusLifecycleMock.mockReset();
    getNexusStakingPolicyMock.mockReset();
    fetchAccountAssetsMock.mockReset();
    getNexusPublicLaneValidatorsMock.mockReset();
    getNexusPublicLaneRewardsMock.mockReset();
    getNexusPublicLaneStakeMock.mockReset();
    bondPublicLaneStakeMock.mockReset();
    registerPublicLaneValidatorMock.mockReset();
    schedulePublicLaneUnbondMock.mockReset();
    finalizePublicLaneUnbondMock.mockReset();
    claimPublicLaneRewardsMock.mockReset();

    getSumeragiStatusMock.mockResolvedValue({
      protocol_version: 3,
      height_context: {
        epoch: 12,
        validator_count: 4,
      },
      last_commit_qc: {
        certificate: {
          round: {
            height: 44_928,
            view: 0,
          },
        },
      },
    });
    getNexusLifecycleMock.mockResolvedValue({
      version: 1,
      nexus_enabled: true,
      lane_count: 1,
      lanes: [
        {
          dataspace_id: "1",
          id: 7,
          alias: "Primary",
          description: "Primary lane",
          visibility: "public",
          governance: null,
          storage: "full_replica",
          proof_scheme: "merkle_sha256",
          metadata: {},
        },
      ],
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
          peer_id: "peer:validator",
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

  afterEach(() => {
    for (const wrapper of mountedWrappers.splice(0)) {
      wrapper.unmount();
    }
    document.body.replaceChildren();
  });

  const mountView = (
    accountId = "alice@wonderland",
    endpointOptions?: {
      stakingWrites?: boolean;
      writeAllowed?: boolean;
      assetDefinitionId?: string;
      chainId?: string;
      networkPrefix?: number;
    },
  ) => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const session = useSessionStore();
    session.$patch({
      connection: {
        toriiUrl: "http://localhost:8080",
        chainId: endpointOptions?.chainId ?? "chain",
        assetDefinitionId:
          endpointOptions?.assetDefinitionId ?? "xor#wonderland",
        networkPrefix: endpointOptions?.networkPrefix ?? 369,
      },
      accounts: [
        {
          displayName: "Alice",
          domain: "wonderland",
          accountId,
          publicKeyHex: "ab".repeat(32),
          privateKeyHex: "cd".repeat(32),
        },
      ],
      activeAccountId: accountId,
    });
    const writeAllowed = endpointOptions?.writeAllowed !== false;
    const stakingWrites = endpointOptions?.stakingWrites !== false;
    useEndpointStore().$patch({
      state: "ready",
      inspection: {
        schema: "iroha.wallet.endpoint-inspection.v1",
        toriiUrl: "http://localhost:8080",
        expected: {
          chainId: endpointOptions?.chainId ?? "chain",
          networkPrefix: endpointOptions?.networkPrefix ?? 369,
        },
        observed: writeAllowed
          ? {
              chainId: endpointOptions?.chainId ?? "chain",
              networkPrefix: endpointOptions?.networkPrefix ?? 369,
            }
          : null,
        identityStatus: writeAllowed ? "matched" : "unverified",
        accessMode: writeAllowed ? "read-write" : "read-only",
        checkedAtMs: 1,
        evidence: [],
        diagnostic: {
          code: writeAllowed
            ? "endpoint_identity_matched"
            : "endpoint_identity_unverified",
          message: writeAllowed
            ? "Endpoint identity matched."
            : "Endpoint identity is not verified.",
        },
        features: {
          stakingWrites: {
            supported: stakingWrites,
            source: "openapi",
            requiredOperations: ["POST /v1/pipeline/transactions"],
            missingOperations: stakingWrites
              ? []
              : ["POST /v1/pipeline/transactions"],
          },
        },
      },
    } as any);
    const wrapper = mount(StakingViewHarness, {
      attachTo: document.body,
      global: {
        plugins: [pinia],
      },
    });
    mountedWrappers.push(wrapper);
    return wrapper;
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
    const row = wrapper.find(".staking-rewards-card tbody tr");
    if (!row.exists()) {
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

  const getStatForLabel = (
    wrapper: ReturnType<typeof mount>,
    labelText: string,
  ) => {
    const stat = wrapper
      .findAll(".staking-stat")
      .find((node) => node.text().includes(labelText));
    if (!stat) {
      throw new Error(`${labelText} stat not found`);
    }
    return stat;
  };

  const getInputForLabel = (
    wrapper: ReturnType<typeof mount>,
    labelText: string,
  ) => {
    const label = wrapper
      .findAll("label")
      .find((node) => node.text().includes(labelText));
    if (!label) {
      throw new Error(`${labelText} label not found`);
    }
    const input = label.find("input");
    if (!input.exists()) {
      throw new Error(`${labelText} input not found`);
    }
    return input;
  };

  it("renders one refresh action in the route header without an inline title", async () => {
    const wrapper = mountView();
    await flushPromises();

    const headerActions = wrapper.get("#route-header-actions");
    const refreshButtons = wrapper
      .findAll("button")
      .filter((button) => button.text() === t("Refresh"));

    expect(refreshButtons).toHaveLength(1);
    expect(headerActions.get("button").text()).toBe(t("Refresh"));
    expect(
      wrapper.find(".staking-shell > .ui-route-header-action").exists(),
    ).toBe(false);
    expect(wrapper.find(".staking-shell h1").exists()).toBe(false);

    await headerActions.get("button").trigger("click");
    await flushPromises();
    expect(fetchAccountAssetsMock).toHaveBeenCalledTimes(2);
  });

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

    expect(wrapper.text()).toContain(t("Set up network and wallet first."));
    expect(getStakeBalanceRow(wrapper).text()).toContain(t("Unavailable"));
    expect(getUnbondDelayRow(wrapper).text()).toContain("—");
    expect(wrapper.findAll("select")[0]?.attributes("disabled")).toBeDefined();
  });

  it("keeps public lane data when the wallet balance request fails", async () => {
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

    expect(wrapper.text()).toContain(t("Wallet stake balance is unavailable."));
    expect(getStakeBalanceRow(wrapper).text()).toContain(t("Unavailable"));
    expect(getStakeBalanceRow(wrapper).text()).not.toContain("0 XOR");
    expect(wrapper.get('[data-testid="staking-assets-error"]').text()).toBe(
      "assets down",
    );
    expect(getUnbondDelayRow(wrapper).text()).toContain("1 min");
    expect(wrapper.text()).toContain("validator@wonderland");
    expect(
      wrapper.findAll("select")[0]?.attributes("disabled"),
    ).toBeUndefined();
  });

  it("does not guess a stake asset when the active profile has no exact asset evidence", async () => {
    const wrapper = mountView("alice@wonderland", {
      assetDefinitionId: "",
    });
    await flushPromises();
    await flushPromises();

    expect(getStakeBalanceRow(wrapper).text()).toContain(t("Unavailable"));
    expect(getStakeBalanceRow(wrapper).text()).not.toContain("10 XOR");
    expect(wrapper.get('[data-testid="staking-assets-error"]').text()).toBe(
      t("Wallet stake balance is unavailable."),
    );
  });

  it("uses the fixed Minamoto asset only for exact verified Minamoto metadata", async () => {
    fetchAccountAssetsMock.mockResolvedValue({
      items: [
        {
          asset_id: "6TEAJqbb8oEPmLncoNiMRbLEK6tw##alice@wonderland",
          quantity: "25",
        },
      ],
      total: 1,
    });
    const wrapper = mountView("alice@wonderland", {
      assetDefinitionId: "",
      chainId: "00000000-0000-0000-0000-000000000000",
      networkPrefix: 753,
    });
    await flushPromises();
    await flushPromises();

    expect(getStakeBalanceRow(wrapper).text()).toContain("25 XOR");
    expect(wrapper.find('[data-testid="staking-assets-error"]').exists()).toBe(
      false,
    );
  });

  it("renders lifecycle validators when Sumeragi and configuration are unavailable", async () => {
    getSumeragiStatusMock.mockRejectedValue(
      new TypeError("proposal_round must be an object"),
    );
    getNexusStakingPolicyMock.mockRejectedValue(
      new Error("401 operator_signature_missing"),
    );

    const wrapper = mountView();
    await flushPromises();
    await flushPromises();

    expect(wrapper.text()).toContain("validator@wonderland");
    expect(wrapper.text()).toContain(t("Consensus telemetry is unavailable."));
    expect(wrapper.text()).toContain(
      t("Unbond scheduling is unavailable because policy is not public."),
    );
    expect(getUnbondDelayRow(wrapper).text()).toContain("—");

    const unbondTab = wrapper.get("#staking-tab-unbond");
    await unbondTab.trigger("click");
    const unbondButton = wrapper
      .get("#staking-panel-unbond")
      .find("[data-ui-primary-action]");
    expect(unbondButton.attributes("disabled")).toBeDefined();
  });

  it("keeps validators visible when lane rewards are unavailable", async () => {
    getNexusPublicLaneRewardsMock.mockRejectedValue(
      new Error("503 route_unavailable"),
    );

    const wrapper = mountView();
    await flushPromises();
    await flushPromises();

    expect(wrapper.text()).toContain("validator@wonderland");
    expect(wrapper.text()).toContain("503 route_unavailable");
    expect(wrapper.find('[role="listbox"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="staking-rewards-error"]').text()).toBe(
      "503 route_unavailable",
    );
    expect(wrapper.get(".staking-rewards-card").text()).toContain(
      t("Unavailable"),
    );
    expect(wrapper.get(".staking-rewards-card").text()).not.toContain(
      t("No pending rewards for this lane/account."),
    );
  });

  it("does not render a failed validator read as an empty live lane", async () => {
    getNexusPublicLaneValidatorsMock.mockRejectedValue(
      new Error("validator route down"),
    );

    const wrapper = mountView();
    await flushPromises();
    await flushPromises();

    expect(wrapper.get('[data-testid="staking-validators-error"]').text()).toBe(
      "validator route down",
    );
    expect(wrapper.text()).not.toContain(
      t("No validators found for this lane."),
    );
    expect(wrapper.find('[role="listbox"]').exists()).toBe(false);
  });

  it("preserves same-context validators and their error when another lane read succeeds", async () => {
    const wrapper = mountView();
    await flushPromises();
    await flushPromises();
    expect(wrapper.text()).toContain("validator@wonderland");

    getNexusPublicLaneValidatorsMock.mockRejectedValueOnce(
      new Error("validator refresh down"),
    );
    const refreshButton = wrapper
      .findAll("button")
      .find((node) => node.text() === t("Refresh"));
    if (!refreshButton) {
      throw new Error("Refresh button not found");
    }
    await refreshButton.trigger("click");
    await flushPromises();
    await flushPromises();

    expect(getNexusPublicLaneRewardsMock).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain("validator@wonderland");
    expect(wrapper.get('[data-testid="staking-validators-error"]').text()).toBe(
      "validator refresh down",
    );
  });

  it("marks lane stake unavailable instead of showing a false zero", async () => {
    getNexusPublicLaneStakeMock.mockImplementation(
      (input: { validator?: string }) =>
        input.validator
          ? Promise.resolve({
              lane_id: 7,
              total: 0,
              items: [],
            })
          : Promise.reject(new Error("lane stake down")),
    );

    const wrapper = mountView();
    await flushPromises();
    await flushPromises();

    expect(wrapper.get('[data-testid="staking-lane-stake-error"]').text()).toBe(
      "lane stake down",
    );
    const bondedStat = getStatForLabel(wrapper, t("Bonded across lane"));
    expect(bondedStat.text()).toContain(t("Unavailable"));
    expect(bondedStat.text()).not.toContain("0 XOR");
  });

  it("marks selected-validator stake unavailable instead of showing an empty position", async () => {
    getNexusPublicLaneStakeMock.mockImplementation(
      (input: { validator?: string }) =>
        input.validator
          ? Promise.reject(new Error("wallet stake down"))
          : Promise.resolve({
              lane_id: 7,
              total: 0,
              items: [],
            }),
    );

    const wrapper = mountView();
    await flushPromises();
    await flushPromises();

    expect(
      wrapper.get('[data-testid="staking-selected-stake-error"]').text(),
    ).toBe("wallet stake down");
    expect(wrapper.get("#staking-panel-unbond").text()).toContain(
      t("Unavailable"),
    );
    expect(wrapper.get("#staking-panel-unbond").text()).not.toContain(
      t("No pending unbond requests for the selected validator."),
    );
  });

  it("keeps staking reads available but blocks writes missing from endpoint capabilities", async () => {
    const wrapper = mountView("alice@wonderland", {
      stakingWrites: false,
    });
    await flushPromises();
    await flushPromises();

    expect(getNexusPublicLaneValidatorsMock).toHaveBeenCalled();
    expect(getNexusPublicLaneStakeMock).toHaveBeenCalled();
    expect(wrapper.text()).toContain("validator@wonderland");
    expect(
      wrapper.get('[data-testid="staking-write-prerequisite"]').text(),
    ).toBe(
      t(
        "This endpoint does not advertise the required staking write operations.",
      ),
    );

    const bondButton = wrapper
      .get("#staking-panel-bond")
      .get("[data-ui-primary-action]");
    expect(bondButton.attributes("disabled")).toBeDefined();

    (bondButton.element as HTMLButtonElement).disabled = false;
    await bondButton.trigger("click");
    await flushPromises();
    expect(bondPublicLaneStakeMock).not.toHaveBeenCalled();
  });

  it("blocks staking mutations when endpoint identity is read-only", async () => {
    const wrapper = mountView("alice@wonderland", {
      writeAllowed: false,
    });
    await flushPromises();
    await flushPromises();

    expect(getNexusPublicLaneValidatorsMock).toHaveBeenCalled();
    expect(
      wrapper.get('[data-testid="staking-write-prerequisite"]').text(),
    ).toBe("Endpoint identity is not verified.");
    expect(
      wrapper
        .get("#staking-panel-bond")
        .get("[data-ui-primary-action]")
        .attributes("disabled"),
    ).toBeDefined();
    expect(bondPublicLaneStakeMock).not.toHaveBeenCalled();
  });

  it("does not treat a separate stake account as this wallet's validator authority", async () => {
    const wrapper = mountView("stake@wonderland");
    await flushPromises();
    await flushPromises();

    expect(wrapper.find(".validator-operator-card .status-pill").text()).toBe(
      t("Not registered"),
    );
    const selectButton = wrapper
      .findAll("button")
      .find((node) => node.text() === t("Select my validator"));
    if (!selectButton) {
      throw new Error("Select my validator button not found");
    }
    expect(selectButton.attributes("disabled")).toBeDefined();
  });

  it("submits validator registration from the operator panel", async () => {
    registerPublicLaneValidatorMock.mockResolvedValue(
      finalizedTransaction("a"),
    );

    const wrapper = mountView();
    await flushPromises();
    await flushPromises();

    await getInputForLabel(wrapper, t("Consensus peer ID")).setValue(
      "peer:alice",
    );
    await getInputForLabel(wrapper, t("Validator endpoint")).setValue(
      "https://validator.example",
    );
    await getInputForLabel(wrapper, t("Commission (bps)")).setValue("250");
    await getInputForLabel(wrapper, t("Self stake (XOR)")).setValue("3");

    const payloadPreview = wrapper.find(".staking-json-preview").text();
    expect(payloadPreview).toContain('"initial_stake": "3"');
    expect(payloadPreview).not.toContain("self_stake");

    const joinButton = wrapper
      .findAll("button")
      .find((node) => node.text() === t("Join consensus"));
    if (!joinButton) {
      throw new Error("Join consensus button not found");
    }
    await joinButton.trigger("click");
    await flushPromises();

    expect(registerPublicLaneValidatorMock).toHaveBeenCalledWith({
      toriiUrl: "http://localhost:8080",
      chainId: "chain",
      networkPrefix: 369,
      laneId: 7,
      validatorAccountId: "alice@wonderland",
      stakeAccountId: "alice@wonderland",
      peerId: "peer:alice",
      selfStake: "3",
      metadata: {
        endpoint: "https://validator.example",
        commission_bps: 250,
      },
      privateKeyHex: "cd".repeat(32),
    });
    expect(wrapper.text()).toContain("a".repeat(64));
    expect(wrapper.text()).toContain("finalized in block 17");
  });

  it("uses an accessible validator master-detail workspace and action tabs", async () => {
    const wrapper = mountView();
    await flushPromises();
    await flushPromises();

    const validatorList = wrapper.get('[role="listbox"]');
    const selectedOption = validatorList.get('[role="option"]');
    expect(selectedOption.attributes("aria-selected")).toBe("true");

    const tablist = wrapper.get('.staking-action-tabs[role="tablist"]');
    const tabs = tablist.findAll('[role="tab"]');
    expect(tabs).toHaveLength(3);
    expect(tabs[0].attributes("aria-selected")).toBe("true");
    expect(tabs[0].attributes("tabindex")).toBe("0");

    await tablist.trigger("keydown", { key: "ArrowRight" });
    expect(tabs[1].attributes("aria-selected")).toBe("true");
    expect(tabs[1].attributes("tabindex")).toBe("0");
    expect(wrapper.get(".staking-advanced").attributes("open")).toBeUndefined();
    expect(
      wrapper.find(".staking-advanced .validator-operator-card").exists(),
    ).toBe(true);
  });
});

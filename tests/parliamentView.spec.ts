import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import ParliamentView from "@/views/ParliamentView.vue";
import { useSessionStore } from "@/stores/session";
import { CITIZEN_BOND_XOR } from "@/utils/parliament";

const fetchAccountAssetsMock = vi.fn();
const listAccountPermissionsMock = vi.fn();
const getGovernanceCouncilCurrentMock = vi.fn();
const getGovernanceReferendumMock = vi.fn();
const getGovernanceTallyMock = vi.fn();
const getGovernanceLocksMock = vi.fn();
const getGovernanceProposalMock = vi.fn();
const registerCitizenMock = vi.fn();
const submitGovernancePlainBallotMock = vi.fn();
const finalizeGovernanceReferendumMock = vi.fn();
const enactGovernanceProposalMock = vi.fn();

vi.mock("@/services/iroha", () => ({
  fetchAccountAssets: (input: unknown) => fetchAccountAssetsMock(input),
  listAccountPermissions: (input: unknown) => listAccountPermissionsMock(input),
  getGovernanceCouncilCurrent: (toriiUrl: string) =>
    getGovernanceCouncilCurrentMock(toriiUrl),
  getGovernanceReferendum: (input: unknown) =>
    getGovernanceReferendumMock(input),
  getGovernanceTally: (input: unknown) => getGovernanceTallyMock(input),
  getGovernanceLocks: (input: unknown) => getGovernanceLocksMock(input),
  getGovernanceProposal: (input: unknown) => getGovernanceProposalMock(input),
  registerCitizen: (input: unknown) => registerCitizenMock(input),
  submitGovernancePlainBallot: (input: unknown) =>
    submitGovernancePlainBallotMock(input),
  finalizeGovernanceReferendum: (input: unknown) =>
    finalizeGovernanceReferendumMock(input),
  enactGovernanceProposal: (input: unknown) =>
    enactGovernanceProposalMock(input),
}));

describe("ParliamentView", () => {
  beforeEach(() => {
    localStorage.clear();
    fetchAccountAssetsMock.mockReset();
    listAccountPermissionsMock.mockReset();
    getGovernanceCouncilCurrentMock.mockReset();
    getGovernanceReferendumMock.mockReset();
    getGovernanceTallyMock.mockReset();
    getGovernanceLocksMock.mockReset();
    getGovernanceProposalMock.mockReset();
    registerCitizenMock.mockReset();
    submitGovernancePlainBallotMock.mockReset();
    finalizeGovernanceReferendumMock.mockReset();
    enactGovernanceProposalMock.mockReset();

    fetchAccountAssetsMock.mockResolvedValue({
      items: [
        {
          asset_id: "xor#wonderland##alice@wonderland",
          quantity: "15000",
        },
      ],
      total: 1,
    });
    listAccountPermissionsMock.mockResolvedValue({
      items: [],
      total: 0,
    });
    getGovernanceCouncilCurrentMock.mockResolvedValue({
      epoch: 1,
      members: [],
      alternates: [],
      candidate_count: 0,
      verified: 0,
      derived_by: "Fallback",
    });
    getGovernanceReferendumMock.mockResolvedValue({
      found: false,
      referendum: null,
    });
    getGovernanceTallyMock.mockResolvedValue({
      found: false,
      referendum_id: "ref-1",
      tally: null,
    });
    getGovernanceLocksMock.mockResolvedValue({
      found: false,
      referendum_id: "ref-1",
      locks: {},
    });
    getGovernanceProposalMock.mockResolvedValue({
      found: false,
      proposal: null,
    });
    registerCitizenMock.mockResolvedValue({ hash: "0xabc" });
    submitGovernancePlainBallotMock.mockResolvedValue({ hash: "0xballot" });
    finalizeGovernanceReferendumMock.mockResolvedValue({
      ok: true,
      proposal_id: null,
      tx_instructions: [],
    });
    enactGovernanceProposalMock.mockResolvedValue({
      ok: true,
      proposal_id: null,
      tx_instructions: [],
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
        networkPrefix: 42,
      },
      accounts: [
        {
          displayName: "Alice",
          domain: "wonderland",
          accountId: "alice@wonderland",
          publicKeyHex: "ab".repeat(32),
          privateKeyHex: "cd".repeat(32),
          ih58: "ih58alice",
          compressed: "",
          compressedWarning: "",
        },
      ],
      activeAccountId: "alice@wonderland",
    });
    return mount(ParliamentView, {
      global: {
        plugins: [pinia],
      },
    });
  };

  const findButtonByText = (
    wrapper: ReturnType<typeof mount>,
    text: string,
  ) => {
    const match = wrapper
      .findAll("button")
      .find((node) => node.text() === text);
    if (!match) {
      throw new Error(`Button not found: ${text}`);
    }
    return match;
  };

  it("submits the fixed 10,000 XOR citizenship bond", async () => {
    const wrapper = mountView();
    await flushPromises();

    await findButtonByText(wrapper, `Bond ${CITIZEN_BOND_XOR} XOR`).trigger(
      "click",
    );
    await flushPromises();

    expect(registerCitizenMock).toHaveBeenCalledWith({
      toriiUrl: "http://localhost:8080",
      chainId: "chain",
      accountId: "alice@wonderland",
      amount: CITIZEN_BOND_XOR,
      privateKeyHex: "cd".repeat(32),
    });
    expect(wrapper.text()).toContain("Citizenship bond submitted: 0xabc");
  });

  it("disables the bond action when XOR balance is below threshold", async () => {
    fetchAccountAssetsMock.mockResolvedValueOnce({
      items: [
        {
          asset_id: "xor#wonderland##alice@wonderland",
          quantity: "9999",
        },
      ],
      total: 1,
    });
    const wrapper = mountView();
    await flushPromises();

    const bondButton = findButtonByText(
      wrapper,
      `Bond ${CITIZEN_BOND_XOR} XOR`,
    );
    expect(bondButton.attributes("disabled")).toBeDefined();
    expect(wrapper.text()).toContain(
      "Available XOR balance is below the required citizen bond amount.",
    );
  });

  it("disables citizenship bond when account already has ballot permission", async () => {
    listAccountPermissionsMock.mockResolvedValueOnce({
      items: [{ name: "CanSubmitGovernanceBallot", payload: null }],
      total: 1,
    });
    const wrapper = mountView();
    await flushPromises();

    const bondButton = findButtonByText(
      wrapper,
      `Bond ${CITIZEN_BOND_XOR} XOR`,
    );
    expect(bondButton.attributes("disabled")).toBeDefined();
    expect(wrapper.text()).toContain(
      "Citizenship voting permission detected. Bonding is no longer required.",
    );
  });

  it("hides low-balance bond warning when account is already a citizen", async () => {
    fetchAccountAssetsMock.mockResolvedValueOnce({
      items: [
        {
          asset_id: "xor#wonderland##alice@wonderland",
          quantity: "1",
        },
      ],
      total: 1,
    });
    listAccountPermissionsMock.mockResolvedValueOnce({
      items: [{ name: "CanSubmitGovernanceBallot", payload: null }],
      total: 1,
    });
    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.text()).toContain(
      "Citizenship voting permission detected. Bonding is no longer required.",
    );
    expect(wrapper.text()).not.toContain(
      "Available XOR balance is below the required citizen bond amount.",
    );
  });

  it("infers proposal id from referendum lookup and stores history", async () => {
    const inferredProposalId = `0x${"1".repeat(64)}`;
    getGovernanceReferendumMock.mockResolvedValueOnce({
      found: true,
      referendum: {
        referendum_id: "ref-1",
        proposal_id: inferredProposalId,
      },
    });
    getGovernanceProposalMock.mockResolvedValueOnce({
      found: true,
      proposal: {
        id: inferredProposalId,
      },
    });

    const wrapper = mountView();
    await flushPromises();

    const referendumInput = wrapper.get('input[placeholder="ref-1"]');
    const proposalInput = wrapper.get('input[placeholder="0x0123..."]');
    await referendumInput.setValue("ref-1");
    await findButtonByText(wrapper, "Load").trigger("click");
    await flushPromises();

    expect(getGovernanceReferendumMock).toHaveBeenCalledWith({
      toriiUrl: "http://localhost:8080",
      referendumId: "ref-1",
    });
    expect(getGovernanceProposalMock).toHaveBeenCalledWith({
      toriiUrl: "http://localhost:8080",
      proposalId: inferredProposalId,
    });
    expect((proposalInput.element as HTMLInputElement).value).toBe(
      inferredProposalId,
    );
    expect(wrapper.text()).toContain("Referendum found: yes.");
    expect(wrapper.text()).toContain("Proposal found: yes.");

    const rawHistory = localStorage.getItem(
      "iroha-demo:parliament-history:alice@wonderland",
    );
    expect(rawHistory).not.toBeNull();
    expect(JSON.parse(rawHistory ?? "{}")).toEqual({
      referenda: ["ref-1"],
      proposals: [inferredProposalId],
    });
  });

  it("replaces invalid proposal input with inferred proposal and keeps records visible", async () => {
    const inferredProposalId = `0x${"3".repeat(64)}`;
    getGovernanceReferendumMock.mockResolvedValueOnce({
      found: true,
      referendum: {
        referendum_id: "ref-1",
        proposal_id: inferredProposalId,
      },
    });
    getGovernanceProposalMock.mockResolvedValueOnce({
      found: true,
      proposal: {
        id: inferredProposalId,
      },
    });
    const wrapper = mountView();
    await flushPromises();

    await wrapper.get('input[placeholder="ref-1"]').setValue("ref-1");
    await wrapper.get('input[placeholder="0x0123..."]').setValue("proposal-1");
    await findButtonByText(wrapper, "Load").trigger("click");
    await flushPromises();

    expect(
      (
        wrapper.get('input[placeholder="0x0123..."]')
          .element as HTMLInputElement
      ).value,
    ).toBe(inferredProposalId);
    expect(wrapper.text()).toContain("Referendum found: yes.");
    expect(wrapper.text()).toContain("Proposal found: yes.");
    expect(wrapper.text()).toContain(
      "Governance records refreshed. Invalid proposal ID was ignored.",
    );
  });

  it("runs referendum lookup when a recent referendum chip is clicked", async () => {
    localStorage.setItem(
      "iroha-demo:parliament-history:alice@wonderland",
      JSON.stringify({
        referenda: ["ref-chip"],
        proposals: [],
      }),
    );
    const wrapper = mountView();
    await flushPromises();

    const chip = wrapper.get('button[title="ref-chip"]');
    await chip.trigger("click");
    await flushPromises();

    expect(getGovernanceReferendumMock).toHaveBeenCalledWith({
      toriiUrl: "http://localhost:8080",
      referendumId: "ref-chip",
    });
  });

  it("runs proposal lookup when a recent proposal chip is clicked", async () => {
    const proposalId = `0x${"d".repeat(64)}`;
    localStorage.setItem(
      "iroha-demo:parliament-history:alice@wonderland",
      JSON.stringify({
        referenda: [],
        proposals: [proposalId],
      }),
    );
    const wrapper = mountView();
    await flushPromises();

    const chip = wrapper.get(`button[title="${proposalId}"]`);
    await chip.trigger("click");
    await flushPromises();

    expect(getGovernanceProposalMock).toHaveBeenCalledWith({
      toriiUrl: "http://localhost:8080",
      proposalId,
    });
  });

  it("blocks lookup when proposal id is not 32-byte hex", async () => {
    const wrapper = mountView();
    await flushPromises();

    await wrapper.get('input[placeholder="0x0123..."]').setValue("proposal-1");
    const loadButton = findButtonByText(wrapper, "Load");
    expect(loadButton.attributes("disabled")).toBeDefined();

    expect(getGovernanceProposalMock).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain(
      "Proposal ID must be 32-byte hex (with or without 0x prefix).",
    );
  });

  it("enables governance lookup when proposal id is corrected", async () => {
    const wrapper = mountView();
    await flushPromises();

    const proposalInput = wrapper.get('input[placeholder="0x0123..."]');
    const loadButton = findButtonByText(wrapper, "Load");
    expect(loadButton.attributes("disabled")).toBeDefined();

    await proposalInput.setValue("proposal-1");
    expect(loadButton.attributes("disabled")).toBeDefined();

    await proposalInput.setValue(`0x${"a".repeat(64)}`);
    expect(loadButton.attributes("disabled")).toBeUndefined();
  });

  it("allows referendum lookup when proposal id is invalid and ignores proposal fetch", async () => {
    const wrapper = mountView();
    await flushPromises();

    await wrapper.get('input[placeholder="ref-1"]').setValue("ref-1");
    await wrapper.get('input[placeholder="0x0123..."]').setValue("proposal-1");
    const loadButton = findButtonByText(wrapper, "Load");
    expect(loadButton.attributes("disabled")).toBeUndefined();

    await loadButton.trigger("click");
    await flushPromises();

    expect(getGovernanceReferendumMock).toHaveBeenCalledWith({
      toriiUrl: "http://localhost:8080",
      referendumId: "ref-1",
    });
    expect(getGovernanceProposalMock).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain(
      "Governance records refreshed. Invalid proposal ID was ignored.",
    );
  });

  it("clears displayed governance payloads when lookup ids are edited", async () => {
    getGovernanceReferendumMock.mockResolvedValueOnce({
      found: true,
      referendum: {
        referendum_id: "ref-1",
      },
    });
    const wrapper = mountView();
    await flushPromises();

    await wrapper.get('input[placeholder="ref-1"]').setValue("ref-1");
    await findButtonByText(wrapper, "Load").trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("Referendum found: yes.");

    await wrapper.get('input[placeholder="ref-1"]').setValue("ref-2");
    await flushPromises();
    expect(wrapper.text()).not.toContain("Referendum found: yes.");
  });

  it("clears stale lookup state and balance when refresh fails", async () => {
    const inferredProposalId = `0x${"9".repeat(64)}`;
    getGovernanceReferendumMock.mockResolvedValueOnce({
      found: true,
      referendum: {
        referendum_id: "ref-1",
        proposal_id: inferredProposalId,
      },
    });
    getGovernanceProposalMock.mockResolvedValueOnce({
      found: true,
      proposal: {
        id: inferredProposalId,
      },
    });
    const wrapper = mountView();
    await flushPromises();

    await wrapper.get('input[placeholder="ref-1"]').setValue("ref-1");
    await findButtonByText(wrapper, "Load").trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("Referendum found: yes.");
    expect(wrapper.text()).toContain("Proposal found: yes.");

    fetchAccountAssetsMock.mockRejectedValueOnce(new Error("assets down"));
    await findButtonByText(wrapper, "Refresh").trigger("click");
    await flushPromises();
    await flushPromises();

    expect(wrapper.text()).toContain("assets down");
    expect(wrapper.text()).not.toContain("Referendum found: yes.");
    expect(wrapper.text()).not.toContain("Proposal found: yes.");
    expect(wrapper.text()).toContain(
      "Available XOR balance is below the required citizen bond amount.",
    );
  });

  it("ignores in-flight lookup payload after refresh failure reset", async () => {
    let resolveReferendum: (value: unknown) => void = () => {};
    const referendumDeferred = new Promise((resolve) => {
      resolveReferendum = resolve;
    });
    getGovernanceReferendumMock.mockReturnValueOnce(referendumDeferred);
    const wrapper = mountView();
    await flushPromises();

    await wrapper.get('input[placeholder="ref-1"]').setValue("ref-1");
    await findButtonByText(wrapper, "Load").trigger("click");
    fetchAccountAssetsMock.mockRejectedValueOnce(new Error("assets down"));
    await findButtonByText(wrapper, "Refresh").trigger("click");
    await flushPromises();

    const loadButtonAfterReset = findButtonByText(wrapper, "Load");
    expect(loadButtonAfterReset.attributes("disabled")).toBeUndefined();

    resolveReferendum({
      found: true,
      referendum: {
        referendum_id: "ref-1",
      },
    });
    await flushPromises();
    await flushPromises();

    expect(wrapper.text()).toContain("assets down");
    expect(wrapper.text()).not.toContain("Referendum found: yes.");

    getGovernanceReferendumMock.mockResolvedValueOnce({
      found: true,
      referendum: {
        referendum_id: "ref-1",
      },
    });
    await findButtonByText(wrapper, "Load").trigger("click");
    await flushPromises();

    expect(getGovernanceReferendumMock).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain("Referendum found: yes.");
  });

  it("ignores stale lookup responses when ids change during request", async () => {
    let resolveReferendum: (value: unknown) => void = () => {};
    const referendumDeferred = new Promise((resolve) => {
      resolveReferendum = resolve;
    });
    getGovernanceReferendumMock.mockReturnValueOnce(referendumDeferred);
    const wrapper = mountView();
    await flushPromises();

    await wrapper.get('input[placeholder="ref-1"]').setValue("ref-1");
    await findButtonByText(wrapper, "Load").trigger("click");
    await wrapper.get('input[placeholder="ref-1"]').setValue("ref-2");

    resolveReferendum({
      found: true,
      referendum: {
        referendum_id: "ref-1",
      },
    });
    await flushPromises();
    await flushPromises();

    expect(wrapper.text()).not.toContain("Referendum found: yes.");
  });

  it("keeps proposal lookup results visible after proposal id auto-normalizes", async () => {
    const uppercaseProposalId = `0x${"A".repeat(64)}`;
    getGovernanceProposalMock.mockResolvedValueOnce({
      found: true,
      proposal: {
        id: uppercaseProposalId,
      },
    });
    const wrapper = mountView();
    await flushPromises();

    await wrapper
      .get('input[placeholder="0x0123..."]')
      .setValue(uppercaseProposalId);
    await findButtonByText(wrapper, "Load").trigger("click");
    await flushPromises();
    await flushPromises();

    expect(wrapper.text()).toContain("Proposal found: yes.");
    expect(
      (
        wrapper.get('input[placeholder="0x0123..."]')
          .element as HTMLInputElement
      ).value,
    ).toBe(`0x${"a".repeat(64)}`);
  });

  it("keeps in-flight proposal lookup results after proposal id auto-normalizes", async () => {
    let resolveProposal: (value: unknown) => void = () => {};
    const proposalDeferred = new Promise((resolve) => {
      resolveProposal = resolve;
    });
    getGovernanceProposalMock.mockReturnValueOnce(proposalDeferred);

    const uppercaseProposalId = `0x${"B".repeat(64)}`;
    const wrapper = mountView();
    await flushPromises();

    const proposalInput = wrapper.get('input[placeholder="0x0123..."]');
    await proposalInput.setValue(uppercaseProposalId);
    await findButtonByText(wrapper, "Load").trigger("click");

    await flushPromises();
    expect((proposalInput.element as HTMLInputElement).value).toBe(
      `0x${"b".repeat(64)}`,
    );

    resolveProposal({
      found: true,
      proposal: {
        id: uppercaseProposalId,
      },
    });
    await flushPromises();
    await flushPromises();

    expect(wrapper.text()).toContain("Proposal found: yes.");
  });

  it("ignores in-flight lookup payload after active account switch", async () => {
    let resolveReferendum: (value: unknown) => void = () => {};
    const referendumDeferred = new Promise((resolve) => {
      resolveReferendum = resolve;
    });
    getGovernanceReferendumMock.mockReturnValueOnce(referendumDeferred);

    const wrapper = mountView();
    await flushPromises();

    await wrapper.get('input[placeholder="ref-1"]').setValue("ref-1");
    await findButtonByText(wrapper, "Load").trigger("click");

    const session = useSessionStore();
    session.$patch({
      accounts: [
        ...(session.accounts ?? []),
        {
          displayName: "Bob",
          domain: "wonderland",
          accountId: "bob@wonderland",
          publicKeyHex: "ef".repeat(32),
          privateKeyHex: "12".repeat(32),
          ih58: "ih58bob",
          compressed: "",
          compressedWarning: "",
        },
      ],
      activeAccountId: "bob@wonderland",
    });
    await flushPromises();

    resolveReferendum({
      found: true,
      referendum: {
        referendum_id: "ref-1",
      },
    });
    await flushPromises();
    await flushPromises();

    expect(wrapper.text()).not.toContain("Referendum found: yes.");
    expect(wrapper.text()).toContain("bob@wonderland");
  });

  it("ignores stale refresh payload after active account switch", async () => {
    let resolveAssets: (value: unknown) => void = () => {};
    const assetsDeferred = new Promise((resolve) => {
      resolveAssets = resolve;
    });
    fetchAccountAssetsMock.mockReturnValueOnce(assetsDeferred);
    fetchAccountAssetsMock.mockResolvedValueOnce({
      items: [
        {
          asset_id: "xor#wonderland##bob@wonderland",
          quantity: "15000",
        },
      ],
      total: 1,
    });

    const wrapper = mountView();
    await flushPromises();

    const session = useSessionStore();
    session.$patch({
      accounts: [
        ...(session.accounts ?? []),
        {
          displayName: "Bob",
          domain: "wonderland",
          accountId: "bob@wonderland",
          publicKeyHex: "ef".repeat(32),
          privateKeyHex: "12".repeat(32),
          ih58: "ih58bob",
          compressed: "",
          compressedWarning: "",
        },
      ],
      activeAccountId: "bob@wonderland",
    });
    await flushPromises();

    resolveAssets({
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

    const xorBalanceRow = wrapper
      .findAll(".kv")
      .find((node) => node.text().includes("XOR Balance"));
    expect(xorBalanceRow?.text()).toContain("15000 XOR");
    expect(wrapper.text()).toContain("bob@wonderland");
    expect(wrapper.text()).not.toContain(
      "Available XOR balance is below the required citizen bond amount.",
    );
  });

  it("disables ballot submission without governance ballot permission", async () => {
    const wrapper = mountView();
    await flushPromises();

    await wrapper.get('input[placeholder="ref-1"]').setValue("ref-1");
    const ballotButton = findButtonByText(wrapper, "Submit ballot");
    expect(ballotButton.attributes("disabled")).toBeDefined();
    expect(wrapper.text()).toContain(
      "Ballot permission is missing on this account.",
    );
  });

  it("disables finalize/enact draft actions when governance permissions are missing", async () => {
    const wrapper = mountView();
    await flushPromises();

    await wrapper.get('input[placeholder="ref-1"]').setValue("ref-1");
    await wrapper
      .get('input[placeholder="0x0123..."]')
      .setValue(`0x${"a".repeat(64)}`);

    const finalizeButton = findButtonByText(wrapper, "Finalize draft");
    const enactButton = findButtonByText(wrapper, "Enact draft");
    expect(finalizeButton.attributes("disabled")).toBeDefined();
    expect(enactButton.attributes("disabled")).toBeDefined();
    expect(wrapper.text()).toContain(
      "Finalize requires CanManageParliament permission.",
    );
    expect(wrapper.text()).toContain(
      "Enact requires CanEnactGovernance permission.",
    );
  });

  it("disables ballot submission for non-integer amount and invalid duration", async () => {
    listAccountPermissionsMock.mockResolvedValueOnce({
      items: [{ name: "CanSubmitGovernanceBallot", payload: null }],
      total: 1,
    });
    const wrapper = mountView();
    await flushPromises();

    await wrapper.get('input[placeholder="ref-1"]').setValue("ref-1");
    const ballotButton = findButtonByText(wrapper, "Submit ballot");

    await wrapper.get('input[placeholder="10000"]').setValue("10.5");
    expect(ballotButton.attributes("disabled")).toBeDefined();
    expect(wrapper.text()).toContain(
      "Ballot amount must be a whole number greater than zero.",
    );

    await wrapper.get('input[placeholder="10000"]').setValue("10");
    await wrapper.get('input[type="number"][min="1"]').setValue("0");
    expect(ballotButton.attributes("disabled")).toBeDefined();
    expect(wrapper.text()).toContain(
      "Lock duration must be a positive integer number of blocks.",
    );
  });

  it("disables ballot submission when amount exceeds XOR balance", async () => {
    listAccountPermissionsMock.mockResolvedValueOnce({
      items: [{ name: "CanSubmitGovernanceBallot", payload: null }],
      total: 1,
    });
    const wrapper = mountView();
    await flushPromises();

    await wrapper.get('input[placeholder="ref-1"]').setValue("ref-1");
    await wrapper.get('input[placeholder="10000"]').setValue("20000");
    const ballotButton = findButtonByText(wrapper, "Submit ballot");

    expect(ballotButton.attributes("disabled")).toBeDefined();
    expect(wrapper.text()).toContain(
      "Ballot amount exceeds the available XOR balance.",
    );
  });
});

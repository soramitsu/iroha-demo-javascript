import { afterEach, describe, expect, it, vi } from "vitest";
import {
  confirmGovernanceAction,
  fetchAccountAssets,
  getChainMetadata,
  getGovernanceCurrentValidationFeePolicy,
  getGovernanceProposalDetail,
  listGovernanceProposals,
  prepareGovernanceCitizenRegistration,
  prepareGovernanceEnact,
  prepareGovernanceParliamentBallot,
  prepareGovernancePlainBallot,
  prepareGovernanceProposal,
  transferAsset,
} from "@/services/iroha";

const HASH = `0x${"ab".repeat(32)}`;
const ACCOUNT = "alice@wonderland";

describe("Iroha service bridge", () => {
  afterEach(() => {
    delete (window as { iroha?: unknown }).iroha;
  });

  it("fails clearly when preload is unavailable", () => {
    expect(() => getChainMetadata("http://localhost:8080")).toThrow(
      "Iroha bridge is unavailable",
    );
  });

  it("forwards generic reads and writes without changing their payload", async () => {
    const getChainMetadataMock = vi.fn().mockResolvedValue({
      chainId: "chain-alpha",
      networkPrefix: 42,
    });
    const fetchAccountAssetsMock = vi.fn().mockResolvedValue({
      items: [],
      total: 0,
    });
    const transferAssetMock = vi.fn().mockResolvedValue({
      hash: HASH.slice(2),
      status: "Committed",
    });
    (window as any).iroha = {
      getChainMetadata: getChainMetadataMock,
      fetchAccountAssets: fetchAccountAssetsMock,
      transferAsset: transferAssetMock,
    };

    const assetsInput = {
      toriiUrl: "http://localhost:8080",
      accountId: ACCOUNT,
      limit: 25,
    };
    const transferInput = {
      toriiUrl: "http://localhost:8080",
      chainId: "chain-alpha",
      accountId: ACCOUNT,
      destinationAccountId: "bob@wonderland",
      assetDefinitionId: "xor#wonderland",
      quantity: "1",
    };

    await getChainMetadata("http://localhost:8080");
    await fetchAccountAssets(assetsInput);
    await transferAsset(transferInput);

    expect(getChainMetadataMock).toHaveBeenCalledWith({
      toriiUrl: "http://localhost:8080",
    });
    expect(fetchAccountAssetsMock).toHaveBeenCalledWith(assetsInput);
    expect(transferAssetMock).toHaveBeenCalledWith(transferInput);
  });

  it("forwards the live governance catalog and selected proposal reads", async () => {
    const listGovernanceProposalsMock = vi.fn().mockResolvedValue({
      items: [],
      nextCursor: null,
    });
    const getGovernanceProposalDetailMock = vi.fn().mockResolvedValue({
      summary: { proposalId: HASH },
    });
    const getGovernanceCurrentValidationFeePolicyMock = vi
      .fn()
      .mockRejectedValue(new Error("local proof verifier unavailable"));
    (window as any).iroha = {
      listGovernanceProposals: listGovernanceProposalsMock,
      getGovernanceProposalDetail: getGovernanceProposalDetailMock,
      getGovernanceCurrentValidationFeePolicy:
        getGovernanceCurrentValidationFeePolicyMock,
    };

    const listInput = {
      toriiUrl: "http://localhost:8080",
      status: "open",
      proposer: ACCOUNT,
      limit: 50,
    };
    const detailInput = {
      toriiUrl: "http://localhost:8080",
      proposalId: HASH,
      accountId: ACCOUNT,
    };

    await listGovernanceProposals(listInput);
    await getGovernanceProposalDetail(detailInput);
    await expect(
      getGovernanceCurrentValidationFeePolicy("http://localhost:8080"),
    ).rejects.toThrow("local proof verifier unavailable");

    expect(listGovernanceProposalsMock).toHaveBeenCalledWith(listInput);
    expect(getGovernanceProposalDetailMock).toHaveBeenCalledWith(detailInput);
    expect(getGovernanceCurrentValidationFeePolicyMock).toHaveBeenCalledWith({
      toriiUrl: "http://localhost:8080",
    });
  });

  it("forwards every two-phase governance preparation call exactly", async () => {
    const prepared = {
      reviewId: "review",
      operation: "propose",
      title: "Review",
      proposalId: HASH,
      referendumId: null,
      decodedInstruction: {},
      fee: {
        payer: "authority",
        components: [],
        nextBlockHeight: "2",
      },
      expiresAtMs: Date.now() + 60_000,
    };
    const mocks = {
      prepareGovernanceCitizenRegistration: vi.fn().mockResolvedValue(prepared),
      prepareGovernanceProposal: vi.fn().mockResolvedValue(prepared),
      prepareGovernancePlainBallot: vi.fn().mockResolvedValue(prepared),
      prepareGovernanceParliamentBallot: vi.fn().mockResolvedValue(prepared),
      prepareGovernanceEnact: vi.fn().mockResolvedValue(prepared),
    };
    (window as any).iroha = mocks;

    const context = {
      toriiUrl: "http://localhost:8080",
      chainId: "chain-alpha",
      accountId: ACCOUNT,
    };
    const proposal = {
      ...context,
      kind: "ValidationFeePayoutLifecycle" as const,
      payload: {
        payout_binding: { contract_address: "contract:payout" },
        referendum_window: { lower: 100, upper: 3_699 },
      },
    };
    const citizen = {
      ...context,
      proposalId: HASH,
      referendumId: "referendum-1",
      amount: "10",
      durationBlocks: "20",
      direction: "Aye" as const,
    };
    const parliament = {
      ...context,
      proposalId: HASH,
      body: "Review",
      decision: "approve" as const,
    };
    const enact = { ...context, proposalId: HASH };

    await prepareGovernanceCitizenRegistration({
      ...context,
      amount: "100",
    });
    await prepareGovernanceProposal(proposal);
    await prepareGovernancePlainBallot(citizen);
    await prepareGovernanceParliamentBallot(parliament);
    await prepareGovernanceEnact(enact);

    expect(mocks.prepareGovernanceCitizenRegistration).toHaveBeenCalledWith({
      ...context,
      amount: "100",
    });
    expect(mocks.prepareGovernanceProposal).toHaveBeenCalledWith(proposal);
    expect(mocks.prepareGovernancePlainBallot).toHaveBeenCalledWith(citizen);
    expect(mocks.prepareGovernanceParliamentBallot).toHaveBeenCalledWith(
      parliament,
    );
    expect(mocks.prepareGovernanceEnact).toHaveBeenCalledWith(enact);
  });

  it("confirms only the opaque review identifier and current account", async () => {
    const confirmGovernanceActionMock = vi.fn().mockResolvedValue({
      hash: HASH.slice(2),
      operation: "enact",
      proposalId: HASH,
      referendumId: null,
      status: "committed",
    });
    (window as any).iroha = {
      confirmGovernanceAction: confirmGovernanceActionMock,
    };
    const input = { reviewId: "opaque-review", accountId: ACCOUNT };

    await confirmGovernanceAction(input);

    expect(confirmGovernanceActionMock).toHaveBeenCalledWith(input);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  confirmGovernanceAction,
  fetchAccountAssets,
  getChainMetadata,
  getGovernanceCurrentValidationFeePolicy,
  getGovernanceProposalDetail,
  listGovernanceProposals,
  prepareGovernanceCitizenRegistration,
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
      networkPrefix: 369,
      limit: 25,
    };
    const transferInput = {
      toriiUrl: "http://localhost:8080",
      chainId: "chain-alpha",
      networkPrefix: 369,
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

  it("forwards the exact typed proposal reads", async () => {
    const mocks = {
      listGovernanceProposals: vi.fn().mockResolvedValue({
        items: [],
        nextCursor: null,
        limit: 50,
      }),
      getGovernanceProposalDetail: vi.fn().mockResolvedValue({
        summary: { proposalId: HASH },
      }),
      getGovernanceCurrentValidationFeePolicy: vi
        .fn()
        .mockRejectedValue(new Error("local proof verifier unavailable")),
    };
    (window as any).iroha = mocks;

    const listInput = {
      toriiUrl: "http://localhost:8080",
      limit: 50,
      cursor: null,
    };
    const detailInput = {
      toriiUrl: "http://localhost:8080",
      networkPrefix: 369,
      proposalId: HASH,
    };
    const policyInput = {
      toriiUrl: "http://localhost:8080",
      chainId: "fc56984b-2be7-431d-840e-21514d1883f0",
      networkPrefix: 369,
    };

    await listGovernanceProposals(listInput);
    await getGovernanceProposalDetail(detailInput);
    await expect(
      getGovernanceCurrentValidationFeePolicy(policyInput),
    ).rejects.toThrow("local proof verifier unavailable");

    expect(mocks.listGovernanceProposals).toHaveBeenCalledWith(listInput);
    expect(mocks.getGovernanceProposalDetail).toHaveBeenCalledWith(detailInput);
    expect(mocks.getGovernanceCurrentValidationFeePolicy).toHaveBeenCalledWith(
      policyInput,
    );
  });

  it("forwards only current proposal and citizenship preparation", async () => {
    const prepared = {
      reviewId: "review",
      operation: "propose",
      title: "Review",
      proposalId: HASH,
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
    };
    (window as any).iroha = mocks;

    const context = {
      toriiUrl: "http://localhost:8080",
      chainId: "chain-alpha",
      networkPrefix: 369,
      accountId: ACCOUNT,
    };
    const citizen = { ...context, amount: "10000" };
    const proposal = {
      ...context,
      kind: "ValidationFeePayoutLifecycle" as const,
      payload: { payout_binding: { contract_address: "contract:payout" } },
    };

    await prepareGovernanceCitizenRegistration(citizen);
    await prepareGovernanceProposal(proposal);

    expect(mocks.prepareGovernanceCitizenRegistration).toHaveBeenCalledWith(
      citizen,
    );
    expect(mocks.prepareGovernanceProposal).toHaveBeenCalledWith(proposal);
  });

  it("confirms only the opaque review identifier and current account", async () => {
    const confirmGovernanceActionMock = vi.fn().mockResolvedValue({
      hash: HASH.slice(2),
      operation: "propose",
      proposalId: HASH,
      status: "finalized",
    });
    (window as any).iroha = {
      confirmGovernanceAction: confirmGovernanceActionMock,
    };
    const input = { reviewId: "opaque-review", accountId: ACCOUNT };

    await confirmGovernanceAction(input);

    expect(confirmGovernanceActionMock).toHaveBeenCalledWith(input);
  });
});

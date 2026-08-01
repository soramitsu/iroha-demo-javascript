import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchOfflineReadiness } from "@/services/offline";

const getOfflineReadinessMock = vi.fn();

vi.mock("@/services/iroha", () => ({
  getOfflineReadiness: (input: unknown) => getOfflineReadinessMock(input),
}));

describe("offline readiness service", () => {
  beforeEach(() => {
    getOfflineReadinessMock.mockReset();
  });

  it("returns current readiness with unsupported empty allowances", async () => {
    getOfflineReadinessMock.mockResolvedValue({
      required_bridge_abi_version: 21,
      cash_handoff_capability: "cash_handoff_v1",
      max_hops: 8,
      asset_definition_id: "xor#wonderland",
      asset_scale: null,
      evaluated_block_height: 44_916,
      evaluated_block_hash: "2f9d4abe",
      proof_backend_available: false,
      recursive_lineage_supported: false,
      ready: false,
      blockers: [
        {
          code: "proof_backend_unavailable",
          message: "The proof backend is unavailable.",
        },
      ],
    });
    const result = await fetchOfflineReadiness({
      toriiUrl: "https://taira.sora.org",
      assetDefinitionId: "xor#wonderland",
    });

    expect(getOfflineReadinessMock).toHaveBeenCalledWith({
      toriiUrl: "https://taira.sora.org",
      assetDefinitionId: "xor#wonderland",
    });
    expect(result.ready).toBe(false);
    expect(result.allowanceSupported).toBe(false);
    expect(result.allowances).toEqual([]);
    expect(result.blockers[0].code).toBe("proof_backend_unavailable");
  });
});

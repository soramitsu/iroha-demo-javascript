import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchOfflineAllowances } from "@/services/offline";

const listOfflineAllowancesMock = vi.fn();

vi.mock("@/services/iroha", () => ({
  listOfflineAllowances: (input: unknown) => listOfflineAllowancesMock(input),
}));

describe("offline allowance service", () => {
  beforeEach(() => {
    listOfflineAllowancesMock.mockReset();
  });

  it("filters synced allowances to the active asset definition", async () => {
    listOfflineAllowancesMock.mockResolvedValue({
      items: [
        {
          asset_id: "xor#wonderland",
          remaining_amount: "2.5",
          policy_expires_at_ms: 200,
          refresh_at_ms: 400,
        },
        {
          asset_id: "val#wonderland",
          remaining_amount: "99",
          policy_expires_at_ms: 100,
          refresh_at_ms: 150,
        },
      ],
      total: 2,
    });

    const result = await fetchOfflineAllowances({
      toriiUrl: "http://localhost:8080",
      controllerId: "alice@wonderland",
      assetDefinitionId: "xor#wonderland",
    });

    expect(listOfflineAllowancesMock).toHaveBeenCalledWith({
      toriiUrl: "http://localhost:8080",
      controllerId: "alice@wonderland",
      limit: 200,
    });
    expect(result.total).toBe("2.5");
    expect(result.allowances).toHaveLength(1);
    expect(result.allowances[0]?.asset_id).toBe("xor#wonderland");
    expect(result.nextPolicyExpiryMs).toBe(200);
    expect(result.nextRefreshMs).toBe(400);
  });
});

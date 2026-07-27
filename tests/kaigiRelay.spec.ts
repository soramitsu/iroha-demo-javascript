import { describe, expect, it, vi } from "vitest";
import { discoverKaigiRelayManifest } from "../electron/kaigiRelay";

describe("Kaigi relay discovery", () => {
  it("selects healthy relays and returns a non-empty manifest", async () => {
    const client = {
      listKaigiRelays: vi.fn().mockResolvedValue({
        items: [
          {
            relay_id: "relay-degraded",
            status: "degraded",
            bandwidth_class: 8,
          },
          {
            relay_id: "relay-healthy",
            status: "healthy",
            bandwidth_class: 2,
          },
          {
            relay_id: "relay-offline",
            status: "offline",
            bandwidth_class: 10,
          },
        ],
      }),
      getKaigiRelay: vi.fn(async (relayId: string) => ({
        relay: { relay_id: relayId },
        hpke_public_key_b64: `${relayId}-key`,
      })),
    };

    await expect(
      discoverKaigiRelayManifest(client, 1_700_000_000_000),
    ).resolves.toEqual({
      expiryMs: 1_700_000_000_000,
      hops: [
        {
          relayId: "relay-healthy",
          hpkePublicKey: "relay-healthy-key",
          weight: 2,
        },
        {
          relayId: "relay-degraded",
          hpkePublicKey: "relay-degraded-key",
          weight: 1,
        },
      ],
    });
  });

  it("distinguishes an unreachable inventory from an empty healthy response", async () => {
    const transportClient = {
      listKaigiRelays: vi.fn().mockRejectedValue(new Error("HTTP 503")),
      getKaigiRelay: vi.fn(),
    };
    const emptyClient = {
      listKaigiRelays: vi.fn().mockResolvedValue({ items: [] }),
      getKaigiRelay: vi.fn(),
    };

    await expect(
      discoverKaigiRelayManifest(transportClient, 1_700_000_000_000),
    ).rejects.toMatchObject({
      code: "relay_inventory_unreachable",
    });
    await expect(
      discoverKaigiRelayManifest(emptyClient, 1_700_000_000_000),
    ).rejects.toMatchObject({
      code: "relay_inventory_empty",
    });
    expect(emptyClient.getKaigiRelay).not.toHaveBeenCalled();
  });

  it("fails closed when advertised relays have no usable details", async () => {
    const client = {
      listKaigiRelays: vi.fn().mockResolvedValue({
        items: [{ relay_id: "relay-1", status: "healthy" }],
      }),
      getKaigiRelay: vi.fn().mockResolvedValue(null),
    };

    await expect(
      discoverKaigiRelayManifest(client, 1_700_000_000_000),
    ).rejects.toMatchObject({
      code: "relay_inventory_empty",
    });
  });
});

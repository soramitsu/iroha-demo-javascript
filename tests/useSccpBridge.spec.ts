import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useSccpBridge } from "@/composables/useSccpBridge";
import { useSessionStore } from "@/stores/session";
import { SCCP_SOLANA_XOR_ROUTE } from "@/utils/sccp";

const serviceMocks = vi.hoisted(() => ({
  getSccpCapabilities: vi.fn(),
  getSccpProofManifests: vi.fn(),
  getSccpSoraOutboundMaterial: vi.fn(),
  getParameters: vi.fn(),
  listSccpRecentMessages: vi.fn(),
  fetchAccountAssets: vi.fn(),
}));

vi.mock("@/services/iroha", () => serviceMocks);

const exactSolanaRoute = (
  activation: "staged" | "inbound" | "outbound" | "bidirectional",
) => ({
  lane_id: {
    source: { network: "solana_testnet", profile: null },
    target: { network: "sora_taira", profile: null },
  },
  route_id: "taira_sol_xor",
  asset_key: "xor",
  revision: 1,
  activation: { activation, direction: null },
  destination: { family: "solana", deployment: {} },
});

const notFound = () =>
  Object.assign(new Error("route-scoped material not found"), {
    status: 404,
    statusText: "Not Found",
  });

describe("useSccpBridge route-scoped Solana material discovery", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    for (const mock of Object.values(serviceMocks)) {
      mock.mockReset();
    }
    serviceMocks.getSccpCapabilities.mockResolvedValue({
      registry_revision: `0x${"10".repeat(32)}`,
      proof_submit_path: "/v1/bridge/proofs/submit",
      native_message_submit_path: "/v1/bridge/messages",
      sora_outbound_material_path:
        "/v1/sccp/routes/{source_profile}/{route_id}/{asset_key}/{revision}/sora-outbound-material",
    });
    serviceMocks.getParameters.mockResolvedValue({});
    serviceMocks.listSccpRecentMessages.mockResolvedValue({
      items: [],
      total: 0,
      raw: {},
    });
    serviceMocks.fetchAccountAssets.mockResolvedValue({ items: [], total: 0 });

    const session = useSessionStore();
    session.updateConnection({
      toriiUrl: "https://taira.sora.org",
      chainId: "809574f5-fee7-5e69-bfcf-52451e42d50f",
      networkPrefix: 369,
    });
  });

  it.each([
    ["absent", { version: 1, lanes: [] }],
    ["staged", { manifests: [exactSolanaRoute("staged")] }],
    ["inbound-only", { manifests: [exactSolanaRoute("inbound")] }],
    ["retired outbound alias", { manifests: [exactSolanaRoute("outbound")] }],
  ])(
    "preserves %s registry state without requesting outbound material",
    async (_label, set) => {
      serviceMocks.getSccpProofManifests.mockResolvedValue(set);
      const bridge = useSccpBridge(SCCP_SOLANA_XOR_ROUTE);

      await bridge.refreshRoute();

      expect(serviceMocks.getSccpSoraOutboundMaterial).not.toHaveBeenCalled();
      expect(bridge.capabilities.value).not.toBeNull();
      expect(bridge.manifestSet.value).toEqual(set);
      expect(bridge.soraOutboundMaterial.value).toBeNull();
      expect(bridge.routeLoadFailure.value).toBeNull();
    },
  );

  it("preserves an outbound-enabled route when exact material returns 404 and stays not ready", async () => {
    const set = { manifests: [exactSolanaRoute("bidirectional")] };
    serviceMocks.getSccpProofManifests.mockResolvedValue(set);
    serviceMocks.getSccpSoraOutboundMaterial.mockRejectedValue(notFound());
    const bridge = useSccpBridge(SCCP_SOLANA_XOR_ROUTE);

    await bridge.refreshRoute();

    expect(serviceMocks.getSccpSoraOutboundMaterial).toHaveBeenCalledWith({
      toriiUrl: "https://taira.sora.org",
      sourceProfile: "solana-testnet",
      routeId: "taira_sol_xor",
      assetKey: "xor",
      revision: 1,
    });
    expect(bridge.capabilities.value).not.toBeNull();
    expect(bridge.manifestSet.value).toEqual(set);
    expect(bridge.soraOutboundMaterial.value).toBeNull();
    expect(bridge.routeLoadFailure.value).toBeNull();
    expect(bridge.readiness.value.ready).toBe(false);
  });
});

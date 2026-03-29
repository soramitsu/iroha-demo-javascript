import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useVpnStore, VPN_STORAGE_KEY } from "@/stores/vpn";

const snapshot = () =>
  JSON.parse(localStorage.getItem(VPN_STORAGE_KEY) ?? "{}");

describe("vpn store", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it("hydrates defaults and persists non-sensitive state", () => {
    const store = useVpnStore();
    store.hydrate();

    expect(store.selectedExitClass).toBe("standard");
    expect(store.lastProfile).toBeNull();
    expect(store.receipts).toEqual([]);
    expect(store.helperHealth).toBeNull();
    expect(snapshot().selectedExitClass).toBe("standard");
  });

  it("stores selected exit class, profile, receipts, and helper health", () => {
    const store = useVpnStore();
    store.hydrate();
    store.setSelectedExitClass("high-security");
    store.setLastProfile({
      available: true,
      relayEndpoint: "/dns/torii.exit.example/udp/9443/quic",
      supportedExitClasses: ["standard", "low-latency", "high-security"],
      defaultExitClass: "standard",
      leaseSecs: 600,
      dnsPushIntervalSecs: 90,
      meterFamily: "soranet.vpn.standard",
      routePushes: [],
      excludedRoutes: [],
      dnsServers: ["1.1.1.1"],
      tunnelAddresses: ["10.208.0.2/32"],
      mtuBytes: 1280,
      displayBillingLabel: "standard · soranet.vpn.standard",
    });
    store.setReceipts([
      {
        sessionId: "sess_1",
        accountId: "alice@wonderland",
        exitClass: "high-security",
        relayEndpoint: "/dns/torii.exit.example/udp/9443/quic",
        meterFamily: "soranet.vpn.standard",
        connectedAtMs: 1,
        disconnectedAtMs: 2,
        durationMs: 1,
        bytesIn: 0,
        bytesOut: 0,
        status: "disconnected",
        receiptSource: "torii",
      },
    ]);
    store.setHelperHealth({
      platformSupported: true,
      helperManaged: true,
      helperReady: true,
      serverReachable: true,
      profileAvailable: true,
      actionsEnabled: true,
      status: "ready",
      message: "ready",
      helperVersion: "embedded-1.0.0",
      platform: "darwin",
      controllerInstalled: true,
      controllerVersion: "1.0.0",
      controllerKind: "macos-network-extension",
      controllerPath: "/tmp/sora-vpn-controller",
      repairRequired: false,
      systemTunnelConfigured: true,
      systemTunnelActive: false,
      systemTunnelKind: "macos-networksetup",
      systemTunnelInterface: "utun7",
      systemTunnelService: "Wi-Fi",
    });

    const persisted = snapshot();
    expect(persisted.selectedExitClass).toBe("high-security");
    expect(persisted.lastProfile.relayEndpoint).toBe(
      "/dns/torii.exit.example/udp/9443/quic",
    );
    expect(persisted.receipts[0].sessionId).toBe("sess_1");
    expect(persisted.helperHealth.helperReady).toBe(true);
  });

  it("hydrates existing snapshots and normalizes unsupported exit classes", () => {
    localStorage.setItem(
      VPN_STORAGE_KEY,
      JSON.stringify({
        selectedExitClass: "invalid",
        receipts: [{ sessionId: "sess_2" }],
      }),
    );

    const store = useVpnStore();
    store.hydrate();

    expect(store.selectedExitClass).toBe("standard");
    expect(store.receipts).toEqual([{ sessionId: "sess_2" }]);
  });
});

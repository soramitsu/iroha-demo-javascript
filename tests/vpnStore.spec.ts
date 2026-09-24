import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useVpnStore, VPN_STORAGE_KEY } from "@/stores/vpn";

describe("vpn store", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it("hydrates clean defaults and removes the legacy global cache", () => {
    localStorage.setItem(
      VPN_STORAGE_KEY,
      JSON.stringify({ selectedExitClass: "high-security" }),
    );
    const store = useVpnStore();
    store.hydrate();

    expect(store.selectedExitClass).toBe("standard");
    expect(store.lastProfile).toBeNull();
    expect(store.receipts).toEqual([]);
    expect(store.helperHealth).toBeNull();
    expect(localStorage.getItem(VPN_STORAGE_KEY)).toBeNull();
  });

  it("keeps selected exit class, profile, receipts, and health in memory only", () => {
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
      operatorAccountId: "operator@wonderland",
      leaseFee: "25",
      settlementGraceSecs: 120,
      flowLabelBits: 24,
      paddingBudgetMs: 80,
      relayIdHex: "11".repeat(32),
      relayMldsa65PublicKeyHex: "22".repeat(1_952),
      descriptorCommitHex: "33".repeat(32),
      tlsServerName: "relay.example",
      relayTlsSpkiSha256Hex: "44".repeat(32),
      relayCertificateSha256Hex: "55".repeat(32),
      directorySnapshotDigestHex: "66".repeat(32),
    });
    store.setReceipts([
      {
        sessionId: "77".repeat(16),
        accountId: "testuAliceRealI105AccountId",
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
        quoteId: "88".repeat(32),
        paymentTxHash: "99".repeat(32),
        feeAssetId: "xor#universal.universal",
        escrowAccountId: "vpn-escrow@wonderland",
        operatorAccountId: "operator@wonderland",
        leaseFee: "25",
        earnedFee: "10",
        refundedFee: "15",
        leaseIdHex: "aa".repeat(32),
        settleLeaseInstruction: null,
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

    expect(store.selectedExitClass).toBe("high-security");
    expect(store.lastProfile?.relayEndpoint).toBe(
      "/dns/torii.exit.example/udp/9443/quic",
    );
    expect(store.receipts[0]?.sessionId).toBe("77".repeat(16));
    expect(store.helperHealth?.helperReady).toBe(true);
    expect(localStorage.getItem(VPN_STORAGE_KEY)).toBeNull();
  });

  it("does not migrate legacy renderer snapshots", () => {
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
    expect(store.receipts).toEqual([]);
    expect(localStorage.getItem(VPN_STORAGE_KEY)).toBeNull();
  });
});

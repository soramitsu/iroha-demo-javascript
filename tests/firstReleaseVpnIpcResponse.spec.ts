import { describe, expect, it } from "vitest";

import {
  parseFirstReleaseVpnAvailabilityIpcResponse,
  parseFirstReleaseVpnProfileIpcResponse,
  parseFirstReleaseVpnReceiptListIpcResponse,
  parseFirstReleaseVpnStatusIpcResponse,
} from "../electron/firstReleaseVpnIpcResponse";

const availability = () => ({
  platformSupported: true,
  helperManaged: true,
  helperReady: true,
  serverReachable: true,
  profileAvailable: true,
  actionsEnabled: true,
  status: "ready",
  message: "Ready.",
  helperVersion: "embedded-2.0.1",
  platform: "darwin",
  controllerInstalled: true,
  controllerVersion: "2.0.1",
  controllerKind: "macos-network-extension",
  controllerPath: "/Applications/SoraVpnController.app",
  repairRequired: false,
  systemTunnelConfigured: true,
  systemTunnelActive: false,
  systemTunnelKind: "macos-network-extension",
  systemTunnelInterface: "utun7",
  systemTunnelService: "Wi-Fi",
});

const profile = () => ({
  available: true,
  relayEndpoint: "/dns/relay.example/udp/9443/quic",
  supportedExitClasses: ["standard", "low-latency", "high-security"],
  defaultExitClass: "standard",
  leaseSecs: 600,
  dnsPushIntervalSecs: 90,
  meterFamily: "soranet.vpn.standard",
  routePushes: ["0.0.0.0/0"],
  excludedRoutes: ["127.0.0.0/8"],
  dnsServers: ["1.1.1.1"],
  tunnelAddresses: ["10.208.0.2/32"],
  mtuBytes: 1_280,
  displayBillingLabel: "standard · soranet.vpn.standard",
  operatorAccountId: "operator@wonderland",
  leaseFee: "25",
  settlementGraceSecs: 120,
  flowLabelBits: 24,
  paddingBudgetMs: 80,
  relayIdHex: "33".repeat(32),
  relayMldsa65PublicKeyHex: "55".repeat(1_952),
  descriptorCommitHex: "44".repeat(32),
  tlsServerName: "relay.example",
  relayTlsSpkiSha256Hex: "66".repeat(32),
  relayCertificateSha256Hex: "77".repeat(32),
  directorySnapshotDigestHex: "88".repeat(32),
});

const status = () => ({
  state: "idle",
  sessionId: null,
  exitClass: null,
  relayEndpoint: null,
  connectedAtMs: null,
  expiresAtMs: null,
  durationMs: 0,
  bytesIn: 0,
  bytesOut: 0,
  routePushes: [],
  excludedRoutes: [],
  dnsServers: [],
  tunnelAddresses: [],
  mtuBytes: 0,
  helperStatus: "controller-idle",
  controllerInstalled: true,
  controllerVersion: "2.0.1",
  controllerKind: "macos-network-extension",
  reconcileState: null,
  repairRequired: false,
  remoteSessionActive: false,
  systemTunnelActive: false,
  systemTunnelKind: "macos-network-extension",
  systemTunnelInterface: "utun7",
  systemTunnelService: "Wi-Fi",
  errorMessage: null,
  lastReceipt: null,
});

describe("first-release VPN IPC responses", () => {
  it("accepts exact main-process responses", () => {
    expect(parseFirstReleaseVpnAvailabilityIpcResponse(availability())).toEqual(
      availability(),
    );
    expect(parseFirstReleaseVpnProfileIpcResponse(profile())).toEqual(
      profile(),
    );
    expect(parseFirstReleaseVpnStatusIpcResponse(status())).toEqual(status());
    expect(parseFirstReleaseVpnReceiptListIpcResponse([])).toEqual([]);
  });

  it("rejects unknown fields, loose primitives, and fail-open collections", () => {
    expect(() =>
      parseFirstReleaseVpnAvailabilityIpcResponse({
        ...availability(),
        legacyStatus: "ready",
      }),
    ).toThrow(/unsupported shape/u);
    expect(() =>
      parseFirstReleaseVpnStatusIpcResponse({
        ...status(),
        controllerInstalled: 1,
      }),
    ).toThrow(/boolean/u);
    expect(() => parseFirstReleaseVpnReceiptListIpcResponse(null)).toThrow(
      /exact array/u,
    );
    expect(() =>
      parseFirstReleaseVpnReceiptListIpcResponse(new Array(1)),
    ).toThrow(/dense array/u);
  });

  it("rejects compatibility spellings in exact response fields", () => {
    expect(() =>
      parseFirstReleaseVpnProfileIpcResponse({
        ...profile(),
        defaultExitClass: "Standard",
      }),
    ).toThrow(/defaultExitClass/u);
    expect(() =>
      parseFirstReleaseVpnReceiptListIpcResponse([
        {
          sessionId: "session-1",
          accountId: "account-1",
          exitClass: "standard",
          relayEndpoint: "/dns/relay.example/udp/9443/quic",
          meterFamily: "soranet.vpn.standard",
          connectedAtMs: 1,
          disconnectedAtMs: 2,
          durationMs: 1,
          bytesIn: 3,
          bytesOut: 4,
          status: "remote-expiry-pending",
          receiptSource: "local-fallback",
        },
      ]),
    ).toThrow();
  });
});

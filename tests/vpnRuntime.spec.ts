import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type {
  VpnLocalController,
  VpnControllerStatus,
} from "../electron/vpnController";

const getVpnProfileMock = vi.fn();
const createVpnSessionMock = vi.fn();
const getVpnSessionMock = vi.fn();
const deleteVpnSessionMock = vi.fn();
const listVpnReceiptsMock = vi.fn();
const dnsLookupMock = vi.fn();

vi.mock("@iroha/iroha-js", () => ({
  ToriiClient: vi.fn(function MockToriiClient() {
    return {
      getVpnProfile: (...args: unknown[]) => getVpnProfileMock(...args),
      createVpnSession: (...args: unknown[]) => createVpnSessionMock(...args),
      getVpnSession: (...args: unknown[]) => getVpnSessionMock(...args),
      deleteVpnSession: (...args: unknown[]) => deleteVpnSessionMock(...args),
      listVpnReceipts: (...args: unknown[]) => listVpnReceiptsMock(...args),
    };
  }),
}));

vi.mock("../electron/nodeFetch", () => ({
  nodeFetch: vi.fn(),
}));

vi.mock("node:dns/promises", () => ({
  default: {
    lookup: (...args: unknown[]) => dnsLookupMock(...args),
  },
  lookup: (...args: unknown[]) => dnsLookupMock(...args),
}));

import {
  VpnRuntime,
  resolveVpnExcludedRoutesForController,
  resolveVpnRelayEndpoint,
  resolveVpnRelayEndpointForController,
  resolveVpnRoutePushesForController,
} from "../electron/vpnRuntime";

const baseControllerStatus = (): VpnControllerStatus => ({
  installed: true,
  active: false,
  controllerKind: "macos-network-extension",
  interfaceName: "utun7",
  networkService: "Wi-Fi",
  version: "1.0.0",
  controllerPath: "/tmp/sora-vpn-controller",
  repairRequired: false,
  bytesIn: 0,
  bytesOut: 0,
  message: "ready",
});

const createControllerMock = (initial?: Partial<VpnControllerStatus>) => {
  let snapshot: VpnControllerStatus = {
    ...baseControllerStatus(),
    ...initial,
  };
  const controller: VpnLocalController = {
    refreshCapability: vi.fn(async () => snapshot),
    getStatus: vi.fn(async () => snapshot),
    connect: vi.fn(async () => {
      snapshot = { ...snapshot, active: true, message: "connected" };
      return snapshot;
    }),
    disconnect: vi.fn(async () => {
      snapshot = { ...snapshot, active: false, message: "idle" };
      return snapshot;
    }),
    repair: vi.fn(async () => {
      snapshot = { ...snapshot, repairRequired: false, message: "repaired" };
      return snapshot;
    }),
  };
  return controller;
};

const canonicalReceipt = {
  sessionId: "sess_1",
  accountId: "alice@wonderland",
  exitClass: "standard",
  relayEndpoint: "/dns/torii.exit.example/udp/9443/quic",
  meterFamily: "soranet.vpn.standard",
  connectedAtMs: 1_700_000_000_000,
  disconnectedAtMs: 1_700_000_300_000,
  durationMs: 300_000,
  bytesIn: 123,
  bytesOut: 456,
  status: "disconnected",
  receiptSource: "torii" as const,
};

describe("VpnRuntime", () => {
  let userDataPath: string;

  beforeEach(() => {
    const currentMs = Date.now();
    userDataPath = mkdtempSync(join(tmpdir(), "vpn-runtime-"));
    getVpnProfileMock.mockReset().mockResolvedValue({
      available: true,
      relayEndpoint: "/dns/torii.exit.example/udp/9443/quic",
      supportedExitClasses: ["standard", "low-latency", "high-security"],
      defaultExitClass: "standard",
      leaseSecs: 600,
      dnsPushIntervalSecs: 90,
      meterFamily: "soranet.vpn.standard",
      routePushes: ["0.0.0.0/0"],
      excludedRoutes: ["127.0.0.0/8"],
      dnsServers: ["1.1.1.1"],
      tunnelAddresses: ["10.208.0.2/32"],
      mtuBytes: 1280,
      displayBillingLabel: "standard · soranet.vpn.standard",
    });
    createVpnSessionMock.mockReset().mockResolvedValue({
      sessionId: "sess_1",
      accountId: "alice@wonderland",
      exitClass: "standard",
      relayEndpoint: "/dns/torii.exit.example/udp/9443/quic",
      leaseSecs: 600,
      expiresAtMs: currentMs + 600_000,
      connectedAtMs: currentMs,
      meterFamily: "soranet.vpn.standard",
      routePushes: ["0.0.0.0/0"],
      excludedRoutes: ["127.0.0.0/8"],
      dnsServers: ["1.1.1.1"],
      tunnelAddresses: ["10.208.0.2/32"],
      mtuBytes: 1280,
      helperTicketHex: "ab".repeat(32),
      bytesIn: 123,
      bytesOut: 456,
      status: "active",
    });
    getVpnSessionMock.mockReset().mockResolvedValue({
      sessionId: "sess_1",
      accountId: "alice@wonderland",
      exitClass: "standard",
      relayEndpoint: "/dns/torii.exit.example/udp/9443/quic",
      leaseSecs: 600,
      expiresAtMs: currentMs + 600_000,
      connectedAtMs: currentMs,
      meterFamily: "soranet.vpn.standard",
      routePushes: ["0.0.0.0/0"],
      excludedRoutes: ["127.0.0.0/8"],
      dnsServers: ["1.1.1.1"],
      tunnelAddresses: ["10.208.0.2/32"],
      mtuBytes: 1280,
      helperTicketHex: "ab".repeat(32),
      bytesIn: 123,
      bytesOut: 456,
      status: "active",
    });
    deleteVpnSessionMock.mockReset().mockResolvedValue(canonicalReceipt);
    listVpnReceiptsMock.mockReset().mockResolvedValue([canonicalReceipt]);
    dnsLookupMock.mockReset().mockImplementation(async (hostname: string) => {
      if (hostname === "taira.sora.org") {
        return { address: "208.83.1.62", family: 4 };
      }
      if (hostname === "torii.exit.example") {
        return { address: "198.51.100.7", family: 4 };
      }
      return { address: "203.0.113.10", family: 4 };
    });
  });

  afterEach(() => {
    rmSync(userDataPath, { recursive: true, force: true });
  });

  it("rewrites the torii relay host marker onto the public torii host", () => {
    expect(
      resolveVpnRelayEndpoint(
        "/dns/torii/udp/9443/quic",
        "https://taira.sora.org",
      ),
    ).toBe("/dns/taira.sora.org/udp/9443/quic");
    expect(
      resolveVpnRelayEndpoint(
        "/dns/torii/udp/9443/quic",
        "http://127.0.0.1:8080",
      ),
    ).toBe("/ip4/127.0.0.1/udp/9443/quic");
    expect(
      resolveVpnRelayEndpoint(
        "/dns/torii.exit.example/udp/9443/quic",
        "https://taira.sora.org",
      ),
    ).toBe("/dns/torii.exit.example/udp/9443/quic");
  });

  it("pre-resolves controller relay endpoints to ip multiaddrs", async () => {
    expect(
      await resolveVpnRelayEndpointForController(
        "/dns/torii/udp/9443/quic",
        "https://taira.sora.org",
      ),
    ).toBe("/ip4/208.83.1.62/udp/9443/quic");
    expect(
      await resolveVpnRelayEndpointForController(
        "/ip4/127.0.0.1/udp/9443/quic",
        "https://taira.sora.org",
      ),
    ).toBe("/ip4/127.0.0.1/udp/9443/quic");
  });

  it("synthesizes full-tunnel controller routes when torii omits route pushes", () => {
    expect(
      resolveVpnRoutePushesForController(
        [],
        ["10.221.36.170/30", "fd53:7261:6574:0:2134:f68e:bd1e:3332/126"],
      ),
    ).toEqual(["0.0.0.0/0", "::/0"]);
    expect(
      resolveVpnRoutePushesForController([], ["10.221.36.170/30"]),
    ).toEqual(["0.0.0.0/0"]);
    expect(
      resolveVpnRoutePushesForController(
        ["10.0.0.0/8"],
        ["10.221.36.170/30", "fd53:7261:6574:0:2134:f68e:bd1e:3332/126"],
      ),
    ).toEqual(["10.0.0.0/8"]);
  });

  it("excludes the relay endpoint from synthesized full-tunnel controller routes", () => {
    expect(
      resolveVpnExcludedRoutesForController(
        [],
        "/ip4/208.83.1.62/udp/9443/quic",
        ["0.0.0.0/0", "::/0"],
      ),
    ).toEqual(["208.83.1.62/32"]);
    expect(
      resolveVpnExcludedRoutesForController(
        ["127.0.0.0/8"],
        "/ip6/fd53:7261:6574::1/udp/9443/quic",
        ["::/0"],
      ),
    ).toEqual(["127.0.0.0/8", "fd53:7261:6574::1/128"]);
    expect(
      resolveVpnExcludedRoutesForController(
        ["208.83.1.62/32"],
        "/ip4/208.83.1.62/udp/9443/quic",
        ["0.0.0.0/0"],
      ),
    ).toEqual(["208.83.1.62/32"]);
    expect(
      resolveVpnExcludedRoutesForController(
        [],
        "/ip4/208.83.1.62/udp/9443/quic",
        ["10.0.0.0/8"],
      ),
    ).toEqual([]);
  });

  it("normalizes vpn profile relay endpoints onto the active torii host", async () => {
    getVpnProfileMock.mockResolvedValueOnce({
      available: true,
      relayEndpoint: "/dns/torii/udp/9443/quic",
      supportedExitClasses: ["standard"],
      defaultExitClass: "standard",
      leaseSecs: 600,
      dnsPushIntervalSecs: 90,
      meterFamily: "soranet.vpn.standard",
      routePushes: [],
      excludedRoutes: [],
      dnsServers: [],
      tunnelAddresses: ["10.208.0.2/32"],
      mtuBytes: 1280,
      displayBillingLabel: "standard · soranet.vpn.standard",
    });
    const controller = createControllerMock();
    const runtime = new VpnRuntime({
      userDataPath,
      helperVersion: "embedded-1.0.0",
      controller,
    });

    const profile = await runtime.getProfile({
      toriiUrl: "https://taira.sora.org",
    });

    expect(profile?.relayEndpoint).toBe("/dns/taira.sora.org/udp/9443/quic");
  });

  it("connects, reconciles with the authenticated session, and stores canonical receipts", async () => {
    const controller = createControllerMock();
    const runtime = new VpnRuntime({
      userDataPath,
      helperVersion: "embedded-1.0.0",
      controller,
    });

    const connected = await runtime.connect({
      toriiUrl: "https://taira.sora.org",
      accountId: "alice@wonderland",
      privateKeyHex: "ab".repeat(32),
      exitClass: "standard",
    });
    expect(connected.state).toBe("connected");
    expect(connected.relayEndpoint).toBe(
      "/dns/torii.exit.example/udp/9443/quic",
    );
    expect(connected.tunnelAddresses).toEqual(["10.208.0.2/32"]);
    expect(connected.controllerInstalled).toBe(true);
    expect(controller.connect).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "sess_1",
        relayEndpoint: "/ip4/198.51.100.7/udp/9443/quic",
        mtuBytes: 1280,
      }),
    );

    const refreshed = await runtime.getStatus({
      toriiUrl: "https://taira.sora.org",
      accountId: "alice@wonderland",
      privateKeyHex: "ab".repeat(32),
    });
    expect(refreshed.remoteSessionActive).toBe(true);
    expect(getVpnSessionMock).toHaveBeenCalled();

    const disconnected = await runtime.disconnect({
      toriiUrl: "https://taira.sora.org",
      accountId: "alice@wonderland",
      privateKeyHex: "ab".repeat(32),
    });
    expect(disconnected.state).toBe("idle");
    expect(controller.disconnect).toHaveBeenCalled();
    expect(deleteVpnSessionMock).toHaveBeenCalled();

    const receipts = await runtime.listReceipts({
      toriiUrl: "https://taira.sora.org",
      accountId: "alice@wonderland",
      privateKeyHex: "ab".repeat(32),
    });
    expect(receipts[0]?.receiptSource).toBe("torii");
    expect(listVpnReceiptsMock).toHaveBeenCalled();
  });

  it("rewrites torii relay host markers before handing them to the controller", async () => {
    createVpnSessionMock.mockResolvedValueOnce({
      sessionId: "sess_torii_marker",
      accountId: "alice@wonderland",
      exitClass: "standard",
      relayEndpoint: "/dns/torii/udp/9443/quic",
      leaseSecs: 600,
      expiresAtMs: Date.now() + 600_000,
      connectedAtMs: Date.now(),
      meterFamily: "soranet.vpn.standard",
      routePushes: ["0.0.0.0/0"],
      excludedRoutes: [],
      dnsServers: [],
      tunnelAddresses: ["10.208.0.2/32"],
      mtuBytes: 1280,
      helperTicketHex: "ab".repeat(32),
      bytesIn: 0,
      bytesOut: 0,
      status: "active",
    });
    getVpnSessionMock.mockResolvedValueOnce({
      sessionId: "sess_torii_marker",
      accountId: "alice@wonderland",
      exitClass: "standard",
      relayEndpoint: "/dns/torii/udp/9443/quic",
      leaseSecs: 600,
      expiresAtMs: Date.now() + 600_000,
      connectedAtMs: Date.now(),
      meterFamily: "soranet.vpn.standard",
      routePushes: ["0.0.0.0/0"],
      excludedRoutes: [],
      dnsServers: [],
      tunnelAddresses: ["10.208.0.2/32"],
      mtuBytes: 1280,
      helperTicketHex: "ab".repeat(32),
      bytesIn: 0,
      bytesOut: 0,
      status: "active",
    });
    const controller = createControllerMock();
    const runtime = new VpnRuntime({
      userDataPath,
      helperVersion: "embedded-1.0.0",
      controller,
    });

    const connected = await runtime.connect({
      toriiUrl: "https://taira.sora.org",
      accountId: "alice@wonderland",
      privateKeyHex: "ab".repeat(32),
      exitClass: "standard",
    });

    expect(connected.relayEndpoint).toBe("/dns/taira.sora.org/udp/9443/quic");
    expect(controller.connect).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "sess_torii_marker",
        relayEndpoint: "/ip4/208.83.1.62/udp/9443/quic",
      }),
    );
  });

  it("synthesizes controller default routes for live-style empty torii route pushes", async () => {
    createVpnSessionMock.mockResolvedValueOnce({
      sessionId: "sess_default_routes",
      accountId: "alice@wonderland",
      exitClass: "standard",
      relayEndpoint: "/dns/torii/udp/9443/quic",
      leaseSecs: 600,
      expiresAtMs: Date.now() + 600_000,
      connectedAtMs: Date.now(),
      meterFamily: "soranet.vpn.standard",
      routePushes: [],
      excludedRoutes: [],
      dnsServers: [],
      tunnelAddresses: [
        "10.221.36.170/30",
        "fd53:7261:6574:0:2134:f68e:bd1e:3332/126",
      ],
      mtuBytes: 1280,
      helperTicketHex: "ab".repeat(32),
      bytesIn: 0,
      bytesOut: 0,
      status: "active",
    });
    getVpnSessionMock.mockResolvedValueOnce({
      sessionId: "sess_default_routes",
      accountId: "alice@wonderland",
      exitClass: "standard",
      relayEndpoint: "/dns/torii/udp/9443/quic",
      leaseSecs: 600,
      expiresAtMs: Date.now() + 600_000,
      connectedAtMs: Date.now(),
      meterFamily: "soranet.vpn.standard",
      routePushes: [],
      excludedRoutes: [],
      dnsServers: [],
      tunnelAddresses: [
        "10.221.36.170/30",
        "fd53:7261:6574:0:2134:f68e:bd1e:3332/126",
      ],
      mtuBytes: 1280,
      helperTicketHex: "ab".repeat(32),
      bytesIn: 0,
      bytesOut: 0,
      status: "active",
    });
    const controller = createControllerMock();
    const runtime = new VpnRuntime({
      userDataPath,
      helperVersion: "embedded-1.0.0",
      controller,
    });

    await runtime.connect({
      toriiUrl: "https://taira.sora.org",
      accountId: "alice@wonderland",
      privateKeyHex: "ab".repeat(32),
      exitClass: "standard",
    });

    expect(controller.connect).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "sess_default_routes",
        relayEndpoint: "/ip4/208.83.1.62/udp/9443/quic",
        excludedRoutes: ["208.83.1.62/32"],
        routePushes: ["0.0.0.0/0", "::/0"],
      }),
    );
  });

  it("normalizes stale SORA-prefixed account ids for vpn auth calls", async () => {
    const controller = createControllerMock();
    const runtime = new VpnRuntime({
      userDataPath,
      helperVersion: "embedded-1.0.0",
      controller,
    });
    const privateKey = Buffer.from("ab".repeat(32), "hex");

    await runtime.connect({
      toriiUrl: "https://taira.sora.org",
      accountId: "sorauLegacyVisibleAccount1234567890",
      privateKeyHex: "ab".repeat(32),
      exitClass: "standard",
    });
    expect(createVpnSessionMock).toHaveBeenCalledWith(
      { exitClass: "standard" },
      {
        canonicalAuth: {
          accountId: "testuLegacyVisibleAccount1234567890",
          privateKey,
        },
      },
    );

    await runtime.getStatus({
      toriiUrl: "https://taira.sora.org",
      accountId: "sorauLegacyVisibleAccount1234567890",
      privateKeyHex: "ab".repeat(32),
    });
    expect(getVpnSessionMock).toHaveBeenCalledWith("sess_1", {
      canonicalAuth: {
        accountId: "testuLegacyVisibleAccount1234567890",
        privateKey,
      },
    });

    await runtime.disconnect({
      toriiUrl: "https://taira.sora.org",
      accountId: "sorauLegacyVisibleAccount1234567890",
      privateKeyHex: "ab".repeat(32),
    });
    expect(deleteVpnSessionMock).toHaveBeenCalledWith("sess_1", {
      canonicalAuth: {
        accountId: "testuLegacyVisibleAccount1234567890",
        privateKey,
      },
    });

    await runtime.listReceipts({
      toriiUrl: "https://taira.sora.org",
      accountId: "sorauLegacyVisibleAccount1234567890",
      privateKeyHex: "ab".repeat(32),
    });
    expect(listVpnReceiptsMock).toHaveBeenCalledWith({
      canonicalAuth: {
        accountId: "testuLegacyVisibleAccount1234567890",
        privateKey,
      },
    });
  });

  it("reports unavailable availability when the profile endpoint is missing", async () => {
    getVpnProfileMock.mockResolvedValueOnce(null);
    const controller = createControllerMock();
    const runtime = new VpnRuntime({
      userDataPath,
      helperVersion: "embedded-1.0.0",
      controller,
    });

    const availability = await runtime.getAvailability({
      toriiUrl: "https://taira.sora.org",
    });

    expect(availability.actionsEnabled).toBe(false);
    expect(availability.status).toBe("unavailable");
  });

  it("marks remote cleanup pending when the local disconnect succeeds but the remote delete fails", async () => {
    deleteVpnSessionMock.mockRejectedValueOnce(
      new Error("remote delete failed"),
    );
    const controller = createControllerMock();
    const runtime = new VpnRuntime({
      userDataPath,
      helperVersion: "embedded-1.0.0",
      controller,
    });

    await runtime.connect({
      toriiUrl: "https://taira.sora.org",
      accountId: "alice@wonderland",
      privateKeyHex: "ab".repeat(32),
      exitClass: "standard",
    });

    const disconnected = await runtime.disconnect({
      toriiUrl: "https://taira.sora.org",
      accountId: "alice@wonderland",
      privateKeyHex: "ab".repeat(32),
    });

    expect(disconnected.state).toBe("remote-delete-pending");
    expect(disconnected.lastReceipt?.receiptSource).toBe("local-fallback");
    expect(controller.disconnect).toHaveBeenCalled();
  });

  it("surfaces repair-needed state when the controller requires repair", async () => {
    const controller = createControllerMock({
      repairRequired: true,
      message: "repair me",
    });
    const runtime = new VpnRuntime({
      userDataPath,
      helperVersion: "embedded-1.0.0",
      controller,
    });

    const status = await runtime.getStatus();
    expect(status.state).toBe("repair-needed");
    expect(status.repairRequired).toBe(true);
    expect(status.errorMessage).toBe("repair me");
  });
});

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

import { VpnRuntime } from "../electron/vpnRuntime";

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
  });

  afterEach(() => {
    rmSync(userDataPath, { recursive: true, force: true });
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
    expect(connected.tunnelAddresses).toEqual(["10.208.0.2/32"]);
    expect(connected.controllerInstalled).toBe(true);
    expect(controller.connect).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "sess_1",
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

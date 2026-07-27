import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type {
  VpnLocalController,
  VpnControllerStatus,
} from "../electron/vpnController";

const getVpnProfileMock = vi.fn();
const createVpnQuoteMock = vi.fn();
const createVpnSessionMock = vi.fn();
const getVpnSessionMock = vi.fn();
const deleteVpnSessionMock = vi.fn();
const listVpnReceiptsMock = vi.fn();
const submitTransactionMock = vi.fn();
const getTransactionStatusMock = vi.fn();
const quoteAndSignTransactionMock = vi.fn();
const dnsLookupMock = vi.fn();
const nodeFetchMock = vi.fn();

vi.mock("@iroha/iroha-js", () => ({
  quoteAndSignTransaction: (...args: unknown[]) =>
    quoteAndSignTransactionMock(...args),
  ToriiClient: vi.fn(function MockToriiClient() {
    return {
      getVpnProfile: (...args: unknown[]) => getVpnProfileMock(...args),
      createVpnQuote: (...args: unknown[]) => createVpnQuoteMock(...args),
      createVpnSession: (...args: unknown[]) => createVpnSessionMock(...args),
      submitTransaction: (...args: unknown[]) => submitTransactionMock(...args),
      getTransactionStatus: (...args: unknown[]) =>
        getTransactionStatusMock(...args),
      getVpnSession: (...args: unknown[]) => getVpnSessionMock(...args),
      deleteVpnSession: (...args: unknown[]) => deleteVpnSessionMock(...args),
      listVpnReceipts: (...args: unknown[]) => listVpnReceiptsMock(...args),
    };
  }),
}));

vi.mock("../electron/nodeFetch", () => ({
  nodeFetch: (...args: unknown[]) => nodeFetchMock(...args),
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

const VPN_PAYMENT_HASH = "cd".repeat(32);
const VPN_PAYMENT_BLOCK_HASH = "ef".repeat(32);
const VPN_PAYMENT_BLOCK_HEIGHT = 17;

const appliedPaymentStatus = () => ({
  hash: VPN_PAYMENT_HASH,
  scope: "global",
  resolved_from: "state",
  status: {
    kind: "Applied",
    block_height: VPN_PAYMENT_BLOCK_HEIGHT,
  },
});

const committedPaymentStatus = () => ({
  hash: VPN_PAYMENT_HASH,
  scope: "global",
  resolved_from: "cache",
  status: {
    kind: "Committed",
    block_height: VPN_PAYMENT_BLOCK_HEIGHT,
  },
});

const finalityResponse = (payload: unknown) =>
  new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

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
    createVpnQuoteMock.mockReset().mockResolvedValue({
      quoteId: "11".repeat(32),
      txInstructions: [
        {
          wireId: "OpenVpnLeaseEscrow",
          payloadHex: "abcd",
        },
      ],
    });
    quoteAndSignTransactionMock.mockReset().mockResolvedValue({
      signedTransaction: Buffer.from("signed-vpn-payment"),
      hash: Buffer.from(VPN_PAYMENT_HASH, "hex"),
    });
    submitTransactionMock.mockReset().mockResolvedValue({
      accepted: true,
    });
    getTransactionStatusMock
      .mockReset()
      .mockImplementation(async () => appliedPaymentStatus());
    nodeFetchMock.mockReset().mockImplementation(async (input: unknown) => {
      const url = new URL(String(input));
      if (url.pathname === `/v1/explorer/transactions/${VPN_PAYMENT_HASH}`) {
        return finalityResponse({
          hash: VPN_PAYMENT_HASH,
          block: VPN_PAYMENT_BLOCK_HEIGHT,
          status: "Committed",
        });
      }
      if (url.pathname === `/v1/explorer/blocks/${VPN_PAYMENT_BLOCK_HEIGHT}`) {
        return finalityResponse({
          hash: VPN_PAYMENT_BLOCK_HASH,
          height: VPN_PAYMENT_BLOCK_HEIGHT,
          transactions_hash: VPN_PAYMENT_HASH,
          transactions_total: 1,
        });
      }
      if (url.pathname === "/v1/explorer/metrics") {
        return finalityResponse({
          block: VPN_PAYMENT_BLOCK_HEIGHT,
          finalized_block: VPN_PAYMENT_BLOCK_HEIGHT,
        });
      }
      throw new Error(`Unexpected VPN finality request: ${url.pathname}`);
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
    listVpnReceiptsMock
      .mockReset()
      .mockResolvedValue({ items: [canonicalReceipt] });
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
    vi.useRealTimers();
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

  it("rejects malformed VPN profiles instead of inventing a service class", async () => {
    getVpnProfileMock.mockResolvedValueOnce({
      available: true,
      relayEndpoint: "/dns/torii/udp/9443/quic",
      supportedExitClasses: [],
      defaultExitClass: "unknown",
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
    const runtime = new VpnRuntime({
      userDataPath,
      helperVersion: "embedded-1.0.0",
      controller: createControllerMock(),
    });

    await expect(
      runtime.getProfile({ toriiUrl: "https://taira.sora.org" }),
    ).rejects.toThrow(/supportedExitClasses/u);
  });

  it("rejects an unsupported requested service class before quoting", async () => {
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

    await expect(
      runtime.connect({
        toriiUrl: "https://taira.sora.org",
        chainId: "chain",
        networkPrefix: 369,
        accountId: "alice@wonderland",
        privateKeyHex: "ab".repeat(32),
        exitClass: "low-latency",
      }),
    ).rejects.toThrow(/is not supported by this endpoint/u);
    expect(createVpnQuoteMock).not.toHaveBeenCalled();
    expect(controller.connect).not.toHaveBeenCalled();
  });

  it("rejects a session returned for a different service class", async () => {
    createVpnSessionMock.mockResolvedValueOnce({
      sessionId: "sess_wrong_class",
      accountId: "alice@wonderland",
      exitClass: "high-security",
      relayEndpoint: "/dns/torii.exit.example/udp/9443/quic",
      leaseSecs: 600,
      expiresAtMs: Date.now() + 600_000,
      connectedAtMs: Date.now(),
      meterFamily: "soranet.vpn.high-security",
      routePushes: ["0.0.0.0/0"],
      excludedRoutes: [],
      dnsServers: ["1.1.1.1"],
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

    await expect(
      runtime.connect({
        toriiUrl: "https://taira.sora.org",
        chainId: "chain",
        networkPrefix: 369,
        accountId: "alice@wonderland",
        privateKeyHex: "ab".repeat(32),
        exitClass: "standard",
      }),
    ).rejects.toThrow(/service class mismatch/u);
    expect(controller.connect).not.toHaveBeenCalled();
    expect(deleteVpnSessionMock).toHaveBeenCalledWith(
      "sess_wrong_class",
      expect.any(Object),
    );
  });

  it("quarantines legacy global VPN state and never persists session secrets or receipts", async () => {
    const vpnDataPath = join(userDataPath, "vpn");
    const activeSessionPath = join(vpnDataPath, "active-session.json");
    const receiptsPath = join(vpnDataPath, "receipts.json");
    mkdirSync(vpnDataPath, { recursive: true });
    writeFileSync(
      activeSessionPath,
      JSON.stringify({
        toriiUrl: "https://archived.example",
        accountId: "testuArchived",
        privateKeyHex: "ff".repeat(32),
        helperTicketHex: "ee".repeat(32),
      }),
    );
    writeFileSync(receiptsPath, JSON.stringify([canonicalReceipt]));

    const runtime = new VpnRuntime({
      userDataPath,
      helperVersion: "embedded-1.0.0",
      controller: createControllerMock(),
    });
    expect(existsSync(activeSessionPath)).toBe(false);
    expect(existsSync(receiptsPath)).toBe(false);

    await runtime.connect({
      toriiUrl: "https://taira.sora.org",
      chainId: "chain",
      networkPrefix: 369,
      accountId: "alice@wonderland",
      privateKeyHex: "ab".repeat(32),
      exitClass: "standard",
    });
    expect(existsSync(activeSessionPath)).toBe(false);

    await runtime.disconnect({
      toriiUrl: "https://taira.sora.org",
      chainId: "chain",
      networkPrefix: 369,
      accountId: "alice@wonderland",
      privateKeyHex: "ab".repeat(32),
    });
    expect(existsSync(receiptsPath)).toBe(false);
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
      chainId: "chain",
      networkPrefix: 369,
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
      chainId: "chain",
      networkPrefix: 369,
      accountId: "alice@wonderland",
      privateKeyHex: "ab".repeat(32),
    });
    expect(refreshed.remoteSessionActive).toBe(true);
    expect(getVpnSessionMock).toHaveBeenCalled();

    const disconnected = await runtime.disconnect({
      toriiUrl: "https://taira.sora.org",
      chainId: "chain",
      networkPrefix: 369,
      accountId: "alice@wonderland",
      privateKeyHex: "ab".repeat(32),
    });
    expect(disconnected.state).toBe("idle");
    expect(controller.disconnect).toHaveBeenCalled();
    expect(deleteVpnSessionMock).toHaveBeenCalled();

    const receipts = await runtime.listReceipts({
      toriiUrl: "https://taira.sora.org",
      chainId: "chain",
      networkPrefix: 369,
      accountId: "alice@wonderland",
      privateKeyHex: "ab".repeat(32),
    });
    expect(receipts[0]?.receiptSource).toBe("torii");
    expect(listVpnReceiptsMock).toHaveBeenCalled();
  });

  it("never returns receipts from a previous endpoint/account context when the new live sync fails", async () => {
    listVpnReceiptsMock.mockResolvedValueOnce({ items: [canonicalReceipt] });
    const runtime = new VpnRuntime({
      userDataPath,
      helperVersion: "embedded-1.0.0",
      controller: createControllerMock(),
    });
    const aliceReceipts = await runtime.listReceipts({
      toriiUrl: "https://taira.sora.org",
      chainId: "chain-a",
      networkPrefix: 369,
      accountId: "alice@wonderland",
      privateKeyHex: "ab".repeat(32),
    });
    expect(aliceReceipts).toHaveLength(1);

    listVpnReceiptsMock.mockRejectedValueOnce(new Error("endpoint B offline"));
    const bobReceipts = await runtime.listReceipts({
      toriiUrl: "https://minamoto.sora.org",
      chainId: "chain-b",
      networkPrefix: 753,
      accountId: "bob@wonderland",
      privateKeyHex: "bc".repeat(32),
    });

    expect(bobReceipts).toEqual([]);
  });

  it("never exposes active-session receipts without an explicit wallet context", async () => {
    const runtime = new VpnRuntime({
      userDataPath,
      helperVersion: "embedded-1.0.0",
      controller: createControllerMock(),
    });
    await runtime.connect({
      toriiUrl: "https://taira.sora.org",
      chainId: "chain-a",
      networkPrefix: 369,
      accountId: "alice@wonderland",
      privateKeyHex: "ab".repeat(32),
      exitClass: "standard",
    });
    listVpnReceiptsMock.mockClear();

    await expect(runtime.listReceipts()).resolves.toEqual([]);
    expect(listVpnReceiptsMock).not.toHaveBeenCalled();
  });

  it("discards late receipt sync completions after the exact endpoint/account context changes", async () => {
    const bobReceipt = {
      ...canonicalReceipt,
      sessionId: "sess_bob",
      accountId: "bob@wonderland",
    };
    let resolveAlice!: (value: { items: [typeof canonicalReceipt] }) => void;
    let resolveBob!: (value: { items: [typeof bobReceipt] }) => void;
    const aliceResponse = new Promise<{ items: [typeof canonicalReceipt] }>(
      (resolve) => {
        resolveAlice = resolve;
      },
    );
    const bobResponse = new Promise<{ items: [typeof bobReceipt] }>(
      (resolve) => {
        resolveBob = resolve;
      },
    );
    listVpnReceiptsMock
      .mockReturnValueOnce(aliceResponse)
      .mockReturnValueOnce(bobResponse);
    const runtime = new VpnRuntime({
      userDataPath,
      helperVersion: "embedded-1.0.0",
      controller: createControllerMock(),
    });
    const alice = {
      toriiUrl: "https://taira.sora.org",
      chainId: "chain-a",
      networkPrefix: 369,
      accountId: "alice@wonderland",
      privateKeyHex: "ab".repeat(32),
    };
    const bob = {
      toriiUrl: "https://minamoto.sora.org",
      chainId: "chain-b",
      networkPrefix: 753,
      accountId: "bob@wonderland",
      privateKeyHex: "bc".repeat(32),
    };

    const aliceReceipts = runtime.listReceipts(alice);
    await vi.waitFor(() => {
      expect(listVpnReceiptsMock).toHaveBeenCalledTimes(1);
    });
    const bobReceipts = runtime.listReceipts(bob);
    await vi.waitFor(() => {
      expect(listVpnReceiptsMock).toHaveBeenCalledTimes(2);
    });

    resolveBob({ items: [bobReceipt] });
    await expect(bobReceipts).resolves.toEqual([
      expect.objectContaining({ sessionId: "sess_bob" }),
    ]);

    resolveAlice({ items: [canonicalReceipt] });
    await expect(aliceReceipts).resolves.toEqual([]);

    listVpnReceiptsMock.mockRejectedValueOnce(new Error("refresh offline"));
    const retainedBobReceipts = await runtime.listReceipts(bob);
    expect(retainedBobReceipts.map((receipt) => receipt.sessionId)).toEqual([
      "sess_bob",
    ]);
  });

  it("hides an active session after an endpoint/account switch and refuses mismatched reconciliation or disconnect", async () => {
    const controller = createControllerMock();
    const runtime = new VpnRuntime({
      userDataPath,
      helperVersion: "embedded-1.0.0",
      controller,
    });
    const alice = {
      toriiUrl: "https://taira.sora.org",
      chainId: "chain-a",
      networkPrefix: 369,
      accountId: "alice@wonderland",
      privateKeyHex: "ab".repeat(32),
    };
    const bob = {
      toriiUrl: "https://minamoto.sora.org",
      chainId: "chain-b",
      networkPrefix: 753,
      accountId: "bob@wonderland",
      privateKeyHex: "bc".repeat(32),
    };

    await runtime.connect({ ...alice, exitClass: "standard" });
    getVpnSessionMock.mockClear();
    deleteVpnSessionMock.mockClear();

    const hidden = await runtime.getStatus(bob);
    expect(hidden).toMatchObject({
      state: "repair-needed",
      sessionId: null,
      remoteSessionActive: false,
      reconcileState: "active-session-context-mismatch",
      lastReceipt: null,
    });
    expect(getVpnSessionMock).not.toHaveBeenCalled();

    const repaired = await runtime.repair();
    expect(repaired.sessionId).toBeNull();
    expect(controller.repair).toHaveBeenCalledOnce();
    expect(getVpnSessionMock).not.toHaveBeenCalled();

    await runtime.disconnect(bob);
    expect(controller.disconnect).not.toHaveBeenCalled();
    expect(deleteVpnSessionMock).not.toHaveBeenCalled();

    const ownerStatus = await runtime.getStatus(alice);
    expect(ownerStatus).toMatchObject({
      state: "connected",
      sessionId: "sess_1",
      remoteSessionActive: true,
    });
    expect(getVpnSessionMock).toHaveBeenCalledWith(
      "sess_1",
      expect.any(Object),
    );
  });

  it("reports controller-only status without exposing or querying an active remote session when context is absent", async () => {
    const controller = createControllerMock();
    const runtime = new VpnRuntime({
      userDataPath,
      helperVersion: "embedded-1.0.0",
      controller,
    });
    const owner = {
      toriiUrl: "https://taira.sora.org",
      chainId: "chain-a",
      networkPrefix: 369,
      accountId: "alice@wonderland",
      privateKeyHex: "ab".repeat(32),
    };

    await runtime.connect({ ...owner, exitClass: "standard" });
    getVpnSessionMock.mockClear();
    listVpnReceiptsMock.mockClear();

    const localStatus = await runtime.getStatus();

    expect(localStatus).toMatchObject({
      state: "repair-needed",
      sessionId: null,
      repairRequired: true,
      remoteSessionActive: false,
      systemTunnelActive: true,
      reconcileState: "local-tunnel-active-without-session-context",
      lastReceipt: null,
    });
    expect(getVpnSessionMock).not.toHaveBeenCalled();
    expect(listVpnReceiptsMock).not.toHaveBeenCalled();
  });

  it("rejects non-Ed25519 wallets before VPN canonical auth signing", async () => {
    const controller = createControllerMock();
    const runtime = new VpnRuntime({
      userDataPath,
      helperVersion: "embedded-1.0.0",
      controller,
    });

    await expect(
      runtime.connect({
        toriiUrl: "https://taira.sora.org",
        chainId: "chain",
        networkPrefix: 369,
        accountId: "alice@wonderland",
        privateKeyHex: "ab".repeat(32),
        signingAlgorithm: "secp256k1",
        exitClass: "standard",
      }),
    ).rejects.toThrow(
      /VPN connect currently requires an Ed25519 wallet because VPN canonical authentication is Ed25519-only/,
    );

    expect(createVpnQuoteMock).not.toHaveBeenCalled();
    expect(createVpnSessionMock).not.toHaveBeenCalled();
    expect(quoteAndSignTransactionMock).not.toHaveBeenCalled();
  });

  it("creates no session until the accepted payment is proven in a finalized block", async () => {
    vi.useFakeTimers();
    let statusKind: "Committed" | "Applied" = "Committed";
    let finalizedBlockHeight = VPN_PAYMENT_BLOCK_HEIGHT - 1;
    getTransactionStatusMock.mockImplementation(async () =>
      statusKind === "Committed"
        ? committedPaymentStatus()
        : appliedPaymentStatus(),
    );
    nodeFetchMock.mockImplementation(async (input: unknown) => {
      const url = new URL(String(input));
      if (url.pathname === `/v1/explorer/transactions/${VPN_PAYMENT_HASH}`) {
        return finalityResponse({
          hash: VPN_PAYMENT_HASH,
          block: VPN_PAYMENT_BLOCK_HEIGHT,
          status: "Committed",
        });
      }
      if (url.pathname === `/v1/explorer/blocks/${VPN_PAYMENT_BLOCK_HEIGHT}`) {
        return finalityResponse({
          hash: VPN_PAYMENT_BLOCK_HASH,
          height: VPN_PAYMENT_BLOCK_HEIGHT,
          transactions_hash: VPN_PAYMENT_HASH,
          transactions_total: 1,
        });
      }
      if (url.pathname === "/v1/explorer/metrics") {
        return finalityResponse({
          block: VPN_PAYMENT_BLOCK_HEIGHT,
          finalized_block: finalizedBlockHeight,
        });
      }
      throw new Error(`Unexpected VPN finality request: ${url.pathname}`);
    });
    const controller = createControllerMock();
    const runtime = new VpnRuntime({
      userDataPath,
      helperVersion: "embedded-1.0.0",
      controller,
    });

    const connect = runtime.connect({
      toriiUrl: "https://taira.sora.org",
      chainId: "chain",
      networkPrefix: 369,
      accountId: "alice@wonderland",
      privateKeyHex: "ab".repeat(32),
      exitClass: "standard",
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(submitTransactionMock).toHaveBeenCalledWith(
      Buffer.from("signed-vpn-payment"),
    );
    expect(getTransactionStatusMock).toHaveBeenCalledWith(VPN_PAYMENT_HASH, {
      scope: "global",
    });
    expect(createVpnSessionMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2_000);
    expect(getTransactionStatusMock.mock.calls.length).toBeGreaterThan(1);
    expect(nodeFetchMock).not.toHaveBeenCalled();
    expect(createVpnSessionMock).not.toHaveBeenCalled();

    statusKind = "Applied";
    await vi.advanceTimersByTimeAsync(1_000);
    expect(nodeFetchMock).toHaveBeenCalledWith(
      new URL(
        `/v1/explorer/transactions/${VPN_PAYMENT_HASH}`,
        "https://taira.sora.org/",
      ),
      expect.objectContaining({ method: "GET" }),
    );
    expect(createVpnSessionMock).not.toHaveBeenCalled();

    finalizedBlockHeight = VPN_PAYMENT_BLOCK_HEIGHT;
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(connect).resolves.toMatchObject({ state: "connected" });
    expect(createVpnSessionMock).toHaveBeenCalled();
  });

  it("rejects mismatched finalized-block evidence before creating a session", async () => {
    nodeFetchMock.mockImplementation(async (input: unknown) => {
      const url = new URL(String(input));
      if (url.pathname === `/v1/explorer/transactions/${VPN_PAYMENT_HASH}`) {
        return finalityResponse({
          hash: "aa".repeat(32),
          block: VPN_PAYMENT_BLOCK_HEIGHT,
          status: "Committed",
        });
      }
      if (url.pathname === `/v1/explorer/blocks/${VPN_PAYMENT_BLOCK_HEIGHT}`) {
        return finalityResponse({
          hash: VPN_PAYMENT_BLOCK_HASH,
          height: VPN_PAYMENT_BLOCK_HEIGHT,
          transactions_hash: VPN_PAYMENT_HASH,
          transactions_total: 1,
        });
      }
      if (url.pathname === "/v1/explorer/metrics") {
        return finalityResponse({
          block: VPN_PAYMENT_BLOCK_HEIGHT,
          finalized_block: VPN_PAYMENT_BLOCK_HEIGHT,
        });
      }
      throw new Error(`Unexpected VPN finality request: ${url.pathname}`);
    });
    const controller = createControllerMock();
    const runtime = new VpnRuntime({
      userDataPath,
      helperVersion: "embedded-1.0.0",
      controller,
    });

    await expect(
      runtime.connect({
        toriiUrl: "https://taira.sora.org",
        chainId: "chain",
        networkPrefix: 369,
        accountId: "alice@wonderland",
        privateKeyHex: "ab".repeat(32),
        exitClass: "standard",
      }),
    ).rejects.toThrow(
      /Explorer transaction hash does not match the submitted transaction/u,
    );

    expect(createVpnSessionMock).not.toHaveBeenCalled();
    expect(controller.connect).not.toHaveBeenCalled();
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
      chainId: "chain",
      networkPrefix: 369,
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
      chainId: "chain",
      networkPrefix: 369,
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
      chainId: "chain",
      accountId: "sorauLegacyVisibleAccount1234567890",
      networkPrefix: 369,
      privateKeyHex: "ab".repeat(32),
      exitClass: "standard",
    });
    expect(createVpnQuoteMock).toHaveBeenCalledWith(
      {
        exitClass: "standard",
        meteringPublicKeyHex: expect.stringMatching(/^[\da-f]{64}$/),
      },
      {
        canonicalAuth: {
          accountId: "testuLegacyVisibleAccount1234567890",
          privateKey,
        },
      },
    );
    expect(quoteAndSignTransactionMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        chainId: "chain",
        authority: "testuLegacyVisibleAccount1234567890",
        instructions: [
          {
            wire_id: "OpenVpnLeaseEscrow",
            payload_hex: "abcd",
          },
        ],
        privateKey,
        privateKeyAlgorithm: "ed25519",
      }),
      {
        canonicalAuth: {
          accountId: "testuLegacyVisibleAccount1234567890",
          privateKey,
        },
      },
    );
    expect(submitTransactionMock).toHaveBeenCalledWith(
      Buffer.from("signed-vpn-payment"),
    );
    expect(createVpnSessionMock).toHaveBeenCalledWith(
      {
        exitClass: "standard",
        quoteId: "11".repeat(32),
        paymentTxHash: "cd".repeat(32),
        meteringPublicKeyHex: expect.stringMatching(/^[\da-f]{64}$/),
      },
      {
        canonicalAuth: {
          accountId: "testuLegacyVisibleAccount1234567890",
          privateKey,
        },
      },
    );

    await runtime.getStatus({
      toriiUrl: "https://taira.sora.org",
      chainId: "chain",
      accountId: "sorauLegacyVisibleAccount1234567890",
      networkPrefix: 369,
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
      chainId: "chain",
      accountId: "sorauLegacyVisibleAccount1234567890",
      networkPrefix: 369,
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
      chainId: "chain",
      accountId: "sorauLegacyVisibleAccount1234567890",
      networkPrefix: 369,
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

  it("keeps local controller availability when the remote profile read fails", async () => {
    getVpnProfileMock.mockRejectedValueOnce(new Error("profile unavailable"));
    const controller = createControllerMock();
    const runtime = new VpnRuntime({
      userDataPath,
      helperVersion: "embedded-1.0.0",
      controller,
    });

    const availability = await runtime.getAvailability({
      toriiUrl: "https://taira.sora.org",
    });

    expect(availability).toMatchObject({
      helperReady: true,
      controllerInstalled: true,
      serverReachable: false,
      profileAvailable: false,
      actionsEnabled: false,
      status: "error",
      message: "profile unavailable",
    });
  });

  it("repairs the local controller without profile, vault, or Torii session calls", async () => {
    getVpnProfileMock.mockRejectedValueOnce(new Error("profile unavailable"));
    const controller = createControllerMock({
      repairRequired: true,
      message: "repair required",
    });
    const runtime = new VpnRuntime({
      userDataPath,
      helperVersion: "embedded-1.0.0",
      controller,
    });

    const repaired = await runtime.repair();

    expect(controller.repair).toHaveBeenCalledOnce();
    expect(repaired).toMatchObject({
      state: "idle",
      repairRequired: false,
    });
    expect(getVpnProfileMock).not.toHaveBeenCalled();
    expect(getVpnSessionMock).not.toHaveBeenCalled();
    expect(deleteVpnSessionMock).not.toHaveBeenCalled();
    expect(listVpnReceiptsMock).not.toHaveBeenCalled();
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
      chainId: "chain",
      networkPrefix: 369,
      accountId: "alice@wonderland",
      privateKeyHex: "ab".repeat(32),
      exitClass: "standard",
    });

    const disconnected = await runtime.disconnect({
      toriiUrl: "https://taira.sora.org",
      chainId: "chain",
      networkPrefix: 369,
      accountId: "alice@wonderland",
      privateKeyHex: "ab".repeat(32),
    });

    expect(disconnected.state).toBe("remote-delete-pending");
    expect(disconnected.lastReceipt?.receiptSource).toBe("local-fallback");
    expect(controller.disconnect).toHaveBeenCalled();
  });

  it("disconnects the local tunnel without attempting a remote mutation", async () => {
    const controller = createControllerMock();
    const runtime = new VpnRuntime({
      userDataPath,
      helperVersion: "embedded-1.0.0",
      controller,
    });
    const owner = {
      toriiUrl: "https://taira.sora.org",
      chainId: "chain-a",
      networkPrefix: 369,
      accountId: "alice@wonderland",
      privateKeyHex: "ab".repeat(32),
    };

    await runtime.connect({ ...owner, exitClass: "standard" });
    deleteVpnSessionMock.mockClear();

    const disconnected = await runtime.disconnectLocal();

    expect(controller.disconnect).toHaveBeenCalled();
    expect(deleteVpnSessionMock).not.toHaveBeenCalled();
    expect(disconnected).toMatchObject({
      state: "remote-delete-pending",
      systemTunnelActive: false,
      remoteSessionActive: true,
    });
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

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
import { AccountAddress } from "@iroha/iroha-js/browser";

const getVpnProfileMock = vi.fn();
const createVpnQuoteMock = vi.fn();
const createVpnSessionMock = vi.fn();
const getVpnSessionMock = vi.fn();
const listVpnReceiptsMock = vi.fn();
const submitTransactionMock = vi.fn();
const getTransactionStatusMock = vi.fn();
const quoteAndSignTransactionMock = vi.fn();
const quoteAuthorityTransactionMock = vi.fn();
const buildTransactionDraftMock = vi.fn();
const dnsLookupMock = vi.fn();
const nodeFetchMock = vi.fn();
const networkIdParseMock = vi.fn();

vi.mock("@iroha/iroha-js/canonical-request", () => ({
  NetworkId: class MockNetworkId {
    static readonly BYTE_LENGTH = 32;
    readonly literal: string;

    constructor(literal: string) {
      this.literal = literal;
    }

    static parse(literal: string) {
      networkIdParseMock(literal);
      return new this(literal);
    }

    toBytes() {
      return Uint8Array.from({ length: 32 }, (_, index) =>
        index === 31 ? 1 : 0,
      );
    }
  },
}));

vi.mock("../electron/firstReleaseVpnTransport", () => ({
  FirstReleaseVpnTransport: vi.fn(function MockVpnTransport() {
    return {
      getVpnProfile: (...args: unknown[]) => getVpnProfileMock(...args),
      createVpnQuote: (...args: unknown[]) => createVpnQuoteMock(...args),
      createVpnSession: (...args: unknown[]) => createVpnSessionMock(...args),
      quoteAuthorityTransaction: (...args: unknown[]) =>
        quoteAuthorityTransactionMock(...args),
      getTransactionStatus: (...args: unknown[]) =>
        getTransactionStatusMock(...args),
      getVpnSession: (...args: unknown[]) => getVpnSessionMock(...args),
      listVpnReceipts: (...args: unknown[]) => listVpnReceiptsMock(...args),
    };
  }),
}));

vi.mock("../electron/firstReleaseTransaction", () => ({
  buildFirstReleaseAuthorityTransactionDraft: (...args: unknown[]) =>
    buildTransactionDraftMock(...args),
  signFirstReleaseAuthorityTransaction: (...args: unknown[]) =>
    quoteAndSignTransactionMock(...args),
  submitFirstReleaseTransaction: (...args: unknown[]) =>
    submitTransactionMock(...args),
}));

vi.mock("../src/utils/firstReleaseNetworkIdentity", () => ({
  resolveFirstReleaseNetworkIdLiteral: (input: { chainId: string }) =>
    `network:${input.chainId}`,
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

const accountIdForNetwork = (publicKeyHex: string, networkPrefix: number) =>
  AccountAddress.fromAccount({
    publicKey: Buffer.from(publicKeyHex, "hex"),
    algorithm: "ed25519",
  }).toI105(networkPrefix);
const VPN_ALICE_PUBLIC_KEY_HEX =
  "d04ab232742bb4ab3a1368bd4615e4e6d0224ab71a016baf8520a332c9778737";
const VPN_BOB_PUBLIC_KEY_HEX =
  "a09aa5f47a6759802ff955f8dc2d2a14a5c99d23be97f864127ff9383455a4f0";
const VPN_ACCOUNT_ID = accountIdForNetwork(VPN_ALICE_PUBLIC_KEY_HEX, 369);
const VPN_WRONG_NETWORK_ACCOUNT_ID = accountIdForNetwork(
  VPN_ALICE_PUBLIC_KEY_HEX,
  753,
);
const VPN_SECOND_ACCOUNT_ID = accountIdForNetwork(VPN_BOB_PUBLIC_KEY_HEX, 753);
const VPN_SESSION_ID = "55".repeat(16);
const VPN_QUOTE_ID = "11".repeat(32);
const VPN_LEASE_ID = "22".repeat(32);
const VPN_HELPER_TICKET_HEX = "ab".repeat(788);
const VPN_RELAY_MLDSA65_PUBLIC_KEY_HEX = "55".repeat(1_952);

const vpnTrust = () => ({
  relayIdHex: "33".repeat(32),
  relayMldsa65PublicKeyHex: VPN_RELAY_MLDSA65_PUBLIC_KEY_HEX,
  descriptorCommitHex: "44".repeat(32),
  tlsServerName: "relay.example",
  relayTlsSpkiSha256Hex: "66".repeat(32),
  relayCertificateSha256Hex: "77".repeat(32),
  directorySnapshotDigestHex: "88".repeat(32),
});

const vpnProfile = (overrides: Record<string, unknown> = {}) => ({
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
  operatorAccountId: "operator@wonderland",
  leaseFee: "25",
  settlementGraceSecs: 120,
  flowLabelBits: 24,
  paddingBudgetMs: 80,
  ...vpnTrust(),
  ...overrides,
});

const vpnQuote = (
  currentMs: number,
  overrides: Record<string, unknown> = {},
) => ({
  quoteId: VPN_QUOTE_ID,
  leaseIdHex: VPN_LEASE_ID,
  sessionIdHex: VPN_SESSION_ID,
  paymentReference: VPN_QUOTE_ID,
  accountId: VPN_ACCOUNT_ID,
  exitClass: "standard",
  relayEndpoint: "/dns/torii.exit.example/udp/9443/quic",
  leaseSecs: 600,
  quoteExpiresAtMs: currentMs + 60_000,
  feeAssetId: "xor#universal.universal",
  escrowAccountId: "vpn-escrow@wonderland",
  operatorAccountId: "operator@wonderland",
  leaseFee: "25",
  routePushes: ["0.0.0.0/0"],
  excludedRoutes: ["127.0.0.0/8"],
  dnsServers: ["1.1.1.1"],
  tunnelAddresses: ["10.208.0.2/32"],
  mtuBytes: 1280,
  meterFamily: "soranet.vpn.standard",
  flowLabelBits: 24,
  paddingBudgetMs: 80,
  ...vpnTrust(),
  meteringPublicKeyHex: "99".repeat(32),
  openLeaseInstruction: {
    wireId: "OpenVpnLeaseEscrow",
    payloadHex: "abcd",
  },
  ...overrides,
});

const vpnSession = (
  currentMs: number,
  overrides: Record<string, unknown> = {},
) => ({
  sessionId: VPN_SESSION_ID,
  accountId: VPN_ACCOUNT_ID,
  exitClass: "standard",
  relayEndpoint: "/dns/torii.exit.example/udp/9443/quic",
  leaseSecs: 600,
  expiresAtMs: currentMs + 600_000,
  connectedAtMs: currentMs,
  meterFamily: "soranet.vpn.standard",
  quoteId: VPN_QUOTE_ID,
  paymentReference: VPN_QUOTE_ID,
  paymentTxHash: "cd".repeat(32),
  feeAssetId: "xor#universal.universal",
  escrowAccountId: "vpn-escrow@wonderland",
  operatorAccountId: "operator@wonderland",
  leaseFee: "25",
  flowLabelBits: 24,
  paddingBudgetMs: 80,
  ...vpnTrust(),
  routePushes: ["0.0.0.0/0"],
  excludedRoutes: ["127.0.0.0/8"],
  dnsServers: ["1.1.1.1"],
  tunnelAddresses: ["10.208.0.2/32"],
  mtuBytes: 1280,
  helperTicketHex: VPN_HELPER_TICKET_HEX,
  bytesIn: 123,
  bytesOut: 456,
  status: "active",
  ...overrides,
});

const canonicalReceipt = {
  sessionId: VPN_SESSION_ID,
  accountId: VPN_ACCOUNT_ID,
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
  quoteId: VPN_QUOTE_ID,
  paymentTxHash: "cd".repeat(32),
  feeAssetId: "xor#universal.universal",
  escrowAccountId: "vpn-escrow@wonderland",
  operatorAccountId: "operator@wonderland",
  leaseFee: "25",
  earnedFee: "10",
  refundedFee: "15",
  leaseIdHex: VPN_LEASE_ID,
  settleLeaseInstruction: null,
};

const VPN_PAYMENT_HASH = "cd".repeat(32);
const VPN_PAYMENT_BLOCK_HASH = "ef".repeat(32);
const VPN_PAYMENT_BLOCK_HEIGHT = 17;

const explorerPaymentTransaction = (overrides = {}) => ({
  authority: VPN_ACCOUNT_ID,
  hash: VPN_PAYMENT_HASH,
  block: VPN_PAYMENT_BLOCK_HEIGHT,
  created_at: "2026-07-27T01:02:03Z",
  executable: "Instructions",
  status: "Committed",
  rejection_reason: null,
  executable_payload: { instruction_count: 1 },
  metadata: {},
  nonce: null,
  signature: "11".repeat(64),
  time_to_live: null,
  ...overrides,
});

const explorerPaymentBlock = () => ({
  hash: VPN_PAYMENT_BLOCK_HASH,
  height: VPN_PAYMENT_BLOCK_HEIGHT,
  created_at: "2026-07-27T01:02:04Z",
  prev_block_hash: "ab".repeat(32),
  transactions_hash: VPN_PAYMENT_HASH,
  transactions_rejected: 0,
  transactions_total: 1,
});

const explorerPaymentMetrics = (finalizedBlockHeight: number) => ({
  peers: 4,
  domains: 7,
  accounts: 360,
  assets: 169,
  transactions_accepted: 359,
  transactions_rejected: 16,
  block: VPN_PAYMENT_BLOCK_HEIGHT,
  block_created_at: "2026-07-27T01:02:04Z",
  finalized_block: finalizedBlockHeight,
  avg_commit_time: { ms: 500 },
  avg_block_time: { ms: 1_000 },
});

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
    getVpnProfileMock.mockReset().mockResolvedValue(vpnProfile());
    createVpnQuoteMock
      .mockReset()
      .mockImplementation(async (request: { meteringPublicKeyHex: string }) =>
        vpnQuote(currentMs, {
          meteringPublicKeyHex: request.meteringPublicKeyHex,
        }),
      );
    buildTransactionDraftMock
      .mockReset()
      .mockImplementation((input: { authority: string }) => ({
        authority: input.authority,
        payload: { authority: input.authority },
        payloadJson: JSON.stringify({ authority: input.authority }),
        payloadBytes: Buffer.from("draft"),
        payloadHash: Buffer.alloc(32, 1),
      }));
    quoteAuthorityTransactionMock.mockReset().mockResolvedValue({
      intent: { payer: "authority" },
      decision: { status: "accepted" },
    });
    quoteAndSignTransactionMock.mockReset().mockReturnValue({
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
        return finalityResponse(explorerPaymentTransaction());
      }
      if (url.pathname === `/v1/explorer/blocks/${VPN_PAYMENT_BLOCK_HEIGHT}`) {
        return finalityResponse(explorerPaymentBlock());
      }
      if (url.pathname === "/v1/explorer/metrics") {
        return finalityResponse(
          explorerPaymentMetrics(VPN_PAYMENT_BLOCK_HEIGHT),
        );
      }
      throw new Error(`Unexpected VPN finality request: ${url.pathname}`);
    });
    createVpnSessionMock.mockReset().mockResolvedValue(vpnSession(currentMs));
    getVpnSessionMock.mockReset().mockResolvedValue(vpnSession(currentMs));
    listVpnReceiptsMock
      .mockReset()
      .mockResolvedValue({ items: [canonicalReceipt], total: 1 });
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

  it("refuses to invent controller routes when Torii omits them", () => {
    expect(() => resolveVpnRoutePushesForController([])).toThrow(
      /will not invent full-tunnel routes/u,
    );
    expect(resolveVpnRoutePushesForController(["10.0.0.0/8"])).toEqual([
      "10.0.0.0/8",
    ]);
  });

  it("excludes the relay endpoint from exact full-tunnel controller routes", () => {
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
    getVpnProfileMock.mockResolvedValueOnce(
      vpnProfile({
        relayEndpoint: "/dns/torii/udp/9443/quic",
      }),
    );
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
    getVpnProfileMock.mockResolvedValueOnce(
      vpnProfile({
        supportedExitClasses: [],
        defaultExitClass: "unknown",
      }),
    );
    const runtime = new VpnRuntime({
      userDataPath,
      helperVersion: "embedded-1.0.0",
      controller: createControllerMock(),
    });

    await expect(
      runtime.getProfile({ toriiUrl: "https://taira.sora.org" }),
    ).rejects.toThrow(/supportedExitClasses/u);
  });

  it("rejects malformed public VPN read inputs before controller or transport access", async () => {
    const controller = createControllerMock();
    const runtime = new VpnRuntime({
      userDataPath,
      helperVersion: "embedded-1.0.0",
      controller,
    });
    const malformedInputs: unknown[] = [
      null,
      [],
      {},
      { toriiUrl: 7 },
      { toriiUrl: "https://taira.sora.org/" },
      { toriiUrl: "https://taira.sora.org/v1/vpn/profile" },
      { toriiUrl: "http://127.0.0.1:8080" },
      { toriiUrl: "https://taira.sora.org", compatibility: true },
    ];

    for (const malformedInput of malformedInputs) {
      await expect(runtime.getAvailability(malformedInput)).rejects.toThrow();
      await expect(runtime.getProfile(malformedInput)).rejects.toThrow();
    }
    expect(controller.refreshCapability).not.toHaveBeenCalled();
    expect(getVpnProfileMock).not.toHaveBeenCalled();
  });

  it("rejects malformed authenticated VPN read contexts instead of treating them as local state", async () => {
    const controller = createControllerMock();
    const runtime = new VpnRuntime({
      userDataPath,
      helperVersion: "embedded-1.0.0",
      controller,
    });
    const base = {
      toriiUrl: "https://taira.sora.org",
      chainId: "chain",
      networkPrefix: 369,
      accountId: VPN_ACCOUNT_ID,
    };
    const malformedInputs: unknown[] = [
      null,
      [],
      {},
      { toriiUrl: base.toriiUrl },
      { ...base, networkPrefix: "369" },
      { ...base, chainId: " chain" },
      { ...base, accountId: ` ${VPN_ACCOUNT_ID}` },
      { ...base, privateKeyHex: "AB".repeat(32) },
      { ...base, signingAlgorithm: "ed25519" },
      { ...base, compatibility: true },
    ];

    for (const malformedInput of malformedInputs) {
      await expect(runtime.getStatus(malformedInput)).rejects.toThrow();
      await expect(runtime.listReceipts(malformedInput)).rejects.toThrow();
    }
    expect(controller.getStatus).not.toHaveBeenCalled();
    expect(getVpnSessionMock).not.toHaveBeenCalled();
    expect(listVpnReceiptsMock).not.toHaveBeenCalled();

    await expect(runtime.getStatus()).resolves.toMatchObject({ state: "idle" });
    await expect(runtime.listReceipts()).resolves.toEqual([]);
  });

  it("rejects inexact VPN connect DTOs before controller or Torii access", async () => {
    const controller = createControllerMock();
    const runtime = new VpnRuntime({
      userDataPath,
      helperVersion: "embedded-1.0.0",
      controller,
    });
    const valid = {
      toriiUrl: "https://taira.sora.org",
      chainId: "chain",
      networkPrefix: 369,
      accountId: VPN_ACCOUNT_ID,
      privateKeyHex: "ab".repeat(32),
      signingAlgorithm: "ed25519",
      exitClass: "standard" as const,
    };
    const malformedInputs: unknown[] = [
      { ...valid, signingAlgorithm: undefined },
      { ...valid, compatibility: true },
      { ...valid, toriiUrl: "https://taira.sora.org/" },
      { ...valid, signingAlgorithm: "Ed25519" },
      { ...valid, privateKeyHex: "AB".repeat(32) },
    ];

    for (const malformedInput of malformedInputs) {
      await expect(runtime.connect(malformedInput as never)).rejects.toThrow();
    }
    expect(controller.refreshCapability).not.toHaveBeenCalled();
    expect(getVpnProfileMock).not.toHaveBeenCalled();
    expect(createVpnQuoteMock).not.toHaveBeenCalled();
  });

  it("rejects compatibility profile fields and unavailable profiles that leak partial trust", async () => {
    const runtime = new VpnRuntime({
      userDataPath,
      helperVersion: "embedded-1.0.0",
      controller: createControllerMock(),
    });
    getVpnProfileMock.mockResolvedValueOnce({
      ...vpnProfile(),
      lease_secs: 600,
    });
    await expect(
      runtime.getProfile({ toriiUrl: "https://taira.sora.org" }),
    ).rejects.toThrow(/must contain exactly/u);

    getVpnProfileMock.mockResolvedValueOnce(
      vpnProfile({
        available: false,
        relayEndpoint: "",
        relayIdHex: "33".repeat(32),
        relayMldsa65PublicKeyHex: "",
        descriptorCommitHex: "",
        tlsServerName: "",
        relayTlsSpkiSha256Hex: "",
        relayCertificateSha256Hex: "",
        directorySnapshotDigestHex: "",
      }),
    );
    await expect(
      runtime.getProfile({ toriiUrl: "https://taira.sora.org" }),
    ).rejects.toThrow(
      /must not expose a relay endpoint or partial trust tuple/u,
    );
  });

  it("rejects an unknown requested service class before quoting", async () => {
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
        accountId: VPN_ACCOUNT_ID,
        privateKeyHex: "ab".repeat(32),
        signingAlgorithm: "ed25519",
        exitClass: "premium" as never,
      }),
    ).rejects.toThrow(/is not supported by this endpoint/u);
    expect(createVpnQuoteMock).not.toHaveBeenCalled();
    expect(controller.connect).not.toHaveBeenCalled();
  });

  it("rejects a session returned for a different service class", async () => {
    createVpnSessionMock.mockResolvedValueOnce(
      vpnSession(Date.now(), {
        exitClass: "high-security",
        meterFamily: "soranet.vpn.high-security",
      }),
    );
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
        accountId: VPN_ACCOUNT_ID,
        privateKeyHex: "ab".repeat(32),
        signingAlgorithm: "ed25519",
        exitClass: "standard",
      }),
    ).rejects.toThrow(/service class mismatch/u);
    expect(controller.connect).not.toHaveBeenCalled();
  });

  it("binds the signed payment quote and returned session to the reviewed profile trust tuple", async () => {
    createVpnQuoteMock.mockImplementationOnce(
      async (request: { meteringPublicKeyHex: string }) =>
        vpnQuote(Date.now(), {
          leaseFee: "26",
          meteringPublicKeyHex: request.meteringPublicKeyHex,
        }),
    );
    const runtime = new VpnRuntime({
      userDataPath,
      helperVersion: "embedded-1.0.0",
      controller: createControllerMock(),
    });
    const input = {
      toriiUrl: "https://taira.sora.org",
      chainId: "chain",
      networkPrefix: 369,
      accountId: VPN_ACCOUNT_ID,
      privateKeyHex: "ab".repeat(32),
      signingAlgorithm: "ed25519",
      exitClass: "standard" as const,
    };

    await expect(runtime.connect(input)).rejects.toThrow(
      /VPN quote leaseFee does not match/u,
    );
    expect(quoteAndSignTransactionMock).not.toHaveBeenCalled();

    createVpnQuoteMock.mockImplementationOnce(
      async (request: { meteringPublicKeyHex: string }) =>
        vpnQuote(Date.now(), {
          meteringPublicKeyHex: request.meteringPublicKeyHex,
        }),
    );
    createVpnSessionMock.mockResolvedValueOnce(
      vpnSession(Date.now(), { descriptorCommitHex: "aa".repeat(32) }),
    );
    await expect(runtime.connect(input)).rejects.toThrow(
      /VPN session descriptorCommitHex does not match/u,
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
      accountId: VPN_ACCOUNT_ID,
      privateKeyHex: "ab".repeat(32),
      signingAlgorithm: "ed25519",
      exitClass: "standard",
    });
    expect(existsSync(activeSessionPath)).toBe(false);

    await runtime.disconnect({
      toriiUrl: "https://taira.sora.org",
      chainId: "chain",
      networkPrefix: 369,
      accountId: VPN_ACCOUNT_ID,
      privateKeyHex: "ab".repeat(32),
      signingAlgorithm: "ed25519",
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
      accountId: VPN_ACCOUNT_ID,
      privateKeyHex: "ab".repeat(32),
      signingAlgorithm: "ed25519",
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
        sessionId: VPN_SESSION_ID,
        relayEndpoint: "/ip4/198.51.100.7/udp/9443/quic",
        mtuBytes: 1280,
      }),
    );

    const refreshed = await runtime.getStatus({
      toriiUrl: "https://taira.sora.org",
      chainId: "chain",
      networkPrefix: 369,
      accountId: VPN_ACCOUNT_ID,
      privateKeyHex: "ab".repeat(32),
      signingAlgorithm: "ed25519",
    });
    expect(refreshed.remoteSessionActive).toBe(true);
    expect(getVpnSessionMock).toHaveBeenCalled();

    const disconnected = await runtime.disconnect({
      toriiUrl: "https://taira.sora.org",
      chainId: "chain",
      networkPrefix: 369,
      accountId: VPN_ACCOUNT_ID,
      privateKeyHex: "ab".repeat(32),
      signingAlgorithm: "ed25519",
    });
    expect(disconnected.state).toBe("remote-expiry-pending");
    expect(controller.disconnect).toHaveBeenCalled();

    const receipts = await runtime.listReceipts({
      toriiUrl: "https://taira.sora.org",
      chainId: "chain",
      networkPrefix: 369,
      accountId: VPN_ACCOUNT_ID,
      privateKeyHex: "ab".repeat(32),
      signingAlgorithm: "ed25519",
    });
    expect(receipts[0]?.receiptSource).toBe("torii");
    expect(listVpnReceiptsMock).toHaveBeenCalled();
  });

  it("fails closed without returning receipts from a previous endpoint/account context when live sync fails", async () => {
    listVpnReceiptsMock.mockResolvedValueOnce({
      items: [canonicalReceipt],
      total: 1,
    });
    const runtime = new VpnRuntime({
      userDataPath,
      helperVersion: "embedded-1.0.0",
      controller: createControllerMock(),
    });
    const aliceReceipts = await runtime.listReceipts({
      toriiUrl: "https://taira.sora.org",
      chainId: "chain-a",
      networkPrefix: 369,
      accountId: VPN_ACCOUNT_ID,
      privateKeyHex: "ab".repeat(32),
      signingAlgorithm: "ed25519",
    });
    expect(aliceReceipts).toHaveLength(1);

    listVpnReceiptsMock.mockRejectedValueOnce(new Error("endpoint B offline"));
    await expect(
      runtime.listReceipts({
        toriiUrl: "https://minamoto.sora.org",
        chainId: "chain-b",
        networkPrefix: 753,
        accountId: VPN_SECOND_ACCOUNT_ID,
        privateKeyHex: "bc".repeat(32),
        signingAlgorithm: "ed25519",
      }),
    ).rejects.toThrow("endpoint B offline");
  });

  it("rejects noncanonical receipt sources and exact-list schema drift", async () => {
    const runtime = new VpnRuntime({
      userDataPath,
      helperVersion: "embedded-1.0.0",
      controller: createControllerMock(),
    });
    const auth = {
      toriiUrl: "https://taira.sora.org",
      chainId: "chain",
      networkPrefix: 369,
      accountId: VPN_ACCOUNT_ID,
      privateKeyHex: "ab".repeat(32),
      signingAlgorithm: "ed25519",
    };
    listVpnReceiptsMock.mockResolvedValueOnce({
      items: [{ ...canonicalReceipt, receiptSource: "cache" }],
      total: 1,
    });
    await expect(runtime.listReceipts(auth)).rejects.toThrow(/receiptSource/u);

    listVpnReceiptsMock.mockResolvedValueOnce({
      items: [canonicalReceipt],
      total: 1,
      next_cursor: null,
    });
    await expect(runtime.listReceipts(auth)).rejects.toThrow(
      /must contain exactly/u,
    );

    listVpnReceiptsMock.mockResolvedValueOnce({
      items: Array.from({ length: 25 }, () => canonicalReceipt),
      total: 25,
    });
    await expect(runtime.listReceipts(auth)).rejects.toThrow(
      /at most 24 receipts/u,
    );
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
      accountId: VPN_ACCOUNT_ID,
      privateKeyHex: "ab".repeat(32),
      signingAlgorithm: "ed25519",
      exitClass: "standard",
    });
    listVpnReceiptsMock.mockClear();

    await expect(runtime.listReceipts()).resolves.toEqual([]);
    expect(listVpnReceiptsMock).not.toHaveBeenCalled();
  });

  it("discards late receipt sync completions after the exact endpoint/account context changes", async () => {
    const bobReceipt = {
      ...canonicalReceipt,
      sessionId: "bb".repeat(16),
      accountId: VPN_SECOND_ACCOUNT_ID,
    };
    let resolveAlice!: (value: {
      items: [typeof canonicalReceipt];
      total: 1;
    }) => void;
    let resolveBob!: (value: { items: [typeof bobReceipt]; total: 1 }) => void;
    const aliceResponse = new Promise<{
      items: [typeof canonicalReceipt];
      total: 1;
    }>((resolve) => {
      resolveAlice = resolve;
    });
    const bobResponse = new Promise<{
      items: [typeof bobReceipt];
      total: 1;
    }>((resolve) => {
      resolveBob = resolve;
    });
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
      accountId: VPN_ACCOUNT_ID,
      privateKeyHex: "ab".repeat(32),
      signingAlgorithm: "ed25519",
    };
    const bob = {
      toriiUrl: "https://minamoto.sora.org",
      chainId: "chain-b",
      networkPrefix: 753,
      accountId: VPN_SECOND_ACCOUNT_ID,
      privateKeyHex: "bc".repeat(32),
      signingAlgorithm: "ed25519",
    };

    const aliceReceipts = runtime.listReceipts(alice);
    await vi.waitFor(() => {
      expect(listVpnReceiptsMock).toHaveBeenCalledTimes(1);
    });
    const bobReceipts = runtime.listReceipts(bob);
    await vi.waitFor(() => {
      expect(listVpnReceiptsMock).toHaveBeenCalledTimes(2);
    });

    resolveBob({ items: [bobReceipt], total: 1 });
    await expect(bobReceipts).resolves.toEqual([
      expect.objectContaining({ sessionId: "bb".repeat(16) }),
    ]);

    resolveAlice({ items: [canonicalReceipt], total: 1 });
    await expect(aliceReceipts).resolves.toEqual([]);

    listVpnReceiptsMock.mockRejectedValueOnce(new Error("refresh offline"));
    await expect(runtime.listReceipts(bob)).rejects.toThrow("refresh offline");
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
      accountId: VPN_ACCOUNT_ID,
      privateKeyHex: "ab".repeat(32),
      signingAlgorithm: "ed25519",
    };
    const bob = {
      toriiUrl: "https://minamoto.sora.org",
      chainId: "chain-b",
      networkPrefix: 753,
      accountId: VPN_SECOND_ACCOUNT_ID,
      privateKeyHex: "bc".repeat(32),
      signingAlgorithm: "ed25519",
    };

    await runtime.connect({ ...alice, exitClass: "standard" });
    getVpnSessionMock.mockClear();

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

    const ownerStatus = await runtime.getStatus(alice);
    expect(ownerStatus).toMatchObject({
      state: "connected",
      sessionId: VPN_SESSION_ID,
      remoteSessionActive: true,
    });
    expect(getVpnSessionMock).toHaveBeenCalledWith(
      VPN_SESSION_ID,
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
      accountId: VPN_ACCOUNT_ID,
      privateKeyHex: "ab".repeat(32),
      signingAlgorithm: "ed25519",
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
        accountId: VPN_ACCOUNT_ID,
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
        return finalityResponse(explorerPaymentTransaction());
      }
      if (url.pathname === `/v1/explorer/blocks/${VPN_PAYMENT_BLOCK_HEIGHT}`) {
        return finalityResponse(explorerPaymentBlock());
      }
      if (url.pathname === "/v1/explorer/metrics") {
        return finalityResponse(explorerPaymentMetrics(finalizedBlockHeight));
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
      accountId: VPN_ACCOUNT_ID,
      privateKeyHex: "ab".repeat(32),
      signingAlgorithm: "ed25519",
      exitClass: "standard",
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(submitTransactionMock).toHaveBeenCalledWith({
      toriiUrl: "https://taira.sora.org",
      signedTransaction: Buffer.from("signed-vpn-payment"),
    });
    expect(getTransactionStatusMock).toHaveBeenCalledWith(VPN_PAYMENT_HASH);
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
        return finalityResponse(
          explorerPaymentTransaction({ hash: "ab".repeat(32) }),
        );
      }
      if (url.pathname === `/v1/explorer/blocks/${VPN_PAYMENT_BLOCK_HEIGHT}`) {
        return finalityResponse(explorerPaymentBlock());
      }
      if (url.pathname === "/v1/explorer/metrics") {
        return finalityResponse(
          explorerPaymentMetrics(VPN_PAYMENT_BLOCK_HEIGHT),
        );
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
        accountId: VPN_ACCOUNT_ID,
        privateKeyHex: "ab".repeat(32),
        signingAlgorithm: "ed25519",
        exitClass: "standard",
      }),
    ).rejects.toThrow(
      /Explorer transaction hash does not match the submitted transaction/u,
    );

    expect(createVpnSessionMock).not.toHaveBeenCalled();
    expect(controller.connect).not.toHaveBeenCalled();
  });

  it("rewrites torii relay host markers before handing them to the controller", async () => {
    const currentMs = Date.now();
    const relayEndpoint = "/dns/torii/udp/9443/quic";
    getVpnProfileMock.mockResolvedValueOnce(vpnProfile({ relayEndpoint }));
    createVpnQuoteMock.mockImplementationOnce(
      async (request: { meteringPublicKeyHex: string }) =>
        vpnQuote(currentMs, {
          relayEndpoint,
          meteringPublicKeyHex: request.meteringPublicKeyHex,
        }),
    );
    const session = vpnSession(currentMs, { relayEndpoint });
    createVpnSessionMock.mockResolvedValueOnce(session);
    getVpnSessionMock.mockResolvedValueOnce(session);
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
      accountId: VPN_ACCOUNT_ID,
      privateKeyHex: "ab".repeat(32),
      signingAlgorithm: "ed25519",
      exitClass: "standard",
    });

    expect(connected.relayEndpoint).toBe("/dns/taira.sora.org/udp/9443/quic");
    expect(controller.connect).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: VPN_SESSION_ID,
        relayEndpoint: "/ip4/208.83.1.62/udp/9443/quic",
      }),
    );
  });

  it("rejects empty route and DNS projections before invoking the controller", async () => {
    const relayEndpoint = "/dns/torii/udp/9443/quic";
    const routePushes: string[] = [];
    const excludedRoutes: string[] = [];
    const dnsServers: string[] = [];
    const tunnelAddresses = [
      "10.221.36.170/30",
      "fd53:7261:6574:0:2134:f68e:bd1e:3332/126",
    ];
    const networkOverrides = {
      relayEndpoint,
      routePushes,
      excludedRoutes,
      dnsServers,
      tunnelAddresses,
    };
    getVpnProfileMock.mockResolvedValueOnce(vpnProfile(networkOverrides));
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
        accountId: VPN_ACCOUNT_ID,
        privateKeyHex: "ab".repeat(32),
        signingAlgorithm: "ed25519",
        exitClass: "standard",
      }),
    ).rejects.toThrow(/routePushes must contain from 1 through 64 entries/u);
    expect(createVpnQuoteMock).not.toHaveBeenCalled();
    expect(controller.connect).not.toHaveBeenCalled();
  });

  it("rejects a stale wrong-network account id before helper or Torii access", async () => {
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
        accountId: VPN_WRONG_NETWORK_ACCOUNT_ID,
        networkPrefix: 369,
        privateKeyHex: "ab".repeat(32),
        signingAlgorithm: "ed25519",
        exitClass: "standard",
      }),
    ).rejects.toThrow(/canonical I105 account ID/u);
    expect(controller.refreshCapability).not.toHaveBeenCalled();
    expect(createVpnQuoteMock).not.toHaveBeenCalled();
  });

  it("uses an already network-scoped account id without compatibility rewriting", async () => {
    const normalizedAccountId = VPN_ACCOUNT_ID;
    const currentMs = Date.now();
    const expectedPrivateKey = Buffer.from("ab".repeat(32), "hex");
    const privateKeySnapshots: Buffer[] = [];
    const observePrivateKey = (value: unknown) => {
      expect(Buffer.isBuffer(value)).toBe(true);
      privateKeySnapshots.push(Buffer.from(value as Buffer));
    };
    createVpnQuoteMock.mockImplementationOnce(
      async (
        request: { meteringPublicKeyHex: string },
        auth: { privateKey: Buffer },
      ) => {
        observePrivateKey(auth.privateKey);
        return vpnQuote(currentMs, {
          accountId: normalizedAccountId,
          meteringPublicKeyHex: request.meteringPublicKeyHex,
        });
      },
    );
    const session = vpnSession(currentMs, { accountId: normalizedAccountId });
    quoteAuthorityTransactionMock.mockImplementationOnce(
      async (_draft: unknown, auth: { privateKey: Buffer }) => {
        observePrivateKey(auth.privateKey);
        return {
          intent: { payer: "authority" },
          decision: { status: "accepted" },
        };
      },
    );
    quoteAndSignTransactionMock.mockImplementationOnce(
      (input: { privateKey: Buffer }) => {
        observePrivateKey(input.privateKey);
        return {
          signedTransaction: Buffer.from("signed-vpn-payment"),
          hash: Buffer.from(VPN_PAYMENT_HASH, "hex"),
        };
      },
    );
    createVpnSessionMock.mockImplementationOnce(
      async (_request: unknown, auth: { privateKey: Buffer }) => {
        observePrivateKey(auth.privateKey);
        return session;
      },
    );
    getVpnSessionMock.mockImplementation(
      async (_sessionId: string, auth: { privateKey: Buffer }) => {
        observePrivateKey(auth.privateKey);
        return session;
      },
    );
    listVpnReceiptsMock.mockImplementation(
      async (auth: { privateKey: Buffer }) => {
        observePrivateKey(auth.privateKey);
        return {
          items: [{ ...canonicalReceipt, accountId: normalizedAccountId }],
          total: 1,
        };
      },
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
      accountId: normalizedAccountId,
      networkPrefix: 369,
      privateKeyHex: "ab".repeat(32),
      signingAlgorithm: "ed25519",
      exitClass: "standard",
    });
    expect(createVpnQuoteMock).toHaveBeenCalledWith(
      {
        exitClass: "standard",
        meteringPublicKeyHex: expect.stringMatching(/^[\da-f]{64}$/),
      },
      expect.objectContaining({
        accountId: normalizedAccountId,
        networkId: expect.objectContaining({ literal: "network:chain" }),
        networkPrefix: 369,
        privateKey: expect.any(Buffer),
      }),
    );
    expect(buildTransactionDraftMock).toHaveBeenCalledWith({
      networkId: expect.objectContaining({ literal: "network:chain" }),
      networkPrefix: 369,
      authority: normalizedAccountId,
      instructions: [
        {
          wire_id: "OpenVpnLeaseEscrow",
          payload_hex: "abcd",
        },
      ],
    });
    expect(quoteAuthorityTransactionMock).toHaveBeenCalledWith(
      expect.objectContaining({ authority: normalizedAccountId }),
      expect.objectContaining({
        accountId: normalizedAccountId,
        networkId: expect.objectContaining({ literal: "network:chain" }),
        networkPrefix: 369,
        privateKey: expect.any(Buffer),
      }),
    );
    expect(quoteAndSignTransactionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        networkId: expect.objectContaining({ literal: "network:chain" }),
        draft: expect.objectContaining({ authority: normalizedAccountId }),
        quote: expect.objectContaining({
          intent: { payer: "authority" },
          decision: { status: "accepted" },
        }),
        privateKey: expect.any(Buffer),
        privateKeyAlgorithm: "ed25519",
      }),
    );
    expect(submitTransactionMock).toHaveBeenCalledWith({
      toriiUrl: "https://taira.sora.org",
      signedTransaction: Buffer.from("signed-vpn-payment"),
    });
    expect(createVpnSessionMock).toHaveBeenCalledWith(
      {
        exitClass: "standard",
        quoteId: "11".repeat(32),
        paymentTxHash: "cd".repeat(32),
        meteringPublicKeyHex: expect.stringMatching(/^[\da-f]{64}$/),
      },
      expect.objectContaining({
        accountId: normalizedAccountId,
        networkId: expect.objectContaining({ literal: "network:chain" }),
        networkPrefix: 369,
        privateKey: expect.any(Buffer),
      }),
    );

    await runtime.getStatus({
      toriiUrl: "https://taira.sora.org",
      chainId: "chain",
      accountId: normalizedAccountId,
      networkPrefix: 369,
      privateKeyHex: "ab".repeat(32),
      signingAlgorithm: "ed25519",
    });
    expect(getVpnSessionMock).toHaveBeenCalledWith(
      VPN_SESSION_ID,
      expect.objectContaining({
        accountId: normalizedAccountId,
        networkId: expect.objectContaining({ literal: "network:chain" }),
        networkPrefix: 369,
        privateKey: expect.any(Buffer),
      }),
    );

    await runtime.disconnect({
      toriiUrl: "https://taira.sora.org",
      chainId: "chain",
      accountId: normalizedAccountId,
      networkPrefix: 369,
      privateKeyHex: "ab".repeat(32),
      signingAlgorithm: "ed25519",
    });

    await runtime.listReceipts({
      toriiUrl: "https://taira.sora.org",
      chainId: "chain",
      accountId: normalizedAccountId,
      networkPrefix: 369,
      privateKeyHex: "ab".repeat(32),
      signingAlgorithm: "ed25519",
    });
    expect(listVpnReceiptsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: normalizedAccountId,
        networkId: expect.objectContaining({ literal: "network:chain" }),
        networkPrefix: 369,
        privateKey: expect.any(Buffer),
      }),
    );
    expect(privateKeySnapshots.length).toBeGreaterThanOrEqual(7);
    for (const snapshot of privateKeySnapshots) {
      expect(snapshot).toEqual(expectedPrivateKey);
    }
    const retainedPrivateKeyReferences = [
      ...createVpnQuoteMock.mock.calls.map((call) => call[1]?.privateKey),
      ...quoteAuthorityTransactionMock.mock.calls.map(
        (call) => call[1]?.privateKey,
      ),
      ...quoteAndSignTransactionMock.mock.calls.map(
        (call) => call[0]?.privateKey,
      ),
      ...createVpnSessionMock.mock.calls.map((call) => call[1]?.privateKey),
      ...getVpnSessionMock.mock.calls.map((call) => call[1]?.privateKey),
      ...listVpnReceiptsMock.mock.calls.map((call) => call[0]?.privateKey),
    ];
    expect(retainedPrivateKeyReferences.length).toBe(
      privateKeySnapshots.length,
    );
    for (const retained of retainedPrivateKeyReferences) {
      expect(retained).toEqual(Buffer.alloc(32));
    }
  });

  it("zeroes canonical-auth private keys when a signed VPN request fails", async () => {
    let retainedPrivateKey: Buffer | undefined;
    let observedPrivateKey: Buffer | undefined;
    createVpnQuoteMock.mockImplementationOnce(
      async (_request: unknown, auth: { privateKey: Buffer }) => {
        retainedPrivateKey = auth.privateKey;
        observedPrivateKey = Buffer.from(auth.privateKey);
        throw new Error("VPN quote failed");
      },
    );
    const runtime = new VpnRuntime({
      userDataPath,
      helperVersion: "embedded-1.0.0",
      controller: createControllerMock(),
    });

    await expect(
      runtime.connect({
        toriiUrl: "https://taira.sora.org",
        chainId: "chain",
        accountId: VPN_ACCOUNT_ID,
        networkPrefix: 369,
        privateKeyHex: "ab".repeat(32),
        signingAlgorithm: "ed25519",
        exitClass: "standard",
      }),
    ).rejects.toThrow("VPN quote failed");

    expect(observedPrivateKey).toEqual(Buffer.from("ab".repeat(32), "hex"));
    expect(retainedPrivateKey).toEqual(Buffer.alloc(32));
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
    expect(listVpnReceiptsMock).not.toHaveBeenCalled();
  });

  it("marks remote lease expiry pending when the local tunnel disconnects", async () => {
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
      accountId: VPN_ACCOUNT_ID,
      privateKeyHex: "ab".repeat(32),
      signingAlgorithm: "ed25519",
      exitClass: "standard",
    });

    const disconnected = await runtime.disconnect({
      toriiUrl: "https://taira.sora.org",
      chainId: "chain",
      networkPrefix: 369,
      accountId: VPN_ACCOUNT_ID,
      privateKeyHex: "ab".repeat(32),
      signingAlgorithm: "ed25519",
    });

    expect(disconnected.state).toBe("remote-expiry-pending");
    expect(disconnected.lastReceipt).toBeNull();
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
      accountId: VPN_ACCOUNT_ID,
      privateKeyHex: "ab".repeat(32),
      signingAlgorithm: "ed25519",
    };

    await runtime.connect({ ...owner, exitClass: "standard" });

    const disconnected = await runtime.disconnectLocal();

    expect(controller.disconnect).toHaveBeenCalled();
    expect(disconnected).toMatchObject({
      state: "remote-expiry-pending",
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

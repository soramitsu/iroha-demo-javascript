import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import VpnView from "@/views/VpnView.vue";
import { useSessionStore } from "@/stores/session";
import { useVpnStore } from "@/stores/vpn";

const getVpnAvailabilityMock = vi.fn();
const getVpnProfileMock = vi.fn();
const getVpnStatusMock = vi.fn();
const connectVpnMock = vi.fn();
const disconnectVpnMock = vi.fn();
const listVpnReceiptsMock = vi.fn();
const repairVpnMock = vi.fn();

vi.mock("@/services/iroha", () => ({
  getVpnAvailability: (input: unknown) => getVpnAvailabilityMock(input),
  getVpnProfile: (input: unknown) => getVpnProfileMock(input),
  getVpnStatus: (input: unknown) => getVpnStatusMock(input),
  connectVpn: (input: unknown) => connectVpnMock(input),
  disconnectVpn: (input: unknown) => disconnectVpnMock(input),
  repairVpn: (input: unknown) => repairVpnMock(input),
  listVpnReceipts: (input: unknown) => listVpnReceiptsMock(input),
}));

const defaultAvailability = {
  platformSupported: true,
  helperManaged: true,
  helperReady: true,
  serverReachable: true,
  profileAvailable: true,
  actionsEnabled: true,
  status: "ready" as const,
  message: "System tunnel is ready.",
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
};

const defaultProfile = {
  available: true,
  relayEndpoint: "/dns/torii.exit.example/udp/9443/quic",
  supportedExitClasses: ["standard", "low-latency", "high-security"] as const,
  defaultExitClass: "standard" as const,
  leaseSecs: 600,
  dnsPushIntervalSecs: 90,
  meterFamily: "soranet.vpn.standard",
  routePushes: ["0.0.0.0/0"],
  excludedRoutes: ["127.0.0.0/8"],
  dnsServers: ["1.1.1.1"],
  tunnelAddresses: ["10.208.0.2/32"],
  mtuBytes: 1280,
  displayBillingLabel: "standard · soranet.vpn.standard",
};

const idleStatus = {
  state: "idle" as const,
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
  helperStatus: "idle",
  controllerInstalled: true,
  controllerVersion: "1.0.0",
  controllerKind: "macos-network-extension",
  reconcileState: null,
  repairRequired: false,
  remoteSessionActive: false,
  systemTunnelActive: false,
  systemTunnelKind: "macos-networksetup",
  systemTunnelInterface: "utun7",
  systemTunnelService: "Wi-Fi",
  errorMessage: null,
  lastReceipt: null,
};

describe("VpnView", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    setActivePinia(createPinia());
    getVpnAvailabilityMock.mockReset().mockResolvedValue(defaultAvailability);
    getVpnProfileMock.mockReset().mockResolvedValue(defaultProfile);
    getVpnStatusMock.mockReset().mockResolvedValue(idleStatus);
    connectVpnMock.mockReset().mockResolvedValue({
      ...idleStatus,
      state: "connected",
      sessionId: "sess_1",
      exitClass: "standard",
      relayEndpoint: defaultProfile.relayEndpoint,
      connectedAtMs: 1,
      expiresAtMs: 2,
      helperStatus: "embedded-connected",
      systemTunnelActive: true,
      systemTunnelKind: "macos-networksetup",
      systemTunnelInterface: "utun7",
      systemTunnelService: "Wi-Fi",
    });
    repairVpnMock.mockReset().mockResolvedValue(idleStatus);
    disconnectVpnMock.mockReset().mockResolvedValue(idleStatus);
    listVpnReceiptsMock.mockReset().mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const mountView = async (options?: {
    account?: Partial<{
      displayName: string;
      domain: string;
      accountId: string;
      i105AccountId: string;
      i105DefaultAccountId: string;
      publicKeyHex: string;
      privateKeyHex: string;
      localOnly: boolean;
    }>;
  }) => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const session = useSessionStore();
    const vpnStore = useVpnStore();
    vpnStore.hydrate();
    const account = {
      displayName: "Alice",
      domain: "wonderland",
      accountId: "alice@wonderland",
      publicKeyHex: "ab".repeat(32),
      privateKeyHex: "cd".repeat(32),
      localOnly: false,
      ...options?.account,
    };
    session.$patch({
      connection: {
        toriiUrl: "https://taira.sora.org",
        chainId: "chain",
        assetDefinitionId: "xor#taira",
        networkPrefix: 369,
      },
      accounts: [account],
      activeAccountId: account.accountId,
    });

    const wrapper = mount(VpnView, {
      global: {
        plugins: [pinia],
      },
    });
    await flushPromises();
    return wrapper;
  };

  it("loads VPN helper state, profile, and receipts on mount", async () => {
    listVpnReceiptsMock.mockResolvedValue([
      {
        sessionId: "sess_1",
        accountId: "alice@wonderland",
        exitClass: "standard",
        relayEndpoint: defaultProfile.relayEndpoint,
        meterFamily: defaultProfile.meterFamily,
        connectedAtMs: 1,
        disconnectedAtMs: 2,
        durationMs: 1,
        bytesIn: 0,
        bytesOut: 0,
        status: "disconnected",
        receiptSource: "torii",
      },
    ]);
    const wrapper = await mountView();

    expect(getVpnAvailabilityMock).toHaveBeenCalledWith({
      toriiUrl: "https://taira.sora.org",
    });
    expect(getVpnProfileMock).toHaveBeenCalledWith({
      toriiUrl: "https://taira.sora.org",
    });
    expect(getVpnStatusMock).toHaveBeenCalledWith({
      toriiUrl: "https://taira.sora.org",
      accountId: "alice@wonderland",
    });
    expect(wrapper.text()).toContain("VPN status");
    expect(wrapper.text()).toContain(defaultProfile.relayEndpoint);
    expect(wrapper.text()).toContain("Recent VPN receipts");
    expect(wrapper.text()).toContain("utun7");
    expect(wrapper.text()).toContain("Wi-Fi");
    expect(wrapper.text()).toContain("10.208.0.2/32");
    wrapper.unmount();
  });

  it("submits connect requests with the active wallet credentials", async () => {
    const wrapper = await mountView();

    await wrapper.get("button:not(.secondary)").trigger("click");
    await flushPromises();

    expect(connectVpnMock).toHaveBeenCalledWith({
      toriiUrl: "https://taira.sora.org",
      accountId: "alice@wonderland",
      privateKeyHex: "cd".repeat(32),
      exitClass: "standard",
    });
    wrapper.unmount();
  });

  it("uses the TAIRA i105 literal for vpn requests when stored ids are stale", async () => {
    const wrapper = await mountView({
      account: {
        accountId: "sorauLegacyVisibleAccount1234567890",
        i105AccountId: "",
        i105DefaultAccountId: "sorauLegacyVisibleAccount1234567890",
      },
    });

    expect(getVpnStatusMock).toHaveBeenCalledWith({
      toriiUrl: "https://taira.sora.org",
      accountId: "testuLegacyVisibleAccount1234567890",
    });
    expect(listVpnReceiptsMock).toHaveBeenCalledWith({
      toriiUrl: "https://taira.sora.org",
      accountId: "testuLegacyVisibleAccount1234567890",
    });

    await wrapper.get("button:not(.secondary)").trigger("click");
    await flushPromises();

    expect(connectVpnMock).toHaveBeenCalledWith({
      toriiUrl: "https://taira.sora.org",
      accountId: "testuLegacyVisibleAccount1234567890",
      privateKeyHex: "cd".repeat(32),
      exitClass: "standard",
    });
    wrapper.unmount();
  });

  it("shows disconnect CTA when the helper reports an active session", async () => {
    getVpnStatusMock.mockResolvedValue({
      ...idleStatus,
      state: "connected",
      sessionId: "sess_1",
      exitClass: "standard",
      relayEndpoint: defaultProfile.relayEndpoint,
      connectedAtMs: 1,
      expiresAtMs: 2,
      helperStatus: "embedded-connected",
    });
    const wrapper = await mountView();

    expect(wrapper.text()).toContain("Disconnect VPN");
    await wrapper
      .findAll("button")
      .find((node) => node.text().includes("Disconnect VPN"))!
      .trigger("click");
    await flushPromises();

    expect(disconnectVpnMock).toHaveBeenCalledWith({
      toriiUrl: "https://taira.sora.org",
      accountId: "alice@wonderland",
      privateKeyHex: "cd".repeat(32),
    });
    wrapper.unmount();
  });

  it("disables connect when the system tunnel is not configured", async () => {
    getVpnAvailabilityMock.mockResolvedValue({
      ...defaultAvailability,
      helperReady: false,
      actionsEnabled: false,
      systemTunnelConfigured: false,
      systemTunnelInterface: null,
      systemTunnelService: null,
      message:
        "Set SORANET_VPN_INTERFACE to an existing tunnel interface before connecting VPN.",
    });
    const wrapper = await mountView();

    const connectButton = wrapper.get("button:not(.secondary)");
    expect((connectButton.element as HTMLButtonElement).disabled).toBe(true);
    expect(wrapper.text()).toContain("SORANET_VPN_INTERFACE");
    wrapper.unmount();
  });

  it("runs repair when the controller reports a repair-required state", async () => {
    getVpnAvailabilityMock.mockResolvedValue({
      ...defaultAvailability,
      actionsEnabled: false,
      repairRequired: true,
      message: "repair required",
    });
    getVpnStatusMock.mockResolvedValue({
      ...idleStatus,
      state: "repair-needed",
      repairRequired: true,
      reconcileState: "controller-repair-required",
    });
    const wrapper = await mountView();

    await wrapper
      .findAll("button")
      .find((node) => node.text().includes("Repair VPN"))!
      .trigger("click");
    await flushPromises();

    expect(repairVpnMock).toHaveBeenCalledWith({
      toriiUrl: "https://taira.sora.org",
      accountId: "alice@wonderland",
    });
    wrapper.unmount();
  });
});

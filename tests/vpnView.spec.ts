import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { defineComponent } from "vue";
import VpnView from "@/views/VpnView.vue";
import { useEndpointStore } from "@/stores/endpoint";
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
  repairVpn: () => repairVpnMock(),
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

const canonicalReceipt = {
  sessionId: "sess_1",
  accountId: "alice@wonderland",
  exitClass: "standard" as const,
  relayEndpoint: defaultProfile.relayEndpoint,
  meterFamily: defaultProfile.meterFamily,
  connectedAtMs: 1,
  disconnectedAtMs: 2,
  durationMs: 1,
  bytesIn: 0,
  bytesOut: 0,
  status: "disconnected",
  receiptSource: "torii" as const,
};

const VpnViewHarness = defineComponent({
  components: { VpnView },
  template: `
    <div data-testid="vpn-view-harness">
      <header aria-label="Route header">
        <div>
          <h1>Sora VPN</h1>
          <p>Connect, disconnect, and inspect Sora VPN sessions</p>
        </div>
        <div id="route-header-actions"></div>
      </header>
      <main><VpnView /></main>
    </div>
  `,
});

describe("VpnView", () => {
  beforeEach(() => {
    document.body.replaceChildren();
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
    document.body.replaceChildren();
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
    }> | null;
    toriiUrl?: string;
    writeAllowed?: boolean;
    vpnSupported?: boolean;
  }) => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const session = useSessionStore();
    const vpnStore = useVpnStore();
    vpnStore.hydrate();
    const account =
      options?.account === null
        ? null
        : {
            displayName: "Alice",
            domain: "wonderland",
            accountId: "alice@wonderland",
            publicKeyHex: "ab".repeat(32),
            privateKeyHex: "cd".repeat(32),
            localOnly: false,
            ...options?.account,
          };
    const configuredToriiUrl =
      options?.toriiUrl === undefined
        ? "https://taira.sora.org"
        : options.toriiUrl;
    session.$patch({
      connection: {
        toriiUrl: configuredToriiUrl,
        chainId: "chain",
        assetDefinitionId: "xor#taira",
        networkPrefix: 369,
      },
      accounts: account ? [account] : [],
      activeAccountId: account?.accountId ?? null,
    });
    const endpointStore = useEndpointStore();
    if (configuredToriiUrl) {
      endpointStore.$patch({
        state: "ready",
        inspection: {
          schema: "iroha.wallet.endpoint-inspection.v1",
          toriiUrl: configuredToriiUrl,
          expected: { chainId: "chain", networkPrefix: 369 },
          observed: { chainId: "chain", networkPrefix: 369 },
          identityStatus:
            options?.writeAllowed === false ? "unverified" : "matched",
          accessMode:
            options?.writeAllowed === false ? "read-only" : "read-write",
          checkedAtMs: 1,
          evidence: [
            {
              source: "chain-metadata",
              identity: { chainId: "chain", networkPrefix: 369 },
              observedAtMs: 1,
            },
          ],
          diagnostic: {
            code:
              options?.writeAllowed === false
                ? "endpoint_identity_unverified"
                : "endpoint_identity_matched",
            message:
              options?.writeAllowed === false
                ? "Endpoint identity is not verified."
                : "Endpoint identity matched.",
          },
          features: {
            vpnSessions: {
              supported: options?.vpnSupported ?? true,
              source: "openapi",
              requiredOperations: [
                "POST /v1/vpn/quotes",
                "POST /v1/vpn/sessions",
              ],
              missingOperations:
                options?.vpnSupported === false
                  ? ["POST /v1/vpn/sessions"]
                  : [],
            },
          },
        },
      } as any);
    } else {
      endpointStore.$patch({
        state: "idle",
        inspection: null,
      });
    }

    const wrapper = mount(VpnViewHarness, {
      attachTo: document.body,
      global: {
        plugins: [pinia],
      },
    });
    await flushPromises();
    return wrapper;
  };

  it("loads VPN helper state, profile, and receipts on mount", async () => {
    listVpnReceiptsMock.mockResolvedValue([canonicalReceipt]);
    const wrapper = await mountView();

    expect(getVpnAvailabilityMock).toHaveBeenCalledWith({
      toriiUrl: "https://taira.sora.org",
    });
    expect(getVpnProfileMock).toHaveBeenCalledWith({
      toriiUrl: "https://taira.sora.org",
    });
    expect(getVpnStatusMock).toHaveBeenCalledWith({
      toriiUrl: "https://taira.sora.org",
      chainId: "chain",
      accountId: "alice@wonderland",
      networkPrefix: 369,
    });
    expect(wrapper.get('header[aria-label="Route header"] h1').text()).toBe(
      "Sora VPN",
    );
    expect(wrapper.find(".vpn-layout h1").exists()).toBe(false);
    expect(wrapper.get("#vpn-heading").text()).toBe("Connection");
    expect(wrapper.text()).toContain(defaultProfile.relayEndpoint);
    expect(wrapper.text()).toContain("Recent VPN receipts");
    expect(wrapper.text()).toContain("utun7");
    expect(wrapper.text()).toContain("Wi-Fi");
    expect(wrapper.text()).toContain("10.208.0.2/32");
    wrapper.unmount();
  });

  it("preserves a potentially active local tunnel when status refresh fails", async () => {
    getVpnStatusMock
      .mockResolvedValueOnce({
        ...idleStatus,
        state: "connected",
        sessionId: "sess_live",
        helperStatus: "embedded-connected",
        systemTunnelActive: true,
      })
      .mockRejectedValue(new Error("controller status down"));
    const wrapper = await mountView();

    const refreshButton = wrapper.get("#route-header-actions button");
    await refreshButton.trigger("click");
    await flushPromises();

    expect(wrapper.get('[data-testid="vpn-status-error"]').text()).toBe(
      "controller status down",
    );
    expect(wrapper.text()).toContain("System tunnel active");
    expect(wrapper.text()).toContain("Disconnect VPN");

    await wrapper
      .findAll("button")
      .find((node) => node.text().includes("Disconnect VPN"))!
      .trigger("click");
    await flushPromises();
    expect(disconnectVpnMock).toHaveBeenCalled();
    wrapper.unmount();
  });

  it("uses local availability to keep Disconnect visible when the first status read fails", async () => {
    getVpnAvailabilityMock.mockResolvedValue({
      ...defaultAvailability,
      systemTunnelActive: true,
    });
    getVpnStatusMock.mockRejectedValue(new Error("status unavailable"));

    const wrapper = await mountView();

    expect(wrapper.get('[data-testid="vpn-status-error"]').text()).toBe(
      "status unavailable",
    );
    expect(wrapper.text()).toContain("System tunnel active");
    expect(wrapper.text()).toContain("Disconnect VPN");
    expect(wrapper.text()).toContain("macos-network-extension");
    wrapper.unmount();
  });

  it("preserves same-context receipts and marks their failed refresh unavailable", async () => {
    listVpnReceiptsMock
      .mockResolvedValueOnce([canonicalReceipt])
      .mockRejectedValueOnce(new Error("receipt route down"));
    const wrapper = await mountView();
    expect(wrapper.text()).toContain("sess_1");

    await wrapper.get("#route-header-actions button").trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("sess_1");
    expect(wrapper.get('[data-testid="vpn-receipts-error"]').text()).toBe(
      "receipt route down",
    );
    expect(wrapper.text()).not.toContain("No VPN receipts yet.");
    wrapper.unmount();
  });

  it("does not render a failed initial receipt read as an empty live history", async () => {
    listVpnReceiptsMock.mockRejectedValue(new Error("receipt history down"));
    const wrapper = await mountView();

    expect(wrapper.get('[data-testid="vpn-receipts-error"]').text()).toBe(
      "receipt history down",
    );
    expect(wrapper.text()).not.toContain("No VPN receipts yet.");
    expect(
      wrapper
        .findAll(".vpn-diagnostic-section")
        .find((node) => node.text().includes("Recent VPN receipts"))
        ?.text(),
    ).toContain("Unavailable");
    wrapper.unmount();
  });

  it("blocks connect before credentials when the Torii profile is unavailable", async () => {
    getVpnAvailabilityMock.mockResolvedValue({
      ...defaultAvailability,
      profileAvailable: false,
      actionsEnabled: false,
      status: "unavailable",
      message: "VPN control plane is unavailable on this Torii node.",
    });
    getVpnProfileMock.mockResolvedValue({
      ...defaultProfile,
      available: false,
    });

    const wrapper = await mountView();
    const connectButton = wrapper.get(
      ".vpn-primary-actions [data-ui-primary-action]",
    );

    expect(connectButton.attributes("disabled")).toBeDefined();
    expect(wrapper.text()).toContain(
      "VPN control plane is unavailable on this Torii node.",
    );
    await connectButton.trigger("click");
    await flushPromises();
    expect(connectVpnMock).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("blocks connect when endpoint identity is read-only while keeping diagnostics available", async () => {
    const wrapper = await mountView({ writeAllowed: false });
    const connectButton = wrapper.get(
      ".vpn-primary-actions [data-ui-primary-action]",
    );

    expect(connectButton.attributes("disabled")).toBeDefined();
    expect(wrapper.get('[data-testid="vpn-write-prerequisite"]').text()).toBe(
      "Endpoint identity is not verified.",
    );
    expect(wrapper.text()).toContain("Recent VPN receipts");

    await connectButton.trigger("click");
    await flushPromises();
    expect(connectVpnMock).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("blocks connect when VPN mutation routes are not advertised", async () => {
    const wrapper = await mountView({ vpnSupported: false });
    const connectButton = wrapper.get(
      ".vpn-primary-actions [data-ui-primary-action]",
    );

    expect(connectButton.attributes("disabled")).toBeDefined();
    expect(wrapper.get('[data-testid="vpn-write-prerequisite"]').text()).toBe(
      "This endpoint does not advertise the required VPN session operations.",
    );

    await connectButton.trigger("click");
    await flushPromises();
    expect(connectVpnMock).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("submits connect requests with the active wallet credentials", async () => {
    const wrapper = await mountView();

    await wrapper
      .get(".vpn-primary-actions [data-ui-primary-action]")
      .trigger("click");
    await flushPromises();

    expect(connectVpnMock).toHaveBeenCalledWith({
      toriiUrl: "https://taira.sora.org",
      chainId: "chain",
      accountId: "alice@wonderland",
      networkPrefix: 369,
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
      chainId: "chain",
      accountId: "testuLegacyVisibleAccount1234567890",
      networkPrefix: 369,
    });
    expect(listVpnReceiptsMock).toHaveBeenCalledWith({
      toriiUrl: "https://taira.sora.org",
      chainId: "chain",
      accountId: "testuLegacyVisibleAccount1234567890",
      networkPrefix: 369,
    });

    await wrapper
      .get(".vpn-primary-actions [data-ui-primary-action]")
      .trigger("click");
    await flushPromises();

    expect(connectVpnMock).toHaveBeenCalledWith({
      toriiUrl: "https://taira.sora.org",
      chainId: "chain",
      accountId: "testuLegacyVisibleAccount1234567890",
      networkPrefix: 369,
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
      chainId: "chain",
      accountId: "alice@wonderland",
      networkPrefix: 369,
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

    const connectButton = wrapper.get(
      ".vpn-primary-actions [data-ui-primary-action]",
    );
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

    expect(repairVpnMock).toHaveBeenCalledWith();
    wrapper.unmount();
  });

  it("loads and repairs the local controller without a Torii endpoint or wallet", async () => {
    getVpnStatusMock
      .mockResolvedValueOnce({
        ...idleStatus,
        state: "repair-needed",
        repairRequired: true,
        reconcileState: "controller-repair-required",
        errorMessage: "Local controller needs repair.",
      })
      .mockResolvedValue(idleStatus);
    const wrapper = await mountView({ account: null, toriiUrl: "" });

    expect(getVpnStatusMock).toHaveBeenCalledWith(undefined);
    expect(getVpnAvailabilityMock).not.toHaveBeenCalled();
    expect(getVpnProfileMock).not.toHaveBeenCalled();
    expect(listVpnReceiptsMock).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain("Local controller needs repair.");

    const repairButton = wrapper
      .findAll("button")
      .find((node) => node.text().includes("Repair VPN"));
    expect(repairButton).toBeDefined();
    expect(repairButton!.attributes("disabled")).toBeUndefined();
    await repairButton!.trigger("click");
    await flushPromises();

    expect(repairVpnMock).toHaveBeenCalledWith();
    expect(getVpnAvailabilityMock).not.toHaveBeenCalled();
    expect(getVpnProfileMock).not.toHaveBeenCalled();
    expect(listVpnReceiptsMock).not.toHaveBeenCalled();
    const connectButton = wrapper.get(
      ".vpn-primary-actions [data-ui-primary-action]",
    );
    expect(connectButton.text()).toContain("Connect VPN");
    expect(connectButton.attributes("disabled")).toBeDefined();
    await connectButton.trigger("click");
    expect(connectVpnMock).not.toHaveBeenCalled();
    expect(disconnectVpnMock).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("presents one control surface, one contextual action, and collapsed diagnostics", async () => {
    const wrapper = await mountView();

    expect(wrapper.findAll(".vpn-control-surface")).toHaveLength(1);
    expect(wrapper.find(".vpn-control-surface.card").exists()).toBe(false);
    expect(
      wrapper.findAll(".vpn-primary-actions [data-ui-primary-action]"),
    ).toHaveLength(1);

    const headerActions = wrapper.get("#route-header-actions");
    expect(headerActions.findAll("button")).toHaveLength(1);
    expect(headerActions.get("button").text()).toBe("Refresh");
    expect(wrapper.find(".vpn-layout > .ui-route-header-action").exists()).toBe(
      false,
    );

    const diagnostics = wrapper.get(".vpn-diagnostics");
    const sections = diagnostics.findAll(".vpn-diagnostic-section");
    expect(sections).toHaveLength(3);
    expect(
      sections.every((section) => section.attributes("open") === undefined),
    ).toBe(true);
    expect(sections.map((section) => section.get("summary").text())).toEqual([
      "Session details",
      "Network profile",
      "Recent VPN receipts",
    ]);
    wrapper.unmount();
  });
});

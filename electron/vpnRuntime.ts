import { lookup as dnsLookup } from "node:dns/promises";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { isIP } from "node:net";
import { dirname, join } from "node:path";
import { ToriiClient } from "@iroha/iroha-js";
import { nodeFetch } from "./nodeFetch";
import {
  BundledVpnController,
  type VpnControllerStatus,
  type VpnLocalController,
} from "./vpnController";
import type {
  VpnAuthContext,
  VpnAvailability,
  VpnExitClass,
  VpnProfile,
  VpnReceipt,
  VpnStatus,
} from "../src/types/iroha";
import { normalizeTairaAccountIdLiteral } from "../src/utils/accountId";
import { sanitizeErrorMessage } from "../src/utils/errorMessage";

type VpnAvailabilityInput = {
  toriiUrl: string;
};

type VpnConnectInput = VpnAuthContext & {
  exitClass: VpnExitClass;
};

type VpnStatusInput = Partial<VpnAuthContext>;

type ActiveVpnSession = {
  toriiUrl: string;
  accountId: string;
  privateKeyHex: string;
  sessionId: string;
  exitClass: VpnExitClass;
  relayEndpoint: string;
  leaseSecs: number;
  expiresAtMs: number;
  connectedAtMs: number;
  meterFamily: string;
  routePushes: string[];
  excludedRoutes: string[];
  dnsServers: string[];
  tunnelAddresses: string[];
  mtuBytes: number;
  helperTicketHex: string;
  bytesIn: number;
  bytesOut: number;
  pendingRemoteDelete: boolean;
};

const SUPPORTED_PLATFORMS = new Set(["darwin", "linux"]);
const MAX_RECEIPTS = 24;

const emptyStatus = (overrides?: Partial<VpnStatus>): VpnStatus => ({
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
  helperStatus: "idle",
  controllerInstalled: false,
  controllerVersion: null,
  controllerKind: null,
  reconcileState: null,
  repairRequired: false,
  remoteSessionActive: false,
  systemTunnelActive: false,
  systemTunnelKind: null,
  systemTunnelInterface: null,
  systemTunnelService: null,
  errorMessage: null,
  lastReceipt: null,
  ...overrides,
});

const normalizeHex = (value: string, label: string) => {
  const normalized = value.trim().replace(/^0x/i, "");
  if (
    !normalized ||
    normalized.length % 2 !== 0 ||
    !/^[\da-f]+$/i.test(normalized)
  ) {
    throw new Error(`${label} must be an even-length hex string.`);
  }
  return normalized;
};

const toPrivateKeyBuffer = (privateKeyHex: string) =>
  Buffer.from(normalizeHex(privateKeyHex, "privateKeyHex"), "hex");

const nowMs = () => Date.now();

const normalizeVpnAccountId = (value: string, label: string) => {
  const normalized = normalizeTairaAccountIdLiteral(value).trim();
  if (!normalized) {
    throw new Error(`${label} is required.`);
  }
  return normalized;
};

const VPN_EXIT_CLASSES: readonly VpnExitClass[] = [
  "standard",
  "low-latency",
  "high-security",
];
const FULL_TUNNEL_ROUTE_PUSHES = ["0.0.0.0/0", "::/0"] as const;

const isVpnExitClass = (value: unknown): value is VpnExitClass =>
  typeof value === "string" &&
  (VPN_EXIT_CLASSES as readonly string[]).includes(value);

const inferTunnelAddressFamily = (value: string) => {
  const address = value.split("/", 1)[0]?.trim() ?? "";
  const family = isIP(address);
  return family === 4 || family === 6 ? family : null;
};

export const resolveVpnRelayEndpoint = (
  relayEndpoint: string,
  toriiUrl: string,
) => {
  const segments = relayEndpoint
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (segments.length < 2) {
    return relayEndpoint;
  }
  const [hostKind, hostValue] = segments;
  if (
    (hostKind !== "dns" && hostKind !== "dns4" && hostKind !== "dns6") ||
    hostValue !== "torii"
  ) {
    return relayEndpoint;
  }
  try {
    const hostname = new URL(toriiUrl).hostname.trim();
    if (!hostname) {
      return relayEndpoint;
    }
    const ipFamily = isIP(hostname);
    segments[0] = ipFamily === 4 ? "ip4" : ipFamily === 6 ? "ip6" : hostKind;
    segments[1] = hostname;
    return `/${segments.join("/")}`;
  } catch {
    return relayEndpoint;
  }
};

export const resolveVpnRelayEndpointForController = async (
  relayEndpoint: string,
  toriiUrl: string,
) => {
  const normalized = resolveVpnRelayEndpoint(relayEndpoint, toriiUrl);
  const segments = normalized
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (segments.length < 2) {
    return normalized;
  }
  const [hostKind, hostValue] = segments;
  if (hostKind !== "dns" && hostKind !== "dns4" && hostKind !== "dns6") {
    return normalized;
  }
  try {
    const lookupOptions =
      hostKind === "dns4"
        ? { family: 4 as const }
        : hostKind === "dns6"
          ? { family: 6 as const }
          : {};
    const resolved = await dnsLookup(hostValue, lookupOptions);
    const address = typeof resolved === "string" ? resolved : resolved.address;
    const family = typeof resolved === "string" ? isIP(resolved) : resolved.family;
    if (family !== 4 && family !== 6) {
      return normalized;
    }
    segments[0] = family === 4 ? "ip4" : "ip6";
    segments[1] = address;
    return `/${segments.join("/")}`;
  } catch {
    return normalized;
  }
};

export const resolveVpnRoutePushesForController = (
  routePushes: readonly string[],
  tunnelAddresses: readonly string[],
) => {
  if (routePushes.length > 0) {
    return [...routePushes];
  }

  const families = new Set(
    tunnelAddresses
      .map(inferTunnelAddressFamily)
      .filter((family): family is 4 | 6 => family === 4 || family === 6),
  );

  return FULL_TUNNEL_ROUTE_PUSHES.filter((cidr) => {
    const family = inferTunnelAddressFamily(cidr);
    return family ? families.has(family) : false;
  });
};

export const resolveVpnExcludedRoutesForController = (
  excludedRoutes: readonly string[],
  relayEndpoint: string,
  routePushes: readonly string[],
) => {
  const normalized = [...excludedRoutes];
  const segments = relayEndpoint
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (segments.length < 2) {
    return normalized;
  }

  const [hostKind, hostValue] = segments;
  const relayCidr =
    hostKind === "ip4" && routePushes.includes("0.0.0.0/0")
      ? `${hostValue}/32`
      : hostKind === "ip6" && routePushes.includes("::/0")
        ? `${hostValue}/128`
        : null;
  if (!relayCidr || normalized.includes(relayCidr)) {
    return normalized;
  }
  normalized.push(relayCidr);
  return normalized;
};

const normalizeProfile = (
  profile: VpnProfile | null,
  toriiUrl: string,
): VpnProfile | null => {
  if (!profile) {
    return null;
  }
  const supportedExitClasses =
    profile.supportedExitClasses.filter(isVpnExitClass);
  const defaultExitClass = isVpnExitClass(profile.defaultExitClass)
    ? profile.defaultExitClass
    : (supportedExitClasses[0] ?? "standard");
  return {
    available: Boolean(profile.available),
    relayEndpoint: resolveVpnRelayEndpoint(profile.relayEndpoint, toriiUrl),
    supportedExitClasses:
      supportedExitClasses.length > 0
        ? [...supportedExitClasses]
        : [defaultExitClass],
    defaultExitClass,
    leaseSecs: profile.leaseSecs,
    dnsPushIntervalSecs: profile.dnsPushIntervalSecs,
    meterFamily: profile.meterFamily,
    routePushes: [...profile.routePushes],
    excludedRoutes: [...profile.excludedRoutes],
    dnsServers: [...profile.dnsServers],
    tunnelAddresses: [...profile.tunnelAddresses],
    mtuBytes: profile.mtuBytes,
    displayBillingLabel: profile.displayBillingLabel,
  };
};

const normalizeProfileExitClass = (
  profile: VpnProfile | null,
  requestedExitClass: VpnExitClass,
): VpnExitClass => {
  if (!profile) {
    return requestedExitClass;
  }
  return profile.supportedExitClasses.includes(requestedExitClass)
    ? requestedExitClass
    : profile.defaultExitClass;
};

const normalizeReceipt = (
  receipt: VpnReceipt,
  toriiUrl?: string,
  receiptSource: VpnReceipt["receiptSource"] = receipt.receiptSource ??
    "local-fallback",
): VpnReceipt => ({
  sessionId: receipt.sessionId,
  accountId: receipt.accountId,
  exitClass: receipt.exitClass,
  relayEndpoint: toriiUrl
    ? resolveVpnRelayEndpoint(receipt.relayEndpoint, toriiUrl)
    : receipt.relayEndpoint,
  meterFamily: receipt.meterFamily,
  connectedAtMs: receipt.connectedAtMs,
  disconnectedAtMs: receipt.disconnectedAtMs,
  durationMs: receipt.durationMs,
  bytesIn: receipt.bytesIn,
  bytesOut: receipt.bytesOut,
  status: receipt.status,
  receiptSource,
});

export class VpnRuntime {
  private readonly receiptsPath: string;

  private readonly activeSessionPath: string;

  private readonly helperVersion: string;

  private readonly platform: string;

  private readonly clients = new Map<string, ToriiClient>();

  private readonly controller: VpnLocalController;

  private receipts: VpnReceipt[];

  private activeSession: ActiveVpnSession | null = null;

  private state: VpnStatus["state"] = "idle";

  private lastError: string | null = null;

  private reconcileState: string | null = null;

  private remoteSessionActive = false;

  constructor(options: {
    userDataPath: string;
    helperVersion: string;
    controller?: VpnLocalController;
  }) {
    this.platform = process.platform;
    this.helperVersion = options.helperVersion;
    this.receiptsPath = join(options.userDataPath, "vpn", "receipts.json");
    this.activeSessionPath = join(
      options.userDataPath,
      "vpn",
      "active-session.json",
    );
    this.controller = options.controller ?? new BundledVpnController();
    mkdirSync(dirname(this.receiptsPath), { recursive: true });
    this.receipts = this.loadReceipts();
    this.activeSession = this.loadActiveSession();
    if (this.activeSession) {
      this.state = this.activeSession.pendingRemoteDelete
        ? "remote-delete-pending"
        : "reconciling";
    }
  }

  async getAvailability(input: VpnAvailabilityInput): Promise<VpnAvailability> {
    if (!this.isPlatformSupported()) {
      return {
        platformSupported: false,
        helperManaged: true,
        helperReady: false,
        serverReachable: false,
        profileAvailable: false,
        actionsEnabled: false,
        status: "unsupported",
        message: "Sora VPN currently supports macOS and Linux only.",
        helperVersion: this.helperVersion,
        platform: this.platform,
        controllerInstalled: false,
        controllerVersion: null,
        controllerKind: null,
        controllerPath: null,
        repairRequired: false,
        systemTunnelConfigured: false,
        systemTunnelActive: false,
        systemTunnelKind: null,
        systemTunnelInterface: null,
        systemTunnelService: null,
      };
    }
    try {
      const controller = await this.controller.refreshCapability();
      const profile = await this.fetchProfile(input.toriiUrl);
      const profileAvailable = Boolean(profile?.available);
      const actionsEnabled =
        profileAvailable && controller.installed && !controller.repairRequired;
      const message = controller.repairRequired
        ? controller.message
        : !controller.installed
          ? controller.message
          : !profileAvailable
            ? "VPN control plane is unavailable on this Torii node."
            : controller.message;
      return {
        platformSupported: true,
        helperManaged: true,
        helperReady: controller.installed && !controller.repairRequired,
        serverReachable: profile !== null,
        profileAvailable,
        actionsEnabled,
        status: actionsEnabled
          ? "ready"
          : !profileAvailable
            ? "unavailable"
            : "error",
        message,
        helperVersion: this.helperVersion,
        platform: this.platform,
        controllerInstalled: controller.installed,
        controllerVersion: controller.version,
        controllerKind: controller.controllerKind,
        controllerPath: controller.controllerPath,
        repairRequired: controller.repairRequired,
        systemTunnelConfigured: controller.installed,
        systemTunnelActive: controller.active,
        systemTunnelKind: controller.controllerKind,
        systemTunnelInterface: controller.interfaceName,
        systemTunnelService: controller.networkService,
      };
    } catch (error) {
      return {
        platformSupported: true,
        helperManaged: true,
        helperReady: false,
        serverReachable: false,
        profileAvailable: false,
        actionsEnabled: false,
        status: "error",
        message: sanitizeErrorMessage(
          error instanceof Error ? error.message : String(error),
        ),
        helperVersion: this.helperVersion,
        platform: this.platform,
        controllerInstalled: false,
        controllerVersion: null,
        controllerKind: null,
        controllerPath: null,
        repairRequired: false,
        systemTunnelConfigured: false,
        systemTunnelActive: false,
        systemTunnelKind: null,
        systemTunnelInterface: null,
        systemTunnelService: null,
      };
    }
  }

  async getProfile(input: VpnAvailabilityInput): Promise<VpnProfile | null> {
    return this.fetchProfile(input.toriiUrl);
  }

  async getStatus(input?: VpnStatusInput): Promise<VpnStatus> {
    const controller = await this.reconcile(input);
    return this.buildStatus(controller);
  }

  async connect(input: VpnConnectInput): Promise<VpnStatus> {
    if (!this.isPlatformSupported()) {
      throw new Error("Sora VPN currently supports macOS and Linux only.");
    }
    this.state = "connecting";
    this.lastError = null;
    this.reconcileState = null;
    if (this.activeSession) {
      await this.disconnect(input);
    }

    const controller = await this.controller.refreshCapability();
    if (!controller.installed) {
      this.state = "error";
      this.lastError = controller.message;
      throw new Error(controller.message);
    }
    if (controller.repairRequired) {
      this.state = "repair-needed";
      this.lastError = controller.message;
      throw new Error(controller.message);
    }

    const profile = await this.fetchProfile(input.toriiUrl);
    if (!profile) {
      this.state = "error";
      this.lastError = "VPN control plane is unavailable on this Torii node.";
      throw new Error(this.lastError);
    }
    if (!profile.available) {
      this.state = "error";
      this.lastError = "VPN is disabled on this Torii node.";
      throw new Error(this.lastError);
    }

    const exitClass = normalizeProfileExitClass(profile, input.exitClass);
    const accountId = normalizeVpnAccountId(input.accountId, "accountId");
    let session: Awaited<ReturnType<ToriiClient["createVpnSession"]>> | null =
      null;
    try {
      session = await this.getClient(input.toriiUrl).createVpnSession(
        { exitClass },
        {
          canonicalAuth: {
            accountId,
            privateKey: toPrivateKeyBuffer(input.privateKeyHex),
          },
        },
      );
      const normalizedSession = this.normalizeRemoteSession(session, {
        ...input,
        accountId,
      });
      const controllerRelayEndpoint = await resolveVpnRelayEndpointForController(
        normalizedSession.relayEndpoint,
        input.toriiUrl,
      );
      const controllerRoutePushes = resolveVpnRoutePushesForController(
        normalizedSession.routePushes,
        normalizedSession.tunnelAddresses,
      );
      await this.controller.connect({
        sessionId: normalizedSession.sessionId,
        relayEndpoint: controllerRelayEndpoint,
        exitClass: normalizedSession.exitClass,
        helperTicketHex: normalizedSession.helperTicketHex,
        // Torii currently omits default route pushes for exit VPN sessions.
        routePushes: controllerRoutePushes,
        excludedRoutes: resolveVpnExcludedRoutesForController(
          normalizedSession.excludedRoutes,
          controllerRelayEndpoint,
          controllerRoutePushes,
        ),
        dnsServers: normalizedSession.dnsServers,
        tunnelAddresses: normalizedSession.tunnelAddresses,
        mtuBytes: normalizedSession.mtuBytes,
      });
      this.activeSession = normalizedSession;
      this.persistActiveSession();
      this.remoteSessionActive = true;
      this.state = "connected";
      this.lastError = null;
      return this.getStatus(input);
    } catch (error) {
      if (session?.sessionId) {
        const receipt = await this.getClient(input.toriiUrl)
          .deleteVpnSession(session.sessionId, {
            canonicalAuth: {
              accountId,
              privateKey: toPrivateKeyBuffer(input.privateKeyHex),
            },
          })
          .catch(() => null);
        if (receipt) {
          this.storeReceipt(
            normalizeReceipt(
              receipt as unknown as VpnReceipt,
              input.toriiUrl,
            ),
          );
        }
      }
      this.state = "error";
      this.lastError = sanitizeErrorMessage(
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }

  async disconnect(input?: Partial<VpnAuthContext>): Promise<VpnStatus> {
    if (!this.activeSession) {
      const controller = await this.reconcile(input);
      this.state = controller.active ? "repair-needed" : "idle";
      return this.buildStatus(controller);
    }

    this.state = "disconnecting";
    this.reconcileState = null;
    const session = this.activeSession;
    const controller = await this.controller.disconnect();
    if (controller.repairRequired) {
      this.state = "repair-needed";
      this.lastError = controller.message;
      return this.buildStatus(controller);
    }

    const auth = this.resolveAuthInput(input, session);
    if (!auth) {
      session.pendingRemoteDelete = true;
      this.persistActiveSession();
      this.storeReceipt(
        this.buildLocalFallbackReceipt(session, "remote-delete-pending"),
      );
      this.remoteSessionActive = true;
      this.state = "remote-delete-pending";
      this.lastError =
        "Local tunnel was disconnected, but authenticated remote session cleanup is still pending.";
      return this.buildStatus(controller);
    }

    try {
      const receipt = await this.getClient(auth.toriiUrl).deleteVpnSession(
        session.sessionId,
        {
          canonicalAuth: {
            accountId: auth.accountId,
            privateKey: toPrivateKeyBuffer(auth.privateKeyHex),
          },
        },
      );
      if (receipt) {
        this.storeReceipt(
          normalizeReceipt(receipt as unknown as VpnReceipt, auth.toriiUrl),
        );
      }
      await this.syncReceiptsFromServer(auth).catch(() => undefined);
      this.activeSession = null;
      this.persistActiveSession();
      this.remoteSessionActive = false;
      this.state = "idle";
      this.lastError = null;
      this.reconcileState = null;
      return this.getStatus(auth);
    } catch (error) {
      session.pendingRemoteDelete = true;
      this.persistActiveSession();
      this.storeReceipt(
        this.buildLocalFallbackReceipt(session, "remote-delete-pending"),
      );
      this.remoteSessionActive = true;
      this.state = "remote-delete-pending";
      this.lastError = sanitizeErrorMessage(
        error instanceof Error ? error.message : String(error),
      );
      return this.buildStatus(controller);
    }
  }

  async repair(input?: VpnStatusInput): Promise<VpnStatus> {
    await this.controller.repair();
    return this.getStatus(input);
  }

  async listReceipts(input?: VpnStatusInput): Promise<VpnReceipt[]> {
    const auth = this.resolveAuthInput(input, this.activeSession);
    if (auth) {
      await this.syncReceiptsFromServer(auth).catch(() => undefined);
    }
    return [...this.receipts];
  }

  async shutdown() {
    this.persistActiveSession();
  }

  private isPlatformSupported() {
    return SUPPORTED_PLATFORMS.has(this.platform);
  }

  private getClient(toriiUrl: string) {
    const normalized = toriiUrl.trim();
    const cached = this.clients.get(normalized);
    if (cached) {
      return cached;
    }
    const client = new ToriiClient(normalized, {
      fetchImpl: nodeFetch,
    });
    this.clients.set(normalized, client);
    return client;
  }

  private async fetchProfile(toriiUrl: string) {
    const profile = await this.getClient(toriiUrl).getVpnProfile();
    return normalizeProfile(profile as VpnProfile | null, toriiUrl);
  }

  private loadReceipts(): VpnReceipt[] {
    try {
      const raw = readFileSync(this.receiptsPath, "utf8");
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed)
        ? parsed.map((item) => normalizeReceipt(item as VpnReceipt))
        : [];
    } catch {
      return [];
    }
  }

  private loadActiveSession(): ActiveVpnSession | null {
    try {
      const raw = readFileSync(this.activeSessionPath, "utf8");
      const parsed = JSON.parse(raw) as ActiveVpnSession;
      return {
        ...parsed,
        relayEndpoint: resolveVpnRelayEndpoint(
          parsed.relayEndpoint,
          parsed.toriiUrl,
        ),
      };
    } catch {
      return null;
    }
  }

  private persistReceipts() {
    writeFileSync(this.receiptsPath, JSON.stringify(this.receipts, null, 2));
  }

  private persistActiveSession() {
    if (!this.activeSession) {
      rmSync(this.activeSessionPath, { force: true });
      return;
    }
    writeFileSync(
      this.activeSessionPath,
      JSON.stringify(this.activeSession, null, 2),
    );
  }

  private storeReceipt(receipt: VpnReceipt) {
    const existingIndex = this.receipts.findIndex(
      (item) => item.sessionId === receipt.sessionId,
    );
    if (existingIndex >= 0) {
      this.receipts.splice(existingIndex, 1);
    }
    this.receipts = [receipt, ...this.receipts].slice(0, MAX_RECEIPTS);
    this.persistReceipts();
  }

  private buildLocalFallbackReceipt(
    session: ActiveVpnSession,
    status: string,
  ): VpnReceipt {
    const disconnectedAtMs = nowMs();
    return {
      sessionId: session.sessionId,
      accountId: session.accountId,
      exitClass: session.exitClass,
      relayEndpoint: session.relayEndpoint,
      meterFamily: session.meterFamily,
      connectedAtMs: session.connectedAtMs,
      disconnectedAtMs,
      durationMs: Math.max(0, disconnectedAtMs - session.connectedAtMs),
      bytesIn: session.bytesIn,
      bytesOut: session.bytesOut,
      status,
      receiptSource: "local-fallback",
    };
  }

  private normalizeRemoteSession(
    session: Awaited<ReturnType<ToriiClient["createVpnSession"]>>,
    auth: VpnAuthContext,
    pendingRemoteDelete = false,
  ): ActiveVpnSession {
    return {
      toriiUrl: auth.toriiUrl,
      accountId: auth.accountId,
      privateKeyHex: auth.privateKeyHex,
      sessionId: session.sessionId,
      exitClass: isVpnExitClass(session.exitClass)
        ? session.exitClass
        : "standard",
      relayEndpoint: resolveVpnRelayEndpoint(
        session.relayEndpoint,
        auth.toriiUrl,
      ),
      leaseSecs: session.leaseSecs,
      expiresAtMs: session.expiresAtMs,
      connectedAtMs: session.connectedAtMs,
      meterFamily: session.meterFamily,
      routePushes: [...session.routePushes],
      excludedRoutes: [...session.excludedRoutes],
      dnsServers: [...session.dnsServers],
      tunnelAddresses: [...session.tunnelAddresses],
      mtuBytes: session.mtuBytes,
      helperTicketHex: session.helperTicketHex,
      bytesIn: session.bytesIn,
      bytesOut: session.bytesOut,
      pendingRemoteDelete,
    };
  }

  private async syncReceiptsFromServer(auth: VpnAuthContext) {
    const receipts = await this.getClient(auth.toriiUrl).listVpnReceipts({
      canonicalAuth: {
        accountId: auth.accountId,
        privateKey: toPrivateKeyBuffer(auth.privateKeyHex),
      },
    });
    this.receipts = receipts
      .map((item) =>
        normalizeReceipt(
          item as unknown as VpnReceipt,
          auth.toriiUrl,
          "torii",
        ),
      )
      .slice(0, MAX_RECEIPTS);
    this.persistReceipts();
    return this.receipts;
  }

  private resolveAuthInput(
    input?: VpnStatusInput,
    session?: ActiveVpnSession | null,
  ): VpnAuthContext | null {
    const toriiUrl = input?.toriiUrl ?? session?.toriiUrl;
    const accountIdRaw = input?.accountId ?? session?.accountId;
    const privateKeyHex = input?.privateKeyHex ?? session?.privateKeyHex;
    if (!toriiUrl || !accountIdRaw || !privateKeyHex) {
      return null;
    }
    return {
      toriiUrl,
      accountId: normalizeVpnAccountId(accountIdRaw, "accountId"),
      privateKeyHex,
    };
  }

  private async reconcile(input?: VpnStatusInput) {
    const controller = await this.controller.getStatus();
    if (controller.repairRequired) {
      this.state = "repair-needed";
      this.reconcileState = "controller-repair-required";
      this.lastError = controller.message;
    }

    if (!this.activeSession) {
      this.remoteSessionActive = false;
      if (controller.active && !controller.repairRequired) {
        this.state = "repair-needed";
        this.reconcileState = "local-tunnel-active-without-session";
      } else if (this.state !== "error" && this.state !== "repair-needed") {
        this.state = "idle";
        this.reconcileState = null;
      }
      return controller;
    }

    if (this.activeSession.expiresAtMs <= nowMs()) {
      this.storeReceipt(
        this.buildLocalFallbackReceipt(this.activeSession, "expired"),
      );
      this.activeSession = null;
      this.persistActiveSession();
      this.remoteSessionActive = false;
      this.state = "idle";
      this.reconcileState = "expired";
      return controller;
    }

    const auth = this.resolveAuthInput(input, this.activeSession);
    if (!auth) {
      this.remoteSessionActive = !this.activeSession.pendingRemoteDelete;
      this.state = this.activeSession.pendingRemoteDelete
        ? "remote-delete-pending"
        : controller.active
          ? "connected"
          : "reconciling";
      this.reconcileState = controller.active
        ? null
        : "waiting-for-authenticated-reconciliation";
      return controller;
    }

    const remote = await this.getClient(auth.toriiUrl).getVpnSession(
      this.activeSession.sessionId,
      {
        canonicalAuth: {
          accountId: auth.accountId,
          privateKey: toPrivateKeyBuffer(auth.privateKeyHex),
        },
      },
    );

    if (remote) {
      this.activeSession = this.normalizeRemoteSession(
        remote,
        auth,
        this.activeSession.pendingRemoteDelete,
      );
      this.persistActiveSession();
      this.remoteSessionActive = true;
      if (this.activeSession.pendingRemoteDelete || !controller.active) {
        this.state = "remote-delete-pending";
        this.reconcileState = controller.active
          ? "remote-delete-pending"
          : "remote-active-local-tunnel-down";
      } else if (controller.repairRequired) {
        this.state = "repair-needed";
        this.reconcileState = "controller-repair-required";
      } else {
        this.state = "connected";
        this.reconcileState = null;
        this.lastError = null;
      }
      return controller;
    }

    this.remoteSessionActive = false;
    if (controller.active) {
      this.state = "repair-needed";
      this.reconcileState = "local-tunnel-active-remote-missing";
      return controller;
    }

    this.activeSession = null;
    this.persistActiveSession();
    this.state = "idle";
    this.reconcileState = null;
    this.lastError = null;
    await this.syncReceiptsFromServer(auth).catch(() => undefined);
    return controller;
  }

  private buildStatus(controller: VpnControllerStatus): VpnStatus {
    if (!this.activeSession) {
      return emptyStatus({
        state: controller.repairRequired ? "repair-needed" : this.state,
        helperStatus: controller.active
          ? "controller-active"
          : "controller-idle",
        controllerInstalled: controller.installed,
        controllerVersion: controller.version,
        controllerKind: controller.controllerKind,
        reconcileState: this.reconcileState,
        repairRequired: controller.repairRequired,
        remoteSessionActive: false,
        systemTunnelActive: controller.active,
        systemTunnelKind: controller.controllerKind,
        systemTunnelInterface: controller.interfaceName,
        systemTunnelService: controller.networkService,
        bytesIn: controller.bytesIn,
        bytesOut: controller.bytesOut,
        errorMessage: this.lastError,
        lastReceipt: this.receipts[0] ?? null,
      });
    }

    const durationMs = Math.max(0, nowMs() - this.activeSession.connectedAtMs);
    return emptyStatus({
      state: this.state,
      sessionId: this.activeSession.sessionId,
      exitClass: this.activeSession.exitClass,
      relayEndpoint: this.activeSession.relayEndpoint,
      connectedAtMs: this.activeSession.connectedAtMs,
      expiresAtMs: this.activeSession.expiresAtMs,
      durationMs,
      bytesIn: controller.bytesIn || this.activeSession.bytesIn,
      bytesOut: controller.bytesOut || this.activeSession.bytesOut,
      routePushes: this.activeSession.routePushes,
      excludedRoutes: this.activeSession.excludedRoutes,
      dnsServers: this.activeSession.dnsServers,
      tunnelAddresses: this.activeSession.tunnelAddresses,
      mtuBytes: this.activeSession.mtuBytes,
      helperStatus: controller.active ? "controller-active" : "controller-idle",
      controllerInstalled: controller.installed,
      controllerVersion: controller.version,
      controllerKind: controller.controllerKind,
      reconcileState: this.reconcileState,
      repairRequired: controller.repairRequired,
      remoteSessionActive: this.remoteSessionActive,
      systemTunnelActive: controller.active,
      systemTunnelKind: controller.controllerKind,
      systemTunnelInterface: controller.interfaceName,
      systemTunnelService: controller.networkService,
      errorMessage: this.lastError,
      lastReceipt: this.receipts[0] ?? null,
    });
  }
}

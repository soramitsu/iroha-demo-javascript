import {
  app,
  BrowserWindow,
  desktopCapturer,
  dialog,
  ipcMain,
  protocol,
  session,
  shell,
  systemPreferences,
  type IpcMainInvokeEvent,
} from "electron";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import { VpnRuntime } from "./vpnRuntime";
import {
  SECURE_VAULT_MAX_RECEIVE_KEY_BATCH,
  SecureVault,
  type ConfidentialReceiveKeyRecord,
} from "./secureVault";
import {
  extractIrohaConnectDeepLinkFromArgv,
  extractKaigiDeepLinkFromArgv,
  parseWalletDeepLink,
} from "./deepLink";
import {
  IROHA_CONNECT_DEEP_LINK_AVAILABLE_CHANNEL,
  IROHA_CONNECT_TAKE_DEEP_LINK_CHANNEL,
} from "./irohaConnectDeepLinkChannels";
import {
  registerDisplayMediaRequestHandler,
  registerMediaPermissionHandlers,
} from "./mediaPermissions";
import {
  RENDERER_PROTOCOL_PRIVILEGES,
  RENDERER_PROTOCOL_SCHEME,
  isSafeExternalNavigationUrl,
  isTrustedRendererNavigationUrl,
  readRendererProtocolAsset,
  rendererSecurityHeadersForDestination,
  resolveRendererEntryUrl,
} from "./rendererProtocol";
import {
  GOVERNANCE_RUNTIME_CONFIG_IPC_CHANNEL,
  loadGovernanceRuntimeConfig,
} from "./governanceRuntimeConfig";
import {
  GOVERNANCE_VALIDATION_FEE_POLICY_IPC_CHANNEL,
  GovernanceValidationFeeFinalityStore,
  assertGovernanceValidationFeeTrustedSender,
  fetchGovernanceValidationFeePolicyInMain,
} from "./governanceValidationFeeFinality";
import {
  IROHA_CONNECT_CONFIRMATION_CHANNEL,
  isIrohaConnectConfirmation,
} from "./irohaConnectBoundary";
import { formatConnectTransactionReviewLines } from "../src/utils/connectTransactionReview";
import { installGlobalIrohaJsNativeBinding } from "./irohaJsNativeDir";
import { assertTrustedMainFrameIpcSender } from "./ipcTrustedMainFrame";
import { requireFirstReleaseIpcInputObject } from "./firstReleaseIpcInput";
import { requireFirstReleaseInputArray } from "./firstReleaseReadInput";
import { nodeFetch } from "./nodeFetch";
import { NetworkId } from "@iroha/iroha-js/canonical-request";
import { discoverEndpointNetworkIdentity } from "./networkIdentityDiscovery";
import {
  NETWORK_IDENTITY_CONFIRM_CHANGE_CHANNEL,
  NETWORK_IDENTITY_PIN_FIRST_USE_CHANNEL,
  NETWORK_IDENTITY_PIN_READ_CHANNEL,
  NetworkIdentityPinStore,
  resolvePinnedNetworkIdInMain,
} from "./networkIdentityPinStore";
import { normalizeEndpointUrl } from "../src/utils/endpoint";
import {
  normalizeNetworkPrefixValue,
  parseNetworkIdLiteral,
} from "../src/utils/networkIdentity";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

installGlobalIrohaJsNativeBinding(import.meta.url);

const isMac = process.platform === "darwin";
const WEBRTC_IP_HANDLING_POLICY = "default_public_and_private_interfaces";
const requestSystemMediaAccess = isMac
  ? (kind: "camera" | "microphone") => systemPreferences.askForMediaAccess(kind)
  : undefined;
const getSystemMediaAccessStatus = isMac
  ? (kind: "camera" | "microphone") =>
      systemPreferences.getMediaAccessStatus(kind)
  : undefined;
const getTrustedRendererUrl = () =>
  resolveRendererEntryUrl({
    isPackaged: app.isPackaged,
    environmentUrl: process.env["ELECTRON_RENDERER_URL"],
  });
let mainWindow: BrowserWindow | null = null;
let mainWindowTrustedRendererUrl: string | null = null;
let pendingKaigiHashRoute: string | null = extractKaigiDeepLinkFromArgv(
  process.argv,
);
// Latest `iroha://connect?...` pairing link, held until the renderer's
// IrohaConnect surface takes it. Only the newest link is kept.
let pendingIrohaConnectUri: string | null = extractIrohaConnectDeepLinkFromArgv(
  process.argv,
);
const devProfileSuffix = createHash("sha1")
  .update(process.cwd())
  .digest("hex")
  .slice(0, 10);

protocol.registerSchemesAsPrivileged([
  {
    scheme: RENDERER_PROTOCOL_SCHEME,
    privileges: RENDERER_PROTOCOL_PRIVILEGES,
  },
]);

if (!app.isPackaged) {
  const scopedUserDataPath = join(
    app.getPath("appData"),
    `${app.getName()}-dev-${devProfileSuffix}`,
  );
  app.setPath("userData", scopedUserDataPath);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

const formatHashRoute = (hashRoute: string) => `#${hashRoute}`;

const isWindowAtTrustedRendererEntry = (window: BrowserWindow): boolean => {
  try {
    return Boolean(
      window === mainWindow &&
        !window.isDestroyed() &&
        mainWindowTrustedRendererUrl &&
        isTrustedRendererNavigationUrl(
          window.webContents.getURL(),
          mainWindowTrustedRendererUrl,
        ),
    );
  } catch {
    return false;
  }
};

const flushPendingKaigiHashRoute = async (window: BrowserWindow | null) => {
  if (
    !window ||
    !isWindowAtTrustedRendererEntry(window) ||
    !pendingKaigiHashRoute
  ) {
    return;
  }
  const hashRoute = pendingKaigiHashRoute;
  pendingKaigiHashRoute = null;
  try {
    await window.webContents.executeJavaScript(
      `window.location.hash = ${JSON.stringify(formatHashRoute(hashRoute))};`,
    );
  } catch (_error) {
    pendingKaigiHashRoute ??= hashRoute;
  }
};

const queueKaigiHashRoute = (hashRoute: string | null) => {
  if (!hashRoute) {
    return;
  }
  pendingKaigiHashRoute = hashRoute;
  const window = mainWindow;
  if (!window || window.isDestroyed()) {
    return;
  }
  if (window.isMinimized()) {
    window.restore();
  }
  window.focus();
  if (!window.webContents.isLoadingMainFrame()) {
    void flushPendingKaigiHashRoute(window);
  }
};

const focusMainWindow = (window: BrowserWindow) => {
  if (window.isMinimized()) {
    window.restore();
  }
  window.focus();
};

const queueIrohaConnectDeepLink = (uri: string | null) => {
  if (!uri) {
    return;
  }
  pendingIrohaConnectUri = uri;
  const window = mainWindow;
  if (!window || window.isDestroyed()) {
    return;
  }
  focusMainWindow(window);
  if (!window.webContents.isLoadingMainFrame()) {
    window.webContents.send(IROHA_CONNECT_DEEP_LINK_AVAILABLE_CHANNEL);
  }
};

const handleWalletDeepLink = (url: string) => {
  const link = parseWalletDeepLink(url);
  if (link?.kind === "kaigi") {
    queueKaigiHashRoute(link.hashRoute);
  } else if (link?.kind === "connect") {
    queueIrohaConnectDeepLink(link.uri);
  }
};

const registerIrohaProtocol = () => {
  if (process.defaultApp && process.argv.length >= 2) {
    app.setAsDefaultProtocolClient("iroha", process.execPath, [
      process.argv[1]!,
    ]);
    return;
  }
  app.setAsDefaultProtocolClient("iroha");
};

const registerRendererProtocol = () => {
  const rendererRoot = join(__dirname, "../renderer");
  protocol.handle(RENDERER_PROTOCOL_SCHEME, async (request) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405 });
    }
    try {
      const asset = await readRendererProtocolAsset({
        requestUrl: request.url,
        rendererRoot,
      });
      const body =
        request.method === "HEAD" ? null : Uint8Array.from(asset.bytes).buffer;
      return new Response(body, {
        status: 200,
        headers: {
          "Content-Type": asset.contentType,
          ...rendererSecurityHeadersForDestination(
            request.destination || request.headers.get("Sec-Fetch-Dest") || "",
          ),
        },
      });
    } catch {
      return new Response("Invalid renderer asset path", { status: 400 });
    }
  });
};

app.on("second-instance", (_event, argv) => {
  queueKaigiHashRoute(extractKaigiDeepLinkFromArgv(argv));
  queueIrohaConnectDeepLink(extractIrohaConnectDeepLinkFromArgv(argv));
});

app.on("open-url", (event, url) => {
  event.preventDefault();
  handleWalletDeepLink(url);
});

const createWindow = () => {
  const trustedRendererUrl = getTrustedRendererUrl();
  const window = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 1024,
    minHeight: 720,
    backgroundColor: "#101418",
    titleBarStyle: isMac ? "hidden" : "default",
    webPreferences: {
      preload: join(__dirname, "../preload/preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // Keep browser security on; preload bridges Torii/Nexus traffic over Node HTTP.
      webSecurity: true,
    },
  });
  // Keep WebRTC on the OS default route so Chromium does not probe AWDL/link-local
  // interfaces that routinely time out on macOS during Kaigi STUN gathering.
  window.webContents.setWebRTCIPHandlingPolicy(WEBRTC_IP_HANDLING_POLICY);
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalNavigationUrl(url)) {
      void shell.openExternal(url).catch(() => undefined);
    }
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, targetUrl) => {
    if (!isTrustedRendererNavigationUrl(targetUrl, trustedRendererUrl)) {
      event.preventDefault();
    }
  });
  window.webContents.on("will-redirect", (event, targetUrl) => {
    if (!isTrustedRendererNavigationUrl(targetUrl, trustedRendererUrl)) {
      event.preventDefault();
    }
  });
  window.webContents.on("did-finish-load", () => {
    void flushPendingKaigiHashRoute(window);
    if (pendingIrohaConnectUri) {
      window.webContents.send(IROHA_CONNECT_DEEP_LINK_AVAILABLE_CHANNEL);
    }
  });
  window.on("closed", () => {
    if (mainWindow === window) {
      mainWindow = null;
      mainWindowTrustedRendererUrl = null;
    }
  });

  mainWindow = window;
  mainWindowTrustedRendererUrl = trustedRendererUrl;
  window.loadURL(trustedRendererUrl);
  return window;
};

const networkIdentityPins = new NetworkIdentityPinStore(
  app.getPath("userData"),
);

const vpnRuntime = new VpnRuntime({
  userDataPath: app.getPath("userData"),
  resolveNetworkId: async (input) =>
    NetworkId.parse(
      await resolvePinnedNetworkIdInMain(
        networkIdentityPins,
        input,
        (toriiUrl) => discoverEndpointNetworkIdentity(toriiUrl),
      ),
    ),
  helperVersion: `embedded-${app.getVersion()}`,
  isPackaged: app.isPackaged,
  resourcesPath: process.resourcesPath,
});
const secureVault = new SecureVault(app.getPath("userData"));
const governanceValidationFeeFinalityStore =
  new GovernanceValidationFeeFinalityStore(app.getPath("userData"));

let quittingForVpnShutdown = false;

const assertTrustedMainFrameIpcEvent = (event: IpcMainInvokeEvent): void => {
  assertTrustedMainFrameIpcSender({
    owner: BrowserWindow.fromWebContents(event.sender),
    mainWindow,
    senderFrame: event.senderFrame,
    mainFrame: event.sender.mainFrame,
    trustedRendererUrl: mainWindowTrustedRendererUrl ?? "",
  });
};

const assertNoIpcArguments = (
  values: readonly unknown[],
  label: string,
): void => {
  if (values.length !== 0) {
    throw new Error(`${label} does not accept arguments.`);
  }
};

const registerVpnHandlers = () => {
  ipcMain.handle("vpn:getAvailability", (event, input) => {
    assertTrustedMainFrameIpcEvent(event);
    return vpnRuntime.getAvailability(input);
  });
  ipcMain.handle("vpn:getProfile", (event, input) => {
    assertTrustedMainFrameIpcEvent(event);
    return vpnRuntime.getProfile(input);
  });
  ipcMain.handle("vpn:getStatus", (event, input) => {
    assertTrustedMainFrameIpcEvent(event);
    return vpnRuntime.getStatus(input);
  });
  ipcMain.handle("vpn:connect", (event, input) => {
    assertTrustedMainFrameIpcEvent(event);
    return vpnRuntime.connect(input);
  });
  ipcMain.handle("vpn:disconnect", (event, input) => {
    assertTrustedMainFrameIpcEvent(event);
    return vpnRuntime.disconnect(input);
  });
  ipcMain.handle("vpn:disconnectLocal", (event, ...args: unknown[]) => {
    assertTrustedMainFrameIpcEvent(event);
    assertNoIpcArguments(args, "Local VPN disconnect");
    return vpnRuntime.disconnectLocal();
  });
  ipcMain.handle("vpn:repair", (event, ...args: unknown[]) => {
    assertTrustedMainFrameIpcEvent(event);
    assertNoIpcArguments(args, "VPN repair");
    return vpnRuntime.repair();
  });
  ipcMain.handle("vpn:listReceipts", (event, input) => {
    assertTrustedMainFrameIpcEvent(event);
    return vpnRuntime.listReceipts(input);
  });
};

const registerVaultHandlers = () => {
  ipcMain.handle("vault:isAvailable", (event, ...args: unknown[]) => {
    assertTrustedMainFrameIpcEvent(event);
    assertNoIpcArguments(args, "Secure vault availability");
    return secureVault.isAvailable();
  });
  ipcMain.handle("vault:storeAccountSecret", (event, input) => {
    assertTrustedMainFrameIpcEvent(event);
    return secureVault.storeAccountSecret(
      requireFirstReleaseIpcInputObject(input, {
        label: "Secure vault account-secret IPC input",
        required: ["accountId", "privateKeyHex", "signingAlgorithm"],
      }) as {
        accountId: string;
        privateKeyHex: string;
        signingAlgorithm: string;
      },
    );
  });
  ipcMain.handle("vault:getAccountSecretMaterial", (event, input) => {
    assertTrustedMainFrameIpcEvent(event);
    const exactInput = requireFirstReleaseIpcInputObject<{
      accountId: string;
    }>(input, {
      label: "Secure vault account-secret read IPC input",
      required: ["accountId"],
    });
    return secureVault.getAccountSecretMaterial(exactInput.accountId);
  });
  ipcMain.handle("vault:listAccountSecretFlags", (event, input) => {
    assertTrustedMainFrameIpcEvent(event);
    const exactInput = requireFirstReleaseIpcInputObject<{
      accountIds: string[];
    }>(input, {
      label: "Secure vault account-secret flags IPC input",
      required: ["accountIds"],
    });
    return secureVault.listAccountSecretFlags(exactInput.accountIds);
  });
  ipcMain.handle("vault:storeReceiveKeys", async (event, input) => {
    assertTrustedMainFrameIpcEvent(event);
    const exactInput = requireFirstReleaseIpcInputObject<{
      records: ConfidentialReceiveKeyRecord[];
    }>(input, {
      label: "Secure vault receive-key batch IPC input",
      required: ["records"],
    });
    const records = requireFirstReleaseInputArray(
      exactInput.records,
      "Secure vault receive-key batch IPC records",
      SECURE_VAULT_MAX_RECEIVE_KEY_BATCH,
    );
    await secureVault.storeReceiveKeys(
      records as readonly ConfidentialReceiveKeyRecord[],
    );
    return { stored: records.length };
  });
  ipcMain.handle("vault:listReceiveKeysForAccount", (event, input) => {
    assertTrustedMainFrameIpcEvent(event);
    const exactInput = requireFirstReleaseIpcInputObject<{
      accountId: string;
    }>(input, {
      label: "Secure vault receive-key list IPC input",
      required: ["accountId"],
    });
    return secureVault.listReceiveKeysForAccount(exactInput.accountId);
  });
};

const registerGovernanceRuntimeConfigHandler = () => {
  ipcMain.handle(
    GOVERNANCE_RUNTIME_CONFIG_IPC_CHANNEL,
    (event, ...args: unknown[]) => {
      assertTrustedMainFrameIpcEvent(event);
      assertNoIpcArguments(args, "Governance runtime configuration");
      return loadGovernanceRuntimeConfig({
        userDataPath: app.getPath("userData"),
      });
    },
  );
};

const registerGovernanceValidationFeePolicyHandler = () => {
  ipcMain.handle(
    GOVERNANCE_VALIDATION_FEE_POLICY_IPC_CHANNEL,
    (event, requestPayload: unknown) => {
      const owner = BrowserWindow.fromWebContents(event.sender);
      assertGovernanceValidationFeeTrustedSender({
        ownerMatchesMainWindow: Boolean(owner && owner === mainWindow),
        ownerDestroyed: !owner || owner.isDestroyed(),
        senderFrame: event.senderFrame,
        mainFrame: event.sender.mainFrame,
        trustedRendererUrl: mainWindowTrustedRendererUrl ?? "",
        requestPayload,
      });
      const runtimeConfig = loadGovernanceRuntimeConfig({
        userDataPath: app.getPath("userData"),
      });
      return fetchGovernanceValidationFeePolicyInMain({
        runtimeConfig,
        finalityStore: governanceValidationFeeFinalityStore,
        fetcher: nodeFetch,
      });
    },
  );
};

const MAX_CONNECT_REVIEW_DIALOG_LINES = 400;

const confirmationText = (value: unknown, maxLength = 512) =>
  Array.from(String(value ?? ""))
    .map((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint < 32 || codePoint === 127 ? " " : character;
    })
    .join("")
    .trim()
    .slice(0, maxLength);

const registerNetworkIdentityHandlers = () => {
  ipcMain.handle(NETWORK_IDENTITY_PIN_READ_CHANNEL, (event, input) => {
    assertTrustedMainFrameIpcEvent(event);
    const { toriiUrl } = requireFirstReleaseIpcInputObject<{
      toriiUrl: string;
    }>(input, {
      label: "Network identity pin read input",
      required: ["toriiUrl"],
    });
    return networkIdentityPins.read(normalizeEndpointUrl(toriiUrl));
  });
  ipcMain.handle(
    NETWORK_IDENTITY_PIN_FIRST_USE_CHANNEL,
    async (event, input) => {
      assertTrustedMainFrameIpcEvent(event);
      const exact = requireFirstReleaseIpcInputObject<{
        toriiUrl: string;
        networkId: string;
        networkPrefix: number;
      }>(input, {
        label: "Network identity first-use pin input",
        required: ["toriiUrl", "networkId", "networkPrefix"],
      });
      const toriiUrl = normalizeEndpointUrl(exact.toriiUrl);
      const networkId = parseNetworkIdLiteral(exact.networkId);
      const networkPrefix = normalizeNetworkPrefixValue(exact.networkPrefix);
      // Re-derive independently: the main process pins only what the endpoint
      // itself reports through both public identity sources.
      const discovery = await discoverEndpointNetworkIdentity(toriiUrl);
      if (
        discovery.status !== "verified" ||
        discovery.identity.networkId !== networkId ||
        discovery.identity.networkPrefix !== networkPrefix
      ) {
        throw new Error(
          "The endpoint network identity changed while it was being pinned. Check the endpoint again.",
        );
      }
      return networkIdentityPins.pinFirstUse(toriiUrl, discovery.identity);
    },
  );
  ipcMain.handle(
    NETWORK_IDENTITY_CONFIRM_CHANGE_CHANNEL,
    async (event, input) => {
      assertTrustedMainFrameIpcEvent(event);
      const owner = BrowserWindow.fromWebContents(event.sender);
      const exact = requireFirstReleaseIpcInputObject<{
        toriiUrl: string;
        networkId: string;
      }>(input, {
        label: "Network identity confirmation input",
        required: ["toriiUrl", "networkId"],
      });
      if (!owner) {
        return null;
      }
      const toriiUrl = normalizeEndpointUrl(exact.toriiUrl);
      const networkId = parseNetworkIdLiteral(exact.networkId);
      const discovery = await discoverEndpointNetworkIdentity(toriiUrl);
      if (
        discovery.status !== "verified" ||
        discovery.identity.networkId !== networkId
      ) {
        throw new Error(
          "The endpoint does not currently report this network identity through both public sources.",
        );
      }
      const current = networkIdentityPins.read(toriiUrl);
      if (current?.networkId === networkId) {
        return current;
      }
      const result = await dialog.showMessageBox(owner, {
        type: "warning",
        title: "Network identity changed",
        message: "Trust the new network identity for this endpoint?",
        detail: [
          `Endpoint: ${confirmationText(toriiUrl)}`,
          `Previously trusted: ${confirmationText(current?.networkId ?? "none")}`,
          `Now reported: ${confirmationText(networkId)}`,
          `Network prefix: ${discovery.identity.networkPrefix}`,
          "",
          "Both /v1/accounts/capabilities and the genesis block report the new identity. Approve only if you expect this network to have been reset. Approving re-enables signing for the new network; balances and history from the old network will not carry over.",
        ].join("\n"),
        buttons: ["Keep blocked", "Trust new identity"],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      });
      if (result.response !== 1) {
        return null;
      }
      return networkIdentityPins.replaceConfirmed(toriiUrl, discovery.identity);
    },
  );
};

const registerIrohaConnectDeepLinkHandler = () => {
  ipcMain.handle(
    IROHA_CONNECT_TAKE_DEEP_LINK_CHANNEL,
    (event, ...args: unknown[]) => {
      assertTrustedMainFrameIpcEvent(event);
      assertNoIpcArguments(args, "IrohaConnect deep-link take");
      const uri = pendingIrohaConnectUri;
      pendingIrohaConnectUri = null;
      return uri;
    },
  );
};

const registerIrohaConnectConfirmationHandler = () => {
  ipcMain.handle(
    IROHA_CONNECT_CONFIRMATION_CHANNEL,
    async (event, input: unknown) => {
      assertTrustedMainFrameIpcEvent(event);
      const owner = BrowserWindow.fromWebContents(event.sender);
      if (!owner || !isIrohaConnectConfirmation(input)) {
        return false;
      }
      const requestKind =
        input.kind === "session"
          ? "Connect this app to your wallet?"
          : input.kind === "sign_request_tx"
            ? "Sign this IrohaConnect transaction?"
            : "Sign this IrohaConnect message?";
      const detail = [
        `Account: ${confirmationText(input.accountId)}`,
        `Session: ${confirmationText(input.sid)}`,
        `Endpoint: ${confirmationText(input.toriiUrl)}`,
        `Network ID: ${confirmationText(input.networkId)}`,
        `Network prefix: ${input.networkPrefix}`,
      ];
      if (input.kind === "session") {
        detail.push(
          `Methods: ${confirmationText(input.permissions?.methods.join(", ") || "none")}`,
          `Raw-signing domains: ${confirmationText(input.permissions?.resources?.join(", ") || (input.permissions?.resources === null ? "unrestricted" : "none"))}`,
        );
      } else if (input.kind === "sign_request_tx") {
        // Every decoded instruction is listed; the wallet signs only the
        // payload hash shown here.
        detail.push(
          "",
          ...formatConnectTransactionReviewLines(input.review)
            .slice(0, MAX_CONNECT_REVIEW_DIALOG_LINES)
            .map(
              (line) =>
                (/^ */u.exec(line)?.[0] ?? "") + confirmationText(line, 1_024),
            ),
        );
      } else {
        detail.push(
          `Domain: ${confirmationText(input.domainTag)}`,
          `Bytes: ${Number.isSafeInteger(input.byteLength) ? input.byteLength : 0}`,
          `Preview: ${confirmationText(input.payloadPreviewHex, 192)}`,
        );
      }
      const result = await dialog.showMessageBox(owner, {
        type: "warning",
        title: "IrohaConnect wallet approval",
        message: requestKind,
        detail: detail.join("\n"),
        buttons: ["Reject", "Approve"],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      });
      return result.response === 1;
    },
  );
};

app.whenReady().then(() => {
  registerRendererProtocol();
  registerVpnHandlers();
  registerVaultHandlers();
  registerGovernanceRuntimeConfigHandler();
  registerGovernanceValidationFeePolicyHandler();
  registerNetworkIdentityHandlers();
  registerIrohaConnectDeepLinkHandler();
  registerIrohaConnectConfirmationHandler();
  registerMediaPermissionHandlers(session.defaultSession, {
    getRendererUrl: () => mainWindowTrustedRendererUrl ?? undefined,
    getTrustedWebContents: () => mainWindow?.webContents ?? null,
    requestSystemMediaAccess,
    getSystemMediaAccessStatus,
  });
  registerDisplayMediaRequestHandler(session.defaultSession, {
    getSources: () =>
      desktopCapturer.getSources({ types: ["screen", "window"] }),
    getRendererUrl: () => mainWindowTrustedRendererUrl ?? undefined,
    getTrustedMainFrame: () => mainWindow?.webContents.mainFrame ?? null,
  });
  registerIrohaProtocol();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      return;
    }
    queueKaigiHashRoute(pendingKaigiHashRoute);
    queueIrohaConnectDeepLink(pendingIrohaConnectUri);
  });
});

app.on("before-quit", (event) => {
  if (quittingForVpnShutdown) {
    return;
  }
  quittingForVpnShutdown = true;
  event.preventDefault();
  void vpnRuntime
    .shutdown()
    .catch((error) => {
      console.error("Failed to persist VPN runtime state before quit.", error);
    })
    .finally(() => {
      app.exit(0);
    });
});

app.on("window-all-closed", () => {
  if (!isMac) {
    app.quit();
  }
});

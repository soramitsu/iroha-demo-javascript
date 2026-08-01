import {
  app,
  BrowserWindow,
  desktopCapturer,
  dialog,
  ipcMain,
  protocol,
  session,
  systemPreferences,
} from "electron";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import { VpnRuntime } from "./vpnRuntime";
import { SecureVault } from "./secureVault";
import {
  extractKaigiDeepLinkFromArgv,
  parseKaigiDeepLinkToHashRoute,
} from "./deepLink";
import {
  registerDisplayMediaRequestHandler,
  registerMediaPermissionHandlers,
} from "./mediaPermissions";
import {
  RENDERER_PROTOCOL_PRIVILEGES,
  RENDERER_PROTOCOL_SCHEME,
  readRendererProtocolAsset,
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
  GOVERNANCE_PLAIN_REFERENDUM_IPC_CHANNEL,
  GovernancePlainReferendumFinalityStore,
  assertGovernancePlainReferendumTrustedSender,
  fetchGovernancePlainReferendumContract,
  governancePlainReferendumSourcePath,
  loadGovernancePlainReferendumSource,
} from "./governancePlainReferendum";
import { nodeFetch } from "./nodeFetch";
import {
  IROHA_CONNECT_CONFIRMATION_CHANNEL,
  type IrohaConnectConfirmation,
} from "./irohaConnectBoundary";
import {
  SORACLOUD_SETTLEMENT_CONFIRMATION_CHANNEL,
  isSoraCloudHfSettlementConfirmation,
} from "./soraCloudSettlementBoundary";
import { installGlobalIrohaJsNativeBinding } from "./irohaJsNativeDir";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

installGlobalIrohaJsNativeBinding(import.meta.url);

const isMac = process.platform === "darwin";
const WEBRTC_IP_HANDLING_POLICY = "default_public_and_private_interfaces";
const DEFAULT_SCCP_PROVER_V8_HEAP_MB = 8192;
const MIN_SCCP_PROVER_V8_HEAP_MB = 1024;
const MAX_SCCP_PROVER_V8_HEAP_MB = 32768;
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
let pendingKaigiHashRoute: string | null = extractKaigiDeepLinkFromArgv(
  process.argv,
);
const devProfileSuffix = createHash("sha1")
  .update(process.cwd())
  .digest("hex")
  .slice(0, 10);

const configureSccpProverHeap = () => {
  const rawValue =
    process.env["SCCP_BSC_PROVER_V8_HEAP_MB"] ??
    process.env["VITE_SCCP_BSC_PROVER_V8_HEAP_MB"] ??
    String(DEFAULT_SCCP_PROVER_V8_HEAP_MB);
  const normalizedValue = String(rawValue).trim().toLowerCase();
  if (
    !normalizedValue ||
    normalizedValue === "0" ||
    normalizedValue === "false" ||
    normalizedValue === "off"
  ) {
    return;
  }
  const parsed = Number(normalizedValue);
  const heapMb = Number.isFinite(parsed)
    ? Math.min(
        MAX_SCCP_PROVER_V8_HEAP_MB,
        Math.max(MIN_SCCP_PROVER_V8_HEAP_MB, Math.trunc(parsed)),
      )
    : DEFAULT_SCCP_PROVER_V8_HEAP_MB;
  app.commandLine.appendSwitch("js-flags", `--max-old-space-size=${heapMb}`);
};

configureSccpProverHeap();

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

const flushPendingKaigiHashRoute = async (window: BrowserWindow | null) => {
  if (!window || window.isDestroyed() || !pendingKaigiHashRoute) {
    return;
  }
  const hashRoute = pendingKaigiHashRoute;
  pendingKaigiHashRoute = null;
  try {
    await window.webContents.executeJavaScript(
      `window.location.hash = ${JSON.stringify(formatHashRoute(hashRoute))};`,
      true,
    );
  } catch (_error) {
    pendingKaigiHashRoute = hashRoute;
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

const registerKaigiProtocol = () => {
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
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch {
      return new Response("Invalid renderer asset path", { status: 400 });
    }
  });
};

app.on("second-instance", (_event, argv) => {
  queueKaigiHashRoute(extractKaigiDeepLinkFromArgv(argv));
});

app.on("open-url", (event, url) => {
  event.preventDefault();
  queueKaigiHashRoute(parseKaigiDeepLinkToHashRoute(url));
});

const createWindow = () => {
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
  window.webContents.on("did-finish-load", () => {
    void flushPendingKaigiHashRoute(window);
  });
  window.on("closed", () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });

  window.loadURL(getTrustedRendererUrl());
  mainWindow = window;
  return window;
};

const vpnRuntime = new VpnRuntime({
  userDataPath: app.getPath("userData"),
  helperVersion: `embedded-${app.getVersion()}`,
});
const secureVault = new SecureVault(app.getPath("userData"));
const governanceValidationFeeFinalityStore =
  new GovernanceValidationFeeFinalityStore(app.getPath("userData"));
const governancePlainReferendumFinalityStore =
  new GovernancePlainReferendumFinalityStore(app.getPath("userData"));

let quittingForVpnShutdown = false;

const registerVpnHandlers = () => {
  ipcMain.handle("vpn:getAvailability", (_event, input) =>
    vpnRuntime.getAvailability(input),
  );
  ipcMain.handle("vpn:getProfile", (_event, input) =>
    vpnRuntime.getProfile(input),
  );
  ipcMain.handle("vpn:getStatus", (_event, input) =>
    vpnRuntime.getStatus(input),
  );
  ipcMain.handle("vpn:connect", (_event, input) => vpnRuntime.connect(input));
  ipcMain.handle("vpn:disconnect", (_event, input) =>
    vpnRuntime.disconnect(input),
  );
  ipcMain.handle("vpn:disconnectLocal", () => vpnRuntime.disconnectLocal());
  ipcMain.handle("vpn:repair", () => vpnRuntime.repair());
  ipcMain.handle("vpn:listReceipts", (_event, input) =>
    vpnRuntime.listReceipts(input),
  );
};

const registerVaultHandlers = () => {
  ipcMain.handle("vault:isAvailable", () => secureVault.isAvailable());
  ipcMain.handle("vault:storeAccountSecret", (_event, input) =>
    secureVault.storeAccountSecret(input),
  );
  ipcMain.handle("vault:getAccountSecret", (_event, input) =>
    secureVault.getAccountSecret(input.accountId),
  );
  ipcMain.handle("vault:getAccountSecretMaterial", (_event, input) =>
    secureVault.getAccountSecretMaterial(input.accountId),
  );
  ipcMain.handle("vault:listAccountSecretFlags", (_event, input) =>
    secureVault.listAccountSecretFlags(
      Array.isArray(input?.accountIds) ? input.accountIds : [],
    ),
  );
  ipcMain.handle("vault:storeReceiveKey", (_event, input) =>
    secureVault.storeReceiveKey(input),
  );
  ipcMain.handle("vault:getReceiveKey", (_event, input) =>
    secureVault.getReceiveKey(input.keyId),
  );
  ipcMain.handle("vault:listReceiveKeysForAccount", (_event, input) =>
    secureVault.listReceiveKeysForAccount(input.accountId),
  );
};

const registerGovernanceRuntimeConfigHandler = () => {
  ipcMain.handle(GOVERNANCE_RUNTIME_CONFIG_IPC_CHANNEL, () =>
    loadGovernanceRuntimeConfig({
      userDataPath: app.getPath("userData"),
    }),
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
        trustedRendererUrl: getTrustedRendererUrl(),
        requestPayload,
      });
      const runtimeConfig = loadGovernanceRuntimeConfig({
        userDataPath: app.getPath("userData"),
      });
      return fetchGovernanceValidationFeePolicyInMain({
        runtimeConfig,
        finalityStore: governanceValidationFeeFinalityStore,
      });
    },
  );
};

const registerGovernancePlainReferendumHandler = () => {
  ipcMain.handle(
    GOVERNANCE_PLAIN_REFERENDUM_IPC_CHANNEL,
    (event, observedIdentity: unknown) => {
      const owner = BrowserWindow.fromWebContents(event.sender);
      assertGovernancePlainReferendumTrustedSender({
        ownerMatchesMainWindow: Boolean(owner && owner === mainWindow),
        ownerDestroyed: !owner || owner.isDestroyed(),
        senderFrame: event.senderFrame,
        mainFrame: event.sender.mainFrame,
        trustedRendererUrl: getTrustedRendererUrl(),
      });
      const sourcePath = governancePlainReferendumSourcePath({
        isPackaged: app.isPackaged,
        appPath: app.getAppPath(),
        resourcesPath: process.resourcesPath,
      });
      return fetchGovernancePlainReferendumContract({
        source: loadGovernancePlainReferendumSource(sourcePath),
        observedIdentity,
        finalityStore: governancePlainReferendumFinalityStore,
        fetcher: nodeFetch,
      });
    },
  );
};

const confirmationText = (value: unknown, maxLength = 512) =>
  Array.from(String(value ?? ""))
    .map((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint < 32 || codePoint === 127 ? " " : character;
    })
    .join("")
    .trim()
    .slice(0, maxLength);

const isIrohaConnectConfirmation = (
  value: unknown,
): value is IrohaConnectConfirmation => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const kind = (value as { kind?: unknown }).kind;
  return (
    kind === "session" ||
    kind === "sign_request_raw" ||
    kind === "sign_request_tx"
  );
};

const registerIrohaConnectConfirmationHandler = () => {
  ipcMain.handle(
    IROHA_CONNECT_CONFIRMATION_CHANNEL,
    async (event, input: unknown) => {
      const owner = BrowserWindow.fromWebContents(event.sender);
      if (
        !owner ||
        owner !== mainWindow ||
        owner.isDestroyed() ||
        !isIrohaConnectConfirmation(input)
      ) {
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
        `Chain: ${confirmationText(input.chainId)}`,
      ];
      if (input.kind === "session") {
        detail.push(
          `Methods: ${confirmationText(input.permissions?.methods.join(", ") || "none")}`,
          `Resources: ${confirmationText(input.permissions?.resources?.join(", ") || (input.permissions?.resources === null ? "unrestricted" : "none"))}`,
        );
      } else {
        detail.push(
          `Domain: ${confirmationText(input.domainTag || "not applicable")}`,
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

const registerSoraCloudSettlementConfirmationHandler = () => {
  ipcMain.handle(
    SORACLOUD_SETTLEMENT_CONFIRMATION_CHANNEL,
    async (event, input: unknown) => {
      const owner = BrowserWindow.fromWebContents(event.sender);
      if (
        !owner ||
        owner !== mainWindow ||
        owner.isDestroyed() ||
        !isSoraCloudHfSettlementConfirmation(input)
      ) {
        return false;
      }
      const profile = input.resourceProfile;
      const result = await dialog.showMessageBox(owner, {
        type: "warning",
        title: "SoraCloud settlement approval",
        message: "Approve this SoraCloud lease and its maximum compute charge?",
        detail: [
          `Account: ${confirmationText(input.accountId)}`,
          `Endpoint: ${confirmationText(input.toriiUrl)}`,
          `Model: ${confirmationText(`${input.repoId}@${input.resolvedRevision}`)}`,
          `Service: ${confirmationText(input.serviceName)}`,
          `Storage: ${confirmationText(input.storageClass)} for ${input.leaseTermMs} ms`,
          `Settlement asset: ${confirmationText(input.leaseAssetDefinitionId)}`,
          `Storage base fee: ${confirmationText(input.storageBaseFee)}`,
          `Maximum compute reservation charge: ${confirmationText(input.maxComputeReservationFee)}`,
          `Profile: ${profile.requiredModelBytes} model bytes, ${profile.diskCacheBytesFloor} disk bytes, ${profile.ramBytesFloor} RAM bytes, ${profile.vramBytesFloor} VRAM bytes`,
          `Runtime: ${confirmationText(profile.backendFamily)} / ${confirmationText(profile.modelFormat)}`,
          "The actual compute charge may be lower and can never exceed the reviewed maximum.",
        ].join("\n"),
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
  registerGovernancePlainReferendumHandler();
  registerIrohaConnectConfirmationHandler();
  registerSoraCloudSettlementConfirmationHandler();
  registerMediaPermissionHandlers(
    session.defaultSession,
    getTrustedRendererUrl,
    requestSystemMediaAccess,
    getSystemMediaAccessStatus,
  );
  registerDisplayMediaRequestHandler(
    session.defaultSession,
    () => desktopCapturer.getSources({ types: ["screen", "window"] }),
    getTrustedRendererUrl,
  );
  registerKaigiProtocol();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      return;
    }
    queueKaigiHashRoute(pendingKaigiHashRoute);
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

import {
  app,
  BrowserWindow,
  desktopCapturer,
  ipcMain,
  session,
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const isMac = process.platform === "darwin";
const WEBRTC_IP_HANDLING_POLICY = "default_public_and_private_interfaces";
let mainWindow: BrowserWindow | null = null;
let pendingKaigiHashRoute: string | null = extractKaigiDeepLinkFromArgv(
  process.argv,
);
const devProfileSuffix = createHash("sha1")
  .update(process.cwd())
  .digest("hex")
  .slice(0, 10);

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

  const rendererUrl = process.env["ELECTRON_RENDERER_URL"];
  if (rendererUrl) {
    window.loadURL(rendererUrl);
  } else {
    window.loadFile(join(__dirname, "../renderer/index.html"));
  }
  mainWindow = window;
  return window;
};

const vpnRuntime = new VpnRuntime({
  userDataPath: app.getPath("userData"),
  helperVersion: `embedded-${app.getVersion()}`,
});
const secureVault = new SecureVault(app.getPath("userData"));

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
  ipcMain.handle("vpn:repair", (_event, input) => vpnRuntime.repair(input));
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

app.whenReady().then(() => {
  registerVpnHandlers();
  registerVaultHandlers();
  registerMediaPermissionHandlers(session.defaultSession);
  registerDisplayMediaRequestHandler(session.defaultSession, () =>
    desktopCapturer.getSources({ types: ["screen", "window"] }),
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

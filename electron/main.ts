import { app, BrowserWindow, ipcMain } from "electron";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import { VpnRuntime } from "./vpnRuntime";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const isMac = process.platform === "darwin";
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

const createWindow = () => {
  const window = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 1024,
    minHeight: 720,
    backgroundColor: "#101418",
    titleBarStyle: isMac ? "hiddenInset" : "default",
    webPreferences: {
      preload: join(__dirname, "../preload/preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // Keep browser security on; preload bridges Torii/Nexus traffic over Node HTTP.
      webSecurity: true,
    },
  });

  const rendererUrl = process.env["ELECTRON_RENDERER_URL"];
  if (rendererUrl) {
    window.loadURL(rendererUrl);
  } else {
    window.loadFile(join(__dirname, "../renderer/index.html"));
  }
};

const vpnRuntime = new VpnRuntime({
  userDataPath: app.getPath("userData"),
  helperVersion: `embedded-${app.getVersion()}`,
});

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

app.whenReady().then(() => {
  registerVpnHandlers();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
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

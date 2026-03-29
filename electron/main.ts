import { app, BrowserWindow } from "electron";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const isMac = process.platform === "darwin";
const WEBRTC_IP_HANDLING_POLICY = "default_public_and_private_interfaces";
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
  // Keep WebRTC on the OS default route so Chromium does not probe AWDL/link-local
  // interfaces that routinely time out on macOS during Kaigi STUN gathering.
  window.webContents.setWebRTCIPHandlingPolicy(WEBRTC_IP_HANDLING_POLICY);

  const rendererUrl = process.env["ELECTRON_RENDERER_URL"];
  if (rendererUrl) {
    window.loadURL(rendererUrl);
  } else {
    window.loadFile(join(__dirname, "../renderer/index.html"));
  }
};

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (!isMac) {
    app.quit();
  }
});

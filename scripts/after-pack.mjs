import { cpSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export default async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") {
    return;
  }

  const appBundlePath = join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
  );
  const controllerAppSource = join(
    context.packager.projectDir,
    "dist-native",
    "vpn",
    "darwin",
    "SoraVpnController.app",
  );
  const controllerBundleSource = join(
    context.packager.projectDir,
    "dist-native",
    "vpn",
    "darwin",
    "SoraVpnController.bundle",
  );
  const controllerSource = existsSync(controllerAppSource)
    ? controllerAppSource
    : controllerBundleSource;
  if (!existsSync(controllerSource)) {
    throw new Error(
      `Expected macOS VPN controller app at ${controllerAppSource} or legacy bundle at ${controllerBundleSource}. Run npm run build:vpn:macos-controller first.`,
    );
  }

  const helpersDir = join(appBundlePath, "Contents", "Helpers");
  mkdirSync(helpersDir, { recursive: true });
  const controllerName = controllerSource.endsWith(".app")
    ? "SoraVpnController.app"
    : "SoraVpnController.bundle";
  const controllerTarget = join(helpersDir, controllerName);
  cpSync(controllerSource, controllerTarget, { recursive: true });
}

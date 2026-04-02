import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  BundledVpnController,
  getMacVpnProvisioningMessage,
  hasRequiredMacVpnEntitlements,
} from "../electron/vpnController";

describe("BundledVpnController", () => {
  it("detects whether macOS VPN entitlements are present", () => {
    expect(
      hasRequiredMacVpnEntitlements(`
        <key>com.apple.developer.system-extension.install</key>
        <key>com.apple.developer.networking.networkextension</key>
      `),
    ).toBe(true);
    expect(
      hasRequiredMacVpnEntitlements(`
        <key>com.apple.security.app-sandbox</key>
      `),
    ).toBe(false);
  });

  it("only blocks macOS provisioning when inspectable Apple entitlements are missing required VPN capabilities", () => {
    expect(
      getMacVpnProvisioningMessage({
        entitlements: "",
        signatureDetails: `
          Signature=adhoc
          TeamIdentifier=not set
        `,
      }),
    ).toContain("ad hoc-signed");
    expect(
      getMacVpnProvisioningMessage({
        entitlements: `
          Executable=/tmp/SoraVpnController.app/Contents/MacOS/sora-vpn-controller
          warning: Specifying ':' in the path is deprecated and will not work in a future release
        `,
        signatureDetails: `
          TeamIdentifier=6A4BK72ZFV
          Signature=Apple Development
        `,
      }),
    ).toBeNull();
    expect(
      getMacVpnProvisioningMessage({
        entitlements: `
          <key>com.apple.security.app-sandbox</key>
        `,
      }),
    ).toContain("missing Apple system-extension or NetworkExtension entitlements");
    expect(
      getMacVpnProvisioningMessage({
        entitlements: `
          <key>com.apple.developer.system-extension.install</key>
          <key>com.apple.developer.networking.networkextension</key>
        `,
      }),
    ).toBeNull();
  });

  it("reports a missing controller cleanly when no bundled binary exists", async () => {
    const controller = new BundledVpnController({
      platform: "darwin",
      env: {
        SORANET_VPN_CONTROLLER: "/tmp/definitely-missing-sora-vpn-controller",
      },
    });

    const status = await controller.refreshCapability();

    expect(status.installed).toBe(false);
    expect(status.active).toBe(false);
    expect(status.controllerKind).toBe("macos-network-extension");
    expect(status.message).toContain("Bundled VPN controller is not installed");
  });

  it("prefers the macOS controller app wrapper when it is staged", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "vpn-controller-"));
    const originalCwd = process.cwd();
    const appControllerPath = join(
      tempRoot,
      "dist-native",
      "vpn",
      "darwin",
      "SoraVpnController.app",
      "Contents",
      "MacOS",
      "sora-vpn-controller",
    );
    const bundleControllerPath = join(
      tempRoot,
      "dist-native",
      "vpn",
      "darwin",
      "SoraVpnController.bundle",
      "Contents",
      "MacOS",
      "sora-vpn-controller",
    );

    try {
      mkdirSync(join(appControllerPath, ".."), { recursive: true });
      mkdirSync(join(bundleControllerPath, ".."), { recursive: true });
      writeFileSync(
        appControllerPath,
        `#!/bin/sh
printf '%s' '{"installed":true,"active":false,"controller_kind":"macos-network-extension","controller_path":"${appControllerPath}","version":"1.0.0","repair_required":false,"bytes_in":0,"bytes_out":0,"message":"ready"}'
`,
      );
      writeFileSync(
        bundleControllerPath,
        `#!/bin/sh
printf '%s' '{"installed":true,"active":false,"controller_kind":"macos-network-extension","controller_path":"${bundleControllerPath}","version":"0.9.0","repair_required":false,"bytes_in":0,"bytes_out":0,"message":"bundle"}'
`,
      );
      chmodSync(appControllerPath, 0o755);
      chmodSync(bundleControllerPath, 0o755);
      process.chdir(tempRoot);

      const controller = new BundledVpnController({
        platform: "darwin",
        env: {},
      });

      const status = await controller.refreshCapability();

      expect(status.installed).toBe(true);
      expect(status.controllerPath).toBe(appControllerPath);
      expect(status.message).toBe("ready");
    } finally {
      process.chdir(originalCwd);
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});

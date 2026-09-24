import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
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
        <true/>
        <key>com.apple.developer.networking.networkextension</key>
        <array><string>packet-tunnel-provider-systemextension</string></array>
        <key>com.apple.security.app-sandbox</key>
        <true/>
        <key>com.apple.security.application-groups</key>
        <array><string>group.org.sora.wallet.demo.vpn</string></array>
      `),
    ).toBe(true);
    expect(
      hasRequiredMacVpnEntitlements(`
        <key>com.apple.security.app-sandbox</key>
      `),
    ).toBe(false);
    expect(
      hasRequiredMacVpnEntitlements(`
        <key>com.apple.developer.system-extension.install</key>
        <true/>
        <key>com.apple.developer.networking.networkextension</key>
        <array><string>packet-tunnel-provider</string></array>
        <key>com.apple.security.app-sandbox</key>
        <true/>
        <key>com.apple.security.application-groups</key>
        <array><string>group.org.sora.wallet.demo.vpn</string></array>
      `),
    ).toBe(false);
  });

  it("requires an inspectable Apple team and the exact VPN entitlement set", () => {
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
    ).toContain("exact sandbox, app-group, system-extension");
    expect(
      getMacVpnProvisioningMessage({
        entitlements: `
          <key>com.apple.security.app-sandbox</key>
          <true/>
        `,
        signatureDetails: "TeamIdentifier=6A4BK72ZFV",
      }),
    ).toContain("exact sandbox, app-group, system-extension");
    expect(
      getMacVpnProvisioningMessage({
        entitlements: `
          <key>com.apple.developer.system-extension.install</key>
          <true/>
          <key>com.apple.developer.networking.networkextension</key>
          <array><string>packet-tunnel-provider-systemextension</string></array>
          <key>com.apple.security.app-sandbox</key>
          <true/>
          <key>com.apple.security.application-groups</key>
          <array><string>group.org.sora.wallet.demo.vpn</string></array>
        `,
        signatureDetails: "TeamIdentifier=6A4BK72ZFV",
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

  it("ignores environment and working-directory helpers in packaged mode", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "vpn-controller-boundary-"));
    const untrustedControllerPath = join(tempRoot, "sora-vpn-controller");
    try {
      writeFileSync(untrustedControllerPath, "#!/bin/sh\nexit 0\n");
      chmodSync(untrustedControllerPath, 0o755);
      const controller = new BundledVpnController({
        platform: "linux",
        env: { SORANET_VPN_CONTROLLER: untrustedControllerPath },
        isPackaged: true,
        resourcesPath: join(tempRoot, "trusted-resources"),
        developmentRoot: tempRoot,
      });

      await expect(controller.refreshCapability()).resolves.toMatchObject({
        installed: false,
        controllerPath: null,
      });
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("fails closed when a staged macOS helper cannot pass code-sign verification", async () => {
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
    try {
      mkdirSync(join(appControllerPath, ".."), { recursive: true });
      writeFileSync(
        appControllerPath,
        `#!/bin/sh
printf '%s' '{"installed":true,"active":false,"controller_kind":"macos-network-extension","controller_path":"${appControllerPath}","version":"1.0.0","repair_required":false,"bytes_in":0,"bytes_out":0,"message":"ready"}'
`,
      );
      chmodSync(appControllerPath, 0o755);
      process.chdir(tempRoot);

      const controller = new BundledVpnController({
        platform: "darwin",
        env: {},
      });

      const status = await controller.refreshCapability();

      expect(status.installed).toBe(false);
      expect(status.controllerPath).toBe(realpathSync(appControllerPath));
      expect(status.repairRequired).toBe(true);
      expect(status.message).toContain(
        "signature and entitlement verification failed closed",
      );
    } finally {
      process.chdir(originalCwd);
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("accepts only an exact Linux controller response", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "vpn-controller-linux-"));
    const controllerPath = join(tempRoot, "sora-vpn-controller");
    const canonicalControllerPath =
      realpathSync(tempRoot) + "/sora-vpn-controller";
    try {
      writeFileSync(
        controllerPath,
        `#!/bin/sh
printf '%s' '{"installed":true,"active":false,"controller_kind":"linux-helperd","interface_name":"tun0","network_service":null,"version":"1.0.0","controller_path":"${canonicalControllerPath}","repair_required":false,"bytes_in":0,"bytes_out":0,"message":"ready"}'
`,
      );
      chmodSync(controllerPath, 0o755);
      const controller = new BundledVpnController({
        platform: "linux",
        env: { SORANET_VPN_CONTROLLER: controllerPath },
      });

      await expect(controller.refreshCapability()).resolves.toMatchObject({
        installed: true,
        active: false,
        controllerKind: "linux-helperd",
        controllerPath: canonicalControllerPath,
        message: "ready",
      });

      writeFileSync(
        controllerPath,
        `#!/bin/sh
printf '%s' '{"installed":"true","active":false,"controller_kind":"linux-helperd","interface_name":null,"network_service":null,"version":"1.0.0","controller_path":"${canonicalControllerPath}","repair_required":false,"bytes_in":0,"bytes_out":0,"message":"ready","legacy":true}'
`,
      );
      chmodSync(controllerPath, 0o755);

      await expect(controller.refreshCapability()).resolves.toMatchObject({
        installed: false,
        repairRequired: true,
      });
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});

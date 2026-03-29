import { describe, expect, it } from "vitest";
import { BundledVpnController } from "../electron/vpnController";

describe("BundledVpnController", () => {
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
});

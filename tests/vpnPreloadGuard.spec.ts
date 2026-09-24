import { describe, expect, it, vi } from "vitest";
import {
  VPN_PROFILE_UNAVAILABLE_MESSAGE,
  runLocalVpnRepair,
  runVpnConnectAfterProfileCheck,
  runVpnDisconnectWithLocalFallback,
} from "../electron/vpnPreloadGuard";

describe("VPN preload profile guard", () => {
  it("rejects an unavailable profile before vault or controller work", async () => {
    const resolveSigningMaterial = vi.fn();
    const invokeController = vi.fn();

    await expect(
      runVpnConnectAfterProfileCheck({
        loadProfile: vi.fn().mockResolvedValue({ available: false }),
        resolveSigningMaterial,
        invokeController,
      }),
    ).rejects.toThrow(VPN_PROFILE_UNAVAILABLE_MESSAGE);

    expect(resolveSigningMaterial).not.toHaveBeenCalled();
    expect(invokeController).not.toHaveBeenCalled();
  });

  it("does not resolve signing material when the profile check fails", async () => {
    const profileError = new Error("profile request failed");
    const resolveSigningMaterial = vi.fn();
    const invokeController = vi.fn();

    await expect(
      runVpnConnectAfterProfileCheck({
        loadProfile: vi.fn().mockRejectedValue(profileError),
        resolveSigningMaterial,
        invokeController,
      }),
    ).rejects.toBe(profileError);

    expect(resolveSigningMaterial).not.toHaveBeenCalled();
    expect(invokeController).not.toHaveBeenCalled();
  });

  it("resolves the wallet only after an available profile and invokes the controller", async () => {
    const signingMaterial = {
      privateKeyHex: "ab".repeat(32),
      signingAlgorithm: "ed25519",
    };
    const order: string[] = [];
    const result = await runVpnConnectAfterProfileCheck({
      loadProfile: vi.fn(async () => {
        order.push("profile");
        return { available: true };
      }),
      resolveSigningMaterial: vi.fn(async () => {
        order.push("vault");
        return signingMaterial;
      }),
      invokeController: vi.fn(async (material) => {
        order.push("controller");
        expect(material).toBe(signingMaterial);
        return { state: "connected" };
      }),
    });

    expect(result).toEqual({ state: "connected" });
    expect(order).toEqual(["profile", "vault", "controller"]);
  });

  it.each(["endpoint mismatch", "profile unavailable"])(
    "runs local repair without endpoint or vault work when %s",
    async () => {
      const inspectEndpoint = vi.fn();
      const loadProfile = vi.fn();
      const resolveSigningMaterial = vi.fn();
      const invokeController = vi
        .fn()
        .mockResolvedValue({ state: "repair-needed" });

      await expect(runLocalVpnRepair({ invokeController })).resolves.toEqual({
        state: "repair-needed",
      });
      expect(invokeController).toHaveBeenCalledOnce();
      expect(inspectEndpoint).not.toHaveBeenCalled();
      expect(loadProfile).not.toHaveBeenCalled();
      expect(resolveSigningMaterial).not.toHaveBeenCalled();
    },
  );

  it("disconnects locally without resolving credentials when write authorization fails", async () => {
    const invokeAuthenticatedController = vi.fn();
    const invokeLocalController = vi
      .fn()
      .mockResolvedValue({ state: "remote-expiry-pending" });

    await expect(
      runVpnDisconnectWithLocalFallback({
        resolveAuthenticatedInput: vi
          .fn()
          .mockRejectedValue(new Error("endpoint identity unavailable")),
        invokeAuthenticatedController,
        invokeLocalController,
      }),
    ).resolves.toEqual({ state: "remote-expiry-pending" });

    expect(invokeAuthenticatedController).not.toHaveBeenCalled();
    expect(invokeLocalController).toHaveBeenCalledOnce();
  });

  it("falls back to local disconnect when the authenticated context does not own the active tunnel", async () => {
    const invokeLocalController = vi
      .fn()
      .mockResolvedValue({ state: "remote-expiry-pending" });

    await expect(
      runVpnDisconnectWithLocalFallback({
        resolveAuthenticatedInput: vi.fn().mockResolvedValue({ auth: true }),
        invokeAuthenticatedController: vi.fn().mockResolvedValue({
          state: "repair-needed",
          reconcileState: "active-session-context-mismatch",
          systemTunnelActive: true,
        }),
        invokeLocalController,
      }),
    ).resolves.toEqual({ state: "remote-expiry-pending" });

    expect(invokeLocalController).toHaveBeenCalledOnce();
  });
});

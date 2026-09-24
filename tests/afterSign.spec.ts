import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  verifyMacPackageSignatures,
  verifyWindowsPackageAuthenticode,
  type AfterSignRunProcess,
} from "../scripts/after-sign.mjs";

const windowsContext = {
  electronPlatformName: "win32",
  appOutDir: "C:\\release\\win-unpacked",
  packager: { appInfo: { productFilename: "SORA Wallet" } },
};

const regularFileStats = {
  isDirectory: () => false,
  isFile: () => true,
  isSymbolicLink: () => false,
};
const certificateThumbprint = "AB".repeat(20);

describe("Windows native post-sign verification", () => {
  it("does nothing for another platform and rejects unsigned Windows packages", () => {
    const inspectPath = vi.fn();
    const runProcess = vi.fn();

    verifyWindowsPackageAuthenticode(
      { ...windowsContext, electronPlatformName: "darwin" },
      {
        environment: {
          HAS_WIN_SIGNING: "true",
          WIN_EXPECTED_CERT_THUMBPRINT: certificateThumbprint,
        },
        inspectPath,
        runProcess,
      },
    );
    expect(() =>
      verifyWindowsPackageAuthenticode(windowsContext, {
        environment: { HAS_WIN_SIGNING: "false" },
        inspectPath,
        runProcess,
      }),
    ).toThrow("require production Authenticode signing");

    expect(inspectPath).not.toHaveBeenCalled();
    expect(runProcess).not.toHaveBeenCalled();
  });

  it("fails when the packaged native binding is missing", () => {
    expect(() =>
      verifyWindowsPackageAuthenticode(windowsContext, {
        environment: {
          HAS_WIN_SIGNING: "true",
          WIN_EXPECTED_CERT_THUMBPRINT: certificateThumbprint,
        },
        inspectPath: (path) => {
          if (path.endsWith(".node")) {
            throw new Error("missing");
          }
          return regularFileStats;
        },
        runProcess: vi.fn(),
      }),
    ).toThrow("Signed Windows Iroha native binding is missing");
  });

  it.each([
    {
      name: "directory",
      stats: {
        isDirectory: () => true,
        isFile: () => false,
        isSymbolicLink: () => false,
      },
    },
    {
      name: "symlink",
      stats: {
        isDirectory: () => false,
        isFile: () => true,
        isSymbolicLink: () => true,
      },
    },
  ])("rejects a $name at the native binding path", ({ stats }) => {
    expect(() =>
      verifyWindowsPackageAuthenticode(windowsContext, {
        environment: {
          HAS_WIN_SIGNING: "true",
          WIN_EXPECTED_CERT_THUMBPRINT: certificateThumbprint,
        },
        inspectPath: (path) =>
          path.endsWith(".node") ? stats : regularFileStats,
        runProcess: vi.fn(),
      }),
    ).toThrow("must be a regular, non-symlink file");
  });

  it("accepts only a successful PowerShell Authenticode check", () => {
    const inspectPath = vi.fn(() => regularFileStats);
    const runProcess = vi.fn<AfterSignRunProcess>(() => ({ status: 0 }));

    verifyWindowsPackageAuthenticode(windowsContext, {
      environment: {
        HAS_WIN_SIGNING: "true",
        Path: "C:\\Windows\\System32",
        WIN_EXPECTED_CERT_THUMBPRINT: certificateThumbprint.toLowerCase(),
        WIN_CSC_KEY_PASSWORD: "must-not-be-forwarded",
      },
      inspectPath,
      runProcess,
    });

    const expectedNativePath = join(
      windowsContext.appOutDir,
      "resources",
      "app.asar.unpacked",
      "dist",
      "native",
      "iroha_js_host.node",
    );
    const expectedMainPath = join(windowsContext.appOutDir, "SORA Wallet.exe");
    expect(inspectPath).toHaveBeenCalledWith(expectedMainPath);
    expect(inspectPath).toHaveBeenCalledWith(expectedNativePath);
    expect(runProcess).toHaveBeenCalledOnce();
    const firstCall = runProcess.mock.calls[0];
    if (!firstCall) {
      throw new Error("Expected the Authenticode process invocation.");
    }
    const [command, args, options] = firstCall;
    expect(command).toBe("powershell.exe");
    expect(args).toContain("-NoProfile");
    expect(args.at(-1)).toContain("Get-AuthenticodeSignature");
    expect(args.at(-1)).toContain("'Valid'");
    expect(args.at(-1)).toContain("SignerCertificate.Thumbprint");
    expect(args.at(-1)).toContain("TimeStamperCertificate");
    expect(args.at(-1)).not.toContain(expectedNativePath);
    expect(options).toMatchObject({
      env: {
        Path: "C:\\Windows\\System32",
        SORA_WALLET_EXPECTED_CERT_THUMBPRINT: certificateThumbprint,
        SORA_WALLET_MAIN_EXE: expectedMainPath,
        SORA_WALLET_NATIVE_PATH: expectedNativePath,
      },
      stdio: "ignore",
      windowsHide: true,
    });
    expect(options.env).not.toHaveProperty("WIN_CSC_KEY_PASSWORD");
  });

  it("fails closed when Authenticode status is not Valid", () => {
    expect(() =>
      verifyWindowsPackageAuthenticode(windowsContext, {
        environment: {
          HAS_WIN_SIGNING: "true",
          WIN_EXPECTED_CERT_THUMBPRINT: certificateThumbprint,
        },
        inspectPath: () => regularFileStats,
        runProcess: () => ({ status: 1 }),
      }),
    ).toThrow("must both have valid Authenticode signatures");
  });

  it("requires the exact release-certificate thumbprint", () => {
    expect(() =>
      verifyWindowsPackageAuthenticode(windowsContext, {
        environment: { HAS_WIN_SIGNING: "true" },
        inspectPath: () => regularFileStats,
        runProcess: vi.fn(),
      }),
    ).toThrow("WIN_EXPECTED_CERT_THUMBPRINT");
  });

  it("rejects alternate first-release product filenames", () => {
    expect(() =>
      verifyWindowsPackageAuthenticode(
        {
          ...windowsContext,
          packager: { appInfo: { productFilename: "Alternate Wallet" } },
        },
        {
          environment: {
            HAS_WIN_SIGNING: "true",
            WIN_EXPECTED_CERT_THUMBPRINT: certificateThumbprint,
          },
          inspectPath: () => regularFileStats,
          runProcess: vi.fn(),
        },
      ),
    ).toThrow("filename must be exactly SORA Wallet");
  });
});

const macContext = {
  electronPlatformName: "darwin",
  appOutDir: "/release/mac-arm64",
  packager: { appInfo: { productFilename: "SORA Wallet" } },
};
const regularDirectoryStats = {
  isDirectory: () => true,
  isFile: () => false,
  isSymbolicLink: () => false,
};
const macPathStats = (path: string) =>
  path.endsWith(".node") || path.endsWith(".p8") || path.endsWith("Info.plist")
    ? regularFileStats
    : regularDirectoryStats;
const appleTeam = "ABCDE12345";
const appGroup = "group.org.sora.wallet.demo.vpn";
const helperBundleId = "org.sora.wallet.demo.vpn-controller";
const packetTunnelBundleId = "org.sora.wallet.demo.packet-tunnel";
const macSigningEnvironment = {
  APPLE_API_ISSUER: "12345678-1234-1234-1234-1234567890ab",
  APPLE_API_KEY: "/release/AuthKey_ABCDEF1234.p8",
  APPLE_API_KEY_ID: "ABCDEF1234",
  APPLE_DEVELOPMENT_TEAM: appleTeam,
  HAS_MAC_SIGNING: "true",
} as const;

const macProcess = (
  options: {
    helperEntitlements?: Record<string, unknown>;
    plistValues?: Record<string, string>;
    team?: string;
    timestamp?: boolean;
  } = {},
): AfterSignRunProcess => {
  const run = vi.fn<AfterSignRunProcess>((command, args, processOptions) => {
    if (command === "/usr/bin/plutil") {
      if (args[0] === "-extract") {
        const key = args[1];
        const plistPath = args.at(-1) ?? "";
        const values: Record<string, string> = plistPath.includes(
          ".systemextension",
        )
          ? {
              CFBundleExecutable: "SoraVpnPacketTunnel",
              CFBundleIdentifier: packetTunnelBundleId,
              CFBundlePackageType: "SYSX",
              "NetworkExtension.NEMachServiceName": appGroup,
            }
          : plistPath.includes("SoraVpnPacketEngine.app")
            ? {
                CFBundleExecutable: "sora-vpn-packet-engine",
                CFBundleIdentifier: `${helperBundleId}.packet-engine`,
              }
            : {
                CFBundleExecutable: "sora-vpn-controller",
                CFBundleIdentifier: helperBundleId,
                SoraVpnAppGroupId: appGroup,
                SoraVpnManagerDescription: "SORA Wallet VPN",
                SoraVpnPacketTunnelBundleId: packetTunnelBundleId,
              };
        return {
          status: 0,
          stdout: `${options.plistValues?.[key ?? ""] ?? values[key ?? ""] ?? ""}\n`,
        };
      }
      return {
        status: 0,
        stdout:
          typeof processOptions.input === "string"
            ? processOptions.input
            : processOptions.input?.toString("utf8"),
      };
    }
    const target = args.at(-1) ?? "";
    if (args.includes("--entitlements")) {
      if (target.includes("SoraVpnPacketEngine.app")) {
        return {
          status: 0,
          stdout: JSON.stringify({
            "com.apple.security.app-sandbox": true,
            "com.apple.security.inherit": true,
          }),
        };
      }
      if (target.includes(".systemextension")) {
        return {
          status: 0,
          stdout: JSON.stringify({
            "com.apple.developer.networking.networkextension": [
              "packet-tunnel-provider-systemextension",
            ],
            "com.apple.security.app-sandbox": true,
            "com.apple.security.application-groups": [appGroup],
            "com.apple.application-identifier": `${appleTeam}.${packetTunnelBundleId}`,
            "com.apple.developer.team-identifier": appleTeam,
          }),
        };
      }
      if (target.includes("SoraVpnController.app")) {
        return {
          status: 0,
          stdout: JSON.stringify(
            options.helperEntitlements ?? {
              "com.apple.developer.networking.networkextension": [
                "packet-tunnel-provider-systemextension",
              ],
              "com.apple.developer.system-extension.install": true,
              "com.apple.security.app-sandbox": true,
              "com.apple.security.application-groups": [appGroup],
              "com.apple.application-identifier": `${appleTeam}.${helperBundleId}`,
              "com.apple.developer.team-identifier": appleTeam,
            },
          ),
        };
      }
      return {
        status: 0,
        stdout: JSON.stringify({ "com.apple.security.cs.allow-jit": true }),
      };
    }
    if (args.includes("--display")) {
      return {
        status: 0,
        stderr: `TeamIdentifier=${options.team ?? appleTeam}${
          options.timestamp === false
            ? ""
            : "\nTimestamp=31 Aug 2026 at 09:30:00"
        }`,
      };
    }
    return { status: 0 };
  });
  return run;
};

describe("macOS packaged-signature boundary", () => {
  it("verifies every nested code object, exact team, and split entitlements", () => {
    const inspectPath = vi.fn(macPathStats);
    const runProcess = macProcess();

    verifyMacPackageSignatures(macContext, {
      environment: macSigningEnvironment,
      inspectPath,
      runProcess,
    });

    expect(inspectPath).toHaveBeenCalledTimes(9);
    expect(runProcess).toHaveBeenCalledWith(
      "/usr/bin/codesign",
      expect.arrayContaining(["--deep", "--strict"]),
      expect.objectContaining({
        env: { LC_ALL: "C", PATH: "/usr/bin:/bin" },
      }),
    );
  });

  it("rejects VPN entitlements stripped from the final helper signature", () => {
    expect(() =>
      verifyMacPackageSignatures(macContext, {
        environment: macSigningEnvironment,
        inspectPath: macPathStats,
        runProcess: macProcess({
          helperEntitlements: {
            "com.apple.application-identifier": `${appleTeam}.${helperBundleId}`,
            "com.apple.developer.team-identifier": appleTeam,
            "com.apple.security.app-sandbox": true,
            "com.apple.security.application-groups": [appGroup],
          },
        }),
      }),
    ).toThrow("requires com.apple.developer.system-extension.install=true");
  });

  it("rejects release helpers that retain debugger attachment", () => {
    expect(() =>
      verifyMacPackageSignatures(macContext, {
        environment: macSigningEnvironment,
        inspectPath: macPathStats,
        runProcess: macProcess({
          helperEntitlements: {
            "com.apple.application-identifier": `${appleTeam}.${helperBundleId}`,
            "com.apple.developer.networking.networkextension": [
              "packet-tunnel-provider-systemextension",
            ],
            "com.apple.developer.system-extension.install": true,
            "com.apple.developer.team-identifier": appleTeam,
            "com.apple.security.app-sandbox": true,
            "com.apple.security.application-groups": [appGroup],
            "com.apple.security.get-task-allow": true,
          },
        }),
      }),
    ).toThrow("must not enable com.apple.security.get-task-allow");
  });

  it("rejects a valid signature from the wrong Apple team", () => {
    expect(() =>
      verifyMacPackageSignatures(macContext, {
        environment: macSigningEnvironment,
        inspectPath: macPathStats,
        runProcess: macProcess({ team: "WRONG12345" }),
      }),
    ).toThrow("does not belong to Apple team");
  });

  it("rejects a release signature without a trusted timestamp", () => {
    expect(() =>
      verifyMacPackageSignatures(macContext, {
        environment: macSigningEnvironment,
        inspectPath: macPathStats,
        runProcess: macProcess({ timestamp: false }),
      }),
    ).toThrow("does not have a trusted timestamp");
  });

  it("rejects a helper whose signed bundle identity does not match the release configuration", () => {
    expect(() =>
      verifyMacPackageSignatures(macContext, {
        environment: macSigningEnvironment,
        inspectPath: macPathStats,
        runProcess: macProcess({
          plistValues: { CFBundleIdentifier: "org.example.untrusted" },
        }),
      }),
    ).toThrow(`requires CFBundleIdentifier=${helperBundleId}`);
  });

  it("rejects unsigned local macOS packages before inspecting output", () => {
    const inspectPath = vi.fn();
    const runProcess = vi.fn();
    expect(() =>
      verifyMacPackageSignatures(macContext, {
        environment: { HAS_MAC_SIGNING: "false" },
        inspectPath,
        runProcess,
      }),
    ).toThrow("require production Developer ID signing");
    expect(inspectPath).not.toHaveBeenCalled();
    expect(runProcess).not.toHaveBeenCalled();
  });

  it("requires complete notarization credentials for every macOS package", () => {
    expect(() =>
      verifyMacPackageSignatures(macContext, {
        environment: {
          APPLE_DEVELOPMENT_TEAM: appleTeam,
          HAS_MAC_SIGNING: "true",
        },
        inspectPath: macPathStats,
        runProcess: macProcess(),
      }),
    ).toThrow("require complete App Store Connect notarization credentials");
  });

  it("rejects alternate NetworkExtension entitlement modes", () => {
    expect(() =>
      verifyMacPackageSignatures(macContext, {
        environment: {
          ...macSigningEnvironment,
          APPLE_VPN_NETWORK_EXTENSION_ENTITLEMENT: "packet-tunnel-provider",
        },
        inspectPath: macPathStats,
        runProcess: macProcess(),
      }),
    ).toThrow("must be exactly packet-tunnel-provider-systemextension");
  });

  it("rejects colliding nested bundle identifiers", () => {
    expect(() =>
      verifyMacPackageSignatures(macContext, {
        environment: {
          ...macSigningEnvironment,
          SORANET_VPN_PACKET_TUNNEL_BUNDLE_ID: `${helperBundleId}.packet-engine`,
        },
        inspectPath: macPathStats,
        runProcess: macProcess(),
      }),
    ).toThrow("must be distinct reverse-DNS bundle identifiers");
  });
});

describe("electron-builder Windows signing boundary", () => {
  it("keeps deprecated package-root builder metadata out of package.json", () => {
    const packageMetadata = JSON.parse(
      readFileSync(resolve(process.cwd(), "package.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(packageMetadata).not.toHaveProperty("directories");
  });

  it("signs native modules and advertises only built x64 artifacts", () => {
    const config = readFileSync(
      resolve(process.cwd(), "electron-builder.yml"),
      "utf8",
    );
    const winStart = config.indexOf("\nwin:\n");
    const winEnd = config.indexOf("\nnsis:\n", winStart);
    expect(winStart).toBeGreaterThanOrEqual(0);
    expect(winEnd).toBeGreaterThan(winStart);

    const winConfig = config.slice(winStart, winEnd);
    expect(config).toMatch(/^afterSign: scripts\/after-sign\.mjs$/mu);
    expect(config).toMatch(/^forceCodeSigning: true$/mu);
    expect(config).toContain("asarUnpack:\n  - dist/native/iroha_js_host.node");
    expect(config).toContain('  - "!node_modules/@iroha/iroha-js/**"');
    expect(config).not.toContain(
      "node_modules/@iroha/iroha-js/native/iroha_js_host.node",
    );
    expect(config).not.toContain("- dist/**");
    expect(config).toContain("- dist/main/**");
    expect(config).toContain("- dist/preload/**");
    expect(config).toContain("- dist/renderer/**");
    expect(config).toContain("- dist/native/iroha_js_host.checksums.json");
    expect(winConfig).toContain("signExts:");
    expect(winConfig).toContain("- .exe");
    expect(winConfig).toContain("- .node");
    expect(winConfig.match(/- x64/gu)).toHaveLength(2);
    expect(winConfig).not.toContain("arm64");
  });

  it("packages only the exact current VPN artifacts", () => {
    const config = readFileSync(
      resolve(process.cwd(), "electron-builder.yml"),
      "utf8",
    );
    const macStart = config.indexOf("\nmac:\n");
    const winStart = config.indexOf("\nwin:\n");
    const linuxStart = config.indexOf("\nlinux:\n");
    expect(config.slice(macStart, winStart)).not.toContain("extraResources:");
    expect(config.slice(macStart, winStart)).toContain(
      "/Contents/Helpers/SoraVpnController\\.app(?:/|$)",
    );
    expect(config.slice(linuxStart)).toContain("- sora-vpn-controller");
    expect(config).not.toContain('- "**/*"');
    expect(config).not.toContain("SoraVpnController.bundle");
    expect(config).not.toContain("SoraVpnPacketTunnel.appex");
  });
});

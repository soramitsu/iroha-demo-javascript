import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  verifyWindowsNativeAuthenticode,
  type AfterSignRunProcess,
} from "../scripts/after-sign.mjs";

const windowsContext = {
  electronPlatformName: "win32",
  appOutDir: "C:\\release\\win-unpacked",
};

const regularFileStats = {
  isFile: () => true,
  isSymbolicLink: () => false,
};

describe("Windows native post-sign verification", () => {
  it("does nothing unless this is a signed Windows package", () => {
    const inspectPath = vi.fn();
    const runProcess = vi.fn();

    verifyWindowsNativeAuthenticode(
      { ...windowsContext, electronPlatformName: "darwin" },
      {
        environment: { HAS_WIN_SIGNING: "true" },
        inspectPath,
        runProcess,
      },
    );
    verifyWindowsNativeAuthenticode(windowsContext, {
      environment: { HAS_WIN_SIGNING: "false" },
      inspectPath,
      runProcess,
    });

    expect(inspectPath).not.toHaveBeenCalled();
    expect(runProcess).not.toHaveBeenCalled();
  });

  it("fails when the packaged native binding is missing", () => {
    expect(() =>
      verifyWindowsNativeAuthenticode(windowsContext, {
        environment: { HAS_WIN_SIGNING: "true" },
        inspectPath: () => {
          throw new Error("missing");
        },
        runProcess: vi.fn(),
      }),
    ).toThrow("missing the staged Iroha native binding");
  });

  it.each([
    {
      name: "directory",
      stats: { isFile: () => false, isSymbolicLink: () => false },
    },
    {
      name: "symlink",
      stats: { isFile: () => true, isSymbolicLink: () => true },
    },
  ])("rejects a $name at the native binding path", ({ stats }) => {
    expect(() =>
      verifyWindowsNativeAuthenticode(windowsContext, {
        environment: { HAS_WIN_SIGNING: "true" },
        inspectPath: () => stats,
        runProcess: vi.fn(),
      }),
    ).toThrow("must be a regular, non-symlink file");
  });

  it("accepts only a successful PowerShell Authenticode check", () => {
    const inspectPath = vi.fn(() => regularFileStats);
    const runProcess = vi.fn<AfterSignRunProcess>(() => ({ status: 0 }));

    verifyWindowsNativeAuthenticode(windowsContext, {
      environment: {
        HAS_WIN_SIGNING: "true",
        Path: "C:\\Windows\\System32",
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
    expect(args.at(-1)).not.toContain(expectedNativePath);
    expect(options).toMatchObject({
      env: {
        Path: "C:\\Windows\\System32",
        SORA_WALLET_NATIVE_PATH: expectedNativePath,
      },
      stdio: "ignore",
      windowsHide: true,
    });
    expect(options.env).not.toHaveProperty("WIN_CSC_KEY_PASSWORD");
  });

  it("fails closed when Authenticode status is not Valid", () => {
    expect(() =>
      verifyWindowsNativeAuthenticode(windowsContext, {
        environment: { HAS_WIN_SIGNING: "true" },
        inspectPath: () => regularFileStats,
        runProcess: () => ({ status: 1 }),
      }),
    ).toThrow("does not have a valid Authenticode signature");
  });
});

describe("electron-builder Windows signing boundary", () => {
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
    expect(config).toMatch(
      /^asarUnpack:\n {2}- dist\/native\/iroha_js_host\.node$/mu,
    );
    expect(winConfig).toContain("signExts:");
    expect(winConfig).toContain("- .exe");
    expect(winConfig).toContain("- .node");
    expect(winConfig.match(/- x64/gu)).toHaveLength(2);
    expect(winConfig).not.toContain("arm64");
  });
});

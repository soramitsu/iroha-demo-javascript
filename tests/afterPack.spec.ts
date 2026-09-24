import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  resolvePacketTunnelBundleId,
  stageMacVpnController,
  verifyMacVpnControllerBundle,
  verifyPackagedNativePairMatchesStaging,
  verifyPackagedRuntimeContents,
  verifyReleaseNativeStaging,
  verifyReleaseSdkSelection,
} from "../scripts/after-pack.mjs";

const roots: string[] = [];
const packetTunnelBundleId = "org.sora.wallet.demo.packet-tunnel";

const makeRoot = (): string => {
  const root = mkdtempSync(join(tmpdir(), "sora-wallet-after-pack-"));
  roots.push(root);
  return root;
};

const writeFixtureFile = (path: string): void => {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, "fixture", "utf8");
};

const makeControllerBundle = (root: string): string => {
  const app = join(
    root,
    "dist-native",
    "vpn",
    "darwin",
    "SoraVpnController.app",
  );
  writeFixtureFile(join(app, "Contents", "MacOS", "sora-vpn-controller"));
  writeFixtureFile(
    join(
      app,
      "Contents",
      "Library",
      "SystemExtensions",
      `${packetTunnelBundleId}.systemextension`,
      "Contents",
      "MacOS",
      "SoraVpnPacketTunnel",
    ),
  );
  writeFixtureFile(
    join(
      app,
      "Contents",
      "Resources",
      "vpn",
      "SoraVpnPacketEngine.app",
      "Contents",
      "MacOS",
      "sora-vpn-packet-engine",
    ),
  );
  return app;
};

const packagedNativeEntries = [
  "/dist/native",
  "/dist/native/iroha_js_host.checksums.json",
  "/dist/native/iroha_js_host.node",
  "/package.json",
];

const makePackagedRuntime = (root: string) => {
  const appOutDir = join(root, "linux-unpacked");
  const resources = join(appOutDir, "resources");
  const archivePath = join(resources, "app.asar");
  const nativeModulePath = join(
    resources,
    "app.asar.unpacked",
    "dist",
    "native",
    "iroha_js_host.node",
  );
  writeFixtureFile(archivePath);
  writeFixtureFile(nativeModulePath);
  const vpnControllerPath = join(resources, "vpn", "sora-vpn-controller");
  writeFixtureFile(vpnControllerPath);
  chmodSync(vpnControllerPath, 0o700);
  return {
    archivePath,
    context: {
      appOutDir,
      electronPlatformName: "linux",
      packager: {
        appInfo: { productFilename: "SORA Wallet" },
        projectDir: root,
      },
    },
    nativeModulePath,
  } as const;
};

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

describe("packaged runtime inventory", () => {
  it("requires the authenticated reviewed SDK even for direct builder entry", () => {
    const fixture = makePackagedRuntime(makeRoot());
    const verifyInstalledSdk = vi.fn(() => ({
      source_commit: "1bcb05eb208d8bda1610789d827a7ed97e66e56c",
    }));
    expect(
      verifyReleaseSdkSelection(fixture.context, {
        environment: { IROHA_ROOT: "/reviewed/iroha" },
        verifyInstalledSdk,
      }),
    ).toEqual({
      source_commit: "1bcb05eb208d8bda1610789d827a7ed97e66e56c",
    });
    expect(verifyInstalledSdk).toHaveBeenCalledWith(
      fixture.context.packager.projectDir,
      "/reviewed/iroha",
    );
    expect(() =>
      verifyReleaseSdkSelection(fixture.context, {
        environment: {},
        verifyInstalledSdk,
      }),
    ).toThrow("authenticated IROHA_ROOT release source");
    expect(() =>
      verifyReleaseSdkSelection(fixture.context, {
        environment: { IROHA_ROOT: "/reviewed/iroha" },
        verifyInstalledSdk: () => ({ source_commit: "a".repeat(40) }),
      }),
    ).toThrow("exact reviewed installed Iroha SDK");
  });

  it("admits only an exact reviewed release native pair for the build target", () => {
    const fixture = makePackagedRuntime(makeRoot());
    const inspectNativeBinding = vi.fn(() => ({
      reason: "native binding is current",
      shouldBuild: false,
    }));
    expect(
      verifyReleaseNativeStaging(
        { ...fixture.context, arch: 1 },
        { inspectNativeBinding },
      ),
    ).toEqual({
      nativeManifestPath: join(
        fixture.context.packager.projectDir,
        "dist",
        "native",
        "iroha_js_host.checksums.json",
      ),
      nativeModulePath: join(
        fixture.context.packager.projectDir,
        "dist",
        "native",
        "iroha_js_host.node",
      ),
      platformKey: "linux-x64",
      stagedRoot: join(fixture.context.packager.projectDir, "dist"),
    });
    expect(inspectNativeBinding).toHaveBeenCalledWith(
      join(fixture.context.packager.projectDir, "dist"),
      "linux-x64",
      undefined,
      {
        cargoProfile: "release",
        sourceGitRevision: "1bcb05eb208d8bda1610789d827a7ed97e66e56c",
        sourceTreeClean: true,
      },
    );
  });

  it("requires the packaged native pair to equal reviewed staging bytes", () => {
    const staging = {
      nativeManifestPath: "/staging/iroha_js_host.checksums.json",
      nativeModulePath: "/staging/iroha_js_host.node",
      platformKey: "linux-x64",
      stagedRoot: "/staging",
    };
    const packaged = {
      archivePath: "/package/app.asar",
      nativeModulePath: "/package/iroha_js_host.node",
    };
    const manifest = Buffer.from("manifest");
    const module = Buffer.from("module");
    expect(() =>
      verifyPackagedNativePairMatchesStaging(staging, packaged, {
        readArchiveEntry: () => manifest,
        readPhysicalFile: (path) =>
          path.endsWith("checksums.json") ? manifest : module,
      }),
    ).not.toThrow();
    expect(() =>
      verifyPackagedNativePairMatchesStaging(staging, packaged, {
        readArchiveEntry: () => Buffer.from("other-manifest"),
        readPhysicalFile: (path) =>
          path.endsWith("checksums.json") ? manifest : module,
      }),
    ).toThrow("native manifest differs");
    expect(() =>
      verifyPackagedNativePairMatchesStaging(staging, packaged, {
        readArchiveEntry: () => manifest,
        readPhysicalFile: (path) =>
          path === packaged.nativeModulePath ? Buffer.from("other") : module,
      }),
    ).toThrow("native binding differs");
  });

  it("rejects stale native provenance and unsupported release targets", () => {
    const fixture = makePackagedRuntime(makeRoot());
    expect(() =>
      verifyReleaseNativeStaging(
        { ...fixture.context, arch: 1 },
        {
          inspectNativeBinding: () => ({
            reason: "native source Git revision mismatch",
            shouldBuild: true,
          }),
        },
      ),
    ).toThrow("exact reviewed release native binding");
    expect(() =>
      verifyReleaseNativeStaging(
        { ...fixture.context, arch: 3 },
        { inspectNativeBinding: vi.fn() },
      ),
    ).toThrow("Unsupported first-release native target linux/arm64");
  });

  it("requires the exact canonical native module and sealed manifest layout", () => {
    const fixture = makePackagedRuntime(makeRoot());
    expect(
      verifyPackagedRuntimeContents(fixture.context, {
        listArchive: () => packagedNativeEntries,
      }),
    ).toEqual({
      archivePath: fixture.archivePath,
      nativeModulePath: fixture.nativeModulePath,
    });
  });

  it("rejects the SDK source package and stale native layouts inside ASAR", () => {
    const fixture = makePackagedRuntime(makeRoot());
    for (const forbidden of [
      "/node_modules/@iroha/iroha-js/lib.js",
      "/dist/native-v1/iroha_js_host.node",
    ]) {
      expect(() =>
        verifyPackagedRuntimeContents(fixture.context, {
          listArchive: () => [...packagedNativeEntries, forbidden],
        }),
      ).toThrow("forbidden first-release content");
    }
  });

  it("rejects unexpected unpacked native files and native symlinks", () => {
    const root = makeRoot();
    const fixture = makePackagedRuntime(root);
    const nativeDirectory = join(fixture.nativeModulePath, "..");
    writeFixtureFile(join(nativeDirectory, "legacy.node"));
    expect(() =>
      verifyPackagedRuntimeContents(fixture.context, {
        listArchive: () => packagedNativeEntries,
      }),
    ).toThrow("Unexpected packaged Iroha native contents");

    rmSync(join(nativeDirectory, "legacy.node"));
    writeFileSync(fixture.nativeModulePath, "");
    expect(() =>
      verifyPackagedRuntimeContents(fixture.context, {
        listArchive: () => packagedNativeEntries,
      }),
    ).toThrow("must be a non-empty, regular, non-symlink file");

    rmSync(fixture.nativeModulePath);
    const symlinkTarget = join(root, "untrusted.node");
    writeFixtureFile(symlinkTarget);
    symlinkSync(symlinkTarget, fixture.nativeModulePath);
    expect(() =>
      verifyPackagedRuntimeContents(fixture.context, {
        listArchive: () => packagedNativeEntries,
      }),
    ).toThrow("must be a non-empty, regular, non-symlink file");
  });

  it("rejects unsupported release platforms", () => {
    const fixture = makePackagedRuntime(makeRoot());
    expect(() =>
      verifyPackagedRuntimeContents(
        { ...fixture.context, electronPlatformName: "freebsd" },
        { listArchive: () => packagedNativeEntries },
      ),
    ).toThrow("Unsupported first-release packaging platform");
  });

  it("rejects alternate first-release product filenames", () => {
    const fixture = makePackagedRuntime(makeRoot());
    expect(() =>
      verifyPackagedRuntimeContents(
        {
          ...fixture.context,
          packager: {
            ...fixture.context.packager,
            appInfo: { productFilename: "Alternate Wallet" },
          },
        },
        { listArchive: () => packagedNativeEntries },
      ),
    ).toThrow("filename must be exactly SORA Wallet");
  });

  it("requires exactly one regular Linux VPN controller", () => {
    const fixture = makePackagedRuntime(makeRoot());
    const vpnDirectory = join(fixture.context.appOutDir, "resources", "vpn");
    writeFixtureFile(join(vpnDirectory, "legacy-controller"));
    expect(() =>
      verifyPackagedRuntimeContents(fixture.context, {
        listArchive: () => packagedNativeEntries,
      }),
    ).toThrow("Unexpected packaged Linux VPN controller contents");

    rmSync(join(vpnDirectory, "legacy-controller"));
    writeFileSync(join(vpnDirectory, "sora-vpn-controller"), "");
    expect(() =>
      verifyPackagedRuntimeContents(fixture.context, {
        listArchive: () => packagedNativeEntries,
      }),
    ).toThrow("must be a non-empty, regular, non-symlink file");

    writeFileSync(join(vpnDirectory, "sora-vpn-controller"), "fixture");
    chmodSync(join(vpnDirectory, "sora-vpn-controller"), 0o600);
    expect(() =>
      verifyPackagedRuntimeContents(fixture.context, {
        listArchive: () => packagedNativeEntries,
      }),
    ).toThrow("must have an executable mode");
  });
});

describe("macOS VPN packaging boundary", () => {
  it("builds one canonical darwin staging bundle with static entitlements", () => {
    const buildScript = readFileSync(
      resolve(process.cwd(), "scripts/build-vpn-controllers.mjs"),
      "utf8",
    );
    const packetEngineEntitlements = readFileSync(
      resolve(
        process.cwd(),
        "buildResources/entitlements.vpn-packet-engine.plist",
      ),
      "utf8",
    );
    expect(buildScript).toContain('const macDistTarget = "darwin";');
    expect(buildScript).not.toContain("macDistTargets");
    expect(buildScript).toContain(
      'const retiredMacAliasRoot = join(distRoot, "mac")',
    );
    expect(buildScript).toContain(
      "rmSync(retiredMacAliasRoot, { recursive: true, force: true })",
    );
    expect(buildScript).toContain(
      '"buildResources",\n    "entitlements.vpn-packet-engine.plist"',
    );
    expect(buildScript).toContain(
      "rmSync(targetRoot, { recursive: true, force: true })",
    );
    expect(buildScript).toContain("must be distinct reverse-DNS identifiers");
    expect(buildScript).toContain(
      "APPLE_DEVELOPMENT_TEAM must be the exact ten-character release team ID",
    );
    expect(packetEngineEntitlements).toContain(
      "<key>com.apple.security.inherit</key>",
    );
  });

  it("copies only the exact current helper bundle into Contents/Helpers", () => {
    const root = makeRoot();
    makeControllerBundle(root);
    const appOutDir = join(root, "release", "mac-arm64");
    mkdirSync(join(appOutDir, "SORA Wallet.app", "Contents"), {
      recursive: true,
    });

    stageMacVpnController({
      appOutDir,
      electronPlatformName: "darwin",
      packager: {
        appInfo: { productFilename: "SORA Wallet" },
        projectDir: root,
      },
    });

    const staged = join(
      appOutDir,
      "SORA Wallet.app",
      "Contents",
      "Helpers",
      "SoraVpnController.app",
    );
    expect(existsSync(staged)).toBe(true);
    expect(verifyMacVpnControllerBundle(staged)).toMatchObject({
      packetTunnelBundleId,
    });
    expect(existsSync(join(appOutDir, "resources", "vpn"))).toBe(false);
  });

  it("rejects legacy or additional packet-tunnel bundles", () => {
    const root = makeRoot();
    const app = makeControllerBundle(root);
    mkdirSync(
      join(
        app,
        "Contents",
        "Library",
        "SystemExtensions",
        "legacy.packet.tunnel.systemextension",
      ),
    );

    expect(() => verifyMacVpnControllerBundle(app)).toThrow(
      "Unexpected macOS VPN helper contents",
    );
  });

  it("rejects legacy app-extension and bundle code anywhere in the helper", () => {
    const root = makeRoot();
    const app = makeControllerBundle(root);
    writeFixtureFile(
      join(
        app,
        "Contents",
        "PlugIns",
        "SoraVpnPacketTunnel.appex",
        "Contents",
        "MacOS",
        "SoraVpnPacketTunnel",
      ),
    );
    expect(() => verifyMacVpnControllerBundle(app)).toThrow(
      "forbidden legacy code bundle",
    );

    rmSync(join(app, "Contents", "PlugIns"), { recursive: true });
    mkdirSync(join(app, "Contents", "Resources", "Legacy.bundle"));
    expect(() => verifyMacVpnControllerBundle(app)).toThrow(
      "forbidden legacy code bundle",
    );
  });

  it("rejects stale standalone artifacts beside the self-contained helper", () => {
    const root = makeRoot();
    makeControllerBundle(root);
    writeFixtureFile(
      join(root, "dist-native", "vpn", "darwin", "sora-vpn-controller"),
    );
    const appOutDir = join(root, "release", "mac-arm64");
    mkdirSync(join(appOutDir, "SORA Wallet.app", "Contents"), {
      recursive: true,
    });

    expect(() =>
      stageMacVpnController({
        appOutDir,
        electronPlatformName: "darwin",
        packager: {
          appInfo: { productFilename: "SORA Wallet" },
          projectDir: root,
        },
      }),
    ).toThrow("Unexpected macOS VPN controller staging contents");
  });

  it("rejects the retired mac staging alias", () => {
    const root = makeRoot();
    makeControllerBundle(root);
    mkdirSync(join(root, "dist-native", "vpn", "mac"));
    const appOutDir = join(root, "release", "mac-arm64");
    mkdirSync(join(appOutDir, "SORA Wallet.app", "Contents"), {
      recursive: true,
    });

    expect(() =>
      stageMacVpnController({
        appOutDir,
        electronPlatformName: "darwin",
        packager: {
          appInfo: { productFilename: "SORA Wallet" },
          projectDir: root,
        },
      }),
    ).toThrow("retired macOS VPN staging alias must be absent");
  });

  it("rejects symlinks anywhere in the staged helper tree", () => {
    const root = makeRoot();
    const app = makeControllerBundle(root);
    symlinkSync(
      join(app, "Contents", "MacOS", "sora-vpn-controller"),
      join(app, "Contents", "linked-controller"),
    );

    expect(() => verifyMacVpnControllerBundle(app)).toThrow(
      "must not contain symlinks",
    );
  });

  it("rejects malformed bundle-id overrides before resolving paths", () => {
    expect(() =>
      resolvePacketTunnelBundleId({
        SORANET_VPN_PACKET_TUNNEL_BUNDLE_ID: "../../escape",
      }),
    ).toThrow("must be a reverse-DNS bundle identifier");
  });

  it("does not inspect packaging state for non-macOS targets", () => {
    expect(() =>
      stageMacVpnController({
        appOutDir: "/missing",
        electronPlatformName: "linux",
        packager: {
          appInfo: { productFilename: "SORA Wallet" },
          projectDir: "/missing",
        },
      }),
    ).not.toThrow();
  });
});

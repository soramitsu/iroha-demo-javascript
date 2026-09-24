import {
  cpSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";

const repoRoot = resolve(import.meta.dirname, "..");
const irohaRoot = resolve(repoRoot, "../iroha");
const distRoot = resolve(repoRoot, "dist-native", "vpn");
const macDistTarget = "darwin";
const macHelperAppName = "SoraVpnController.app";
const macPacketEngineAppName = "SoraVpnPacketEngine.app";
const macPacketEngineExecutableName = "sora-vpn-packet-engine";
const defaultMacHelperBundleId = "org.sora.wallet.demo.vpn-controller";
const defaultMacPacketTunnelBundleId = "org.sora.wallet.demo.packet-tunnel";
const defaultMacAppGroupId = "group.org.sora.wallet.demo.vpn";
const defaultMacManagerDescription = "SORA Wallet VPN";
const defaultMacNetworkExtensionEntitlement =
  "packet-tunnel-provider-systemextension";
const appleTeamPattern = /^[A-Z0-9]{10}$/u;
const bundleIdPattern =
  /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?){2,}$/u;

const containsAsciiControlCharacter = (value) =>
  Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f);
  });

const parsePlatformArg = () => {
  const index = process.argv.indexOf("--platform");
  if (index >= 0 && process.argv[index + 1]) {
    return process.argv[index + 1];
  }
  return process.platform;
};

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      ...(options.env ?? {}),
    },
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed`);
  }
};

const ensureParent = (target) => {
  mkdirSync(dirname(target), { recursive: true });
};

const formatSystemCapabilitiesBlock = (indent, capabilities) => {
  const lines = [`${indent}SystemCapabilities = {`];
  for (const capability of capabilities) {
    lines.push(`${indent}\t${capability} = {`);
    lines.push(`${indent}\t\tenabled = 1;`);
    lines.push(`${indent}\t};`);
  }
  lines.push(`${indent}};`);
  return lines.join("\n");
};

const patchPbxprojSystemCapabilities = (projectPath, capabilities) => {
  const content = readFileSync(projectPath, "utf8");
  const inlinePattern = /(^\s*)SystemCapabilities = ".*?";$/m;
  const inlineMatch = content.match(inlinePattern);
  if (inlineMatch) {
    writeFileSync(
      projectPath,
      content.replace(
        inlinePattern,
        formatSystemCapabilitiesBlock(inlineMatch[1], capabilities),
      ),
    );
    return;
  }
  const provisioningPattern = /(^\s*)ProvisioningStyle = Automatic;$/m;
  const provisioningMatch = content.match(provisioningPattern);
  if (!provisioningMatch) {
    throw new Error(`Unable to locate TargetAttributes in ${projectPath}`);
  }
  writeFileSync(
    projectPath,
    content.replace(
      provisioningPattern,
      `${provisioningMatch[0]}\n${formatSystemCapabilitiesBlock(
        provisioningMatch[1],
        capabilities,
      )}`,
    ),
  );
};

const copyBuiltBinary = (source, target) => {
  ensureParent(target);
  cpSync(source, target);
  console.log(`copied ${source} -> ${target}`);
};

const readTrimmedEnv = (name) => {
  const value = process.env[name]?.trim();
  return value ? value : null;
};

const resolveMacBundleConfig = () => {
  const helperBundleId =
    readTrimmedEnv("SORANET_VPN_HELPER_BUNDLE_ID") || defaultMacHelperBundleId;
  const packetTunnelBundleId =
    readTrimmedEnv("SORANET_VPN_PACKET_TUNNEL_BUNDLE_ID") ||
    defaultMacPacketTunnelBundleId;
  const appGroupId =
    readTrimmedEnv("SORANET_VPN_APP_GROUP_ID") || defaultMacAppGroupId;
  const managerDescription =
    readTrimmedEnv("SORANET_VPN_MANAGER_DESCRIPTION") ||
    defaultMacManagerDescription;
  if (
    !bundleIdPattern.test(helperBundleId) ||
    !bundleIdPattern.test(packetTunnelBundleId) ||
    helperBundleId === packetTunnelBundleId ||
    `${helperBundleId}.packet-engine` === packetTunnelBundleId
  ) {
    throw new Error(
      "The macOS VPN helper, packet-engine, and PacketTunnel bundle IDs must be distinct reverse-DNS identifiers.",
    );
  }
  if (!bundleIdPattern.test(appGroupId) || !appGroupId.startsWith("group.")) {
    throw new Error(
      "SORANET_VPN_APP_GROUP_ID must be a group-prefixed reverse-DNS identifier.",
    );
  }
  if (
    managerDescription.length > 128 ||
    containsAsciiControlCharacter(managerDescription)
  ) {
    throw new Error(
      "SORANET_VPN_MANAGER_DESCRIPTION must contain at most 128 characters and no control characters.",
    );
  }
  return {
    helperBundleId,
    packetTunnelBundleId,
    appGroupId,
    managerDescription,
    systemExtensionName: `${packetTunnelBundleId}.systemextension`,
  };
};

const resolveMacSigningConfig = (macConfig) => {
  const teamId = process.env["APPLE_DEVELOPMENT_TEAM"]?.trim();
  if (!teamId) {
    return null;
  }
  if (!appleTeamPattern.test(teamId)) {
    throw new Error(
      "APPLE_DEVELOPMENT_TEAM must be the exact ten-character release team ID.",
    );
  }
  const configuredNetworkExtensionEntitlement =
    process.env["APPLE_VPN_NETWORK_EXTENSION_ENTITLEMENT"]?.trim();
  if (
    configuredNetworkExtensionEntitlement &&
    configuredNetworkExtensionEntitlement !==
      defaultMacNetworkExtensionEntitlement
  ) {
    throw new Error(
      `APPLE_VPN_NETWORK_EXTENSION_ENTITLEMENT must be exactly ${defaultMacNetworkExtensionEntitlement}.`,
    );
  }
  return {
    teamId,
    xcodeIdentity:
      process.env["APPLE_XCODE_SIGN_IDENTITY"]?.trim() || "Apple Development",
    codesignIdentity:
      process.env["APPLE_SIGN_IDENTITY"]?.trim() || "Apple Development",
    appGroupId: macConfig.appGroupId,
    helperBundleId: macConfig.helperBundleId,
    packetTunnelBundleId: macConfig.packetTunnelBundleId,
    managerDescription: macConfig.managerDescription,
    networkExtensionEntitlement: defaultMacNetworkExtensionEntitlement,
  };
};

const buildSignedXcodeArgs = ({
  projectPath,
  scheme,
  derivedDataPath,
  signing,
  buildSettings = {},
}) => {
  const args = [
    "-project",
    projectPath,
    "-scheme",
    scheme,
    "-configuration",
    "Release",
    "-derivedDataPath",
    derivedDataPath,
  ];
  const networkExtensionEntitlement =
    signing?.networkExtensionEntitlement ||
    defaultMacNetworkExtensionEntitlement;
  const appGroupId = signing?.appGroupId || defaultMacAppGroupId;
  args.push(`VPN_NETWORK_EXTENSION_ENTITLEMENT=${networkExtensionEntitlement}`);
  args.push(`VPN_APP_GROUP_ID=${appGroupId}`);
  for (const [key, value] of Object.entries(buildSettings)) {
    if (value) {
      args.push(`${key}=${value}`);
    }
  }
  if (signing) {
    args.push(
      "-allowProvisioningUpdates",
      "-allowProvisioningDeviceRegistration",
      `DEVELOPMENT_TEAM=${signing.teamId}`,
      "CODE_SIGN_STYLE=Automatic",
      "CODE_SIGNING_ALLOWED=YES",
      `CODE_SIGN_IDENTITY=${signing.xcodeIdentity}`,
    );
    const appleApiKey = process.env["APPLE_API_KEY"]?.trim();
    const appleApiKeyId = process.env["APPLE_API_KEY_ID"]?.trim();
    const appleApiIssuer = process.env["APPLE_API_ISSUER"]?.trim();
    if (appleApiKey && appleApiKeyId && appleApiIssuer) {
      args.push(
        "-authenticationKeyPath",
        appleApiKey,
        "-authenticationKeyID",
        appleApiKeyId,
        "-authenticationKeyIssuerID",
        appleApiIssuer,
      );
    }
  } else {
    args.push("CODE_SIGNING_ALLOWED=NO");
  }
  args.push("build");
  return args;
};

const signMacPath = (targetPath, signing, options = {}) => {
  if (!signing) {
    return;
  }
  const preserveMetadata = Boolean(options.preserveMetadata);
  const entitlementsPath =
    typeof options.entitlementsPath === "string" &&
    options.entitlementsPath.trim()
      ? options.entitlementsPath.trim()
      : null;
  const identifier =
    typeof options.identifier === "string" && options.identifier.trim()
      ? options.identifier.trim()
      : null;
  const args = [
    "--force",
    "--sign",
    signing.codesignIdentity,
    "--generate-entitlement-der",
  ];
  const timestampMode = process.env["APPLE_CODESIGN_TIMESTAMP"]?.trim();
  if (timestampMode === "1" || timestampMode === "true") {
    args.push("--timestamp");
  } else if (timestampMode) {
    args.push(`--timestamp=${timestampMode}`);
  } else {
    args.push("--timestamp=none");
  }
  if (identifier) {
    args.push("--identifier", identifier);
  }
  if (entitlementsPath) {
    args.push("--entitlements", entitlementsPath);
  }
  if (preserveMetadata) {
    args.push(
      "--preserve-metadata=identifier,entitlements,requirements,flags,runtime",
    );
  }
  args.push(targetPath);
  run("/usr/bin/codesign", args);
};

const readCodesignEntitlements = (targetPath) => {
  const result = spawnSync(
    "/usr/bin/codesign",
    ["-d", "--entitlements", ":-", targetPath],
    {
      cwd: repoRoot,
      encoding: "utf8",
    },
  );
  if (result.status !== 0) {
    throw new Error(
      `codesign entitlements inspection failed for ${targetPath}`,
    );
  }
  return `${result.stdout ?? ""}${result.stderr ?? ""}`;
};

const assertRequiredEntitlements = (targetPath, label, required) => {
  const entitlements = readCodesignEntitlements(targetPath);
  const missing = required.filter((entry) => !entitlements.includes(entry));
  if (missing.length > 0) {
    throw new Error(
      `${label} is missing required entitlements (${missing.join(", ")}). Apple provisioning did not grant the VPN helper capability for ${targetPath}.`,
    );
  }
};

const assertMacVpnHelperEntitlements = (targetPath) =>
  assertRequiredEntitlements(targetPath, "macOS VPN helper app", [
    "com.apple.developer.system-extension.install",
  ]);

const assertMacSystemExtensionEntitlements = (targetPath) =>
  assertRequiredEntitlements(targetPath, "macOS VPN system extension", [
    "com.apple.developer.networking.networkextension",
  ]);

const assertMacPacketTunnelProviderMode = (targetPath, label, expectedValue) =>
  assertRequiredEntitlements(targetPath, label, [expectedValue]);

const buildLinuxController = () => {
  run("cargo", ["build", "--release", "-p", "sora-vpn-helper"], {
    cwd: irohaRoot,
  });
  copyBuiltBinary(
    join(irohaRoot, "target", "release", "sora-vpn-controller"),
    join(distRoot, "linux", "sora-vpn-controller"),
  );
};

const buildMacControllerApp = (signing) => {
  const projectRoot = join(repoRoot, "native", "macos-vpn-helper-app");
  const derivedDataPath = join(projectRoot, "xcode-derived-data");
  rmSync(derivedDataPath, { recursive: true, force: true });
  run("xcodegen", ["generate"], {
    cwd: projectRoot,
  });
  patchPbxprojSystemCapabilities(
    join(projectRoot, "SoraVpnController.xcodeproj", "project.pbxproj"),
    [
      "com.apple.NetworkExtensions",
      "com.apple.Sandbox",
      "com.apple.SystemExtensionInstall",
    ],
  );
  run(
    "xcodebuild",
    buildSignedXcodeArgs({
      projectPath: join(projectRoot, "SoraVpnController.xcodeproj"),
      scheme: "SoraVpnController",
      derivedDataPath,
      signing,
      buildSettings: {
        PRODUCT_BUNDLE_IDENTIFIER:
          signing?.helperBundleId || defaultMacHelperBundleId,
        VPN_PACKET_TUNNEL_BUNDLE_ID:
          signing?.packetTunnelBundleId || defaultMacPacketTunnelBundleId,
        VPN_MANAGER_DESCRIPTION:
          signing?.managerDescription || defaultMacManagerDescription,
      },
    }),
    {
      cwd: repoRoot,
    },
  );
  return join(
    derivedDataPath,
    "Build",
    "Products",
    "Release",
    macHelperAppName,
  );
};

const buildMacPacketEngine = () => {
  run("cargo", ["build", "--release", "-p", "sora-vpn-helper"], {
    cwd: irohaRoot,
    env: {
      NORITO_SKIP_BINDINGS_SYNC: "1",
    },
  });
  return join(irohaRoot, "target", "release", "sora-vpn-controller");
};

const buildMacPacketTunnelExtension = (signing) => {
  const projectRoot = join(repoRoot, "native", "macos-packet-tunnel");
  const derivedDataPath = join(projectRoot, "xcode-derived-data");
  rmSync(derivedDataPath, { recursive: true, force: true });
  run("xcodegen", ["generate"], {
    cwd: projectRoot,
  });
  patchPbxprojSystemCapabilities(
    join(projectRoot, "SoraVpnPacketTunnel.xcodeproj", "project.pbxproj"),
    ["com.apple.NetworkExtensions", "com.apple.Sandbox"],
  );
  run(
    "xcodebuild",
    buildSignedXcodeArgs({
      projectPath: join(projectRoot, "SoraVpnPacketTunnel.xcodeproj"),
      scheme: "SoraVpnPacketTunnel",
      derivedDataPath,
      signing,
      buildSettings: {
        PRODUCT_BUNDLE_IDENTIFIER:
          signing?.packetTunnelBundleId || defaultMacPacketTunnelBundleId,
        PRODUCT_NAME:
          signing?.packetTunnelBundleId || defaultMacPacketTunnelBundleId,
      },
    }),
    {
      cwd: repoRoot,
    },
  );
  return join(
    derivedDataPath,
    "Build",
    "Products",
    "Release",
    signing?.packetTunnelBundleId
      ? `${signing.packetTunnelBundleId}.systemextension`
      : `${defaultMacPacketTunnelBundleId}.systemextension`,
  );
};

const stageMacControllerApp = ({
  builtApp,
  packetEnginePath,
  packetTunnelPath,
  signing,
  systemExtensionName,
}) => {
  const packetEngineEntitlementsPath = resolve(
    repoRoot,
    "buildResources",
    "entitlements.vpn-packet-engine.plist",
  );
  const targetRoot = join(distRoot, macDistTarget);
  const retiredMacAliasRoot = join(distRoot, "mac");
  const appRoot = join(targetRoot, macHelperAppName);
  rmSync(retiredMacAliasRoot, { recursive: true, force: true });
  rmSync(targetRoot, { recursive: true, force: true });
  mkdirSync(targetRoot, { recursive: true });
  cpSync(builtApp, appRoot, { recursive: true });
  mkdirSync(join(appRoot, "Contents", "Library", "SystemExtensions"), {
    recursive: true,
  });
  mkdirSync(join(appRoot, "Contents", "Resources", "vpn"), {
    recursive: true,
  });
  const packetEngineBundleId = `${
    signing?.helperBundleId || defaultMacHelperBundleId
  }.packet-engine`;
  const stagedPacketEngineApp = join(
    appRoot,
    "Contents",
    "Resources",
    "vpn",
    macPacketEngineAppName,
  );
  const stagedPacketEngine = join(
    stagedPacketEngineApp,
    "Contents",
    "MacOS",
    macPacketEngineExecutableName,
  );
  mkdirSync(join(stagedPacketEngineApp, "Contents", "MacOS"), {
    recursive: true,
  });
  writeFileSync(
    join(stagedPacketEngineApp, "Contents", "Info.plist"),
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>CFBundleDevelopmentRegion</key>
\t<string>en</string>
\t<key>CFBundleExecutable</key>
\t<string>${macPacketEngineExecutableName}</string>
\t<key>CFBundleIdentifier</key>
\t<string>${packetEngineBundleId}</string>
\t<key>CFBundleInfoDictionaryVersion</key>
\t<string>6.0</string>
\t<key>CFBundleName</key>
\t<string>SoraVpnPacketEngine</string>
\t<key>CFBundlePackageType</key>
\t<string>APPL</string>
\t<key>CFBundleShortVersionString</key>
\t<string>1.0.0</string>
\t<key>CFBundleVersion</key>
\t<string>1</string>
\t<key>LSMinimumSystemVersion</key>
\t<string>14.0</string>
</dict>
</plist>
`,
  );
  cpSync(packetEnginePath, stagedPacketEngine);
  const stagedSystemExtension = join(
    appRoot,
    "Contents",
    "Library",
    "SystemExtensions",
    systemExtensionName,
  );
  cpSync(packetTunnelPath, stagedSystemExtension, { recursive: true });
  signMacPath(stagedPacketEngineApp, signing, {
    entitlementsPath: packetEngineEntitlementsPath,
  });
  signMacPath(stagedSystemExtension, signing, { preserveMetadata: true });
  signMacPath(appRoot, signing, { preserveMetadata: true });
  if (signing) {
    assertMacVpnHelperEntitlements(appRoot);
    assertMacSystemExtensionEntitlements(stagedSystemExtension);
    assertMacPacketTunnelProviderMode(
      appRoot,
      "macOS VPN helper app",
      signing.networkExtensionEntitlement,
    );
    assertMacPacketTunnelProviderMode(
      stagedSystemExtension,
      "macOS VPN system extension",
      signing.networkExtensionEntitlement,
    );
  }
  console.log(`assembled ${appRoot}`);
  return appRoot;
};

const platform = parsePlatformArg();

if (platform === "linux") {
  buildLinuxController();
} else if (platform === "darwin") {
  const macConfig = resolveMacBundleConfig();
  const signing = resolveMacSigningConfig(macConfig);
  const builtControllerApp = buildMacControllerApp(signing);
  const builtPacketEngine = buildMacPacketEngine();
  const builtPacketTunnel = buildMacPacketTunnelExtension(signing);
  stageMacControllerApp({
    builtApp: builtControllerApp,
    packetEnginePath: builtPacketEngine,
    packetTunnelPath: builtPacketTunnel,
    signing,
    systemExtensionName: macConfig.systemExtensionName,
  });
} else {
  console.log(
    `No VPN controller build is configured for platform ${platform}.`,
  );
}

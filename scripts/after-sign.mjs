import { lstatSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const WINDOWS_CERTIFICATE_PATTERN = /^[0-9A-F]{40}$/u;
const APPLE_TEAM_PATTERN = /^[A-Z0-9]{10}$/u;
const APPLE_API_ISSUER_PATTERN =
  /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/u;
const BUNDLE_ID_PATTERN =
  /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?){2,}$/u;
const DEFAULT_PACKET_TUNNEL_BUNDLE_ID = "org.sora.wallet.demo.packet-tunnel";
const DEFAULT_HELPER_BUNDLE_ID = "org.sora.wallet.demo.vpn-controller";
const DEFAULT_APP_GROUP_ID = "group.org.sora.wallet.demo.vpn";
const DEFAULT_MANAGER_DESCRIPTION = "SORA Wallet VPN";
const DEFAULT_NETWORK_EXTENSION_ENTITLEMENT =
  "packet-tunnel-provider-systemextension";
const FIRST_RELEASE_PRODUCT_FILENAME = "SORA Wallet";

const AUTHENTICODE_STATUS_SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  "$expected = $env:SORA_WALLET_EXPECTED_CERT_THUMBPRINT.ToUpperInvariant()",
  "$paths = @($env:SORA_WALLET_MAIN_EXE, $env:SORA_WALLET_NATIVE_PATH)",
  "foreach ($path in $paths) {",
  "  $signature = Get-AuthenticodeSignature -LiteralPath $path",
  "  if ($null -eq $signature -or $signature.Status.ToString() -cne 'Valid') { exit 1 }",
  "  if ($null -eq $signature.SignerCertificate -or $signature.SignerCertificate.Thumbprint.ToUpperInvariant() -cne $expected) { exit 1 }",
  "  if ($null -eq $signature.TimeStamperCertificate) { exit 1 }",
  "}",
  "exit 0",
].join("; ");

const POWERSHELL_ENVIRONMENT_KEYS = [
  "SystemRoot",
  "WINDIR",
  "ComSpec",
  "PATHEXT",
  "PATH",
  "PSModulePath",
  "TEMP",
  "TMP",
];

const readTrimmed = (environment, name, fallback = null) => {
  const value = environment[name];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
};

const containsAsciiControlCharacter = (value) =>
  Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f);
  });

const requireProductFilename = (context) => {
  const filename = context.packager?.appInfo?.productFilename;
  if (filename !== FIRST_RELEASE_PRODUCT_FILENAME) {
    throw new Error(
      `The first-release application filename must be exactly ${FIRST_RELEASE_PRODUCT_FILENAME}.`,
    );
  }
  return filename;
};

const assertPathKind = (path, label, kind, inspectPath) => {
  let stats;
  try {
    stats = inspectPath(path);
  } catch {
    throw new Error(`${label} is missing at ${path}.`);
  }
  const expectedKind = kind === "file" ? stats.isFile() : stats.isDirectory();
  if (!expectedKind || stats.isSymbolicLink()) {
    throw new Error(
      `${label} must be a regular, non-symlink ${kind === "file" ? "file" : "directory"}.`,
    );
  }
};

const combinedProcessOutput = (result) =>
  `${typeof result.stdout === "string" ? result.stdout : ""}${
    typeof result.stderr === "string" ? result.stderr : ""
  }`;

const runMacCodesign = (args, runProcess) => {
  const result = runProcess("/usr/bin/codesign", args, {
    encoding: "utf8",
    env: {
      LC_ALL: "C",
      PATH: "/usr/bin:/bin",
    },
  });
  if (result.error || result.status !== 0) {
    throw new Error(`codesign ${args[0]} failed for ${args.at(-1)}.`);
  }
  return result;
};

const assertAppleTeamSignature = (target, expectedTeam, runProcess) => {
  runMacCodesign(["--verify", "--strict", "--verbose=4", target], runProcess);
  const details = combinedProcessOutput(
    runMacCodesign(["--display", "--verbose=4", target], runProcess),
  );
  const observedTeams = details
    .split(/\r?\n/u)
    .filter((line) => line.startsWith("TeamIdentifier="))
    .map((line) => line.slice("TeamIdentifier=".length));
  if (observedTeams.length !== 1 || observedTeams[0] !== expectedTeam) {
    throw new Error(
      `The packaged macOS signature on ${target} does not belong to Apple team ${expectedTeam}.`,
    );
  }
  if (!details.split(/\r?\n/u).some((line) => line.startsWith("Timestamp="))) {
    throw new Error(
      `The packaged macOS signature on ${target} does not have a trusted timestamp.`,
    );
  }
};

const readMacEntitlements = (target, runProcess) => {
  const codesignResult = runMacCodesign(
    ["--display", "--entitlements", "-", "--xml", target],
    runProcess,
  );
  const plist = codesignResult.stdout;
  if (
    (typeof plist !== "string" && !Buffer.isBuffer(plist)) ||
    plist.length === 0
  ) {
    throw new Error(
      `The packaged macOS signature on ${target} has no entitlements.`,
    );
  }
  const result = runProcess(
    "/usr/bin/plutil",
    ["-convert", "json", "-o", "-", "--", "-"],
    {
      encoding: "utf8",
      env: {
        LC_ALL: "C",
        PATH: "/usr/bin:/bin",
      },
      input: plist,
    },
  );
  if (
    result.error ||
    result.status !== 0 ||
    typeof result.stdout !== "string"
  ) {
    throw new Error(
      `Unable to decode the packaged macOS entitlements on ${target}.`,
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    throw new Error(
      `Unable to decode the packaged macOS entitlements on ${target}.`,
    );
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(
      `Unable to decode the packaged macOS entitlements on ${target}.`,
    );
  }
  return parsed;
};

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

const assertBooleanEntitlement = (target, entitlements, key) => {
  if (!hasOwn(entitlements, key) || entitlements[key] !== true) {
    throw new Error(
      `The packaged macOS signature on ${target} requires ${key}=true.`,
    );
  }
};

const assertStringEntitlement = (target, entitlements, key, expected) => {
  if (!hasOwn(entitlements, key) || entitlements[key] !== expected) {
    throw new Error(
      `The packaged macOS signature on ${target} requires ${key}=${expected}.`,
    );
  }
};

const assertDebuggingDisabled = (target, entitlements) => {
  if (entitlements["com.apple.security.get-task-allow"] === true) {
    throw new Error(
      `The packaged macOS signature on ${target} must not enable com.apple.security.get-task-allow.`,
    );
  }
};

const assertStringArrayEntitlement = (target, entitlements, key, expected) => {
  const actual = entitlements[key];
  if (
    !hasOwn(entitlements, key) ||
    !Array.isArray(actual) ||
    actual.length !== expected.length ||
    actual.some((value, index) => value !== expected[index])
  ) {
    throw new Error(
      `The packaged macOS signature on ${target} requires exact ${key} values (${expected.join(
        ", ",
      )}).`,
    );
  }
};

const assertAbsentEntitlements = (target, entitlements, forbidden) => {
  const present = forbidden.filter((key) => hasOwn(entitlements, key));
  if (present.length > 0) {
    throw new Error(
      `The packaged macOS signature on ${target} carries forbidden VPN entitlements (${present.join(
        ", ",
      )}).`,
    );
  }
};

const readMacPlistValue = (plistPath, key, runProcess) => {
  const result = runProcess(
    "/usr/bin/plutil",
    ["-extract", key, "raw", "-o", "-", plistPath],
    {
      encoding: "utf8",
      env: {
        LC_ALL: "C",
        PATH: "/usr/bin:/bin",
      },
    },
  );
  if (
    result.error ||
    result.status !== 0 ||
    typeof result.stdout !== "string"
  ) {
    throw new Error(`Unable to read ${key} from ${plistPath}.`);
  }
  return result.stdout.trim();
};

const assertMacPlistValue = (plistPath, key, expected, runProcess) => {
  const actual = readMacPlistValue(plistPath, key, runProcess);
  if (actual !== expected) {
    throw new Error(
      `${plistPath} requires ${key}=${expected}; found ${actual || "nothing"}.`,
    );
  }
};

export function verifyWindowsPackageAuthenticode(
  context,
  {
    environment = process.env,
    inspectPath = lstatSync,
    runProcess = spawnSync,
  } = {},
) {
  if (context.electronPlatformName !== "win32") {
    return;
  }
  if (environment.HAS_WIN_SIGNING !== "true") {
    throw new Error(
      "First-release Windows packages require production Authenticode signing.",
    );
  }

  const expectedThumbprint = readTrimmed(
    environment,
    "WIN_EXPECTED_CERT_THUMBPRINT",
  )?.toUpperCase();
  if (
    !expectedThumbprint ||
    !WINDOWS_CERTIFICATE_PATTERN.test(expectedThumbprint)
  ) {
    throw new Error(
      "WIN_EXPECTED_CERT_THUMBPRINT must identify the exact release certificate.",
    );
  }

  const mainExecutablePath = join(
    context.appOutDir,
    `${requireProductFilename(context)}.exe`,
  );
  const nativePath = join(
    context.appOutDir,
    "resources",
    "app.asar.unpacked",
    "dist",
    "native",
    "iroha_js_host.node",
  );
  assertPathKind(
    mainExecutablePath,
    "Signed Windows application executable",
    "file",
    inspectPath,
  );
  assertPathKind(
    nativePath,
    "Signed Windows Iroha native binding",
    "file",
    inspectPath,
  );
  const powershellEnvironment = {
    SORA_WALLET_EXPECTED_CERT_THUMBPRINT: expectedThumbprint,
    SORA_WALLET_MAIN_EXE: mainExecutablePath,
    SORA_WALLET_NATIVE_PATH: nativePath,
  };
  for (const requestedKey of POWERSHELL_ENVIRONMENT_KEYS) {
    const sourceKey = Object.keys(environment).find(
      (candidate) =>
        candidate.toLocaleLowerCase("en-US") ===
        requestedKey.toLocaleLowerCase("en-US"),
    );
    if (sourceKey && typeof environment[sourceKey] === "string") {
      powershellEnvironment[sourceKey] = environment[sourceKey];
    }
  }

  const result = runProcess(
    "powershell.exe",
    [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      AUTHENTICODE_STATUS_SCRIPT,
    ],
    {
      env: powershellEnvironment,
      stdio: "ignore",
      windowsHide: true,
    },
  );
  if (result.error || result.status !== 0) {
    throw new Error(
      "The packaged Windows executable and Iroha native binding must both have valid Authenticode signatures from the exact release certificate.",
    );
  }
}

export function verifyMacPackageSignatures(
  context,
  {
    environment = process.env,
    inspectPath = lstatSync,
    runProcess = spawnSync,
  } = {},
) {
  if (context.electronPlatformName !== "darwin") {
    return;
  }
  if (environment.HAS_MAC_SIGNING !== "true") {
    throw new Error(
      "First-release macOS packages require production Developer ID signing.",
    );
  }

  const teamId = readTrimmed(environment, "APPLE_DEVELOPMENT_TEAM");
  if (!teamId || !APPLE_TEAM_PATTERN.test(teamId)) {
    throw new Error(
      "APPLE_DEVELOPMENT_TEAM must be the exact ten-character release team ID.",
    );
  }
  const notarizationKeyPath = readTrimmed(environment, "APPLE_API_KEY");
  const notarizationKeyId = readTrimmed(environment, "APPLE_API_KEY_ID");
  const notarizationIssuer = readTrimmed(environment, "APPLE_API_ISSUER");
  if (
    !notarizationKeyPath ||
    !notarizationKeyId ||
    !APPLE_TEAM_PATTERN.test(notarizationKeyId) ||
    !notarizationIssuer ||
    !APPLE_API_ISSUER_PATTERN.test(notarizationIssuer)
  ) {
    throw new Error(
      "First-release macOS packages require complete App Store Connect notarization credentials.",
    );
  }
  assertPathKind(
    notarizationKeyPath,
    "App Store Connect notarization private key",
    "file",
    inspectPath,
  );
  const packetTunnelBundleId = readTrimmed(
    environment,
    "SORANET_VPN_PACKET_TUNNEL_BUNDLE_ID",
    DEFAULT_PACKET_TUNNEL_BUNDLE_ID,
  );
  const helperBundleId = readTrimmed(
    environment,
    "SORANET_VPN_HELPER_BUNDLE_ID",
    DEFAULT_HELPER_BUNDLE_ID,
  );
  const appGroupId = readTrimmed(
    environment,
    "SORANET_VPN_APP_GROUP_ID",
    DEFAULT_APP_GROUP_ID,
  );
  const managerDescription = readTrimmed(
    environment,
    "SORANET_VPN_MANAGER_DESCRIPTION",
    DEFAULT_MANAGER_DESCRIPTION,
  );
  const networkExtensionEntitlement = readTrimmed(
    environment,
    "APPLE_VPN_NETWORK_EXTENSION_ENTITLEMENT",
    DEFAULT_NETWORK_EXTENSION_ENTITLEMENT,
  );
  if (
    !BUNDLE_ID_PATTERN.test(packetTunnelBundleId) ||
    !BUNDLE_ID_PATTERN.test(helperBundleId) ||
    helperBundleId === packetTunnelBundleId ||
    `${helperBundleId}.packet-engine` === packetTunnelBundleId
  ) {
    throw new Error(
      "The macOS VPN helper, packet-engine, and PacketTunnel IDs must be distinct reverse-DNS bundle identifiers.",
    );
  }
  if (!BUNDLE_ID_PATTERN.test(appGroupId) || !appGroupId.startsWith("group.")) {
    throw new Error(
      "SORANET_VPN_APP_GROUP_ID must be a group-prefixed reverse-DNS identifier.",
    );
  }
  if (
    !managerDescription ||
    managerDescription.length > 128 ||
    containsAsciiControlCharacter(managerDescription)
  ) {
    throw new Error(
      "SORANET_VPN_MANAGER_DESCRIPTION must contain at most 128 characters and no control characters.",
    );
  }
  if (networkExtensionEntitlement !== DEFAULT_NETWORK_EXTENSION_ENTITLEMENT) {
    throw new Error(
      `APPLE_VPN_NETWORK_EXTENSION_ENTITLEMENT must be exactly ${DEFAULT_NETWORK_EXTENSION_ENTITLEMENT} for the first release.`,
    );
  }

  const applicationPath = join(
    context.appOutDir,
    `${requireProductFilename(context)}.app`,
  );
  const helperPath = join(
    applicationPath,
    "Contents",
    "Helpers",
    "SoraVpnController.app",
  );
  const systemExtensionPath = join(
    helperPath,
    "Contents",
    "Library",
    "SystemExtensions",
    `${packetTunnelBundleId}.systemextension`,
  );
  const packetEnginePath = join(
    helperPath,
    "Contents",
    "Resources",
    "vpn",
    "SoraVpnPacketEngine.app",
  );
  const nativePath = join(
    applicationPath,
    "Contents",
    "Resources",
    "app.asar.unpacked",
    "dist",
    "native",
    "iroha_js_host.node",
  );
  for (const [path, label, kind] of [
    [applicationPath, "Packaged macOS application", "directory"],
    [helperPath, "Packaged macOS VPN controller app", "directory"],
    [systemExtensionPath, "Packaged macOS VPN system extension", "directory"],
    [packetEnginePath, "Packaged macOS VPN packet engine", "directory"],
    [nativePath, "Packaged macOS Iroha native binding", "file"],
  ]) {
    assertPathKind(path, label, kind, inspectPath);
  }

  const helperInfoPath = join(helperPath, "Contents", "Info.plist");
  const systemExtensionInfoPath = join(
    systemExtensionPath,
    "Contents",
    "Info.plist",
  );
  const packetEngineInfoPath = join(packetEnginePath, "Contents", "Info.plist");
  for (const [path, label] of [
    [helperInfoPath, "Packaged macOS VPN controller Info.plist"],
    [systemExtensionInfoPath, "Packaged macOS VPN system-extension Info.plist"],
    [packetEngineInfoPath, "Packaged macOS VPN packet-engine Info.plist"],
  ]) {
    assertPathKind(path, label, "file", inspectPath);
  }

  for (const [plistPath, key, expected] of [
    [helperInfoPath, "CFBundleIdentifier", helperBundleId],
    [helperInfoPath, "CFBundleExecutable", "sora-vpn-controller"],
    [helperInfoPath, "SoraVpnPacketTunnelBundleId", packetTunnelBundleId],
    [helperInfoPath, "SoraVpnAppGroupId", appGroupId],
    [helperInfoPath, "SoraVpnManagerDescription", managerDescription],
    [systemExtensionInfoPath, "CFBundleIdentifier", packetTunnelBundleId],
    [systemExtensionInfoPath, "CFBundleExecutable", "SoraVpnPacketTunnel"],
    [systemExtensionInfoPath, "CFBundlePackageType", "SYSX"],
    [systemExtensionInfoPath, "NetworkExtension.NEMachServiceName", appGroupId],
    [
      packetEngineInfoPath,
      "CFBundleIdentifier",
      `${helperBundleId}.packet-engine`,
    ],
    [packetEngineInfoPath, "CFBundleExecutable", "sora-vpn-packet-engine"],
  ]) {
    assertMacPlistValue(plistPath, key, expected, runProcess);
  }

  runMacCodesign(
    ["--verify", "--deep", "--strict", "--verbose=4", applicationPath],
    runProcess,
  );
  for (const target of [
    applicationPath,
    helperPath,
    systemExtensionPath,
    packetEnginePath,
    nativePath,
  ]) {
    assertAppleTeamSignature(target, teamId, runProcess);
  }

  const mainEntitlements = readMacEntitlements(applicationPath, runProcess);
  assertDebuggingDisabled(applicationPath, mainEntitlements);
  assertAbsentEntitlements(applicationPath, mainEntitlements, [
    "com.apple.developer.networking.networkextension",
    "com.apple.developer.system-extension.install",
    "com.apple.security.application-groups",
  ]);
  const helperEntitlements = readMacEntitlements(helperPath, runProcess);
  assertDebuggingDisabled(helperPath, helperEntitlements);
  assertBooleanEntitlement(
    helperPath,
    helperEntitlements,
    "com.apple.security.app-sandbox",
  );
  assertStringEntitlement(
    helperPath,
    helperEntitlements,
    "com.apple.developer.team-identifier",
    teamId,
  );
  assertStringEntitlement(
    helperPath,
    helperEntitlements,
    "com.apple.application-identifier",
    `${teamId}.${helperBundleId}`,
  );
  assertBooleanEntitlement(
    helperPath,
    helperEntitlements,
    "com.apple.developer.system-extension.install",
  );
  assertStringArrayEntitlement(
    helperPath,
    helperEntitlements,
    "com.apple.developer.networking.networkextension",
    [networkExtensionEntitlement],
  );
  assertStringArrayEntitlement(
    helperPath,
    helperEntitlements,
    "com.apple.security.application-groups",
    [appGroupId],
  );
  const systemExtensionEntitlements = readMacEntitlements(
    systemExtensionPath,
    runProcess,
  );
  assertDebuggingDisabled(systemExtensionPath, systemExtensionEntitlements);
  assertBooleanEntitlement(
    systemExtensionPath,
    systemExtensionEntitlements,
    "com.apple.security.app-sandbox",
  );
  assertStringEntitlement(
    systemExtensionPath,
    systemExtensionEntitlements,
    "com.apple.developer.team-identifier",
    teamId,
  );
  assertStringEntitlement(
    systemExtensionPath,
    systemExtensionEntitlements,
    "com.apple.application-identifier",
    `${teamId}.${packetTunnelBundleId}`,
  );
  assertStringArrayEntitlement(
    systemExtensionPath,
    systemExtensionEntitlements,
    "com.apple.developer.networking.networkextension",
    [networkExtensionEntitlement],
  );
  assertStringArrayEntitlement(
    systemExtensionPath,
    systemExtensionEntitlements,
    "com.apple.security.application-groups",
    [appGroupId],
  );
  const packetEngineEntitlements = readMacEntitlements(
    packetEnginePath,
    runProcess,
  );
  assertDebuggingDisabled(packetEnginePath, packetEngineEntitlements);
  assertBooleanEntitlement(
    packetEnginePath,
    packetEngineEntitlements,
    "com.apple.security.app-sandbox",
  );
  assertBooleanEntitlement(
    packetEnginePath,
    packetEngineEntitlements,
    "com.apple.security.inherit",
  );
  assertAbsentEntitlements(packetEnginePath, packetEngineEntitlements, [
    "com.apple.developer.networking.networkextension",
    "com.apple.developer.system-extension.install",
    "com.apple.security.application-groups",
  ]);
}

export default function verifyPackagedSignatures(context) {
  verifyWindowsPackageAuthenticode(context);
  verifyMacPackageSignatures(context);
}

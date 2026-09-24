import { extractFile, listPackage } from "@electron/asar";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { join } from "node:path";
import {
  REVIEWED_IROHA_COMMIT,
  verifyInstalledReleaseDependencies,
} from "./iroha-js-release-source.mjs";
import { resolveNativeBuildRequirement } from "./postinstallNativeCheck.mjs";

const DEFAULT_PACKET_TUNNEL_BUNDLE_ID = "org.sora.wallet.demo.packet-tunnel";
const FIRST_RELEASE_PRODUCT_FILENAME = "SORA Wallet";
const BUNDLE_ID_PATTERN =
  /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?){2,}$/u;
const NATIVE_MODULE_FILENAME = "iroha_js_host.node";
const NATIVE_MANIFEST_FILENAME = "iroha_js_host.checksums.json";
const ARCHIVE_NATIVE_ROOT = "/dist/native";
const FORBIDDEN_ARCHIVE_ROOTS = [
  "/dist/native-v1",
  "/node_modules/@iroha/iroha-js",
];
const FORBIDDEN_MAC_BUNDLE_SUFFIXES = [".appex", ".bundle"];
const LINUX_VPN_CONTROLLER_FILENAME = "sora-vpn-controller";
const BUILDER_ARCH_NAMES = new Map([
  [1, "x64"],
  [3, "arm64"],
]);
const RELEASE_NATIVE_PROVENANCE = Object.freeze({
  cargoProfile: "release",
  sourceGitRevision: REVIEWED_IROHA_COMMIT,
  sourceTreeClean: true,
});

const assertDirectory = (path, label, inspectPath = lstatSync) => {
  let stats;
  try {
    stats = inspectPath(path);
  } catch {
    throw new Error(`${label} is missing at ${path}.`);
  }
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error(`${label} must be a regular, non-symlink directory.`);
  }
};

const assertFile = (path, label, inspectPath = lstatSync) => {
  let stats;
  try {
    stats = inspectPath(path);
  } catch {
    throw new Error(`${label} is missing at ${path}.`);
  }
  if (
    !stats.isFile() ||
    stats.isSymbolicLink() ||
    !Number.isSafeInteger(stats.size) ||
    stats.size <= 0
  ) {
    throw new Error(`${label} must be a non-empty, regular, non-symlink file.`);
  }
  return stats;
};

const assertExecutableFile = (path, label, inspectPath = lstatSync) => {
  const stats = assertFile(path, label, inspectPath);
  if ((stats.mode & 0o111) === 0) {
    throw new Error(`${label} must have an executable mode.`);
  }
};

const assertPlainTree = (
  root,
  { inspectPath = lstatSync, readDirectory = readdirSync } = {},
) => {
  for (const entry of readDirectory(root)) {
    const entryPath = join(root, entry);
    const stats = inspectPath(entryPath);
    if (stats.isSymbolicLink()) {
      throw new Error(
        `The macOS VPN helper staging tree must not contain symlinks (${entryPath}).`,
      );
    }
    if (stats.isDirectory()) {
      assertPlainTree(entryPath, { inspectPath, readDirectory });
    } else if (!stats.isFile()) {
      throw new Error(
        `The macOS VPN helper staging tree contains an unsupported filesystem entry (${entryPath}).`,
      );
    }
  }
};

const assertCurrentMacCodeBundleLayout = (
  root,
  allowedCodeBundles,
  { inspectPath = lstatSync, readDirectory = readdirSync } = {},
) => {
  for (const entry of readDirectory(root)) {
    const entryPath = join(root, entry);
    const stats = inspectPath(entryPath);
    const normalizedName = entry.toLocaleLowerCase("en-US");
    if (
      FORBIDDEN_MAC_BUNDLE_SUFFIXES.some((suffix) =>
        normalizedName.endsWith(suffix),
      )
    ) {
      throw new Error(
        `The macOS VPN helper contains a forbidden legacy code bundle (${entryPath}).`,
      );
    }
    if (
      (normalizedName.endsWith(".app") ||
        normalizedName.endsWith(".systemextension")) &&
      !allowedCodeBundles.has(entryPath)
    ) {
      throw new Error(
        `The macOS VPN helper contains an unexpected nested code bundle (${entryPath}).`,
      );
    }
    if (stats.isDirectory()) {
      assertCurrentMacCodeBundleLayout(entryPath, allowedCodeBundles, {
        inspectPath,
        readDirectory,
      });
    }
  }
};

const exactDirectoryEntries = (
  path,
  expected,
  readDirectory = readdirSync,
  label = "macOS VPN helper",
) => {
  const actual = readDirectory(path).toSorted();
  const wanted = [...expected].toSorted();
  if (
    actual.length !== wanted.length ||
    actual.some((entry, index) => entry !== wanted[index])
  ) {
    throw new Error(
      `Unexpected ${label} contents at ${path}: expected ${wanted.join(
        ", ",
      )}; found ${actual.join(", ") || "nothing"}.`,
    );
  }
};

const isAtOrBelow = (entry, root) =>
  entry === root || entry.startsWith(`${root}/`);

export const verifyReleaseSdkSelection = (
  context,
  {
    environment = process.env,
    verifyInstalledSdk = verifyInstalledReleaseDependencies,
  } = {},
) => {
  const irohaRoot = environment.IROHA_ROOT;
  if (typeof irohaRoot !== "string" || !irohaRoot) {
    throw new Error(
      "First-release packaging requires the authenticated IROHA_ROOT release source.",
    );
  }
  const marker = verifyInstalledSdk(context.packager.projectDir, irohaRoot);
  if (
    !marker ||
    typeof marker !== "object" ||
    marker.source_commit !== REVIEWED_IROHA_COMMIT
  ) {
    throw new Error(
      "First-release packaging requires the exact reviewed installed Iroha SDK.",
    );
  }
  return marker;
};

export const verifyReleaseNativeStaging = (
  context,
  { inspectNativeBinding = resolveNativeBuildRequirement } = {},
) => {
  const archName = BUILDER_ARCH_NAMES.get(context.arch);
  const supported =
    (context.electronPlatformName === "darwin" &&
      (archName === "x64" || archName === "arm64")) ||
    ((context.electronPlatformName === "linux" ||
      context.electronPlatformName === "win32") &&
      archName === "x64");
  if (!supported) {
    throw new Error(
      `Unsupported first-release native target ${String(context.electronPlatformName)}/${archName ?? String(context.arch)}.`,
    );
  }
  const stagedRoot = join(context.packager.projectDir, "dist");
  const platformKey = `${context.electronPlatformName}-${archName}`;
  const result = inspectNativeBinding(
    stagedRoot,
    platformKey,
    undefined,
    RELEASE_NATIVE_PROVENANCE,
  );
  if (result.shouldBuild) {
    throw new Error(
      `First-release packaging requires the exact reviewed release native binding (${result.reason}).`,
    );
  }
  return {
    nativeManifestPath: join(stagedRoot, "native", NATIVE_MANIFEST_FILENAME),
    nativeModulePath: join(stagedRoot, "native", NATIVE_MODULE_FILENAME),
    platformKey,
    stagedRoot,
  };
};

export const verifyPackagedNativePairMatchesStaging = (
  staging,
  packaged,
  { readArchiveEntry = extractFile, readPhysicalFile = readFileSync } = {},
) => {
  const sourceModule = readPhysicalFile(staging.nativeModulePath);
  const packagedModule = readPhysicalFile(packaged.nativeModulePath);
  const sourceManifest = readPhysicalFile(staging.nativeManifestPath);
  const packagedManifest = readArchiveEntry(
    packaged.archivePath,
    `dist/native/${NATIVE_MANIFEST_FILENAME}`,
  );
  if (
    !Buffer.isBuffer(sourceModule) ||
    !Buffer.isBuffer(packagedModule) ||
    !sourceModule.equals(packagedModule)
  ) {
    throw new Error(
      "The packaged Iroha native binding differs from the reviewed staging artifact.",
    );
  }
  if (
    !Buffer.isBuffer(sourceManifest) ||
    !Buffer.isBuffer(packagedManifest) ||
    !sourceManifest.equals(packagedManifest)
  ) {
    throw new Error(
      "The packaged Iroha native manifest differs from the reviewed staging artifact.",
    );
  }
};

export const verifyPackagedRuntimeContents = (
  context,
  {
    inspectPath = lstatSync,
    listArchive = listPackage,
    readDirectory = readdirSync,
  } = {},
) => {
  if (
    !new Set(["darwin", "linux", "win32"]).has(context.electronPlatformName)
  ) {
    throw new Error(
      `Unsupported first-release packaging platform ${String(context.electronPlatformName)}.`,
    );
  }
  const productFilename = context.packager?.appInfo?.productFilename;
  if (productFilename !== FIRST_RELEASE_PRODUCT_FILENAME) {
    throw new Error(
      `The first-release application filename must be exactly ${FIRST_RELEASE_PRODUCT_FILENAME}.`,
    );
  }
  const resourcesPath =
    context.electronPlatformName === "darwin"
      ? join(
          context.appOutDir,
          `${productFilename}.app`,
          "Contents",
          "Resources",
        )
      : join(context.appOutDir, "resources");
  const archivePath = join(resourcesPath, "app.asar");
  const vpnResourcesPath = join(resourcesPath, "vpn");
  const unpackedNativePath = join(
    resourcesPath,
    "app.asar.unpacked",
    "dist",
    "native",
  );
  assertFile(archivePath, "Packaged Electron ASAR", inspectPath);
  assertDirectory(
    unpackedNativePath,
    "Packaged Iroha native directory",
    inspectPath,
  );
  exactDirectoryEntries(
    unpackedNativePath,
    [NATIVE_MODULE_FILENAME],
    readDirectory,
    "packaged Iroha native",
  );
  assertFile(
    join(unpackedNativePath, NATIVE_MODULE_FILENAME),
    "Packaged Iroha native binding",
    inspectPath,
  );

  let archiveEntries;
  try {
    archiveEntries = listArchive(archivePath);
  } catch (error) {
    throw new Error(
      `Unable to inspect the packaged Electron ASAR: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  if (
    !Array.isArray(archiveEntries) ||
    archiveEntries.some((entry) => typeof entry !== "string") ||
    new Set(archiveEntries).size !== archiveEntries.length
  ) {
    throw new Error("The packaged Electron ASAR inventory is malformed.");
  }
  const expectedNativeEntries = [
    `${ARCHIVE_NATIVE_ROOT}/${NATIVE_MANIFEST_FILENAME}`,
    `${ARCHIVE_NATIVE_ROOT}/${NATIVE_MODULE_FILENAME}`,
  ].toSorted();
  const actualNativeEntries = archiveEntries
    .filter((entry) => isAtOrBelow(entry, ARCHIVE_NATIVE_ROOT))
    .filter((entry) => entry !== ARCHIVE_NATIVE_ROOT)
    .toSorted();
  if (
    actualNativeEntries.length !== expectedNativeEntries.length ||
    actualNativeEntries.some(
      (entry, index) => entry !== expectedNativeEntries[index],
    )
  ) {
    throw new Error(
      `Packaged native ASAR inventory mismatch: expected ${expectedNativeEntries.join(
        ", ",
      )}; found ${actualNativeEntries.join(", ") || "nothing"}.`,
    );
  }
  const forbiddenEntry = archiveEntries.find((entry) => {
    const normalized = entry.toLocaleLowerCase("en-US");
    return FORBIDDEN_ARCHIVE_ROOTS.some((root) =>
      isAtOrBelow(normalized, root),
    );
  });
  if (forbiddenEntry) {
    throw new Error(
      `The packaged Electron ASAR contains forbidden first-release content (${forbiddenEntry}).`,
    );
  }

  if (context.electronPlatformName === "linux") {
    assertDirectory(
      vpnResourcesPath,
      "Packaged Linux VPN controller directory",
      inspectPath,
    );
    exactDirectoryEntries(
      vpnResourcesPath,
      [LINUX_VPN_CONTROLLER_FILENAME],
      readDirectory,
      "packaged Linux VPN controller",
    );
    assertExecutableFile(
      join(vpnResourcesPath, LINUX_VPN_CONTROLLER_FILENAME),
      "Packaged Linux VPN controller",
      inspectPath,
    );
  } else if (existsSync(vpnResourcesPath)) {
    throw new Error(
      `Unexpected top-level VPN runtime for ${context.electronPlatformName} at ${vpnResourcesPath}.`,
    );
  }

  return {
    archivePath,
    nativeModulePath: join(unpackedNativePath, NATIVE_MODULE_FILENAME),
  };
};

export const resolvePacketTunnelBundleId = (environment = process.env) => {
  const configured = environment.SORANET_VPN_PACKET_TUNNEL_BUNDLE_ID;
  const bundleId =
    typeof configured === "string" && configured.trim()
      ? configured.trim()
      : DEFAULT_PACKET_TUNNEL_BUNDLE_ID;
  if (!BUNDLE_ID_PATTERN.test(bundleId)) {
    throw new Error(
      "SORANET_VPN_PACKET_TUNNEL_BUNDLE_ID must be a reverse-DNS bundle identifier.",
    );
  }
  return bundleId;
};

export const verifyMacVpnControllerBundle = (
  controllerAppPath,
  {
    environment = process.env,
    inspectPath = lstatSync,
    readDirectory = readdirSync,
  } = {},
) => {
  const packetTunnelBundleId = resolvePacketTunnelBundleId(environment);
  const systemExtensionsPath = join(
    controllerAppPath,
    "Contents",
    "Library",
    "SystemExtensions",
  );
  const systemExtensionName = `${packetTunnelBundleId}.systemextension`;
  const systemExtensionPath = join(systemExtensionsPath, systemExtensionName);
  const packetEngineRoot = join(
    controllerAppPath,
    "Contents",
    "Resources",
    "vpn",
  );
  const packetEngineAppPath = join(packetEngineRoot, "SoraVpnPacketEngine.app");

  assertDirectory(controllerAppPath, "macOS VPN controller app", inspectPath);
  assertFile(
    join(controllerAppPath, "Contents", "MacOS", "sora-vpn-controller"),
    "macOS VPN controller executable",
    inspectPath,
  );
  assertDirectory(
    systemExtensionsPath,
    "macOS VPN SystemExtensions directory",
    inspectPath,
  );
  exactDirectoryEntries(
    systemExtensionsPath,
    [systemExtensionName],
    readDirectory,
  );
  assertDirectory(
    systemExtensionPath,
    "macOS VPN packet-tunnel system extension",
    inspectPath,
  );
  assertFile(
    join(systemExtensionPath, "Contents", "MacOS", "SoraVpnPacketTunnel"),
    "macOS VPN packet-tunnel executable",
    inspectPath,
  );
  assertDirectory(
    packetEngineRoot,
    "macOS VPN packet-engine directory",
    inspectPath,
  );
  exactDirectoryEntries(
    packetEngineRoot,
    ["SoraVpnPacketEngine.app"],
    readDirectory,
  );
  assertDirectory(
    packetEngineAppPath,
    "macOS VPN packet-engine app",
    inspectPath,
  );
  assertFile(
    join(packetEngineAppPath, "Contents", "MacOS", "sora-vpn-packet-engine"),
    "macOS VPN packet-engine executable",
    inspectPath,
  );
  assertPlainTree(controllerAppPath, { inspectPath, readDirectory });
  assertCurrentMacCodeBundleLayout(
    controllerAppPath,
    new Set([packetEngineAppPath, systemExtensionPath]),
    { inspectPath, readDirectory },
  );

  return {
    packetEngineAppPath,
    packetTunnelBundleId,
    systemExtensionPath,
  };
};

export const stageMacVpnController = (
  context,
  {
    copyDirectory = cpSync,
    environment = process.env,
    pathExists = existsSync,
    readDirectory = readdirSync,
  } = {},
) => {
  if (context.electronPlatformName !== "darwin") {
    return;
  }

  const appBundlePath = join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
  );
  const controllerSourceRoot = join(
    context.packager.projectDir,
    "dist-native",
    "vpn",
    "darwin",
  );
  const retiredMacAliasRoot = join(
    context.packager.projectDir,
    "dist-native",
    "vpn",
    "mac",
  );
  const controllerAppSource = join(
    controllerSourceRoot,
    "SoraVpnController.app",
  );
  assertDirectory(appBundlePath, "packaged macOS application");
  if (pathExists(retiredMacAliasRoot)) {
    throw new Error(
      `The retired macOS VPN staging alias must be absent (${retiredMacAliasRoot}).`,
    );
  }
  assertDirectory(
    controllerSourceRoot,
    "macOS VPN controller staging directory",
  );
  exactDirectoryEntries(
    controllerSourceRoot,
    ["SoraVpnController.app"],
    readDirectory,
    "macOS VPN controller staging",
  );
  verifyMacVpnControllerBundle(controllerAppSource, { environment });

  const helpersDir = join(appBundlePath, "Contents", "Helpers");
  mkdirSync(helpersDir, { recursive: true });
  const controllerTarget = join(helpersDir, "SoraVpnController.app");
  if (pathExists(controllerTarget)) {
    throw new Error(
      `Refusing to merge the macOS VPN controller into an existing bundle at ${controllerTarget}.`,
    );
  }
  copyDirectory(controllerAppSource, controllerTarget, {
    errorOnExist: true,
    force: false,
    recursive: true,
  });
  verifyMacVpnControllerBundle(controllerTarget, { environment });
};

export default async function afterPack(context) {
  verifyReleaseSdkSelection(context);
  const staging = verifyReleaseNativeStaging(context);
  const packaged = verifyPackagedRuntimeContents(context);
  verifyPackagedNativePairMatchesStaging(staging, packaged);
  stageMacVpnController(context);
}

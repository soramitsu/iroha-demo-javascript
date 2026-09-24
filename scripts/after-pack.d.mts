import type { Stats } from "node:fs";

export type AfterPackContext = Readonly<{
  arch?: number;
  electronPlatformName?: string;
  appOutDir: string;
  packager: Readonly<{
    appInfo: Readonly<{ productFilename: string }>;
    projectDir: string;
  }>;
}>;

export type ReleaseNativeStagingVerification = Readonly<{
  nativeManifestPath: string;
  nativeModulePath: string;
  platformKey: string;
  stagedRoot: string;
}>;

export function verifyReleaseNativeStaging(
  context: AfterPackContext,
  options?: Readonly<{
    inspectNativeBinding?: (
      sdkRoot: string,
      platformKey: string,
      loadNativeModule: undefined,
      provenanceRequirement: Readonly<{
        cargoProfile: "release";
        sourceGitRevision: string;
        sourceTreeClean: true;
      }>,
    ) => Readonly<{ shouldBuild: boolean; reason: string }>;
  }>,
): ReleaseNativeStagingVerification;

export function verifyReleaseSdkSelection(
  context: AfterPackContext,
  options?: Readonly<{
    environment?: NodeJS.ProcessEnv;
    verifyInstalledSdk?: (
      projectRoot: string,
      irohaRoot: string,
    ) => Readonly<{ source_commit: string }>;
  }>,
): Readonly<{ source_commit: string }>;

export function verifyPackagedNativePairMatchesStaging(
  staging: ReleaseNativeStagingVerification,
  packaged: PackagedRuntimeVerification,
  options?: Readonly<{
    readArchiveEntry?: (archivePath: string, filename: string) => Buffer;
    readPhysicalFile?: (path: string) => Buffer;
  }>,
): void;

export type MacVpnBundleVerification = Readonly<{
  packetEngineAppPath: string;
  packetTunnelBundleId: string;
  systemExtensionPath: string;
}>;

export type PackagedRuntimeVerification = Readonly<{
  archivePath: string;
  nativeModulePath: string;
}>;

export function verifyPackagedRuntimeContents(
  context: AfterPackContext,
  options?: Readonly<{
    inspectPath?: (
      path: string,
    ) => Pick<
      Stats,
      "isDirectory" | "isFile" | "isSymbolicLink" | "mode" | "size"
    >;
    listArchive?: (path: string) => string[];
    readDirectory?: (path: string) => string[];
  }>,
): PackagedRuntimeVerification;

export function resolvePacketTunnelBundleId(
  environment?: NodeJS.ProcessEnv,
): string;

export function verifyMacVpnControllerBundle(
  controllerAppPath: string,
  options?: Readonly<{
    environment?: NodeJS.ProcessEnv;
  }>,
): MacVpnBundleVerification;

export function stageMacVpnController(context: AfterPackContext): void;

export default function afterPack(context: AfterPackContext): Promise<void>;

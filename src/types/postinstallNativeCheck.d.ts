declare module "../scripts/postinstallNativeCheck.mjs" {
  export interface NativeBuildRequirement {
    shouldBuild: boolean;
    reason: string;
    nativeModulePath: string;
    checksumManifestPath: string;
    expectedSha256?: string;
    actualSha256?: string;
  }

  export function resolveNativeBuildRequirement(
    irohaPackagePath: string,
    platformKey?: string,
  ): NativeBuildRequirement;
}

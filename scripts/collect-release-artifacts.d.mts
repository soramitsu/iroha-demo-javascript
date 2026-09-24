export type ReleasePlatform = "all" | "linux" | "mac" | "win";
export type ReleaseArchitecture = "arm64" | "x64";

export type ReleaseArtifactInventory = Readonly<{
  sourceDirectory: string;
  version: string;
  platform: ReleasePlatform;
  arch?: ReleaseArchitecture;
}>;

export function expectedReleaseArtifactNames(
  input: Pick<ReleaseArtifactInventory, "arch" | "platform" | "version">,
): string[];

export function validateReleaseArtifactInventory(
  input: ReleaseArtifactInventory,
): string[];

export function collectReleaseArtifacts(
  input: ReleaseArtifactInventory & Readonly<{ outputDirectory: string }>,
): string[];

export const FIRST_RELEASE_FORBIDDEN_RUNTIME_MARKERS: readonly string[];

export function verifyFirstReleaseRuntimeBuild(options?: {
  distRoot?: string;
}): string[];

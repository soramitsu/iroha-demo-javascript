export interface PreparedIrohaReleaseSource {
  readonly fingerprint: string;
  readonly gpgHome: string;
  readonly sourceRoot: string;
}

export interface PrepareIrohaReleaseSourceOptions {
  encodedPublicKey?: string;
  expectedRevision?: string;
  githubEnvironmentPath?: string;
  irohaRoot: string;
  runnerTemporaryRoot?: string;
}

export function decodeCanonicalSignerPublicKey(encoded: unknown): Buffer;

export function primaryPublicKeyFingerprints(colonListing: unknown): string[];

export function assertExactReviewedPublicKey(
  publicListing: unknown,
  secretListing: unknown,
): void;

export function prepareIrohaReleaseSource(
  options: PrepareIrohaReleaseSourceOptions,
): PreparedIrohaReleaseSource;

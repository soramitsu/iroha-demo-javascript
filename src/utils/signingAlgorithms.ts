export const DEFAULT_SIGNING_ALGORITHM = "ed25519";

export type SigningAlgorithm = string;

const SIGNING_ALGORITHM_LABELS: Record<string, string> = {
  ed25519: "Ed25519",
  secp256k1: "Secp256k1",
  bls_normal: "BLS Normal",
  bls_small: "BLS Small",
  "ml-dsa": "ML-DSA",
  "gost3410-2012-256-paramset-a": "GOST 256 A",
  "gost3410-2012-256-paramset-b": "GOST 256 B",
  "gost3410-2012-256-paramset-c": "GOST 256 C",
  "gost3410-2012-512-paramset-a": "GOST 512 A",
  "gost3410-2012-512-paramset-b": "GOST 512 B",
  sm2: "SM2",
};

export const normalizeStoredSigningAlgorithm = (
  value: unknown,
): SigningAlgorithm => {
  if (value === null || value === undefined) {
    return DEFAULT_SIGNING_ALGORITHM;
  }
  if (typeof value !== "string") {
    return DEFAULT_SIGNING_ALGORITHM;
  }
  const normalized = value.trim().toLowerCase();
  if (!normalized || !/^[\x20-\x7e]{1,128}$/.test(normalized)) {
    return DEFAULT_SIGNING_ALGORITHM;
  }
  return normalized || DEFAULT_SIGNING_ALGORITHM;
};

export const signingAlgorithmLabel = (value: unknown): string => {
  const normalized = normalizeStoredSigningAlgorithm(value);
  return SIGNING_ALGORITHM_LABELS[normalized] ?? normalized;
};

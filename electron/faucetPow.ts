import { createHash, scrypt, scryptSync } from "crypto";
import { availableParallelism } from "os";
import { NetworkId } from "@iroha/iroha-js/canonical-request";

export type FaucetPowPuzzle = {
  algorithm: "scrypt-leading-zero-bits-v1";
  network_id: string;
  chain_discriminant: number;
  difficulty_bits: number;
  anchor_height: number;
  anchor_block_hash_hex: string;
  challenge_salt_hex: string | null;
  scrypt_log_n: number;
  scrypt_r: number;
  scrypt_p: number;
  max_anchor_age_blocks: number;
};

export type SolvedFaucetPow = {
  anchorHeight: number;
  nonceHex: string;
  attempts: number;
};

export type FaucetPowSolveOptions = {
  maxAttempts?: number;
  concurrency?: number;
  signal?: AbortSignal;
};

type FaucetPowDigestOptions = {
  networkId: NetworkId;
  challengeSaltHex: string | null;
  scryptLogN: number;
  scryptR: number;
  scryptP: number;
};

type FaucetPowScryptOptions = {
  N: number;
  r: number;
  p: number;
  maxmem: number;
};

// Must match Torii `FAUCET_POW_DOMAIN_SEPARATOR` / `FAUCET_POW_ALGORITHM`
// (crates/iroha_torii/src/routing.rs) and iroha_wallet's faucet_pow.rs.
const DOMAIN_SEPARATOR = Buffer.from("iroha:accounts:faucet:pow:v1", "utf8");
const SUPPORTED_ALGORITHM = "scrypt-leading-zero-bits-v1";
const DIGEST_LENGTH = 32;
const DEFAULT_ATTEMPT_MULTIPLIER = 4;
const MAX_DIFFICULTY_BITS = 20;
const MAX_ATTEMPTS = 1_048_576;
const MAX_CONCURRENCY = 4;
const MAX_SCRYPT_LOG_N = 15;
const MAX_SCRYPT_R = 8;
const MAX_SCRYPT_P = 2;
const MAX_SCRYPT_MEMORY_BYTES = 64 * 1024 * 1024;
const MAX_ANCHOR_AGE_BLOCKS = 10_000;
const DEFAULT_CONCURRENCY = Math.max(
  1,
  Math.min(MAX_CONCURRENCY, availableParallelism?.() ?? 1),
);

const PUZZLE_KEYS = Object.freeze(
  [
    "algorithm",
    "network_id",
    "chain_discriminant",
    "difficulty_bits",
    "anchor_height",
    "anchor_block_hash_hex",
    "challenge_salt_hex",
    "scrypt_log_n",
    "scrypt_r",
    "scrypt_p",
    "max_anchor_age_blocks",
  ].sort(),
);

const createAbortError = () => {
  const error = new Error("Faucet request canceled.");
  error.name = "AbortError";
  return error;
};

const readAbortReason = (signal: AbortSignal) =>
  signal.reason instanceof Error ? signal.reason : createAbortError();

const throwIfAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) {
    throw readAbortReason(signal);
  }
};

export function leadingZeroBits(bytes: Uint8Array): number {
  let total = 0;
  for (const byte of bytes) {
    if (byte === 0) {
      total += 8;
      continue;
    }
    total += Math.clz32(byte) - 24;
    break;
  }
  return total;
}

function parseFixedLowerHex(
  hexValue: unknown,
  label: string,
  expectedLength: number,
): Buffer {
  if (
    typeof hexValue !== "string" ||
    !new RegExp(`^[0-9a-f]{${expectedLength * 2}}$`, "u").test(hexValue)
  ) {
    throw new Error(`Invalid ${label}.`);
  }
  return Buffer.from(hexValue, "hex");
}

function boundedPositiveInteger(
  value: unknown,
  label: string,
  maximum: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value <= 0 ||
    value > maximum
  ) {
    throw new Error(`Invalid ${label}.`);
  }
  return value;
}

function scryptCostN(logN: number): number {
  const normalized = boundedPositiveInteger(
    logN,
    "faucet puzzle scrypt log_n",
    MAX_SCRYPT_LOG_N,
  );
  return 2 ** normalized;
}

function createScryptOptions(
  logN: number,
  r: number,
  p: number,
): FaucetPowScryptOptions {
  const normalizedR = boundedPositiveInteger(
    r,
    "faucet puzzle scrypt r",
    MAX_SCRYPT_R,
  );
  const normalizedP = boundedPositiveInteger(
    p,
    "faucet puzzle scrypt p",
    MAX_SCRYPT_P,
  );
  const n = scryptCostN(logN);
  const estimatedBytes =
    128 * n * normalizedR + 128 * normalizedR * normalizedP;
  if (
    !Number.isSafeInteger(estimatedBytes) ||
    estimatedBytes > MAX_SCRYPT_MEMORY_BYTES
  ) {
    throw new Error(
      "Faucet puzzle scrypt memory cost exceeds the wallet limit.",
    );
  }
  return {
    N: n,
    r: normalizedR,
    p: normalizedP,
    maxmem: Math.min(
      MAX_SCRYPT_MEMORY_BYTES,
      Math.max(estimatedBytes * 2, 32 * 1024 * 1024),
    ),
  };
}

export function buildFaucetPowChallenge(
  accountId: string,
  networkId: NetworkId,
  anchorHeight: number,
  anchorBlockHashHex: string,
  challengeSaltHex?: string | null,
): Buffer {
  if (
    typeof accountId !== "string" ||
    accountId.length === 0 ||
    accountId.length > 1_024 ||
    accountId.trim() !== accountId
  ) {
    throw new Error("Invalid faucet puzzle account ID.");
  }
  const exactAnchorHeight = boundedPositiveInteger(
    anchorHeight,
    "faucet puzzle anchor height",
    Number.MAX_SAFE_INTEGER,
  );
  const anchorHash = parseFixedLowerHex(
    anchorBlockHashHex,
    "faucet puzzle anchor hash",
    32,
  );
  const challengeSalt = challengeSaltHex
    ? parseFixedLowerHex(challengeSaltHex, "faucet puzzle challenge salt", 32)
    : null;
  const anchorHeightBytes = Buffer.alloc(8);
  anchorHeightBytes.writeBigUInt64BE(BigInt(exactAnchorHeight));
  const hasher = createHash("sha256")
    .update(DOMAIN_SEPARATOR)
    .update(networkId.toBytes())
    .update(Buffer.from(accountId, "utf8"))
    .update(anchorHeightBytes)
    .update(anchorHash);
  if (challengeSalt) {
    hasher.update(challengeSalt);
  }
  return hasher.digest();
}

async function buildFaucetPowDigestAsync(
  challenge: Buffer,
  nonceBytes: Buffer,
  scryptOptions: FaucetPowScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      nonceBytes,
      challenge,
      DIGEST_LENGTH,
      scryptOptions,
      (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(Buffer.from(derivedKey));
      },
    );
  });
}

function defaultMaxAttempts(difficultyBits: number): number {
  const exponent = Math.min(18, difficultyBits + 2);
  return Math.min(MAX_ATTEMPTS, 2 ** exponent * DEFAULT_ATTEMPT_MULTIPLIER);
}

const exactPuzzleRecord = (value: unknown): Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Faucet puzzle response must be an object.");
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (
    keys.length !== PUZZLE_KEYS.length ||
    keys.some((key, index) => key !== PUZZLE_KEYS[index])
  ) {
    throw new Error("Faucet puzzle response has an unsupported shape.");
  }
  return record;
};

export const decodeFaucetPowPuzzle = (
  value: unknown,
  expectedNetworkId: NetworkId,
  expectedNetworkPrefix: number,
): FaucetPowPuzzle => {
  const record = exactPuzzleRecord(value);
  if (record.algorithm !== SUPPORTED_ALGORITHM) {
    throw new Error(
      `Unsupported faucet PoW algorithm: ${String(record.algorithm)}`,
    );
  }
  if (typeof record.network_id !== "string") {
    throw new Error("Faucet puzzle network_id must be a canonical NetworkId.");
  }
  let networkId: NetworkId;
  try {
    networkId = NetworkId.parse(record.network_id);
  } catch {
    throw new Error("Faucet puzzle network_id must be a canonical NetworkId.");
  }
  if (!networkId.equals(expectedNetworkId)) {
    throw new Error(
      "Faucet puzzle network_id does not match the endpoint's attested NetworkId.",
    );
  }
  if (record.chain_discriminant !== expectedNetworkPrefix) {
    throw new Error(
      `Faucet endpoint network prefix mismatch: expected ${expectedNetworkPrefix}, got ${String(record.chain_discriminant)}.`,
    );
  }
  const difficultyBits = boundedPositiveInteger(
    record.difficulty_bits,
    "faucet puzzle difficulty_bits",
    MAX_DIFFICULTY_BITS,
  );
  const anchorHeight = boundedPositiveInteger(
    record.anchor_height,
    "faucet puzzle anchor height",
    Number.MAX_SAFE_INTEGER,
  );
  parseFixedLowerHex(
    record.anchor_block_hash_hex,
    "faucet puzzle anchor hash",
    32,
  );
  if (record.challenge_salt_hex !== null) {
    parseFixedLowerHex(
      record.challenge_salt_hex,
      "faucet puzzle challenge salt",
      32,
    );
  }
  const scryptLogN = boundedPositiveInteger(
    record.scrypt_log_n,
    "faucet puzzle scrypt log_n",
    MAX_SCRYPT_LOG_N,
  );
  const scryptR = boundedPositiveInteger(
    record.scrypt_r,
    "faucet puzzle scrypt r",
    MAX_SCRYPT_R,
  );
  const scryptP = boundedPositiveInteger(
    record.scrypt_p,
    "faucet puzzle scrypt p",
    MAX_SCRYPT_P,
  );
  createScryptOptions(scryptLogN, scryptR, scryptP);
  const maxAnchorAgeBlocks = boundedPositiveInteger(
    record.max_anchor_age_blocks,
    "faucet puzzle max_anchor_age_blocks",
    MAX_ANCHOR_AGE_BLOCKS,
  );
  return {
    algorithm: SUPPORTED_ALGORITHM,
    network_id: networkId.toString(),
    chain_discriminant: expectedNetworkPrefix,
    difficulty_bits: difficultyBits,
    anchor_height: anchorHeight,
    anchor_block_hash_hex: record.anchor_block_hash_hex as string,
    challenge_salt_hex: record.challenge_salt_hex as string | null,
    scrypt_log_n: scryptLogN,
    scrypt_r: scryptR,
    scrypt_p: scryptP,
    max_anchor_age_blocks: maxAnchorAgeBlocks,
  };
};

export function buildFaucetPowDigest(
  accountId: string,
  anchorHeight: number,
  anchorBlockHashHex: string,
  nonceHex: string,
  options: FaucetPowDigestOptions,
): Buffer {
  const nonceBytes = parseFixedLowerHex(nonceHex, "faucet PoW nonce", 8);
  const challenge = buildFaucetPowChallenge(
    accountId,
    options.networkId,
    anchorHeight,
    anchorBlockHashHex,
    options.challengeSaltHex,
  );
  const scryptOptions = createScryptOptions(
    options.scryptLogN,
    options.scryptR,
    options.scryptP,
  );
  return scryptSync(nonceBytes, challenge, DIGEST_LENGTH, scryptOptions);
}

export async function solveFaucetPowPuzzle(
  accountId: string,
  puzzle: FaucetPowPuzzle,
  options?: FaucetPowSolveOptions,
): Promise<SolvedFaucetPow> {
  throwIfAborted(options?.signal);
  const networkId = NetworkId.parse(puzzle.network_id);
  const difficultyBits = boundedPositiveInteger(
    puzzle.difficulty_bits,
    "faucet puzzle difficulty_bits",
    MAX_DIFFICULTY_BITS,
  );
  if (puzzle.algorithm !== SUPPORTED_ALGORITHM) {
    throw new Error(`Unsupported faucet PoW algorithm: ${puzzle.algorithm}`);
  }

  const maxAttempts = boundedPositiveInteger(
    options?.maxAttempts ?? defaultMaxAttempts(difficultyBits),
    "faucet PoW max attempts",
    MAX_ATTEMPTS,
  );
  const concurrency = boundedPositiveInteger(
    options?.concurrency ?? DEFAULT_CONCURRENCY,
    "faucet PoW concurrency",
    MAX_CONCURRENCY,
  );
  const anchorHeight = boundedPositiveInteger(
    puzzle.anchor_height,
    "faucet puzzle anchor height",
    Number.MAX_SAFE_INTEGER,
  );
  const challenge = buildFaucetPowChallenge(
    accountId,
    networkId,
    anchorHeight,
    puzzle.anchor_block_hash_hex,
    puzzle.challenge_salt_hex,
  );
  const scryptOptions = createScryptOptions(
    puzzle.scrypt_log_n,
    puzzle.scrypt_r,
    puzzle.scrypt_p,
  );

  for (
    let batchStart = 0;
    batchStart < maxAttempts;
    batchStart += concurrency
  ) {
    throwIfAborted(options?.signal);
    const batchSize = Math.min(concurrency, maxAttempts - batchStart);
    const batch = await Promise.all(
      Array.from({ length: batchSize }, (_, index) => {
        const attempt = batchStart + index;
        const nonceBytes = Buffer.alloc(8);
        nonceBytes.writeBigUInt64BE(BigInt(attempt));
        return buildFaucetPowDigestAsync(
          challenge,
          nonceBytes,
          scryptOptions,
        ).then((digest) => ({
          attempt,
          nonceHex: nonceBytes.toString("hex"),
          digest,
        }));
      }),
    );
    throwIfAborted(options?.signal);

    for (const result of batch) {
      if (leadingZeroBits(result.digest) >= difficultyBits) {
        return {
          anchorHeight,
          nonceHex: result.nonceHex,
          attempts: result.attempt + 1,
        };
      }
    }
  }

  throw new Error("Failed to solve the faucet proof-of-work puzzle in time.");
}

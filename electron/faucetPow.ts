import { createHash, scrypt, scryptSync } from "crypto";
import { availableParallelism } from "os";

export type FaucetPowPuzzle = {
  algorithm: string;
  difficulty_bits: number;
  anchor_height: number;
  anchor_block_hash_hex: string;
  challenge_salt_hex?: string | null;
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
  challengeSaltHex?: string | null;
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

const DOMAIN_SEPARATOR = Buffer.from("iroha:accounts:faucet:pow:v2", "utf8");
const SUPPORTED_ALGORITHM = "scrypt-leading-zero-bits-v1";
const DIGEST_LENGTH = 32;
const DEFAULT_ATTEMPT_MULTIPLIER = 4;
const DEFAULT_CONCURRENCY = Math.max(
  1,
  Math.min(4, availableParallelism?.() ?? 1),
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

function parseFixedHex(
  hexValue: string,
  label: string,
  expectedLength: number,
): Buffer {
  const bytes = Buffer.from(hexValue.trim(), "hex");
  if (bytes.length !== expectedLength) {
    throw new Error(`Invalid ${label}.`);
  }
  return bytes;
}

function normalizePositiveInteger(value: number, label: string): number {
  const normalized = Math.trunc(value);
  if (!Number.isFinite(normalized) || normalized <= 0) {
    throw new Error(`Invalid ${label}.`);
  }
  return normalized;
}

function scryptCostN(logN: number): number {
  const normalized = normalizePositiveInteger(
    logN,
    "faucet puzzle scrypt log_n",
  );
  if (normalized >= 31) {
    throw new Error("Invalid faucet puzzle scrypt log_n.");
  }
  return 2 ** normalized;
}

function createScryptOptions(
  logN: number,
  r: number,
  p: number,
): FaucetPowScryptOptions {
  const normalizedR = normalizePositiveInteger(r, "faucet puzzle scrypt r");
  const normalizedP = normalizePositiveInteger(p, "faucet puzzle scrypt p");
  const n = scryptCostN(logN);
  const estimatedBytes =
    128 * n * normalizedR + 128 * normalizedR * normalizedP;
  return {
    N: n,
    r: normalizedR,
    p: normalizedP,
    maxmem: Math.max(estimatedBytes * 2, 32 * 1024 * 1024),
  };
}

function buildFaucetPowChallenge(
  accountId: string,
  anchorHeight: number,
  anchorBlockHashHex: string,
  challengeSaltHex?: string | null,
): Buffer {
  const anchorHash = parseFixedHex(
    anchorBlockHashHex,
    "faucet puzzle anchor hash",
    32,
  );
  const challengeSalt = challengeSaltHex
    ? parseFixedHex(challengeSaltHex, "faucet puzzle challenge salt", 32)
    : null;
  const anchorHeightBytes = Buffer.alloc(8);
  anchorHeightBytes.writeBigUInt64BE(BigInt(Math.trunc(anchorHeight)));
  const hasher = createHash("sha256")
    .update(DOMAIN_SEPARATOR)
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
  const exponent = Math.min(30, Math.max(1, difficultyBits + 2));
  return 2 ** exponent;
}

export function buildFaucetPowDigest(
  accountId: string,
  anchorHeight: number,
  anchorBlockHashHex: string,
  nonceHex: string,
  options: FaucetPowDigestOptions,
): Buffer {
  const nonceBytes = parseFixedHex(nonceHex, "faucet PoW nonce", 8);
  const challenge = buildFaucetPowChallenge(
    accountId,
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
  const difficultyBits = Math.trunc(puzzle.difficulty_bits);
  if (difficultyBits <= 0) {
    throw new Error("Faucet puzzle does not require proof-of-work.");
  }
  if (puzzle.algorithm !== SUPPORTED_ALGORITHM) {
    throw new Error(`Unsupported faucet PoW algorithm: ${puzzle.algorithm}`);
  }

  const maxAttempts = Math.max(
    1,
    Math.trunc(
      options?.maxAttempts ??
        defaultMaxAttempts(difficultyBits) * DEFAULT_ATTEMPT_MULTIPLIER,
    ),
  );
  const concurrency = Math.max(
    1,
    Math.trunc(options?.concurrency ?? DEFAULT_CONCURRENCY),
  );
  const anchorHeight = Math.trunc(puzzle.anchor_height);
  const challenge = buildFaucetPowChallenge(
    accountId,
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

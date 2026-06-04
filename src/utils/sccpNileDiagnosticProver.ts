import { type TronSccpProofRequest } from "@iroha/iroha-js/sccp";

const BN254_BASE_FIELD_MODULUS =
  21888242871839275222246405745257275088696311157297823662689037894645226208583n;
const BN254_SCALAR_FIELD_MODULUS =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const SCCP_SORA_DOMAIN = 0;
const SCCP_TRON_DOMAIN = 5;

const G1_GENERATOR = Object.freeze({ x: 1n, y: 2n });
const G2_GENERATOR = Object.freeze([
  10857046999023057135944570762232829481370756359578518086990519993285655852781n,
  11559732032986387107991004021392285783925812861821192530917403151452391805634n,
  8495653923123431417604973247489272438418190587263600148770280649306958101930n,
  4082367875863433681332203403145435568316851327593401208105741076214120093531n,
]);

type G1Point = Readonly<{ x: bigint; y: bigint; infinity?: boolean }>;

const mod = (value: bigint, modulo: bigint): bigint => {
  const result = value % modulo;
  return result >= 0n ? result : result + modulo;
};

const modPow = (base: bigint, exponent: bigint, modulo: bigint): bigint => {
  let result = 1n;
  let nextBase = mod(base, modulo);
  let nextExponent = exponent;
  while (nextExponent > 0n) {
    if (nextExponent & 1n) {
      result = mod(result * nextBase, modulo);
    }
    nextBase = mod(nextBase * nextBase, modulo);
    nextExponent >>= 1n;
  }
  return result;
};

const modInverse = (value: bigint): bigint => {
  if (value === 0n) {
    throw new Error("Cannot invert zero on BN254.");
  }
  return modPow(value, BN254_BASE_FIELD_MODULUS - 2n, BN254_BASE_FIELD_MODULUS);
};

const addG1 = (left: G1Point, right: G1Point): G1Point => {
  if (left.infinity) {
    return right;
  }
  if (right.infinity) {
    return left;
  }
  if (
    left.x === right.x &&
    mod(left.y + right.y, BN254_BASE_FIELD_MODULUS) === 0n
  ) {
    return { x: 0n, y: 0n, infinity: true };
  }
  const slope =
    left.x === right.x && left.y === right.y
      ? mod(
          3n * left.x * left.x * modInverse(2n * left.y),
          BN254_BASE_FIELD_MODULUS,
        )
      : mod(
          (right.y - left.y) * modInverse(right.x - left.x),
          BN254_BASE_FIELD_MODULUS,
        );
  const x = mod(slope * slope - left.x - right.x, BN254_BASE_FIELD_MODULUS);
  const y = mod(slope * (left.x - x) - left.y, BN254_BASE_FIELD_MODULUS);
  return { x, y };
};

const multiplyG1 = (point: G1Point, scalar: bigint): G1Point => {
  let result: G1Point = { x: 0n, y: 0n, infinity: true };
  let addend = point;
  let nextScalar = mod(scalar, BN254_SCALAR_FIELD_MODULUS);
  while (nextScalar > 0n) {
    if (nextScalar & 1n) {
      result = addG1(result, addend);
    }
    addend = addG1(addend, addend);
    nextScalar >>= 1n;
  }
  return result;
};

const negateG1 = (point: G1Point): G1Point => {
  if (point.infinity) {
    return point;
  }
  return {
    x: point.x,
    y: mod(-point.y, BN254_BASE_FIELD_MODULUS),
  };
};

const normalizeHex32 = (value: unknown, label: string): string => {
  if (
    typeof value !== "string" ||
    !/^(?:0x)?[0-9a-f]{64}$/iu.test(value)
  ) {
    throw new Error(`${label} must be a 32-byte hex string.`);
  }
  const normalized = value.toLowerCase();
  return normalized.startsWith("0x") ? normalized : `0x${normalized}`;
};

const normalizeU32 = (value: unknown, label: string): number => {
  const numeric = Number(value);
  if (!Number.isSafeInteger(numeric) || numeric < 0 || numeric > 0xffffffff) {
    throw new Error(`${label} must be a uint32.`);
  }
  return numeric;
};

const normalizeSignalWord = (value: unknown, label: string): bigint => {
  const word = normalizeHex32(value, label);
  return BigInt(word);
};

const uint256Word = (value: bigint): string => {
  if (value < 0n || value >= 1n << 256n) {
    throw new Error("uint256 ABI word is out of range.");
  }
  return value.toString(16).padStart(64, "0");
};

const hex32Word = (value: unknown, label: string): string =>
  normalizeHex32(value, label).slice(2);

const encodeDiagnosticProofBytes = (request: TronSccpProofRequest): string => {
  if (request.sourceDomain !== SCCP_SORA_DOMAIN) {
    throw new Error(
      "Nile diagnostic TRON prover only supports SORA-origin proofs.",
    );
  }
  if (request.targetDomain !== SCCP_TRON_DOMAIN) {
    throw new Error("Nile diagnostic TRON prover only targets TRON.");
  }
  if (request.publicSignalWords.length !== 9) {
    throw new Error(
      "TRON SCCP proof request must expose nine public signal words.",
    );
  }
  const signalAccumulator = request.publicSignalWords.reduce(
    (sum, signal, index) =>
      mod(
        sum + normalizeSignalWord(signal, `publicSignalWords[${index}]`),
        BN254_SCALAR_FIELD_MODULUS,
      ),
    1n,
  );
  const vkX = multiplyG1(G1_GENERATOR, signalAccumulator);
  if (vkX.infinity) {
    throw new Error("Nile diagnostic verifier accumulator is zero.");
  }
  const c = negateG1(vkX);
  const sourceDomain = normalizeU32(request.sourceDomain, "sourceDomain");
  return `0x${[
    uint256Word(1n),
    hex32Word(request.publicInputs.messageId, "publicInputs.messageId"),
    uint256Word(BigInt(sourceDomain)),
    hex32Word(
      request.publicInputs.commitmentRoot,
      "publicInputs.commitmentRoot",
    ),
    uint256Word(G1_GENERATOR.x),
    uint256Word(G1_GENERATOR.y),
    ...G2_GENERATOR.map(uint256Word),
    uint256Word(c.x),
    uint256Word(c.y),
  ].join("")}`;
};

export const prove = async (request: TronSccpProofRequest) => ({
  proofBytes: encodeDiagnosticProofBytes(request),
  requestHash: normalizeHex32(request.requestHash, "requestHash"),
  backend: request.backend,
  publicInputs: {
    ...request.publicInputs,
    messageId: normalizeHex32(
      request.publicInputs.messageId,
      "publicInputs.messageId",
    ),
    payloadHash: normalizeHex32(
      request.publicInputs.payloadHash,
      "publicInputs.payloadHash",
    ),
    commitmentRoot: normalizeHex32(
      request.publicInputs.commitmentRoot,
      "publicInputs.commitmentRoot",
    ),
    finalityBlockHash: normalizeHex32(
      request.publicInputs.finalityBlockHash,
      "publicInputs.finalityBlockHash",
    ),
  },
  publicSignalWords: request.publicSignalWords.map((word, index) =>
    normalizeHex32(word, `publicSignalWords[${index}]`),
  ),
  proofContext: request.proofContext,
  statementHash: normalizeHex32(request.statementHash, "statementHash"),
  destinationBindingHash: normalizeHex32(
    request.destinationBindingHash,
    "destinationBindingHash",
  ),
});

export const proveFn = prove;
export const irohaSccpTronProve = prove;
export const tronSccpProve = prove;

export default prove;

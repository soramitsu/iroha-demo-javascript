import { createHash } from "node:crypto";
import { AccountAddress } from "@iroha/iroha-js";
import { publicKeyFromPrivate } from "@iroha/iroha-js/crypto";
import {
  decryptKaigiPayload,
  encryptKaigiPayload,
  type KaigiSealedBox,
  type KaigiX25519KeyPair,
} from "./kaigiCrypto";
import { parseAccountAddressLiteral } from "./accountAddress";

const HEX_RE = /^[0-9a-fA-F]+$/;
const ED25519_KEY_BYTES = 32;
const FIELD_P = (1n << 255n) - 19n;
const FIELD_ONE = 1n;

const trimString = (value: unknown): string => String(value ?? "").trim();

const hexToBuffer = (value: string, label: string): Buffer => {
  const normalized = trimString(value);
  if (!normalized) {
    throw new Error(`${label} is required.`);
  }
  if (normalized.length % 2 !== 0 || !HEX_RE.test(normalized)) {
    throw new Error(`${label} must be an even-length hex string.`);
  }
  return Buffer.from(normalized, "hex");
};

const bytesToBigIntLe = (bytes: Uint8Array): bigint => {
  let value = 0n;
  for (let index = bytes.length - 1; index >= 0; index -= 1) {
    value = (value << 8n) | BigInt(bytes[index] ?? 0);
  }
  return value;
};

const bigIntToBytesLe = (value: bigint, size: number): Buffer => {
  const out = Buffer.alloc(size, 0);
  let current = value;
  for (let index = 0; index < size; index += 1) {
    out[index] = Number(current & 0xffn);
    current >>= 8n;
  }
  return out;
};

const modP = (value: bigint): bigint => {
  const reduced = value % FIELD_P;
  return reduced >= 0n ? reduced : reduced + FIELD_P;
};

const powModP = (base: bigint, exponent: bigint): bigint => {
  let result = 1n;
  let power = modP(base);
  let remaining = exponent;
  while (remaining > 0n) {
    if (remaining & 1n) {
      result = modP(result * power);
    }
    power = modP(power * power);
    remaining >>= 1n;
  }
  return result;
};

const invertModP = (value: bigint): bigint => {
  if (modP(value) === 0n) {
    throw new Error("Invalid Ed25519 public key for note encryption.");
  }
  return powModP(value, FIELD_P - 2n);
};

const extractSingleKeyPublicKey = (
  address: InstanceType<typeof AccountAddress>,
): Buffer => {
  const maybeController = (
    address as unknown as {
      _controller?: {
        publicKey?: Uint8Array | number[] | null;
      };
    }
  )._controller;
  const controllerKey = maybeController?.publicKey;
  if (controllerKey) {
    const rendered = Buffer.from(controllerKey);
    if (rendered.length === ED25519_KEY_BYTES) {
      return rendered;
    }
  }

  const canonical = Buffer.from(address.canonicalBytes());
  if (canonical.length < 5) {
    throw new Error(
      "Unable to recover the recipient public key from the account id.",
    );
  }
  const keyLength = (canonical[3] << 8) | canonical[4];
  const start = 5;
  const end = start + keyLength;
  if (end > canonical.length) {
    throw new Error(
      "Unable to recover the recipient public key from the account id.",
    );
  }
  const publicKey = canonical.subarray(start, end);
  if (publicKey.length !== ED25519_KEY_BYTES) {
    throw new Error(
      "Shielded send currently supports single-key Ed25519 account ids only.",
    );
  }
  return publicKey;
};

const extractEd25519Seed = (privateKeyHex: string): Buffer => {
  const bytes = hexToBuffer(privateKeyHex, "privateKeyHex");
  if (bytes.length === ED25519_KEY_BYTES) {
    return bytes;
  }
  if (bytes.length === ED25519_KEY_BYTES * 2) {
    return bytes.subarray(0, ED25519_KEY_BYTES);
  }
  throw new Error(
    "privateKeyHex must contain a 32-byte Ed25519 seed or 64-byte seed+public payload.",
  );
};

export const ed25519PublicKeyToX25519PublicKey = (
  publicKey: Uint8Array | Buffer,
): Buffer => {
  const normalized = Buffer.from(publicKey);
  if (normalized.length !== ED25519_KEY_BYTES) {
    throw new Error("ed25519 public key must be 32 bytes.");
  }
  const yBytes = Buffer.from(normalized);
  yBytes[31] &= 0x7f;
  const y = bytesToBigIntLe(yBytes);
  if (y >= FIELD_P) {
    throw new Error("Invalid Ed25519 public key for note encryption.");
  }
  const numerator = modP(FIELD_ONE + y);
  const denominator = modP(FIELD_ONE - y);
  const u = modP(numerator * invertModP(denominator));
  return bigIntToBytesLe(u, ED25519_KEY_BYTES);
};

export const ed25519SeedToX25519PrivateKey = (
  seed: Uint8Array | Buffer,
): Buffer => {
  const normalized = Buffer.from(seed);
  if (normalized.length !== ED25519_KEY_BYTES) {
    throw new Error("ed25519 seed must be 32 bytes.");
  }
  const digest = createHash("sha512").update(normalized).digest();
  const scalar = Buffer.from(digest.subarray(0, ED25519_KEY_BYTES));
  scalar[0] &= 248;
  scalar[31] &= 127;
  scalar[31] |= 64;
  return scalar;
};

export const extractAccountPublicKeyHex = (accountId: string): string => {
  const literal = trimString(accountId);
  if (!literal) {
    throw new Error("accountId is required.");
  }
  return extractSingleKeyPublicKey(
    parseAccountAddressLiteral(literal, "accountId"),
  )
    .toString("hex")
    .toUpperCase();
};

export const deriveAccountSealedBoxKeyPair = (
  privateKeyHex: string,
): KaigiX25519KeyPair => {
  const seed = extractEd25519Seed(privateKeyHex);
  const ed25519PublicKey = publicKeyFromPrivate(seed);
  const x25519PrivateKey = ed25519SeedToX25519PrivateKey(seed);
  const x25519PublicKey = ed25519PublicKeyToX25519PublicKey(ed25519PublicKey);
  return {
    publicKeyBase64Url: x25519PublicKey.toString("base64url"),
    privateKeyBase64Url: x25519PrivateKey.toString("base64url"),
  };
};

export const encryptPayloadForAccountId = (
  payload: unknown,
  accountId: string,
): KaigiSealedBox => {
  const publicKeyHex = extractAccountPublicKeyHex(accountId);
  const x25519PublicKey = ed25519PublicKeyToX25519PublicKey(
    Buffer.from(publicKeyHex, "hex"),
  );
  return encryptKaigiPayload(payload, x25519PublicKey.toString("base64url"));
};

export const decryptPayloadForAccount = <T>(
  sealedBox: KaigiSealedBox,
  privateKeyHex: string,
): T =>
  decryptKaigiPayload<T>(
    sealedBox,
    deriveAccountSealedBoxKeyPair(privateKeyHex),
  );

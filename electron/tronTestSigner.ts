import { createHash } from "crypto";
import { readFile } from "fs/promises";
import { secp256k1 } from "@noble/curves/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3";
import { isSecretLikeTextValue } from "../src/utils/secretLike";

export const SCCP_TRON_NILE_TEST_SIGNER_ENV = "SCCP_TRON_NILE_TEST_SIGNER";
export const SCCP_TRON_NILE_TEST_SIGNER_SECRET_FILE_ENV =
  "SCCP_TRON_NILE_TEST_SIGNER_SECRET_FILE";

const TRON_BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const TRON_BASE58_INDEX = new Map(
  [...TRON_BASE58_ALPHABET].map((character, index) => [character, index]),
);
const SECP256K1_ORDER =
  0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const SECP256K1_HALF_ORDER = SECP256K1_ORDER >> 1n;
const TRON_SIGNER_SECRET_KEY_PATTERN =
  /(?:private[_-]?key|mnemonic|recovery[_-]?phrase|seed[_-]?phrase|secret)/iu;
const TRON_SIGNER_SIGNATURE_KEY_PATTERN =
  /^(?:signatures?|privateSignature|private_signature|signatureB64|signature_b64|signedTransaction|signed_transaction|walletSignature|wallet_signature)$/iu;

export interface SccpNileTestTronSignerStatus {
  enabled: boolean;
  network: "nile";
  address: string;
  reason?: string;
}

export interface SccpNileTestTronTransactionSignInput {
  transaction: Record<string, unknown>;
  ownerAddress?: string;
}

type LoadedSccpNileTestSigner = {
  address: TronAddressView;
  privateKey: Uint8Array;
};

type TronAddressView = {
  payload: Uint8Array;
  base58: string;
  hex: string;
  solidity: string;
};

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const trimString = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const sha256 = (value: Uint8Array): Uint8Array =>
  Uint8Array.from(createHash("sha256").update(value).digest());

const bytesToHex = (value: Uint8Array, withPrefix = true): string =>
  `${withPrefix ? "0x" : ""}${Buffer.from(value).toString("hex")}`;

const hexToBytes = (value: unknown, label: string): Uint8Array => {
  const normalized = trimString(value).replace(/^0x/iu, "").toLowerCase();
  if (!/^[0-9a-f]*$/u.test(normalized) || normalized.length % 2 !== 0) {
    throw new Error(`${label} must be canonical hex.`);
  }
  return Uint8Array.from(Buffer.from(normalized, "hex"));
};

const normalizeHex = (value: unknown, label: string): string =>
  bytesToHex(hexToBytes(value, label), false);

const base58Encode = (bytes: Uint8Array): string => {
  let value = BigInt(`0x${bytesToHex(bytes, false) || "0"}`);
  let encoded = "";
  while (value > 0n) {
    const remainder = Number(value % 58n);
    encoded = `${TRON_BASE58_ALPHABET[remainder]}${encoded}`;
    value /= 58n;
  }
  for (const byte of bytes) {
    if (byte !== 0) {
      break;
    }
    encoded = `${TRON_BASE58_ALPHABET[0]}${encoded}`;
  }
  return encoded || TRON_BASE58_ALPHABET[0];
};

const base58Decode = (value: string): Uint8Array => {
  let numeric = 0n;
  for (const character of value) {
    const digit = TRON_BASE58_INDEX.get(character);
    if (digit === undefined) {
      throw new Error("TRON address must use Base58Check characters.");
    }
    numeric = numeric * 58n + BigInt(digit);
  }
  let payload = new Uint8Array();
  if (numeric !== 0n) {
    const hex = numeric.toString(16);
    payload = Uint8Array.from(
      Buffer.from(hex.length % 2 === 0 ? hex : `0${hex}`, "hex"),
    );
  }
  let leadingZeros = 0;
  while (
    leadingZeros < value.length &&
    value[leadingZeros] === TRON_BASE58_ALPHABET[0]
  ) {
    leadingZeros += 1;
  }
  if (leadingZeros === 0) {
    return payload;
  }
  const decoded = new Uint8Array(leadingZeros + payload.length);
  decoded.set(payload, leadingZeros);
  return decoded;
};

const tronBase58Check = (payload: Uint8Array): string => {
  const checksum = sha256(sha256(payload)).slice(0, 4);
  return base58Encode(new Uint8Array([...payload, ...checksum]));
};

export const normalizeTronTestSignerAddress = (
  value: unknown,
  label: string,
): TronAddressView => {
  const normalized = trimString(value);
  if (!normalized) {
    throw new Error(`${label} is required.`);
  }
  if (normalized.startsWith("T")) {
    const decoded = base58Decode(normalized);
    if (decoded.length !== 25) {
      throw new Error(`${label} must decode to 25 Base58Check bytes.`);
    }
    const payload = decoded.slice(0, 21);
    const checksum = decoded.slice(21);
    const expected = sha256(sha256(payload)).slice(0, 4);
    if (!checksum.every((byte, index) => byte === expected[index])) {
      throw new Error(`${label} checksum is invalid.`);
    }
    if (payload[0] !== 0x41 || payload.slice(1).every((byte) => byte === 0)) {
      throw new Error(`${label} must be a non-zero TRON address.`);
    }
    if (tronBase58Check(payload) !== normalized) {
      throw new Error(`${label} must be canonical Base58Check.`);
    }
    return {
      payload,
      base58: normalized,
      hex: bytesToHex(payload),
      solidity: bytesToHex(payload.slice(1)),
    };
  }
  const hex = normalized.replace(/^0x/iu, "");
  const payload =
    hex.length === 40
      ? new Uint8Array([0x41, ...hexToBytes(hex, label)])
      : hexToBytes(hex, label);
  if (payload.length !== 21) {
    throw new Error(`${label} must be 20-byte Solidity or 21-byte TRON hex.`);
  }
  if (payload[0] !== 0x41 || payload.slice(1).every((byte) => byte === 0)) {
    throw new Error(`${label} must be a non-zero TRON address.`);
  }
  return {
    payload,
    base58: tronBase58Check(payload),
    hex: bytesToHex(payload),
    solidity: bytesToHex(payload.slice(1)),
  };
};

export const deriveTronTestSignerAddressFromPrivateKey = (
  privateKey: Uint8Array,
): TronAddressView => {
  const publicKey = secp256k1.getPublicKey(privateKey, false);
  const addressHash = keccak_256(publicKey.slice(1));
  const payload = new Uint8Array(21);
  payload[0] = 0x41;
  payload.set(addressHash.slice(-20), 1);
  return {
    payload,
    base58: tronBase58Check(payload),
    hex: bytesToHex(payload),
    solidity: bytesToHex(payload.slice(1)),
  };
};

const normalizePrivateKey = (value: unknown): Uint8Array => {
  const privateKey = hexToBytes(value, "TRON Nile test signer private key");
  if (privateKey.length !== 32) {
    throw new Error("TRON Nile test signer private key must be 32 bytes.");
  }
  const scalar = BigInt(`0x${bytesToHex(privateKey, false)}`);
  if (scalar <= 0n || scalar >= SECP256K1_ORDER) {
    throw new Error("TRON Nile test signer private key is invalid.");
  }
  return privateKey;
};

const isTruthyEnv = (value: unknown): boolean =>
  /^(?:1|true|yes|on)$/iu.test(trimString(value));

const getSecretFilePath = (env: NodeJS.ProcessEnv): string =>
  trimString(
    env[SCCP_TRON_NILE_TEST_SIGNER_SECRET_FILE_ENV] ??
      env.SCCP_TRON_TEST_SIGNER_SECRET_FILE,
  );

const getTestSignerEnableValue = (env: NodeJS.ProcessEnv): unknown =>
  env[SCCP_TRON_NILE_TEST_SIGNER_ENV] ?? env.SCCP_ENABLE_NILE_TEST_SIGNER;

const assertNoSecretLikeTransactionFields = (
  value: unknown,
  path = "TRON Nile test signer transaction",
  seen = new WeakSet<object>(),
): void => {
  if (isSecretLikeTextValue(value)) {
    throw new Error(
      `${path} must not contain recovery phrases or private key material.`,
    );
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return;
    }
    seen.add(value);
    value.forEach((entry, index) => {
      assertNoSecretLikeTransactionFields(entry, `${path}[${index}]`, seen);
    });
    return;
  }
  if (!isPlainRecord(value)) {
    return;
  }
  if (seen.has(value)) {
    return;
  }
  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    if (TRON_SIGNER_SECRET_KEY_PATTERN.test(key)) {
      throw new Error(`${path}.${key} must not be sent to the test signer.`);
    }
    if (TRON_SIGNER_SIGNATURE_KEY_PATTERN.test(key)) {
      throw new Error(
        "TRON Nile test signer transaction must not already contain signatures or signing helper payloads.",
      );
    }
    assertNoSecretLikeTransactionFields(child, `${path}.${key}`, seen);
  }
};

const cloneUnsignedTronTransaction = (
  transaction: Record<string, unknown>,
): Record<string, unknown> => {
  if (!isPlainRecord(transaction)) {
    throw new Error("TRON Nile test signer transaction must be an object.");
  }
  if (Object.prototype.hasOwnProperty.call(transaction, "signature")) {
    throw new Error(
      "TRON Nile test signer transaction must not already contain signatures.",
    );
  }
  assertNoSecretLikeTransactionFields(transaction);
  try {
    return structuredClone(transaction) as Record<string, unknown>;
  } catch (_error) {
    throw new Error(
      "TRON Nile test signer transaction must be structured-cloneable.",
    );
  }
};

const readTransactionOwner = (
  transaction: Record<string, unknown>,
): TronAddressView => {
  const rawData = transaction.raw_data;
  if (!isPlainRecord(rawData)) {
    throw new Error("TRON Nile test signer transaction must include raw_data.");
  }
  const contracts = rawData.contract;
  if (!Array.isArray(contracts) || contracts.length !== 1) {
    throw new Error(
      "TRON Nile test signer transaction must include exactly one raw_data.contract entry.",
    );
  }
  const contract = contracts[0];
  if (!isPlainRecord(contract)) {
    throw new Error(
      "TRON Nile test signer transaction raw_data.contract[0] must be an object.",
    );
  }
  const parameter = contract.parameter;
  if (!isPlainRecord(parameter)) {
    throw new Error(
      "TRON Nile test signer transaction raw_data.contract[0] must include parameter.",
    );
  }
  const value = parameter.value;
  if (!isPlainRecord(value)) {
    throw new Error(
      "TRON Nile test signer transaction raw_data.contract[0] must include parameter.value.",
    );
  }
  const owner = normalizeTronTestSignerAddress(
    value.owner_address ?? value.ownerAddress,
    "TRON Nile test signer transaction owner_address",
  );
  const originAddress =
    isPlainRecord(value.new_contract) || isPlainRecord(value.newContract)
      ? (value.new_contract as Record<string, unknown> | undefined)
          ?.origin_address ??
        (value.newContract as Record<string, unknown> | undefined)
          ?.origin_address
      : undefined;
  if (originAddress !== undefined) {
    const origin = normalizeTronTestSignerAddress(
      originAddress,
      "TRON Nile test signer transaction new_contract.origin_address",
    );
    if (origin.base58 !== owner.base58) {
      throw new Error(
        "TRON Nile test signer transaction deployment origin_address must match owner_address.",
      );
    }
  }
  return owner;
};

const readRawDataHash = (
  transaction: Record<string, unknown>,
): { rawDataHex: string; hash: Uint8Array; txId: string } => {
  const rawDataHex = normalizeHex(
    transaction.raw_data_hex,
    "TRON Nile test signer transaction raw_data_hex",
  );
  if (!rawDataHex) {
    throw new Error(
      "TRON Nile test signer transaction raw_data_hex is required.",
    );
  }
  const hash = sha256(Uint8Array.from(Buffer.from(rawDataHex, "hex")));
  const txId = bytesToHex(hash, false);
  const suppliedTxId = trimString(transaction.txID ?? transaction.txid);
  if (suppliedTxId && suppliedTxId.toLowerCase() !== txId) {
    throw new Error(
      "TRON Nile test signer transaction txID must match raw_data_hex.",
    );
  }
  return { rawDataHex, hash, txId };
};

const recoverTronSignatureAddress = (
  signatureHex: string,
  hash: Uint8Array,
): TronAddressView => {
  const signature = Uint8Array.from(Buffer.from(signatureHex, "hex"));
  const recoveryId = signature[64];
  const normalizedRecoveryId =
    recoveryId >= 27 ? recoveryId - 27 : recoveryId;
  const publicKey = secp256k1.Signature.fromCompact(signature.slice(0, 64))
    .addRecoveryBit(normalizedRecoveryId)
    .recoverPublicKey(hash)
    .toRawBytes(false);
  const addressHash = keccak_256(publicKey.slice(1));
  const payload = new Uint8Array(21);
  payload[0] = 0x41;
  payload.set(addressHash.slice(-20), 1);
  return {
    payload,
    base58: tronBase58Check(payload),
    hex: bytesToHex(payload),
    solidity: bytesToHex(payload.slice(1)),
  };
};

const isCanonicalRecoverableSignature = (signature: Uint8Array): boolean => {
  if (signature.length !== 65) {
    return false;
  }
  const recoveryId = signature[64];
  if (
    !(
      (recoveryId >= 0 && recoveryId <= 3) ||
      (recoveryId >= 27 && recoveryId <= 30)
    )
  ) {
    return false;
  }
  const r = BigInt(`0x${bytesToHex(signature.slice(0, 32), false)}`);
  const s = BigInt(`0x${bytesToHex(signature.slice(32, 64), false)}`);
  return r > 0n && r < SECP256K1_ORDER && s > 0n && s <= SECP256K1_HALF_ORDER;
};

const readSccpNileTestSignerSecret = async (
  env: NodeJS.ProcessEnv,
): Promise<LoadedSccpNileTestSigner> => {
  if (!isTruthyEnv(getTestSignerEnableValue(env))) {
    throw new Error("TRON Nile test signer is not enabled.");
  }
  const secretFile = getSecretFilePath(env);
  if (!secretFile) {
    throw new Error("TRON Nile test signer secret file is not configured.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(secretFile, "utf8"));
  } catch (error) {
    throw new Error(
      `TRON Nile test signer secret file could not be read: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  if (!isPlainRecord(parsed)) {
    throw new Error("TRON Nile test signer secret file must contain JSON.");
  }
  const network = trimString(parsed.tron_network ?? parsed.network);
  if (network !== "nile") {
    throw new Error("TRON Nile test signer secret must target nile.");
  }
  const privateKey = normalizePrivateKey(parsed.private_key_hex);
  const derivedAddress = deriveTronTestSignerAddressFromPrivateKey(privateKey);
  const configuredAddress = normalizeTronTestSignerAddress(
    parsed.address_base58 ?? parsed.address,
    "TRON Nile test signer address",
  );
  if (configuredAddress.base58 !== derivedAddress.base58) {
    throw new Error(
      "TRON Nile test signer address does not match its private key.",
    );
  }
  return { address: derivedAddress, privateKey };
};

export const getSccpNileTestTronSignerStatus = async (
  env: NodeJS.ProcessEnv = process.env,
): Promise<SccpNileTestTronSignerStatus> => {
  if (!isTruthyEnv(getTestSignerEnableValue(env))) {
    return { enabled: false, network: "nile", address: "" };
  }
  try {
    const signer = await readSccpNileTestSignerSecret(env);
    return {
      enabled: true,
      network: "nile",
      address: signer.address.base58,
    };
  } catch (error) {
    return {
      enabled: false,
      network: "nile",
      address: "",
      reason: error instanceof Error ? error.message : String(error),
    };
  }
};

export const signSccpNileTestTronTransaction = async (
  input: SccpNileTestTronTransactionSignInput,
  env: NodeJS.ProcessEnv = process.env,
): Promise<Record<string, unknown>> => {
  const signer = await readSccpNileTestSignerSecret(env);
  const transaction = cloneUnsignedTronTransaction(input.transaction);
  const owner = readTransactionOwner(transaction);
  if (owner.base58 !== signer.address.base58) {
    throw new Error(
      "TRON Nile test signer transaction owner does not match the configured signer.",
    );
  }
  if (input.ownerAddress !== undefined) {
    const expectedOwner = normalizeTronTestSignerAddress(
      input.ownerAddress,
      "TRON Nile test signer requested ownerAddress",
    );
    if (expectedOwner.base58 !== signer.address.base58) {
      throw new Error(
        "TRON Nile test signer requested ownerAddress does not match the configured signer.",
      );
    }
  }
  const { rawDataHex, hash, txId } = readRawDataHash(transaction);
  const signatureObject = secp256k1.sign(hash, signer.privateKey, {
    prehash: false,
    lowS: true,
  });
  const signature = new Uint8Array(65);
  signature.set(signatureObject.toCompactRawBytes());
  signature[64] = signatureObject.recovery;
  if (!isCanonicalRecoverableSignature(signature)) {
    throw new Error("TRON Nile test signer generated a non-canonical signature.");
  }
  const signatureHex = bytesToHex(signature, false);
  const recovered = recoverTronSignatureAddress(signatureHex, hash);
  if (recovered.base58 !== signer.address.base58) {
    throw new Error(
      "TRON Nile test signer generated signature does not recover to signer.",
    );
  }
  return {
    ...transaction,
    txID: txId,
    raw_data_hex: rawDataHex,
    signature: [signatureHex],
  };
};

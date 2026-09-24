import {
  createCipheriv,
  createDecipheriv,
  createPrivateKey,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  randomBytes,
  type KeyObject,
} from "node:crypto";
import { requireKaigiInviteSecretBase64Url } from "../src/utils/kaigiInvite";
import { parseJsonWithoutDuplicateObjectKeys } from "../src/utils/json";

export const KAIGI_SEALED_BOX_SCHEMA = "iroha-demo-kaigi-sealed-box/v1";
export const KAIGI_SECRET_BOX_SCHEMA = "iroha-demo-kaigi-secret-box/v1";

export type KaigiX25519KeyPair = {
  publicKeyBase64Url: string;
  privateKeyBase64Url: string;
};

export type KaigiSealedBox = {
  schema: typeof KAIGI_SEALED_BOX_SCHEMA;
  ephemeralPublicKeyBase64Url: string;
  saltBase64Url: string;
  ivBase64Url: string;
  ciphertextBase64Url: string;
  authTagBase64Url: string;
};

export type KaigiSecretBox = {
  schema: typeof KAIGI_SECRET_BOX_SCHEMA;
  saltBase64Url: string;
  ivBase64Url: string;
  ciphertextBase64Url: string;
  authTagBase64Url: string;
};

const ENCRYPTION_INFO = Buffer.from("iroha-demo-kaigi-link-v1", "utf8");
const SECRET_ENCRYPTION_INFO = Buffer.from(
  "iroha-demo-kaigi-secret-link-v1",
  "utf8",
);
const AES_KEY_LENGTH = 32;
const GCM_IV_LENGTH = 12;
const HKDF_SALT_LENGTH = 16;
const X25519_KEY_LENGTH = 32;
const GCM_AUTH_TAG_LENGTH = 16;
export const KAIGI_ENCRYPTED_PAYLOAD_MAX_BYTES = 1024 * 1024;
const SEALED_BOX_KEYS = Object.freeze(
  [
    "authTagBase64Url",
    "ciphertextBase64Url",
    "ephemeralPublicKeyBase64Url",
    "ivBase64Url",
    "saltBase64Url",
    "schema",
  ].sort(),
);
const SECRET_BOX_KEYS = Object.freeze(
  [
    "authTagBase64Url",
    "ciphertextBase64Url",
    "ivBase64Url",
    "saltBase64Url",
    "schema",
  ].sort(),
);

function assertExactObjectKeys(
  value: unknown,
  expected: readonly string[],
  label: string,
): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  const actual = Object.keys(value).sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw new Error(`${label} contains missing or unknown fields.`);
  }
}

const requireBase64UrlBytes = (
  value: unknown,
  label: string,
  options: { exactBytes?: number; maximumBytes?: number },
): Buffer => {
  const encodedLengthLimit = Math.ceil(
    ((options.exactBytes ?? options.maximumBytes ?? 0) * 4) / 3,
  );
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value
  ) {
    throw new Error(`${label} must be canonical unpadded base64url.`);
  }
  if (options.exactBytes !== undefined && value.length !== encodedLengthLimit) {
    throw new Error(
      `${label} must encode exactly ${options.exactBytes} bytes.`,
    );
  }
  if (options.maximumBytes !== undefined && value.length > encodedLengthLimit) {
    throw new Error(`${label} exceeds ${options.maximumBytes} bytes.`);
  }
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) {
    throw new Error(`${label} must be canonical unpadded base64url.`);
  }
  const bytes = Buffer.from(value, "base64url");
  try {
    if (bytes.toString("base64url") !== value) {
      throw new Error(`${label} must be canonical unpadded base64url.`);
    }
    if (
      options.exactBytes !== undefined &&
      bytes.byteLength !== options.exactBytes
    ) {
      throw new Error(
        `${label} must encode exactly ${options.exactBytes} bytes.`,
      );
    }
    if (
      options.maximumBytes !== undefined &&
      bytes.byteLength > options.maximumBytes
    ) {
      throw new Error(`${label} exceeds ${options.maximumBytes} bytes.`);
    }
    return bytes;
  } catch (error) {
    bytes.fill(0);
    throw error;
  }
};

const requireX25519Key = (value: unknown, label: string): string => {
  const bytes = requireBase64UrlBytes(value, label, {
    exactBytes: X25519_KEY_LENGTH,
  });
  try {
    return bytes.toString("base64url");
  } finally {
    bytes.fill(0);
  }
};

const serializePayload = (payload: unknown): Buffer => {
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(payload);
  } catch {
    throw new Error("Kaigi encrypted payload must be JSON serializable.");
  }
  if (serialized === undefined) {
    throw new Error("Kaigi encrypted payload must be JSON serializable.");
  }
  const plaintext = Buffer.from(serialized, "utf8");
  if (plaintext.byteLength > KAIGI_ENCRYPTED_PAYLOAD_MAX_BYTES) {
    throw new Error(
      `Kaigi encrypted payload exceeds ${KAIGI_ENCRYPTED_PAYLOAD_MAX_BYTES} bytes.`,
    );
  }
  return plaintext;
};

const parsePayload = <T>(plaintext: Buffer): T => {
  if (plaintext.byteLength > KAIGI_ENCRYPTED_PAYLOAD_MAX_BYTES) {
    throw new Error(
      `Kaigi encrypted payload exceeds ${KAIGI_ENCRYPTED_PAYLOAD_MAX_BYTES} bytes.`,
    );
  }
  const serialized = new TextDecoder("utf-8", { fatal: true }).decode(
    plaintext,
  );
  return parseJsonWithoutDuplicateObjectKeys(
    serialized,
    "Kaigi encrypted payload",
  ) as T;
};

const importX25519PublicKey = (publicKeyBase64Url: string): KeyObject =>
  createPublicKey({
    key: {
      kty: "OKP",
      crv: "X25519",
      x: requireX25519Key(publicKeyBase64Url, "publicKeyBase64Url"),
    },
    format: "jwk",
  });

const importX25519PrivateKey = (
  privateKeyBase64Url: string,
  publicKeyBase64Url: string,
): KeyObject =>
  createPrivateKey({
    key: {
      kty: "OKP",
      crv: "X25519",
      d: requireX25519Key(privateKeyBase64Url, "privateKeyBase64Url"),
      x: requireX25519Key(publicKeyBase64Url, "publicKeyBase64Url"),
    },
    format: "jwk",
  });

const deriveAesKey = (
  privateKey: KeyObject,
  publicKey: KeyObject,
  salt: Buffer,
): Buffer => {
  const sharedSecret = diffieHellman({ privateKey, publicKey });
  try {
    return Buffer.from(
      hkdfSync("sha256", sharedSecret, salt, ENCRYPTION_INFO, AES_KEY_LENGTH),
    );
  } finally {
    sharedSecret.fill(0);
  }
};

const deriveSecretAesKey = (secretBase64Url: string, salt: Buffer): Buffer => {
  const secret = Buffer.from(
    requireKaigiInviteSecretBase64Url(secretBase64Url),
    "base64url",
  );
  try {
    return Buffer.from(
      hkdfSync("sha256", secret, salt, SECRET_ENCRYPTION_INFO, AES_KEY_LENGTH),
    );
  } finally {
    secret.fill(0);
  }
};

export const generateKaigiX25519KeyPair = (): KaigiX25519KeyPair => {
  const { publicKey, privateKey } = generateKeyPairSync("x25519");
  const publicJwk = publicKey.export({ format: "jwk" });
  const privateJwk = privateKey.export({ format: "jwk" });
  if (!publicJwk?.x || !privateJwk?.d) {
    throw new Error("Unable to export Kaigi X25519 key material.");
  }
  return {
    publicKeyBase64Url: publicJwk.x,
    privateKeyBase64Url: privateJwk.d,
  };
};

export const encryptKaigiPayload = (
  payload: unknown,
  recipientPublicKeyBase64Url: string,
): KaigiSealedBox => {
  const recipientPublicKey = importX25519PublicKey(recipientPublicKeyBase64Url);
  const ephemeralKeys = generateKaigiX25519KeyPair();
  const ephemeralPrivateKey = importX25519PrivateKey(
    ephemeralKeys.privateKeyBase64Url,
    ephemeralKeys.publicKeyBase64Url,
  );
  const salt = randomBytes(HKDF_SALT_LENGTH);
  const iv = randomBytes(GCM_IV_LENGTH);
  const key = deriveAesKey(ephemeralPrivateKey, recipientPublicKey, salt);
  let plaintext: Buffer | null = null;
  try {
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    plaintext = serializePayload(payload);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext),
      cipher.final(),
    ]);

    return {
      schema: KAIGI_SEALED_BOX_SCHEMA,
      ephemeralPublicKeyBase64Url: ephemeralKeys.publicKeyBase64Url,
      saltBase64Url: salt.toString("base64url"),
      ivBase64Url: iv.toString("base64url"),
      ciphertextBase64Url: ciphertext.toString("base64url"),
      authTagBase64Url: cipher.getAuthTag().toString("base64url"),
    };
  } finally {
    key.fill(0);
    plaintext?.fill(0);
  }
};

export const decryptKaigiPayload = <T>(
  sealedBox: KaigiSealedBox,
  keys: KaigiX25519KeyPair,
): T => {
  assertExactObjectKeys(sealedBox, SEALED_BOX_KEYS, "Kaigi sealed box");
  if (sealedBox.schema !== KAIGI_SEALED_BOX_SCHEMA) {
    throw new Error("Unsupported Kaigi sealed box schema.");
  }
  const privateKey = importX25519PrivateKey(
    keys.privateKeyBase64Url,
    keys.publicKeyBase64Url,
  );
  const senderPublicKey = importX25519PublicKey(
    sealedBox.ephemeralPublicKeyBase64Url,
  );
  const salt = requireBase64UrlBytes(sealedBox.saltBase64Url, "saltBase64Url", {
    exactBytes: HKDF_SALT_LENGTH,
  });
  const iv = requireBase64UrlBytes(sealedBox.ivBase64Url, "ivBase64Url", {
    exactBytes: GCM_IV_LENGTH,
  });
  const ciphertext = requireBase64UrlBytes(
    sealedBox.ciphertextBase64Url,
    "ciphertextBase64Url",
    { maximumBytes: KAIGI_ENCRYPTED_PAYLOAD_MAX_BYTES },
  );
  const authTag = requireBase64UrlBytes(
    sealedBox.authTagBase64Url,
    "authTagBase64Url",
    { exactBytes: GCM_AUTH_TAG_LENGTH },
  );
  const key = deriveAesKey(privateKey, senderPublicKey, salt);
  let plaintext: Buffer | null = null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return parsePayload<T>(plaintext);
  } finally {
    key.fill(0);
    plaintext?.fill(0);
  }
};

export const encryptKaigiPayloadWithSecret = (
  payload: unknown,
  inviteSecretBase64Url: string,
): KaigiSecretBox => {
  const salt = randomBytes(HKDF_SALT_LENGTH);
  const iv = randomBytes(GCM_IV_LENGTH);
  const key = deriveSecretAesKey(inviteSecretBase64Url, salt);
  let plaintext: Buffer | null = null;
  try {
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    plaintext = serializePayload(payload);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext),
      cipher.final(),
    ]);

    return {
      schema: KAIGI_SECRET_BOX_SCHEMA,
      saltBase64Url: salt.toString("base64url"),
      ivBase64Url: iv.toString("base64url"),
      ciphertextBase64Url: ciphertext.toString("base64url"),
      authTagBase64Url: cipher.getAuthTag().toString("base64url"),
    };
  } finally {
    key.fill(0);
    plaintext?.fill(0);
  }
};

export const decryptKaigiPayloadWithSecret = <T>(
  secretBox: KaigiSecretBox,
  inviteSecretBase64Url: string,
): T => {
  assertExactObjectKeys(secretBox, SECRET_BOX_KEYS, "Kaigi secret box");
  if (secretBox.schema !== KAIGI_SECRET_BOX_SCHEMA) {
    throw new Error("Unsupported Kaigi secret box schema.");
  }
  const salt = requireBase64UrlBytes(secretBox.saltBase64Url, "saltBase64Url", {
    exactBytes: HKDF_SALT_LENGTH,
  });
  const iv = requireBase64UrlBytes(secretBox.ivBase64Url, "ivBase64Url", {
    exactBytes: GCM_IV_LENGTH,
  });
  const ciphertext = requireBase64UrlBytes(
    secretBox.ciphertextBase64Url,
    "ciphertextBase64Url",
    { maximumBytes: KAIGI_ENCRYPTED_PAYLOAD_MAX_BYTES },
  );
  const authTag = requireBase64UrlBytes(
    secretBox.authTagBase64Url,
    "authTagBase64Url",
    { exactBytes: GCM_AUTH_TAG_LENGTH },
  );
  const key = deriveSecretAesKey(inviteSecretBase64Url, salt);
  let plaintext: Buffer | null = null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return parsePayload<T>(plaintext);
  } finally {
    key.fill(0);
    plaintext?.fill(0);
  }
};

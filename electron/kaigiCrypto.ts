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

const trimString = (value: unknown): string => String(value ?? "").trim();

const requireBase64Url = (value: string, label: string): string => {
  const normalized = trimString(value);
  if (!normalized) {
    throw new Error(`${label} is required.`);
  }
  if (!/^[A-Za-z0-9_-]+$/.test(normalized)) {
    throw new Error(`${label} must be base64url.`);
  }
  return normalized;
};

const importX25519PublicKey = (publicKeyBase64Url: string): KeyObject =>
  createPublicKey({
    key: {
      kty: "OKP",
      crv: "X25519",
      x: requireBase64Url(publicKeyBase64Url, "publicKeyBase64Url"),
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
      d: requireBase64Url(privateKeyBase64Url, "privateKeyBase64Url"),
      x: requireBase64Url(publicKeyBase64Url, "publicKeyBase64Url"),
    },
    format: "jwk",
  });

const deriveAesKey = (
  privateKey: KeyObject,
  publicKey: KeyObject,
  salt: Buffer,
): Buffer =>
  Buffer.from(
    hkdfSync(
      "sha256",
      diffieHellman({ privateKey, publicKey }),
      salt,
      ENCRYPTION_INFO,
      AES_KEY_LENGTH,
    ),
  );

const deriveSecretAesKey = (
  secretBase64Url: string,
  salt: Buffer,
): Buffer =>
  Buffer.from(
    hkdfSync(
      "sha256",
      Buffer.from(requireBase64Url(secretBase64Url, "inviteSecretBase64Url"), "base64url"),
      salt,
      SECRET_ENCRYPTION_INFO,
      AES_KEY_LENGTH,
    ),
  );

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
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
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
};

export const decryptKaigiPayload = <T>(
  sealedBox: KaigiSealedBox,
  keys: KaigiX25519KeyPair,
): T => {
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
  const salt = Buffer.from(
    requireBase64Url(sealedBox.saltBase64Url, "saltBase64Url"),
    "base64url",
  );
  const iv = Buffer.from(
    requireBase64Url(sealedBox.ivBase64Url, "ivBase64Url"),
    "base64url",
  );
  const ciphertext = Buffer.from(
    requireBase64Url(sealedBox.ciphertextBase64Url, "ciphertextBase64Url"),
    "base64url",
  );
  const authTag = Buffer.from(
    requireBase64Url(sealedBox.authTagBase64Url, "authTagBase64Url"),
    "base64url",
  );
  const key = deriveAesKey(privateKey, senderPublicKey, salt);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
  return JSON.parse(plaintext) as T;
};

export const encryptKaigiPayloadWithSecret = (
  payload: unknown,
  inviteSecretBase64Url: string,
): KaigiSecretBox => {
  const salt = randomBytes(HKDF_SALT_LENGTH);
  const iv = randomBytes(GCM_IV_LENGTH);
  const key = deriveSecretAesKey(inviteSecretBase64Url, salt);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);

  return {
    schema: KAIGI_SECRET_BOX_SCHEMA,
    saltBase64Url: salt.toString("base64url"),
    ivBase64Url: iv.toString("base64url"),
    ciphertextBase64Url: ciphertext.toString("base64url"),
    authTagBase64Url: cipher.getAuthTag().toString("base64url"),
  };
};

export const decryptKaigiPayloadWithSecret = <T>(
  secretBox: KaigiSecretBox,
  inviteSecretBase64Url: string,
): T => {
  if (secretBox.schema !== KAIGI_SECRET_BOX_SCHEMA) {
    throw new Error("Unsupported Kaigi secret box schema.");
  }
  const salt = Buffer.from(
    requireBase64Url(secretBox.saltBase64Url, "saltBase64Url"),
    "base64url",
  );
  const iv = Buffer.from(
    requireBase64Url(secretBox.ivBase64Url, "ivBase64Url"),
    "base64url",
  );
  const ciphertext = Buffer.from(
    requireBase64Url(secretBox.ciphertextBase64Url, "ciphertextBase64Url"),
    "base64url",
  );
  const authTag = Buffer.from(
    requireBase64Url(secretBox.authTagBase64Url, "authTagBase64Url"),
    "base64url",
  );
  const key = deriveSecretAesKey(inviteSecretBase64Url, salt);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
  return JSON.parse(plaintext) as T;
};

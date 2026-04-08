import { Buffer } from "node:buffer";
import { blake2b } from "@noble/hashes/blake2.js";
import { generateKeyPairSync, randomBytes } from "crypto";
import type { ToriiClient } from "@iroha/iroha-js";

const SID_PREFIX = Buffer.from("iroha-connect|sid|");
const SID_LENGTH = 32;
const NONCE_LENGTH = 16;
const X25519_KEY_LENGTH = 32;
const CONNECT_URI_VERSION = "1";
const CONNECT_URI_SCHEME = "iroha://connect";
const CONNECT_LAUNCH_PROTOCOL = "irohaconnect";

type BinaryLike =
  | Buffer
  | Uint8Array
  | ArrayBuffer
  | ArrayBufferView
  | number[]
  | string;

type PortableConnectKeyPairInput = {
  publicKey: BinaryLike;
  privateKey: BinaryLike;
};

type PortableConnectPreviewOptions = {
  chainId: string;
  node?: string | null;
  nonce?: BinaryLike | null;
  appKeyPair?: PortableConnectKeyPairInput | null;
};

type ConnectSessionResponse = Awaited<
  ReturnType<ToriiClient["createConnectSession"]>
>;

type PortableConnectPreview = {
  chainId: string;
  node: string | null;
  sidBytes: Buffer;
  sidBase64Url: string;
  nonce: Buffer;
  appKeyPair: {
    publicKey: Buffer;
    privateKey: Buffer;
  };
  walletUri: string;
  appUri: string;
};

export async function bootstrapPortableConnectPreviewSession(
  toriiClient: Pick<ToriiClient, "createConnectSession">,
  options: PortableConnectPreviewOptions,
): Promise<{
  preview: PortableConnectPreview;
  session: ConnectSessionResponse;
  tokens: { wallet: string; app: string };
}> {
  if (!toriiClient || typeof toriiClient.createConnectSession !== "function") {
    throw new TypeError("toriiClient must expose createConnectSession()");
  }
  const preview = createPortableConnectSessionPreview(options);
  const sessionInput: { sid: string; node?: string } = {
    sid: preview.sidBase64Url,
  };
  if (preview.node) {
    sessionInput.node = preview.node;
  }
  const session = await toriiClient.createConnectSession(sessionInput);
  return {
    preview,
    session,
    tokens: {
      wallet: session.token_wallet,
      app: session.token_app,
    },
  };
}

export function createPortableConnectSessionPreview(
  options: PortableConnectPreviewOptions,
): PortableConnectPreview {
  if (!options || typeof options !== "object") {
    throw new TypeError("options must be an object");
  }
  const chainId = requireNonEmptyString(options.chainId, "chainId");
  const node =
    options.node === undefined || options.node === null
      ? null
      : requireNonEmptyString(options.node, "node");
  const appKeyPair = normalizeKeyPair(options.appKeyPair ?? null);
  const nonce =
    options.nonce === undefined || options.nonce === null
      ? randomBytes(NONCE_LENGTH)
      : normalizeBinary(options.nonce, "nonce", NONCE_LENGTH);
  const sidBytes = computePortableConnectSid(
    chainId,
    appKeyPair.publicKey,
    nonce,
  );
  const sidBase64Url = sidBytes.toString("base64url");
  return {
    chainId,
    node,
    sidBytes,
    sidBase64Url,
    nonce,
    appKeyPair,
    walletUri: buildConnectUri(sidBase64Url, chainId, node, "wallet"),
    appUri: buildConnectUri(sidBase64Url, chainId, node, "app"),
  };
}

export function rewriteConnectUriProtocol(
  uri: string,
  protocol = CONNECT_LAUNCH_PROTOCOL,
) {
  const parsed = new URL(requireNonEmptyString(uri, "uri"));
  const normalized = requireNonEmptyString(protocol, "protocol");
  parsed.protocol = normalized.endsWith(":") ? normalized : `${normalized}:`;
  return parsed.toString();
}

export function resolvePortableConnectLaunchUri(
  canonicalSessionUri: string | null | undefined,
  previewUri: string | null | undefined,
  protocol = CONNECT_LAUNCH_PROTOCOL,
) {
  const selected = canonicalSessionUri ?? previewUri;
  if (!selected) {
    return null;
  }
  return rewriteConnectUriProtocol(selected, protocol);
}

function computePortableConnectSid(
  chainId: string,
  publicKey: Buffer,
  nonce: Buffer,
): Buffer {
  const hashInput = new Uint8Array(
    Buffer.concat([SID_PREFIX, Buffer.from(chainId, "utf8"), publicKey, nonce]),
  );
  const digest = Buffer.from(
    blake2b(hashInput, {
      dkLen: 64,
    }),
  );
  return digest.subarray(0, SID_LENGTH);
}

function normalizeKeyPair(pair: PortableConnectKeyPairInput | null) {
  if (!pair) {
    return generateX25519KeyPair();
  }
  if (typeof pair !== "object") {
    throw new TypeError("appKeyPair must be an object");
  }
  return {
    publicKey: normalizeBinary(
      pair.publicKey,
      "appKeyPair.publicKey",
      X25519_KEY_LENGTH,
    ),
    privateKey: normalizeBinary(
      pair.privateKey,
      "appKeyPair.privateKey",
      X25519_KEY_LENGTH,
    ),
  };
}

function generateX25519KeyPair() {
  const { publicKey, privateKey } = generateKeyPairSync("x25519");
  const jwkPublic = publicKey.export({ format: "jwk" });
  const jwkPrivate = privateKey.export({ format: "jwk" });
  if (!jwkPublic?.x || !jwkPrivate?.d) {
    throw new Error("Failed to export x25519 key material");
  }
  return {
    publicKey: Buffer.from(jwkPublic.x, "base64url"),
    privateKey: Buffer.from(jwkPrivate.d, "base64url"),
  };
}

function normalizeConnectRole(role: string, name = "role") {
  if (role === "app" || role === "wallet") {
    return role;
  }
  throw new TypeError(`${name} must be 'app' or 'wallet'`);
}

function buildConnectUri(
  sidBase64Url: string,
  chainId: string,
  node: string | null,
  role: "app" | "wallet",
) {
  const params = new URLSearchParams();
  params.set("sid", sidBase64Url);
  params.set("chain_id", chainId);
  if (node) {
    params.set("node", node);
  }
  params.set("v", CONNECT_URI_VERSION);
  params.set("role", normalizeConnectRole(role));
  return `${CONNECT_URI_SCHEME}?${params.toString()}`;
}

function requireNonEmptyString(value: string, name: string) {
  if (typeof value !== "string") {
    throw new TypeError(`${name} must be a string`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${name} must not be empty`);
  }
  return trimmed;
}

function normalizeBinary(
  value: BinaryLike,
  name: string,
  expectedLength: number,
) {
  const buffer = toBuffer(value, name);
  if (buffer.length !== expectedLength) {
    throw new RangeError(
      `${name} must be ${expectedLength} bytes (received ${buffer.length} bytes)`,
    );
  }
  return buffer;
}

function normalizeByteArray(value: number[] | ArrayLike<number>, name: string) {
  const normalized = Array.from(value, (entry, index) => {
    const numeric = Number(entry);
    if (!Number.isInteger(numeric) || numeric < 0 || numeric > 0xff) {
      throw new TypeError(`${name}[${index}] must be a byte`);
    }
    return numeric;
  });
  return Buffer.from(normalized);
}

function toBuffer(value: BinaryLike, name: string) {
  if (Buffer.isBuffer(value)) {
    return Buffer.from(value);
  }
  if (ArrayBuffer.isView(value)) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  }
  if (value instanceof ArrayBuffer) {
    return Buffer.from(value);
  }
  if (Array.isArray(value)) {
    return normalizeByteArray(value, name);
  }
  if (typeof value === "string") {
    return decodeStringBinary(value, name);
  }
  throw new TypeError(`${name} must be binary data`);
}

function decodeStringBinary(input: string, name: string) {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new TypeError(`${name} must not be empty`);
  }
  const hexPrefixed = trimmed.startsWith("0x") || trimmed.startsWith("0X");
  const hexBody = hexPrefixed ? trimmed.slice(2) : trimmed;
  if (/^[0-9a-fA-F]+$/.test(hexBody) && hexBody.length % 2 === 0) {
    return Buffer.from(hexBody, "hex");
  }
  try {
    return Buffer.from(trimmed, "base64url");
  } catch {
    throw new TypeError(`${name} must be hex or base64 data`);
  }
}

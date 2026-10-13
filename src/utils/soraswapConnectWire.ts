import { chacha20poly1305 } from "@noble/ciphers/chacha.js";
import { x25519 } from "@noble/curves/ed25519";
import { blake2b } from "@noble/hashes/blake2b";
import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha256";
import { NetworkId } from "@iroha/iroha-js/connect-browser";

export type ConnectDirection = "app_to_wallet" | "wallet_to_app";

// The first-release relay contract deliberately caps one complete frame above
// Torii's default 256 KiB signed-transaction ceiling. This bounds attacker-
// controlled WebSocket, base64, Norito, and approval-dialog work in both the
// renderer and preload.
export const IROHA_CONNECT_MAX_FRAME_BYTES = 512 * 1024;

export interface ConnectPermissions {
  methods: string[];
  events: string[];
  resources: string[] | null;
}

export interface ConnectPreview {
  sid: string;
  sidBytesHex: string;
  nonceHex: string;
  privateKeyHex: string;
  publicKeyHex: string;
  walletUri: string;
  appUri: string;
  wsUrl: string;
  createdAt: number;
}

export interface ConnectSignInProof {
  domain: string;
  uri: string;
  statement: string;
  issuedAt: string;
  nonce: string;
}

export interface ConnectWalletSignature {
  algorithmCode: number;
  algorithmLabel: string;
  signatureHex: string;
  signatureBase64: string;
}

export type ConnectEnvelopePayload =
  | {
      type: "control_close";
      who: "app" | "wallet";
      code: number;
      reason: string;
      retryable: boolean;
    }
  | {
      type: "control_reject";
      code: number;
      codeId: string;
      reason: string;
    }
  | {
      type: "sign_request_raw";
      domainTag: string;
      bytesHex: string;
      bytesBase64: string;
      bytesLength: number;
    }
  | {
      type: "sign_request_tx";
      txBytesHex: string;
      txBytesBase64: string;
      txBytesLength: number;
    }
  | {
      type: "sign_result_ok";
      signature: ConnectWalletSignature;
    }
  | {
      type: "sign_result_err";
      code: string;
      message: string;
    }
  | {
      type: "display_request";
      title: string;
      body: string;
    };

export interface ConnectEnvelopeSummary {
  seq: number;
  payload: ConnectEnvelopePayload;
}

export type ConnectControlPayload =
  | {
      type: "approve";
      walletPublicKeyHex: string;
      accountId: string;
      permissions: ConnectPermissions | null;
      proof: ConnectSignInProof | null;
      signature: ConnectWalletSignature;
    }
  | {
      type: "reject";
      code: number;
      codeId: string;
      reason: string;
    }
  | {
      type: "close";
      who: "app" | "wallet";
      code: number;
      reason: string;
      retryable: boolean;
    }
  | {
      type: "ping" | "pong";
      nonce: number;
    }
  | {
      type: "server_event";
      eventName: string;
      payload: Record<string, unknown>;
    }
  | {
      type: "open";
      appPublicKeyHex: string;
      constraints: {
        networkId: string;
      };
      appMeta: {
        name: string;
        url: string | null;
        iconHash: string | null;
      } | null;
      permissions: ConnectPermissions | null;
    };

export interface ConnectFrameSummary {
  sid: string;
  sidHex: string;
  direction: ConnectDirection;
  seq: number;
  kind: "control" | "ciphertext";
  control: ConnectControlPayload | null;
  ciphertext: {
    direction: ConnectDirection;
    aeadHex: string;
    aeadLength: number;
  } | null;
}

export type ConnectSigningRequest = Extract<
  ConnectEnvelopePayload,
  { type: "sign_request_raw" | "sign_request_tx" }
>;

export const copyConnectPermissions = (
  permissions: ConnectPermissions | null,
): ConnectPermissions | null =>
  permissions
    ? {
        methods: [...permissions.methods],
        events: [...permissions.events],
        resources: permissions.resources ? [...permissions.resources] : null,
      }
    : null;

export const assertConnectSigningPermission = (
  permissions: ConnectPermissions | null,
  request: Pick<ConnectSigningRequest, "type"> & {
    domainTag?: string;
  },
) => {
  const method =
    request.type === "sign_request_raw" ? "sign_raw" : "sign_transaction";
  if (!permissions?.methods.includes(method)) {
    throw new Error(`IrohaConnect Open permissions do not grant ${method}.`);
  }
  // `resources` scopes raw signing to exact domain tags. SignRequestTx has no
  // resource selector, so a session may grant both methods: transaction
  // requests need only `sign_transaction` (each one is decoded and approved
  // individually), while raw requests stay limited to the listed domains.
  if (
    request.type === "sign_request_raw" &&
    (!request.domainTag || !permissions.resources?.includes(request.domainTag))
  ) {
    throw new Error(
      `IrohaConnect Open permissions do not grant raw-signing domain "${request.domainTag || ""}".`,
    );
  }
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const APPROVE_DOMAIN = encoder.encode("iroha-connect|approve|v1");
const RELAY_AUTH_DOMAIN = encoder.encode("iroha-connect|relay-auth|v1");
const SALT_PREFIX = encoder.encode("iroha-connect|salt|");
const APP_INFO = encoder.encode("iroha-connect|k_app");
const WALLET_INFO = encoder.encode("iroha-connect|k_wallet");
const X25519_HKDF_SALT = encoder.encode("iroha:x25519:hkdf:v1");
const X25519_HKDF_INFO = encoder.encode("iroha:x25519:session-key");
const NORITO_MAGIC = encoder.encode("NRT0");
const CONNECT_AAD_PREFIX = encoder.encode("connect:v1");
const CONNECT_SID_PREFIX = encoder.encode("iroha-connect|sid|");
const ENVELOPE_V1_SCHEMA = Uint8Array.from([
  0x69, 0x47, 0xaf, 0xe3, 0xe8, 0xa8, 0x54, 0x46, 0xd6, 0xa3, 0xee, 0x7b, 0xb1,
  0xa3, 0x7c, 0x0a,
]);
const CRC64_XZ_POLY = 0xc96c5795d7870f42n;
const CRC64_XZ_INIT = 0xffff_ffff_ffff_ffffn;

const concatBytes = (...parts: Uint8Array[]) => {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
};

const assertSafeU64 = (value: number | bigint, name: string) => {
  const normalized = typeof value === "bigint" ? value : BigInt(value);
  if (normalized < 0n || normalized > 0xffff_ffff_ffff_ffffn) {
    throw new RangeError(`${name} must fit in u64`);
  }
  return normalized;
};

const encodeU16 = (value: number) => {
  const out = new Uint8Array(2);
  new DataView(out.buffer).setUint16(0, value, true);
  return out;
};

const encodeU32 = (value: number) => {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value, true);
  return out;
};

const encodeU64 = (value: number | bigint) => {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, assertSafeU64(value, "u64"), true);
  return out;
};

const encodeBool = (value: boolean) => Uint8Array.of(value ? 1 : 0);

const encodeString = (value: string) => {
  const bytes = encoder.encode(value);
  return concatBytes(encodeU64(bytes.length), bytes);
};

const encodeField = (payload: Uint8Array) =>
  concatBytes(encodeU64(payload.length), payload);

const encodeStruct = (fields: Uint8Array[]) =>
  concatBytes(...fields.map(encodeField));

const encodeVec = <T>(values: T[], encodeItem: (value: T) => Uint8Array) => {
  const parts: Uint8Array[] = [encodeU64(values.length)];
  values.forEach((value) => {
    const payload = encodeItem(value);
    parts.push(encodeField(payload));
  });
  return concatBytes(...parts);
};

const encodeByteVec = (bytes: Uint8Array) =>
  concatBytes(encodeU64(bytes.length), bytes);

const encodeOption = <T>(
  value: T | null | undefined,
  encodeItem: (value: T) => Uint8Array,
) => {
  if (value === null || value === undefined) {
    return Uint8Array.of(0);
  }
  const payload = encodeItem(value);
  return concatBytes(Uint8Array.of(1), encodeU64(payload.length), payload);
};

const requireByteLength = (
  bytes: Uint8Array,
  length: number,
  label: string,
) => {
  if (bytes.length !== length) {
    throw new RangeError(`${label} must be ${length} bytes`);
  }
  return bytes;
};

/**
 * Norito byte elements as the Torii Connect relay encodes and requires them in
 * plaintext frames: every byte is its own u64-length-prefixed element. The
 * relay decodes and re-encodes every frame, so raw byte arrays are rejected
 * and never delivered.
 */
const encodeByteElements = (bytes: Uint8Array) =>
  concatBytes(...Array.from(bytes, (byte) => encodeField(Uint8Array.of(byte))));

/** Norito `[u8; N]` (a 32-byte array occupies 288 bytes). */
const encodeFixedBytes = (bytes: Uint8Array, length: number, label: string) =>
  encodeByteElements(requireByteLength(bytes, length, label));

const hexCharCode = (value: number) => (value < 10 ? 48 + value : 87 + value);

export const bytesToHex = (bytes: Uint8Array) => {
  const chars = new Uint8Array(bytes.length * 2);
  try {
    bytes.forEach((value, index) => {
      chars[index * 2] = hexCharCode(value >> 4);
      chars[index * 2 + 1] = hexCharCode(value & 0x0f);
    });
    return decoder.decode(chars);
  } finally {
    chars.fill(0);
  }
};

export const hexToBytes = (hex: string) => {
  const normalized = hex.trim().replace(/^0x/i, "");
  if (
    !normalized ||
    normalized.length % 2 !== 0 ||
    /[^0-9a-f]/i.test(normalized)
  ) {
    throw new Error("hex input must contain an even number of hex characters");
  }
  const out = new Uint8Array(normalized.length / 2);
  for (let index = 0; index < out.length; index += 1) {
    out[index] = Number.parseInt(
      normalized.slice(index * 2, index * 2 + 2),
      16,
    );
  }
  return out;
};

export const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = "";
  bytes.forEach((value) => {
    binary += String.fromCharCode(value);
  });
  return btoa(binary);
};

const bytesToBase64Url = (bytes: Uint8Array) =>
  bytesToBase64(bytes)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

export const base64UrlToBytes = (value: string) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
  const binary = atob(`${normalized}${padding}`);
  const out = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    out[index] = binary.charCodeAt(index);
  }
  return out;
};

export const base64ToBytes = (value: string) => {
  const binary = atob(value.trim());
  const out = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    out[index] = binary.charCodeAt(index);
  }
  return out;
};

export const requireBoundedIrohaConnectFrame = (
  bytes: Uint8Array,
): Uint8Array => {
  if (
    bytes.byteLength < 1 ||
    bytes.byteLength > IROHA_CONNECT_MAX_FRAME_BYTES
  ) {
    throw new Error(
      `IrohaConnect relay frames must contain 1..${IROHA_CONNECT_MAX_FRAME_BYTES} bytes.`,
    );
  }
  return bytes;
};

export const decodeIrohaConnectFrameBase64 = (value: unknown): Uint8Array => {
  if (
    typeof value !== "string" ||
    value.length < 4 ||
    value.length > Math.ceil(IROHA_CONNECT_MAX_FRAME_BYTES / 3) * 4 ||
    value.trim() !== value
  ) {
    throw new Error("IrohaConnect frame base64 is invalid or oversized.");
  }
  let bytes: Uint8Array;
  try {
    bytes = requireBoundedIrohaConnectFrame(base64ToBytes(value));
  } catch (error) {
    throw new Error("IrohaConnect frame base64 is invalid or oversized.", {
      cause: error,
    });
  }
  if (bytesToBase64(bytes) !== value) {
    throw new Error("IrohaConnect frame base64 is not canonical.");
  }
  return bytes;
};

export const readIrohaConnectRelayFrame = async (
  data: unknown,
): Promise<Uint8Array> => {
  let bytes: Uint8Array;
  if (data instanceof Uint8Array) {
    bytes = data;
  } else if (data instanceof ArrayBuffer) {
    bytes = new Uint8Array(data);
  } else if (ArrayBuffer.isView(data)) {
    bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  } else if (typeof Blob !== "undefined" && data instanceof Blob) {
    if (data.size < 1 || data.size > IROHA_CONNECT_MAX_FRAME_BYTES) {
      throw new Error(
        `IrohaConnect relay frames must contain 1..${IROHA_CONNECT_MAX_FRAME_BYTES} bytes.`,
      );
    }
    bytes = new Uint8Array(await data.arrayBuffer());
  } else {
    throw new Error("IrohaConnect relay returned a non-binary frame.");
  }
  return requireBoundedIrohaConnectFrame(bytes);
};

const CRC64_XZ_TABLE = (() => {
  const table = new Array<bigint>(256);
  for (let index = 0; index < 256; index += 1) {
    let value = BigInt(index);
    for (let round = 0; round < 8; round += 1) {
      value = (value & 1n) === 1n ? (value >> 1n) ^ CRC64_XZ_POLY : value >> 1n;
    }
    table[index] = value;
  }
  return table;
})();

const crc64Xz = (bytes: Uint8Array) => {
  let crc = CRC64_XZ_INIT;
  for (const byte of bytes) {
    const tableIndex = Number((crc ^ BigInt(byte)) & 0xffn);
    crc = CRC64_XZ_TABLE[tableIndex] ^ (crc >> 8n);
  }
  return crc ^ CRC64_XZ_INIT;
};

const encodeDirection = (value: ConnectDirection) =>
  encodeU32(value === "wallet_to_app" ? 1 : 0);

const decodeDirectionPayload = (bytes: Uint8Array): ConnectDirection => {
  if (bytes.length !== 4) throw new Error("direction payload must be 4 bytes");
  const value = new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  ).getUint32(0, true);
  if (value === 0) return "app_to_wallet";
  if (value === 1) return "wallet_to_app";
  throw new Error(`unsupported Connect direction tag: ${value}`);
};

const encodeRole = (value: "app" | "wallet") =>
  encodeU32(value === "wallet" ? 1 : 0);

const decodeRolePayload = (bytes: Uint8Array): "app" | "wallet" => {
  if (bytes.length !== 4) throw new Error("role payload must be 4 bytes");
  const value = new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  ).getUint32(0, true);
  if (value === 0) return "app";
  if (value === 1) return "wallet";
  throw new Error(`unsupported Connect role tag: ${value}`);
};

const algorithmLabel = (value: number) => {
  switch (value) {
    case 0:
      return "Ed25519";
    case 1:
      return "Secp256k1";
    case 4:
      return "MlDsa";
    default:
      return `Algorithm(${value})`;
  }
};

const encodeStringArray = (values: string[]) => encodeVec(values, encodeString);

const encodePermissionsPayload = (permissions: ConnectPermissions) =>
  encodeStruct([
    encodeStringArray(permissions.methods),
    encodeStringArray(permissions.events),
    encodeOption(permissions.resources, encodeStringArray),
  ]);

const encodeSignInProofPayload = (proof: ConnectSignInProof) =>
  encodeStruct([
    encodeString(proof.domain),
    encodeString(proof.uri),
    encodeString(proof.statement),
    encodeString(proof.issuedAt),
    encodeString(proof.nonce),
  ]);

const encodeAppMetaPayload = (
  appName: string,
  appUrl: string | null,
  iconHash: string | null,
) =>
  encodeStruct([
    encodeString(appName),
    encodeOption(appUrl, encodeString),
    encodeOption(iconHash, encodeString),
  ]);

const exactNetworkIdBytes = (networkId: string, label = "networkId") => {
  if (
    typeof networkId !== "string" ||
    !networkId ||
    networkId.trim() !== networkId
  ) {
    throw new Error(`${label} must be an exact canonical NetworkId literal`);
  }
  try {
    return NetworkId.parse(networkId).toBytes();
  } catch {
    throw new Error(`${label} must be an exact canonical NetworkId literal`);
  }
};

const encodeConstraintsPayload = (networkId: string) =>
  encodeStruct([exactNetworkIdBytes(networkId, "open.constraints.network_id")]);

export const assertConnectSessionCommitment = (input: {
  sid: string;
  networkId: string;
  appPublicKeyHex: string;
  nonceBase64Url: string;
}): void => {
  const sidBytes = requireByteLength(
    base64UrlToBytes(input.sid),
    32,
    "Connect sid",
  );
  if (bytesToBase64Url(sidBytes) !== input.sid) {
    throw new Error("Connect sid must be canonical 32-byte base64url");
  }
  const nonce = requireByteLength(
    base64UrlToBytes(input.nonceBase64Url),
    16,
    "Connect nonce",
  );
  if (bytesToBase64Url(nonce) !== input.nonceBase64Url) {
    throw new Error("Connect nonce must be canonical 16-byte base64url");
  }
  const appPublicKey = requireByteLength(
    hexToBytes(input.appPublicKeyHex),
    32,
    "Connect app public key",
  );
  const expectedSid = blake2b(
    concatBytes(
      CONNECT_SID_PREFIX,
      exactNetworkIdBytes(input.networkId, "Connect networkId"),
      appPublicKey,
      nonce,
    ),
    { dkLen: 32 },
  );
  if (bytesToBase64Url(expectedSid) !== input.sid) {
    throw new Error(
      "Connect sid does not bind the exact NetworkId, app public key, and nonce",
    );
  }
};

const requireEd25519WalletSignature = (payload: {
  algorithmCode: number;
  signatureBase64: string;
}) => {
  const signatureBytes = base64ToBytes(payload.signatureBase64);
  if (payload.algorithmCode !== 0) {
    throw new Error("Connect wallet signatures must use Ed25519");
  }
  return requireByteLength(signatureBytes, 64, "wallet signature");
};

/**
 * `WalletSignatureV1` inside the end-to-end encrypted envelope, in the layout
 * the `@iroha/iroha-js` app session decodes (u8 algorithm, raw byte vector).
 * The relay never sees it; change it only in lockstep with the SDK.
 */
const encodeWalletSignaturePayload = (payload: {
  algorithmCode: number;
  signatureBase64: string;
}) =>
  encodeStruct([
    Uint8Array.of(payload.algorithmCode),
    encodeByteVec(requireEd25519WalletSignature(payload)),
  ]);

/**
 * `WalletSignatureV1` in a plaintext Approve frame, in the layout the live
 * Torii relay decodes before relaying: `Algorithm` as a u32 discriminant and
 * `Signature` as a u64 element count followed by element-framed bytes.
 */
const encodeRelayWalletSignaturePayload = (payload: {
  algorithmCode: number;
  signatureBase64: string;
}) => {
  const signatureBytes = requireEd25519WalletSignature(payload);
  return encodeStruct([
    encodeU32(payload.algorithmCode),
    concatBytes(
      encodeU64(signatureBytes.length),
      encodeByteElements(signatureBytes),
    ),
  ]);
};

const encodeControlPayload = (payload: ConnectControlPayload) => {
  switch (payload.type) {
    case "open": {
      const body = encodeStruct([
        encodeFixedBytes(
          hexToBytes(payload.appPublicKeyHex),
          32,
          "open.app_pk",
        ),
        encodeOption(payload.appMeta, (appMeta) =>
          encodeAppMetaPayload(appMeta.name, appMeta.url, appMeta.iconHash),
        ),
        encodeConstraintsPayload(payload.constraints.networkId),
        encodeOption(payload.permissions, encodePermissionsPayload),
      ]);
      return concatBytes(encodeU32(0), encodeU64(body.length), body);
    }
    case "approve": {
      const body = encodeStruct([
        encodeFixedBytes(
          hexToBytes(payload.walletPublicKeyHex),
          32,
          "approve.wallet_pk",
        ),
        encodeString(payload.accountId),
        encodeOption(payload.permissions, encodePermissionsPayload),
        encodeOption(payload.proof, encodeSignInProofPayload),
        encodeRelayWalletSignaturePayload(payload.signature),
      ]);
      return concatBytes(encodeU32(1), encodeU64(body.length), body);
    }
    case "reject": {
      const body = encodeStruct([
        encodeU16(payload.code),
        encodeString(payload.codeId),
        encodeString(payload.reason),
      ]);
      return concatBytes(encodeU32(2), encodeU64(body.length), body);
    }
    case "close": {
      const body = encodeStruct([
        encodeRole(payload.who),
        encodeU16(payload.code),
        encodeString(payload.reason),
        encodeBool(payload.retryable),
      ]);
      return concatBytes(encodeU32(3), encodeU64(body.length), body);
    }
    case "ping":
      return concatBytes(
        encodeU32(4),
        encodeU64(16),
        encodeField(encodeU64(payload.nonce)),
      );
    case "pong":
      return concatBytes(
        encodeU32(5),
        encodeU64(16),
        encodeField(encodeU64(payload.nonce)),
      );
    case "server_event": {
      if (payload.eventName !== "block_proofs") {
        throw new Error(
          `unsupported Connect server event: ${payload.eventName}`,
        );
      }
      const height = payload.payload.height;
      const entryHash = payload.payload.entryHash;
      const proofsJson = payload.payload.proofsJson;
      if (
        (typeof height !== "number" && typeof height !== "bigint") ||
        typeof entryHash !== "string" ||
        typeof proofsJson !== "string"
      ) {
        throw new Error(
          "Connect block_proofs server event payload is malformed",
        );
      }
      const eventBody = encodeStruct([
        encodeU64(height),
        encodeString(entryHash),
        encodeString(proofsJson),
      ]);
      const event = concatBytes(
        encodeU32(0),
        encodeU64(eventBody.length),
        eventBody,
      );
      const body = encodeStruct([event]);
      return concatBytes(encodeU32(6), encodeU64(body.length), body);
    }
    default:
      throw new Error(
        `encoding for Connect control "${(payload as ConnectControlPayload).type}" is not implemented`,
      );
  }
};

export const encodeControlConnectFrame = (input: {
  sid: string;
  direction: ConnectDirection;
  seq: number;
  control: ConnectControlPayload;
}) => {
  const controlPayload = encodeControlPayload(input.control);
  return encodeStruct([
    encodeFixedBytes(base64UrlToBytes(input.sid), 32, "frame.sid"),
    encodeDirection(input.direction),
    encodeU64(input.seq),
    concatBytes(encodeU32(0), encodeU64(controlPayload.length), controlPayload),
  ]);
};

export const encodeOpenConnectFrame = (
  preview: ConnectPreview,
  input: {
    networkId: string;
    appName: string;
    appUrl: string | null;
    permissions: ConnectPermissions;
  },
) =>
  encodeControlConnectFrame({
    sid: preview.sid,
    direction: "app_to_wallet",
    seq: 1,
    control: {
      type: "open",
      appPublicKeyHex: preview.publicKeyHex,
      constraints: {
        networkId: input.networkId,
      },
      appMeta: {
        name: input.appName,
        url: input.appUrl,
        iconHash: null,
      },
      permissions: input.permissions,
    },
  });

export const encodeApproveConnectFrame = (
  sid: string,
  seq: number,
  input: {
    walletPublicKeyHex: string;
    accountId: string;
    permissions?: ConnectPermissions | null;
    proof?: ConnectSignInProof | null;
    signature: {
      algorithmCode: number;
      signatureHex: string;
      signatureBase64: string;
      algorithmLabel?: string;
    };
  },
) =>
  encodeControlConnectFrame({
    sid,
    direction: "wallet_to_app",
    seq,
    control: {
      type: "approve",
      walletPublicKeyHex: input.walletPublicKeyHex,
      accountId: input.accountId,
      permissions: input.permissions ?? null,
      proof: input.proof ?? null,
      signature: {
        algorithmCode: input.signature.algorithmCode,
        algorithmLabel:
          input.signature.algorithmLabel ||
          algorithmLabel(input.signature.algorithmCode),
        signatureHex: input.signature.signatureHex,
        signatureBase64: input.signature.signatureBase64,
      },
    },
  });

export const encodePongConnectFrame = (
  sid: string,
  seq: number,
  nonce: number,
) =>
  encodeControlConnectFrame({
    sid,
    direction: "wallet_to_app",
    seq,
    control: {
      type: "pong",
      nonce,
    },
  });

export const encodeServerEventConnectFrame = (input: {
  sid: string;
  direction: ConnectDirection;
  seq: number;
  height: number | bigint;
  entryHash: string;
  proofsJson: string;
}) =>
  encodeControlConnectFrame({
    sid: input.sid,
    direction: input.direction,
    seq: input.seq,
    control: {
      type: "server_event",
      eventName: "block_proofs",
      payload: {
        height: input.height,
        entryHash: input.entryHash,
        proofsJson: input.proofsJson,
      },
    },
  });

const ensureExact = (cursor: Cursor, label: string) => {
  if (cursor.offset !== cursor.bytes.length) {
    throw new Error(`${label} has trailing bytes`);
  }
};

interface Cursor {
  bytes: Uint8Array;
  offset: number;
}

const createCursor = (bytes: Uint8Array): Cursor => ({ bytes, offset: 0 });

const readBytes = (cursor: Cursor, length: number, label: string) => {
  const end = cursor.offset + length;
  if (
    !Number.isSafeInteger(length) ||
    length < 0 ||
    end > cursor.bytes.length
  ) {
    throw new Error(`${label} is truncated`);
  }
  const slice = cursor.bytes.slice(cursor.offset, end);
  cursor.offset = end;
  return slice;
};

const readU16 = (cursor: Cursor, label: string) => {
  const view = readBytes(cursor, 2, label);
  return new DataView(view.buffer, view.byteOffset, view.byteLength).getUint16(
    0,
    true,
  );
};

const readU32 = (cursor: Cursor, label: string) => {
  const view = readBytes(cursor, 4, label);
  return new DataView(view.buffer, view.byteOffset, view.byteLength).getUint32(
    0,
    true,
  );
};

const readU64 = (cursor: Cursor, label: string) => {
  const view = readBytes(cursor, 8, label);
  const value = new DataView(
    view.buffer,
    view.byteOffset,
    view.byteLength,
  ).getBigUint64(0, true);
  const numeric = Number(value);
  if (!Number.isSafeInteger(numeric)) {
    throw new Error(`${label} exceeds JS safe integer range`);
  }
  return numeric;
};

const readField = (cursor: Cursor, label: string) => {
  const length = readU64(cursor, `${label} length`);
  return readBytes(cursor, length, label);
};

const readByteElements = (
  cursor: Cursor,
  length: number,
  label: string,
): Uint8Array => {
  const out = new Uint8Array(length);
  for (let index = 0; index < length; index += 1) {
    const element = readField(cursor, `${label}[${index}]`);
    if (element.length !== 1) {
      throw new RangeError(`${label} must use one-byte Norito elements`);
    }
    out[index] = element[0]!;
  }
  return out;
};

/** Strict inverse of {@link encodeFixedBytes}. */
const decodeFixedBytes = (
  payload: Uint8Array,
  length: number,
  label: string,
): Uint8Array => {
  const cursor = createCursor(payload);
  const out = readByteElements(cursor, length, label);
  ensureExact(cursor, label);
  return out;
};

const decodeStringPayload = (bytes: Uint8Array, label: string) => {
  const cursor = createCursor(bytes);
  const length = readU64(cursor, `${label} string length`);
  const value = decoder.decode(readBytes(cursor, length, label));
  ensureExact(cursor, label);
  return value;
};

const decodeBoolPayload = (bytes: Uint8Array, label: string) => {
  if (bytes.length !== 1)
    throw new Error(`${label} bool payload must be 1 byte`);
  return bytes[0] !== 0;
};

const decodeVecPayload = <T>(
  bytes: Uint8Array,
  label: string,
  decodeItem: (value: Uint8Array, label: string) => T,
) => {
  const cursor = createCursor(bytes);
  const count = readU64(cursor, `${label} count`);
  const out: T[] = [];
  for (let index = 0; index < count; index += 1) {
    const field = readField(cursor, `${label}[${index}]`);
    out.push(decodeItem(field, `${label}[${index}]`));
  }
  ensureExact(cursor, label);
  return out;
};

const decodeByteVecPayload = (bytes: Uint8Array, label: string) => {
  const cursor = createCursor(bytes);
  const count = readU64(cursor, `${label} count`);
  const payload = readBytes(cursor, count, label);
  ensureExact(cursor, label);
  return Uint8Array.from(payload);
};

const decodeOptionPayload = <T>(
  bytes: Uint8Array,
  label: string,
  decodeItem: (value: Uint8Array, label: string) => T,
) => {
  if (bytes.length === 0)
    throw new Error(`${label} option payload must not be empty`);
  if (bytes[0] === 0) {
    if (bytes.length !== 1)
      throw new Error(`${label} none option payload must be 1 byte`);
    return null;
  }
  if (bytes[0] !== 1)
    throw new Error(`${label} has unsupported option tag ${bytes[0]}`);
  const payload = bytes.slice(1);
  const cursor = createCursor(payload);
  const length = readU64(cursor, `${label} some length`);
  const itemBytes = readBytes(cursor, length, `${label} some payload`);
  ensureExact(cursor, `${label} some`);
  return decodeItem(itemBytes, label);
};

const decodePermissionsPayload = (
  bytes: Uint8Array,
  label: string,
): ConnectPermissions => {
  const cursor = createCursor(bytes);
  const methods = decodeVecPayload(
    readField(cursor, `${label}.methods`),
    `${label}.methods`,
    decodeStringPayload,
  );
  const events = decodeVecPayload(
    readField(cursor, `${label}.events`),
    `${label}.events`,
    decodeStringPayload,
  );
  const resources = decodeOptionPayload(
    readField(cursor, `${label}.resources`),
    `${label}.resources`,
    (payload, nestedLabel) =>
      decodeVecPayload(payload, nestedLabel, decodeStringPayload),
  );
  ensureExact(cursor, label);
  return {
    methods,
    events,
    resources,
  };
};

const decodeSignInProofPayload = (
  bytes: Uint8Array,
  label: string,
): ConnectSignInProof => {
  const cursor = createCursor(bytes);
  const domain = decodeStringPayload(
    readField(cursor, `${label}.domain`),
    `${label}.domain`,
  );
  const uri = decodeStringPayload(
    readField(cursor, `${label}.uri`),
    `${label}.uri`,
  );
  const statement = decodeStringPayload(
    readField(cursor, `${label}.statement`),
    `${label}.statement`,
  );
  const issuedAt = decodeStringPayload(
    readField(cursor, `${label}.issuedAt`),
    `${label}.issuedAt`,
  );
  const nonce = decodeStringPayload(
    readField(cursor, `${label}.nonce`),
    `${label}.nonce`,
  );
  ensureExact(cursor, label);
  return {
    domain,
    uri,
    statement,
    issuedAt,
    nonce,
  };
};

const decodeWalletSignaturePayload = (bytes: Uint8Array, label: string) => {
  const cursor = createCursor(bytes);
  const algorithmField = readField(cursor, `${label}.algorithm`);
  if (algorithmField.length !== 1) {
    throw new Error(`${label}.algorithm must be 1 byte`);
  }
  const algorithmCode = algorithmField[0] ?? 0;
  const signatureBytes = decodeByteVecPayload(
    readField(cursor, `${label}.signature`),
    `${label}.signature`,
  );
  ensureExact(cursor, label);
  if (algorithmCode !== 0) {
    throw new Error(`${label}.algorithm must be Ed25519`);
  }
  requireByteLength(signatureBytes, 64, `${label}.signature`);
  return {
    algorithmCode,
    algorithmLabel: algorithmLabel(algorithmCode),
    signatureHex: bytesToHex(signatureBytes),
    signatureBase64: bytesToBase64(signatureBytes),
  };
};

/** Strict inverse of {@link encodeRelayWalletSignaturePayload}. */
const decodeRelayWalletSignaturePayload = (
  bytes: Uint8Array,
  label: string,
) => {
  const cursor = createCursor(bytes);
  const algorithmField = readField(cursor, `${label}.algorithm`);
  if (algorithmField.length !== 4) {
    throw new Error(`${label}.algorithm must be a u32 discriminant`);
  }
  const algorithmCode = readU32(
    createCursor(algorithmField),
    `${label}.algorithm`,
  );
  const signatureCursor = createCursor(readField(cursor, `${label}.signature`));
  const count = readU64(signatureCursor, `${label}.signature.length`);
  if (algorithmCode !== 0) {
    throw new Error(`${label}.algorithm must be Ed25519`);
  }
  if (count !== 64) {
    throw new RangeError(`${label}.signature must be 64 bytes`);
  }
  const signatureBytes = readByteElements(
    signatureCursor,
    count,
    `${label}.signature`,
  );
  ensureExact(signatureCursor, `${label}.signature`);
  ensureExact(cursor, label);
  return {
    algorithmCode,
    algorithmLabel: algorithmLabel(algorithmCode),
    signatureHex: bytesToHex(signatureBytes),
    signatureBase64: bytesToBase64(signatureBytes),
  };
};

const decodeOpenControlBody = (bytes: Uint8Array): ConnectControlPayload => {
  const cursor = createCursor(bytes);
  const appPublicKey = decodeFixedBytes(
    readField(cursor, "open.app_pk"),
    32,
    "open.app_pk",
  );
  const appMeta = decodeOptionPayload(
    readField(cursor, "open.app_meta"),
    "open.app_meta",
    (payload, label) => {
      const inner = createCursor(payload);
      const name = decodeStringPayload(
        readField(inner, `${label}.name`),
        `${label}.name`,
      );
      const url = decodeOptionPayload(
        readField(inner, `${label}.url`),
        `${label}.url`,
        decodeStringPayload,
      );
      const iconHash = decodeOptionPayload(
        readField(inner, `${label}.icon_hash`),
        `${label}.icon_hash`,
        decodeStringPayload,
      );
      ensureExact(inner, label);
      return {
        name,
        url,
        iconHash,
      };
    },
  );
  const constraintsPayload = readField(cursor, "open.constraints");
  const constraintsCursor = createCursor(constraintsPayload);
  const networkIdBytes = requireByteLength(
    readField(constraintsCursor, "open.constraints.network_id"),
    NetworkId.BYTE_LENGTH,
    "open.constraints.network_id",
  );
  let networkId: string;
  try {
    networkId = NetworkId.fromBytes(networkIdBytes).toString();
  } catch {
    throw new Error("open.constraints.network_id is not a canonical NetworkId");
  }
  ensureExact(constraintsCursor, "open.constraints");
  const permissions = decodeOptionPayload(
    readField(cursor, "open.permissions"),
    "open.permissions",
    decodePermissionsPayload,
  );
  ensureExact(cursor, "open");
  return {
    type: "open",
    appPublicKeyHex: bytesToHex(appPublicKey),
    constraints: { networkId },
    appMeta,
    permissions,
  };
};

const decodeApproveControlBody = (bytes: Uint8Array): ConnectControlPayload => {
  const cursor = createCursor(bytes);
  const walletPublicKey = decodeFixedBytes(
    readField(cursor, "approve.wallet_pk"),
    32,
    "approve.wallet_pk",
  );
  const accountId = decodeStringPayload(
    readField(cursor, "approve.account_id"),
    "approve.account_id",
  );
  const permissions = decodeOptionPayload(
    readField(cursor, "approve.permissions"),
    "approve.permissions",
    decodePermissionsPayload,
  );
  const proof = decodeOptionPayload(
    readField(cursor, "approve.proof"),
    "approve.proof",
    decodeSignInProofPayload,
  );
  const signature = decodeRelayWalletSignaturePayload(
    readField(cursor, "approve.sig_wallet"),
    "approve.sig_wallet",
  );
  ensureExact(cursor, "approve");
  return {
    type: "approve",
    walletPublicKeyHex: bytesToHex(walletPublicKey),
    accountId,
    permissions,
    proof,
    signature,
  };
};

const decodeRejectControlBody = (bytes: Uint8Array): ConnectControlPayload => {
  const cursor = createCursor(bytes);
  const code = readU16(
    createCursor(readField(cursor, "reject.code")),
    "reject.code",
  );
  const codeId = decodeStringPayload(
    readField(cursor, "reject.code_id"),
    "reject.code_id",
  );
  const reason = decodeStringPayload(
    readField(cursor, "reject.reason"),
    "reject.reason",
  );
  ensureExact(cursor, "reject");
  return {
    type: "reject",
    code,
    codeId,
    reason,
  };
};

const decodeCloseControlBody = (bytes: Uint8Array): ConnectControlPayload => {
  const cursor = createCursor(bytes);
  const who = decodeRolePayload(readField(cursor, "close.who"));
  const code = readU16(
    createCursor(readField(cursor, "close.code")),
    "close.code",
  );
  const reason = decodeStringPayload(
    readField(cursor, "close.reason"),
    "close.reason",
  );
  const retryable = decodeBoolPayload(
    readField(cursor, "close.retryable"),
    "close.retryable",
  );
  ensureExact(cursor, "close");
  return {
    type: "close",
    who,
    code,
    reason,
    retryable,
  };
};

const decodePingLikeControlBody = (
  bytes: Uint8Array,
  type: "ping" | "pong",
): ConnectControlPayload => {
  const cursor = createCursor(bytes);
  const nonce = readU64(
    createCursor(readField(cursor, `${type}.nonce`)),
    `${type}.nonce`,
  );
  ensureExact(cursor, type);
  return {
    type,
    nonce,
  };
};

const decodeServerEventControlBody = (
  bytes: Uint8Array,
): ConnectControlPayload => {
  const cursor = createCursor(bytes);
  const eventField = readField(cursor, "server_event.event");
  const eventCursor = createCursor(eventField);
  const eventTag = readU32(eventCursor, "server_event.tag");
  const eventBodyLength = readU64(eventCursor, "server_event.body_length");
  const eventBody = readBytes(
    eventCursor,
    eventBodyLength,
    "server_event.body",
  );
  ensureExact(eventCursor, "server_event.payload");
  if (eventTag !== 0) {
    return {
      type: "server_event",
      eventName: `server_event_${eventTag}`,
      payload: {
        rawHex: bytesToHex(eventBody),
      },
    };
  }
  const bodyCursor = createCursor(eventBody);
  const height = readU64(
    createCursor(readField(bodyCursor, "server_event.height")),
    "server_event.height",
  );
  const entryHash = decodeStringPayload(
    readField(bodyCursor, "server_event.entry_hash"),
    "server_event.entry_hash",
  );
  const proofsJson = decodeStringPayload(
    readField(bodyCursor, "server_event.proofs_json"),
    "server_event.proofs_json",
  );
  ensureExact(bodyCursor, "server_event.block_proofs");
  return {
    type: "server_event",
    eventName: "block_proofs",
    payload: {
      height,
      entryHash,
      proofsJson,
    },
  };
};

const decodeControlPayload = (bytes: Uint8Array) => {
  const cursor = createCursor(bytes);
  const tag = readU32(cursor, "control.tag");
  const bodyLength = readU64(cursor, "control.body_length");
  const body = readBytes(cursor, bodyLength, "control.body");
  ensureExact(cursor, "control");
  switch (tag) {
    case 0:
      return decodeOpenControlBody(body);
    case 1:
      return decodeApproveControlBody(body);
    case 2:
      return decodeRejectControlBody(body);
    case 3:
      return decodeCloseControlBody(body);
    case 4:
      return decodePingLikeControlBody(body, "ping");
    case 5:
      return decodePingLikeControlBody(body, "pong");
    case 6:
      return decodeServerEventControlBody(body);
    default:
      throw new Error(`unsupported Connect control tag: ${tag}`);
  }
};

const encodeEncryptedControlPayload = (
  payload: Extract<
    ConnectEnvelopePayload,
    { type: "control_close" | "control_reject" }
  >,
) => {
  if (payload.type === "control_close") {
    return concatBytes(
      encodeU32(0),
      encodeField(encodeRole(payload.who)),
      encodeField(encodeU16(payload.code)),
      encodeField(encodeString(payload.reason)),
      encodeField(encodeBool(payload.retryable)),
    );
  }
  return concatBytes(
    encodeU32(1),
    encodeField(encodeU16(payload.code)),
    encodeField(encodeString(payload.codeId)),
    encodeField(encodeString(payload.reason)),
  );
};

const encodeEnvelopePayload = (payload: ConnectEnvelopePayload) => {
  switch (payload.type) {
    case "control_close":
    case "control_reject": {
      const controlPayload = encodeEncryptedControlPayload(payload);
      return concatBytes(encodeU32(0), encodeField(controlPayload));
    }
    case "sign_request_raw":
      return concatBytes(
        encodeU32(1),
        encodeField(encodeString(payload.domainTag)),
        encodeField(encodeByteVec(base64ToBytes(payload.bytesBase64))),
      );
    case "sign_request_tx":
      return concatBytes(
        encodeU32(2),
        encodeField(encodeByteVec(base64ToBytes(payload.txBytesBase64))),
      );
    case "sign_result_ok": {
      const signaturePayload = encodeWalletSignaturePayload(payload.signature);
      return concatBytes(encodeU32(3), encodeField(signaturePayload));
    }
    case "sign_result_err":
      return concatBytes(
        encodeU32(4),
        encodeField(encodeString(payload.code)),
        encodeField(encodeString(payload.message)),
      );
    case "display_request":
      return concatBytes(
        encodeU32(5),
        encodeField(encodeString(payload.title)),
        encodeField(encodeString(payload.body)),
      );
    default:
      throw new Error(
        `unsupported encrypted Connect payload: ${(payload as { type: string }).type}`,
      );
  }
};

const decodeEncryptedControlPayload = (
  bytes: Uint8Array,
): Extract<
  ConnectEnvelopePayload,
  { type: "control_close" | "control_reject" }
> => {
  const cursor = createCursor(bytes);
  const tag = readU32(cursor, "encrypted_control.tag");
  switch (tag) {
    case 0: {
      const who = decodeRolePayload(
        readField(cursor, "encrypted_control.close.who"),
      );
      const code = readU16(
        createCursor(readField(cursor, "encrypted_control.close.code")),
        "encrypted_control.close.code",
      );
      const reason = decodeStringPayload(
        readField(cursor, "encrypted_control.close.reason"),
        "encrypted_control.close.reason",
      );
      const retryable = decodeBoolPayload(
        readField(cursor, "encrypted_control.close.retryable"),
        "encrypted_control.close.retryable",
      );
      ensureExact(cursor, "encrypted_control.close");
      return {
        type: "control_close",
        who,
        code,
        reason,
        retryable,
      };
    }
    case 1: {
      const code = readU16(
        createCursor(readField(cursor, "encrypted_control.reject.code")),
        "encrypted_control.reject.code",
      );
      const codeId = decodeStringPayload(
        readField(cursor, "encrypted_control.reject.code_id"),
        "encrypted_control.reject.code_id",
      );
      const reason = decodeStringPayload(
        readField(cursor, "encrypted_control.reject.reason"),
        "encrypted_control.reject.reason",
      );
      ensureExact(cursor, "encrypted_control.reject");
      return {
        type: "control_reject",
        code,
        codeId,
        reason,
      };
    }
    default:
      throw new Error(`unsupported encrypted control tag: ${tag}`);
  }
};

export const decodeConnectEnvelope = (
  bytes: Uint8Array,
): ConnectEnvelopeSummary => {
  if (bytes.length < 40) {
    throw new Error("encrypted envelope is truncated");
  }
  if (!NORITO_MAGIC.every((value, index) => value === bytes[index])) {
    throw new Error("encrypted envelope has invalid Norito magic");
  }
  if (bytes[4] !== 0 || bytes[5] !== 0) {
    throw new Error("encrypted envelope uses an unsupported Norito version");
  }
  if (!ENVELOPE_V1_SCHEMA.every((value, index) => value === bytes[index + 6])) {
    throw new Error("encrypted envelope Norito schema mismatch");
  }
  if (bytes[22] !== 0 || bytes[39] !== 0) {
    throw new Error("encrypted envelope uses unsupported Norito layout flags");
  }
  const payloadLength = new DataView(
    bytes.buffer,
    bytes.byteOffset + 23,
    8,
  ).getBigUint64(0, true);
  const payload = bytes.subarray(40);
  if (payload.length !== Number(payloadLength)) {
    throw new Error("encrypted envelope payload length mismatch");
  }
  const checksum = new DataView(
    bytes.buffer,
    bytes.byteOffset + 31,
    8,
  ).getBigUint64(0, true);
  if (crc64Xz(payload) !== checksum) {
    throw new Error("encrypted envelope checksum mismatch");
  }

  const cursor = createCursor(payload);
  const seq = readU64(
    createCursor(readField(cursor, "envelope.seq")),
    "envelope.seq",
  );
  const payloadField = readField(cursor, "envelope.payload");
  ensureExact(cursor, "envelope");

  const payloadCursor = createCursor(payloadField);
  const tag = readU32(payloadCursor, "envelope.payload.tag");
  let decodedPayload: ConnectEnvelopePayload;
  switch (tag) {
    case 0:
      decodedPayload = decodeEncryptedControlPayload(
        readField(payloadCursor, "envelope.payload.control"),
      );
      break;
    case 1: {
      const domainTag = decodeStringPayload(
        readField(
          payloadCursor,
          "envelope.payload.sign_request_raw.domain_tag",
        ),
        "envelope.payload.sign_request_raw.domain_tag",
      );
      const requestBytes = decodeByteVecPayload(
        readField(payloadCursor, "envelope.payload.sign_request_raw.bytes"),
        "envelope.payload.sign_request_raw.bytes",
      );
      decodedPayload = {
        type: "sign_request_raw",
        domainTag,
        bytesHex: bytesToHex(requestBytes),
        bytesBase64: bytesToBase64(requestBytes),
        bytesLength: requestBytes.length,
      };
      break;
    }
    case 2: {
      const txBytes = decodeByteVecPayload(
        readField(payloadCursor, "envelope.payload.sign_request_tx.tx_bytes"),
        "envelope.payload.sign_request_tx.tx_bytes",
      );
      decodedPayload = {
        type: "sign_request_tx",
        txBytesHex: bytesToHex(txBytes),
        txBytesBase64: bytesToBase64(txBytes),
        txBytesLength: txBytes.length,
      };
      break;
    }
    case 3:
      decodedPayload = {
        type: "sign_result_ok",
        signature: decodeWalletSignaturePayload(
          readField(payloadCursor, "envelope.payload.sign_result_ok.signature"),
          "envelope.payload.sign_result_ok.signature",
        ),
      };
      break;
    case 4: {
      const code = decodeStringPayload(
        readField(payloadCursor, "envelope.payload.sign_result_err.code"),
        "envelope.payload.sign_result_err.code",
      );
      const message = decodeStringPayload(
        readField(payloadCursor, "envelope.payload.sign_result_err.message"),
        "envelope.payload.sign_result_err.message",
      );
      decodedPayload = {
        type: "sign_result_err",
        code,
        message,
      };
      break;
    }
    case 5: {
      const title = decodeStringPayload(
        readField(payloadCursor, "envelope.payload.display_request.title"),
        "envelope.payload.display_request.title",
      );
      const body = decodeStringPayload(
        readField(payloadCursor, "envelope.payload.display_request.body"),
        "envelope.payload.display_request.body",
      );
      decodedPayload = {
        type: "display_request",
        title,
        body,
      };
      break;
    }
    default:
      throw new Error(`unsupported encrypted Connect payload tag: ${tag}`);
  }
  ensureExact(payloadCursor, "envelope.payload");

  return {
    seq,
    payload: decodedPayload,
  };
};

export const encodeConnectEnvelope = (
  seq: number,
  payload: ConnectEnvelopePayload,
) => {
  const barePayload = encodeStruct([
    encodeU64(seq),
    encodeEnvelopePayload(payload),
  ]);
  const out = new Uint8Array(40 + barePayload.length);
  out.set(NORITO_MAGIC, 0);
  out[4] = 0;
  out[5] = 0;
  out.set(ENVELOPE_V1_SCHEMA, 6);
  out[22] = 0; // compression byte
  new DataView(out.buffer).setBigUint64(23, BigInt(barePayload.length), true);
  new DataView(out.buffer).setBigUint64(31, crc64Xz(barePayload), true);
  out[39] = 0;
  out.set(barePayload, 40);
  return out;
};

const aadForCiphertextFrame = (
  sid: string,
  direction: ConnectDirection,
  seq: number,
) =>
  concatBytes(
    CONNECT_AAD_PREFIX,
    base64UrlToBytes(sid),
    Uint8Array.of(direction === "wallet_to_app" ? 1 : 0),
    encodeU64(seq),
    Uint8Array.of(1),
  );

const nonceFromSeq = (seq: number) => {
  const nonce = new Uint8Array(12);
  nonce.set(encodeU64(seq), 4);
  return nonce;
};

export const encryptConnectEnvelope = (
  key: Uint8Array,
  sid: string,
  direction: ConnectDirection,
  seq: number,
  payload: ConnectEnvelopePayload,
) => {
  const envelope = encodeConnectEnvelope(seq, payload);
  const cipher = chacha20poly1305(
    key,
    nonceFromSeq(seq),
    aadForCiphertextFrame(sid, direction, seq),
  );
  return cipher.encrypt(envelope);
};

export const decryptConnectEnvelope = (
  key: Uint8Array,
  sid: string,
  direction: ConnectDirection,
  seq: number,
  aead: Uint8Array,
) => {
  const cipher = chacha20poly1305(
    key,
    nonceFromSeq(seq),
    aadForCiphertextFrame(sid, direction, seq),
  );
  const plaintext = cipher.decrypt(aead);
  const envelope = decodeConnectEnvelope(plaintext);
  if (envelope.seq !== seq) {
    throw new Error(
      `encrypted envelope sequence mismatch: frame=${seq} envelope=${envelope.seq}`,
    );
  }
  return envelope;
};

export const encodeCiphertextConnectFrame = (input: {
  sid: string;
  direction: ConnectDirection;
  seq: number;
  aead: Uint8Array;
}) => {
  const ciphertextBody = encodeStruct([
    encodeDirection(input.direction),
    encodeByteVec(input.aead),
  ]);
  return encodeStruct([
    encodeFixedBytes(base64UrlToBytes(input.sid), 32, "frame.sid"),
    encodeDirection(input.direction),
    encodeU64(input.seq),
    concatBytes(encodeU32(1), encodeU64(ciphertextBody.length), ciphertextBody),
  ]);
};

export const decodeConnectFrame = (bytes: Uint8Array): ConnectFrameSummary => {
  const cursor = createCursor(bytes);
  const sidBytes = decodeFixedBytes(
    readField(cursor, "frame.sid"),
    32,
    "frame.sid",
  );
  const direction = decodeDirectionPayload(readField(cursor, "frame.dir"));
  const seq = readU64(
    createCursor(readField(cursor, "frame.seq")),
    "frame.seq",
  );
  const kindField = readField(cursor, "frame.kind");
  ensureExact(cursor, "frame");

  const kindCursor = createCursor(kindField);
  const kindTag = readU32(kindCursor, "frame.kind.tag");
  const kindBodyLength = readU64(kindCursor, "frame.kind.length");
  const kindBody = readBytes(kindCursor, kindBodyLength, "frame.kind.body");
  ensureExact(kindCursor, "frame.kind");

  if (kindTag === 0) {
    return {
      sid: bytesToBase64Url(sidBytes),
      sidHex: bytesToHex(sidBytes),
      direction,
      seq,
      kind: "control",
      control: decodeControlPayload(kindBody),
      ciphertext: null,
    };
  }

  if (kindTag !== 1) {
    throw new Error(`unsupported Connect frame kind tag: ${kindTag}`);
  }

  const cipherCursor = createCursor(kindBody);
  const cipherDirection = decodeDirectionPayload(
    readField(cipherCursor, "ciphertext.dir"),
  );
  const aead = decodeByteVecPayload(
    readField(cipherCursor, "ciphertext.aead"),
    "ciphertext.aead",
  );
  ensureExact(cipherCursor, "ciphertext");
  return {
    sid: bytesToBase64Url(sidBytes),
    sidHex: bytesToHex(sidBytes),
    direction,
    seq,
    kind: "ciphertext",
    control: null,
    ciphertext: {
      direction: cipherDirection,
      aeadHex: bytesToHex(aead),
      aeadLength: aead.length,
    },
  };
};

export const hashConnectPermissions = (permissions: ConnectPermissions) =>
  blake2b(encodePermissionsPayload(permissions), { dkLen: 32 });

export const hashConnectSignInProof = (proof: ConnectSignInProof) =>
  blake2b(encodeSignInProofPayload(proof), { dkLen: 32 });

export const buildApprovePreimage = (input: {
  sid: string;
  networkId: string;
  appPublicKeyHex: string;
  walletPublicKeyHex: string;
  accountId: string;
  relayToken: string;
  permissions?: ConnectPermissions | null;
  proof?: ConnectSignInProof | null;
}) => {
  if (input.permissions || input.proof) {
    throw new Error(
      "IrohaConnect v1 approval does not support permissions or sign-in proof payloads",
    );
  }
  const taggedField = (tag: string, value: Uint8Array) => {
    const tagBytes = encoder.encode(tag);
    return concatBytes(
      encodeU16(tagBytes.length),
      tagBytes,
      encodeU64(value.length),
      value,
    );
  };
  const sidBytes = requireByteLength(
    base64UrlToBytes(input.sid),
    32,
    "approval sid",
  );
  const relayToken = input.relayToken.trim();
  if (!relayToken) {
    throw new Error("IrohaConnect approval requires the relay token");
  }
  const networkIdBytes = exactNetworkIdBytes(
    input.networkId,
    "approval networkId",
  );
  const constraints = encodeConstraintsPayload(input.networkId);
  const fields = [
    taggedField("domain", APPROVE_DOMAIN),
    taggedField("network_id", networkIdBytes),
    taggedField("constraints", blake2b(constraints, { dkLen: 32 })),
    taggedField("sid", sidBytes),
    taggedField(
      "app_pk",
      requireByteLength(
        hexToBytes(input.appPublicKeyHex),
        32,
        "approval app key",
      ),
    ),
    taggedField(
      "wallet_pk",
      requireByteLength(
        hexToBytes(input.walletPublicKeyHex),
        32,
        "approval wallet key",
      ),
    ),
    taggedField("account_id", encoder.encode(input.accountId)),
  ];
  fields.push(
    taggedField(
      "relay_auth",
      sha256(
        concatBytes(RELAY_AUTH_DOMAIN, sidBytes, encoder.encode(relayToken)),
      ),
    ),
  );
  return concatBytes(...fields);
};

export const deriveConnectDirectionKeys = (
  preview: ConnectPreview,
  walletPublicKeyHex: string,
) => {
  const privateKey = hexToBytes(preview.privateKeyHex);
  const walletPublicKey = hexToBytes(walletPublicKeyHex);
  let sharedSecret: Uint8Array | null = null;
  let sessionKey: Uint8Array | null = null;
  try {
    sharedSecret = x25519.getSharedSecret(privateKey, walletPublicKey);
    sessionKey = hkdf(
      sha256,
      sharedSecret,
      X25519_HKDF_SALT,
      X25519_HKDF_INFO,
      32,
    );
    const salt = blake2b(
      concatBytes(SALT_PREFIX, base64UrlToBytes(preview.sid)),
      { dkLen: 32 },
    );
    try {
      return {
        appKey: hkdf(sha256, sessionKey, salt, APP_INFO, 32),
        walletKey: hkdf(sha256, sessionKey, salt, WALLET_INFO, 32),
      };
    } finally {
      salt.fill(0);
    }
  } finally {
    privateKey.fill(0);
    walletPublicKey.fill(0);
    sharedSecret?.fill(0);
    sessionKey?.fill(0);
  }
};

export const generateConnectWalletKeyPair = () => {
  const privateKey = x25519.utils.randomPrivateKey();
  try {
    return {
      privateKeyHex: bytesToHex(privateKey),
      publicKeyHex: bytesToHex(x25519.getPublicKey(privateKey)),
    };
  } finally {
    privateKey.fill(0);
  }
};

export const deriveConnectWalletDirectionKeys = (input: {
  sid: string;
  appPublicKeyHex: string;
  walletPrivateKeyHex: string;
}) => {
  const privateKey = hexToBytes(input.walletPrivateKeyHex);
  const appPublicKey = hexToBytes(input.appPublicKeyHex);
  let sharedSecret: Uint8Array | null = null;
  let sessionKey: Uint8Array | null = null;
  try {
    sharedSecret = x25519.getSharedSecret(privateKey, appPublicKey);
    sessionKey = hkdf(
      sha256,
      sharedSecret,
      X25519_HKDF_SALT,
      X25519_HKDF_INFO,
      32,
    );
    const salt = blake2b(
      concatBytes(SALT_PREFIX, base64UrlToBytes(input.sid)),
      { dkLen: 32 },
    );
    try {
      return {
        appKey: hkdf(sha256, sessionKey, salt, APP_INFO, 32),
        walletKey: hkdf(sha256, sessionKey, salt, WALLET_INFO, 32),
      };
    } finally {
      salt.fill(0);
    }
  } finally {
    privateKey.fill(0);
    appPublicKey.fill(0);
    sharedSecret?.fill(0);
    sessionKey?.fill(0);
  }
};

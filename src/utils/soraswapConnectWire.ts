import { chacha20poly1305 } from "@noble/ciphers/chacha.js";
import { x25519 } from "@noble/curves/ed25519";
import { blake2b } from "@noble/hashes/blake2b";
import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha256";

export type ConnectDirection = "app_to_wallet" | "wallet_to_app";

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
        chainId: string;
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

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const APPROVE_PREFIX = encoder.encode("iroha-connect|approve|");
const SALT_PREFIX = encoder.encode("iroha-connect|salt|");
const APP_INFO = encoder.encode("iroha-connect|k_app");
const WALLET_INFO = encoder.encode("iroha-connect|k_wallet");
const NORITO_MAGIC = encoder.encode("NRT0");
const CONNECT_AAD_PREFIX = encoder.encode("connect:v1");
const ENVELOPE_V1_SCHEMA = Uint8Array.from([
  0xf3, 0x50, 0x17, 0xc7, 0x74, 0x55, 0x8f, 0x19, 0xf3, 0x50, 0x17, 0xc7, 0x74,
  0x55, 0x8f, 0x19,
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

const encodeLegacyByteVec = (bytes: Uint8Array) =>
  encodeVec(Array.from(bytes), (byte) => Uint8Array.of(byte));

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

const encodeByteArray = (bytes: Uint8Array, length: number, label: string) => {
  if (bytes.length !== length) {
    throw new RangeError(`${label} must be ${length} bytes`);
  }
  return concatBytes(
    ...Array.from(bytes, (value) => encodeField(Uint8Array.of(value))),
  );
};

const hexCharCode = (value: number) => (value < 10 ? 48 + value : 87 + value);

export const bytesToHex = (bytes: Uint8Array) => {
  const chars = new Uint8Array(bytes.length * 2);
  bytes.forEach((value, index) => {
    chars[index * 2] = hexCharCode(value >> 4);
    chars[index * 2 + 1] = hexCharCode(value & 0x0f);
  });
  return decoder.decode(chars);
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

const encodeConstraintsPayload = (chainId: string) =>
  encodeStruct([encodeString(chainId)]);

const encodeWalletSignaturePayload = (payload: {
  algorithmCode: number;
  signatureBase64: string;
}) => {
  const signatureBytes = base64ToBytes(payload.signatureBase64);
  return encodeStruct([
    encodeU32(payload.algorithmCode),
    encodeLegacyByteVec(signatureBytes),
  ]);
};

const encodeControlPayload = (payload: ConnectControlPayload) => {
  switch (payload.type) {
    case "open": {
      const body = encodeStruct([
        encodeByteArray(hexToBytes(payload.appPublicKeyHex), 32, "open.app_pk"),
        encodeOption(payload.appMeta, (appMeta) =>
          encodeAppMetaPayload(appMeta.name, appMeta.url, appMeta.iconHash),
        ),
        encodeConstraintsPayload(payload.constraints.chainId),
        encodeOption(payload.permissions, encodePermissionsPayload),
      ]);
      return concatBytes(encodeU32(0), encodeU64(body.length), body);
    }
    case "approve": {
      const body = encodeStruct([
        encodeByteArray(
          hexToBytes(payload.walletPublicKeyHex),
          32,
          "approve.wallet_pk",
        ),
        encodeString(payload.accountId),
        encodeOption(payload.permissions, encodePermissionsPayload),
        encodeOption(payload.proof, encodeSignInProofPayload),
        encodeWalletSignaturePayload(payload.signature),
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
    default:
      throw new Error(
        `encoding for Connect control "${payload.type}" is not implemented`,
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
    encodeByteArray(base64UrlToBytes(input.sid), 32, "frame.sid"),
    encodeDirection(input.direction),
    encodeU64(input.seq),
    concatBytes(encodeU32(0), encodeU64(controlPayload.length), controlPayload),
  ]);
};

export const encodeOpenConnectFrame = (
  preview: ConnectPreview,
  input: {
    chainId: string;
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
        chainId: input.chainId,
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
    direction: "app_to_wallet",
    seq,
    control: {
      type: "pong",
      nonce,
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

const decodeFixedByteArrayPayload = (
  bytes: Uint8Array,
  itemCount: number,
  label: string,
) => {
  if (bytes.length === itemCount) {
    return new Uint8Array(bytes);
  }
  const cursor = createCursor(bytes);
  const out = new Uint8Array(itemCount);
  for (let index = 0; index < itemCount; index += 1) {
    const field = readField(cursor, `${label}[${index}]`);
    if (field.length !== 1) {
      throw new Error(`${label}[${index}] byte payload must be 1 byte`);
    }
    out[index] = field[0] ?? 0;
  }
  ensureExact(cursor, label);
  return out;
};

const decodeLegacyByteVecPayload = (bytes: Uint8Array, label: string) =>
  Uint8Array.from(
    decodeVecPayload(bytes, label, (field, itemLabel) => {
      if (field.length !== 1) {
        throw new Error(`${itemLabel} byte payload must be 1 byte`);
      }
      return field[0] ?? 0;
    }),
  );

const decodeCompatByteVecPayload = (bytes: Uint8Array, label: string) => {
  try {
    return decodeByteVecPayload(bytes, label);
  } catch {
    return decodeLegacyByteVecPayload(bytes, label);
  }
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
  try {
    const cursor = createCursor(payload);
    const length = readU64(cursor, `${label} some length`);
    const itemBytes = readBytes(cursor, length, `${label} some payload`);
    ensureExact(cursor, `${label} some`);
    return decodeItem(itemBytes, label);
  } catch {
    // Accept the old client-side wire shape for local fixture compatibility.
    return decodeItem(payload, label);
  }
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
  let algorithmCode = 0;
  if (algorithmField.length === 1) {
    algorithmCode = algorithmField[0] ?? 0;
  } else if (algorithmField.length === 4) {
    algorithmCode = new DataView(
      algorithmField.buffer,
      algorithmField.byteOffset,
      algorithmField.byteLength,
    ).getUint32(0, true);
  } else {
    throw new Error(`${label}.algorithm must be 1 byte`);
  }
  const signatureBytes = decodeCompatByteVecPayload(
    readField(cursor, `${label}.signature`),
    `${label}.signature`,
  );
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
  const appPublicKey = decodeFixedByteArrayPayload(
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
  const chainId = decodeStringPayload(
    readField(constraintsCursor, "open.constraints.chain_id"),
    "open.constraints.chain_id",
  );
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
    constraints: { chainId },
    appMeta,
    permissions,
  };
};

const decodeApproveControlBody = (bytes: Uint8Array): ConnectControlPayload => {
  const cursor = createCursor(bytes);
  const walletPublicKey = decodeFixedByteArrayPayload(
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
  const signature = decodeWalletSignaturePayload(
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
  const payloadLength = new DataView(
    bytes.buffer,
    bytes.byteOffset + 23,
    8,
  ).getBigUint64(0, true);
  const flags = bytes[39];
  if (flags !== 0) {
    throw new Error(
      `unsupported Norito flags for encrypted envelope: ${flags}`,
    );
  }
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
    encodeByteArray(base64UrlToBytes(input.sid), 32, "frame.sid"),
    encodeDirection(input.direction),
    encodeU64(input.seq),
    concatBytes(encodeU32(1), encodeU64(ciphertextBody.length), ciphertextBody),
  ]);
};

export const decodeConnectFrame = (bytes: Uint8Array): ConnectFrameSummary => {
  const cursor = createCursor(bytes);
  const sidBytes = decodeFixedByteArrayPayload(
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
  appPublicKeyHex: string;
  walletPublicKeyHex: string;
  accountId: string;
  permissions?: ConnectPermissions | null;
  proof?: ConnectSignInProof | null;
}) =>
  concatBytes(
    APPROVE_PREFIX,
    base64UrlToBytes(input.sid),
    hexToBytes(input.appPublicKeyHex),
    hexToBytes(input.walletPublicKeyHex),
    encoder.encode(input.accountId),
    input.permissions
      ? hashConnectPermissions(input.permissions)
      : new Uint8Array(),
    input.proof ? hashConnectSignInProof(input.proof) : new Uint8Array(),
  );

export const deriveConnectDirectionKeys = (
  preview: ConnectPreview,
  walletPublicKeyHex: string,
) => {
  const sharedSecret = x25519.getSharedSecret(
    hexToBytes(preview.privateKeyHex),
    hexToBytes(walletPublicKeyHex),
  );
  const salt = blake2b(
    concatBytes(SALT_PREFIX, base64UrlToBytes(preview.sid)),
    { dkLen: 32 },
  );
  return {
    appKey: hkdf(sha256, sharedSecret, salt, APP_INFO, 32),
    walletKey: hkdf(sha256, sharedSecret, salt, WALLET_INFO, 32),
  };
};

export const generateWalletConnectKeyPair = () => {
  const privateKey = x25519.utils.randomPrivateKey();
  return {
    privateKeyHex: bytesToHex(privateKey),
    publicKeyHex: bytesToHex(x25519.getPublicKey(privateKey)),
  };
};

export const deriveWalletConnectDirectionKeys = (input: {
  sid: string;
  appPublicKeyHex: string;
  walletPrivateKeyHex: string;
}) => {
  const sharedSecret = x25519.getSharedSecret(
    hexToBytes(input.walletPrivateKeyHex),
    hexToBytes(input.appPublicKeyHex),
  );
  const salt = blake2b(concatBytes(SALT_PREFIX, base64UrlToBytes(input.sid)), {
    dkLen: 32,
  });
  return {
    appKey: hkdf(sha256, sharedSecret, salt, APP_INFO, 32),
    walletKey: hkdf(sha256, sharedSecret, salt, WALLET_INFO, 32),
  };
};

export type IrohaConnectRole = "app" | "wallet";

export interface ParsedIrohaConnectUri {
  raw: string;
  canonicalUri: string;
  launchUri: string;
  sid: string;
  chainId: string | null;
  node: string | null;
  role: IrohaConnectRole;
  token: string | null;
  version: string | null;
}

export interface IrohaConnectApproveFrameInput {
  sid: string | Uint8Array;
  accountId: string;
  walletPublicKey?: Uint8Array;
  walletSignature?: Uint8Array;
  sequence?: number;
}

const CONNECT_PROTOCOLS = new Set(["iroha:", "irohaconnect:"]);
const CONNECT_HOST = "connect";
const CONNECT_LAUNCH_PROTOCOL = "irohaconnect:";
const CONNECT_TOKEN_PROTOCOL_PREFIX = "iroha-connect.token.v1.";
const CONNECT_FIXED_KEY_LENGTH = 32;
const CONNECT_ED25519_SIGNATURE_LENGTH = 64;
const textEncoder = new TextEncoder();

const concatBytes = (...chunks: Uint8Array[]) => {
  const out = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
};

const encodeU32 = (value: number) => {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value, true);
  return out;
};

const encodeU64 = (value: number) => {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, BigInt(value), true);
  return out;
};

const encodeLengthPrefixed = (payload: Uint8Array) =>
  concatBytes(encodeU64(payload.length), payload);

const encodeString = (value: string) =>
  encodeLengthPrefixed(textEncoder.encode(value));

const encodeOptionNone = () => Uint8Array.of(0);

const encodeFixedU8Array32 = (bytes: Uint8Array) => {
  if (bytes.length !== CONNECT_FIXED_KEY_LENGTH) {
    throw new RangeError(
      `IrohaConnect key material must be ${CONNECT_FIXED_KEY_LENGTH} bytes.`,
    );
  }
  return concatBytes(...Array.from(bytes, (byte) => encodeLengthPrefixed(Uint8Array.of(byte))));
};

const encodeByteVec = (bytes: Uint8Array) =>
  concatBytes(
    encodeU64(bytes.length),
    ...Array.from(bytes, (byte) => encodeLengthPrefixed(Uint8Array.of(byte))),
  );

const encodeWalletSignature = (signature: Uint8Array) =>
  concatBytes(
    encodeLengthPrefixed(encodeU32(0)),
    encodeLengthPrefixed(encodeByteVec(signature)),
  );

const wrapTaggedPayload = (tag: number, payload: Uint8Array) =>
  concatBytes(encodeU32(tag), encodeU64(payload.length), payload);

const randomBytes = (length: number) => {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
};

const base64UrlEncodeUtf8 = (value: string) => {
  let binary = "";
  for (const byte of textEncoder.encode(value)) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
};

const decodeSidBytes = (sid: string | Uint8Array) => {
  if (sid instanceof Uint8Array) {
    if (sid.length !== CONNECT_FIXED_KEY_LENGTH) {
      throw new RangeError("IrohaConnect session id must be 32 bytes.");
    }
    return new Uint8Array(sid);
  }
  const body = sid.trim().replace(/=+$/u, "");
  const remainder = body.length % 4;
  const padded = `${body.replace(/-/g, "+").replace(/_/g, "/")}${"=".repeat(
    (4 - remainder) % 4,
  )}`;
  const bytes = Uint8Array.from(atob(padded), (character) =>
    character.charCodeAt(0),
  );
  if (bytes.length !== CONNECT_FIXED_KEY_LENGTH) {
    throw new RangeError("IrohaConnect session id must decode to 32 bytes.");
  }
  return bytes;
};

const requireConnectParam = (url: URL, name: string) => {
  const value = url.searchParams.get(name)?.trim() ?? "";
  if (!value) {
    throw new Error(`IrohaConnect URI is missing ${name}.`);
  }
  return value;
};

const normalizeRole = (value: string | null): IrohaConnectRole => {
  if (value === "app" || value === "wallet") {
    return value;
  }
  throw new Error("IrohaConnect URI role must be app or wallet.");
};

export const parseIrohaConnectUri = (
  input: string,
): ParsedIrohaConnectUri => {
  const raw = input.trim();
  if (!raw) {
    throw new Error("IrohaConnect URI is empty.");
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch (_error) {
    throw new Error("IrohaConnect URI is invalid.");
  }

  if (!CONNECT_PROTOCOLS.has(url.protocol) || url.hostname !== CONNECT_HOST) {
    throw new Error("QR is not an IrohaConnect session.");
  }

  const sid = requireConnectParam(url, "sid");
  const role = normalizeRole(url.searchParams.get("role"));
  const canonical = new URL(url.toString());
  canonical.protocol = "iroha:";
  const launch = new URL(url.toString());
  launch.protocol = CONNECT_LAUNCH_PROTOCOL;

  return {
    raw,
    canonicalUri: canonical.toString(),
    launchUri: launch.toString(),
    sid,
    chainId: url.searchParams.get("chain_id")?.trim() || null,
    node: url.searchParams.get("node")?.trim() || null,
    role,
    token: url.searchParams.get("token")?.trim() || null,
    version: url.searchParams.get("v")?.trim() || null,
  };
};

export const isIrohaConnectUri = (input: string): boolean => {
  try {
    parseIrohaConnectUri(input);
    return true;
  } catch (_error) {
    return false;
  }
};

export const buildIrohaConnectTokenProtocol = (token: string) => {
  const normalized = token.trim();
  if (!normalized) {
    throw new Error("IrohaConnect token is missing.");
  }
  return `${CONNECT_TOKEN_PROTOCOL_PREFIX}${base64UrlEncodeUtf8(normalized)}`;
};

export const buildIrohaConnectWebSocketUrl = (
  session: ParsedIrohaConnectUri,
  fallbackToriiUrl: string,
) => {
  const baseUrl = (session.node || fallbackToriiUrl).replace(/\/+$/u, "");
  const url = new URL("/v1/connect/ws", `${baseUrl}/`);
  if (url.protocol === "https:") {
    url.protocol = "wss:";
  } else if (url.protocol === "http:") {
    url.protocol = "ws:";
  }
  url.searchParams.set("sid", session.sid);
  url.searchParams.set("role", "wallet");
  return url.toString();
};

export const encodeIrohaConnectApproveFrame = (
  input: IrohaConnectApproveFrameInput,
) => {
  const accountId = input.accountId.trim();
  if (!accountId) {
    throw new Error("IrohaConnect approval requires an account id.");
  }
  const sid = decodeSidBytes(input.sid);
  const walletPublicKey =
    input.walletPublicKey ?? randomBytes(CONNECT_FIXED_KEY_LENGTH);
  const walletSignature =
    input.walletSignature ?? new Uint8Array(CONNECT_ED25519_SIGNATURE_LENGTH);

  const body = concatBytes(
    encodeLengthPrefixed(encodeFixedU8Array32(walletPublicKey)),
    encodeLengthPrefixed(encodeString(accountId)),
    encodeLengthPrefixed(encodeOptionNone()),
    encodeLengthPrefixed(encodeOptionNone()),
    encodeLengthPrefixed(encodeWalletSignature(walletSignature)),
  );
  const controlPayload = wrapTaggedPayload(1, body);
  const kindPayload = wrapTaggedPayload(0, controlPayload);
  return concatBytes(
    encodeLengthPrefixed(encodeFixedU8Array32(sid)),
    encodeLengthPrefixed(encodeU32(1)),
    encodeLengthPrefixed(encodeU64(input.sequence ?? 1)),
    encodeLengthPrefixed(kindPayload),
  );
};

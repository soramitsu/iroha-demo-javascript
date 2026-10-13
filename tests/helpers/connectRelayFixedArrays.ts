/**
 * Test-only bridge between the linked `@iroha/iroha-js` Connect app codec and
 * the live Torii Connect relay layout.
 *
 * Torii's Norito (commit d4f7f5f5ea) encodes `[u8; N]` element-framed: every
 * byte is a u64-length-prefixed element. The relay decodes and re-encodes
 * every frame, so `frame.sid`, `open.app_pk` and `approve.wallet_pk` must use
 * that layout, and `approve.sig_wallet` is a u32 `Algorithm` discriminant plus
 * an element-framed `Signature`. `connect.browser.js` in the linked SDK still
 * writes and reads those raw (u64 32 + 32 bytes; u8 algorithm + raw signature
 * vector), which the live relay rejects by closing the socket. This helper
 * rewrites only those plaintext-frame fields so SDK interop tests keep
 * covering the crypto, envelopes and approval preimage until the SDK emits the
 * relay layout itself. Encrypted envelopes are untouched.
 */

const FIXED_ARRAY_LENGTH = 32;
const SIGNATURE_LENGTH = 64;
const CONTROL_KIND_TAG = 0;
const OPEN_CONTROL_TAG = 0;
const APPROVE_CONTROL_TAG = 1;

type Conversion = (array: Uint8Array) => Uint8Array;
interface Layout {
  array: Conversion;
  signature: Conversion;
}

const u64 = (value: number) => {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, BigInt(value), true);
  return out;
};

const readU64 = (bytes: Uint8Array, offset: number) =>
  Number(
    new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getBigUint64(
      offset,
      true,
    ),
  );

const readU32 = (bytes: Uint8Array, offset: number) =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(
    offset,
    true,
  );

const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
};

const field = (payload: Uint8Array) => concat(u64(payload.length), payload);

/** Rewrites selected u64-length-prefixed fields of a struct body. */
const mapFields = (
  bytes: Uint8Array,
  converters: Record<number, Conversion>,
) => {
  const parts: Uint8Array[] = [];
  let offset = 0;
  for (let index = 0; offset < bytes.length; index += 1) {
    const length = readU64(bytes, offset);
    const payload = bytes.subarray(offset + 8, offset + 8 + length);
    parts.push(field(converters[index]?.(payload) ?? payload));
    offset += 8 + length;
  }
  return concat(...parts);
};

/** Rewrites the body of a `u32 tag + u64 len + body` enum value. */
const mapEnumBody = (
  bytes: Uint8Array,
  convert: (tag: number, body: Uint8Array) => Uint8Array,
) => {
  const tag = readU32(bytes, 0);
  const length = readU64(bytes, 4);
  const body = convert(tag, bytes.subarray(12, 12 + length));
  return concat(bytes.subarray(0, 4), u64(body.length), body);
};

const expandElements = (raw: Uint8Array) =>
  concat(...Array.from(raw, (byte) => field(Uint8Array.of(byte))));

const collapseElements = (framed: Uint8Array, length: number) => {
  if (framed.length !== length * 9) {
    throw new Error(`expected ${length} element-framed bytes`);
  }
  return Uint8Array.from({ length }, (_, index) => {
    if (readU64(framed, index * 9) !== 1) {
      throw new Error("expected one-byte array elements");
    }
    return framed[index * 9 + 8]!;
  });
};

const relayLayout: Layout = {
  array: (raw) => {
    if (raw.length !== FIXED_ARRAY_LENGTH) {
      throw new Error(`expected a raw ${FIXED_ARRAY_LENGTH}-byte array`);
    }
    return expandElements(raw);
  },
  // field(u8 algorithm) + field(u64 len + raw) -> field(u32) + field(u64 len + elements)
  signature: (sdk) =>
    mapFields(sdk, {
      0: (algorithm) => {
        const out = new Uint8Array(4);
        new DataView(out.buffer).setUint32(0, algorithm[0]!, true);
        return out;
      },
      1: (vector) =>
        concat(vector.subarray(0, 8), expandElements(vector.subarray(8))),
    }),
};

const sdkLayout: Layout = {
  array: (framed) => collapseElements(framed, FIXED_ARRAY_LENGTH),
  signature: (relay) =>
    mapFields(relay, {
      0: (algorithm) => Uint8Array.of(readU32(algorithm, 0)),
      1: (sequence) =>
        concat(
          sequence.subarray(0, 8),
          collapseElements(sequence.subarray(8), SIGNATURE_LENGTH),
        ),
    }),
};

const transcodeFrame = (frame: Uint8Array, layout: Layout) =>
  mapFields(frame, {
    0: layout.array,
    3: (kind) =>
      mapEnumBody(kind, (kindTag, control) =>
        kindTag !== CONTROL_KIND_TAG
          ? control
          : mapEnumBody(control, (controlTag, body) => {
              if (controlTag === OPEN_CONTROL_TAG) {
                return mapFields(body, { 0: layout.array });
              }
              if (controlTag === APPROVE_CONTROL_TAG) {
                return mapFields(body, {
                  0: layout.array,
                  4: layout.signature,
                });
              }
              return body;
            }),
      ),
  });

/** SDK (raw arrays) -> live relay layout (element-framed arrays). */
export const sdkFrameToRelayLayout = (frame: Uint8Array) =>
  transcodeFrame(frame, relayLayout);

/** Live relay layout (element-framed arrays) -> SDK (raw arrays). */
export const relayLayoutFrameToSdk = (frame: Uint8Array) =>
  transcodeFrame(frame, sdkLayout);

const toBytes = (data: unknown): Uint8Array | null => {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  return null;
};

type SocketLike = {
  send(data: ArrayBuffer | ArrayBufferView): void;
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: unknown,
  ): void;
};

/**
 * Wraps a WebSocket implementation handed to the SDK so its frames use the
 * relay layout on the wire. Incoming binary messages must be ArrayBuffer or
 * views (the SDK sets `binaryType = "arraybuffer"`).
 */
// TypeScript mixins require a constructor typed `(...args: any[])`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SocketConstructor = new (...args: any[]) => SocketLike;

export const withRelayFixedArrayLayout = <T extends SocketConstructor>(
  Base: T,
): T =>
  class extends Base {
    send(data: ArrayBuffer | ArrayBufferView) {
      const bytes = toBytes(data);
      super.send(bytes ? sdkFrameToRelayLayout(bytes) : data);
    }

    addEventListener(
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: unknown,
    ) {
      if (type !== "message") {
        super.addEventListener(type, listener, options);
        return;
      }
      const deliver =
        typeof listener === "function"
          ? listener
          : (event: Event) => listener.handleEvent(event);
      super.addEventListener(
        "message",
        (event: Event) => {
          const bytes = toBytes((event as MessageEvent).data);
          deliver(
            bytes
              ? new MessageEvent("message", {
                  data: relayLayoutFrameToSdk(bytes),
                })
              : event,
          );
        },
        options,
      );
    }
  };

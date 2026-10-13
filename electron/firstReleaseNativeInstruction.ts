import { Buffer } from "node:buffer";

import {
  getInstalledIrohaJsNativeBinding,
  installGlobalIrohaJsNativeBinding,
} from "./irohaJsNativeDir";
import { parseStrictJson } from "./secureBoundedJson";

const MAX_INSTRUCTION_BYTES = 16 * 1024 * 1024;
const MAX_NATIVE_JSON_CODE_UNITS = 16 * 1024 * 1024;
const MAX_TRIGGER_ACTION_CODE_UNITS = 4 * 1024 * 1024;
const MAX_WIRE_ID_BYTES = 256;
/** Norito frame header: magic, version, schema hash, compression, length, checksum, flags. */
const NORITO_HEADER_BYTES = 40;
const NORITO_MAGIC = "NRT0";
/** Header flag selecting compact (LEB128) length prefixes. */
const NORITO_COMPACT_LEN_FLAG = 0x02;

type JsonObject = Record<string, unknown>;

type FirstReleaseInstructionNativeBinding = Readonly<{
  noritoEncodeInstruction(jsonPayload: string, networkPrefix: number): unknown;
  noritoDecodeInstruction(bytes: Buffer, networkPrefix: number): unknown;
  inspectSubscriptionTriggerAction(
    encodedAction: string,
    networkPrefix: number,
  ): unknown;
}>;

/**
 * The current native decoders render account literals for an explicit I105
 * network prefix; there is no implicit default discriminant.
 */
const requireNetworkPrefix = (value: unknown): number => {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > 0x3fff
  ) {
    throw new TypeError(
      "Native instruction inspection requires an integer network prefix between 0 and 16383.",
    );
  }
  return value;
};

const isPlainObject = (value: unknown): value is JsonObject => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const requireNativeBinding = (): FirstReleaseInstructionNativeBinding => {
  const candidate =
    getInstalledIrohaJsNativeBinding() ??
    installGlobalIrohaJsNativeBinding(import.meta.url);
  if (
    typeof candidate.noritoEncodeInstruction !== "function" ||
    typeof candidate.noritoDecodeInstruction !== "function" ||
    typeof candidate.inspectSubscriptionTriggerAction !== "function"
  ) {
    throw new Error(
      "The reviewed Iroha native binding is missing first-release instruction inspection support.",
    );
  }
  return candidate as FirstReleaseInstructionNativeBinding;
};

const requireBoundedNativeJsonObject = (
  value: unknown,
  label: string,
): JsonObject => {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_NATIVE_JSON_CODE_UNITS
  ) {
    throw new Error(`${label} did not return bounded JSON text.`);
  }
  const decoded = parseStrictJson(value, label);
  if (!isPlainObject(decoded)) {
    throw new Error(`${label} must decode to a JSON object.`);
  }
  return decoded;
};

export const decodeFirstReleaseInstruction = (
  value: Uint8Array,
  networkPrefixValue: number,
): JsonObject => {
  if (!(value instanceof Uint8Array)) {
    throw new TypeError("Instruction bytes must be a Uint8Array.");
  }
  const networkPrefix = requireNetworkPrefix(networkPrefixValue);
  if (value.byteLength === 0 || value.byteLength > MAX_INSTRUCTION_BYTES) {
    throw new TypeError(
      "Instruction bytes are outside the first-release limit.",
    );
  }
  const bytes = Buffer.from(value);
  return requireBoundedNativeJsonObject(
    requireNativeBinding().noritoDecodeInstruction(bytes, networkPrefix),
    "Native instruction decoder response",
  );
};

/** Cross-realm check for `Uint8Array` (including Node `Buffer`) instances. */
const isUint8Array = (value: unknown): value is Uint8Array =>
  ArrayBuffer.isView(value) &&
  Object.prototype.toString.call(value) === "[object Uint8Array]";

/** Norito compact length prefix: unsigned LEB128. */
const compactLength = (value: number): Buffer => {
  const bytes: number[] = [];
  let remaining = value;
  do {
    let byte = remaining % 0x80;
    remaining = Math.floor(remaining / 0x80);
    if (remaining > 0) byte |= 0x80;
    bytes.push(byte);
  } while (remaining > 0);
  return Buffer.from(bytes);
};

/**
 * The exact compact-length body of a public `InstructionBox` frame for one
 * registered `(wire_id, concrete frame)` pair: a length-prefixed `String`
 * field followed by a length-prefixed `Vec<u8>` field. This is the layout the
 * Rust `UpdatePlainConviction` golden pins as `instruction_box_pair_hex`
 * (`fixtures/governance/plain_v1/update_plain_conviction_instruction_v1.json`).
 */
const instructionBoxPairBody = (wireId: string, frame: Buffer): Buffer => {
  const name = Buffer.from(wireId, "utf8");
  const nameField = Buffer.concat([compactLength(name.length), name]);
  const frameLength = Buffer.alloc(8);
  frameLength.writeBigUInt64LE(BigInt(frame.length));
  const frameField = Buffer.concat([frameLength, frame]);
  return Buffer.concat([
    compactLength(nameField.length),
    nameField,
    compactLength(frameField.length),
    frameField,
  ]);
};

/**
 * Admit one Torii draft instruction only when it is byte-identical to the
 * exact instruction the wallet reviewed, and return the native decoding of
 * that instruction.
 *
 * Torii drafts carry the registered *concrete* instruction frame
 * (`framed_instruction_payload`), while the native decoder admits only a
 * public `InstructionBox` frame. The wallet therefore encodes the reviewed
 * instruction JSON natively and requires that public frame to be exactly the
 * Norito header followed by the `(wire_id, frame)` pair from the draft. A
 * different wire id, concrete frame, or encoding layout fails closed.
 */
export const decodeReviewedFirstReleaseInstructionDraft = (input: {
  wireId: string;
  frame: Uint8Array;
  expectedInstruction: JsonObject;
  networkPrefix: number;
}): JsonObject => {
  const networkPrefix = requireNetworkPrefix(input.networkPrefix);
  if (
    typeof input.wireId !== "string" ||
    !/^[\x21-\x7e]+$/u.test(input.wireId) ||
    input.wireId.length > MAX_WIRE_ID_BYTES
  ) {
    throw new TypeError(
      "Draft instruction wire id must be bounded canonical ASCII text.",
    );
  }
  if (
    !isUint8Array(input.frame) ||
    input.frame.byteLength === 0 ||
    input.frame.byteLength > MAX_INSTRUCTION_BYTES
  ) {
    throw new TypeError(
      "Draft instruction bytes are outside the first-release limit.",
    );
  }
  if (
    !isPlainObject(input.expectedInstruction) ||
    Object.keys(input.expectedInstruction).length !== 1
  ) {
    throw new TypeError(
      "The reviewed instruction must be exactly one instruction envelope.",
    );
  }
  const binding = requireNativeBinding();
  const encoded: unknown = binding.noritoEncodeInstruction(
    JSON.stringify(input.expectedInstruction),
    networkPrefix,
  );
  if (!isUint8Array(encoded) || encoded.byteLength > MAX_INSTRUCTION_BYTES) {
    throw new Error(
      "Native instruction encoder did not return bounded instruction bytes.",
    );
  }
  const publicFrame = Buffer.from(encoded);
  const pairBody = instructionBoxPairBody(
    input.wireId,
    Buffer.from(input.frame),
  );
  if (
    publicFrame.length !== NORITO_HEADER_BYTES + pairBody.length ||
    publicFrame.toString("latin1", 0, NORITO_MAGIC.length) !== NORITO_MAGIC ||
    publicFrame[NORITO_HEADER_BYTES - 1] !== NORITO_COMPACT_LEN_FLAG ||
    !publicFrame.subarray(NORITO_HEADER_BYTES).equals(pairBody)
  ) {
    throw new Error(
      "The draft instruction bytes differ from the exact reviewed instruction.",
    );
  }
  return requireBoundedNativeJsonObject(
    binding.noritoDecodeInstruction(publicFrame, networkPrefix),
    "Native instruction decoder response",
  );
};

export const inspectFirstReleaseSubscriptionTriggerAction = (
  encodedAction: string,
  networkPrefixValue: number,
): JsonObject => {
  const networkPrefix = requireNetworkPrefix(networkPrefixValue);
  if (
    typeof encodedAction !== "string" ||
    encodedAction.length === 0 ||
    encodedAction.length > MAX_TRIGGER_ACTION_CODE_UNITS ||
    encodedAction.trim() !== encodedAction
  ) {
    throw new TypeError(
      "Subscription trigger action must be bounded canonical text.",
    );
  }
  return requireBoundedNativeJsonObject(
    requireNativeBinding().inspectSubscriptionTriggerAction(
      encodedAction,
      networkPrefix,
    ),
    "Native subscription trigger inspection response",
  );
};

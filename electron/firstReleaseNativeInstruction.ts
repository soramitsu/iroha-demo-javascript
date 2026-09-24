import { Buffer } from "node:buffer";

import {
  getInstalledIrohaJsNativeBinding,
  installGlobalIrohaJsNativeBinding,
} from "./irohaJsNativeDir";
import { parseStrictJson } from "./secureBoundedJson";

const MAX_INSTRUCTION_BYTES = 16 * 1024 * 1024;
const MAX_NATIVE_JSON_CODE_UNITS = 16 * 1024 * 1024;
const MAX_TRIGGER_ACTION_CODE_UNITS = 4 * 1024 * 1024;

type JsonObject = Record<string, unknown>;

type FirstReleaseInstructionNativeBinding = Readonly<{
  noritoDecodeInstruction(bytes: Buffer): unknown;
  inspectSubscriptionTriggerAction(encodedAction: string): unknown;
}>;

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
): JsonObject => {
  if (!(value instanceof Uint8Array)) {
    throw new TypeError("Instruction bytes must be a Uint8Array.");
  }
  if (value.byteLength === 0 || value.byteLength > MAX_INSTRUCTION_BYTES) {
    throw new TypeError(
      "Instruction bytes are outside the first-release limit.",
    );
  }
  const bytes = Buffer.from(value);
  return requireBoundedNativeJsonObject(
    requireNativeBinding().noritoDecodeInstruction(bytes),
    "Native instruction decoder response",
  );
};

export const inspectFirstReleaseSubscriptionTriggerAction = (
  encodedAction: string,
): JsonObject => {
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
    requireNativeBinding().inspectSubscriptionTriggerAction(encodedAction),
    "Native subscription trigger inspection response",
  );
};

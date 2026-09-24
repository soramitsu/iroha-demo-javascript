import type { KaigiCallEventPayload } from "@iroha/iroha-js";

import { normalizeCanonicalAccountIdLiteral } from "./accountAddress";
import {
  KAIGI_SEALED_BOX_SCHEMA,
  KAIGI_SECRET_BOX_SCHEMA,
  type KaigiSealedBox,
  type KaigiSecretBox,
} from "./kaigiCrypto";
import {
  deriveKaigiMeetingCode,
  requireKaigiCallId,
} from "../src/utils/kaigiInvite";

export const KAIGI_CHAIN_SIGNAL_SCHEMA =
  "iroha-demo-kaigi-chain-signal/v1" as const;
export const KAIGI_CHAIN_ANSWER_SCHEMA = "iroha-demo-kaigi-answer/v1" as const;
export const KAIGI_CALL_METADATA_SCHEMA =
  "iroha-demo-kaigi-call-metadata/v2" as const;
export const KAIGI_CALL_OFFER_SCHEMA = "iroha-demo-kaigi-offer/v2" as const;

const MAX_KAIGI_PAYLOAD_BYTES = 1024 * 1024;
const MAX_KAIGI_HUMAN_TEXT_BYTES = 1024;
const KAIGI_MEETING_WINDOW_MS = 24 * 60 * 60 * 1_000;

export type FirstReleaseKaigiMeetingPrivacy = "transparent";

export type FirstReleaseKaigiChainAnswerPayload = {
  schema: typeof KAIGI_CHAIN_ANSWER_SCHEMA;
  callId: string;
  kind: "answer";
  participantAccountId: string;
  participantId: string;
  participantName: string;
  walletIdentity: string;
  roomId: string;
  createdAtMs: number;
  description: {
    type: "answer";
    sdp: string;
  };
};

export type FirstReleaseKaigiCallOfferPayload = {
  schema: typeof KAIGI_CALL_OFFER_SCHEMA;
  callId: string;
  hostAccountId: string;
  hostDisplayName: string;
  hostParticipantId: string;
  hostKaigiPublicKeyBase64Url: string;
  createdAtMs: number;
  description: {
    type: "offer";
    sdp: string;
  };
};

export type FirstReleaseKaigiCallMetadata = {
  schema: typeof KAIGI_CALL_METADATA_SCHEMA;
  meetingCode: string;
  expiresAtMs: number;
  live: boolean;
  privacyMode: FirstReleaseKaigiMeetingPrivacy;
  encryptedOffer: KaigiSecretBox;
};

export type FirstReleaseKaigiChainSignalMetadata = {
  schema: typeof KAIGI_CHAIN_SIGNAL_SCHEMA;
  callId: string;
  signalKind: "answer";
  hostAccountId: string;
  participantAccountId: string;
  createdAtMs: number;
  encryptedSignal: KaigiSealedBox;
};

export type FirstReleaseKaigiUiEvent =
  | { kind: "roster_updated"; callId: string }
  | { kind: "ended"; callId: string; endedAtMs: number };

const isPlainRecord = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const requireRecord = (
  value: unknown,
  label: string,
): Record<string, unknown> => {
  if (!isPlainRecord(value)) {
    throw new Error(`${label} must be a plain object.`);
  }
  return value;
};

const requireExactKeys = (
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[],
  label: string,
): void => {
  const allowed = new Set([...required, ...optional]);
  const keys = Reflect.ownKeys(value);
  const unknown = keys.find(
    (key) => typeof key !== "string" || !allowed.has(key),
  );
  const missing = required.filter(
    (key) => !Object.prototype.hasOwnProperty.call(value, key),
  );
  if (unknown !== undefined || missing.length > 0) {
    throw new Error(`${label} fields must match the first-release schema.`);
  }
  for (const key of keys) {
    if (typeof key !== "string") continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
      throw new Error(`${label}.${key} must be an enumerable JSON field.`);
    }
  }
};

const requirePositiveSafeInteger = (value: unknown, label: string): number => {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    Object.is(value, -0) ||
    value <= 0
  ) {
    throw new Error(`${label} must be an exact positive safe integer.`);
  }
  return value;
};

const requireCanonicalText = (
  value: unknown,
  label: string,
  maximumBytes: number,
): string => {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value ||
    value.normalize("NFC") !== value ||
    Buffer.byteLength(value, "utf8") > maximumBytes
  ) {
    throw new Error(`${label} must be bounded canonical text.`);
  }
  return value;
};

const requireSdp = (value: unknown, label: string): string => {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    Buffer.byteLength(value, "utf8") > MAX_KAIGI_PAYLOAD_BYTES
  ) {
    throw new Error(`${label} must be a non-empty bounded SDP string.`);
  }
  return value;
};

const requireParticipantId = (value: unknown, label: string): string => {
  const participantId = requireCanonicalText(value, label, 255);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(participantId)) {
    throw new Error(`${label} must be a canonical participant identifier.`);
  }
  return participantId;
};

const requireBase64UrlBytes = (
  value: unknown,
  label: string,
  options: Readonly<{ exactBytes?: number; maximumBytes?: number }>,
): string => {
  const encodedLengthLimit = Math.ceil(
    ((options.exactBytes ?? options.maximumBytes ?? 0) * 4) / 3,
  );
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    (encodedLengthLimit > 0 && value.length > encodedLengthLimit) ||
    (options.exactBytes !== undefined && value.length !== encodedLengthLimit) ||
    !/^[A-Za-z0-9_-]+$/u.test(value)
  ) {
    throw new Error(`${label} must be canonical unpadded base64url.`);
  }
  const bytes = Buffer.from(value, "base64url");
  if (
    bytes.toString("base64url") !== value ||
    (options.exactBytes !== undefined &&
      bytes.byteLength !== options.exactBytes) ||
    (options.maximumBytes !== undefined &&
      bytes.byteLength > options.maximumBytes)
  ) {
    throw new Error(`${label} must be canonical bounded base64url.`);
  }
  return value;
};

const normalizeSecretBox = (value: unknown, label: string): KaigiSecretBox => {
  const record = requireRecord(value, label);
  requireExactKeys(
    record,
    [
      "schema",
      "saltBase64Url",
      "ivBase64Url",
      "ciphertextBase64Url",
      "authTagBase64Url",
    ],
    [],
    label,
  );
  if (record.schema !== KAIGI_SECRET_BOX_SCHEMA) {
    throw new Error(`${label}.schema is unsupported.`);
  }
  return {
    schema: KAIGI_SECRET_BOX_SCHEMA,
    saltBase64Url: requireBase64UrlBytes(
      record.saltBase64Url,
      `${label}.saltBase64Url`,
      { exactBytes: 16 },
    ),
    ivBase64Url: requireBase64UrlBytes(
      record.ivBase64Url,
      `${label}.ivBase64Url`,
      { exactBytes: 12 },
    ),
    ciphertextBase64Url: requireBase64UrlBytes(
      record.ciphertextBase64Url,
      `${label}.ciphertextBase64Url`,
      { maximumBytes: MAX_KAIGI_PAYLOAD_BYTES },
    ),
    authTagBase64Url: requireBase64UrlBytes(
      record.authTagBase64Url,
      `${label}.authTagBase64Url`,
      { exactBytes: 16 },
    ),
  };
};

const normalizeSealedBox = (value: unknown, label: string): KaigiSealedBox => {
  const record = requireRecord(value, label);
  requireExactKeys(
    record,
    [
      "schema",
      "ephemeralPublicKeyBase64Url",
      "saltBase64Url",
      "ivBase64Url",
      "ciphertextBase64Url",
      "authTagBase64Url",
    ],
    [],
    label,
  );
  if (record.schema !== KAIGI_SEALED_BOX_SCHEMA) {
    throw new Error(`${label}.schema is unsupported.`);
  }
  return {
    schema: KAIGI_SEALED_BOX_SCHEMA,
    ephemeralPublicKeyBase64Url: requireBase64UrlBytes(
      record.ephemeralPublicKeyBase64Url,
      `${label}.ephemeralPublicKeyBase64Url`,
      { exactBytes: 32 },
    ),
    saltBase64Url: requireBase64UrlBytes(
      record.saltBase64Url,
      `${label}.saltBase64Url`,
      { exactBytes: 16 },
    ),
    ivBase64Url: requireBase64UrlBytes(
      record.ivBase64Url,
      `${label}.ivBase64Url`,
      { exactBytes: 12 },
    ),
    ciphertextBase64Url: requireBase64UrlBytes(
      record.ciphertextBase64Url,
      `${label}.ciphertextBase64Url`,
      { maximumBytes: MAX_KAIGI_PAYLOAD_BYTES },
    ),
    authTagBase64Url: requireBase64UrlBytes(
      record.authTagBase64Url,
      `${label}.authTagBase64Url`,
      { exactBytes: 16 },
    ),
  };
};

const normalizeAccountId = (
  value: unknown,
  label: string,
  networkPrefix: number,
): string => {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a canonical I105 account ID.`);
  }
  return normalizeCanonicalAccountIdLiteral(value, label, networkPrefix);
};

export const requireFirstReleaseKaigiMeetingPrivacy = (
  value: unknown,
  label = "privacyMode",
): FirstReleaseKaigiMeetingPrivacy => {
  if (value !== "transparent") {
    throw new Error(`${label} must be exactly transparent.`);
  }
  return value;
};

export const requireFirstReleaseKaigiMeetingCode = (
  value: unknown,
  callId: string,
): string => {
  const expected = deriveKaigiMeetingCode(callId);
  if (value !== expected) {
    throw new Error("meetingCode must exactly match callId.");
  }
  return expected;
};

export const normalizeFirstReleaseKaigiCallMetadata = (
  value: unknown,
  input: Readonly<{
    callId: string;
    privacyMode: FirstReleaseKaigiMeetingPrivacy;
    scheduledStartMs: number;
    live: boolean;
  }>,
): FirstReleaseKaigiCallMetadata => {
  const record = requireRecord(value, "Kaigi call metadata");
  requireExactKeys(
    record,
    [
      "schema",
      "meetingCode",
      "expiresAtMs",
      "live",
      "privacyMode",
      "encryptedOffer",
    ],
    [],
    "Kaigi call metadata",
  );
  if (record.schema !== KAIGI_CALL_METADATA_SCHEMA) {
    throw new Error("Kaigi call metadata schema is invalid.");
  }
  const privacyMode = requireFirstReleaseKaigiMeetingPrivacy(
    record.privacyMode,
    "Kaigi call metadata.privacyMode",
  );
  if (privacyMode !== input.privacyMode) {
    throw new Error("Kaigi call metadata privacy mode is cross-wired.");
  }
  if (record.live !== input.live) {
    throw new Error("Kaigi call metadata.live is cross-wired.");
  }
  const scheduledStartMs = requirePositiveSafeInteger(
    input.scheduledStartMs,
    "Expected Kaigi scheduledStartMs",
  );
  const expectedExpiresAtMs = scheduledStartMs + KAIGI_MEETING_WINDOW_MS;
  if (!Number.isSafeInteger(expectedExpiresAtMs)) {
    throw new Error("Expected Kaigi meeting window exceeds the safe range.");
  }
  const expiresAtMs = requirePositiveSafeInteger(
    record.expiresAtMs,
    "Kaigi call metadata.expiresAtMs",
  );
  if (expiresAtMs !== expectedExpiresAtMs) {
    throw new Error("Kaigi call metadata.expiresAtMs is cross-wired.");
  }
  return {
    schema: KAIGI_CALL_METADATA_SCHEMA,
    meetingCode: requireFirstReleaseKaigiMeetingCode(
      record.meetingCode,
      input.callId,
    ),
    expiresAtMs,
    live: input.live,
    privacyMode,
    encryptedOffer: normalizeSecretBox(
      record.encryptedOffer,
      "Kaigi call metadata.encryptedOffer",
    ),
  };
};

export const normalizeFirstReleaseKaigiChainSignalMetadata = (
  value: unknown,
  input: Readonly<{
    callId: string;
    createdAtMs: number;
    networkPrefix: number;
  }>,
): FirstReleaseKaigiChainSignalMetadata => {
  const record = requireRecord(value, "Kaigi signal metadata");
  requireExactKeys(
    record,
    [
      "schema",
      "callId",
      "signalKind",
      "hostAccountId",
      "participantAccountId",
      "createdAtMs",
      "encryptedSignal",
    ],
    [],
    "Kaigi signal metadata",
  );
  if (record.schema !== KAIGI_CHAIN_SIGNAL_SCHEMA) {
    throw new Error("Kaigi signal metadata schema is invalid.");
  }
  const callId = requireKaigiCallId(
    record.callId,
    "Kaigi signal metadata.callId",
  );
  if (callId !== input.callId) {
    throw new Error("Kaigi signal metadata.callId is cross-wired.");
  }
  if (record.signalKind !== "answer") {
    throw new Error("Kaigi signal metadata.signalKind must be answer.");
  }
  const createdAtMs = requirePositiveSafeInteger(
    record.createdAtMs,
    "Kaigi signal metadata.createdAtMs",
  );
  if (createdAtMs !== input.createdAtMs) {
    throw new Error("Kaigi signal metadata.createdAtMs is cross-wired.");
  }
  const hostAccountId = normalizeAccountId(
    record.hostAccountId,
    "Kaigi signal metadata.hostAccountId",
    input.networkPrefix,
  );
  const participantAccountId = normalizeAccountId(
    record.participantAccountId,
    "Kaigi signal metadata.participantAccountId",
    input.networkPrefix,
  );
  return {
    schema: KAIGI_CHAIN_SIGNAL_SCHEMA,
    callId,
    signalKind: "answer",
    hostAccountId,
    participantAccountId,
    createdAtMs,
    encryptedSignal: normalizeSealedBox(
      record.encryptedSignal,
      "Kaigi signal metadata.encryptedSignal",
    ),
  };
};

export const normalizeFirstReleaseKaigiChainAnswerPayload = (
  value: unknown,
  input: Readonly<{
    callId: string;
    createdAtMs: number;
    participantAccountId: string;
    networkPrefix: number;
  }>,
): FirstReleaseKaigiChainAnswerPayload => {
  const record = requireRecord(value, "Kaigi answer payload");
  requireExactKeys(
    record,
    [
      "schema",
      "callId",
      "kind",
      "participantAccountId",
      "participantId",
      "participantName",
      "roomId",
      "createdAtMs",
      "description",
      "walletIdentity",
    ],
    [],
    "Kaigi answer payload",
  );
  if (record.schema !== KAIGI_CHAIN_ANSWER_SCHEMA) {
    throw new Error("Kaigi answer payload schema is invalid.");
  }
  if (record.kind !== "answer") {
    throw new Error("Kaigi answer payload.kind must be answer.");
  }
  const callId = requireKaigiCallId(
    record.callId,
    "Kaigi answer payload.callId",
  );
  if (callId !== input.callId || record.roomId !== input.callId) {
    throw new Error("Kaigi answer payload call identity is cross-wired.");
  }
  const createdAtMs = requirePositiveSafeInteger(
    record.createdAtMs,
    "Kaigi answer payload.createdAtMs",
  );
  if (createdAtMs !== input.createdAtMs) {
    throw new Error("Kaigi answer payload.createdAtMs is cross-wired.");
  }
  const participantAccountId = normalizeAccountId(
    record.participantAccountId,
    "Kaigi answer payload.participantAccountId",
    input.networkPrefix,
  );
  const walletIdentity = normalizeAccountId(
    record.walletIdentity,
    "Kaigi answer payload.walletIdentity",
    input.networkPrefix,
  );
  const expectedParticipantAccountId = input.participantAccountId;
  if (
    participantAccountId !== expectedParticipantAccountId ||
    walletIdentity !== expectedParticipantAccountId
  ) {
    throw new Error("Kaigi answer payload identity is cross-wired.");
  }
  const description = requireRecord(
    record.description,
    "Kaigi answer payload.description",
  );
  requireExactKeys(
    description,
    ["type", "sdp"],
    [],
    "Kaigi answer payload.description",
  );
  if (description.type !== "answer") {
    throw new Error("Kaigi answer payload.description.type must be answer.");
  }
  return {
    schema: KAIGI_CHAIN_ANSWER_SCHEMA,
    callId,
    kind: "answer",
    participantAccountId,
    participantId: requireParticipantId(
      record.participantId,
      "Kaigi answer payload.participantId",
    ),
    participantName: requireCanonicalText(
      record.participantName,
      "Kaigi answer payload.participantName",
      MAX_KAIGI_HUMAN_TEXT_BYTES,
    ),
    walletIdentity,
    roomId: input.callId,
    createdAtMs,
    description: {
      type: "answer",
      sdp: requireSdp(description.sdp, "Kaigi answer payload.description.sdp"),
    },
  };
};

export const normalizeFirstReleaseKaigiCallOfferPayload = (
  value: unknown,
  input: Readonly<{
    callId: string;
    privacyMode: FirstReleaseKaigiMeetingPrivacy;
    hostAccountId: string;
    createdAtMs: number;
    networkPrefix: number;
  }>,
): FirstReleaseKaigiCallOfferPayload => {
  const record = requireRecord(value, "Kaigi offer payload");
  requireExactKeys(
    record,
    [
      "schema",
      "callId",
      "hostAccountId",
      "hostDisplayName",
      "hostParticipantId",
      "hostKaigiPublicKeyBase64Url",
      "createdAtMs",
      "description",
    ],
    [],
    "Kaigi offer payload",
  );
  if (record.schema !== KAIGI_CALL_OFFER_SCHEMA) {
    throw new Error("Kaigi offer payload schema is invalid.");
  }
  const callId = requireKaigiCallId(
    record.callId,
    "Kaigi offer payload.callId",
  );
  if (callId !== input.callId) {
    throw new Error("Kaigi offer payload.callId is cross-wired.");
  }
  const hostAccountId = normalizeAccountId(
    record.hostAccountId,
    "Kaigi offer payload.hostAccountId",
    input.networkPrefix,
  );
  if (
    input.privacyMode !== "transparent" ||
    hostAccountId !== input.hostAccountId
  ) {
    throw new Error("Kaigi offer payload host identity is cross-wired.");
  }
  const createdAtMs = requirePositiveSafeInteger(
    record.createdAtMs,
    "Kaigi offer payload.createdAtMs",
  );
  if (createdAtMs !== input.createdAtMs) {
    throw new Error("Kaigi offer payload.createdAtMs is cross-wired.");
  }
  const description = requireRecord(
    record.description,
    "Kaigi offer payload.description",
  );
  requireExactKeys(
    description,
    ["type", "sdp"],
    [],
    "Kaigi offer payload.description",
  );
  if (description.type !== "offer") {
    throw new Error("Kaigi offer payload.description.type must be offer.");
  }
  return {
    schema: KAIGI_CALL_OFFER_SCHEMA,
    callId,
    hostAccountId,
    hostDisplayName: requireCanonicalText(
      record.hostDisplayName,
      "Kaigi offer payload.hostDisplayName",
      MAX_KAIGI_HUMAN_TEXT_BYTES,
    ),
    hostParticipantId: requireParticipantId(
      record.hostParticipantId,
      "Kaigi offer payload.hostParticipantId",
    ),
    hostKaigiPublicKeyBase64Url: requireBase64UrlBytes(
      record.hostKaigiPublicKeyBase64Url,
      "Kaigi offer payload.hostKaigiPublicKeyBase64Url",
      { exactBytes: 32 },
    ),
    createdAtMs,
    description: {
      type: "offer",
      sdp: requireSdp(description.sdp, "Kaigi offer payload.description.sdp"),
    },
  };
};

export const toFirstReleaseKaigiUiEvent = (
  event: KaigiCallEventPayload,
): FirstReleaseKaigiUiEvent => {
  const callId = requireKaigiCallId(
    event.call.call_id,
    "Kaigi call event.callId",
  );
  if (event.kind === "roster_updated") {
    return { kind: "roster_updated", callId };
  }
  return {
    kind: "ended",
    callId,
    endedAtMs: requirePositiveSafeInteger(
      event.ended_at_ms,
      "Kaigi call event.endedAtMs",
    ),
  };
};

import { parseJsonWithoutDuplicateObjectKeys } from "./json";

export type KaigiSignalKind = "offer" | "answer";

export type KaigiSignalDescription = {
  type: KaigiSignalKind;
  sdp: string;
};

export type KaigiSignalEnvelope = {
  schema: "kaigi-manual-signal/v1";
  kind: KaigiSignalKind;
  roomId: string;
  participantId: string;
  participantName: string;
  walletIdentity?: string;
  description: KaigiSignalDescription;
  createdAtMs: number;
};

export type ParsedKaigiSignalInput = KaigiSignalEnvelope;

type BuildKaigiSignalEnvelopeInput = {
  kind: KaigiSignalKind;
  roomId: string;
  participantId: string;
  participantName: string;
  walletIdentity?: string;
  description: RTCSessionDescriptionInit;
  createdAtMs?: number;
};

type KaigiRemoteTrackEventInput = Pick<RTCTrackEvent, "streams" | "track">;

const trimString = (value: unknown): string => String(value ?? "").trim();

const MAX_PACKET_CHARACTERS = 1_048_576;
const MAX_SDP_CHARACTERS = 524_288;
const MAX_ROOM_ID_CHARACTERS = 512;
const MAX_PARTICIPANT_ID_CHARACTERS = 128;
const MAX_PARTICIPANT_NAME_CHARACTERS = 256;
const MAX_WALLET_IDENTITY_CHARACTERS = 512;

const hasAsciiControlCharacter = (value: string): boolean =>
  Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || codePoint === 0x7f;
  });

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype;

const assertExactKeys = (
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[],
  label: string,
) => {
  const allowed = new Set([...required, ...optional]);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  const missing = required.filter(
    (key) => !Object.prototype.hasOwnProperty.call(value, key),
  );
  if (unknown.length > 0 || missing.length > 0) {
    throw new Error(`${label} has an invalid shape.`);
  }
};

const readCanonicalText = (
  value: unknown,
  label: string,
  maxLength: number,
): string => {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maxLength ||
    value !== value.trim() ||
    hasAsciiControlCharacter(value)
  ) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
};

const isKaigiSignalKind = (value: unknown): value is KaigiSignalKind =>
  value === "offer" || value === "answer";

export const normalizeKaigiParticipantId = (raw: string): string => {
  const source = trimString(raw);
  const base = source.length > 0 ? source : "participant";
  const normalized = base
    .toLowerCase()
    .split("")
    .map((char) => {
      if (
        (char >= "a" && char <= "z") ||
        (char >= "0" && char <= "9") ||
        char === "-"
      ) {
        return char;
      }
      if (char === "_") {
        return "-";
      }
      if (char.trim() === "") {
        return "-";
      }
      return "";
    })
    .join("")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return normalized.length > 0 ? normalized : "participant";
};

export const buildKaigiSignalEnvelope = (
  input: BuildKaigiSignalEnvelopeInput,
): KaigiSignalEnvelope => {
  const roomId = trimString(input.roomId);
  const participantName = trimString(input.participantName);
  const participantId = normalizeKaigiParticipantId(input.participantId);
  const walletIdentity = trimString(input.walletIdentity);
  const descriptionType = input.description.type;
  const descriptionSdp = String(input.description.sdp ?? "");
  const createdAtMs = input.createdAtMs ?? Date.now();

  if (!roomId || roomId.length > MAX_ROOM_ID_CHARACTERS) {
    throw new Error("Kaigi room ID is required.");
  }
  if (
    input.participantId.length > MAX_PARTICIPANT_ID_CHARACTERS ||
    participantId.length > MAX_PARTICIPANT_ID_CHARACTERS
  ) {
    throw new Error("Kaigi participant ID is invalid.");
  }
  if (
    !participantName ||
    participantName.length > MAX_PARTICIPANT_NAME_CHARACTERS
  ) {
    throw new Error("Kaigi participant name is required.");
  }
  if (walletIdentity.length > MAX_WALLET_IDENTITY_CHARACTERS) {
    throw new Error("Kaigi wallet identity is invalid.");
  }
  if (!isKaigiSignalKind(input.kind)) {
    throw new Error("Kaigi packet kind must be offer or answer.");
  }
  if (!isKaigiSignalKind(descriptionType)) {
    throw new Error("Kaigi session description type must be offer or answer.");
  }
  if (descriptionType !== input.kind) {
    throw new Error("Kaigi packet kind must match the session description.");
  }
  if (
    !trimString(descriptionSdp) ||
    descriptionSdp.length > MAX_SDP_CHARACTERS
  ) {
    throw new Error("Kaigi session description is missing SDP.");
  }
  if (!Number.isSafeInteger(createdAtMs) || createdAtMs <= 0) {
    throw new Error("Kaigi packet creation time is invalid.");
  }

  return {
    schema: "kaigi-manual-signal/v1",
    kind: input.kind,
    roomId,
    participantId,
    participantName,
    ...(walletIdentity ? { walletIdentity } : {}),
    description: {
      type: descriptionType,
      sdp: descriptionSdp,
    },
    createdAtMs,
  };
};

export const stringifyKaigiSignalEnvelope = (
  envelope: KaigiSignalEnvelope,
): string => JSON.stringify(envelope, null, 2);

export const parseKaigiSignalEnvelope = (raw: string): KaigiSignalEnvelope => {
  if (typeof raw !== "string" || raw.length > MAX_PACKET_CHARACTERS) {
    throw new Error("Kaigi packet is invalid.");
  }

  let parsed: unknown;
  try {
    parsed = parseJsonWithoutDuplicateObjectKeys(raw, "Kaigi packet");
  } catch (_error) {
    throw new Error("Kaigi packet is invalid.");
  }
  if (!isPlainRecord(parsed)) {
    throw new Error("Kaigi packet is invalid.");
  }
  assertExactKeys(
    parsed,
    [
      "schema",
      "kind",
      "roomId",
      "participantId",
      "participantName",
      "description",
      "createdAtMs",
    ],
    ["walletIdentity"],
    "Kaigi packet",
  );

  const kind = parsed.kind;
  const description = parsed.description;

  if (parsed.schema !== "kaigi-manual-signal/v1") {
    throw new Error("Unsupported Kaigi packet schema.");
  }
  if (!isKaigiSignalKind(kind)) {
    throw new Error("Kaigi packet kind must be offer or answer.");
  }
  if (!isPlainRecord(description)) {
    throw new Error("Kaigi packet description is invalid.");
  }
  assertExactKeys(description, ["type", "sdp"], [], "Kaigi packet description");
  if (!isKaigiSignalKind(description.type)) {
    throw new Error("Kaigi packet description is invalid.");
  }
  if (description.type !== kind) {
    throw new Error("Kaigi packet kind must match the session description.");
  }

  const roomId = readCanonicalText(
    parsed.roomId,
    "Kaigi packet room ID",
    MAX_ROOM_ID_CHARACTERS,
  );
  const participantName = readCanonicalText(
    parsed.participantName,
    "Kaigi packet participant name",
    MAX_PARTICIPANT_NAME_CHARACTERS,
  );
  const participantId = readCanonicalText(
    parsed.participantId,
    "Kaigi packet participant ID",
    MAX_PARTICIPANT_ID_CHARACTERS,
  );
  if (normalizeKaigiParticipantId(participantId) !== participantId) {
    throw new Error("Kaigi packet participant ID is invalid.");
  }
  if (
    typeof description.sdp !== "string" ||
    description.sdp.trim().length === 0 ||
    description.sdp.length > MAX_SDP_CHARACTERS
  ) {
    throw new Error("Kaigi packet SDP is required.");
  }
  const createdAtMs = parsed.createdAtMs;
  if (
    typeof createdAtMs !== "number" ||
    !Number.isSafeInteger(createdAtMs) ||
    createdAtMs <= 0
  ) {
    throw new Error("Kaigi packet creation time is invalid.");
  }
  const walletIdentity = Object.prototype.hasOwnProperty.call(
    parsed,
    "walletIdentity",
  )
    ? readCanonicalText(
        parsed.walletIdentity,
        "Kaigi packet wallet identity",
        MAX_WALLET_IDENTITY_CHARACTERS,
      )
    : undefined;

  return {
    schema: "kaigi-manual-signal/v1",
    kind,
    roomId,
    participantId,
    participantName,
    ...(walletIdentity === undefined ? {} : { walletIdentity }),
    description: {
      type: description.type,
      sdp: description.sdp,
    },
    createdAtMs,
  };
};

export const parseKaigiSignalInput = (
  raw: string,
  expectedKind?: KaigiSignalKind,
): ParsedKaigiSignalInput => {
  const packet = parseKaigiSignalEnvelope(raw);
  if (expectedKind && packet.kind !== expectedKind) {
    throw new Error(`Kaigi packet kind must be ${expectedKind}.`);
  }
  return packet;
};

export const mergeKaigiRemoteTrackIntoStream = (
  currentStream: MediaStream | null,
  event: KaigiRemoteTrackEventInput,
): MediaStream | null => {
  const nextStream = currentStream ?? new MediaStream();
  const existingTrackIds = new Set(
    nextStream
      .getTracks()
      .map((track) => trimString(track.id))
      .filter(Boolean),
  );
  let addedTrack = false;

  event.streams.forEach((stream) => {
    stream.getTracks().forEach((track) => {
      const trackId = trimString(track.id);
      if (trackId && existingTrackIds.has(trackId)) {
        return;
      }
      nextStream.addTrack(track);
      if (trackId) {
        existingTrackIds.add(trackId);
      }
      addedTrack = true;
    });
  });

  const remoteTrackId = trimString(event.track?.id);
  if (!remoteTrackId) {
    return addedTrack || nextStream.getTracks().length > 0
      ? nextStream
      : currentStream;
  }
  if (!existingTrackIds.has(remoteTrackId)) {
    nextStream.addTrack(event.track);
    addedTrack = true;
  }

  return addedTrack || nextStream.getTracks().length > 0
    ? nextStream
    : currentStream;
};

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

type BuildKaigiSignalEnvelopeInput = {
  kind: KaigiSignalKind;
  roomId: string;
  participantId: string;
  participantName: string;
  walletIdentity?: string;
  description: RTCSessionDescriptionInit;
  createdAtMs?: number;
};

const trimString = (value: unknown): string => String(value ?? "").trim();

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

  if (!roomId) {
    throw new Error("Kaigi room ID is required.");
  }
  if (!participantName) {
    throw new Error("Kaigi participant name is required.");
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
  if (!trimString(descriptionSdp)) {
    throw new Error("Kaigi session description is missing SDP.");
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
    createdAtMs: input.createdAtMs ?? Date.now(),
  };
};

export const stringifyKaigiSignalEnvelope = (
  envelope: KaigiSignalEnvelope,
): string => JSON.stringify(envelope, null, 2);

export const parseKaigiSignalEnvelope = (raw: string): KaigiSignalEnvelope => {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(trimString(raw)) as Record<string, unknown>;
  } catch (_error) {
    throw new Error("Kaigi packet is invalid.");
  }
  const kind = parsed.kind;
  const description =
    parsed.description && typeof parsed.description === "object"
      ? (parsed.description as Record<string, unknown>)
      : null;

  if (parsed.schema !== "kaigi-manual-signal/v1") {
    throw new Error("Unsupported Kaigi packet schema.");
  }
  if (!isKaigiSignalKind(kind)) {
    throw new Error("Kaigi packet kind must be offer or answer.");
  }
  if (!description || !isKaigiSignalKind(description.type)) {
    throw new Error("Kaigi packet description is invalid.");
  }
  if (description.type !== kind) {
    throw new Error("Kaigi packet kind must match the session description.");
  }

  const roomId = trimString(parsed.roomId);
  const participantName = trimString(parsed.participantName);
  const participantId = normalizeKaigiParticipantId(
    trimString(parsed.participantId),
  );
  const sdp = String(description.sdp ?? "");
  const createdAtMs = Number(parsed.createdAtMs);
  const walletIdentity = trimString(parsed.walletIdentity);

  if (!roomId) {
    throw new Error("Kaigi packet room ID is required.");
  }
  if (!participantName) {
    throw new Error("Kaigi packet participant name is required.");
  }
  if (!trimString(sdp)) {
    throw new Error("Kaigi packet SDP is required.");
  }
  if (!Number.isFinite(createdAtMs) || createdAtMs <= 0) {
    throw new Error("Kaigi packet creation time is invalid.");
  }

  return {
    schema: "kaigi-manual-signal/v1",
    kind,
    roomId,
    participantId,
    participantName,
    ...(walletIdentity ? { walletIdentity } : {}),
    description: {
      type: description.type,
      sdp,
    },
    createdAtMs,
  };
};

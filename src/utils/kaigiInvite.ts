export const KAIGI_INVITE_SCHEMA = "iroha-demo-kaigi-invite/v1";
export const KAIGI_MEETING_WINDOW_MS = 24 * 60 * 60 * 1000;

export type KaigiInvitePayload = {
  schema: typeof KAIGI_INVITE_SCHEMA;
  callId: string;
  meetingCode: string;
  title?: string;
  hostAccountId: string;
  hostDisplayName: string;
  hostParticipantId: string;
  hostKaigiPublicKeyBase64Url: string;
  scheduledStartMs: number;
  expiresAtMs: number;
  createdAtMs: number;
  live: boolean;
  offerDescription: {
    type: "offer";
    sdp: string;
  };
};

const trimString = (value: unknown): string => String(value ?? "").trim();

const bytesToBase64 = (bytes: Uint8Array): string => {
  let out = "";
  bytes.forEach((value) => {
    out += String.fromCharCode(value);
  });
  return btoa(out);
};

const base64ToBytes = (base64: string): Uint8Array => {
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

const toBase64Url = (value: string): string =>
  bytesToBase64(new TextEncoder().encode(value))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const fromBase64Url = (value: string): string => {
  const normalized = trimString(value).replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return new TextDecoder().decode(base64ToBytes(`${normalized}${padding}`));
};

const requireNonEmptyString = (value: unknown, label: string): string => {
  const normalized = trimString(value);
  if (!normalized) {
    throw new Error(`${label} is required.`);
  }
  return normalized;
};

const requireNonEmptyText = (value: unknown, label: string): string => {
  const normalized = String(value ?? "");
  if (!normalized.trim()) {
    throw new Error(`${label} is required.`);
  }
  return normalized;
};

const requirePositiveInteger = (value: unknown, label: string): number => {
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return normalized;
};

const sanitizeCallNamePart = (value: string): string => {
  const sanitized = trimString(value)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return sanitized || "meeting";
};

export const buildKaigiCallId = (domain: string, meetingCode: string): string =>
  `${requireNonEmptyString(domain, "domain")}:${sanitizeCallNamePart(`kaigi-${meetingCode}`)}`;

export const deriveKaigiMeetingCode = (callId: string): string => {
  const normalized = requireNonEmptyString(callId, "callId");
  const callName = normalized.split(":").slice(1).join(":");
  return callName.replace(/^kaigi-/, "") || callName;
};

export const computeKaigiMeetingExpiryMs = (
  scheduledStartMs: number,
): number =>
  requirePositiveInteger(scheduledStartMs, "scheduledStartMs") +
  KAIGI_MEETING_WINDOW_MS;

export const encodeKaigiInvitePayload = (
  payload: KaigiInvitePayload,
): string => toBase64Url(JSON.stringify(payload));

export const decodeKaigiInvitePayload = (
  token: string,
): KaigiInvitePayload => {
  const parsed = JSON.parse(fromBase64Url(token)) as Record<string, unknown>;
  if (parsed.schema !== KAIGI_INVITE_SCHEMA) {
    throw new Error("Unsupported Kaigi invite schema.");
  }
  const callId = requireNonEmptyString(parsed.callId, "callId");
  const meetingCode = requireNonEmptyString(parsed.meetingCode, "meetingCode");
  const hostAccountId = requireNonEmptyString(
    parsed.hostAccountId,
    "hostAccountId",
  );
  const hostDisplayName = requireNonEmptyString(
    parsed.hostDisplayName,
    "hostDisplayName",
  );
  const hostParticipantId = requireNonEmptyString(
    parsed.hostParticipantId,
    "hostParticipantId",
  );
  const hostKaigiPublicKeyBase64Url = requireNonEmptyString(
    parsed.hostKaigiPublicKeyBase64Url,
    "hostKaigiPublicKeyBase64Url",
  );
  const scheduledStartMs = requirePositiveInteger(
    parsed.scheduledStartMs,
    "scheduledStartMs",
  );
  const expiresAtMs = requirePositiveInteger(parsed.expiresAtMs, "expiresAtMs");
  const createdAtMs = requirePositiveInteger(parsed.createdAtMs, "createdAtMs");
  const offerDescription =
    parsed.offerDescription && typeof parsed.offerDescription === "object"
      ? (parsed.offerDescription as Record<string, unknown>)
      : null;
  if (!offerDescription || offerDescription.type !== "offer") {
    throw new Error("Kaigi invite offerDescription is invalid.");
  }
  const sdp = requireNonEmptyText(offerDescription.sdp, "offerDescription.sdp");

  return {
    schema: KAIGI_INVITE_SCHEMA,
    callId,
    meetingCode,
    ...(trimString(parsed.title) ? { title: trimString(parsed.title) } : {}),
    hostAccountId,
    hostDisplayName,
    hostParticipantId,
    hostKaigiPublicKeyBase64Url,
    scheduledStartMs,
    expiresAtMs,
    createdAtMs,
    live: Boolean(parsed.live),
    offerDescription: {
      type: "offer",
      sdp,
    },
  };
};

export const buildKaigiInviteDeepLink = (inviteToken: string): string =>
  `iroha://kaigi/join?invite=${encodeURIComponent(trimString(inviteToken))}`;

export const buildKaigiInviteHashRoute = (inviteToken: string): string =>
  `/kaigi?invite=${encodeURIComponent(trimString(inviteToken))}`;

export const extractKaigiInviteToken = (input: string): string => {
  const raw = requireNonEmptyString(input, "invite");
  if (!/[#:?]/.test(raw)) {
    return raw;
  }
  if (raw.startsWith("iroha://")) {
    const url = new URL(raw);
    return requireNonEmptyString(url.searchParams.get("invite"), "invite");
  }
  if (raw.includes("#")) {
    const hash = raw.slice(raw.indexOf("#") + 1);
    const query = hash.includes("?") ? hash.slice(hash.indexOf("?") + 1) : hash;
    const params = new URLSearchParams(query);
    const invite = trimString(params.get("invite"));
    if (invite) {
      return invite;
    }
  }
  const parsed = new URL(raw, "https://example.invalid");
  const invite = trimString(parsed.searchParams.get("invite"));
  if (invite) {
    return invite;
  }
  throw new Error("Kaigi invite link is invalid.");
};

export const parseKaigiInviteInput = (input: string): KaigiInvitePayload =>
  decodeKaigiInvitePayload(extractKaigiInviteToken(input));

export const isKaigiInviteExpired = (
  invite: Pick<KaigiInvitePayload, "expiresAtMs">,
  nowMs = Date.now(),
): boolean => nowMs > invite.expiresAtMs;

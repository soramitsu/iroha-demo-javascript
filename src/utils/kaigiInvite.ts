export const KAIGI_INVITE_SCHEMA = "iroha-demo-kaigi-invite/v1";
export const KAIGI_COMPACT_INVITE_SCHEMA = "iroha-demo-kaigi-invite/v2";
export const KAIGI_MEETING_WINDOW_MS = 24 * 60 * 60 * 1000;

export type KaigiMeetingPrivacy = "private" | "transparent";
export type KaigiPeerIdentityReveal = "Hidden" | "RevealAfterJoin";

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

export type KaigiCompactInvitePayload = {
  schema: typeof KAIGI_COMPACT_INVITE_SCHEMA;
  callId: string;
  inviteSecretBase64Url: string;
};

export type ParsedKaigiInviteInput =
  | {
      kind: "legacy";
      payload: KaigiInvitePayload;
    }
  | {
      kind: "compact";
      payload: KaigiCompactInvitePayload;
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
  const padding =
    normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return new TextDecoder().decode(base64ToBytes(`${normalized}${padding}`));
};

const requireNonEmptyString = (value: unknown, label: string): string => {
  const normalized = trimString(value);
  if (!normalized) {
    throw new Error(`${label} is required.`);
  }
  return normalized;
};

const requireBase64Url = (value: unknown, label: string): string => {
  const normalized = requireNonEmptyString(value, label);
  if (!/^[A-Za-z0-9_-]+$/.test(normalized)) {
    throw new Error(`${label} must be base64url.`);
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

const randomByte = (): number => Math.floor(Math.random() * 256);

export const createKaigiInviteSecretBase64Url = (): string => {
  const bytes = new Uint8Array(24);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    bytes.forEach((_value, index) => {
      bytes[index] = randomByte();
    });
  }
  return bytesToBase64(bytes)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
};

export const buildKaigiCallId = (domain: string, meetingCode: string): string =>
  `${requireNonEmptyString(domain, "domain")}:${sanitizeCallNamePart(`kaigi-${meetingCode}`)}`;

export const deriveKaigiMeetingCode = (callId: string): string => {
  const normalized = requireNonEmptyString(callId, "callId");
  const callName = normalized.split(":").slice(1).join(":");
  return callName.replace(/^kaigi-/, "") || callName;
};

export const computeKaigiMeetingExpiryMs = (scheduledStartMs: number): number =>
  requirePositiveInteger(scheduledStartMs, "scheduledStartMs") +
  KAIGI_MEETING_WINDOW_MS;

export const encodeKaigiInvitePayload = (payload: KaigiInvitePayload): string =>
  toBase64Url(JSON.stringify(payload));

export const decodeKaigiInvitePayload = (token: string): KaigiInvitePayload => {
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

export const buildKaigiCompactInvitePayload = (
  callId: string,
  inviteSecretBase64Url: string,
): KaigiCompactInvitePayload => ({
  schema: KAIGI_COMPACT_INVITE_SCHEMA,
  callId: requireNonEmptyString(callId, "callId"),
  inviteSecretBase64Url: requireBase64Url(
    inviteSecretBase64Url,
    "inviteSecretBase64Url",
  ),
});

export const buildKaigiCompactInviteDeepLink = (
  payload:
    | KaigiCompactInvitePayload
    | { callId: string; inviteSecretBase64Url: string },
): string =>
  `iroha://kaigi/join?call=${encodeURIComponent(requireNonEmptyString(payload.callId, "callId"))}&secret=${encodeURIComponent(requireBase64Url(payload.inviteSecretBase64Url, "inviteSecretBase64Url"))}`;

export const buildKaigiCompactInviteHashRoute = (
  payload:
    | KaigiCompactInvitePayload
    | { callId: string; inviteSecretBase64Url: string },
): string =>
  `/kaigi?call=${encodeURIComponent(requireNonEmptyString(payload.callId, "callId"))}&secret=${encodeURIComponent(requireBase64Url(payload.inviteSecretBase64Url, "inviteSecretBase64Url"))}`;

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

export const parseKaigiLegacyInviteInput = (
  input: string,
): KaigiInvitePayload =>
  decodeKaigiInvitePayload(extractKaigiInviteToken(input));

const extractCompactInvitePayload = (
  params: URLSearchParams,
): KaigiCompactInvitePayload | null => {
  const callId = trimString(params.get("call"));
  const inviteSecretBase64Url = trimString(params.get("secret"));
  if (!callId || !inviteSecretBase64Url) {
    return null;
  }
  return buildKaigiCompactInvitePayload(callId, inviteSecretBase64Url);
};

const parseCompactInviteFromInput = (
  input: string,
): KaigiCompactInvitePayload | null => {
  const raw = trimString(input);
  if (!raw) {
    return null;
  }
  if (!/[#:?]/.test(raw)) {
    return null;
  }
  if (raw.startsWith("iroha://")) {
    const url = new URL(raw);
    return extractCompactInvitePayload(url.searchParams);
  }
  if (raw.includes("#")) {
    const hash = raw.slice(raw.indexOf("#") + 1);
    const query = hash.includes("?") ? hash.slice(hash.indexOf("?") + 1) : hash;
    const compact = extractCompactInvitePayload(new URLSearchParams(query));
    if (compact) {
      return compact;
    }
  }
  const parsed = new URL(raw, "https://example.invalid");
  return extractCompactInvitePayload(parsed.searchParams);
};

export const parseKaigiInviteInput = (
  input: string,
): ParsedKaigiInviteInput => {
  const compact = parseCompactInviteFromInput(input);
  if (compact) {
    return {
      kind: "compact",
      payload: compact,
    };
  }
  return {
    kind: "legacy",
    payload: parseKaigiLegacyInviteInput(input),
  };
};

export const isKaigiInviteExpired = (
  invite: Pick<KaigiInvitePayload, "expiresAtMs">,
  nowMs = Date.now(),
): boolean => nowMs > invite.expiresAtMs;

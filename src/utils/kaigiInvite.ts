export const KAIGI_COMPACT_INVITE_SCHEMA = "iroha-demo-kaigi-invite/v2";
export const KAIGI_MEETING_WINDOW_MS = 24 * 60 * 60 * 1000;

export type KaigiMeetingPrivacy = "private" | "transparent";
export type KaigiPeerIdentityReveal = "Hidden" | "RevealAfterJoin";

export type KaigiCompactInvitePayload = {
  schema: typeof KAIGI_COMPACT_INVITE_SCHEMA;
  callId: string;
  inviteSecretBase64Url: string;
};

export type ParsedKaigiInviteInput = {
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

const qualifyKaigiDomain = (domain: string): string => {
  const normalized = requireNonEmptyString(domain, "domain");
  return normalized.includes(".") ? normalized : `${normalized}.universal`;
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
  `${qualifyKaigiDomain(domain)}:${sanitizeCallNamePart(`kaigi-${meetingCode}`)}`;

export const deriveKaigiMeetingCode = (callId: string): string => {
  const normalized = requireNonEmptyString(callId, "callId");
  const callName = normalized.split(":").slice(1).join(":");
  return callName.replace(/^kaigi-/, "") || callName;
};

export const computeKaigiMeetingExpiryMs = (scheduledStartMs: number): number =>
  requirePositiveInteger(scheduledStartMs, "scheduledStartMs") +
  KAIGI_MEETING_WINDOW_MS;

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
  if (!compact) {
    throw new Error(
      "Kaigi invite link must contain an on-chain call and invite secret.",
    );
  }
  return {
    kind: "compact",
    payload: compact,
  };
};

export const isKaigiInviteExpired = (
  invite: { expiresAtMs: number },
  nowMs = Date.now(),
): boolean => nowMs > invite.expiresAtMs;

export const KAIGI_MEETING_WINDOW_MS = 24 * 60 * 60 * 1000;
export const KAIGI_INVITE_SECRET_BYTES = 24;
export const KAIGI_INVITE_SECRET_BASE64URL_LENGTH = 32;
const KAIGI_DOMAIN_LABEL_MAX_LENGTH = 63;
const KAIGI_CALL_NAME_MAX_UTF8_BYTES = 255;
const KAIGI_INVITE_MAX_LENGTH = 1_024;

export type KaigiInvite = {
  callId: string;
  inviteSecretBase64Url: string;
};

const canonicalDomainLabelPattern = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)$/;
const forbiddenKaigiNamePattern =
  /[\p{Cc}\p{White_Space}@#$\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;
const utf8Encoder = new TextEncoder();

const hasUnpairedSurrogate = (value: string): boolean => {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) {
        return true;
      }
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      return true;
    }
  }
  return false;
};

const requireExactString = (value: unknown, label: string): string => {
  if (typeof value !== "string" || !value) {
    throw new Error(`${label} is required.`);
  }
  if (value.trim() !== value) {
    throw new Error(`${label} must not contain surrounding whitespace.`);
  }
  return value;
};

export const requireKaigiCallId = (
  value: unknown,
  label = "callId",
): string => {
  const callId = requireExactString(value, label);
  if (callId.normalize("NFC") !== callId) {
    throw new Error(`${label} must already use canonical NFC text.`);
  }
  if ((callId.match(/:/g) ?? []).length !== 1) {
    throw new Error(
      `${label} must be in exact domain.dataspace:meeting format.`,
    );
  }
  const [domainId, callName] = callId.split(":");
  const domainLabels = domainId.split(".");
  if (
    domainLabels.length !== 2 ||
    domainLabels.some(
      (part) =>
        part.length > KAIGI_DOMAIN_LABEL_MAX_LENGTH ||
        !canonicalDomainLabelPattern.test(part),
    ) ||
    !callName ||
    hasUnpairedSurrogate(callName) ||
    callName.normalize("NFC") !== callName ||
    utf8Encoder.encode(callName).byteLength > KAIGI_CALL_NAME_MAX_UTF8_BYTES ||
    forbiddenKaigiNamePattern.test(callName)
  ) {
    throw new Error(
      `${label} must be in exact domain.dataspace:meeting format.`,
    );
  }
  return callId;
};

export const requireKaigiInviteSecretBase64Url = (
  value: unknown,
  label = "inviteSecretBase64Url",
): string => {
  const secret = requireExactString(value, label);
  if (
    secret.length !== KAIGI_INVITE_SECRET_BASE64URL_LENGTH ||
    !/^[A-Za-z0-9_-]{32}$/.test(secret)
  ) {
    throw new Error(
      `${label} must be an unpadded base64url encoding of exactly ${KAIGI_INVITE_SECRET_BYTES} bytes.`,
    );
  }
  return secret;
};

const bytesToBase64Url = (bytes: Uint8Array): string => {
  let binary = "";
  bytes.forEach((value) => {
    binary += String.fromCharCode(value);
  });
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
};

const fillCryptographicallyRandom = (bytes: Uint8Array): Uint8Array => {
  const crypto = globalThis.crypto;
  if (!crypto?.getRandomValues) {
    throw new Error("Cryptographically secure randomness is unavailable.");
  }
  return crypto.getRandomValues(bytes);
};

const requireKaigiDomainId = (value: unknown): string => {
  const domainId = requireExactString(value, "domain");
  const labels = domainId.split(".");
  if (
    labels.length !== 2 ||
    labels.some(
      (part) =>
        part.length > KAIGI_DOMAIN_LABEL_MAX_LENGTH ||
        !canonicalDomainLabelPattern.test(part),
    )
  ) {
    throw new Error("domain must be in exact domain.dataspace format.");
  }
  return domainId;
};

export const createKaigiMeetingCode = (): string =>
  Array.from(fillCryptographicallyRandom(new Uint8Array(8)), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");

export const createKaigiInviteSecretBase64Url = (): string =>
  requireKaigiInviteSecretBase64Url(
    bytesToBase64Url(
      fillCryptographicallyRandom(new Uint8Array(KAIGI_INVITE_SECRET_BYTES)),
    ),
  );

export const buildKaigiCallId = (domain: string, meetingCode: string): string =>
  requireKaigiCallId(
    `${requireKaigiDomainId(domain)}:kaigi-${requireExactString(
      meetingCode,
      "meetingCode",
    )}`,
  );

export const deriveKaigiMeetingCode = (callId: string): string => {
  const normalized = requireKaigiCallId(callId);
  const callName = normalized.split(":")[1] ?? "";
  if (!callName.startsWith("kaigi-") || callName.length === "kaigi-".length) {
    throw new Error("callId is not an app-generated Kaigi meeting ID.");
  }
  return callName.slice("kaigi-".length);
};

const requirePositiveInteger = (value: unknown, label: string): number => {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value <= 0 ||
    value > Number.MAX_SAFE_INTEGER - KAIGI_MEETING_WINDOW_MS
  ) {
    throw new Error(`${label} must be a bounded positive safe integer.`);
  }
  return value;
};

export const computeKaigiMeetingExpiryMs = (scheduledStartMs: number): number =>
  requirePositiveInteger(scheduledStartMs, "scheduledStartMs") +
  KAIGI_MEETING_WINDOW_MS;

export const buildKaigiInvite = (
  callId: string,
  inviteSecretBase64Url: string,
): KaigiInvite => ({
  callId: requireKaigiCallId(callId),
  inviteSecretBase64Url: requireKaigiInviteSecretBase64Url(
    inviteSecretBase64Url,
  ),
});

const buildKaigiInviteQuery = (invite: KaigiInvite): string => {
  const canonical = buildKaigiInvite(
    invite.callId,
    invite.inviteSecretBase64Url,
  );
  const params = new URLSearchParams();
  params.set("call", canonical.callId);
  params.set("secret", canonical.inviteSecretBase64Url);
  return params.toString();
};

export const buildKaigiInviteDeepLink = (invite: KaigiInvite): string =>
  `iroha://kaigi/join?${buildKaigiInviteQuery(invite)}`;

export const buildKaigiInviteHashRoute = (invite: KaigiInvite): string =>
  `/kaigi?${buildKaigiInviteQuery(invite)}`;

const parseExactInviteQuery = (query: string): KaigiInvite | null => {
  if (!query || query.length > KAIGI_INVITE_MAX_LENGTH) {
    return null;
  }
  const params = new URLSearchParams(query);
  const entries = Array.from(params.entries());
  if (
    entries.length !== 2 ||
    params.getAll("call").length !== 1 ||
    params.getAll("secret").length !== 1 ||
    entries.some(([key]) => key !== "call" && key !== "secret")
  ) {
    return null;
  }
  try {
    const invite = buildKaigiInvite(
      params.get("call") ?? "",
      params.get("secret") ?? "",
    );
    return buildKaigiInviteQuery(invite) === query ? invite : null;
  } catch {
    return null;
  }
};

export const parseKaigiInviteDeepLink = (input: string): KaigiInvite | null => {
  if (
    typeof input !== "string" ||
    input.length > KAIGI_INVITE_MAX_LENGTH ||
    !input.startsWith("iroha://kaigi/join?")
  ) {
    return null;
  }
  try {
    const url = new URL(input);
    if (
      url.protocol !== "iroha:" ||
      url.hostname !== "kaigi" ||
      url.pathname !== "/join" ||
      url.username ||
      url.password ||
      url.port ||
      url.hash
    ) {
      return null;
    }
    const invite = parseExactInviteQuery(url.search.slice(1));
    return invite && buildKaigiInviteDeepLink(invite) === input ? invite : null;
  } catch {
    return null;
  }
};

const parseKaigiInviteHashRoute = (input: string): KaigiInvite | null => {
  if (!input.startsWith("#") || input.length > KAIGI_INVITE_MAX_LENGTH) {
    return null;
  }
  const hashRoute = input.slice(1);
  if (!hashRoute.startsWith("/kaigi?") || hashRoute.includes("#")) {
    return null;
  }
  const query = hashRoute.slice("/kaigi?".length);
  const invite = parseExactInviteQuery(query);
  return invite && `#${buildKaigiInviteHashRoute(invite)}` === input
    ? invite
    : null;
};

export const parseKaigiInviteInput = (input: string): KaigiInvite => {
  const raw = typeof input === "string" ? input : "";
  if (!raw || raw.trim() !== raw) {
    throw new Error(
      "Kaigi invite must be an exact call-and-secret meeting link.",
    );
  }
  const invite =
    parseKaigiInviteDeepLink(raw) ?? parseKaigiInviteHashRoute(raw);
  if (!invite) {
    throw new Error(
      "Kaigi invite must be an exact call-and-secret meeting link.",
    );
  }
  return invite;
};

export const isKaigiMeetingExpired = (
  meeting: { expiresAtMs: number },
  nowMs = Date.now(),
): boolean => nowMs >= meeting.expiresAtMs;

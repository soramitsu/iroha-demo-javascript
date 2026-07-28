export const KAIGI_MEETING_WINDOW_MS = 24 * 60 * 60 * 1000;
export const KAIGI_INVITE_SECRET_BYTES = 24;
export const KAIGI_INVITE_SECRET_BASE64URL_LENGTH = 32;

export type KaigiMeetingPrivacy = "private" | "transparent";
export type KaigiPeerIdentityReveal = "Hidden" | "RevealAfterJoin";

export type KaigiInvite = {
  callId: string;
  inviteSecretBase64Url: string;
};

const canonicalDomainLabelPattern = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)$/;

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
    domainLabels.some((part) => !canonicalDomainLabelPattern.test(part)) ||
    !callName ||
    /[\s@#$:]/u.test(callName)
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

const sanitizeCallNamePart = (value: string): string => {
  const sanitized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return sanitized || "meeting";
};

const requireKaigiDomainId = (value: unknown): string => {
  const domainId = requireExactString(value, "domain");
  const labels = domainId.split(".");
  if (
    labels.length !== 2 ||
    labels.some((part) => !canonicalDomainLabelPattern.test(part))
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
    `${requireKaigiDomainId(domain)}:${sanitizeCallNamePart(
      `kaigi-${requireExactString(meetingCode, "meetingCode")}`,
    )}`,
  );

export const deriveKaigiMeetingCode = (callId: string): string => {
  const normalized = requireKaigiCallId(callId);
  const callName = normalized.split(":")[1] ?? "";
  return callName.replace(/^kaigi-/, "") || callName;
};

const requirePositiveInteger = (value: unknown, label: string): number => {
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return normalized;
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

const parseExactInviteQuery = (params: URLSearchParams): KaigiInvite | null => {
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
    return buildKaigiInvite(
      params.get("call") ?? "",
      params.get("secret") ?? "",
    );
  } catch {
    return null;
  }
};

export const parseKaigiInviteDeepLink = (input: string): KaigiInvite | null => {
  if (!input.startsWith("iroha://kaigi/join?")) {
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
    return parseExactInviteQuery(url.searchParams);
  } catch {
    return null;
  }
};

const parseKaigiInviteHashRoute = (input: string): KaigiInvite | null => {
  const hashRoute = input.startsWith("#") ? input.slice(1) : input;
  if (!hashRoute.startsWith("/kaigi?") || hashRoute.includes("#")) {
    return null;
  }
  const query = hashRoute.slice("/kaigi?".length);
  return parseExactInviteQuery(new URLSearchParams(query));
};

const parseFullAppUrl = (input: string): KaigiInvite | null => {
  try {
    const url = new URL(input);
    if (
      !["http:", "https:", "iroha-app:", "file:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      !url.hash.startsWith("#/kaigi?")
    ) {
      return null;
    }
    return parseKaigiInviteHashRoute(url.hash);
  } catch {
    return null;
  }
};

export const parseKaigiInviteInput = (input: string): KaigiInvite => {
  const raw = typeof input === "string" ? input : "";
  if (!raw || raw.trim() !== raw) {
    throw new Error(
      "Kaigi invite must be an exact call-and-secret meeting link.",
    );
  }
  const invite =
    parseKaigiInviteDeepLink(raw) ??
    parseKaigiInviteHashRoute(raw) ??
    parseFullAppUrl(raw);
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
): boolean => nowMs > meeting.expiresAtMs;

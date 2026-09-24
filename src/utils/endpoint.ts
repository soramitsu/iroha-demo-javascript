const SUPPORTED_ENDPOINT_PROTOCOLS = new Set(["http:", "https:"]);
export const ENDPOINT_URL_MAX_CHARACTERS = 2_048;
const UNSAFE_ENDPOINT_CHARACTER = /\p{Cc}/u;
const CANONICAL_IPV4_OCTET = "(?:0|[1-9]\\d?|1\\d{2}|2[0-4]\\d|25[0-5])";
const CANONICAL_LOOPBACK_IPV4 = new RegExp(
  `^127\\.${CANONICAL_IPV4_OCTET}\\.${CANONICAL_IPV4_OCTET}\\.${CANONICAL_IPV4_OCTET}$`,
  "u",
);

const normalizeHostname = (hostname: string) =>
  hostname
    .trim()
    .toLowerCase()
    .replace(/^\[/u, "")
    .replace(/\]$/u, "")
    .replace(/\.$/u, "");

export const isLoopbackEndpointUrl = (value: URL): boolean => {
  const hostname = normalizeHostname(value.hostname);
  return (
    value.protocol === "http:" &&
    (hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname === "::1" ||
      /^127(?:\.\d{1,3}){3}$/u.test(hostname))
  );
};

const inputHostnameLiteral = (value: string): string => {
  const schemeSeparator = value.indexOf("://");
  const authority = value
    .slice(schemeSeparator + 3)
    .split(/[/?#]/u, 1)[0]
    ?.split("@")
    .at(-1);
  if (!authority) {
    return "";
  }
  if (authority.startsWith("[")) {
    const closingBracket = authority.indexOf("]");
    return closingBracket < 0
      ? ""
      : authority.slice(0, closingBracket + 1).toLowerCase();
  }
  return (authority.split(":", 1)[0] ?? "").toLowerCase();
};

const isCanonicalLoopbackInputHostname = (value: string): boolean =>
  value === "localhost" ||
  value.endsWith(".localhost") ||
  value === "[::1]" ||
  CANONICAL_LOOPBACK_IPV4.test(value);

export const normalizeEndpointUrl = (value: string): string => {
  if (typeof value !== "string" || value.length > ENDPOINT_URL_MAX_CHARACTERS) {
    throw new Error("Enter a bounded Torii endpoint URL.");
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("Enter a Torii endpoint URL.");
  }
  if (UNSAFE_ENDPOINT_CHARACTER.test(trimmed)) {
    throw new Error("Endpoint URL must not contain control characters.");
  }
  if (trimmed.includes("\\") || trimmed.includes("%")) {
    throw new Error(
      "Endpoint URL must not contain ambiguous escaped path characters.",
    );
  }
  if (trimmed.includes("?") || trimmed.includes("#")) {
    throw new Error("Endpoint URL must not include a query or fragment.");
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch (_error) {
    throw new Error("Enter a valid Torii endpoint URL.");
  }

  if (!SUPPORTED_ENDPOINT_PROTOCOLS.has(parsed.protocol)) {
    throw new Error("Endpoint must start with http:// or https://.");
  }
  if (parsed.username || parsed.password) {
    throw new Error("Endpoint URL must not include credentials.");
  }
  if (parsed.search || parsed.hash) {
    throw new Error("Endpoint URL must not include a query or fragment.");
  }
  if (parsed.hostname.endsWith(".")) {
    throw new Error("Endpoint hostname must not end with a dot.");
  }
  if (parsed.pathname.includes("//") || parsed.pathname.includes("%")) {
    throw new Error("Endpoint URL path must be canonical and unambiguous.");
  }
  if (parsed.protocol === "http:" && !isLoopbackEndpointUrl(parsed)) {
    throw new Error("Remote Torii endpoints must use HTTPS.");
  }
  if (
    parsed.protocol === "http:" &&
    !isCanonicalLoopbackInputHostname(inputHostnameLiteral(trimmed))
  ) {
    throw new Error("Loopback endpoint hostname must use canonical notation.");
  }

  const normalized = parsed.toString().replace(/\/+$/, "");
  if (normalized.length > ENDPOINT_URL_MAX_CHARACTERS) {
    throw new Error("Enter a bounded Torii endpoint URL.");
  }
  return normalized;
};

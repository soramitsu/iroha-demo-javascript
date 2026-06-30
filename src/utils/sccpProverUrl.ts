const isLoopbackHost = (hostname: string): boolean => {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "[::1]" ||
    /^127(?:\.\d{1,3}){3}$/u.test(normalized)
  );
};

const hasUnsafeModuleUrlCharacter = (value: string): boolean => {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x20 || code === 0x7f) {
      return true;
    }
  }
  return false;
};

const hasParentDirectorySegment = (value: string): boolean => {
  let normalized = value.replace(/\\/gu, "/");
  for (let depth = 0; depth < 8; depth += 1) {
    if (/(?:^|\/)\.\.(?:\/|$)/u.test(normalized)) {
      return true;
    }
    let decoded: string;
    try {
      decoded = decodeURIComponent(normalized).replace(/\\/gu, "/");
    } catch (_error) {
      return true;
    }
    if (decoded === normalized) {
      return false;
    }
    normalized = decoded;
  }
  return true;
};

export const normalizeSccpPackageOrRemoteModuleUrl = (
  value?: string | null,
  label = "SCCP prover module URL",
): string | undefined => {
  const moduleUrl = value?.trim();
  if (!moduleUrl) {
    return undefined;
  }
  if (hasUnsafeModuleUrlCharacter(moduleUrl)) {
    throw new Error(
      `${label} must not contain whitespace or control characters.`,
    );
  }
  if (/[?#]/u.test(moduleUrl)) {
    throw new Error(`${label} must not include query strings or fragments.`);
  }
  if (hasParentDirectorySegment(moduleUrl)) {
    throw new Error(`${label} must not include parent directory segments.`);
  }
  if (/^(?:\/(?!\/)|\.{1,2}\/)/u.test(moduleUrl)) {
    return moduleUrl;
  }
  let parsed: URL;
  try {
    parsed = new URL(moduleUrl);
  } catch (_error) {
    throw new Error(
      `${label} must be a relative path, HTTPS URL, or loopback HTTP URL.`,
    );
  }
  if (parsed.username || parsed.password) {
    throw new Error(`${label} must not include credentials.`);
  }
  if (parsed.search || parsed.hash) {
    throw new Error(`${label} must not include query strings or fragments.`);
  }
  if (parsed.protocol === "https:") {
    return parsed.toString();
  }
  if (parsed.protocol === "http:" && isLoopbackHost(parsed.hostname)) {
    return parsed.toString();
  }
  throw new Error(
    `${label} must be a relative path, HTTPS URL, or loopback HTTP URL.`,
  );
};

export const normalizeSccpProverModuleUrl = (
  value?: string | null,
): string | undefined =>
  normalizeSccpPackageOrRemoteModuleUrl(value, "SCCP prover module URL");

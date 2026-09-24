import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";

export const RENDERER_PROTOCOL_SCHEME = "iroha-app";
export const RENDERER_PROTOCOL_HOST = "renderer";
export const RENDERER_PROTOCOL_ORIGIN = `${RENDERER_PROTOCOL_SCHEME}://${RENDERER_PROTOCOL_HOST}`;
export const RENDERER_ASSET_MAX_BYTES = 16 * 1024 * 1024;
export const RENDERER_URL_MAX_LENGTH = 8 * 1024;
export const RENDERER_PROTOCOL_PRIVILEGES = Object.freeze({
  standard: true,
  secure: true,
  supportFetchAPI: true,
  stream: true,
  codeCache: true,
});

export const RENDERER_CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "base-uri 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "media-src 'self' blob:",
  "connect-src 'self' data: wss: ws://localhost:* ws://127.0.0.1:* ws://[::1]:*",
  "worker-src 'self' blob:",
].join("; ");

export const RENDERER_WORKER_CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "base-uri 'none'",
  "object-src 'none'",
  "script-src 'self'",
  "connect-src 'self'",
  "worker-src 'none'",
].join("; ");

const rendererSecurityHeaders = (contentSecurityPolicy: string) =>
  Object.freeze({
    "Content-Security-Policy": contentSecurityPolicy,
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Permissions-Policy":
      "camera=(self), microphone=(self), display-capture=(self), geolocation=(), payment=(), usb=()",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  });

export const RENDERER_SECURITY_HEADERS = rendererSecurityHeaders(
  RENDERER_CONTENT_SECURITY_POLICY,
);

export const RENDERER_WORKER_SECURITY_HEADERS = rendererSecurityHeaders(
  RENDERER_WORKER_CONTENT_SECURITY_POLICY,
);

export const rendererSecurityHeadersForDestination = (destination: string) =>
  destination === "worker" || destination === "sharedworker"
    ? RENDERER_WORKER_SECURITY_HEADERS
    : RENDERER_SECURITY_HEADERS;

const isBoundedExactUrlText = (value: string): boolean =>
  value.length > 0 &&
  value.length <= RENDERER_URL_MAX_LENGTH &&
  value.trim() === value &&
  !Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || codePoint === 0x7f;
  });

export const isSafeExternalNavigationUrl = (candidateUrl: string): boolean => {
  if (!isBoundedExactUrlText(candidateUrl)) {
    return false;
  }
  let candidate: URL;
  try {
    candidate = new URL(candidateUrl);
  } catch {
    return false;
  }
  return (
    candidate.protocol === "https:" &&
    !candidate.username &&
    !candidate.password &&
    Boolean(candidate.hostname)
  );
};

const RENDERER_ASSET_CONTENT_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".ico", "image/x-icon"],
  [".ttf", "font/ttf"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);

const pathIsInsideRoot = (root: string, target: string): boolean => {
  const relativePath = relative(root, target);
  return Boolean(
    relativePath &&
      relativePath !== ".." &&
      !relativePath.startsWith(`..${sep}`) &&
      !isAbsolute(relativePath),
  );
};

const decodeRendererPathname = (pathname: string): string => {
  let decoded = pathname;
  let stable = false;
  for (let depth = 0; depth < 8; depth += 1) {
    let next: string;
    try {
      next = decodeURIComponent(decoded);
    } catch {
      throw new Error("Renderer asset URL contains invalid percent encoding.");
    }
    if (next === decoded) {
      stable = true;
      break;
    }
    decoded = next;
  }
  if (!stable) {
    throw new Error("Renderer asset URL uses excessive percent encoding.");
  }
  if (
    decoded.includes("\0") ||
    decoded.includes("\\") ||
    Array.from(decoded).some((character) => {
      const code = character.charCodeAt(0);
      return code <= 0x1f || code === 0x7f;
    })
  ) {
    throw new Error("Renderer asset URL contains forbidden characters.");
  }
  return decoded;
};

const rawRendererUrlPathname = (requestUrl: string): string => {
  const authorityStart = requestUrl.indexOf("://");
  const pathStart =
    authorityStart >= 0 ? requestUrl.indexOf("/", authorityStart + 3) : -1;
  if (pathStart < 0) {
    return "/";
  }
  const queryStart = requestUrl.indexOf("?", pathStart);
  const fragmentStart = requestUrl.indexOf("#", pathStart);
  const candidates = [queryStart, fragmentStart].filter((index) => index >= 0);
  const pathEnd = candidates.length > 0 ? Math.min(...candidates) : undefined;
  return requestUrl.slice(pathStart, pathEnd);
};

export const resolveRendererProtocolAssetPath = ({
  requestUrl,
  rendererRoot,
}: {
  requestUrl: string;
  rendererRoot: string;
}): string => {
  if (!isBoundedExactUrlText(requestUrl)) {
    throw new Error("Renderer asset URL is invalid.");
  }
  let parsed: URL;
  try {
    parsed = new URL(requestUrl);
  } catch {
    throw new Error("Renderer asset URL is invalid.");
  }
  if (
    parsed.protocol !== `${RENDERER_PROTOCOL_SCHEME}:` ||
    parsed.hostname !== RENDERER_PROTOCOL_HOST ||
    parsed.username ||
    parsed.password ||
    parsed.port
  ) {
    throw new Error("Renderer asset URL has the wrong origin.");
  }
  const rawPathname = decodeRendererPathname(
    rawRendererUrlPathname(requestUrl),
  );
  if (rawPathname.split("/").some((segment) => segment === "..")) {
    throw new Error("Renderer asset URL contains a parent path segment.");
  }
  const decodedPathname = decodeRendererPathname(parsed.pathname);
  const pathname = decodedPathname === "/" ? "/index.html" : decodedPathname;
  if (!pathname.startsWith("/")) {
    throw new Error("Renderer asset URL path must be absolute.");
  }
  const root = resolve(rendererRoot);
  const target = resolve(root, `.${pathname}`);
  if (!pathIsInsideRoot(root, target)) {
    throw new Error("Renderer asset URL escapes the packaged renderer root.");
  }
  return target;
};

export const readRendererProtocolAsset = async ({
  requestUrl,
  rendererRoot,
}: {
  requestUrl: string;
  rendererRoot: string;
}): Promise<{ bytes: Uint8Array; contentType: string; path: string }> => {
  const lexicalRoot = resolve(rendererRoot);
  const lexicalTarget = resolveRendererProtocolAssetPath({
    requestUrl,
    rendererRoot,
  });
  const lexicalMetadata = await lstat(lexicalTarget, { bigint: true });
  if (lexicalMetadata.isSymbolicLink()) {
    throw new Error(
      "Renderer asset URL must not resolve through a target symlink.",
    );
  }
  const [realRoot, realTarget] = await Promise.all([
    realpath(lexicalRoot),
    realpath(lexicalTarget),
  ]);
  const expectedRealTarget = resolve(
    realRoot,
    relative(lexicalRoot, lexicalTarget),
  );
  if (
    !pathIsInsideRoot(realRoot, realTarget) ||
    realTarget !== expectedRealTarget
  ) {
    throw new Error(
      "Renderer asset URL resolves outside the packaged renderer root.",
    );
  }
  const noFollowFlag =
    typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0;
  const handle = await open(realTarget, constants.O_RDONLY | noFollowFlag);
  try {
    const metadataBefore = await handle.stat({ bigint: true });
    if (!metadataBefore.isFile()) {
      throw new Error("Renderer asset URL must resolve to a regular file.");
    }
    if (metadataBefore.size > BigInt(RENDERER_ASSET_MAX_BYTES)) {
      throw new Error(
        `Renderer asset exceeds ${RENDERER_ASSET_MAX_BYTES} bytes.`,
      );
    }
    if (
      lexicalMetadata.dev !== metadataBefore.dev ||
      lexicalMetadata.ino !== metadataBefore.ino ||
      lexicalMetadata.mode !== metadataBefore.mode ||
      lexicalMetadata.nlink !== metadataBefore.nlink ||
      lexicalMetadata.size !== metadataBefore.size ||
      lexicalMetadata.mtimeNs !== metadataBefore.mtimeNs ||
      lexicalMetadata.ctimeNs !== metadataBefore.ctimeNs
    ) {
      throw new Error("Renderer asset changed before it could be opened.");
    }
    const expectedSize = Number(metadataBefore.size);
    const bytes = Buffer.alloc(expectedSize);
    let offset = 0;
    while (offset < expectedSize) {
      const { bytesRead } = await handle.read(
        bytes,
        offset,
        expectedSize - offset,
        offset,
      );
      if (bytesRead === 0) {
        throw new Error("Renderer asset changed while it was being read.");
      }
      offset += bytesRead;
    }
    const growthProbe = Buffer.alloc(1);
    const { bytesRead: growthBytesRead } = await handle.read(
      growthProbe,
      0,
      1,
      expectedSize,
    );
    if (growthBytesRead !== 0) {
      throw new Error("Renderer asset changed while it was being read.");
    }
    const metadataAfter = await handle.stat({ bigint: true });
    if (
      metadataBefore.dev !== metadataAfter.dev ||
      metadataBefore.ino !== metadataAfter.ino ||
      metadataBefore.mode !== metadataAfter.mode ||
      metadataBefore.nlink !== metadataAfter.nlink ||
      metadataBefore.size !== metadataAfter.size ||
      metadataBefore.mtimeNs !== metadataAfter.mtimeNs ||
      metadataBefore.ctimeNs !== metadataAfter.ctimeNs ||
      BigInt(offset) !== metadataAfter.size
    ) {
      throw new Error("Renderer asset changed while it was being read.");
    }
    return {
      bytes: new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength),
      contentType:
        RENDERER_ASSET_CONTENT_TYPES.get(extname(realTarget).toLowerCase()) ??
        "application/octet-stream",
      path: realTarget,
    };
  } finally {
    await handle.close();
  }
};

const LOOPBACK_RENDERER_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "[::1]",
  "::1",
]);

export const resolveRendererEntryUrl = ({
  isPackaged,
  environmentUrl,
}: {
  isPackaged: boolean;
  environmentUrl?: string;
}): string => {
  if (isPackaged || environmentUrl === undefined || environmentUrl === "") {
    return `${RENDERER_PROTOCOL_ORIGIN}/index.html`;
  }
  if (!isBoundedExactUrlText(environmentUrl)) {
    throw new Error("Electron renderer development URL is invalid.");
  }
  let parsed: URL;
  try {
    parsed = new URL(environmentUrl);
  } catch {
    throw new Error("Electron renderer development URL is invalid.");
  }
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    !LOOPBACK_RENDERER_HOSTS.has(parsed.hostname.toLowerCase()) ||
    parsed.username ||
    parsed.password
  ) {
    throw new Error(
      "Electron renderer development URL must use an uncredentialed loopback HTTP(S) origin.",
    );
  }
  return parsed.toString();
};

export const isTrustedRendererNavigationUrl = (
  candidateUrl: string,
  trustedEntryUrl: string,
): boolean => {
  if (
    !isBoundedExactUrlText(candidateUrl) ||
    !isBoundedExactUrlText(trustedEntryUrl)
  ) {
    return false;
  }
  let candidate: URL;
  let trusted: URL;
  try {
    candidate = new URL(candidateUrl);
    trusted = new URL(trustedEntryUrl);
  } catch {
    return false;
  }

  return (
    !candidate.username &&
    !candidate.password &&
    !trusted.username &&
    !trusted.password &&
    candidate.protocol === trusted.protocol &&
    candidate.hostname.toLowerCase() === trusted.hostname.toLowerCase() &&
    candidate.port === trusted.port &&
    candidate.pathname === trusted.pathname &&
    candidate.search === trusted.search
  );
};

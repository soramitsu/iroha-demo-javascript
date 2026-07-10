import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";

export const RENDERER_PROTOCOL_SCHEME = "iroha-app";
export const RENDERER_PROTOCOL_HOST = "renderer";
export const RENDERER_PROTOCOL_ORIGIN = `${RENDERER_PROTOCOL_SCHEME}://${RENDERER_PROTOCOL_HOST}`;
export const RENDERER_PROTOCOL_PRIVILEGES = Object.freeze({
  standard: true,
  secure: true,
  supportFetchAPI: true,
  stream: true,
  codeCache: true,
});

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
  const lexicalMetadata = await lstat(lexicalTarget);
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
    const bytes = await handle.readFile();
    const metadataAfter = await handle.stat({ bigint: true });
    if (
      metadataBefore.dev !== metadataAfter.dev ||
      metadataBefore.ino !== metadataAfter.ino ||
      metadataBefore.mode !== metadataAfter.mode ||
      metadataBefore.nlink !== metadataAfter.nlink ||
      metadataBefore.size !== metadataAfter.size ||
      metadataBefore.mtimeNs !== metadataAfter.mtimeNs ||
      metadataBefore.ctimeNs !== metadataAfter.ctimeNs ||
      BigInt(bytes.byteLength) !== metadataAfter.size
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
  if (isPackaged || !environmentUrl?.trim()) {
    return `${RENDERER_PROTOCOL_ORIGIN}/index.html`;
  }
  let parsed: URL;
  try {
    parsed = new URL(environmentUrl.trim());
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

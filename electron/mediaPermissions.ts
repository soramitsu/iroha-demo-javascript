import type { Session } from "electron";

type MediaPermissionDetails = {
  isMainFrame?: boolean;
  mediaType?: "video" | "audio" | "unknown";
  mediaTypes?: Array<"video" | "audio">;
  requestingUrl?: string;
  securityOrigin?: string;
};

type MediaPermissionInput = {
  permission: string;
  details?: MediaPermissionDetails;
  requestingOrigin?: string;
  rendererUrl?: string;
};

const isAllowedMediaType = (value: string | undefined): boolean =>
  value === undefined || value === "video" || value === "audio";

const isTrustedAppUrl = (value: string | undefined, rendererUrl?: string) => {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return false;
  }
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === "file:") {
      return true;
    }
    if (!rendererUrl) {
      return false;
    }
    return parsed.origin === new URL(rendererUrl).origin;
  } catch (_error) {
    return false;
  }
};

export const shouldGrantMediaPermission = ({
  permission,
  details,
  requestingOrigin,
  rendererUrl,
}: MediaPermissionInput): boolean => {
  if (permission !== "media") {
    return false;
  }
  if (details?.isMainFrame === false) {
    return false;
  }
  if (!isAllowedMediaType(details?.mediaType)) {
    return false;
  }
  if (
    details?.mediaTypes &&
    !details.mediaTypes.every((mediaType) => isAllowedMediaType(mediaType))
  ) {
    return false;
  }
  return [
    details?.securityOrigin,
    details?.requestingUrl,
    requestingOrigin,
  ].some((candidate) => isTrustedAppUrl(candidate, rendererUrl));
};

export const registerMediaPermissionHandlers = (
  electronSession: Pick<
    Session,
    "setPermissionRequestHandler" | "setPermissionCheckHandler"
  >,
  getRendererUrl: () => string | undefined = () =>
    process.env["ELECTRON_RENDERER_URL"],
) => {
  electronSession.setPermissionRequestHandler(
    (_webContents, permission, callback, details) => {
      callback(
        shouldGrantMediaPermission({
          permission,
          details,
          rendererUrl: getRendererUrl(),
        }),
      );
    },
  );
  electronSession.setPermissionCheckHandler(
    (_webContents, permission, requestingOrigin, details) =>
      shouldGrantMediaPermission({
        permission,
        requestingOrigin,
        details,
        rendererUrl: getRendererUrl(),
      }),
  );
};

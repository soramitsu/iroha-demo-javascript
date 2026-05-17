import type { Session, Streams } from "electron";

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

type SystemMediaAccessKind = "camera" | "microphone";

type RequestSystemMediaAccess = (
  kind: SystemMediaAccessKind,
) => Promise<boolean>;

type DisplayMediaRequest = {
  frame?: {
    url?: string;
  } | null;
  securityOrigin?: string;
  requestingUrl?: string;
};

type DisplayMediaRequestHandlerSession = Pick<
  Session,
  "setDisplayMediaRequestHandler"
>;
type DisplayMediaSource = NonNullable<Streams["video"]>;

const isAllowedMediaType = (value: string | undefined): boolean =>
  value === undefined || value === "video" || value === "audio";

const unique = <T>(values: T[]) => [...new Set(values)];

export const getSystemMediaAccessKinds = (
  details?: MediaPermissionDetails,
): SystemMediaAccessKind[] => {
  const mediaTypes = details?.mediaTypes?.length
    ? details.mediaTypes
    : details?.mediaType
      ? [details.mediaType]
      : ["video", "audio"];
  return unique(
    mediaTypes.flatMap((mediaType) => {
      if (mediaType === "video") {
        return ["camera" as const];
      }
      if (mediaType === "audio") {
        return ["microphone" as const];
      }
      return [];
    }),
  );
};

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
  const isMediaPermission = permission === "media";
  const isDisplayCapturePermission = permission === "display-capture";
  if (!isMediaPermission && !isDisplayCapturePermission) {
    return false;
  }
  if (details?.isMainFrame === false) {
    return false;
  }
  if (isMediaPermission && !isAllowedMediaType(details?.mediaType)) {
    return false;
  }
  if (
    isMediaPermission &&
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

export const shouldGrantDisplayCaptureRequest = (
  request: DisplayMediaRequest,
  rendererUrl?: string,
): boolean =>
  [request.frame?.url, request.securityOrigin, request.requestingUrl].some(
    (candidate) => isTrustedAppUrl(candidate, rendererUrl),
  );

export const resolveSystemMediaPermission = async (
  permission: string,
  details?: MediaPermissionDetails,
  requestSystemMediaAccess?: RequestSystemMediaAccess,
): Promise<boolean> => {
  if (permission !== "media" || !requestSystemMediaAccess) {
    return true;
  }
  const accessKinds = getSystemMediaAccessKinds(details);
  if (!accessKinds.length) {
    return false;
  }
  const grants = await Promise.all(
    accessKinds.map((kind) =>
      requestSystemMediaAccess(kind).catch(() => false),
    ),
  );
  return grants.every(Boolean);
};

export const registerMediaPermissionHandlers = (
  electronSession: Pick<
    Session,
    "setPermissionRequestHandler" | "setPermissionCheckHandler"
  >,
  getRendererUrl: () => string | undefined = () =>
    process.env["ELECTRON_RENDERER_URL"],
  requestSystemMediaAccess?: RequestSystemMediaAccess,
) => {
  electronSession.setPermissionRequestHandler(
    (_webContents, permission, callback, details) => {
      const rendererPermissionGranted = shouldGrantMediaPermission({
        permission,
        details,
        rendererUrl: getRendererUrl(),
      });
      if (!rendererPermissionGranted) {
        callback(false);
        return;
      }
      void resolveSystemMediaPermission(
        permission,
        details,
        requestSystemMediaAccess,
      ).then(callback, () => callback(false));
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

export const registerDisplayMediaRequestHandler = (
  electronSession: DisplayMediaRequestHandlerSession,
  getSources: () => Promise<DisplayMediaSource[]>,
  getRendererUrl: () => string | undefined = () =>
    process.env["ELECTRON_RENDERER_URL"],
) => {
  electronSession.setDisplayMediaRequestHandler(
    (request, callback) => {
      if (!shouldGrantDisplayCaptureRequest(request, getRendererUrl())) {
        callback({});
        return;
      }
      void getSources()
        .then((sources) => {
          callback(sources[0] ? { video: sources[0] } : {});
        })
        .catch(() => {
          callback({});
        });
    },
    { useSystemPicker: true },
  );
};

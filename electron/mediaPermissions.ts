import type { Session, Streams } from "electron";
import { isTrustedRendererNavigationUrl } from "./rendererProtocol";

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
type SystemMediaAccessStatus =
  | "not-determined"
  | "granted"
  | "denied"
  | "restricted"
  | "unknown";
type GetSystemMediaAccessStatus = (
  kind: SystemMediaAccessKind,
) => SystemMediaAccessStatus;

type DisplayMediaRequest = {
  frame?: {
    url?: string;
  } | null;
  securityOrigin?: string;
  videoRequested?: boolean;
  audioRequested?: boolean;
  userGesture?: boolean;
};

type DisplayMediaRequestHandlerSession = Pick<
  Session,
  "setDisplayMediaRequestHandler"
>;
type DisplayMediaSource = NonNullable<Streams["video"]>;

type TrustedPermissionOwner = {
  getURL(): string;
  isDestroyed(): boolean;
};

type MediaPermissionHandlerOptions = {
  getRendererUrl(): string | undefined;
  getTrustedWebContents(): TrustedPermissionOwner | null;
  requestSystemMediaAccess?: RequestSystemMediaAccess;
  getSystemMediaAccessStatus?: GetSystemMediaAccessStatus;
};

type DisplayMediaRequestHandlerOptions = {
  getSources(): Promise<DisplayMediaSource[]>;
  getRendererUrl(): string | undefined;
  getTrustedMainFrame(): object | null;
};

const isAllowedMediaType = (value: string): boolean =>
  value === "video" || value === "audio";

const unique = <T>(values: T[]) => [...new Set(values)];

export const getSystemMediaAccessKinds = (
  details?: MediaPermissionDetails,
): SystemMediaAccessKind[] => {
  const mediaTypes =
    details?.mediaTypes ?? (details?.mediaType ? [details.mediaType] : []);
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

const isTrustedAppOrigin = (
  value: string | undefined,
  rendererUrl?: string,
): boolean => {
  if (
    typeof value !== "string" ||
    !value ||
    value.trim() !== value ||
    typeof rendererUrl !== "string" ||
    !rendererUrl
  ) {
    return false;
  }
  try {
    const parsed = new URL(value);
    const trusted = new URL(rendererUrl);
    const trustedOrigin = `${trusted.protocol}//${trusted.host}`;
    return (
      !parsed.username &&
      !parsed.password &&
      !trusted.username &&
      !trusted.password &&
      parsed.protocol === trusted.protocol &&
      parsed.hostname === trusted.hostname &&
      parsed.port === trusted.port &&
      value === trustedOrigin
    );
  } catch {
    return false;
  }
};

const hasExactMediaTypeRequest = (details: MediaPermissionDetails): boolean => {
  if (details.mediaTypes !== undefined) {
    return (
      Array.isArray(details.mediaTypes) &&
      details.mediaType === undefined &&
      details.mediaTypes.length > 0 &&
      details.mediaTypes.length <= 2 &&
      new Set(details.mediaTypes).size === details.mediaTypes.length &&
      details.mediaTypes.every(isAllowedMediaType)
    );
  }
  return (
    details.mediaType !== undefined && isAllowedMediaType(details.mediaType)
  );
};

const hasTrustedPermissionProvenance = (
  details: MediaPermissionDetails,
  requestingOrigin: string | undefined,
  rendererUrl?: string,
): boolean => {
  if (
    typeof details.requestingUrl !== "string" ||
    typeof rendererUrl !== "string" ||
    !isTrustedRendererNavigationUrl(details.requestingUrl, rendererUrl)
  ) {
    return false;
  }
  const suppliedOrigins = [details.securityOrigin, requestingOrigin].filter(
    (value) => value !== undefined,
  );
  return suppliedOrigins.every(
    (candidate) =>
      typeof candidate === "string" &&
      isTrustedAppOrigin(candidate, rendererUrl),
  );
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
  if (!details || details.isMainFrame !== true) {
    return false;
  }
  if (isMediaPermission && !hasExactMediaTypeRequest(details)) {
    return false;
  }
  return hasTrustedPermissionProvenance(details, requestingOrigin, rendererUrl);
};

export const shouldGrantDisplayCaptureRequest = (
  request: DisplayMediaRequest,
  rendererUrl?: string,
  trustedMainFrame?: object | null,
): boolean => {
  try {
    if (
      !request.frame ||
      request.frame !== trustedMainFrame ||
      request.videoRequested !== true ||
      request.audioRequested !== false ||
      request.userGesture !== true ||
      !isTrustedRendererNavigationUrl(
        request.frame.url ?? "",
        rendererUrl ?? "",
      ) ||
      !isTrustedAppOrigin(request.securityOrigin, rendererUrl)
    ) {
      return false;
    }
  } catch {
    return false;
  }
  return true;
};

const isTrustedPermissionOwner = (
  candidate: unknown,
  trusted: TrustedPermissionOwner | null,
  rendererUrl: string | undefined,
): candidate is TrustedPermissionOwner => {
  if (!candidate || candidate !== trusted || !trusted) {
    return false;
  }
  try {
    return (
      !trusted.isDestroyed() &&
      isTrustedRendererNavigationUrl(trusted.getURL(), rendererUrl ?? "")
    );
  } catch {
    return false;
  }
};

export const resolveSystemMediaPermission = async (
  permission: string,
  details?: MediaPermissionDetails,
  requestSystemMediaAccess?: RequestSystemMediaAccess,
  getSystemMediaAccessStatus?: GetSystemMediaAccessStatus,
): Promise<boolean> => {
  if (permission !== "media" || !requestSystemMediaAccess) {
    return true;
  }
  const accessKinds = getSystemMediaAccessKinds(details);
  if (!accessKinds.length) {
    return false;
  }
  for (const kind of accessKinds) {
    const currentStatus = getSystemMediaAccessStatus?.(kind);
    if (currentStatus === "granted") {
      continue;
    }
    if (currentStatus === "denied" || currentStatus === "restricted") {
      return false;
    }
    const granted = await requestSystemMediaAccess(kind).catch(() => false);
    if (!granted) {
      return false;
    }
  }
  return true;
};

const shouldReportSystemMediaPermissionGranted = (
  permission: string,
  details?: MediaPermissionDetails,
  getSystemMediaAccessStatus?: GetSystemMediaAccessStatus,
): boolean => {
  if (permission !== "media" || !getSystemMediaAccessStatus) {
    return true;
  }
  const accessKinds = getSystemMediaAccessKinds(details);
  return (
    accessKinds.length > 0 &&
    accessKinds.every((kind) => getSystemMediaAccessStatus(kind) === "granted")
  );
};

export const registerMediaPermissionHandlers = (
  electronSession: Pick<
    Session,
    "setPermissionRequestHandler" | "setPermissionCheckHandler"
  >,
  options: MediaPermissionHandlerOptions,
) => {
  electronSession.setPermissionRequestHandler(
    (webContents, permission, callback, details) => {
      const rendererUrl = options.getRendererUrl();
      const rendererPermissionGranted = shouldGrantMediaPermission({
        permission,
        details,
        rendererUrl,
      });
      if (
        !rendererPermissionGranted ||
        !isTrustedPermissionOwner(
          webContents,
          options.getTrustedWebContents(),
          rendererUrl,
        )
      ) {
        callback(false);
        return;
      }
      void resolveSystemMediaPermission(
        permission,
        details,
        options.requestSystemMediaAccess,
        options.getSystemMediaAccessStatus,
      ).then(
        (systemPermissionGranted) => {
          callback(
            systemPermissionGranted &&
              isTrustedPermissionOwner(
                webContents,
                options.getTrustedWebContents(),
                options.getRendererUrl(),
              ),
          );
        },
        () => callback(false),
      );
    },
  );
  electronSession.setPermissionCheckHandler(
    (webContents, permission, requestingOrigin, details) => {
      const rendererUrl = options.getRendererUrl();
      const rendererPermissionGranted = shouldGrantMediaPermission({
        permission,
        requestingOrigin,
        details,
        rendererUrl,
      });
      return (
        rendererPermissionGranted &&
        isTrustedPermissionOwner(
          webContents,
          options.getTrustedWebContents(),
          rendererUrl,
        ) &&
        shouldReportSystemMediaPermissionGranted(
          permission,
          details,
          options.getSystemMediaAccessStatus,
        )
      );
    },
  );
};

export const registerDisplayMediaRequestHandler = (
  electronSession: DisplayMediaRequestHandlerSession,
  options: DisplayMediaRequestHandlerOptions,
) => {
  electronSession.setDisplayMediaRequestHandler(
    (request, callback) => {
      if (
        !shouldGrantDisplayCaptureRequest(
          request,
          options.getRendererUrl(),
          options.getTrustedMainFrame(),
        )
      ) {
        callback({});
        return;
      }
      void options
        .getSources()
        .then((sources) => {
          const stillTrusted = shouldGrantDisplayCaptureRequest(
            request,
            options.getRendererUrl(),
            options.getTrustedMainFrame(),
          );
          callback(stillTrusted && sources[0] ? { video: sources[0] } : {});
        })
        .catch(() => {
          callback({});
        });
    },
    { useSystemPicker: true },
  );
};

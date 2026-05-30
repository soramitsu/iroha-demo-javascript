import { describe, expect, it, vi } from "vitest";
import {
  getSystemMediaAccessKinds,
  registerDisplayMediaRequestHandler,
  registerMediaPermissionHandlers,
  resolveSystemMediaPermission,
  shouldGrantDisplayCaptureRequest,
  shouldGrantMediaPermission,
} from "../electron/mediaPermissions";

type TestMediaAccessStatus =
  | "not-determined"
  | "granted"
  | "denied"
  | "restricted"
  | "unknown";

describe("Electron media permissions", () => {
  it("grants camera and microphone to the app renderer only", () => {
    expect(
      shouldGrantMediaPermission({
        permission: "media",
        rendererUrl: "http://localhost:5173",
        details: {
          isMainFrame: true,
          mediaTypes: ["video", "audio"],
          requestingUrl: "http://localhost:5173/#/send",
        },
      }),
    ).toBe(true);

    expect(
      shouldGrantMediaPermission({
        permission: "media",
        rendererUrl: "http://localhost:5173",
        details: {
          isMainFrame: true,
          mediaTypes: ["video"],
          requestingUrl: "https://example.invalid",
        },
      }),
    ).toBe(false);
  });

  it("allows packaged file renderer media checks", () => {
    expect(
      shouldGrantMediaPermission({
        permission: "media",
        details: {
          isMainFrame: true,
          mediaType: "audio",
          securityOrigin: "file:///Applications/Sora.app/index.html",
        },
      }),
    ).toBe(true);
  });

  it("grants display capture to the app renderer only", () => {
    expect(
      shouldGrantMediaPermission({
        permission: "display-capture",
        rendererUrl: "http://localhost:5173",
        details: {
          isMainFrame: true,
          requestingUrl: "http://localhost:5173/#/wallet",
        },
      }),
    ).toBe(true);

    expect(
      shouldGrantMediaPermission({
        permission: "display-capture",
        rendererUrl: "http://localhost:5173",
        details: {
          isMainFrame: true,
          requestingUrl: "https://example.invalid",
        },
      }),
    ).toBe(false);
  });

  it("checks display capture requests against the trusted app URL", () => {
    expect(
      shouldGrantDisplayCaptureRequest(
        {
          frame: {
            url: "http://localhost:5173/#/wallet",
          },
        },
        "http://localhost:5173",
      ),
    ).toBe(true);

    expect(
      shouldGrantDisplayCaptureRequest(
        {
          frame: {
            url: "https://example.invalid",
          },
        },
        "http://localhost:5173",
      ),
    ).toBe(false);
  });

  it("registers matching request and check handlers", async () => {
    const setPermissionRequestHandler = vi.fn();
    const setPermissionCheckHandler = vi.fn();

    registerMediaPermissionHandlers(
      {
        setPermissionRequestHandler,
        setPermissionCheckHandler,
      },
      () => "http://localhost:5173",
    );

    const requestHandler = setPermissionRequestHandler.mock.calls[0]?.[0];
    const checkHandler = setPermissionCheckHandler.mock.calls[0]?.[0];
    const callback = vi.fn();
    requestHandler(null, "media", callback, {
      isMainFrame: true,
      mediaTypes: ["video"],
      requestingUrl: "http://localhost:5173/#/kaigi",
    });

    await vi.waitFor(() => expect(callback).toHaveBeenCalledWith(true));
    expect(
      checkHandler(null, "media", "http://localhost:5173", {
        isMainFrame: true,
        mediaType: "video",
      }),
    ).toBe(true);
  });

  it("maps renderer media details to macOS media access kinds", () => {
    expect(
      getSystemMediaAccessKinds({
        mediaTypes: ["video", "audio"],
      }),
    ).toEqual(["camera", "microphone"]);
    expect(getSystemMediaAccessKinds({ mediaType: "video" })).toEqual([
      "camera",
    ]);
    expect(getSystemMediaAccessKinds({ mediaType: "audio" })).toEqual([
      "microphone",
    ]);
    expect(getSystemMediaAccessKinds({ mediaType: "unknown" })).toEqual([]);
  });

  it("requires every requested macOS media permission before granting media", async () => {
    const requestSystemMediaAccess = vi.fn(async (kind: string) =>
      kind === "microphone" ? false : true,
    );

    await expect(
      resolveSystemMediaPermission(
        "media",
        { mediaTypes: ["video", "audio"] },
        requestSystemMediaAccess,
      ),
    ).resolves.toBe(false);
    expect(requestSystemMediaAccess).toHaveBeenCalledWith("camera");
    expect(requestSystemMediaAccess).toHaveBeenCalledWith("microphone");
  });

  it("requests macOS media permissions sequentially when not determined", async () => {
    const order: string[] = [];
    const requestSystemMediaAccess = vi.fn(async (kind: string) => {
      order.push(`request:${kind}`);
      return true;
    });
    const getSystemMediaAccessStatus = vi.fn(
      (kind: string): TestMediaAccessStatus => {
        order.push(`status:${kind}`);
        return "not-determined";
      },
    );

    await expect(
      resolveSystemMediaPermission(
        "media",
        { mediaTypes: ["video", "audio"] },
        requestSystemMediaAccess,
        getSystemMediaAccessStatus,
      ),
    ).resolves.toBe(true);

    expect(order).toEqual([
      "status:camera",
      "request:camera",
      "status:microphone",
      "request:microphone",
    ]);
  });

  it("does not request a macOS prompt when media is already denied", async () => {
    const requestSystemMediaAccess = vi.fn(async () => true);
    const getSystemMediaAccessStatus = vi.fn(() => "denied" as const);

    await expect(
      resolveSystemMediaPermission(
        "media",
        { mediaTypes: ["video"] },
        requestSystemMediaAccess,
        getSystemMediaAccessStatus,
      ),
    ).resolves.toBe(false);

    expect(requestSystemMediaAccess).not.toHaveBeenCalled();
  });

  it("uses the macOS media permission result in the request handler", async () => {
    const setPermissionRequestHandler = vi.fn();
    const setPermissionCheckHandler = vi.fn();
    const requestSystemMediaAccess = vi.fn(async () => true);

    registerMediaPermissionHandlers(
      {
        setPermissionRequestHandler,
        setPermissionCheckHandler,
      },
      () => "http://localhost:5173",
      requestSystemMediaAccess,
    );

    const requestHandler = setPermissionRequestHandler.mock.calls[0]?.[0];
    const callback = vi.fn();
    requestHandler(null, "media", callback, {
      isMainFrame: true,
      mediaTypes: ["video"],
      requestingUrl: "http://localhost:5173/#/kaigi",
    });
    await vi.waitFor(() => expect(callback).toHaveBeenCalledWith(true));
    expect(requestSystemMediaAccess).toHaveBeenCalledWith("camera");
  });

  it("does not report macOS media as already granted before system consent", () => {
    const setPermissionRequestHandler = vi.fn();
    const setPermissionCheckHandler = vi.fn();
    const requestSystemMediaAccess = vi.fn(async () => true);
    let mediaAccessStatus: TestMediaAccessStatus = "not-determined";
    const getSystemMediaAccessStatus = vi.fn(() => mediaAccessStatus);

    registerMediaPermissionHandlers(
      {
        setPermissionRequestHandler,
        setPermissionCheckHandler,
      },
      () => "http://localhost:5173",
      requestSystemMediaAccess,
      getSystemMediaAccessStatus,
    );

    const checkHandler = setPermissionCheckHandler.mock.calls[0]?.[0];
    expect(
      checkHandler(null, "media", "http://localhost:5173", {
        isMainFrame: true,
        mediaType: "video",
      }),
    ).toBe(false);

    mediaAccessStatus = "granted";
    expect(
      checkHandler(null, "media", "http://localhost:5173", {
        isMainFrame: true,
        mediaType: "video",
      }),
    ).toBe(true);
  });

  it("denies renderer media when macOS media permission is denied", async () => {
    const setPermissionRequestHandler = vi.fn();
    const setPermissionCheckHandler = vi.fn();
    const requestSystemMediaAccess = vi.fn(async () => false);

    registerMediaPermissionHandlers(
      {
        setPermissionRequestHandler,
        setPermissionCheckHandler,
      },
      () => "http://localhost:5173",
      requestSystemMediaAccess,
    );

    const requestHandler = setPermissionRequestHandler.mock.calls[0]?.[0];
    const callback = vi.fn();
    requestHandler(null, "media", callback, {
      isMainFrame: true,
      mediaTypes: ["video"],
      requestingUrl: "http://localhost:5173/#/kaigi",
    });

    await vi.waitFor(() => expect(callback).toHaveBeenCalledWith(false));
  });

  it("registers a display media handler with system picker fallback", async () => {
    const setDisplayMediaRequestHandler = vi.fn();
    const screenSource = { id: "screen:1:0", name: "Entire Screen" };
    const getSources = vi.fn(async () => [screenSource]);

    registerDisplayMediaRequestHandler(
      { setDisplayMediaRequestHandler },
      getSources,
      () => "http://localhost:5173",
    );

    const handler = setDisplayMediaRequestHandler.mock.calls[0]?.[0];
    const options = setDisplayMediaRequestHandler.mock.calls[0]?.[1];
    const callback = vi.fn();
    await handler(
      {
        frame: {
          url: "http://localhost:5173/#/wallet",
        },
      },
      callback,
    );

    expect(options).toEqual({ useSystemPicker: true });
    expect(callback).toHaveBeenCalledWith({ video: screenSource });

    const deniedCallback = vi.fn();
    await handler(
      {
        frame: {
          url: "https://example.invalid",
        },
      },
      deniedCallback,
    );
    expect(deniedCallback).toHaveBeenCalledWith({});
  });
});

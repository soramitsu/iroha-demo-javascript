import { describe, expect, it, vi } from "vitest";
import {
  registerDisplayMediaRequestHandler,
  registerMediaPermissionHandlers,
  shouldGrantDisplayCaptureRequest,
  shouldGrantMediaPermission,
} from "../electron/mediaPermissions";

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

  it("registers matching request and check handlers", () => {
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

    expect(callback).toHaveBeenCalledWith(true);
    expect(
      checkHandler(null, "media", "http://localhost:5173", {
        isMainFrame: true,
        mediaType: "video",
      }),
    ).toBe(true);
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

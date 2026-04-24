import { describe, expect, it, vi } from "vitest";
import {
  registerMediaPermissionHandlers,
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
});

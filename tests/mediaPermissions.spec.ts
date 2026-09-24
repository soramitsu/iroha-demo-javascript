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

const liveWebContents = (url = "http://localhost:5173/#/kaigi") => ({
  getURL: () => url,
  isDestroyed: () => false,
});

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

  it("allows only the exact packaged renderer origin", () => {
    expect(new URL("iroha-app://renderer/kaigi").origin).toBe("null");
    expect(
      shouldGrantMediaPermission({
        permission: "media",
        rendererUrl: "iroha-app://renderer/index.html",
        details: {
          isMainFrame: true,
          mediaType: "audio",
          securityOrigin: "iroha-app://renderer",
          requestingUrl: "iroha-app://renderer/index.html#/kaigi",
        },
      }),
    ).toBe(true);
    for (const securityOrigin of [
      "file:///Applications/Sora.app/index.html",
      "iroha-app://attacker/kaigi",
      "iroha-app://renderer:443/kaigi",
      "https://renderer.invalid/kaigi",
    ]) {
      expect(
        shouldGrantMediaPermission({
          permission: "media",
          rendererUrl: "iroha-app://renderer/index.html",
          details: {
            isMainFrame: true,
            mediaType: "audio",
            securityOrigin,
            requestingUrl: "iroha-app://renderer/index.html#/kaigi",
          },
        }),
      ).toBe(false);
    }
  });

  it("denies conflicting permission provenance instead of accepting one favorable origin", () => {
    expect(
      shouldGrantMediaPermission({
        permission: "media",
        rendererUrl: "iroha-app://renderer/index.html",
        requestingOrigin: "iroha-app://renderer",
        details: {
          isMainFrame: true,
          mediaType: "audio",
          securityOrigin: "iroha-app://renderer",
          requestingUrl: "https://attacker.invalid/iframe",
        },
      }),
    ).toBe(false);
    expect(
      shouldGrantDisplayCaptureRequest(
        {
          frame: { url: "iroha-app://renderer/index.html#/wallet" },
          securityOrigin: "https://attacker.invalid",
          videoRequested: true,
          audioRequested: false,
          userGesture: true,
        },
        "iroha-app://renderer/index.html",
        null,
      ),
    ).toBe(false);
  });

  it("requires exact development scheme, host, and port without credentials", () => {
    for (const requestingUrl of [
      "http://localhost:5174/#/kaigi",
      "https://localhost:5173/#/kaigi",
      "http://user:secret@localhost:5173/#/kaigi",
      "http://localhost.attacker.invalid:5173/#/kaigi",
    ]) {
      expect(
        shouldGrantMediaPermission({
          permission: "media",
          rendererUrl: "http://localhost:5173",
          details: {
            isMainFrame: true,
            mediaType: "video",
            requestingUrl,
          },
        }),
      ).toBe(false);
    }
    expect(
      shouldGrantMediaPermission({
        permission: "media",
        rendererUrl: "http://user:secret@localhost:5173",
        details: {
          isMainFrame: true,
          mediaType: "video",
          requestingUrl: "http://localhost:5173/#/kaigi",
        },
      }),
    ).toBe(false);
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
    const trustedFrame = {
      url: "http://localhost:5173/#/wallet",
    };
    expect(
      shouldGrantDisplayCaptureRequest(
        {
          frame: trustedFrame,
          securityOrigin: "http://localhost:5173",
          videoRequested: true,
          audioRequested: false,
          userGesture: true,
        },
        "http://localhost:5173",
        trustedFrame,
      ),
    ).toBe(true);

    expect(
      shouldGrantDisplayCaptureRequest(
        {
          frame: {
            url: "https://example.invalid",
          },
          securityOrigin: "https://example.invalid",
          videoRequested: true,
          audioRequested: false,
          userGesture: true,
        },
        "http://localhost:5173",
        trustedFrame,
      ),
    ).toBe(false);
  });

  it("registers matching request and check handlers", async () => {
    const setPermissionRequestHandler = vi.fn();
    const setPermissionCheckHandler = vi.fn();
    const owner = liveWebContents();

    registerMediaPermissionHandlers(
      {
        setPermissionRequestHandler,
        setPermissionCheckHandler,
      },
      {
        getRendererUrl: () => "http://localhost:5173",
        getTrustedWebContents: () => owner,
      },
    );

    const requestHandler = setPermissionRequestHandler.mock.calls[0]?.[0];
    const checkHandler = setPermissionCheckHandler.mock.calls[0]?.[0];
    const callback = vi.fn();
    requestHandler(owner, "media", callback, {
      isMainFrame: true,
      mediaTypes: ["video"],
      requestingUrl: "http://localhost:5173/#/kaigi",
    });

    await vi.waitFor(() => expect(callback).toHaveBeenCalledWith(true));
    expect(
      checkHandler(owner, "media", "http://localhost:5173", {
        isMainFrame: true,
        mediaType: "video",
        requestingUrl: "http://localhost:5173/#/kaigi",
      }),
    ).toBe(true);
  });

  it("denies absent or ambiguous media request details", () => {
    const base = {
      permission: "media",
      rendererUrl: "http://localhost:5173",
    } as const;
    expect(
      shouldGrantMediaPermission({
        ...base,
        details: {
          isMainFrame: true,
          requestingUrl: "http://localhost:5173/#/kaigi",
        },
      }),
    ).toBe(false);
    expect(
      shouldGrantMediaPermission({
        ...base,
        details: {
          isMainFrame: true,
          mediaTypes: ["video", "video"],
          requestingUrl: "http://localhost:5173/#/kaigi",
        },
      }),
    ).toBe(false);
    expect(
      shouldGrantMediaPermission({
        ...base,
        details: {
          isMainFrame: false,
          mediaTypes: ["video"],
          requestingUrl: "http://localhost:5173/#/kaigi",
        },
      }),
    ).toBe(false);
  });

  it("binds permission handlers to the active trusted WebContents", async () => {
    const setPermissionRequestHandler = vi.fn();
    const setPermissionCheckHandler = vi.fn();
    const owner = liveWebContents();
    const foreignOwner = liveWebContents();

    registerMediaPermissionHandlers(
      { setPermissionRequestHandler, setPermissionCheckHandler },
      {
        getRendererUrl: () => "http://localhost:5173",
        getTrustedWebContents: () => owner,
      },
    );

    const requestHandler = setPermissionRequestHandler.mock.calls[0]?.[0];
    const checkHandler = setPermissionCheckHandler.mock.calls[0]?.[0];
    const details = {
      isMainFrame: true,
      mediaTypes: ["video"],
      requestingUrl: "http://localhost:5173/#/kaigi",
    };
    const callback = vi.fn();
    requestHandler(foreignOwner, "media", callback, details);
    expect(callback).toHaveBeenCalledWith(false);
    expect(
      checkHandler(foreignOwner, "media", "http://localhost:5173", {
        ...details,
        mediaType: "video",
        mediaTypes: undefined,
      }),
    ).toBe(false);
  });

  it("rechecks WebContents ownership after an asynchronous system prompt", async () => {
    const setPermissionRequestHandler = vi.fn();
    const setPermissionCheckHandler = vi.fn();
    const owner = liveWebContents();
    let activeOwner = owner;
    let finishPrompt: ((value: boolean) => void) | undefined;

    registerMediaPermissionHandlers(
      { setPermissionRequestHandler, setPermissionCheckHandler },
      {
        getRendererUrl: () => "http://localhost:5173",
        getTrustedWebContents: () => activeOwner,
        requestSystemMediaAccess: () =>
          new Promise<boolean>((resolve) => {
            finishPrompt = resolve;
          }),
      },
    );

    const callback = vi.fn();
    setPermissionRequestHandler.mock.calls[0]?.[0](owner, "media", callback, {
      isMainFrame: true,
      mediaTypes: ["video"],
      requestingUrl: "http://localhost:5173/#/kaigi",
    });
    await vi.waitFor(() => expect(finishPrompt).toBeTypeOf("function"));
    activeOwner = liveWebContents();
    finishPrompt?.(true);
    await vi.waitFor(() => expect(callback).toHaveBeenCalledWith(false));
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
    const owner = liveWebContents();

    registerMediaPermissionHandlers(
      {
        setPermissionRequestHandler,
        setPermissionCheckHandler,
      },
      {
        getRendererUrl: () => "http://localhost:5173",
        getTrustedWebContents: () => owner,
        requestSystemMediaAccess,
      },
    );

    const requestHandler = setPermissionRequestHandler.mock.calls[0]?.[0];
    const callback = vi.fn();
    requestHandler(owner, "media", callback, {
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
    const owner = liveWebContents();

    registerMediaPermissionHandlers(
      {
        setPermissionRequestHandler,
        setPermissionCheckHandler,
      },
      {
        getRendererUrl: () => "http://localhost:5173",
        getTrustedWebContents: () => owner,
        requestSystemMediaAccess,
        getSystemMediaAccessStatus,
      },
    );

    const checkHandler = setPermissionCheckHandler.mock.calls[0]?.[0];
    expect(
      checkHandler(owner, "media", "http://localhost:5173", {
        isMainFrame: true,
        mediaType: "video",
        requestingUrl: "http://localhost:5173/#/kaigi",
      }),
    ).toBe(false);

    mediaAccessStatus = "granted";
    expect(
      checkHandler(owner, "media", "http://localhost:5173", {
        isMainFrame: true,
        mediaType: "video",
        requestingUrl: "http://localhost:5173/#/kaigi",
      }),
    ).toBe(true);
  });

  it("denies renderer media when macOS media permission is denied", async () => {
    const setPermissionRequestHandler = vi.fn();
    const setPermissionCheckHandler = vi.fn();
    const requestSystemMediaAccess = vi.fn(async () => false);
    const owner = liveWebContents();

    registerMediaPermissionHandlers(
      {
        setPermissionRequestHandler,
        setPermissionCheckHandler,
      },
      {
        getRendererUrl: () => "http://localhost:5173",
        getTrustedWebContents: () => owner,
        requestSystemMediaAccess,
      },
    );

    const requestHandler = setPermissionRequestHandler.mock.calls[0]?.[0];
    const callback = vi.fn();
    requestHandler(owner, "media", callback, {
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
    const trustedFrame = {
      url: "http://localhost:5173/#/wallet",
    };

    registerDisplayMediaRequestHandler(
      { setDisplayMediaRequestHandler },
      {
        getSources,
        getRendererUrl: () => "http://localhost:5173",
        getTrustedMainFrame: () => trustedFrame,
      },
    );

    const handler = setDisplayMediaRequestHandler.mock.calls[0]?.[0];
    const options = setDisplayMediaRequestHandler.mock.calls[0]?.[1];
    const callback = vi.fn();
    await handler(
      {
        frame: trustedFrame,
        securityOrigin: "http://localhost:5173",
        videoRequested: true,
        audioRequested: false,
        userGesture: true,
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
        securityOrigin: "https://example.invalid",
        videoRequested: true,
        audioRequested: false,
        userGesture: true,
      },
      deniedCallback,
    );
    expect(deniedCallback).toHaveBeenCalledWith({});
  });

  it("rechecks the active main frame after display-source discovery", async () => {
    const setDisplayMediaRequestHandler = vi.fn();
    const trustedFrame = { url: "http://localhost:5173/#/wallet" };
    let activeFrame: object = trustedFrame;
    let finishSourceLookup:
      | ((sources: Array<{ id: string; name: string }>) => void)
      | undefined;
    registerDisplayMediaRequestHandler(
      { setDisplayMediaRequestHandler },
      {
        getSources: () =>
          new Promise((resolve) => {
            finishSourceLookup = resolve;
          }),
        getRendererUrl: () => "http://localhost:5173",
        getTrustedMainFrame: () => activeFrame,
      },
    );

    const callback = vi.fn();
    setDisplayMediaRequestHandler.mock.calls[0]?.[0](
      {
        frame: trustedFrame,
        securityOrigin: "http://localhost:5173",
        videoRequested: true,
        audioRequested: false,
        userGesture: true,
      },
      callback,
    );
    await vi.waitFor(() => expect(finishSourceLookup).toBeTypeOf("function"));
    activeFrame = { url: "http://localhost:5173/#/wallet" };
    finishSourceLookup?.([{ id: "screen:1:0", name: "Entire Screen" }]);
    await vi.waitFor(() => expect(callback).toHaveBeenCalledWith({}));
  });
});

/* eslint-disable vue/one-component-per-file */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, ref } from "vue";
import { mount } from "@vue/test-utils";
import { useQrScanner } from "@/composables/useQrScanner";

const mockControls = { stop: vi.fn() };
const decodeFromImageUrl = vi.fn(async () => ({
  getText: () => "img-payload",
}));
const decodeFromConstraints = vi.fn();
const decodeFromCanvas = vi.fn(() => ({
  getText: () => "screen-payload",
}));

vi.mock("@zxing/browser", () => {
  class MockReader {
    decodeFromImageUrl = decodeFromImageUrl;
    decodeFromConstraints = decodeFromConstraints;
    decodeFromCanvas = decodeFromCanvas;
  }
  return { BrowserMultiFormatReader: MockReader };
});

describe("useQrScanner hook", () => {
  beforeEach(() => {
    decodeFromImageUrl.mockClear();
    decodeFromConstraints.mockClear();
    decodeFromCanvas.mockClear();
    decodeFromConstraints.mockImplementation(
      async (_device: unknown, _video: unknown, cb: any) => {
        cb({ getText: () => "cam-payload" }, undefined);
        return mockControls;
      },
    );
    mockControls.stop.mockClear();
    global.URL.createObjectURL = vi.fn(() => "blob:qr");
    global.URL.revokeObjectURL = vi.fn();
  });

  it("mounts in a component and decodes from file and camera without warnings", async () => {
    const onDecoded = vi.fn();
    const scannerRef = ref<ReturnType<typeof useQrScanner> | null>(null);

    mount(
      defineComponent({
        setup() {
          const scanner = useQrScanner(onDecoded);
          scanner.videoRef.value = document.createElement("video");
          scanner.fileInputRef.value = document.createElement("input");
          scannerRef.value = scanner;
          return () => null;
        },
      }),
    );

    const scanner = scannerRef.value;
    if (!scanner) throw new Error("scanner not initialised");

    const file = new File(["data"], "qr.png", { type: "image/png" });
    const event = { target: { files: [file], value: "" } } as unknown as Event;
    await scanner.decodeFile(event);
    expect(onDecoded).toHaveBeenCalledWith("img-payload");

    await scanner.start();
    expect(onDecoded).toHaveBeenCalledWith("cam-payload");
    expect(decodeFromConstraints).toHaveBeenCalledWith(
      {
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      },
      expect.any(HTMLVideoElement),
      expect.any(Function),
    );
  });

  it("stops the camera after an async decode callback fires", async () => {
    vi.useFakeTimers();
    decodeFromConstraints.mockImplementationOnce(
      async (_device: unknown, _video: unknown, cb: any) => {
        setTimeout(() => {
          cb({ getText: () => "late-payload" }, undefined);
        }, 0);
        return mockControls;
      },
    );

    const onDecoded = vi.fn();
    const scannerRef = ref<ReturnType<typeof useQrScanner> | null>(null);

    mount(
      defineComponent({
        setup() {
          const scanner = useQrScanner(onDecoded);
          scanner.videoRef.value = document.createElement("video");
          scannerRef.value = scanner;
          return () => null;
        },
      }),
    );

    const scanner = scannerRef.value;
    if (!scanner) throw new Error("scanner not initialised");

    try {
      await scanner.start();
      await vi.runAllTimersAsync();

      expect(onDecoded).toHaveBeenCalledWith("late-payload");
      expect(mockControls.stop).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps scanning through transient ZXing frame errors", async () => {
    decodeFromConstraints.mockImplementationOnce(
      async (_device: unknown, _video: unknown, cb: any) => {
        cb(undefined, { name: "ChecksumException" });
        cb(undefined, { name: "FormatException" });
        cb({ getText: () => "eventual-payload" }, undefined);
        return mockControls;
      },
    );

    const onDecoded = vi.fn();
    const scannerRef = ref<ReturnType<typeof useQrScanner> | null>(null);

    mount(
      defineComponent({
        setup() {
          const scanner = useQrScanner(onDecoded);
          scanner.videoRef.value = document.createElement("video");
          scannerRef.value = scanner;
          return () => null;
        },
      }),
    );

    const scanner = scannerRef.value;
    if (!scanner) throw new Error("scanner not initialised");

    await scanner.start();

    expect(onDecoded).toHaveBeenCalledWith("eventual-payload");
    expect(scanner.message).toBe("QR decoded successfully.");
  });

  it("uses optional translator for scanner status text", async () => {
    const scannerRef = ref<ReturnType<typeof useQrScanner> | null>(null);
    const translate = (key: string) => `JP:${key}`;

    mount(
      defineComponent({
        setup() {
          const scanner = useQrScanner(vi.fn(), { translate });
          scannerRef.value = scanner;
          return () => null;
        },
      }),
    );

    const scanner = scannerRef.value;
    if (!scanner) throw new Error("scanner not initialised");

    await scanner.start();
    expect(scanner.message).toBe("JP:Camera preview is not ready.");
  });

  it("captures the selected screen once and decodes a QR from the frame", async () => {
    const stopTrack = vi.fn();
    const getDisplayMedia = vi.fn(async () => ({
      getTracks: () => [{ stop: stopTrack }],
    }));
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getDisplayMedia },
    });
    const playSpy = vi
      .spyOn(HTMLMediaElement.prototype, "play")
      .mockResolvedValue(undefined);
    const pauseSpy = vi
      .spyOn(HTMLMediaElement.prototype, "pause")
      .mockImplementation(() => undefined);
    Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", {
      configurable: true,
      get: () => 640,
    });
    Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", {
      configurable: true,
      get: () => 360,
    });
    const drawImage = vi.fn();
    const getContextSpy = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);

    const onDecoded = vi.fn();
    const scannerRef = ref<ReturnType<typeof useQrScanner> | null>(null);

    mount(
      defineComponent({
        setup() {
          const scanner = useQrScanner(onDecoded);
          scannerRef.value = scanner;
          return () => null;
        },
      }),
    );

    const scanner = scannerRef.value;
    if (!scanner) throw new Error("scanner not initialised");

    try {
      await scanner.decodeScreen();

      expect(getDisplayMedia).toHaveBeenCalledWith({
        video: {
          frameRate: { ideal: 1, max: 5 },
        },
        audio: false,
      });
      expect(drawImage).toHaveBeenCalled();
      expect(decodeFromCanvas).toHaveBeenCalledWith(
        expect.any(HTMLCanvasElement),
      );
      expect(onDecoded).toHaveBeenCalledWith("screen-payload");
      expect(stopTrack).toHaveBeenCalledTimes(1);
      expect(scanner.screenScanning).toBe(false);
      expect(scanner.message).toBe("QR decoded successfully.");
    } finally {
      playSpy.mockRestore();
      pauseSpy.mockRestore();
      getContextSpy.mockRestore();
    }
  });
});

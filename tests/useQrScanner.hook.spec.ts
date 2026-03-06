/* eslint-disable vue/one-component-per-file */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, ref } from "vue";
import { mount } from "@vue/test-utils";
import { useQrScanner } from "@/composables/useQrScanner";

const mockControls = { stop: vi.fn() };
const decodeFromImageUrl = vi.fn(async () => ({
  getText: () => "img-payload",
}));
const decodeFromVideoDevice = vi.fn(
  async (_device: unknown, _video: unknown, cb: any) => {
    cb({ getText: () => "cam-payload" }, undefined);
    return mockControls;
  },
);

vi.mock("@zxing/browser", () => {
  class MockReader {
    decodeFromImageUrl = decodeFromImageUrl;
    decodeFromVideoDevice = decodeFromVideoDevice;
  }
  return { BrowserMultiFormatReader: MockReader };
});

describe("useQrScanner hook", () => {
  beforeEach(() => {
    decodeFromImageUrl.mockClear();
    decodeFromVideoDevice.mockClear();
    mockControls.stop.mockClear();
    global.URL.createObjectURL = vi.fn(() => "blob:qr");
    global.URL.revokeObjectURL = vi.fn();
    Object.defineProperty(global.navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn(async () => ({
          getTracks: () => [{ stop: vi.fn() }],
        })),
      },
    });
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
});

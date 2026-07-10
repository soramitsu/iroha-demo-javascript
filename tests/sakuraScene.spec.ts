import { createPinia, setActivePinia } from "pinia";
import { mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SakuraScene from "@/components/SakuraScene.vue";

type MotionListener = (event: MediaQueryListEvent) => void;

const createCanvasContext = () => ({
  save: vi.fn(),
  restore: vi.fn(),
  translate: vi.fn(),
  rotate: vi.fn(),
  scale: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  bezierCurveTo: vi.fn(),
  fill: vi.fn(),
  clearRect: vi.fn(),
  setTransform: vi.fn(),
  fillStyle: "",
});

const setViewport = (width: number, height: number, pixelRatio: number) => {
  Object.defineProperty(window, "innerWidth", {
    value: width,
    configurable: true,
  });
  Object.defineProperty(window, "innerHeight", {
    value: height,
    configurable: true,
  });
  Object.defineProperty(window, "devicePixelRatio", {
    value: pixelRatio,
    configurable: true,
  });
};

const installMotionPreference = (initial: boolean) => {
  let matches = initial;
  const listeners = new Set<MotionListener>();
  const query = {
    get matches() {
      return matches;
    },
    media: "(prefers-reduced-motion: reduce)",
    onchange: null,
    addEventListener: vi.fn((type: string, listener: MotionListener) => {
      if (type === "change") listeners.add(listener);
    }),
    removeEventListener: vi.fn((type: string, listener: MotionListener) => {
      if (type === "change") listeners.delete(listener);
    }),
    addListener: vi.fn((listener: MotionListener) => listeners.add(listener)),
    removeListener: vi.fn((listener: MotionListener) =>
      listeners.delete(listener),
    ),
    dispatchEvent: vi.fn(() => true),
  } as unknown as MediaQueryList;

  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => query),
  });

  return {
    query,
    set(next: boolean) {
      matches = next;
      const event = {
        matches: next,
        media: query.media,
      } as MediaQueryListEvent;
      listeners.forEach((listener) => listener(event));
    },
  };
};

describe("SakuraScene", () => {
  let context: ReturnType<typeof createCanvasContext>;
  let wrappers: VueWrapper[];
  let hidden = false;
  let nextFrameId = 1;
  let frameCallbacks: Map<number, FrameRequestCallback>;
  let requestFrame: ReturnType<typeof vi.spyOn>;
  let cancelFrame: ReturnType<typeof vi.spyOn>;

  const mountScene = () => {
    const wrapper = mount(SakuraScene);
    wrappers.push(wrapper);
    return wrapper;
  };

  const runFrame = (id: number, timestamp: number) => {
    const callback = frameCallbacks.get(id);
    expect(callback, `animation frame ${id} should be scheduled`).toBeTruthy();
    frameCallbacks.delete(id);
    callback?.(timestamp);
  };

  beforeEach(() => {
    setActivePinia(createPinia());
    context = createCanvasContext();
    wrappers = [];
    hidden = false;
    nextFrameId = 1;
    frameCallbacks = new Map();
    setViewport(400, 300, 2);

    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => hidden,
    });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      context as unknown as CanvasRenderingContext2D,
    );
    requestFrame = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback: FrameRequestCallback) => {
        const id = nextFrameId;
        nextFrameId += 1;
        frameCallbacks.set(id, callback);
        return id;
      });
    cancelFrame = vi
      .spyOn(window, "cancelAnimationFrame")
      .mockImplementation((id: number) => {
        frameCallbacks.delete(id);
      });
  });

  afterEach(() => {
    wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
    document.documentElement.style.removeProperty("--parallax-x");
    document.documentElement.style.removeProperty("--parallax-y");
    vi.restoreAllMocks();
  });

  it("uses a Retina backing store while remaining decorative", () => {
    installMotionPreference(false);

    const wrapper = mountScene();
    const canvas = wrapper.get("canvas").element as HTMLCanvasElement;

    expect(canvas.width).toBe(800);
    expect(canvas.height).toBe(600);
    expect(canvas.getAttribute("aria-hidden")).toBe("true");
    expect(context.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
  });

  it.each([
    { pixelRatio: 3, expected: 2, label: "caps oversized DPR" },
    { pixelRatio: Number.NaN, expected: 1, label: "defaults a NaN DPR" },
    { pixelRatio: -1, expected: 1, label: "defaults a negative DPR" },
  ])("$label", ({ pixelRatio, expected }) => {
    setViewport(400, 300, pixelRatio);
    installMotionPreference(false);

    const wrapper = mountScene();
    const canvas = wrapper.get("canvas").element as HTMLCanvasElement;

    expect(canvas.width).toBe(400 * expected);
    expect(canvas.height).toBe(300 * expected);
    expect(context.setTransform).toHaveBeenCalledWith(
      expected,
      0,
      0,
      expected,
      0,
      0,
    );
  });

  it("keeps a static sakura composition when reduced motion is requested", () => {
    installMotionPreference(true);

    mountScene();

    expect(requestFrame).not.toHaveBeenCalled();
    expect(context.fill).toHaveBeenCalled();
  });

  it("scales petal density and backing dimensions after a viewport resize", () => {
    installMotionPreference(false);
    const wrapper = mountScene();

    context.fill.mockClear();
    runFrame(1, 1000 / 60);
    expect(context.fill).toHaveBeenCalledTimes(16);

    setViewport(1440, 1000, 2);
    window.dispatchEvent(new Event("resize"));
    context.fill.mockClear();
    runFrame(2, 2000 / 60);

    const canvas = wrapper.get("canvas").element as HTMLCanvasElement;
    expect(canvas.width).toBe(2880);
    expect(canvas.height).toBe(2000);
    expect(context.fill).toHaveBeenCalledTimes(55);
  });

  it("pauses while hidden and resumes with only one animation frame", () => {
    installMotionPreference(false);
    mountScene();
    expect(requestFrame).toHaveBeenCalledTimes(1);

    hidden = true;
    document.dispatchEvent(new Event("visibilitychange"));
    expect(cancelFrame).toHaveBeenCalledWith(1);

    hidden = false;
    document.dispatchEvent(new Event("visibilitychange"));
    document.dispatchEvent(new Event("visibilitychange"));
    expect(requestFrame).toHaveBeenCalledTimes(2);
    expect(frameCallbacks.size).toBe(1);
  });

  it("responds to live reduced-motion changes and resets cached parallax", () => {
    const motion = installMotionPreference(false);
    mountScene();
    document.documentElement.style.setProperty("--parallax-x", "0.42");
    document.documentElement.style.setProperty("--parallax-y", "-0.31");

    motion.set(true);
    expect(cancelFrame).toHaveBeenCalledWith(1);
    expect(
      document.documentElement.style.getPropertyValue("--parallax-x"),
    ).toBe("0");
    expect(
      document.documentElement.style.getPropertyValue("--parallax-y"),
    ).toBe("0");
    expect(context.fill).toHaveBeenCalled();

    motion.set(false);
    motion.set(false);
    expect(requestFrame).toHaveBeenCalledTimes(2);
    expect(frameCallbacks.size).toBe(1);
  });

  it("coalesces pointer input and applies the newest coordinates", () => {
    installMotionPreference(false);
    mountScene();

    window.dispatchEvent(
      new MouseEvent("pointermove", { clientX: 100, clientY: 50 }),
    );
    window.dispatchEvent(
      new MouseEvent("pointermove", { clientX: 300, clientY: 150 }),
    );

    expect(requestFrame).toHaveBeenCalledTimes(2);
    runFrame(2, 10);
    expect(
      document.documentElement.style.getPropertyValue("--parallax-x"),
    ).toBe("0.250");
    expect(
      document.documentElement.style.getPropertyValue("--parallax-y"),
    ).toBe("0.000");
  });

  it("removes lifecycle listeners and cancels animation and pointer frames", () => {
    const motion = installMotionPreference(false);
    const removeWindowListener = vi.spyOn(window, "removeEventListener");
    const removeDocumentListener = vi.spyOn(document, "removeEventListener");
    const wrapper = mountScene();
    window.dispatchEvent(
      new MouseEvent("pointermove", { clientX: 100, clientY: 100 }),
    );
    const callsBeforeUnmount = requestFrame.mock.calls.length;

    wrapper.unmount();
    wrappers = wrappers.filter((candidate) => candidate !== wrapper);

    expect(cancelFrame).toHaveBeenCalledWith(1);
    expect(cancelFrame).toHaveBeenCalledWith(2);
    expect(removeWindowListener).toHaveBeenCalledWith(
      "resize",
      expect.any(Function),
    );
    expect(removeWindowListener).toHaveBeenCalledWith(
      "pointermove",
      expect.any(Function),
    );
    expect(removeDocumentListener).toHaveBeenCalledWith(
      "visibilitychange",
      expect.any(Function),
    );
    expect(motion.query.removeEventListener).toHaveBeenCalledWith(
      "change",
      expect.any(Function),
    );

    window.dispatchEvent(new Event("resize"));
    window.dispatchEvent(
      new MouseEvent("pointermove", { clientX: 200, clientY: 200 }),
    );
    expect(requestFrame).toHaveBeenCalledTimes(callsBeforeUnmount);
  });
});

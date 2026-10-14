import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createPinia, setActivePinia } from "pinia";
import { mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SakuraScene from "@/components/SakuraScene.vue";
import {
  THEME_SCHEMA,
  THEME_STORAGE_KEY,
  THEME_VERSION,
  useThemeStore,
} from "@/stores/theme";
import { SAKURA_PALETTES } from "@/utils/sakuraPetals";

type MotionListener = (event: MediaQueryListEvent) => void;

const createGradient = () => ({ addColorStop: vi.fn() });

const createCanvasContext = () => ({
  setTransform: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  bezierCurveTo: vi.fn(),
  quadraticCurveTo: vi.fn(),
  closePath: vi.fn(),
  fill: vi.fn(),
  stroke: vi.fn(),
  clearRect: vi.fn(),
  fillRect: vi.fn(),
  drawImage: vi.fn(),
  createLinearGradient: vi.fn(() => createGradient()),
  createRadialGradient: vi.fn(() => createGradient()),
  fillStyle: "" as unknown,
  strokeStyle: "" as unknown,
  lineWidth: 1,
  lineCap: "butt",
  globalAlpha: 1,
  globalCompositeOperation: "source-over",
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

const seededRandom = (seed: number) => {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const sakuraSource = readFileSync(
  resolve(process.cwd(), "src/components/SakuraScene.vue"),
  "utf8",
);

type CanvasContextMock = ReturnType<typeof createCanvasContext>;

// Every petal body is one closed outline drawn under its own transform.
const petalPositions = (context: CanvasContextMock, pixelRatio = 2) => {
  const transforms = context.setTransform.mock.calls.map((args, index) => ({
    order: context.setTransform.mock.invocationCallOrder[index],
    args,
  }));
  return context.closePath.mock.invocationCallOrder.map((order) => {
    const transform = transforms.filter((entry) => entry.order < order).at(-1);
    return [
      transform!.args[4] / pixelRatio,
      transform!.args[5] / pixelRatio,
    ] as const;
  });
};

const gradientStops = (context: CanvasContextMock) =>
  [
    ...context.createLinearGradient.mock.results,
    ...context.createRadialGradient.mock.results,
  ].flatMap(({ value }) =>
    (value as ReturnType<typeof createGradient>).addColorStop.mock.calls.map(
      ([, color]) => color,
    ),
  );

describe("SakuraScene", () => {
  let context: CanvasContextMock;
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

  const clearDrawing = () => {
    context.setTransform.mockClear();
    context.closePath.mockClear();
    context.drawImage.mockClear();
    context.fill.mockClear();
    context.bezierCurveTo.mockClear();
    context.createLinearGradient.mockClear();
    context.createRadialGradient.mockClear();
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
    localStorage.removeItem(THEME_STORAGE_KEY);
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
    expect(canvas.classList.contains("sakura-layer")).toBe(true);
    expect(context.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
  });

  it("keeps the decorative canvas behind the app and outside hit testing", () => {
    installMotionPreference(false);

    const canvas = mountScene().get("canvas");

    expect(canvas.attributes("aria-hidden")).toBe("true");
    expect(canvas.classes()).toContain("sakura-layer");
    expect(sakuraSource).toMatch(
      /\.sakura-layer\s*{[^}]*position:\s*fixed;[^}]*inset:\s*0;[^}]*pointer-events:\s*none;[^}]*z-index:\s*0;[^}]*}/s,
    );
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
    expect(context.closePath).toHaveBeenCalledTimes(18);
  });

  it("draws each petal as one closed, notched outline over its wall shadow", () => {
    vi.spyOn(Math, "random").mockImplementation(seededRandom(7));
    installMotionPreference(true);

    mountScene();

    expect(context.bezierCurveTo).toHaveBeenCalledTimes(18 * 8);
    expect(context.drawImage).toHaveBeenCalledTimes(18);
    // Shadows land on the wall before any petal is painted over them.
    expect(
      Math.max(...context.drawImage.mock.invocationCallOrder),
    ).toBeLessThan(Math.min(...context.closePath.mock.invocationCallOrder));
  });

  it("repaints the same static composition when reduced-motion colors change", async () => {
    vi.spyOn(Math, "random").mockImplementation(seededRandom(42));
    installMotionPreference(true);
    mountScene();
    const originalComposition = petalPositions(context);
    const darkStops = gradientStops(context);
    expect(new Set(originalComposition.map(([x]) => x)).size).toBeGreaterThan(
      1,
    );

    clearDrawing();
    useThemeStore().setTheme("light");
    await nextTick();

    expect(requestFrame).not.toHaveBeenCalled();
    expect(petalPositions(context)).toEqual(originalComposition);
    const lightStops = gradientStops(context);
    expect(lightStops).toContain(
      `rgba(${SAKURA_PALETTES.light.occlusion.join(", ")}, 1)`,
    );
    expect(lightStops).not.toEqual(darkStops);
  });

  it.each(["dark", "light"] as const)(
    "lights petals with the %s-theme palette",
    (theme) => {
      localStorage.setItem(
        THEME_STORAGE_KEY,
        JSON.stringify({
          schema: THEME_SCHEMA,
          version: THEME_VERSION,
          theme,
        }),
      );
      installMotionPreference(true);

      mountScene();

      const palette = SAKURA_PALETTES[theme];
      const stops = gradientStops(context);
      expect(stops).toContain(`rgba(${palette.occlusion.join(", ")}, 1)`);
      expect(stops).toContain(`rgb(${palette.clawDeep.join(", ")})`);
    },
  );

  it("rebuilds the theme paint for the next animated frame", async () => {
    installMotionPreference(false);
    mountScene();
    runFrame(1, 1000 / 60);

    clearDrawing();
    useThemeStore().setTheme("light");
    await nextTick();
    expect(context.createRadialGradient).not.toHaveBeenCalled();
    runFrame(2, 2000 / 60);

    expect(gradientStops(context)).toContain(
      `rgba(${SAKURA_PALETTES.light.occlusion.join(", ")}, 1)`,
    );
  });

  it("sticks petals to the windward edge and releases them when wind calms", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    installMotionPreference(false);
    mountScene();

    window.dispatchEvent(
      new MouseEvent("pointermove", { clientX: 0, clientY: 150 }),
    );
    runFrame(2, 1);
    clearDrawing();
    runFrame(1, 1000 / 60);

    // Far petals are 12.9px long, pinned half a length from the wall, and
    // shifted by a fifth of their -0.5 × 8px parallax while pinned.
    const pinned = 12.9 / 2 - 0.5 * 8 * 0.2;
    const stuck = petalPositions(context);
    expect(stuck).toHaveLength(16);
    stuck.forEach(([x]) => expect(x).toBeCloseTo(pinned, 10));

    window.dispatchEvent(
      new MouseEvent("pointermove", { clientX: 200, clientY: 150 }),
    );
    runFrame(4, 20);
    runFrame(3, 2000 / 60);
    clearDrawing();
    runFrame(5, 3000 / 60);
    const releasedOnce = petalPositions(context);
    clearDrawing();
    runFrame(6, 4000 / 60);
    const releasedTwice = petalPositions(context);

    // Free petals drift again instead of holding the wall.
    expect(releasedTwice).toHaveLength(16);
    releasedTwice.forEach(([x], index) => {
      expect(x).not.toBeCloseTo(pinned, 3);
      expect(x).not.toBeCloseTo(releasedOnce[index][0], 6);
    });
  });

  it("scales petal density and backing dimensions after a viewport resize", () => {
    installMotionPreference(false);
    const wrapper = mountScene();

    clearDrawing();
    runFrame(1, 1000 / 60);
    expect(context.closePath).toHaveBeenCalledTimes(16);

    setViewport(1440, 1000, 2);
    window.dispatchEvent(new Event("resize"));
    clearDrawing();
    runFrame(2, 2000 / 60);

    const canvas = wrapper.get("canvas").element as HTMLCanvasElement;
    expect(canvas.width).toBe(2880);
    expect(canvas.height).toBe(2000);
    expect(context.closePath).toHaveBeenCalledTimes(55);
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
    expect(context.closePath).toHaveBeenCalledTimes(18);

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

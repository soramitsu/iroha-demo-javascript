<template>
  <canvas ref="canvas" class="sakura-layer" aria-hidden="true"></canvas>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from "vue";
import { useThemeStore } from "@/stores/theme";
import {
  createSakuraPaint,
  createSakuraPetal,
  drawSakuraPetal,
  drawSakuraShadow,
  stepSakuraPetal,
  type SakuraPaint,
  type SakuraPetal,
} from "@/utils/sakuraPetals";

const canvas = ref<HTMLCanvasElement | null>(null);
const theme = useThemeStore();

let ctx: CanvasRenderingContext2D | null = null;
let paint: SakuraPaint | null = null;
let petals: SakuraPetal[] = [];
let frameId = 0;
let pointerFrameId = 0;
let lastFrameTime = 0;
let sceneTime = 0;
let viewportWidth = 0;
let viewportHeight = 0;
let pixelRatio = 1;
let parallaxX = 0;
let parallaxY = 0;
let pendingPointer: { x: number; y: number } | null = null;
let reducedMotionQuery: MediaQueryList | null = null;
let reducedMotion = false;
const MAX_PETALS = 55;
const MIN_PETALS = 16;

const targetPetalCount = (width: number, height: number) => {
  if (reducedMotion) {
    return Math.min(18, MAX_PETALS);
  }
  return Math.max(
    MIN_PETALS,
    Math.min(MAX_PETALS, Math.round((width * height) / 26_000)),
  );
};

const syncPetalCount = (width: number, height: number) => {
  const count = targetPetalCount(width, height);
  if (petals.length > count) {
    // Thin evenly across the depth-sorted list so every layer keeps petals.
    const stride = petals.length / count;
    petals = Array.from(
      { length: count },
      (_, index) => petals[Math.floor(index * stride)],
    );
    return;
  }
  if (petals.length === count) {
    return;
  }
  while (petals.length < count) {
    petals.push(createSakuraPetal(width, height));
  }
  // Paint far petals first so nearer ones overlap them.
  petals.sort((left, right) => left.depth - right.depth);
};

const resizeCanvas = () => {
  const el = canvas.value;
  if (!el) return;
  viewportWidth = window.innerWidth;
  viewportHeight = window.innerHeight;
  const devicePixelRatio = window.devicePixelRatio;
  pixelRatio =
    Number.isFinite(devicePixelRatio) && devicePixelRatio > 0
      ? Math.min(Math.max(devicePixelRatio, 1), 2)
      : 1;
  el.width = Math.round(viewportWidth * pixelRatio);
  el.height = Math.round(viewportHeight * pixelRatio);
  el.style.width = `${viewportWidth}px`;
  el.style.height = `${viewportHeight}px`;
  ctx?.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  syncPetalCount(viewportWidth, viewportHeight);
  petals.forEach((petal) => {
    petal.x = Math.min(
      Math.max(petal.x, -petal.size),
      viewportWidth + petal.size,
    );
    petal.y = Math.min(
      Math.max(petal.y, -petal.size),
      viewportHeight + petal.size,
    );
  });
  if (reducedMotion) {
    drawFrame(false, 0);
  }
};

// Nearer petals slide further with the pointer, which reads as depth.
const parallaxOffset = (petal: SakuraPetal): [number, number] => [
  parallaxX * (8 + 24 * petal.depth) * (petal.stuck ? 0.2 : 1),
  parallaxY * (6 + 18 * petal.depth) * (petal.stuck ? 0.3 : 1),
];

const drawFrame = (advance: boolean, frameScale: number) => {
  const el = canvas.value;
  const context = ctx;
  if (!context || !el) return;
  const currentPaint = (paint ??= createSakuraPaint(context, theme.current));
  if (advance) {
    sceneTime += frameScale / 60;
    const environment = {
      width: viewportWidth,
      height: viewportHeight,
      parallaxX,
      time: sceneTime,
      frameScale,
    };
    petals.forEach((petal) => stepSakuraPetal(petal, environment));
  }
  context.globalAlpha = 1;
  context.globalCompositeOperation = "source-over";
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, viewportWidth, viewportHeight);
  // Shadows land on the wall behind every petal, so they go down first.
  petals.forEach((petal) => {
    const [offsetX, offsetY] = parallaxOffset(petal);
    drawSakuraShadow(
      context,
      petal,
      currentPaint,
      pixelRatio,
      offsetX,
      offsetY,
    );
  });
  petals.forEach((petal) => {
    const [offsetX, offsetY] = parallaxOffset(petal);
    drawSakuraPetal(context, petal, currentPaint, pixelRatio, offsetX, offsetY);
  });
  context.globalAlpha = 1;
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
};

const render = (timestamp: number) => {
  if (document.hidden || reducedMotion) {
    frameId = 0;
    lastFrameTime = 0;
    return;
  }
  const delta = lastFrameTime ? timestamp - lastFrameTime : 1000 / 60;
  lastFrameTime = timestamp;
  drawFrame(true, Math.min(Math.max(delta / (1000 / 60), 0.25), 3));
  frameId = requestAnimationFrame(render);
};

const startAnimation = () => {
  if (frameId || document.hidden || reducedMotion) {
    return;
  }
  lastFrameTime = 0;
  frameId = requestAnimationFrame(render);
};

const stopAnimation = () => {
  if (frameId) {
    cancelAnimationFrame(frameId);
    frameId = 0;
  }
  lastFrameTime = 0;
};

const updatePointer = (event: PointerEvent) => {
  if (reducedMotion) {
    return;
  }
  pendingPointer = { x: event.clientX, y: event.clientY };
  if (pointerFrameId) {
    return;
  }
  pointerFrameId = requestAnimationFrame(() => {
    pointerFrameId = 0;
    if (!pendingPointer) {
      return;
    }
    parallaxX = pendingPointer.x / Math.max(viewportWidth, 1) - 0.5;
    parallaxY = pendingPointer.y / Math.max(viewportHeight, 1) - 0.5;
    pendingPointer = null;
    document.documentElement.style.setProperty(
      "--parallax-x",
      parallaxX.toFixed(3),
    );
    document.documentElement.style.setProperty(
      "--parallax-y",
      parallaxY.toFixed(3),
    );
  });
};

const handleVisibilityChange = () => {
  if (document.hidden) {
    stopAnimation();
    return;
  }
  if (reducedMotion) {
    drawFrame(false, 0);
    return;
  }
  startAnimation();
};

const handleReducedMotionChange = (event: MediaQueryListEvent) => {
  reducedMotion = event.matches;
  parallaxX = 0;
  parallaxY = 0;
  document.documentElement.style.setProperty("--parallax-x", "0");
  document.documentElement.style.setProperty("--parallax-y", "0");
  syncPetalCount(viewportWidth, viewportHeight);
  if (reducedMotion) {
    stopAnimation();
    drawFrame(false, 0);
    return;
  }
  startAnimation();
};

onMounted(() => {
  const el = canvas.value;
  if (!el) return;
  ctx = el.getContext("2d");
  reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  reducedMotion = reducedMotionQuery.matches;
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);
  window.addEventListener("pointermove", updatePointer, { passive: true });
  document.addEventListener("visibilitychange", handleVisibilityChange);
  reducedMotionQuery.addEventListener("change", handleReducedMotionChange);
  // resizeCanvas already painted the static scene for reduced motion.
  startAnimation();
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", resizeCanvas);
  window.removeEventListener("pointermove", updatePointer);
  document.removeEventListener("visibilitychange", handleVisibilityChange);
  reducedMotionQuery?.removeEventListener("change", handleReducedMotionChange);
  stopAnimation();
  if (pointerFrameId) {
    cancelAnimationFrame(pointerFrameId);
  }
  paint = null;
});

watch(
  () => theme.current,
  () => {
    // Palettes, gradients and the shadow sprite are theme-bound.
    paint = null;
    if (reducedMotion) {
      drawFrame(false, 0);
    }
  },
);
</script>

<style scoped>
.sakura-layer {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
}
</style>

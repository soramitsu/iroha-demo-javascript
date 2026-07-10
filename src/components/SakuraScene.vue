<template>
  <canvas ref="canvas" class="sakura-layer" aria-hidden="true"></canvas>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from "vue";
import { useThemeStore } from "@/stores/theme";

const canvas = ref<HTMLCanvasElement | null>(null);
const theme = useThemeStore();

interface Petal {
  x: number;
  y: number;
  size: number;
  speedY: number;
  speedX: number;
  rotation: number;
  rotationSpeed: number;
  sway: number;
  flutterPhase: number;
  stuck: boolean;
  stickSide: "left" | "right" | null;
}

let ctx: CanvasRenderingContext2D | null = null;
let petals: Petal[] = [];
let frameId = 0;
let pointerFrameId = 0;
let lastFrameTime = 0;
let viewportWidth = 0;
let viewportHeight = 0;
let parallaxX = 0;
let parallaxY = 0;
let pendingPointer: { x: number; y: number } | null = null;
let reducedMotionQuery: MediaQueryList | null = null;
let reducedMotion = false;
const MAX_PETALS = 55;
const MIN_PETALS = 16;
const petalColor = () =>
  theme.current === "dark"
    ? "rgba(252, 181, 212, 0.9)"
    : "rgba(247, 166, 198, 0.92)";

const createPetal = (width: number, height: number): Petal => ({
  x: Math.random() * width,
  y: Math.random() * height,
  size: 8 + Math.random() * 8,
  speedY: 0.4 + Math.random() * 1.2,
  speedX: -0.5 + Math.random() * 1.0,
  rotation: Math.random() * Math.PI * 2,
  rotationSpeed: -0.01 + Math.random() * 0.02,
  sway: 0.5 + Math.random() * 0.8,
  flutterPhase: Math.random() * Math.PI * 2,
  stuck: false,
  stickSide: null,
});

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
    petals = petals.slice(0, count);
    return;
  }
  while (petals.length < count) {
    petals.push(createPetal(width, height));
  }
};

const resizeCanvas = () => {
  const el = canvas.value;
  if (!el) return;
  viewportWidth = window.innerWidth;
  viewportHeight = window.innerHeight;
  const devicePixelRatio = window.devicePixelRatio;
  const pixelRatio =
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

const drawPetal = (petal: Petal) => {
  if (!ctx) return;
  const color = petalColor();
  ctx.save();
  ctx.translate(petal.x, petal.y);
  ctx.rotate(petal.rotation);
  const flutter =
    Math.sin(petal.rotation * 2.6 + petal.flutterPhase) *
    (0.05 + petal.sway * 0.03);
  ctx.scale(1 + flutter, 1 - flutter * 0.42);
  const width = petal.size * 0.78;
  const height = petal.size * 1.12;
  ctx.fillStyle = color;
  ctx.beginPath();
  // A sakura-like single petal: top notch + wider shoulders + tapered tip.
  ctx.moveTo(0, -height * 0.76);
  ctx.bezierCurveTo(
    width * 0.22,
    -height * 1.02,
    width * 0.56,
    -height * 0.92,
    width * 0.68,
    -height * 0.54,
  );
  ctx.bezierCurveTo(
    width * 0.9,
    -height * 0.02,
    width * 0.62,
    height * 0.46,
    width * 0.22,
    height * 0.95,
  );
  ctx.bezierCurveTo(
    width * 0.08,
    height * 1.11,
    width * 0.03,
    height * 1.2,
    0,
    height * 1.23,
  );
  ctx.bezierCurveTo(
    -width * 0.06,
    height * 1.16,
    -width * 0.16,
    height * 1.05,
    -width * 0.3,
    height * 0.9,
  );
  ctx.bezierCurveTo(
    -width * 0.74,
    height * 0.34,
    -width * 0.95,
    -height * 0.06,
    -width * 0.66,
    -height * 0.58,
  );
  ctx.bezierCurveTo(
    -width * 0.56,
    -height * 0.92,
    -width * 0.2,
    -height * 1.02,
    0,
    -height * 0.76,
  );
  ctx.fill();
  ctx.restore();
};

const updatePetal = (
  petal: Petal,
  width: number,
  height: number,
  parallaxX: number,
  frameScale: number,
) => {
  const wind = parallaxX * 1.5;
  if (petal.stuck) {
    petal.y += petal.speedY * 1.4 * frameScale;
    petal.x = petal.stickSide === "left" ? petal.size : width - petal.size;
    if (Math.abs(parallaxX) < 0.12) {
      petal.stuck = false;
      petal.stickSide = null;
    }
  } else {
    petal.y += petal.speedY * frameScale;
    petal.x +=
      (petal.speedX + wind + Math.sin(petal.y / 40) * petal.sway * 0.3) *
      frameScale;
    if (Math.abs(parallaxX) > 0.2) {
      if (petal.x < petal.size * 1.5 && parallaxX < 0) {
        petal.stuck = true;
        petal.stickSide = "left";
        petal.x = petal.size;
      } else if (petal.x > width - petal.size * 1.5 && parallaxX > 0) {
        petal.stuck = true;
        petal.stickSide = "right";
        petal.x = width - petal.size;
      }
    }
  }
  petal.rotation += petal.rotationSpeed * frameScale;
  if (petal.y > height + petal.size) {
    petal.y = -petal.size;
    petal.x = Math.random() * width;
    petal.stuck = false;
    petal.stickSide = null;
  }
  if (!petal.stuck) {
    if (petal.x > width + petal.size) {
      petal.x = -petal.size;
    } else if (petal.x < -petal.size) {
      petal.x = width + petal.size;
    }
  }
};

const drawFrame = (advance: boolean, frameScale: number) => {
  const el = canvas.value;
  const context = ctx;
  if (!context || !el) return;
  context.clearRect(0, 0, viewportWidth, viewportHeight);
  petals.forEach((petal) => {
    if (advance) {
      updatePetal(petal, viewportWidth, viewportHeight, parallaxX, frameScale);
    }
    const offsetX = parallaxX * 20 * (petal.stuck ? 0.2 : 1);
    const offsetY = parallaxY * 15 * (petal.stuck ? 0.3 : 1);
    context.save();
    context.translate(offsetX, offsetY);
    drawPetal(petal);
    context.restore();
  });
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
  if (reducedMotion) {
    drawFrame(false, 0);
  } else {
    startAnimation();
  }
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
});

watch(
  () => theme.current,
  () => {
    petals = petals.map((petal) => ({ ...petal }));
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

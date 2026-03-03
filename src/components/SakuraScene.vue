<template>
  <canvas ref="canvas" class="sakura-layer"></canvas>
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
const MAX_PETALS = 55;
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

const resizeCanvas = () => {
  const el = canvas.value;
  if (!el) return;
  el.width = window.innerWidth;
  el.height = window.innerHeight;
  if (petals.length === 0) {
    petals = Array.from({ length: MAX_PETALS }, () =>
      createPetal(el.width, el.height),
    );
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
) => {
  const wind = parallaxX * 1.5;
  if (petal.stuck) {
    petal.y += petal.speedY * 1.4;
    petal.x = petal.stickSide === "left" ? petal.size : width - petal.size;
    if (Math.abs(parallaxX) < 0.12) {
      petal.stuck = false;
      petal.stickSide = null;
    }
  } else {
    petal.y += petal.speedY;
    petal.x += petal.speedX + wind + Math.sin(petal.y / 40) * petal.sway * 0.3;
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
  petal.rotation += petal.rotationSpeed;
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

const render = () => {
  const el = canvas.value;
  const context = ctx;
  if (!context || !el) return;
  context.clearRect(0, 0, el.width, el.height);
  const parallaxX =
    parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue(
        "--parallax-x",
      ),
    ) || 0;
  const parallaxY =
    parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue(
        "--parallax-y",
      ),
    ) || 0;
  petals.forEach((petal) => {
    updatePetal(petal, el.width, el.height, parallaxX);
    const offsetX = parallaxX * 20 * (petal.stuck ? 0.2 : 1);
    const offsetY = parallaxY * 15 * (petal.stuck ? 0.3 : 1);
    context.save();
    context.translate(offsetX, offsetY);
    drawPetal(petal);
    context.restore();
  });
  frameId = requestAnimationFrame(render);
};

onMounted(() => {
  const el = canvas.value;
  if (!el) return;
  ctx = el.getContext("2d");
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);
  frameId = requestAnimationFrame(render);
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", resizeCanvas);
  cancelAnimationFrame(frameId);
});

watch(
  () => theme.current,
  () => {
    // force redraw with new palette
    petals = petals.map((petal) => ({ ...petal }));
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

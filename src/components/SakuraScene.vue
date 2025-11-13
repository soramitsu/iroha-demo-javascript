<template>
  <canvas ref="canvas" class="sakura-layer"></canvas>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { useThemeStore } from '@/stores/theme'

const canvas = ref<HTMLCanvasElement | null>(null)
const theme = useThemeStore()

interface Petal {
  x: number
  y: number
  size: number
  speedY: number
  speedX: number
  rotation: number
  rotationSpeed: number
  sway: number
  stuck: boolean
  stickSide: 'left' | 'right' | null
}

let ctx: CanvasRenderingContext2D | null = null
let petals: Petal[] = []
let frameId = 0
const MAX_PETALS = 55

const petalColor = () =>
  theme.current === 'dark'
    ? ['rgba(255, 204, 218, 0.9)', 'rgba(255, 162, 196, 0.7)']
    : ['rgba(255, 186, 205, 0.95)', 'rgba(255, 223, 235, 0.8)']

const createPetal = (width: number, height: number): Petal => ({
  x: Math.random() * width,
  y: Math.random() * height,
  size: 8 + Math.random() * 8,
  speedY: 0.4 + Math.random() * 1.2,
  speedX: -0.5 + Math.random() * 1.0,
  rotation: Math.random() * Math.PI * 2,
  rotationSpeed: -0.01 + Math.random() * 0.02,
  sway: 0.5 + Math.random() * 0.8,
  stuck: false,
  stickSide: null
})

const resizeCanvas = () => {
  const el = canvas.value
  if (!el) return
  el.width = window.innerWidth
  el.height = window.innerHeight
  if (petals.length === 0) {
    petals = Array.from({ length: MAX_PETALS }, () => createPetal(el.width, el.height))
  }
}

const drawPetal = (petal: Petal) => {
  if (!ctx) return
  const [outer, inner] = petalColor()
  ctx.save()
  ctx.translate(petal.x, petal.y)
  ctx.rotate(petal.rotation)
  const gradient = ctx.createLinearGradient(0, -petal.size, 0, petal.size)
  gradient.addColorStop(0, outer)
  gradient.addColorStop(1, inner)
  ctx.fillStyle = gradient
  ctx.beginPath()
  const width = petal.size * 0.6
  const height = petal.size * 1.2
  ctx.moveTo(0, -height)
  ctx.bezierCurveTo(width, -height, width * 1.4, -height * 0.2, width * 0.5, height * 0.2)
  ctx.bezierCurveTo(width * 0.3, height * 0.5, width * 0.1, height * 0.9, 0, height)
  ctx.bezierCurveTo(-width * 0.1, height * 0.9, -width * 0.3, height * 0.5, -width * 0.5, height * 0.2)
  ctx.bezierCurveTo(-width * 1.4, -height * 0.2, -width, -height, 0, -height)
  ctx.fill()
  ctx.restore()
}

const updatePetal = (petal: Petal, width: number, height: number, parallaxX: number) => {
  const wind = parallaxX * 1.5
  if (petal.stuck) {
    petal.y += petal.speedY * 1.4
    petal.x = petal.stickSide === 'left' ? petal.size : width - petal.size
    if (Math.abs(parallaxX) < 0.12) {
      petal.stuck = false
      petal.stickSide = null
    }
  } else {
    petal.y += petal.speedY
    petal.x += petal.speedX + wind + Math.sin(petal.y / 40) * petal.sway * 0.3
    if (Math.abs(parallaxX) > 0.2) {
      if (petal.x < petal.size * 1.5 && parallaxX < 0) {
        petal.stuck = true
        petal.stickSide = 'left'
        petal.x = petal.size
      } else if (petal.x > width - petal.size * 1.5 && parallaxX > 0) {
        petal.stuck = true
        petal.stickSide = 'right'
        petal.x = width - petal.size
      }
    }
  }
  petal.rotation += petal.rotationSpeed
  if (petal.y > height + petal.size) {
    petal.y = -petal.size
    petal.x = Math.random() * width
    petal.stuck = false
    petal.stickSide = null
  }
  if (!petal.stuck) {
    if (petal.x > width + petal.size) {
      petal.x = -petal.size
    } else if (petal.x < -petal.size) {
      petal.x = width + petal.size
    }
  }
}

const render = () => {
  const el = canvas.value
  if (!ctx || !el) return
  ctx.clearRect(0, 0, el.width, el.height)
  const parallaxX = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--parallax-x')) || 0
  const parallaxY = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--parallax-y')) || 0
  petals.forEach((petal) => {
    updatePetal(petal, el.width, el.height, parallaxX)
    const offsetX = parallaxX * 20 * (petal.stuck ? 0.2 : 1)
    const offsetY = parallaxY * 15 * (petal.stuck ? 0.3 : 1)
    ctx.save()
    ctx.translate(offsetX, offsetY)
    drawPetal(petal)
    ctx.restore()
  })
  frameId = requestAnimationFrame(render)
}

onMounted(() => {
  const el = canvas.value
  if (!el) return
  ctx = el.getContext('2d')
  resizeCanvas()
  window.addEventListener('resize', resizeCanvas)
  frameId = requestAnimationFrame(render)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', resizeCanvas)
  cancelAnimationFrame(frameId)
})

watch(
  () => theme.current,
  () => {
    // force redraw with new palette
    petals = petals.map((petal) => ({ ...petal }))
  }
)
</script>

<style scoped>
.sakura-layer {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
}
</style>

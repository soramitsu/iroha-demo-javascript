/*
 * Sakura petal model for the decorative background scene.
 *
 * Each petal is a thin, cupped Somei Yoshino blade that tumbles in 3D. It is
 * lit by the same rig as the workspace's global illumination tokens
 * (`src/styles/tokens.css`): a cool key light from the upper left, a coral
 * bounce from the upper right, and a quiet fill rising from below. Shadows fall
 * toward the lower right, matching the tokens' occlusion offsets. Orthographic
 * projection of a planar petal is an affine map, so every petal is drawn with
 * one canvas transform plus a few gradients.
 *
 * Screen space is +x right, +y down, +z toward the viewer. Petal space has the
 * notched apex at y = -0.5, the claw at y = +0.5 and the inner (front) face
 * toward +z. One petal-space unit is the petal length.
 */

export type SakuraTheme = "dark" | "light";
export type Vec3 = readonly [number, number, number];
export type Rgb = readonly [number, number, number];
/** Row-major rotation from petal space to screen space. */
export type Mat3 = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];
export type SakuraPath = Pick<
  CanvasPath,
  "moveTo" | "bezierCurveTo" | "quadraticCurveTo"
>;

export interface SakuraLight {
  /** Unit vector from the petal toward the light. */
  direction: Vec3;
  color: Rgb;
  intensity: number;
}

export interface SakuraPalette {
  /** Light scattered inside the blade; it keeps shaded petals pink, not grey. */
  ambient: Omit<SakuraLight, "direction">;
  /** The key light comes first; it also places the satin glint. */
  lights: readonly [SakuraLight, ...SakuraLight[]];
  /** Share of light that passes through a petal lit from behind. */
  transmission: number;
  sheen: number;
  frontPale: Rgb;
  frontPink: Rgb;
  backPale: Rgb;
  backPink: Rgb;
  clawPale: Rgb;
  clawDeep: Rgb;
  vein: Rgb;
  veinAlpha: number;
  occlusion: Rgb;
  occlusionAlpha: number;
}

export interface SakuraPetalShape {
  /** Width divided by length. */
  aspect: number;
  notchDepth: number;
  /** Sideways notch offset as a fraction of the half width. */
  notchOffset: number;
  leftCrestDrop: number;
  rightCrestDrop: number;
  /** Petal-space y of the widest point. */
  shoulder: number;
  /** Claw half width as a fraction of the half width. */
  claw: number;
  /** Rise of the side edges toward the inner face. */
  cup: number;
  /** Lengthwise bend; negative values reflex the apex backwards. */
  curl: number;
  veins: number;
}

export interface SakuraPetal {
  x: number;
  y: number;
  /** Wind-driven horizontal velocity in CSS px per 60 Hz frame. */
  vx: number;
  /** 0 drifts against the wall, 1 floats nearest the viewer. */
  depth: number;
  /** Petal length in CSS px. */
  size: number;
  alpha: number;
  /** Fall speed in CSS px per 60 Hz frame. */
  fall: number;
  shape: SakuraPetalShape;
  /** 0 is a pale Somei Yoshino petal, 1 a deeper pink one. */
  tint: number;
  blushLevel: number;
  /** Tumblers spin through both faces; flutterers rock and glide. */
  tumbling: boolean;
  roll: number;
  rollBase: number;
  rollRate: number;
  rollAmplitude: number;
  pitch: number;
  pitchBase: number;
  pitchAmplitude: number;
  pitchPhase: number;
  spin: number;
  spinBase: number;
  spinRate: number;
  bank: number;
  swayPhase: number;
  swayRate: number;
  swayAmplitude: number;
  rotation: Mat3;
  stuck: boolean;
  stickSide: "left" | "right" | null;
}

export interface SakuraGlint {
  x: number;
  y: number;
  radius: number;
  strength: number;
}

export interface SakuraShading {
  front: boolean;
  /** Lit colors at the left edge, midline and right edge of the petal. */
  across: readonly [Rgb, Rgb, Rgb];
  glint: SakuraGlint | null;
}

export interface SakuraPaint {
  palette: SakuraPalette;
  blush: CanvasGradient[];
  veins: CanvasGradient;
  shadow: HTMLCanvasElement | null;
}

export interface SakuraStepEnvironment {
  width: number;
  height: number;
  parallaxX: number;
  /** Scene time in seconds. */
  time: number;
  frameScale: number;
  random?: () => number;
}

const normalize = (x: number, y: number, z: number): Vec3 => {
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
};

const dot = (left: Vec3, right: Vec3) =>
  left[0] * right[0] + left[1] * right[1] + left[2] * right[2];

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const mixRgb = (from: Rgb, to: Rgb, amount: number): Rgb => [
  from[0] + (to[0] - from[0]) * amount,
  from[1] + (to[1] - from[1]) * amount,
  from[2] + (to[2] - from[2]) * amount,
];

const rgb = (color: Rgb) =>
  `rgb(${Math.round(color[0])}, ${Math.round(color[1])}, ${Math.round(color[2])})`;

const WHITE: Rgb = [255, 255, 255];
const VIEWER: Vec3 = [0, 0, 1];

export const SAKURA_KEY_LIGHT = normalize(-0.5, -0.6, 0.62);
const CORAL_BOUNCE = normalize(0.68, -0.38, 0.62);
const FILL_LIGHT = normalize(0.04, 0.82, 0.57);
const KEY_HALF_VECTOR = normalize(
  SAKURA_KEY_LIGHT[0] + VIEWER[0],
  SAKURA_KEY_LIGHT[1] + VIEWER[1],
  SAKURA_KEY_LIGHT[2] + VIEWER[2],
);
/** Direction shadows travel across the wall, away from the key light. */
export const SAKURA_SHADOW_DIRECTION = ((): readonly [number, number] => {
  const length = Math.hypot(SAKURA_KEY_LIGHT[0], SAKURA_KEY_LIGHT[1]);
  return [-SAKURA_KEY_LIGHT[0] / length, -SAKURA_KEY_LIGHT[1] / length];
})();

export const SAKURA_PALETTES: Readonly<Record<SakuraTheme, SakuraPalette>> = {
  dark: {
    ambient: { color: [255, 214, 230], intensity: 0.36 },
    lights: [
      { direction: SAKURA_KEY_LIGHT, color: [236, 240, 255], intensity: 0.6 },
      { direction: CORAL_BOUNCE, color: [255, 104, 104], intensity: 0.24 },
      { direction: FILL_LIGHT, color: [150, 160, 198], intensity: 0.14 },
    ],
    transmission: 0.6,
    sheen: 0.55,
    frontPale: [255, 226, 237],
    frontPink: [255, 192, 218],
    backPale: [252, 226, 236],
    backPink: [248, 200, 220],
    clawPale: [250, 204, 222],
    clawDeep: [228, 120, 164],
    vein: [214, 120, 160],
    veinAlpha: 0.26,
    occlusion: [0, 0, 0],
    occlusionAlpha: 0.55,
  },
  light: {
    ambient: { color: [255, 222, 234], intensity: 0.46 },
    lights: [
      { direction: SAKURA_KEY_LIGHT, color: [255, 255, 255], intensity: 0.52 },
      { direction: CORAL_BOUNCE, color: [255, 96, 96], intensity: 0.18 },
      { direction: FILL_LIGHT, color: [226, 216, 222], intensity: 0.18 },
    ],
    transmission: 0.45,
    sheen: 0.45,
    frontPale: [252, 216, 230],
    frontPink: [248, 180, 206],
    backPale: [250, 220, 232],
    backPink: [244, 190, 212],
    clawPale: [244, 186, 210],
    clawDeep: [212, 96, 142],
    vein: [200, 100, 145],
    veinAlpha: 0.28,
    occlusion: [73, 55, 64],
    occlusionAlpha: 0.34,
  },
};

export const SAKURA_BLUSH_LEVELS = 4;
/** Wrapped diffuse keeps thin petals from going flat black at grazing light. */
const DIFFUSE_WRAP = 0.3;
const SHEEN_EXPONENT = 14;
const MIN_EDGE_ON_WIDTH = 0.16;
const VEIN_MIN_SIZE = 18;
const SHADOW_SPRITE_SIZE = 64;

/** Rotation for a petal rolled about its length, pitched, then spun in-plane. */
export const sakuraPetalRotation = (
  roll: number,
  pitch: number,
  spin: number,
): Mat3 => {
  const cr = Math.cos(roll);
  const sr = Math.sin(roll);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const cs = Math.cos(spin);
  const ss = Math.sin(spin);
  return [
    cs * cr - ss * sp * sr,
    -ss * cp,
    cs * sr + ss * sp * cr,
    ss * cr + cs * sp * sr,
    cs * cp,
    ss * sr - cs * sp * cr,
    -cp * sr,
    sp,
    cp * cr,
  ];
};

/**
 * Screen axes of the projected petal as canvas transform coefficients. A petal
 * seen exactly edge-on keeps a thin crescent, as its cupped blade would.
 */
export const projectSakuraPetal = (
  rotation: Mat3,
): [number, number, number, number] => {
  let a = rotation[0];
  let b = rotation[3];
  const c = rotation[1];
  const d = rotation[4];
  const width = Math.hypot(a, b);
  if (width < MIN_EDGE_ON_WIDTH) {
    if (width > 1e-6) {
      a *= MIN_EDGE_ON_WIDTH / width;
      b *= MIN_EDGE_ON_WIDTH / width;
    } else {
      const length = Math.hypot(c, d) || 1;
      a = (d / length) * MIN_EDGE_ON_WIDTH;
      b = (-c / length) * MIN_EDGE_ON_WIDTH;
    }
  }
  return [a, b, c, d];
};

/**
 * Unit normal of the visible face at petal-space point (u · half width, v).
 * `facing` is 1 for the inner face and -1 when the back of the petal shows.
 */
export const sakuraSurfaceNormal = (
  rotation: Mat3,
  shape: SakuraPetalShape,
  u: number,
  v: number,
  facing: 1 | -1,
): Vec3 => {
  const halfWidth = shape.aspect / 2;
  const lx = (-2 * shape.cup * u) / halfWidth;
  const ly = -8 * shape.curl * v;
  const nx = rotation[0] * lx + rotation[1] * ly + rotation[2];
  const ny = rotation[3] * lx + rotation[4] * ly + rotation[5];
  const nz = rotation[6] * lx + rotation[7] * ly + rotation[8];
  const length = Math.hypot(nx, ny, nz) || 1;
  return [
    (facing * nx) / length,
    (facing * ny) / length,
    (facing * nz) / length,
  ];
};

/**
 * Shades one surface sample. Light reaching the hidden face passes through
 * the petal and is filtered by its pigment twice, so backlit petals glow a
 * deeper pink instead of going dark.
 */
export const litSakuraColor = (
  normal: Vec3,
  albedo: Rgb,
  palette: SakuraPalette,
): Rgb => {
  const { ambient } = palette;
  const reflected = ambient.color.map(
    (channel) => (channel / 255) * ambient.intensity,
  );
  const transmitted = [0, 0, 0];
  for (const light of palette.lights) {
    const incidence = dot(normal, light.direction);
    const diffuse =
      Math.max(0, (incidence + DIFFUSE_WRAP) / (1 + DIFFUSE_WRAP)) *
      light.intensity;
    const through =
      Math.max(0, -incidence) * light.intensity * palette.transmission;
    for (let channel = 0; channel < 3; channel += 1) {
      const color = light.color[channel] / 255;
      reflected[channel] += diffuse * color;
      transmitted[channel] += through * color;
    }
  }
  const shade = (channel: number) =>
    clamp(
      albedo[channel] *
        (reflected[channel] + (transmitted[channel] * albedo[channel]) / 255),
      0,
      255,
    );
  return [shade(0), shade(1), shade(2)];
};

/**
 * Places the key light's satin highlight where the cupped blade's normal
 * meets the half vector, so the sheen slides across the petal as it turns.
 */
export const sakuraGlint = (
  rotation: Mat3,
  shape: SakuraPetalShape,
  facing: 1 | -1,
  palette: SakuraPalette,
): SakuraGlint | null => {
  const half = KEY_HALF_VECTOR;
  const hx =
    facing *
    (rotation[0] * half[0] + rotation[3] * half[1] + rotation[6] * half[2]);
  const hy =
    facing *
    (rotation[1] * half[0] + rotation[4] * half[1] + rotation[7] * half[2]);
  const hz =
    facing *
    (rotation[2] * half[0] + rotation[5] * half[1] + rotation[8] * half[2]);
  if (hz <= 0.05) {
    return null;
  }
  const halfWidth = shape.aspect / 2;
  const u = clamp(
    shape.cup > 1e-3 ? ((-hx / hz) * halfWidth) / (2 * shape.cup) : 0,
    -0.78,
    0.78,
  );
  const v = clamp(
    Math.abs(shape.curl) > 1e-3 ? -hy / hz / (8 * shape.curl) : -0.12,
    -0.34,
    0.26,
  );
  const normal = sakuraSurfaceNormal(rotation, shape, u, v, facing);
  const strength =
    palette.sheen *
    palette.lights[0].intensity *
    Math.max(0, dot(normal, half)) ** SHEEN_EXPONENT;
  if (strength < 0.015) {
    return null;
  }
  return { x: u * halfWidth, y: v, radius: 0.34, strength };
};

export const shadeSakuraPetal = (
  petal: Pick<SakuraPetal, "rotation" | "shape" | "tint">,
  palette: SakuraPalette,
): SakuraShading => {
  const { rotation, shape, tint } = petal;
  const front = rotation[8] >= 0;
  const facing = front ? 1 : -1;
  const albedo = front
    ? mixRgb(palette.frontPale, palette.frontPink, tint)
    : mixRgb(palette.backPale, palette.backPink, tint);
  const sample = (u: number) =>
    litSakuraColor(
      sakuraSurfaceNormal(rotation, shape, u, -0.08, facing),
      albedo,
      palette,
    );
  return {
    front,
    across: [sample(-0.84), sample(0), sample(0.84)],
    glint: sakuraGlint(rotation, shape, facing, palette),
  };
};

const CLAW_Y = 0.43;

/**
 * Traces the obovate Somei Yoshino outline: a broad, rounded apex with a small
 * V notch, the widest point a little above the middle, and a wedge-shaped base
 * that narrows into a short claw.
 */
export const traceSakuraPetalOutline = (
  path: SakuraPath,
  shape: SakuraPetalShape,
) => {
  const w = shape.aspect / 2;
  const notchX = shape.notchOffset * w;
  const notchY = -0.5 + shape.notchDepth;
  const clawX = shape.claw * w;
  const shoulder = shape.shoulder;
  const side = (sign: 1 | -1, crestDrop: number) => {
    const crestX = notchX + sign * 0.22 * w;
    const crestY = -0.5 + crestDrop;
    const edgeX = sign * w;
    const baseX = sign * clawX;
    return {
      notchControl: [notchX + sign * 0.05 * w, notchY - 0.04],
      crestControl: [crestX - sign * 0.08 * w, crestY],
      crest: [crestX, crestY],
      apexControl: [crestX + 0.55 * (edgeX - crestX), crestY],
      shoulderTop: [edgeX, shoulder - 0.55 * (shoulder - crestY)],
      shoulder: [edgeX, shoulder],
      shoulderBottom: [edgeX, shoulder + 0.5 * (CLAW_Y - shoulder)],
      wedge: [
        baseX + 0.3 * (edgeX - baseX),
        CLAW_Y - 0.2 * (CLAW_Y - shoulder),
      ],
      claw: [baseX, CLAW_Y],
      clawControl: [baseX * 0.92, 0.47],
      tipControl: [baseX * 0.6, 0.5],
    } as const;
  };
  const right = side(1, shape.rightCrestDrop);
  const left = side(-1, shape.leftCrestDrop);

  path.moveTo(notchX, notchY);
  path.bezierCurveTo(
    ...right.notchControl,
    ...right.crestControl,
    ...right.crest,
  );
  path.bezierCurveTo(
    ...right.apexControl,
    ...right.shoulderTop,
    ...right.shoulder,
  );
  path.bezierCurveTo(...right.shoulderBottom, ...right.wedge, ...right.claw);
  path.bezierCurveTo(...right.clawControl, ...right.tipControl, 0, 0.5);
  path.bezierCurveTo(...left.tipControl, ...left.clawControl, ...left.claw);
  path.bezierCurveTo(...left.wedge, ...left.shoulderBottom, ...left.shoulder);
  path.bezierCurveTo(...left.shoulderTop, ...left.apexControl, ...left.crest);
  path.bezierCurveTo(
    ...left.crestControl,
    ...left.notchControl,
    notchX,
    notchY,
  );
};

/** Fine veins fan from the claw and fade out short of the apex margin. */
export const traceSakuraPetalVeins = (
  path: SakuraPath,
  shape: SakuraPetalShape,
) => {
  const w = shape.aspect / 2;
  const count = Math.max(1, Math.round(shape.veins));
  for (let index = 0; index < count; index += 1) {
    const t = count === 1 ? 0 : (index / (count - 1)) * 2 - 1;
    const angle = t * 1.2;
    const endX =
      0.8 * w * Math.sin(angle) + shape.notchOffset * w * (1 - t * t);
    const endY = -0.04 - 0.36 * Math.cos(angle);
    path.moveTo(0, CLAW_Y);
    path.quadraticCurveTo(endX * 0.42, 0.12, endX, endY);
  }
};

/** Slow gusts plus a gentle shear, in CSS px per frame for the nearest petals. */
export const sakuraWind = (time: number, y: number) => {
  const gust =
    0.55 * Math.sin(time * 0.23 + 1.3) +
    0.3 * Math.sin(time * 0.51 + 0.4) +
    0.15 * Math.sin(time * 1.37 + 2.2);
  return 0.32 * gust + 0.1 * Math.sin(y / 170 + time * 0.6);
};

export const createSakuraPetalShape = (
  random: () => number = Math.random,
): SakuraPetalShape => {
  const between = (min: number, max: number) => min + (max - min) * random();
  return {
    aspect: between(0.72, 0.86),
    notchDepth: between(0.05, 0.09),
    notchOffset: between(-0.08, 0.08),
    leftCrestDrop: between(0, 0.03),
    rightCrestDrop: between(0, 0.03),
    shoulder: between(-0.12, 0),
    claw: between(0.12, 0.17),
    cup: between(0.07, 0.13),
    curl: between(-0.02, 0.035),
    veins: 7 + Math.floor(random() * 4),
  };
};

export const createSakuraPetal = (
  width: number,
  height: number,
  random: () => number = Math.random,
): SakuraPetal => {
  const between = (min: number, max: number) => min + (max - min) * random();
  // Most petals sit deep in the scene; a few drift close to the glass.
  const depth = random() ** 1.15;
  const pace = 0.55 + 0.75 * depth;
  const tumbling = random() < 0.45;
  const backFacing = random() < 0.3;
  const rollBase = (random() - 0.5) * 0.9 + (backFacing ? Math.PI : 0);
  const rollAmplitude = tumbling ? 0 : between(0.35, 0.8);
  const rollRate = tumbling
    ? (random() < 0.5 ? -1 : 1) * between(0.012, 0.042)
    : 0;
  const pitchBase = (random() - 0.5) * 0.5;
  const pitchAmplitude = between(0.15, 0.55);
  const pitchPhase = random() * Math.PI * 2;
  const spinBase = random() * Math.PI * 2;
  const spinRate = (random() - 0.5) * 0.016;
  const bank = tumbling ? 0 : between(0.2, 0.45);
  const swayPhase = random() * Math.PI * 2;
  const roll = tumbling
    ? rollBase
    : rollBase + rollAmplitude * Math.sin(swayPhase);
  const pitch =
    pitchBase + pitchAmplitude * Math.sin(swayPhase * 0.6 + pitchPhase);
  const spin = spinBase + bank * Math.cos(swayPhase);
  return {
    x: random() * width,
    y: random() * height,
    vx: 0,
    depth,
    size: (15 + 23 * depth) * between(0.86, 1.14),
    alpha: 0.68 + 0.3 * depth,
    fall: (0.38 + 0.9 * depth) * between(0.85, 1.15),
    shape: createSakuraPetalShape(random),
    tint: random() ** 1.6,
    blushLevel: Math.min(
      SAKURA_BLUSH_LEVELS - 1,
      Math.floor(random() * SAKURA_BLUSH_LEVELS),
    ),
    tumbling,
    roll,
    rollBase,
    rollRate,
    rollAmplitude,
    pitch,
    pitchBase,
    pitchAmplitude,
    pitchPhase,
    spin,
    spinBase,
    spinRate,
    bank,
    swayPhase,
    swayRate: between(0.016, 0.03),
    swayAmplitude: (tumbling ? 0.12 : 0.3) * pace * between(0.7, 1.3),
    rotation: sakuraPetalRotation(roll, pitch, spin),
    stuck: false,
    stickSide: null,
  };
};

const nearestFaceOn = (roll: number) => Math.round(roll / Math.PI) * Math.PI;

/**
 * Advances one petal. Wind pushes with inertia, broadside petals sink slower
 * than edge-on ones, and flutterers slow at the ends of each swing. Strong
 * pointer wind pins petals flat against the windward wall until it calms.
 */
export const stepSakuraPetal = (
  petal: SakuraPetal,
  environment: SakuraStepEnvironment,
) => {
  const { width, height, parallaxX, time, frameScale } = environment;
  const random = environment.random ?? Math.random;
  const margin = petal.size * 0.5;
  if (petal.stuck) {
    petal.y += petal.fall * 1.4 * frameScale;
    petal.x = petal.stickSide === "left" ? margin : width - margin;
    petal.vx = 0;
    const settle = 1 - Math.exp(-0.12 * frameScale);
    petal.roll += (nearestFaceOn(petal.roll) - petal.roll) * settle;
    petal.pitch -= petal.pitch * settle;
    if (Math.abs(parallaxX) < 0.12) {
      // Rebase the free motion on the settled pose so release is seamless.
      petal.stuck = false;
      petal.stickSide = null;
      petal.rollBase = petal.tumbling
        ? petal.roll
        : petal.roll - petal.rollAmplitude * Math.sin(petal.swayPhase);
      petal.pitchBase = clamp(
        petal.pitch -
          petal.pitchAmplitude *
            Math.sin(petal.swayPhase * 0.6 + petal.pitchPhase),
        -0.6,
        0.6,
      );
      petal.spinBase = petal.spin - petal.bank * Math.cos(petal.swayPhase);
    }
  } else {
    const pace = 0.55 + 0.75 * petal.depth;
    petal.swayPhase += petal.swayRate * frameScale;
    const swing = Math.cos(petal.swayPhase);
    petal.spinBase += petal.spinRate * frameScale;
    if (petal.tumbling) {
      petal.rollBase += petal.rollRate * frameScale;
      petal.roll = petal.rollBase;
    } else {
      petal.roll =
        petal.rollBase + petal.rollAmplitude * Math.sin(petal.swayPhase);
    }
    petal.spin = petal.spinBase + petal.bank * swing;
    petal.pitch =
      petal.pitchBase +
      petal.pitchAmplitude * Math.sin(petal.swayPhase * 0.6 + petal.pitchPhase);
    const target = (sakuraWind(time, petal.y) + parallaxX * 1.5) * pace;
    petal.vx += (target - petal.vx) * (1 - Math.exp(-frameScale / 40));
    const broadside = Math.abs(petal.rotation[5]);
    const glide = petal.tumbling ? 1 : 0.72 + 0.28 * swing * swing;
    petal.y += petal.fall * (1.12 - 0.34 * broadside) * glide * frameScale;
    petal.x += (petal.vx + petal.swayAmplitude * swing) * frameScale;
    if (Math.abs(parallaxX) > 0.2) {
      if (petal.x < margin * 1.5 && parallaxX < 0) {
        petal.stuck = true;
        petal.stickSide = "left";
        petal.x = margin;
      } else if (petal.x > width - margin * 1.5 && parallaxX > 0) {
        petal.stuck = true;
        petal.stickSide = "right";
        petal.x = width - margin;
      }
    }
  }
  if (petal.y > height + petal.size) {
    petal.y = -petal.size;
    petal.x = random() * width;
    petal.vx = 0;
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
  petal.rotation = sakuraPetalRotation(petal.roll, petal.pitch, petal.spin);
};

const createShadowSprite = (
  palette: SakuraPalette,
  createCanvas: () => HTMLCanvasElement,
) => {
  const sprite = createCanvas();
  sprite.width = SHADOW_SPRITE_SIZE;
  sprite.height = SHADOW_SPRITE_SIZE;
  const context = sprite.getContext("2d");
  if (!context) {
    return null;
  }
  const center = SHADOW_SPRITE_SIZE / 2;
  const [r, g, b] = palette.occlusion;
  const gradient = context.createRadialGradient(
    center,
    center,
    0,
    center,
    center,
    center,
  );
  gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 1)`);
  gradient.addColorStop(0.45, `rgba(${r}, ${g}, ${b}, 0.6)`);
  gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
  // Squash the soft blob to a petal's proportions.
  context.setTransform(0.8, 0, 0, 1, center * 0.2, 0);
  context.fillStyle = gradient;
  context.fillRect(0, 0, SHADOW_SPRITE_SIZE, SHADOW_SPRITE_SIZE);
  return sprite;
};

/** Theme-bound gradients and the occlusion sprite shared by every petal. */
export const createSakuraPaint = (
  context: CanvasRenderingContext2D,
  theme: SakuraTheme,
  createCanvas: () => HTMLCanvasElement = () =>
    document.createElement("canvas"),
): SakuraPaint => {
  const palette = SAKURA_PALETTES[theme];
  const blush = Array.from({ length: SAKURA_BLUSH_LEVELS }, (_, level) => {
    const deep = mixRgb(
      palette.clawPale,
      palette.clawDeep,
      level / (SAKURA_BLUSH_LEVELS - 1),
    );
    const gradient = context.createLinearGradient(0, -0.5, 0, 0.5);
    gradient.addColorStop(0, rgb(WHITE));
    gradient.addColorStop(0.4, rgb(WHITE));
    gradient.addColorStop(0.78, rgb(mixRgb(WHITE, deep, 0.5)));
    gradient.addColorStop(1, rgb(deep));
    return gradient;
  });
  const [r, g, b] = palette.vein;
  const veins = context.createLinearGradient(0, CLAW_Y, 0, -0.42);
  veins.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${palette.veinAlpha})`);
  veins.addColorStop(0.6, `rgba(${r}, ${g}, ${b}, ${palette.veinAlpha * 0.6})`);
  veins.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
  return {
    palette,
    blush,
    veins,
    shadow: createShadowSprite(palette, createCanvas),
  };
};

/** Soft occlusion on the wall behind the petal, offset away from the key. */
export const drawSakuraShadow = (
  context: CanvasRenderingContext2D,
  petal: SakuraPetal,
  paint: SakuraPaint,
  pixelRatio: number,
  offsetX: number,
  offsetY: number,
) => {
  if (!paint.shadow) {
    return;
  }
  const [a, b, c, d] = projectSakuraPetal(petal.rotation);
  // Pinned petals touch the wall; free ones hover up to ~12px above it.
  const lift = petal.stuck ? 1 : 2 + 10 * petal.depth;
  const spread = petal.stuck ? 1 : 1.05 + 0.55 * petal.depth;
  const scale = petal.size * pixelRatio * spread;
  context.globalCompositeOperation = "source-over";
  context.globalAlpha =
    paint.palette.occlusionAlpha * petal.alpha * (1 - 0.5 * petal.depth);
  context.setTransform(
    a * scale,
    b * scale,
    c * scale,
    d * scale,
    (petal.x + offsetX + SAKURA_SHADOW_DIRECTION[0] * lift) * pixelRatio,
    (petal.y + offsetY + SAKURA_SHADOW_DIRECTION[1] * lift) * pixelRatio,
  );
  context.drawImage(paint.shadow, -0.6, -0.6, 1.2, 1.2);
};

export const drawSakuraPetal = (
  context: CanvasRenderingContext2D,
  petal: SakuraPetal,
  paint: SakuraPaint,
  pixelRatio: number,
  offsetX: number,
  offsetY: number,
) => {
  const { shape } = petal;
  const [a, b, c, d] = projectSakuraPetal(petal.rotation);
  const scale = petal.size * pixelRatio;
  context.setTransform(
    a * scale,
    b * scale,
    c * scale,
    d * scale,
    (petal.x + offsetX) * pixelRatio,
    (petal.y + offsetY) * pixelRatio,
  );
  const shading = shadeSakuraPetal(petal, paint.palette);
  const halfWidth = shape.aspect / 2;
  const body = context.createLinearGradient(-halfWidth, 0, halfWidth, 0);
  body.addColorStop(0, rgb(shading.across[0]));
  body.addColorStop(0.5, rgb(shading.across[1]));
  body.addColorStop(1, rgb(shading.across[2]));
  context.globalAlpha = petal.alpha;
  context.globalCompositeOperation = "source-over";
  context.fillStyle = body;
  context.beginPath();
  traceSakuraPetalOutline(context, shape);
  context.closePath();
  context.fill();
  // Pigment deepens toward the claw; multiplying keeps it inside the shading.
  context.globalCompositeOperation = "multiply";
  context.fillStyle = paint.blush[petal.blushLevel] ?? paint.blush[0];
  context.fill();
  if (shading.glint) {
    const { x, y, radius, strength } = shading.glint;
    const glint = context.createRadialGradient(x, y, 0, x, y, radius);
    glint.addColorStop(0, `rgba(255, 255, 255, ${strength.toFixed(3)})`);
    glint.addColorStop(1, "rgba(255, 255, 255, 0)");
    context.globalCompositeOperation = "source-over";
    context.fillStyle = glint;
    context.fill();
  }
  if (petal.size >= VEIN_MIN_SIZE) {
    context.globalCompositeOperation = "multiply";
    context.strokeStyle = paint.veins;
    context.lineWidth = (0.5 * pixelRatio) / scale;
    context.lineCap = "round";
    context.beginPath();
    traceSakuraPetalVeins(context, shape);
    context.stroke();
  }
  context.globalCompositeOperation = "source-over";
};

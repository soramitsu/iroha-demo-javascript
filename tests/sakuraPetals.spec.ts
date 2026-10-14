import { describe, expect, it, vi } from "vitest";
import {
  SAKURA_BLUSH_LEVELS,
  SAKURA_KEY_LIGHT,
  SAKURA_PALETTES,
  SAKURA_SHADOW_DIRECTION,
  createSakuraPaint,
  createSakuraPetal,
  createSakuraPetalShape,
  drawSakuraPetal,
  drawSakuraShadow,
  litSakuraColor,
  projectSakuraPetal,
  sakuraGlint,
  sakuraPetalRotation,
  sakuraSurfaceNormal,
  sakuraWind,
  shadeSakuraPetal,
  stepSakuraPetal,
  traceSakuraPetalOutline,
  traceSakuraPetalVeins,
  type Mat3,
  type Rgb,
  type SakuraPalette,
  type SakuraPetal,
  type SakuraPetalShape,
  type Vec3,
} from "@/utils/sakuraPetals";

const seededRandom = (seed: number) => {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const constant = (value: number) => () => value;

const SHAPE: SakuraPetalShape = {
  aspect: 0.8,
  notchDepth: 0.07,
  notchOffset: 0,
  leftCrestDrop: 0.01,
  rightCrestDrop: 0.02,
  shoulder: -0.06,
  claw: 0.15,
  cup: 0.1,
  curl: 0.02,
  veins: 9,
};

type PathCommand = { op: string; args: number[] };

const recordPath = () => {
  const commands: PathCommand[] = [];
  const record =
    (op: string) =>
    (...args: number[]) => {
      commands.push({ op, args });
    };
  return {
    commands,
    moveTo: record("moveTo"),
    bezierCurveTo: record("bezierCurveTo"),
    quadraticCurveTo: record("quadraticCurveTo"),
  };
};

const endpoint = (command: PathCommand) => command.args.slice(-2);

const multiply = (left: Mat3, right: Mat3) =>
  Array.from({ length: 9 }, (_, index) => {
    const row = Math.floor(index / 3);
    const col = index % 3;
    return (
      left[row * 3] * right[col] +
      left[row * 3 + 1] * right[3 + col] +
      left[row * 3 + 2] * right[6 + col]
    );
  });

const transpose = (matrix: Mat3): Mat3 => [
  matrix[0],
  matrix[3],
  matrix[6],
  matrix[1],
  matrix[4],
  matrix[7],
  matrix[2],
  matrix[5],
  matrix[8],
];

const luminance = (color: Rgb) =>
  0.2126 * color[0] + 0.7152 * color[1] + 0.0722 * color[2];

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

type CanvasContextMock = ReturnType<typeof createCanvasContext>;

const asContext = (context: CanvasContextMock) =>
  context as unknown as CanvasRenderingContext2D;

const createSprite = (context: CanvasContextMock | null) => {
  const sprite = document.createElement("canvas");
  vi.spyOn(sprite, "getContext").mockReturnValue(
    context as unknown as RenderingContext | null,
  );
  return sprite;
};

const stops = (gradient: ReturnType<typeof createGradient>) =>
  gradient.addColorStop.mock.calls.map(([, color]) => color);

const posedPetal = (overrides: Partial<SakuraPetal> = {}): SakuraPetal => {
  const petal = createSakuraPetal(400, 300, seededRandom(3));
  Object.assign(petal, overrides);
  petal.rotation = sakuraPetalRotation(petal.roll, petal.pitch, petal.spin);
  return petal;
};

describe("sakuraPetalRotation", () => {
  it("is the identity for an unrotated petal", () => {
    sakuraPetalRotation(0, 0, 0).forEach((value, index) => {
      expect(value).toBeCloseTo([1, 0, 0, 0, 1, 0, 0, 0, 1][index], 12);
    });
  });

  it("stays orthonormal and right-handed for arbitrary poses", () => {
    const random = seededRandom(11);
    for (let sample = 0; sample < 25; sample += 1) {
      const rotation = sakuraPetalRotation(
        (random() - 0.5) * 8,
        (random() - 0.5) * 3,
        (random() - 0.5) * 8,
      );
      multiply(rotation, transpose(rotation)).forEach((value, index) => {
        expect(value).toBeCloseTo(index % 4 === 0 ? 1 : 0, 10);
      });
      const [a, b, c, d, e, f, g, h, i] = rotation;
      const determinant =
        a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
      expect(determinant).toBeCloseTo(1, 10);
    }
  });

  it("spins in the canvas rotate() convention", () => {
    const angle = 0.7;
    const rotation = sakuraPetalRotation(0, 0, angle);
    expect(rotation[0]).toBeCloseTo(Math.cos(angle), 12);
    expect(rotation[1]).toBeCloseTo(-Math.sin(angle), 12);
    expect(rotation[3]).toBeCloseTo(Math.sin(angle), 12);
    expect(rotation[4]).toBeCloseTo(Math.cos(angle), 12);
  });

  it("turns the back of the petal toward the viewer after half a roll", () => {
    expect(sakuraPetalRotation(Math.PI, 0, 0)[8]).toBeCloseTo(-1, 12);
    expect(sakuraPetalRotation(0.4, 0.3, 2)[8]).toBeGreaterThan(0);
  });
});

describe("projectSakuraPetal", () => {
  it("uses the rotation's screen axes for an open petal", () => {
    const rotation = sakuraPetalRotation(0.5, 0.2, 1.1);
    const [a, b, c, d] = projectSakuraPetal(rotation);
    expect([a, b, c, d]).toEqual([
      rotation[0],
      rotation[3],
      rotation[1],
      rotation[4],
    ]);
  });

  it("keeps a thin crescent, across the length, when seen edge-on", () => {
    for (const roll of [Math.PI / 2, Math.PI / 2 - 0.05]) {
      const [a, b, c, d] = projectSakuraPetal(
        sakuraPetalRotation(roll, 0, 0.6),
      );
      expect(Math.hypot(a, b)).toBeCloseTo(0.16, 10);
      expect(Math.hypot(c, d)).toBeCloseTo(1, 10);
      expect(a * c + b * d).toBeCloseTo(0, 10);
    }
  });
});

describe("sakuraSurfaceNormal", () => {
  it("returns unit normals that face the viewer for an open front face", () => {
    const rotation = sakuraPetalRotation(0, 0, 0);
    for (const u of [-0.84, 0, 0.84]) {
      const normal = sakuraSurfaceNormal(rotation, SHAPE, u, -0.08, 1);
      expect(Math.hypot(...normal)).toBeCloseTo(1, 12);
      expect(normal[2]).toBeGreaterThan(0.9);
    }
  });

  it("tilts the raised edges of the cupped inner face toward the midline", () => {
    const rotation = sakuraPetalRotation(0, 0, 0);
    const flat = { ...SHAPE, curl: 0 };
    expect(sakuraSurfaceNormal(rotation, flat, -0.84, 0, 1)[0]).toBeGreaterThan(
      0,
    );
    expect(sakuraSurfaceNormal(rotation, flat, 0.84, 0, 1)[0]).toBeLessThan(0);
    sakuraSurfaceNormal(rotation, flat, 0, 0, 1).forEach((value, index) =>
      expect(value).toBeCloseTo([0, 0, 1][index], 12),
    );
  });

  it("flips to the back face's outward normal", () => {
    const rotation = sakuraPetalRotation(Math.PI, 0.2, 0.4);
    const back = sakuraSurfaceNormal(rotation, SHAPE, 0.3, -0.1, -1);
    const front = sakuraSurfaceNormal(rotation, SHAPE, 0.3, -0.1, 1);
    expect(back[2]).toBeGreaterThan(0);
    back.forEach((value, index) => expect(value).toBeCloseTo(-front[index]));
  });
});

describe("litSakuraColor", () => {
  const palette = SAKURA_PALETTES.dark;
  const albedo: Rgb = [255, 210, 228];

  it("brightens surfaces that face the key light", () => {
    const toward = litSakuraColor(SAKURA_KEY_LIGHT, albedo, palette);
    const away: Vec3 = [
      -SAKURA_KEY_LIGHT[0],
      -SAKURA_KEY_LIGHT[1],
      SAKURA_KEY_LIGHT[2],
    ];
    expect(luminance(toward)).toBeGreaterThan(
      luminance(litSakuraColor(away, albedo, palette)),
    );
  });

  it("keeps every channel inside the displayable range", () => {
    const blinding: SakuraPalette = {
      ...palette,
      ambient: { color: [255, 255, 255], intensity: 4 },
    };
    const lit = litSakuraColor([0, 0, 1], albedo, blinding);
    expect(lit).toEqual([255, 255, 255]);
    const dark: SakuraPalette = {
      ...palette,
      ambient: { color: [0, 0, 0], intensity: 0 },
      lights: [{ direction: [0, 0, 1], color: [255, 255, 255], intensity: 0 }],
    };
    expect(litSakuraColor([0, 0, 1], albedo, dark)).toEqual([0, 0, 0]);
  });

  it("filters backlight through the pigment twice", () => {
    const backlit: SakuraPalette = {
      ...palette,
      ambient: { color: [0, 0, 0], intensity: 0 },
      lights: [{ direction: [0, 0, -1], color: [255, 255, 255], intensity: 1 }],
      transmission: 0.5,
    };
    const glow = litSakuraColor([0, 0, 1], albedo, backlit);
    expect(glow[0] / glow[1]).toBeCloseTo((albedo[0] / albedo[1]) ** 2, 6);
    expect(glow[0]).toBeCloseTo(255 * 0.5, 6);
  });
});

describe("sakuraGlint", () => {
  const palette = SAKURA_PALETTES.dark;
  const toScreen = (rotation: Mat3, x: number, y: number) => [
    rotation[0] * x + rotation[1] * y,
    rotation[3] * x + rotation[4] * y,
  ];

  it("catches the key light low and right inside the cupped inner face", () => {
    const rotation = sakuraPetalRotation(0, 0, 0);
    const glint = sakuraGlint(rotation, SHAPE, 1, palette);
    expect(glint).not.toBeNull();
    const [x, y] = toScreen(rotation, glint!.x, glint!.y);
    expect(x).toBeGreaterThan(0);
    expect(y).toBeGreaterThan(0);
    expect(glint!.strength).toBeGreaterThan(0.1);
    expect(glint!.strength).toBeLessThanOrEqual(
      palette.sheen * palette.lights[0].intensity,
    );
  });

  it("moves to the upper left on the convex back face", () => {
    const rotation = sakuraPetalRotation(Math.PI, 0, 0);
    const glint = sakuraGlint(rotation, SHAPE, -1, palette);
    expect(glint).not.toBeNull();
    const [x, y] = toScreen(rotation, glint!.x, glint!.y);
    expect(x).toBeLessThan(0);
    expect(y).toBeLessThan(0);
  });

  it("stays inside the blade and vanishes when the face turns from the light", () => {
    const shallow = { ...SHAPE, cup: 0.0001, curl: 0 };
    const centered = sakuraGlint(sakuraPetalRotation(0, 0, 0), shallow, 1, {
      ...palette,
    });
    expect(centered!.x).toBeCloseTo(0, 12);
    expect(centered!.y).toBeCloseTo(-0.12, 12);

    const steep = sakuraGlint(
      sakuraPetalRotation(-0.7, 0, 0),
      SHAPE,
      1,
      palette,
    );
    expect(Math.abs(steep!.x)).toBeLessThanOrEqual(0.78 * (SHAPE.aspect / 2));

    expect(
      sakuraGlint(sakuraPetalRotation(1.5, 0, 0), SHAPE, 1, palette),
    ).toBeNull();
  });
});

describe("shadeSakuraPetal", () => {
  it("lights the face that shows and reports its glint", () => {
    const palette = SAKURA_PALETTES.light;
    const front = shadeSakuraPetal(
      { rotation: sakuraPetalRotation(0, 0, 0), shape: SHAPE, tint: 0 },
      palette,
    );
    const back = shadeSakuraPetal(
      { rotation: sakuraPetalRotation(Math.PI, 0, 0), shape: SHAPE, tint: 0 },
      palette,
    );
    expect(front.front).toBe(true);
    expect(back.front).toBe(false);
    expect(front.across).toHaveLength(3);
    expect(front.across).not.toEqual(back.across);
    expect(front.glint).not.toBeNull();
  });

  it("darkens petals tilted away from the key light", () => {
    const palette = SAKURA_PALETTES.dark;
    const toward = shadeSakuraPetal(
      { rotation: sakuraPetalRotation(-0.6, -0.3, 0), shape: SHAPE, tint: 0.5 },
      palette,
    );
    const away = shadeSakuraPetal(
      { rotation: sakuraPetalRotation(0.9, 0.5, 0), shape: SHAPE, tint: 0.5 },
      palette,
    );
    expect(luminance(toward.across[1])).toBeGreaterThan(
      luminance(away.across[1]),
    );
  });
});

describe("traceSakuraPetalOutline", () => {
  it("draws a closed, obovate outline with a V-notched apex and narrow claw", () => {
    const path = recordPath();
    traceSakuraPetalOutline(path, SHAPE);
    const w = SHAPE.aspect / 2;
    const [move, ...curves] = path.commands;

    expect(move).toEqual({ op: "moveTo", args: [0, -0.5 + SHAPE.notchDepth] });
    expect(curves).toHaveLength(8);
    expect(curves.every(({ op }) => op === "bezierCurveTo")).toBe(true);
    expect(endpoint(curves[7])).toEqual(move.args);

    const [rightCrest, rightShoulder, rightClaw, tip] = curves
      .slice(0, 4)
      .map(endpoint);
    const [leftClaw, leftShoulder, leftCrest] = curves
      .slice(4, 7)
      .map(endpoint);
    // Both lobes rise above the notch.
    expect(rightCrest[1]).toBeLessThan(move.args[1]);
    expect(leftCrest[1]).toBeLessThan(move.args[1]);
    expect(rightCrest[0]).toBeGreaterThan(0);
    expect(leftCrest[0]).toBeLessThan(0);
    // Widest at the shoulders, a little above the middle.
    expect(rightShoulder).toEqual([w, SHAPE.shoulder]);
    expect(leftShoulder).toEqual([-w, SHAPE.shoulder]);
    // The base narrows into a short claw that ends on the midline.
    expect(rightClaw[0]).toBeCloseTo(SHAPE.claw * w);
    expect(leftClaw[0]).toBeCloseTo(-SHAPE.claw * w);
    expect(tip).toEqual([0, 0.5]);

    const points = path.commands.flatMap(({ args }) =>
      args.flatMap((value, index) =>
        index % 2 === 0 ? [[value, args[index + 1]]] : [],
      ),
    );
    points.forEach(([x, y]) => {
      expect(Math.abs(x)).toBeLessThanOrEqual(w + 1e-12);
      expect(y).toBeGreaterThanOrEqual(-0.5);
      expect(y).toBeLessThanOrEqual(0.5);
    });
  });

  it("follows the petal's own asymmetry", () => {
    const path = recordPath();
    traceSakuraPetalOutline(path, { ...SHAPE, notchOffset: 0.08 });
    const [move, ...curves] = path.commands;
    expect(move.args[0]).toBeCloseTo(0.08 * (SHAPE.aspect / 2));
    expect(endpoint(curves[0])[1]).toBeCloseTo(-0.5 + SHAPE.rightCrestDrop);
    expect(endpoint(curves[6])[1]).toBeCloseTo(-0.5 + SHAPE.leftCrestDrop);
  });
});

describe("traceSakuraPetalVeins", () => {
  it("fans each vein from the claw to just inside the apex margin", () => {
    const path = recordPath();
    traceSakuraPetalVeins(path, SHAPE);
    const moves = path.commands.filter(({ op }) => op === "moveTo");
    const veins = path.commands.filter(({ op }) => op === "quadraticCurveTo");
    const w = SHAPE.aspect / 2;

    expect(moves).toHaveLength(SHAPE.veins);
    expect(veins).toHaveLength(SHAPE.veins);
    moves.forEach(({ args }) => expect(args).toEqual([0, 0.43]));
    const ends = veins.map(endpoint);
    ends.forEach(([x, y]) => {
      expect(Math.abs(x)).toBeLessThan(w);
      expect(y).toBeLessThan(0);
      expect(y).toBeGreaterThan(-0.5 + SHAPE.notchDepth);
    });
    expect(ends[0][0]).toBeLessThan(0);
    expect(ends.at(-1)![0]).toBeGreaterThan(0);
  });

  it("draws a single midline vein for a one-vein petal", () => {
    const path = recordPath();
    traceSakuraPetalVeins(path, { ...SHAPE, veins: 1 });
    expect(path.commands.map(({ op }) => op)).toEqual([
      "moveTo",
      "quadraticCurveTo",
    ]);
    expect(endpoint(path.commands[1])[0]).toBeCloseTo(0);
  });
});

describe("sakuraWind", () => {
  it("drifts in gentle, bounded, continuous gusts", () => {
    const samples = Array.from({ length: 600 }, (_, index) =>
      sakuraWind(index / 6, 240),
    );
    samples.forEach((value, index) => {
      expect(Math.abs(value)).toBeLessThanOrEqual(0.42);
      if (index > 0) {
        expect(Math.abs(value - samples[index - 1])).toBeLessThan(0.08);
      }
    });
    expect(Math.max(...samples) - Math.min(...samples)).toBeGreaterThan(0.2);
  });

  it("shears with height so a column of petals does not move in lockstep", () => {
    expect(sakuraWind(3, 0)).not.toBeCloseTo(sakuraWind(3, 400), 3);
  });
});

describe("createSakuraPetalShape", () => {
  it.each([0, 0.999999])(
    "keeps random draw %s inside the petal ranges",
    (value) => {
      const shape = createSakuraPetalShape(constant(value));
      expect(shape.aspect).toBeGreaterThanOrEqual(0.72);
      expect(shape.aspect).toBeLessThanOrEqual(0.86);
      expect(shape.notchDepth).toBeGreaterThanOrEqual(0.05);
      expect(shape.notchDepth).toBeLessThanOrEqual(0.09);
      expect(Math.abs(shape.notchOffset)).toBeLessThanOrEqual(0.08);
      expect(shape.shoulder).toBeLessThanOrEqual(0);
      expect(shape.claw).toBeLessThan(0.2);
      expect(shape.cup).toBeGreaterThan(0);
      expect(Number.isInteger(shape.veins)).toBe(true);
      expect(shape.veins).toBeGreaterThanOrEqual(7);
      expect(shape.veins).toBeLessThanOrEqual(10);
    },
  );
});

describe("createSakuraPetal", () => {
  it("starts inside the viewport with a consistent pose", () => {
    const random = seededRandom(5);
    for (let sample = 0; sample < 40; sample += 1) {
      const petal = createSakuraPetal(640, 480, random);
      expect(petal.x).toBeGreaterThanOrEqual(0);
      expect(petal.x).toBeLessThan(640);
      expect(petal.y).toBeGreaterThanOrEqual(0);
      expect(petal.y).toBeLessThan(480);
      expect(petal.depth).toBeGreaterThanOrEqual(0);
      expect(petal.depth).toBeLessThanOrEqual(1);
      expect(petal.blushLevel).toBeGreaterThanOrEqual(0);
      expect(petal.blushLevel).toBeLessThan(SAKURA_BLUSH_LEVELS);
      expect(petal.stuck).toBe(false);
      expect(petal.rotation).toEqual(
        sakuraPetalRotation(petal.roll, petal.pitch, petal.spin),
      );
      // Starting poses avoid edge-on slivers so static scenes read as petals.
      expect(Math.abs(Math.cos(petal.roll))).toBeGreaterThan(0.2);
    }
  });

  it("makes nearer petals larger, faster and more opaque", () => {
    const far = createSakuraPetal(640, 480, constant(0.05));
    const near = createSakuraPetal(640, 480, constant(0.95));
    expect(near.depth).toBeGreaterThan(far.depth);
    expect(near.size).toBeGreaterThan(far.size);
    expect(near.fall).toBeGreaterThan(far.fall);
    expect(near.alpha).toBeGreaterThan(far.alpha);
  });

  it("mixes tumbling and fluttering petals", () => {
    expect(createSakuraPetal(10, 10, constant(0.1)).tumbling).toBe(true);
    const flutterer = createSakuraPetal(10, 10, constant(0.9));
    expect(flutterer.tumbling).toBe(false);
    expect(flutterer.rollRate).toBe(0);
    expect(flutterer.rollAmplitude).toBeGreaterThan(0);
  });
});

describe("stepSakuraPetal", () => {
  const environment = {
    width: 400,
    height: 300,
    parallaxX: 0,
    time: 1,
    frameScale: 1,
    random: constant(0.5),
  };

  it("falls, tumbles and refreshes its rotation", () => {
    const petal = posedPetal({
      tumbling: true,
      rollRate: 0.03,
      roll: 0.4,
      rollBase: 0.4,
      y: 100,
    });
    const roll = petal.roll;
    stepSakuraPetal(petal, environment);
    expect(petal.y).toBeGreaterThan(100);
    expect(petal.y - 100).toBeLessThanOrEqual(petal.fall * 1.12);
    expect(petal.roll).toBeCloseTo(roll + 0.03);
    expect(petal.rotation).toEqual(
      sakuraPetalRotation(petal.roll, petal.pitch, petal.spin),
    );
  });

  it("rocks flutterers within their roll amplitude", () => {
    const petal = posedPetal({
      tumbling: false,
      rollBase: 0.2,
      rollAmplitude: 0.6,
      rollRate: 0,
    });
    for (let frame = 0; frame < 400; frame += 1) {
      stepSakuraPetal(petal, { ...environment, time: frame / 60 });
      expect(Math.abs(petal.roll - 0.2)).toBeLessThanOrEqual(0.6 + 1e-9);
    }
  });

  it("advances further on longer frames", () => {
    const short = posedPetal({ y: 50 });
    const long = posedPetal({ y: 50 });
    stepSakuraPetal(short, environment);
    stepSakuraPetal(long, { ...environment, frameScale: 3 });
    expect(long.y - 50).toBeGreaterThan(short.y - 50);
  });

  it("respawns above the viewport and wraps across the sides", () => {
    const fallen = posedPetal({ y: 300 + 200, x: 10, stuck: false });
    stepSakuraPetal(fallen, environment);
    expect(fallen.y).toBe(-fallen.size);
    expect(fallen.x).toBe(200);

    const drifting = posedPetal({ x: 400 + 100, y: 50 });
    stepSakuraPetal(drifting, environment);
    expect(drifting.x).toBe(-drifting.size);

    const backwards = posedPetal({ x: -100, y: 50 });
    stepSakuraPetal(backwards, environment);
    expect(backwards.x).toBe(400 + backwards.size);
  });

  it("pins petals flat against the windward wall until the wind calms", () => {
    const petal = posedPetal({ x: 2, y: 80, roll: 0.5, rollBase: 0.5 });
    const gusty = { ...environment, parallaxX: -0.5 };
    stepSakuraPetal(petal, gusty);
    expect(petal.stuck).toBe(true);
    expect(petal.stickSide).toBe("left");
    expect(petal.x).toBe(petal.size * 0.5);

    const y = petal.y;
    for (let frame = 0; frame < 60; frame += 1) {
      stepSakuraPetal(petal, gusty);
    }
    expect(petal.x).toBe(petal.size * 0.5);
    expect(petal.y).toBeCloseTo(y + petal.fall * 1.4 * 60);
    expect(Math.abs(Math.sin(petal.roll))).toBeLessThan(0.01);
    expect(Math.abs(petal.pitch)).toBeLessThan(0.01);

    // Mild wind keeps it pinned; calm air releases it from the settled pose.
    stepSakuraPetal(petal, { ...environment, parallaxX: -0.15 });
    expect(petal.stuck).toBe(true);
    const settled = { roll: petal.roll, spin: petal.spin };
    stepSakuraPetal(petal, environment);
    expect(petal.stuck).toBe(false);
    expect(petal.stickSide).toBeNull();
    stepSakuraPetal(petal, environment);
    expect(Math.abs(petal.roll - settled.roll)).toBeLessThan(0.1);
    expect(Math.abs(petal.spin - settled.spin)).toBeLessThan(0.1);
  });

  it("pins petals to the right wall when the wind blows right", () => {
    const petal = posedPetal({ x: 398, y: 80 });
    stepSakuraPetal(petal, { ...environment, parallaxX: 0.5 });
    expect(petal.stuck).toBe(true);
    expect(petal.stickSide).toBe("right");
    expect(petal.x).toBe(400 - petal.size * 0.5);
  });

  it("ignores the walls in light wind", () => {
    const petal = posedPetal({ x: 2, y: 80 });
    stepSakuraPetal(petal, { ...environment, parallaxX: -0.15 });
    expect(petal.stuck).toBe(false);
  });
});

describe("createSakuraPaint", () => {
  it.each(["dark", "light"] as const)(
    "prepares the %s theme's gradients and occlusion sprite",
    (theme) => {
      const context = createCanvasContext();
      const spriteContext = createCanvasContext();
      const sprite = createSprite(spriteContext);
      const paint = createSakuraPaint(asContext(context), theme, () => sprite);
      const palette = SAKURA_PALETTES[theme];

      expect(paint.palette).toBe(palette);
      expect(paint.blush).toHaveLength(SAKURA_BLUSH_LEVELS);
      const blushStops = context.createLinearGradient.mock.results
        .slice(0, SAKURA_BLUSH_LEVELS)
        .map(({ value }) => stops(value));
      expect(blushStops[0][0]).toBe("rgb(255, 255, 255)");
      expect(blushStops.at(-1)!.at(-1)).toBe(
        `rgb(${palette.clawDeep.join(", ")})`,
      );
      const veinStops = stops(
        context.createLinearGradient.mock.results[4].value,
      );
      expect(veinStops.at(-1)).toBe(`rgba(${palette.vein.join(", ")}, 0)`);

      expect(paint.shadow).toBe(sprite);
      expect(sprite.width).toBe(64);
      expect(sprite.height).toBe(64);
      expect(
        stops(spriteContext.createRadialGradient.mock.results[0].value)[0],
      ).toBe(`rgba(${palette.occlusion.join(", ")}, 1)`);
      expect(spriteContext.fillRect).toHaveBeenCalledWith(0, 0, 64, 64);
    },
  );

  it("skips the occlusion sprite when no 2D context is available", () => {
    const paint = createSakuraPaint(
      asContext(createCanvasContext()),
      "dark",
      () => createSprite(null),
    );
    expect(paint.shadow).toBeNull();
  });
});

describe("drawSakuraShadow", () => {
  const paintFor = (context: CanvasContextMock) =>
    createSakuraPaint(asContext(context), "light", () =>
      createSprite(createCanvasContext()),
    );

  it("casts a softer, longer shadow from petals floating nearer the viewer", () => {
    const context = createCanvasContext();
    const paint = paintFor(context);
    const alphas: number[] = [];
    const offsets: number[] = [];
    for (const depth of [0, 1]) {
      const petal = posedPetal({ depth, x: 100, y: 100, alpha: 1 });
      drawSakuraShadow(asContext(context), petal, paint, 2, 0, 0);
      alphas.push(context.globalAlpha);
      const [, , , , e, f] = context.setTransform.mock.lastCall!;
      const dx = e / 2 - 100;
      const dy = f / 2 - 100;
      // Shadows fall away from the upper-left key light.
      expect(dx).toBeGreaterThan(0);
      expect(dy).toBeGreaterThan(0);
      expect(dx / dy).toBeCloseTo(
        SAKURA_SHADOW_DIRECTION[0] / SAKURA_SHADOW_DIRECTION[1],
      );
      offsets.push(Math.hypot(dx, dy));
    }
    expect(alphas[1]).toBeLessThan(alphas[0]);
    expect(offsets[1]).toBeGreaterThan(offsets[0]);
    expect(context.drawImage).toHaveBeenCalledTimes(2);
    expect(context.drawImage).toHaveBeenCalledWith(
      expect.any(HTMLCanvasElement),
      -0.6,
      -0.6,
      1.2,
      1.2,
    );
  });

  it("does nothing without an occlusion sprite", () => {
    const context = createCanvasContext();
    const paint = createSakuraPaint(asContext(context), "dark", () =>
      createSprite(null),
    );
    drawSakuraShadow(asContext(context), posedPetal(), paint, 1, 0, 0);
    expect(context.drawImage).not.toHaveBeenCalled();
    expect(context.setTransform).not.toHaveBeenCalled();
  });
});

describe("drawSakuraPetal", () => {
  const draw = (petal: SakuraPetal, pixelRatio = 2) => {
    const context = createCanvasContext();
    const paint = createSakuraPaint(asContext(context), "dark", () =>
      createSprite(createCanvasContext()),
    );
    context.createLinearGradient.mockClear();
    context.createRadialGradient.mockClear();
    const composites: string[] = [];
    context.fill.mockImplementation(() => {
      composites.push(context.globalCompositeOperation);
    });
    drawSakuraPetal(asContext(context), petal, paint, pixelRatio, 3, -4);
    return { context, paint, composites };
  };

  it("projects the petal at its parallax-shifted position", () => {
    const petal = posedPetal({ x: 120, y: 80, size: 20, roll: 0.3 });
    const { context } = draw(petal);
    const [a, b, c, d] = projectSakuraPetal(petal.rotation);
    expect(context.setTransform).toHaveBeenCalledWith(
      a * 40,
      b * 40,
      c * 40,
      d * 40,
      (120 + 3) * 2,
      (80 - 4) * 2,
    );
    expect(context.closePath).toHaveBeenCalledTimes(1);
    expect(context.bezierCurveTo).toHaveBeenCalledTimes(8);
    expect(context.globalAlpha).toBe(petal.alpha);
  });

  it("lights the body, multiplies the claw blush and finishes source-over", () => {
    const petal = posedPetal({
      size: 20,
      roll: 0,
      pitch: 0,
      spin: 0,
      blushLevel: 2,
    });
    const { context, paint, composites } = draw(petal);
    const body = context.createLinearGradient.mock.results[0].value;
    const shading = shadeSakuraPetal(petal, paint.palette);
    expect(stops(body)).toEqual(
      shading.across.map(
        (color) =>
          `rgb(${color.map((channel) => Math.round(channel)).join(", ")})`,
      ),
    );
    expect(composites.slice(0, 2)).toEqual(["source-over", "multiply"]);
    // The unrotated inner face catches the key light's sheen.
    expect(context.createRadialGradient).toHaveBeenCalledTimes(1);
    expect(composites[2]).toBe("source-over");
    expect(context.globalCompositeOperation).toBe("source-over");
  });

  it("only draws veins on petals large enough to show them", () => {
    const small = draw(posedPetal({ size: 12 })).context;
    expect(small.stroke).not.toHaveBeenCalled();
    expect(small.quadraticCurveTo).not.toHaveBeenCalled();

    const petal = posedPetal({ size: 30 });
    const large = draw(petal).context;
    expect(large.stroke).toHaveBeenCalledTimes(1);
    expect(large.quadraticCurveTo).toHaveBeenCalledTimes(petal.shape.veins);
    expect(large.lineWidth).toBeCloseTo((0.5 * 2) / (30 * 2));
  });

  it("skips the glint when the face is turned from the key light", () => {
    const { context } = draw(posedPetal({ roll: 1.5, pitch: 0, spin: 0 }));
    expect(context.createRadialGradient).not.toHaveBeenCalled();
    expect(context.fill).toHaveBeenCalledTimes(2);
  });
});

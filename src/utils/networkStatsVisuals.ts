export type VisualTone = "positive" | "warning" | "danger" | "muted";

export interface LorenzPoint {
  population: number;
  share: number;
}

export interface LorenzCurve {
  points: string;
  hasData: boolean;
}

export interface DivergingSeriesPoint {
  bucketStartMs: number;
  net: string;
}

export interface DivergingSeriesBar {
  key: string;
  bucketStartMs: number;
  netValue: number;
  positiveHeight: number;
  negativeHeight: number;
  tone: "mint" | "burn" | "flat";
}

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const roundCoordinate = (value: number) => {
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
};

export const ratioPercent = (
  value: number | null | undefined,
  max: number | null | undefined,
) => {
  if (
    value === null ||
    value === undefined ||
    max === null ||
    max === undefined ||
    !Number.isFinite(value) ||
    !Number.isFinite(max) ||
    max <= 0
  ) {
    return null;
  }

  return clamp((value / max) * 100, 0, 100);
};

export const toneFromThresholds = (
  value: number | null | undefined,
  warningAt: number,
  dangerAt: number,
  missingTone: VisualTone = "muted",
): VisualTone => {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return missingTone;
  }
  if (value >= dangerAt) return "danger";
  if (value >= warningAt) return "warning";
  return "positive";
};

export const buildLorenzCurve = (
  points: LorenzPoint[],
  size = 100,
): LorenzCurve => {
  const normalized = points
    .filter(
      (point) =>
        Number.isFinite(point.population) &&
        Number.isFinite(point.share) &&
        point.population >= 0 &&
        point.population <= 1 &&
        point.share >= 0 &&
        point.share <= 1,
    )
    .map((point) => ({
      population: clamp(point.population, 0, 1),
      share: clamp(point.share, 0, 1),
    }))
    .sort((a, b) => a.population - b.population);

  const curvePoints = [
    { population: 0, share: 0 },
    ...normalized,
    { population: 1, share: 1 },
  ];

  return {
    hasData: normalized.length > 0,
    points: curvePoints
      .map((point) => {
        const x = roundCoordinate(point.population * size);
        const y = roundCoordinate(size - point.share * size);
        return `${x},${y}`;
      })
      .join(" "),
  };
};

export const buildDivergingSeriesBars = (
  points: DivergingSeriesPoint[],
  visibleCount = 18,
): DivergingSeriesBar[] => {
  const trailing = points.slice(-visibleCount);
  const maxAbs = trailing.reduce((max, point) => {
    const magnitude = Math.abs(Number(point.net));
    return Number.isFinite(magnitude) ? Math.max(max, magnitude) : max;
  }, 0);

  return trailing.map((point, index) => {
    const netValue = Number(point.net);
    const safeNetValue = Number.isFinite(netValue) ? netValue : 0;
    const magnitude = Math.abs(safeNetValue);
    const height =
      maxAbs > 0 && magnitude > 0
        ? Math.max(6, ratioPercent(magnitude, maxAbs) ?? 0)
        : 0;

    return {
      key: `${point.bucketStartMs}-${index}`,
      bucketStartMs: point.bucketStartMs,
      netValue: safeNetValue,
      positiveHeight: safeNetValue > 0 ? height : 0,
      negativeHeight: safeNetValue < 0 ? height : 0,
      tone: safeNetValue < 0 ? "burn" : safeNetValue > 0 ? "mint" : "flat",
    };
  });
};

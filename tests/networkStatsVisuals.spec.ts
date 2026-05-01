import { describe, expect, it } from "vitest";
import {
  buildDivergingSeriesBars,
  buildLorenzCurve,
  ratioPercent,
  toneFromThresholds,
} from "@/utils/networkStatsVisuals";

describe("network stats visual helpers", () => {
  it("scales ratios into clamped percentages", () => {
    expect(ratioPercent(25, 100)).toBe(25);
    expect(ratioPercent(250, 100)).toBe(100);
    expect(ratioPercent(-10, 100)).toBe(0);
    expect(ratioPercent(1, 0)).toBeNull();
    expect(ratioPercent(Number.NaN, 100)).toBeNull();
  });

  it("maps numeric thresholds to visual tones", () => {
    expect(toneFromThresholds(10, 40, 75)).toBe("positive");
    expect(toneFromThresholds(40, 40, 75)).toBe("warning");
    expect(toneFromThresholds(90, 40, 75)).toBe("danger");
    expect(toneFromThresholds(null, 40, 75)).toBe("muted");
  });

  it("builds bounded Lorenz curve coordinates with origin and endpoint", () => {
    expect(
      buildLorenzCurve([
        { population: 0.75, share: 0.5 },
        { population: 0.25, share: 0.05 },
        { population: 1.5, share: -1 },
      ]),
    ).toEqual({
      hasData: true,
      points: "0,100 25,95 75,50 100,0",
    });
  });

  it("scales issuance bars around a zero baseline", () => {
    expect(
      buildDivergingSeriesBars([
        { bucketStartMs: 1, net: "0" },
        { bucketStartMs: 2, net: "25" },
        { bucketStartMs: 3, net: "-100" },
      ]),
    ).toEqual([
      {
        key: "1-0",
        bucketStartMs: 1,
        netValue: 0,
        positiveHeight: 0,
        negativeHeight: 0,
        tone: "flat",
      },
      {
        key: "2-1",
        bucketStartMs: 2,
        netValue: 25,
        positiveHeight: 25,
        negativeHeight: 0,
        tone: "mint",
      },
      {
        key: "3-2",
        bucketStartMs: 3,
        netValue: -100,
        positiveHeight: 0,
        negativeHeight: 100,
        tone: "burn",
      },
    ]);
  });
});

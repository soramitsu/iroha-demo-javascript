import { describe, expect, it } from "vitest";

import { computeFaucetClaimRetryDelayMs } from "../electron/faucetRetry";

describe("computeFaucetClaimRetryDelayMs", () => {
  it("uses exponential backoff when the queue is not saturated", () => {
    expect(computeFaucetClaimRetryDelayMs(1)).toBe(2_000);
    expect(computeFaucetClaimRetryDelayMs(2)).toBe(4_000);
    expect(computeFaucetClaimRetryDelayMs(4)).toBe(16_000);
    expect(computeFaucetClaimRetryDelayMs(5)).toBe(20_000);
  });

  it("extends the retry delay when TAIRA reports a saturated queue", () => {
    expect(
      computeFaucetClaimRetryDelayMs(1, {
        queueSize: 460,
        commitTimeMs: 1_781,
        saturated: true,
      }),
    ).toBe(17_810);
  });

  it("falls back to a bounded saturated delay when queue metrics are incomplete", () => {
    expect(
      computeFaucetClaimRetryDelayMs(1, {
        queueSize: 0,
        commitTimeMs: 0,
        saturated: true,
      }),
    ).toBe(8_000);
  });
});

import { describe, expect, it } from "vitest";
import {
  buildTonPreflightFailureReport,
  isTairaEndpointUnavailableError,
} from "../scripts/e2e/sccp-ton-live-video.mjs";

describe("TON SCCP live video guard helpers", () => {
  it("classifies TAIRA gateway outages as endpoint-unavailable preflight failures", () => {
    const error = new Error("TAIRA /v1/sccp/manifests returned HTTP 502");

    expect(isTairaEndpointUnavailableError(error)).toBe(true);
    expect(
      buildTonPreflightFailureReport({
        toriiUrl: "https://taira.sora.org",
        error,
        checkedAt: "2026-07-03T00:00:00.000Z",
      }),
    ).toMatchObject({
      ready: false,
      endpointAvailable: false,
      routeReady: false,
      blockers: [expect.stringContaining("TAIRA Torii is unavailable from")],
      error: expect.stringContaining("HTTP 502"),
    });
  });

  it("keeps route-readiness failures distinct from endpoint outages", () => {
    const error = new Error("TON route manifest is missing verifier material");

    expect(isTairaEndpointUnavailableError(error)).toBe(false);
    expect(
      buildTonPreflightFailureReport({
        toriiUrl: "https://taira.sora.org",
        error,
        checkedAt: "2026-07-03T00:00:00.000Z",
      }),
    ).toMatchObject({
      ready: false,
      endpointAvailable: true,
      routeReady: false,
      blockers: [
        expect.stringContaining("TON route preflight failed before recording"),
      ],
    });
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const preload = readFileSync(resolve("electron/preload.ts"), "utf8");
const preloadUtils = readFileSync(resolve("electron/preload-utils.ts"), "utf8");

const between = (source: string, startMarker: string, endMarker: string) => {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
};

describe("preload first-release account read boundary", () => {
  it("requests and binds the exact account transaction page contract", () => {
    const source = between(
      preload,
      "const normalizeFirstReleaseTransactionPage",
      "const fetchFirstReleaseAccountPermissions",
    );
    expect(source).toContain('["items", "total", "has_more", "count_mode"]');
    expect(source).toContain('payload.count_mode !== "exact"');
    expect(source).toContain(
      '["entrypoint_hash", "result_ok"],\n      ["authority", "timestamp_ms", "memo"]',
    );
    expect(source).toContain(
      'endpoint.searchParams.set("count_mode", "exact")',
    );
    expect(source).toContain("assertFirstReleasePageWindow(");
    expect(source).toContain("assertFirstReleaseHasMore(");
    expect(source).not.toContain("...value,");
  });

  it("requests and binds the exact account permission page contract", () => {
    const source = between(
      preload,
      "const fetchFirstReleaseAccountPermissions",
      "const fetchFirstReleaseGovernanceUnlockStats",
    );
    expect(source).toContain('["items", "total", "has_more", "count_mode"]');
    expect(source).toContain('payload.count_mode !== "exact"');
    expect(source).toContain(
      'endpoint.searchParams.set("count_mode", "exact")',
    );
    expect(source).toContain("assertFirstReleasePageWindow(");
    expect(source).toContain("assertFirstReleaseHasMore(");
  });

  it("requires the same exact envelope for account assets", () => {
    const normalizer = between(
      preloadUtils,
      "export const normalizeAccountAssetListPayload",
      "export const normalizeGovernanceCouncilCurrentPayload",
    );
    expect(normalizer).toContain(
      '["items", "total", "has_more", "count_mode"]',
    );
    expect(normalizer).toContain('record.count_mode !== "exact"');

    const fetcher = between(
      preload,
      "const fetchAccountAssetsList",
      "const fetchGovernanceCouncilCurrent",
    );
    expect(fetcher).toContain(
      'endpoint.searchParams.set("count_mode", "exact")',
    );
    expect(fetcher).toContain("readBoundedJsonObjectResponse(");
    expect(fetcher).toContain(
      "expectedAssetDefinitionId: input.assetDefinitionId",
    );
    expect(fetcher).toContain("assertFirstReleasePageWindow(");
    expect(fetcher).toContain("assertFirstReleaseHasMore(");
  });
});

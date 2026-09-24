import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const preload = readFileSync(resolve("electron/preload.ts"), "utf8");

describe("explorer QR preload boundary", () => {
  it("uses one exact Torii route and validates its account-bound response", () => {
    const fetchStart = preload.indexOf(
      "const fetchFirstReleaseExplorerAccountQr",
    );
    const fetchEnd = preload.indexOf(
      "const fetchFirstReleaseAliasResolution",
      fetchStart,
    );
    expect(fetchStart).toBeGreaterThanOrEqual(0);
    expect(fetchEnd).toBeGreaterThan(fetchStart);
    const fetchImplementation = preload.slice(fetchStart, fetchEnd);

    const start = preload.indexOf("async getExplorerAccountQr(input)");
    const end = preload.indexOf("getVpnAvailability(input)", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const implementation = preload.slice(start, end);

    expect(fetchImplementation).toContain(
      "`/v1/explorer/accounts/${encodeURIComponent(accountId)}/qr`",
    );
    expect(fetchImplementation).toContain('"Explorer account QR"');
    expect(implementation).toContain(
      'requireFirstReleaseIpcInput(\n      input,\n      "explorerAccountQr",',
    );
    expect(implementation).toContain("normalizeCanonicalAccountIdLiteral(");
    expect(implementation).toContain("fetchFirstReleaseExplorerAccountQr(");
    expect(implementation).toContain(
      "assertExplorerAccountQrMatchesRequestedAccount(",
    );
    expect(implementation).not.toContain("fetchFallback");
    expect(implementation).not.toContain("client.getExplorerAccountQr(");
    expect(implementation).not.toContain("catch");
  });
});

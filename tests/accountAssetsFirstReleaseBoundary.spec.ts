import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const readSource = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

describe("first-release account-assets contract", () => {
  it("uses the exact current Torii projection in every retained live reader", () => {
    const trade = readSource("scripts/connect-soraswap-live-trade.mjs");
    const ui = readSource("scripts/e2e/soraswap-ui-live.mjs");
    const diagnostic = readSource("scripts/e2e/taira-read-contract.mjs");

    for (const source of [trade, ui]) {
      expect(source).toContain("validateAccountAssets");
    }
    expect(trade).toContain("count_mode=exact");
    expect(ui).toContain('searchParams.set("count_mode", "exact")');
    expect(diagnostic).toContain("count_mode=exact");

    expect(trade).not.toContain("item?.asset_id");
    expect(trade).not.toContain("item?.asset?.id");
    expect(trade).not.toContain("item?.asset?.asset_id");
    expect(trade).not.toContain("Array.isArray(payload?.items)");
    expect(ui).not.toContain("Array.isArray(payload.items)");
  });
});

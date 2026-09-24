import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("proved-IVM first-release boundary", () => {
  it("does not expose the retired renderer proof or submission corridor", () => {
    const source = readFileSync(
      resolve(process.cwd(), "electron", "preload.ts"),
      "utf8",
    );

    expect(source).not.toContain("deriveZkIvmPayloadOnTorii");
    expect(source).not.toContain("startZkIvmProveJobOnTorii");
    expect(source).not.toContain("submitZkIvmProvedTransactionToTorii");
    expect(source).not.toContain("buildIvmProvedTransactionPayload");
    expect(source).not.toContain("signQuotedIvmProvedTransactionPayload");
  });
});

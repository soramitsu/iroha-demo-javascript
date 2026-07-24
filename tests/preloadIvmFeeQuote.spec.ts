import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("proved-IVM fee admission", () => {
  it("quotes the exact unsigned payload before applying the quote and signing", () => {
    const source = readFileSync(
      resolve(process.cwd(), "electron", "preload.ts"),
      "utf8",
    );
    const start = source.indexOf(
      "const submitZkIvmProvedTransactionToTorii = async",
    );
    const end = source.indexOf(
      "const fetchExplorerAssetDefinitionSnapshot",
      start,
    );
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const submit = source.slice(start, end);
    const draft = submit.indexOf("buildIvmProvedTransactionPayload({");
    const quote = submit.indexOf(".quoteFees(draft,");
    const sign = submit.indexOf("signQuotedIvmProvedTransactionPayload({");
    const submitSigned = submit.indexOf("submitSignedTransactionAsVersioned(");

    expect(draft).toBeGreaterThanOrEqual(0);
    expect(quote).toBeGreaterThan(draft);
    expect(sign).toBeGreaterThan(quote);
    expect(submitSigned).toBeGreaterThan(sign);
    expect(submit).toContain("quotedFeePayment: quote.intent");
    expect(submit).not.toContain("buildIvmProvedTransaction({");
  });
});

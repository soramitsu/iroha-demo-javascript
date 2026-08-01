import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const preload = readFileSync(
  resolve(process.cwd(), "electron/preload.ts"),
  "utf8",
);

const faucetRequest = (() => {
  const start = preload.indexOf("async requestFaucetFunds(");
  const end = preload.indexOf("async cancelFaucetRequest(", start);
  if (start < 0 || end <= start) {
    throw new Error("Could not locate the preload faucet request boundary.");
  }
  return preload.slice(start, end);
})();

describe("faucet strict-success boundary", () => {
  it("does not accept a missing transaction hash or fabricate a funded status", () => {
    expect(faucetRequest).not.toContain("if (!txHashHex)");
    expect(faucetRequest).not.toContain('status: statusKind || "Funded"');
    expect(faucetRequest).not.toContain('status: "Funded"');
  });

  it("returns success only after exact finalized-block proof", () => {
    const finality = faucetRequest.indexOf(
      "await waitForTransactionFinalizedInBlock(",
    );
    const finalizedStatus = faucetRequest.indexOf('status: "FINALIZED"');
    const finalityReceipt = faucetRequest.indexOf(
      "finality: finalized.finality",
    );

    expect(finality).toBeGreaterThanOrEqual(0);
    expect(finalizedStatus).toBeGreaterThan(finality);
    expect(finalityReceipt).toBeGreaterThan(finalizedStatus);
    expect(faucetRequest).not.toContain("FAUCET_CLAIM_SUCCESS_STATUSES");
    expect(faucetRequest).not.toContain("faucetClaimFundedAssetIsVisible");
  });
});

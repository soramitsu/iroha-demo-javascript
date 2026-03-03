import { describe, expect, it } from "vitest";
import { extractTransferInsight } from "@/utils/transactions";

describe("extractTransferInsight", () => {
  const baseTx = {
    instructions: [
      {
        Transfer: {
          Asset: {
            source: "rose#wonderland##alice@wonderland",
            object: "15",
            destination: "bob@wonderland",
          },
        },
      },
    ],
  };

  it("identifies outbound transfers", () => {
    const insight = extractTransferInsight(baseTx, "alice@wonderland");
    expect(insight).toEqual({
      direction: "Sent",
      amount: "15",
      counterparty: "bob@wonderland",
    });
  });

  it("identifies inbound transfers", () => {
    const insight = extractTransferInsight(baseTx, "bob@wonderland");
    expect(insight).toEqual({
      direction: "Received",
      amount: "15",
      counterparty: "alice@wonderland",
    });
  });

  it("returns null when no matching instruction exists", () => {
    const insight = extractTransferInsight(
      { instructions: [] },
      "alice@wonderland",
    );
    expect(insight).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { AccountAddress } from "@iroha/iroha-js/address";
import { extractTransferInsight } from "@/utils/transactions";

const ASSET_DEFINITION_ID = "6TEAJqbb8oEPmLncoNiMRbLEK6tw";
const accountIdFor = (publicKeyHex: string) =>
  AccountAddress.fromAccount({
    publicKey: Uint8Array.from(
      publicKeyHex.match(/.{2}/gu)!.map((byte) => Number.parseInt(byte, 16)),
    ),
  }).toI105(369);
const ALICE_ACCOUNT_ID = accountIdFor(
  "d04ab232742bb4ab3a1368bd4615e4e6d0224ab71a016baf8520a332c9778737",
);
const BOB_ACCOUNT_ID = accountIdFor(
  "a09aa5f47a6759802ff955f8dc2d2a14a5c99d23be97f864127ff9383455a4f0",
);

describe("extractTransferInsight", () => {
  const baseTx = {
    instructions: [
      {
        Transfer: {
          Asset: {
            source: `${ASSET_DEFINITION_ID}#${ALICE_ACCOUNT_ID}`,
            object: "15",
            destination: BOB_ACCOUNT_ID,
          },
        },
      },
    ],
  };

  it("identifies outbound transfers", () => {
    const insight = extractTransferInsight(baseTx, ALICE_ACCOUNT_ID);
    expect(insight).toEqual({
      direction: "Sent",
      amount: "15",
      counterparty: BOB_ACCOUNT_ID,
    });
  });

  it("identifies inbound transfers", () => {
    const insight = extractTransferInsight(baseTx, BOB_ACCOUNT_ID);
    expect(insight).toEqual({
      direction: "Received",
      amount: "15",
      counterparty: ALICE_ACCOUNT_ID,
    });
  });

  it("returns null when no matching instruction exists", () => {
    const insight = extractTransferInsight(
      { instructions: [] },
      ALICE_ACCOUNT_ID,
    );
    expect(insight).toBeNull();
  });

  it("uses authority fallback for asset definitions without a source account", () => {
    const insight = extractTransferInsight(
      {
        authority: ALICE_ACCOUNT_ID,
        instructions: [
          {
            Transfer: {
              Asset: {
                source: ASSET_DEFINITION_ID,
                object: "5",
                destination: BOB_ACCOUNT_ID,
              },
            },
          },
        ],
      },
      ALICE_ACCOUNT_ID,
    );
    expect(insight).toEqual({
      direction: "Sent",
      amount: "5",
      counterparty: BOB_ACCOUNT_ID,
    });
  });
});

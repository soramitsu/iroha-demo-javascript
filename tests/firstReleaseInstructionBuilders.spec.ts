import { describe, expect, it } from "vitest";

import {
  buildCreateKaigiInstruction,
  buildEndKaigiInstruction,
  buildJoinKaigiInstruction,
  buildRegisterAccountInstruction,
  buildTransferAssetInstruction,
} from "@iroha/iroha-js/instruction-builders";

import {
  buildFirstReleaseCreateKaigiInstruction,
  buildFirstReleaseEndKaigiInstruction,
  buildFirstReleaseJoinKaigiInstruction,
  buildFirstReleaseRegisterAccountInstruction,
  buildFirstReleaseTransferAssetInstruction,
} from "../electron/firstReleaseInstructionBuilders";
import { deriveAccountAddressView } from "../electron/accountAddress";

const prefix = 369;
const account = deriveAccountAddressView({
  domain: "default",
  publicKeyHex:
    "CE7FA46C9DCE7EA4B125E2E36BDB63EA33073E7590AC92816AE1E861B7048B03",
  networkPrefix: prefix,
}).accountId;
const destination = account;
const callId = "kaigi.universal:kaigi-0011223344556677";

describe("first-release instruction builders", () => {
  it("matches the current native-facing account and transfer DTOs", () => {
    expect(
      buildFirstReleaseRegisterAccountInstruction({
        accountId: account,
        networkPrefix: prefix,
        metadata: { label: "Alice" },
      }),
    ).toEqual(
      buildRegisterAccountInstruction({
        accountId: account,
        metadata: { label: "Alice" },
      }),
    );

    expect(
      buildFirstReleaseTransferAssetInstruction({
        sourceAssetHoldingId: `5dHF5UNffENuEg9mhjYwY1jcZ1K5#${account}`,
        quantity: "12.5",
        destinationAccountId: destination,
        networkPrefix: prefix,
      }),
    ).toEqual(
      buildTransferAssetInstruction({
        sourceAssetHoldingId: `5dHF5UNffENuEg9mhjYwY1jcZ1K5#${account}`,
        quantity: "12.5",
        destinationAccountId: destination,
      }),
    );
  });

  it("matches the exact transparent Kaigi DTOs", () => {
    const createInput = {
      id: callId,
      host: account,
      title: "Planning",
      scheduledStartMs: 1234,
      privacyMode: "Transparent",
      roomPolicy: "authenticated",
      relayManifest: null,
      metadata: { kaigi_call: { schema: "iroha-kaigi-call/v1" } },
    } as const;
    expect(
      buildFirstReleaseCreateKaigiInstruction({
        callId,
        host: account,
        networkPrefix: prefix,
        title: "Planning",
        scheduledStartMs: 1234,
        metadata: createInput.metadata,
      }),
    ).toEqual(buildCreateKaigiInstruction(createInput));

    expect(
      buildFirstReleaseJoinKaigiInstruction({
        callId,
        participant: destination,
        networkPrefix: prefix,
      }),
    ).toEqual(buildJoinKaigiInstruction({ callId, participant: destination }));

    expect(
      buildFirstReleaseEndKaigiInstruction({ callId, endedAtMs: 5678 }),
    ).toEqual(buildEndKaigiInstruction({ callId, endedAtMs: 5678 }));
  });

  it("rejects aliases, zero/noncanonical quantities, and oversized metadata", () => {
    expect(() =>
      buildFirstReleaseTransferAssetInstruction({
        sourceAssetHoldingId: `5dHF5UNffENuEg9mhjYwY1jcZ1K5#${account}`,
        quantity: "01.0",
        destinationAccountId: destination,
        networkPrefix: prefix,
      }),
    ).toThrow(/canonical non-negative quantity/u);
    expect(() =>
      buildFirstReleaseTransferAssetInstruction({
        sourceAssetHoldingId: `5dHF5UNffENuEg9mhjYwY1jcZ1K5#${account}`,
        quantity: "0",
        destinationAccountId: destination,
        networkPrefix: prefix,
      }),
    ).toThrow(/greater than zero/u);
    expect(() =>
      buildFirstReleaseRegisterAccountInstruction({
        accountId: account,
        networkPrefix: prefix,
        metadata: { value: "x".repeat(64 * 1024) },
      }),
    ).toThrow(/oversized|limit/u);
  });
});

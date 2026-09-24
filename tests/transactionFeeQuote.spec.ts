import { describe, expect, it, vi } from "vitest";

const nativeBinding = vi.hoisted(() => ({
  buildTransactionPayload: (...args: unknown[]) => ({
    payloadJson: JSON.stringify({
      authority: args[1],
      instructions: [],
      fee_payment: {
        payer: "authority",
        value: { charge_limits: [], gas_limit: null },
      },
      metadata: {},
    }),
    payloadBytes: Buffer.from([1]),
    payloadHash: Buffer.alloc(32, 3),
  }),
  signQuotedTransactionPayload: () => ({}),
  encodeSignedTransactionVersioned: (input: Uint8Array) => input,
  hashSignedTransaction: () => Buffer.alloc(32),
}));

vi.mock("../electron/irohaJsNativeDir", () => ({
  getInstalledIrohaJsNativeBinding: () => nativeBinding,
  installGlobalIrohaJsNativeBinding: () => nativeBinding,
}));

import { NetworkId } from "@iroha/iroha-js/canonical-request";
import { deriveAccountAddressView } from "../electron/accountAddress";
import {
  buildCanonicalInstructionFeeQuoteRequest,
  resolveCanonicalInstructionWireInput,
} from "../electron/transactionFeeQuote";

const PUBLIC_KEY_HEX =
  "CE7FA46C9DCE7EA4B125E2E36BDB63EA33073E7590AC92816AE1E861B7048B03";
const PRIVATE_KEY = Buffer.alloc(32, 17);
const NETWORK_ID = NetworkId.fromBytes(
  Buffer.from(`${"11".repeat(31)}13`, "hex"),
);
describe("canonical transaction fee quotes", () => {
  it.each([
    { activePrefix: 369, stalePrefix: 753, expectedPrefix: "testu" },
    { activePrefix: 753, stalePrefix: 369, expectedPrefix: "sorau" },
  ])(
    "uses the exact active-network I105 authority for prefix $activePrefix",
    ({ activePrefix, stalePrefix, expectedPrefix }) => {
      const staleAccount = deriveAccountAddressView({
        domain: "default",
        publicKeyHex: PUBLIC_KEY_HEX,
        networkPrefix: stalePrefix,
      }).i105AccountId;
      const expectedAccount = deriveAccountAddressView({
        domain: "default",
        publicKeyHex: PUBLIC_KEY_HEX,
        networkPrefix: activePrefix,
      }).i105AccountId;
      const wireInput = resolveCanonicalInstructionWireInput({
        authorityAccountId: expectedAccount,
        networkPrefix: activePrefix,
        instruction: (authority) => ({
          RegisterCitizen: { owner: authority, amount: "10000" },
        }),
      });
      const request = buildCanonicalInstructionFeeQuoteRequest({
        networkId: NETWORK_ID,
        authority: wireInput.authority,
        networkPrefix: activePrefix,
        instructions: [wireInput.instruction],
        privateKey: PRIVATE_KEY,
        creationTimeMs: 1,
      });

      expect(wireInput).toEqual({
        authority: expectedAccount,
        instruction: {
          RegisterCitizen: { owner: expectedAccount, amount: "10000" },
        },
      });
      expect(request.authority).toBe(expectedAccount);
      expect(request.authority.startsWith(expectedPrefix)).toBe(true);
      expect(request.payload.authority).toBe(expectedAccount);
      expect(request.payload.metadata).toEqual({});
      expect(request.draft.payload).toBe(request.payload);
      expect(request.canonicalAuth).toEqual({
        accountId: expectedAccount,
        privateKey: PRIVATE_KEY,
      });
      expect(() =>
        resolveCanonicalInstructionWireInput({
          authorityAccountId: staleAccount,
          networkPrefix: activePrefix,
          instruction: {},
        }),
      ).toThrow(/network prefix/i);
    },
  );

  it("rejects a malformed authority before building a fee quote", () => {
    expect(() =>
      buildCanonicalInstructionFeeQuoteRequest({
        networkId: NETWORK_ID,
        authority: "alice@wonderland",
        networkPrefix: 369,
        instructions: [],
        privateKey: PRIVATE_KEY,
        metadata: {},
      }),
    ).toThrow(/authority/i);
  });
});

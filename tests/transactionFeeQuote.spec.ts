import { describe, expect, it } from "vitest";
import { deriveAccountAddressView } from "../electron/accountAddress";
import {
  buildCanonicalInstructionFeeQuoteRequest,
  isMissingFeeQuoteRouteError,
  resolveCanonicalInstructionWireInput,
} from "../electron/transactionFeeQuote";

const PUBLIC_KEY_HEX =
  "CE7FA46C9DCE7EA4B125E2E36BDB63EA33073E7590AC92816AE1E861B7048B03";
const PRIVATE_KEY = Buffer.alloc(32, 17);

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
        authorityAccountId: staleAccount,
        networkPrefix: activePrefix,
        instruction: (authority) => ({
          RegisterCitizen: { owner: authority, amount: "10000" },
        }),
      });
      const request = buildCanonicalInstructionFeeQuoteRequest({
        chainId: "test-chain",
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
      expect(request.payload.payload.authority).toBe(expectedAccount);
      expect(request.payload.payload.metadata).toEqual({});
      expect(request.canonicalAuth).toEqual({
        accountId: expectedAccount,
        privateKey: PRIVATE_KEY,
      });
    },
  );

  it("rejects a malformed authority before building a fee quote", () => {
    expect(() =>
      buildCanonicalInstructionFeeQuoteRequest({
        chainId: "test-chain",
        authority: "alice@wonderland",
        networkPrefix: 369,
        instructions: [],
        privateKey: PRIVATE_KEY,
        metadata: {},
      }),
    ).toThrow(/authority/i);
  });

  it.each([
    {
      error: {
        status: 404,
        code: "route_not_found",
      },
    },
    {
      error: {
        status: 404,
        bodyJson: {
          error: "route_not_found",
          message: "The requested route does not exist.",
        },
      },
    },
    {
      error: Object.assign(
        new Error(
          "Torii responded with HTTP 404 Not Found: The requested route does not exist.",
        ),
        { status: 404 },
      ),
    },
  ])("recognizes an unavailable fee-quote route", ({ error }) => {
    expect(isMissingFeeQuoteRouteError(error)).toBe(true);
  });

  it.each([
    {
      error: {
        status: 422,
        code: "route_not_found",
      },
    },
    {
      error: {
        status: 404,
        code: "proposal_not_found",
      },
    },
    {
      error: new Error("network unavailable"),
    },
  ])("does not enable the fallback for other failures", ({ error }) => {
    expect(isMissingFeeQuoteRouteError(error)).toBe(false);
  });
});

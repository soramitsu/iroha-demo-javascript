import type { FeeQuoteResponse } from "@iroha/iroha-js";
import { describe, expect, it } from "vitest";
import { deriveAccountAddressView } from "../electron/accountAddress";
import {
  FIRST_RELEASE_FEE_QUOTE_RESPONSE_MAX_BYTES,
  parseFirstReleaseAuthorityFeeQuoteResponse,
} from "../electron/firstReleaseFeeQuoteResponse";

const NETWORK_PREFIX = 369;
const ASSET_DEFINITION_ID = "6TEAJqbb8oEPmLncoNiMRbLEK6tw";
const AUTHORITY = deriveAccountAddressView({
  domain: "default",
  publicKeyHex:
    "CE7FA46C9DCE7EA4B125E2E36BDB63EA33073E7590AC92816AE1E861B7048B03",
  networkPrefix: NETWORK_PREFIX,
}).i105AccountId;
const OTHER_ACCOUNT = deriveAccountAddressView({
  domain: "default",
  publicKeyHex:
    "6A7FA46C9DCE7EA4B125E2E36BDB63EA33073E7590AC92816AE1E861B7048B03",
  networkPrefix: NETWORK_PREFIX,
}).i105AccountId;

const charge = (kind: "nexus" | "pipeline_gas", maxAmount: string) => ({
  kind: { kind, value: null },
  asset_definition_id: ASSET_DEFINITION_ID,
  max_amount: maxAmount,
});

const validQuote = () => {
  const chargeLimits = [charge("nexus", "1.25"), charge("pipeline_gas", "2")];
  return {
    intent: {
      payer: "authority",
      value: { charge_limits: chargeLimits, gas_limit: null },
    },
    observation: {
      ledger_time_ms: 1_725_000_000_000,
      next_block_height: 42,
      route_dataspace_id: 0,
    },
    components: structuredClone(chargeLimits),
    capacities: [],
    decision: {
      status: "accepted",
      value: {
        debit_source: { kind: "account", value: AUTHORITY },
        program_revision: null,
      },
    },
  };
};

const parse = (value: unknown) =>
  parseFirstReleaseAuthorityFeeQuoteResponse(JSON.stringify(value), {
    expectedAuthority: AUTHORITY,
    networkPrefix: NETWORK_PREFIX,
  });

describe("first-release authority fee quote response", () => {
  it("accepts the exact authority-payer contract and returns an SDK-compatible quote", () => {
    const parsed: FeeQuoteResponse = parse(validQuote());

    expect(parsed).toEqual(validQuote());
  });

  it("rejects duplicate, unknown, missing, and oversized JSON", () => {
    const duplicate = JSON.stringify(validQuote()).replace(
      '"payer":"authority"',
      '"payer":"authority","payer":"authority"',
    );
    expect(() =>
      parseFirstReleaseAuthorityFeeQuoteResponse(duplicate, {
        expectedAuthority: AUTHORITY,
        networkPrefix: NETWORK_PREFIX,
      }),
    ).toThrow(/duplicate key payer/iu);

    expect(() => parse({ ...validQuote(), legacy_fee: null })).toThrow(
      /contain exactly/iu,
    );

    const missingDecision = Object.fromEntries(
      Object.entries(validQuote()).filter(([key]) => key !== "decision"),
    );
    expect(() => parse(missingDecision)).toThrow(/contain exactly/iu);

    expect(() =>
      parseFirstReleaseAuthorityFeeQuoteResponse(
        `${" ".repeat(FIRST_RELEASE_FEE_QUOTE_RESPONSE_MAX_BYTES)}{}`,
        {
          expectedAuthority: AUTHORITY,
          networkPrefix: NETWORK_PREFIX,
        },
      ),
    ).toThrow(/bounded/iu);
  });

  it("rejects payer, gas-bound, debit-source, and program changes", () => {
    const quote = validQuote();
    expect(() =>
      parse({
        ...quote,
        intent: { ...quote.intent, payer: "sponsor" },
      }),
    ).toThrow(/preserve authority/iu);

    expect(() =>
      parse({
        ...quote,
        intent: {
          ...quote.intent,
          value: { ...quote.intent.value, gas_limit: 10 },
        },
      }),
    ).toThrow(/null gas bound/iu);

    expect(() =>
      parse({
        ...quote,
        decision: {
          ...quote.decision,
          value: {
            ...quote.decision.value,
            debit_source: { kind: "account", value: OTHER_ACCOUNT },
          },
        },
      }),
    ).toThrow(/exact expected authority/iu);

    expect(() =>
      parse({
        ...quote,
        decision: {
          ...quote.decision,
          value: { ...quote.decision.value, program_revision: 1 },
        },
      }),
    ).toThrow(/program_revision/iu);

    expect(() =>
      parse({
        ...quote,
        decision: {
          ...quote.decision,
          value: {
            ...quote.decision.value,
            debit_source: {
              kind: "sponsor_program",
              value: { sponsor: AUTHORITY, name: "wallet" },
            },
          },
        },
      }),
    ).toThrow(/exact expected authority/iu);
  });

  it("rejects misleading divergence between intent, components, and capacities", () => {
    const quote = validQuote();
    expect(() =>
      parse({
        ...quote,
        components: [
          { ...quote.components[0], max_amount: "1.26" },
          quote.components[1],
        ],
      }),
    ).toThrow(/exactly match/iu);

    const reversedCharges = [...quote.intent.value.charge_limits].reverse();
    expect(() =>
      parse({
        ...quote,
        intent: {
          ...quote.intent,
          value: { ...quote.intent.value, charge_limits: reversedCharges },
        },
        components: structuredClone(reversedCharges),
      }),
    ).toThrow(/ordered nexus before pipeline_gas/iu);

    expect(() =>
      parse({
        ...quote,
        capacities: [{ asset_definition_id: ASSET_DEFINITION_ID }],
      }),
    ).toThrow(/empty for authority/iu);
  });

  it.each([
    ["alias asset", "xor#universal", "1"],
    ["whitespace asset", ` ${ASSET_DEFINITION_ID}`, "1"],
    ["trailing-zero quantity", ASSET_DEFINITION_ID, "1.0"],
    ["zero quantity", ASSET_DEFINITION_ID, "0"],
    ["over-wide quantity", ASSET_DEFINITION_ID, (1n << 511n).toString()],
    ["over-scale quantity", ASSET_DEFINITION_ID, `0.${"0".repeat(28)}1`],
  ])("rejects non-canonical %s", (_case, assetDefinitionId, maxAmount) => {
    const quote = validQuote();
    const invalidCharge = {
      ...quote.intent.value.charge_limits[0],
      asset_definition_id: assetDefinitionId,
      max_amount: maxAmount,
    };
    expect(() =>
      parse({
        ...quote,
        intent: {
          ...quote.intent,
          value: {
            ...quote.intent.value,
            charge_limits: [invalidCharge, quote.intent.value.charge_limits[1]],
          },
        },
        components: [invalidCharge, quote.components[1]],
      }),
    ).toThrow(/canonical/iu);
  });

  it.each([
    ["ledger_time_ms", -1],
    ["ledger_time_ms", 1.5],
    ["ledger_time_ms", Number.MAX_SAFE_INTEGER + 1],
    ["next_block_height", 0],
    ["route_dataspace_id", -1],
  ])("rejects a non-canonical observation %s=%s", (field, value) => {
    const quote = validQuote();
    expect(() =>
      parse({
        ...quote,
        observation: { ...quote.observation, [field]: value },
      }),
    ).toThrow(/JSON integer/iu);
  });

  it.each(["-0", "1e3", "1.0"])(
    "rejects a non-canonical raw JSON numeric token %s",
    (token) => {
      const serialized = JSON.stringify(validQuote()).replace(
        '"ledger_time_ms":1725000000000',
        `"ledger_time_ms":${token}`,
      );
      expect(() =>
        parseFirstReleaseAuthorityFeeQuoteResponse(serialized, {
          expectedAuthority: AUTHORITY,
          networkPrefix: NETWORK_PREFIX,
        }),
      ).toThrow(/canonical unsigned JSON integers/iu);
    },
  );

  it("rejects unknown nested fields and malformed tagged-unit values", () => {
    const quote = validQuote();
    const extraFieldCharge = {
      ...quote.intent.value.charge_limits[0],
      legacy_kind: "nexus",
    };
    expect(() =>
      parse({
        ...quote,
        intent: {
          ...quote.intent,
          value: {
            ...quote.intent.value,
            charge_limits: [
              extraFieldCharge,
              quote.intent.value.charge_limits[1],
            ],
          },
        },
      }),
    ).toThrow(/contain exactly/iu);

    const nonUnitCharge = {
      ...quote.intent.value.charge_limits[0],
      kind: { kind: "nexus", value: {} },
    };
    expect(() =>
      parse({
        ...quote,
        intent: {
          ...quote.intent,
          value: {
            ...quote.intent.value,
            charge_limits: [nonUnitCharge, quote.intent.value.charge_limits[1]],
          },
        },
      }),
    ).toThrow(/unit variant/iu);
  });

  it("rejects a non-canonical expected authority before trusting the response", () => {
    expect(() =>
      parseFirstReleaseAuthorityFeeQuoteResponse(JSON.stringify(validQuote()), {
        expectedAuthority: ` ${AUTHORITY}`,
        networkPrefix: NETWORK_PREFIX,
      }),
    ).toThrow(/canonical I105/iu);
  });
});

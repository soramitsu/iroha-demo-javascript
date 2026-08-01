import { describe, expect, it } from "vitest";
import {
  assertGovernanceCitizenDraftResponse,
  decodeGovernanceCitizenStatus,
  normalizeGovernanceNetworkPrefix,
  unavailableGovernanceCitizenStatus,
} from "../electron/governanceCitizenStatus";
import { deriveAccountAddressView } from "../electron/accountAddress";

const NETWORK_PREFIX = 369;
const ACCOUNT = deriveAccountAddressView({
  domain: "default",
  publicKeyHex:
    "CE7FA46C9DCE7EA4B125E2E36BDB63EA33073E7590AC92816AE1E861B7048B03",
  networkPrefix: NETWORK_PREFIX,
}).accountId;
const OTHER_ACCOUNT = deriveAccountAddressView({
  domain: "default",
  publicKeyHex:
    "6A7FA46C9DCE7EA4B125E2E36BDB63EA33073E7590AC92816AE1E861B7048B03",
  networkPrefix: NETWORK_PREFIX,
}).accountId;

const payload = (overrides: Record<string, unknown> = {}) => ({
  account_id: ACCOUNT,
  is_citizen: true,
  amount: "10000",
  bonded_height: "18457",
  seats_in_epoch: "0",
  last_epoch_seen: "0",
  cooldown_until: "0",
  ...overrides,
});

describe("governance citizen status decoder", () => {
  it("requires the public citizen draft bond to remain an exact JSON string", () => {
    const draft = {
      version: 1,
      owner: ACCOUNT,
      amount: "10000",
      tx_instructions: [],
    };
    expect(() =>
      assertGovernanceCitizenDraftResponse(draft, {
        owner: ACCOUNT,
        amount: "10000",
      }),
    ).not.toThrow();
    expect(() =>
      assertGovernanceCitizenDraftResponse(
        { ...draft, amount: 10_000 },
        { owner: ACCOUNT, amount: "10000" },
      ),
    ).toThrow(/differs from the reviewed owner or bond/);
    expect(() =>
      assertGovernanceCitizenDraftResponse(
        { ...draft, version: "1" },
        { owner: ACCOUNT, amount: "10000" },
      ),
    ).toThrow(/differs from the reviewed owner or bond/);
  });

  it("preserves the live canonical uint64 counter strings", () => {
    expect(
      decodeGovernanceCitizenStatus(payload(), {
        expectedAccountId: ACCOUNT,
        networkPrefix: NETWORK_PREFIX,
      }),
    ).toEqual({
      state: "citizen",
      accountId: ACCOUNT,
      amount: "10000",
      bondedHeight: "18457",
      seatsInEpoch: "0",
      lastEpochSeen: "0",
      cooldownUntil: "0",
    });
  });

  it("accepts canonical decimal counter strings and a non-citizen result", () => {
    expect(
      decodeGovernanceCitizenStatus(
        payload({
          is_citizen: false,
          amount: null,
          bonded_height: "18457",
          seats_in_epoch: "0",
          last_epoch_seen: null,
          cooldown_until: "0",
        }),
        {
          expectedAccountId: ACCOUNT,
          networkPrefix: NETWORK_PREFIX,
        },
      ),
    ).toEqual({
      state: "not-citizen",
      accountId: ACCOUNT,
      amount: null,
      bondedHeight: "18457",
      seatsInEpoch: "0",
      lastEpochSeen: null,
      cooldownUntil: "0",
    });
  });

  it("returns an explicit unavailable state without claiming non-citizenship", () => {
    expect(
      unavailableGovernanceCitizenStatus({
        expectedAccountId: ACCOUNT,
        networkPrefix: NETWORK_PREFIX,
      }),
    ).toEqual({
      state: "unavailable",
      accountId: ACCOUNT,
      amount: null,
      bondedHeight: null,
      seatsInEpoch: null,
      lastEpochSeen: null,
      cooldownUntil: null,
    });
  });

  it.each(["", " 10000", 10_000])(
    "rejects malformed non-null amount %s",
    (amount) => {
      expect(() =>
        decodeGovernanceCitizenStatus(payload({ amount }), {
          expectedAccountId: ACCOUNT,
          networkPrefix: NETWORK_PREFIX,
        }),
      ).toThrow(/amount must be a canonical decimal string or null/);
    },
  );

  it("rejects a status response for a different account", () => {
    expect(() =>
      decodeGovernanceCitizenStatus(payload({ account_id: OTHER_ACCOUNT }), {
        expectedAccountId: ACCOUNT,
        networkPrefix: NETWORK_PREFIX,
      }),
    ).toThrow("does not match the requested account");
  });

  it.each([
    ["numeric compatibility value", 0],
    ["undefined value", undefined],
    ["non-canonical string", "01"],
    ["negative string", "-1"],
    ["uint64 overflow", "18446744073709551616"],
  ])("rejects a %s counter", (_label, value) => {
    expect(() =>
      decodeGovernanceCitizenStatus(payload({ bonded_height: value }), {
        expectedAccountId: ACCOUNT,
        networkPrefix: NETWORK_PREFIX,
      }),
    ).toThrow(/canonical uint64|exceeds uint64/u);
  });

  it("accepts the full uint64 domain without Number coercion", () => {
    expect(
      decodeGovernanceCitizenStatus(
        payload({ bonded_height: "18446744073709551615" }),
        {
          expectedAccountId: ACCOUNT,
          networkPrefix: NETWORK_PREFIX,
        },
      ).bondedHeight,
    ).toBe("18446744073709551615");
  });

  it("rejects missing required response fields", () => {
    const missingField = payload();
    Reflect.deleteProperty(missingField, "cooldown_until");
    expect(() =>
      decodeGovernanceCitizenStatus(missingField, {
        expectedAccountId: ACCOUNT,
        networkPrefix: NETWORK_PREFIX,
      }),
    ).toThrow("missing or unknown fields");
  });

  it("rejects additive response fields", () => {
    expect(() =>
      decodeGovernanceCitizenStatus(
        payload({
          unexpected: true,
        }),
        {
          expectedAccountId: ACCOUNT,
          networkPrefix: NETWORK_PREFIX,
        },
      ),
    ).toThrow("missing or unknown fields");
  });

  it.each([undefined, null, -1, 1.5, 16_384])(
    "rejects an invalid network prefix %s",
    (networkPrefix) => {
      expect(() => normalizeGovernanceNetworkPrefix(networkPrefix)).toThrow(
        "networkPrefix must be an integer between 0 and 16383",
      );
    },
  );
});

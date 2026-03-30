import { describe, expect, it } from "vitest";
import { AccountAddress } from "@iroha/iroha-js";
import {
  deriveAccountAddressView,
  normalizeCanonicalAccountIdLiteral,
  normalizeCompatAccountIdLiteral,
} from "../electron/accountAddress";

const SAMPLE_PUBLIC_KEY_HEX =
  "CE7FA46C9DCE7EA4B125E2E36BDB63EA33073E7590AC92816AE1E861B7048B03";

describe("accountAddress helper", () => {
  it("derives both compatibility and native I105 account literals", () => {
    const derived = deriveAccountAddressView({
      domain: "default",
      publicKeyHex: SAMPLE_PUBLIC_KEY_HEX,
      networkPrefix: 369,
    });

    expect(derived.accountId).toBe(
      AccountAddress.fromAccount({
        publicKey: Buffer.from(SAMPLE_PUBLIC_KEY_HEX, "hex"),
      }).toI105(369),
    );
    expect(derived.i105AccountId.startsWith("testu")).toBe(true);
    expect(derived.i105DefaultAccountId.startsWith("sorau")).toBe(true);
  });

  it("converts native TAIRA I105 literals into the compatibility literal", () => {
    const derived = deriveAccountAddressView({
      domain: "default",
      publicKeyHex: SAMPLE_PUBLIC_KEY_HEX,
      networkPrefix: 369,
    });

    expect(
      normalizeCompatAccountIdLiteral(derived.i105AccountId, "accountId", 369),
    ).toBe(derived.accountId);
  });

  it("rewrites old SORA compatibility literals to the active network prefix", () => {
    const derived = deriveAccountAddressView({
      domain: "default",
      publicKeyHex: SAMPLE_PUBLIC_KEY_HEX,
      networkPrefix: 369,
    });

    expect(
      normalizeCompatAccountIdLiteral(
        derived.i105DefaultAccountId,
        "accountId",
        369,
      ),
    ).toBe(derived.accountId);
  });

  it("canonicalizes compatibility literals for Torii wire requests", () => {
    const derived = deriveAccountAddressView({
      domain: "default",
      publicKeyHex: SAMPLE_PUBLIC_KEY_HEX,
      networkPrefix: 369,
    });
    const canonicalAccountId = normalizeCanonicalAccountIdLiteral(
      derived.i105DefaultAccountId,
      "accountId",
      369,
    );

    expect(canonicalAccountId.startsWith("testu")).toBe(true);
    expect(
      normalizeCanonicalAccountIdLiteral(derived.accountId, "accountId", 369),
    ).toBe(canonicalAccountId);
    expect(
      normalizeCanonicalAccountIdLiteral(
        derived.i105AccountId,
        "accountId",
        369,
      ),
    ).toBe(canonicalAccountId);
  });

  it("keeps the derived literal stable regardless of the stored domain label", () => {
    const defaultDomain = deriveAccountAddressView({
      domain: "default",
      publicKeyHex: SAMPLE_PUBLIC_KEY_HEX,
      networkPrefix: 369,
    });
    const alternateDomain = deriveAccountAddressView({
      domain: "advanced-panel-alias",
      publicKeyHex: SAMPLE_PUBLIC_KEY_HEX,
      networkPrefix: 369,
    });

    expect(alternateDomain.accountId).toBe(defaultDomain.accountId);
    expect(alternateDomain.i105AccountId).toBe(defaultDomain.i105AccountId);
    expect(alternateDomain.i105DefaultAccountId).toBe(
      defaultDomain.i105DefaultAccountId,
    );
  });
});

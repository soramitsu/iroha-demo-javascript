import { describe, expect, it } from "vitest";
import { AccountAddress } from "@iroha/iroha-js";
import { generateKeyPair } from "@iroha/iroha-js/crypto";
import {
  deriveAccountAddressView,
  parseAccountAddressLiteral,
  normalizeCanonicalAccountIdLiteral,
  normalizeCompatAccountIdLiteral,
} from "../electron/accountAddress";

const SAMPLE_PUBLIC_KEY_HEX =
  "CE7FA46C9DCE7EA4B125E2E36BDB63EA33073E7590AC92816AE1E861B7048B03";

const I105_CANONICAL_TO_FULLWIDTH_KANA: Record<string, string> = {
  ｲ: "イ",
  ﾛ: "ロ",
  ﾊ: "ハ",
  ﾆ: "ニ",
  ﾎ: "ホ",
  ﾍ: "ヘ",
  ﾄ: "ト",
  ﾁ: "チ",
  ﾘ: "リ",
  ﾇ: "ヌ",
  ﾙ: "ル",
  ｦ: "ヲ",
  ﾜ: "ワ",
  ｶ: "カ",
  ﾖ: "ヨ",
  ﾀ: "タ",
  ﾚ: "レ",
  ｿ: "ソ",
  ﾂ: "ツ",
  ﾈ: "ネ",
  ﾅ: "ナ",
  ﾗ: "ラ",
  ﾑ: "ム",
  ｳ: "ウ",
  ﾉ: "ノ",
  ｵ: "オ",
  ｸ: "ク",
  ﾔ: "ヤ",
  ﾏ: "マ",
  ｹ: "ケ",
  ﾌ: "フ",
  ｺ: "コ",
  ｴ: "エ",
  ﾃ: "テ",
  ｱ: "ア",
  ｻ: "サ",
  ｷ: "キ",
  ﾕ: "ユ",
  ﾒ: "メ",
  ﾐ: "ミ",
  ｼ: "シ",
  ﾋ: "ヒ",
  ﾓ: "モ",
  ｾ: "セ",
  ｽ: "ス",
};

const toFullwidthKanaI105 = (literal: string): string =>
  Array.from(
    literal,
    (character) => I105_CANONICAL_TO_FULLWIDTH_KANA[character] ?? character,
  ).join("");

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

  it("preserves detected native account prefixes when no network override is supplied", () => {
    const taira = deriveAccountAddressView({
      domain: "default",
      publicKeyHex: SAMPLE_PUBLIC_KEY_HEX,
      networkPrefix: 369,
    });
    const mainnet = deriveAccountAddressView({
      domain: "default",
      publicKeyHex: SAMPLE_PUBLIC_KEY_HEX,
      networkPrefix: 753,
    });

    expect(
      normalizeCanonicalAccountIdLiteral(taira.i105AccountId, "accountId"),
    ).toBe(taira.i105AccountId);
    expect(
      normalizeCanonicalAccountIdLiteral(mainnet.i105AccountId, "accountId"),
    ).toBe(mainnet.i105AccountId);
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

  it("accepts half-width katakana compatibility literals from Python tooling", () => {
    const halfWidthLiteral =
      "testuﾛ1NﾐヱﾇCﾍUovﾏﾊｺｸﾛJbｵVtﾍykRﾗﾊhﾄﾏKqTjUｺwﾒrym3GS93U";

    expect(
      normalizeCanonicalAccountIdLiteral(halfWidthLiteral, "accountId", 369),
    ).toBe(halfWidthLiteral);
  });

  it("accepts full-width kana account literals as UTF-8 input", () => {
    const derived = deriveAccountAddressView({
      domain: "default",
      publicKeyHex: SAMPLE_PUBLIC_KEY_HEX,
      networkPrefix: 369,
    });
    const fullwidthLiteral = toFullwidthKanaI105(derived.i105AccountId);

    expect(fullwidthLiteral).not.toBe(derived.i105AccountId);
    expect(Buffer.from(fullwidthLiteral, "utf8").length).toBeGreaterThan(
      fullwidthLiteral.length,
    );
    expect(
      normalizeCanonicalAccountIdLiteral(fullwidthLiteral, "accountId", 369),
    ).toBe(derived.i105AccountId);
    expect(
      normalizeCompatAccountIdLiteral(fullwidthLiteral, "accountId", 369),
    ).toBe(derived.accountId);
    expect(
      Buffer.from(
        parseAccountAddressLiteral(
          fullwidthLiteral,
          "accountId",
          369,
        ).canonicalBytes(),
      ).toString("hex"),
    ).toBe(
      Buffer.from(
        parseAccountAddressLiteral(
          derived.i105AccountId,
          "accountId",
          369,
        ).canonicalBytes(),
      ).toString("hex"),
    );
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

  it("uses the selected signing algorithm when deriving I105 account literals", () => {
    const { publicKey } = generateKeyPair({
      algorithm: "secp256k1",
      seed: Buffer.alloc(32, 0x42),
    });
    const publicKeyHex = Buffer.from(publicKey).toString("hex");
    const derived = deriveAccountAddressView({
      domain: "default",
      publicKeyHex,
      networkPrefix: 369,
      signingAlgorithm: "secp256k1",
    });

    expect(derived.signingAlgorithm).toBe("secp256k1");
    expect(derived.accountId).toBe(
      AccountAddress.fromAccount({
        publicKey,
        algorithm: "secp256k1",
      }).toI105(369),
    );
    expect(() =>
      deriveAccountAddressView({
        domain: "default",
        publicKeyHex,
        networkPrefix: 369,
      }),
    ).toThrow(/payload size is incorrect|public key/i);
  });
});

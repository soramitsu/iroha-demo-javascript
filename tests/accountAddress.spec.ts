import { describe, expect, it } from "vitest";
import { secp256k1 } from "@noble/curves/secp256k1";
import { AccountAddress } from "@iroha/iroha-js";
import {
  deriveAccountAddressView,
  parseAccountAddressLiteral,
  normalizeCanonicalAccountIdLiteral,
  normalizeCanonicalI105AccountIdLiteral,
  requireAccountIdBoundToPublicKey,
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
  it("rejects oversized or whitespace-padded key material before decoding", () => {
    expect(() =>
      deriveAccountAddressView({
        domain: "default",
        publicKeyHex: ` ${SAMPLE_PUBLIC_KEY_HEX}`,
        networkPrefix: 369,
      }),
    ).toThrow(/canonical even-length hex/u);
    expect(() =>
      deriveAccountAddressView({
        domain: "default",
        publicKeyHex: "aa".repeat(16 * 1024 + 1),
        networkPrefix: 369,
      }),
    ).toThrow(/bounded canonical/u);
  });

  it("bounds the local-only domain label even though it does not affect the address", () => {
    expect(() =>
      deriveAccountAddressView({
        domain: ` ${"a".repeat(10)}`,
        publicKeyHex: SAMPLE_PUBLIC_KEY_HEX,
        networkPrefix: 369,
      }),
    ).toThrow(/domain must be bounded canonical/u);
    expect(() =>
      deriveAccountAddressView({
        domain: "a".repeat(257),
        publicKeyHex: SAMPLE_PUBLIC_KEY_HEX,
        networkPrefix: 369,
      }),
    ).toThrow(/domain must be bounded canonical/u);
  });

  it("derives one canonical I105 account literal for the configured network", () => {
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
    expect(derived.i105AccountId).toBe(derived.accountId);
    expect(derived.i105AccountId.startsWith("testu")).toBe(true);
    expect(derived.i105DefaultAccountId.startsWith("sorau")).toBe(true);
  });

  it("accepts an exact canonical literal through the incoming-ID helper", () => {
    const derived = deriveAccountAddressView({
      domain: "default",
      publicKeyHex: SAMPLE_PUBLIC_KEY_HEX,
      networkPrefix: 369,
    });

    expect(
      normalizeCanonicalAccountIdLiteral(
        derived.i105AccountId,
        "accountId",
        369,
      ),
    ).toBe(derived.accountId);
  });

  it("binds a stored account ID to the exact signing public key", () => {
    const accountId = AccountAddress.fromAccount({
      publicKey: Buffer.from(SAMPLE_PUBLIC_KEY_HEX, "hex"),
      algorithm: "ed25519",
    }).toI105(369);

    expect(
      requireAccountIdBoundToPublicKey({
        accountId,
        publicKeyHex: SAMPLE_PUBLIC_KEY_HEX,
        networkPrefix: 369,
        signingAlgorithm: "ed25519",
      }),
    ).toBe(accountId);
    expect(() =>
      requireAccountIdBoundToPublicKey({
        accountId,
        publicKeyHex:
          "d04ab232742bb4ab3a1368bd4615e4e6d0224ab71a016baf8520a332c9778737",
        networkPrefix: 369,
        signingAlgorithm: "ed25519",
      }),
    ).toThrow(/does not match the supplied signing key/u);
  });

  it("requires the caller to supply the exact network prefix", () => {
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

    expect(() =>
      normalizeCanonicalAccountIdLiteral(
        taira.i105AccountId,
        "accountId",
        undefined as unknown as number,
      ),
    ).toThrow(/networkPrefix must be an integer/i);
    expect(
      normalizeCanonicalAccountIdLiteral(
        mainnet.i105AccountId,
        "accountId",
        753,
      ),
    ).toBe(mainnet.i105AccountId);
    expect(
      normalizeCanonicalAccountIdLiteral(taira.i105AccountId, "accountId", 369),
    ).toBe(taira.i105AccountId);
  });

  it("rejects a valid account literal from a different network prefix", () => {
    const derived = deriveAccountAddressView({
      domain: "default",
      publicKeyHex: SAMPLE_PUBLIC_KEY_HEX,
      networkPrefix: 369,
    });

    expect(() =>
      normalizeCanonicalAccountIdLiteral(
        derived.i105DefaultAccountId,
        "accountId",
        369,
      ),
    ).toThrow(/network prefix 369/i);
    expect(() =>
      parseAccountAddressLiteral(
        derived.i105DefaultAccountId,
        "accountId",
        369,
      ),
    ).toThrow(/network prefix 369/i);
  });

  it("returns an exact canonical literal unchanged for Torii wire requests", () => {
    const derived = deriveAccountAddressView({
      domain: "default",
      publicKeyHex: SAMPLE_PUBLIC_KEY_HEX,
      networkPrefix: 369,
    });
    const canonicalAccountId = normalizeCanonicalAccountIdLiteral(
      derived.i105AccountId,
      "accountId",
      369,
    );

    expect(canonicalAccountId.startsWith("testu")).toBe(true);
    expect(
      normalizeCanonicalAccountIdLiteral(derived.accountId, "accountId", 369),
    ).toBe(canonicalAccountId);
    expect(() =>
      normalizeCanonicalAccountIdLiteral(
        ` ${derived.i105AccountId}`,
        "accountId",
        369,
      ),
    ).toThrow(/without surrounding whitespace/i);
    expect(() =>
      normalizeCanonicalAccountIdLiteral(
        `${derived.i105AccountId}\n`,
        "accountId",
        369,
      ),
    ).toThrow(/without surrounding whitespace/i);
  });

  it("accepts an exact canonical half-width I105 literal", () => {
    const halfWidthLiteral =
      "testuﾛ1NﾐヱﾇCﾍUovﾏﾊｺｸﾛJbｵVtﾍykRﾗﾊhﾄﾏKqTjUｺwﾒrym3GS93U";

    expect(
      normalizeCanonicalAccountIdLiteral(halfWidthLiteral, "accountId", 369),
    ).toBe(halfWidthLiteral);
    expect(
      normalizeCanonicalI105AccountIdLiteral(halfWidthLiteral, "accountId"),
    ).toBe(halfWidthLiteral);
    expect(() =>
      normalizeCanonicalI105AccountIdLiteral(
        toFullwidthKanaI105(halfWidthLiteral),
        "accountId",
      ),
    ).toThrow(/canonical I105 account ID/i);
  });

  it("accepts the SDK's full I105 prefix range for read-only account filters", () => {
    const accountId = AccountAddress.fromAccount({
      publicKey: Buffer.from(SAMPLE_PUBLIC_KEY_HEX, "hex"),
    }).toI105(16_384);

    expect(normalizeCanonicalI105AccountIdLiteral(accountId, "accountId")).toBe(
      accountId,
    );
    expect(() =>
      normalizeCanonicalAccountIdLiteral(accountId, "accountId", 16_384),
    ).toThrow(/networkPrefix must be an integer/u);
  });

  it("rejects noncanonical full-width kana variants", () => {
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
    expect(() =>
      normalizeCanonicalAccountIdLiteral(fullwidthLiteral, "accountId", 369),
    ).toThrow(/canonical I105 account ID/i);
    expect(() =>
      parseAccountAddressLiteral(fullwidthLiteral, "accountId", 369),
    ).toThrow(/canonical I105 account ID/i);

    expect(
      Buffer.from(
        parseAccountAddressLiteral(
          derived.i105AccountId,
          "accountId",
          369,
        ).canonicalBytes(),
      ).toString("hex"),
    ).toBe(
      Buffer.from(
        AccountAddress.parseEncoded(
          derived.i105AccountId,
          369,
        ).address.canonicalBytes(),
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
    const publicKey = secp256k1.getPublicKey(
      Uint8Array.from({ length: 32 }, () => 0x42),
      true,
    );
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

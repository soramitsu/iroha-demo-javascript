import { describe, expect, it } from "vitest";
import { AccountAddress } from "@iroha/iroha-js";
import { generateKeyPair } from "@iroha/iroha-js/crypto";
import {
  decryptPayloadForAccount,
  encryptPayloadForAccountId,
  extractAccountPublicKeyHex,
} from "../electron/accountSealedBox";

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

describe("account sealed box helpers", () => {
  it("roundtrips encrypted payloads through an I105 account id", () => {
    const alice = generateKeyPair();
    const accountId = AccountAddress.fromAccount({
      publicKey: alice.publicKey,
    }).toI105(369);

    const sealed = encryptPayloadForAccountId(
      {
        amount: "7",
        asset: "xor#universal",
      },
      accountId,
    );
    const decrypted = decryptPayloadForAccount<{
      amount: string;
      asset: string;
    }>(sealed, alice.privateKey.toString("hex"));

    expect(decrypted).toEqual({
      amount: "7",
      asset: "xor#universal",
    });
  });

  it("extracts the original Ed25519 public key from the account literal", () => {
    const alice = generateKeyPair();
    const accountId = AccountAddress.fromAccount({
      publicKey: alice.publicKey,
    }).toI105(369);

    expect(extractAccountPublicKeyHex(accountId)).toBe(
      alice.publicKey.toString("hex").toUpperCase(),
    );
  });

  it("extracts account public keys from full-width kana UTF-8 literals", () => {
    const alice = generateKeyPair();
    const accountId = AccountAddress.fromAccount({
      publicKey: alice.publicKey,
    }).toI105(369);
    const fullwidthAccountId = toFullwidthKanaI105(accountId);

    expect(Buffer.from(fullwidthAccountId, "utf8").length).toBeGreaterThan(
      fullwidthAccountId.length,
    );
    expect(extractAccountPublicKeyHex(fullwidthAccountId)).toBe(
      alice.publicKey.toString("hex").toUpperCase(),
    );
  });

  it("rejects decryption with the wrong wallet key", () => {
    const alice = generateKeyPair();
    const bob = generateKeyPair();
    const accountId = AccountAddress.fromAccount({
      publicKey: alice.publicKey,
    }).toI105(369);
    const sealed = encryptPayloadForAccountId({ ok: true }, accountId);

    expect(() =>
      decryptPayloadForAccount(sealed, bob.privateKey.toString("hex")),
    ).toThrow();
  });
});

import { describe, expect, it } from "vitest";
import { AccountAddress } from "@iroha/iroha-js";
import { generateKeyPair } from "@iroha/iroha-js/crypto";
import {
  decryptPayloadForAccount,
  encryptPayloadForAccountId,
  extractAccountPublicKeyHex,
} from "../electron/accountSealedBox";

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

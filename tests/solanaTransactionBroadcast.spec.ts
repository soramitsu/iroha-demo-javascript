// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { bindSignedSolanaTransactionForBroadcast } from "../electron/solanaTransaction";

const payer = Keypair.fromSeed(
  Uint8Array.from({ length: 32 }, (_, i) => i + 1),
);
const otherPayer = Keypair.fromSeed(
  Uint8Array.from({ length: 32 }, (_, i) => 32 - i),
);
const programId = new PublicKey("11111111111111111111111111111113");
const account = new PublicKey("11111111111111111111111111111114");
const blockhash = "11111111111111111111111111111115";

const unsignedTransaction = (): Transaction =>
  new Transaction({
    feePayer: payer.publicKey,
    recentBlockhash: blockhash,
  }).add(
    new TransactionInstruction({
      programId,
      keys: [{ pubkey: account, isSigner: false, isWritable: true }],
      data: Buffer.from([1, 2, 3, 4]),
    }),
  );

const encodeUnsigned = (transaction = unsignedTransaction()): string =>
  transaction
    .serialize({ requireAllSignatures: false, verifySignatures: false })
    .toString("base64");

const encodeSigned = (
  transaction = unsignedTransaction(),
  signer = payer,
): string => {
  transaction.sign(signer);
  return transaction.serialize().toString("base64");
};

describe("controlled Solana transaction broadcast binding", () => {
  it("accepts only the payer signature over the exact requested message", () => {
    const expectedUnsignedTransactionB64 = encodeUnsigned();
    const signedTransactionB64 = encodeSigned();
    const result = bindSignedSolanaTransactionForBroadcast({
      expectedUnsignedTransactionB64,
      signedTransactionB64,
    });

    expect(result.transactionB64).toBe(signedTransactionB64);
    expect(result.feePayer).toBe(payer.publicKey.toBase58());
    expect(result.signatureBytes).toHaveLength(64);
    expect(Array.from(result.signatureBytes).some((byte) => byte !== 0)).toBe(
      true,
    );
  });

  it.each([
    [
      "instruction data",
      () => {
        const transaction = unsignedTransaction();
        transaction.instructions[0].data = Buffer.from([1, 2, 3, 5]);
        return transaction;
      },
    ],
    [
      "program id",
      () => {
        const transaction = unsignedTransaction();
        transaction.instructions[0].programId = new PublicKey(
          "11111111111111111111111111111116",
        );
        return transaction;
      },
    ],
    [
      "account",
      () => {
        const transaction = unsignedTransaction();
        transaction.instructions[0].keys[0].pubkey = new PublicKey(
          "11111111111111111111111111111117",
        );
        return transaction;
      },
    ],
    [
      "account privileges",
      () => {
        const transaction = unsignedTransaction();
        transaction.instructions[0].keys[0].isWritable = false;
        return transaction;
      },
    ],
    [
      "recent blockhash",
      () => {
        const transaction = unsignedTransaction();
        transaction.recentBlockhash = "11111111111111111111111111111118";
        return transaction;
      },
    ],
    [
      "extra instruction",
      () => {
        const transaction = unsignedTransaction();
        transaction.add(
          new TransactionInstruction({
            programId,
            keys: [],
            data: Buffer.from([9]),
          }),
        );
        return transaction;
      },
    ],
  ])("rejects wallet substitution of the %s", (_label, mutate) => {
    expect(() =>
      bindSignedSolanaTransactionForBroadcast({
        expectedUnsignedTransactionB64: encodeUnsigned(),
        signedTransactionB64: encodeSigned(mutate()),
      }),
    ).toThrow(/message does not exactly match/u);
  });

  it("rejects a different payer even when that payer validly signed", () => {
    const substituted = unsignedTransaction();
    substituted.feePayer = otherPayer.publicKey;
    expect(() =>
      bindSignedSolanaTransactionForBroadcast({
        expectedUnsignedTransactionB64: encodeUnsigned(),
        signedTransactionB64: encodeSigned(substituted, otherPayer),
      }),
    ).toThrow(/payer does not match/u);
  });

  it("rejects a missing, corrupt, or non-canonical signature", () => {
    expect(() =>
      bindSignedSolanaTransactionForBroadcast({
        expectedUnsignedTransactionB64: encodeUnsigned(),
        signedTransactionB64: encodeUnsigned(),
      }),
    ).toThrow(/exactly one payer signature/u);

    const corrupt = Transaction.from(Buffer.from(encodeSigned(), "base64"));
    corrupt.signatures[0].signature![0] ^= 0xff;
    const corruptB64 = corrupt
      .serialize({ requireAllSignatures: false, verifySignatures: false })
      .toString("base64");
    expect(() =>
      bindSignedSolanaTransactionForBroadcast({
        expectedUnsignedTransactionB64: encodeUnsigned(),
        signedTransactionB64: corruptB64,
      }),
    ).toThrow(/signature is invalid/u);
  });

  it("rejects an already-signed expected transaction", () => {
    expect(() =>
      bindSignedSolanaTransactionForBroadcast({
        expectedUnsignedTransactionB64: encodeSigned(),
        signedTransactionB64: encodeSigned(),
      }),
    ).toThrow(/empty payer signature/u);
  });

  it.each(["", " AQ== ", "AQ=", "!!!!", "AQIDBA=="])(
    "rejects malformed transaction encoding %#",
    (transactionB64) => {
      expect(() =>
        bindSignedSolanaTransactionForBroadcast({
          expectedUnsignedTransactionB64: encodeUnsigned(),
          signedTransactionB64: transactionB64,
        }),
      ).toThrow(/Solana transaction/u);
    },
  );
});

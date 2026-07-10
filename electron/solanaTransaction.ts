import { Transaction } from "@solana/web3.js";

const MAX_SOLANA_TRANSACTION_BYTES = 1232;
const BASE64_PATTERN =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;

const decodeCanonicalTransaction = (
  value: unknown,
  label: string,
): { encoded: string; bytes: Buffer; transaction: Transaction } => {
  if (typeof value !== "string") {
    throw new Error(`${label} must be canonical base64 transaction bytes.`);
  }
  const encoded = value.trim();
  if (!encoded || !BASE64_PATTERN.test(encoded)) {
    throw new Error(`${label} must be canonical base64 transaction bytes.`);
  }
  const bytes = Buffer.from(encoded, "base64");
  if (
    bytes.length === 0 ||
    bytes.length > MAX_SOLANA_TRANSACTION_BYTES ||
    bytes.toString("base64") !== encoded
  ) {
    throw new Error(`${label} must be canonical base64 transaction bytes.`);
  }
  let transaction: Transaction;
  try {
    transaction = Transaction.from(bytes);
  } catch (_error) {
    throw new Error(`${label} must be a canonical legacy Solana transaction.`);
  }
  return { encoded, bytes, transaction };
};

export type ControlledSolanaBroadcast = {
  transactionB64: string;
  signatureBytes: Uint8Array;
  feePayer: string;
};

/**
 * Bind a wallet-returned signed transaction to the exact unsigned message the
 * app constructed. Only the payer signature may change. This prevents a wallet
 * or connector from substituting another transaction before the preload-owned
 * RPC broadcast.
 */
export const bindSignedSolanaTransactionForBroadcast = (input: {
  expectedUnsignedTransactionB64: unknown;
  signedTransactionB64: unknown;
}): ControlledSolanaBroadcast => {
  const expected = decodeCanonicalTransaction(
    input.expectedUnsignedTransactionB64,
    "Expected unsigned Solana transaction",
  );
  const signed = decodeCanonicalTransaction(
    input.signedTransactionB64,
    "Wallet-signed Solana transaction",
  );

  if (
    expected.transaction.signatures.length !== 1 ||
    expected.transaction.signatures[0].signature !== null
  ) {
    throw new Error(
      "Expected Solana transaction must have exactly one empty payer signature.",
    );
  }
  if (
    signed.transaction.signatures.length !== 1 ||
    !signed.transaction.signatures[0].signature
  ) {
    throw new Error(
      "Wallet-signed Solana transaction must have exactly one payer signature.",
    );
  }
  const expectedPayer = expected.transaction.signatures[0].publicKey.toBase58();
  if (signed.transaction.signatures[0].publicKey.toBase58() !== expectedPayer) {
    throw new Error(
      "Wallet-signed Solana transaction payer does not match the requested transaction.",
    );
  }
  if (
    !signed.transaction
      .serializeMessage()
      .equals(expected.transaction.serializeMessage())
  ) {
    throw new Error(
      "Wallet-signed Solana transaction message does not exactly match the requested transaction.",
    );
  }
  if (!signed.transaction.verifySignatures(true)) {
    throw new Error(
      "Wallet-signed Solana transaction payer signature is invalid.",
    );
  }
  const signature = signed.transaction.signatures[0].signature;
  if (!signature || signature.every((byte) => byte === 0)) {
    throw new Error(
      "Wallet-signed Solana transaction payer signature must be non-zero.",
    );
  }

  return {
    transactionB64: signed.encoded,
    signatureBytes: Uint8Array.from(signature),
    feePayer: expectedPayer,
  };
};

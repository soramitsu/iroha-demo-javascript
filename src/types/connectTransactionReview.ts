/**
 * Human-readable review of an IrohaConnect `SignRequestTx`, produced in
 * preload from the decoded transaction payload and shown in both the native
 * approval dialog and the renderer request modal.
 */
export type ConnectTransactionInstructionKind =
  | "transfer"
  | "mint"
  | "burn"
  | "grant_permission"
  | "grant"
  | "settlement_atomic"
  | "settlement"
  | "escrow"
  | "repo"
  | "unknown"
  | "undecoded";

export interface ConnectTransactionReviewField {
  label: string;
  value: string;
}

export interface ConnectTransactionInstructionReview {
  /** One-based position in the executable. */
  index: number;
  /** Norito wire identifier read from the instruction archive. */
  wireId: string;
  kind: ConnectTransactionInstructionKind;
  title: string;
  fields: ConnectTransactionReviewField[];
  /** Canonical decoded instruction JSON (bounded), or null when undecodable. */
  json: string | null;
  warning: string | null;
}

export interface ConnectTransactionReview {
  schema: "iroha.wallet.connect-transaction-review.v1";
  /** Session NetworkId the payload was verified against. */
  networkId: string;
  /** Payload authority, verified equal to the paired account. */
  authority: string;
  /** Exact 32-byte payload hash that will be Ed25519-signed (lowercase hex). */
  payloadHashHex: string;
  payloadByteLength: number;
  /** Decimal u64 strings. */
  creationTimeMs: string;
  ttlMs: string | null;
  executable: "instructions" | "batch";
  instructions: ConnectTransactionInstructionReview[];
  warnings: string[];
}

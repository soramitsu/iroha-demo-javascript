import { Buffer } from "node:buffer";
import { blake2b } from "@noble/hashes/blake2b";
import { NetworkId } from "@iroha/iroha-js/canonical-request";
import * as transactionCodec from "@iroha/iroha-js/transaction-codec";
import {
  getInstalledIrohaJsNativeBinding,
  installGlobalIrohaJsNativeBinding,
} from "./irohaJsNativeDir";
import { parseStrictJson } from "./secureBoundedJson";
import type {
  ConnectTransactionInstructionReview,
  ConnectTransactionReview,
  ConnectTransactionReviewField,
} from "../src/types/connectTransactionReview";

export type {
  ConnectTransactionInstructionReview,
  ConnectTransactionReview,
  ConnectTransactionReviewField,
} from "../src/types/connectTransactionReview";

/**
 * Human-readable review of one IrohaConnect `SignRequestTx`.
 *
 * The app sends the canonical unsigned transaction payload bytes produced by
 * the SDK's `buildTransactionPayload`. Iroha verifies transaction signatures
 * over `HashOf<TransactionPayload>` (BLAKE2b-256 of the payload bytes with the
 * least-significant bit of the last byte set), so the wallet:
 *
 * 1. decodes and validates the payload with the SDK codec, binding its
 *    authority to the paired account and its NetworkId to the session;
 * 2. decodes every instruction with the native Norito decoder and renders it;
 * 3. signs only the payload hash, after the user approves the rendered review.
 */

export const CONNECT_TRANSACTION_REVIEW_SCHEMA =
  "iroha.wallet.connect-transaction-review.v1";
export const CONNECT_TRANSACTION_MAX_INSTRUCTIONS = 64;
const MAX_JSON_PREVIEW_CHARACTERS = 4_096;
const MAX_FIELD_VALUE_CHARACTERS = 512;
const MAX_UNDECODED_PREVIEW_BYTES = 48;
const EXECUTABLE_INSTRUCTIONS = 0;
const EXECUTABLE_BATCH = 4;

type PayloadBindings = {
  networkId: Uint8Array;
  creationTimeMs: bigint;
  ttlMs: bigint | null;
  executableArchive: Uint8Array;
};

export type ConnectTransactionDecoder = {
  /** Validate the canonical outer payload and bind its authority. */
  inspectPayload(
    payloadBytes: Uint8Array,
    expectedAuthority: string,
    networkPrefix: number,
  ): PayloadBindings;
  /** Decode one compact `InstructionBox` archive into its JSON contract. */
  decodeInstructionArchive(archive: Uint8Array, networkPrefix: number): string;
};

const sdkInspectPayload = (): ConnectTransactionDecoder["inspectPayload"] => {
  const candidate = (
    transactionCodec as unknown as {
      inspectCanonicalTransactionPayloadBindings?: unknown;
    }
  ).inspectCanonicalTransactionPayloadBindings;
  if (typeof candidate !== "function") {
    throw new Error(
      "The selected @iroha/iroha-js SDK does not expose inspectCanonicalTransactionPayloadBindings.",
    );
  }
  return candidate as ConnectTransactionDecoder["inspectPayload"];
};

const nativeDecodeInstructionArchive = (
  archive: Uint8Array,
  networkPrefix: number,
): string => {
  const native =
    getInstalledIrohaJsNativeBinding() ??
    installGlobalIrohaJsNativeBinding(import.meta.url);
  const decode = native?.noritoDecodeInstructionBoxArchive;
  if (typeof decode !== "function") {
    throw new Error(
      "The Iroha native binding does not expose noritoDecodeInstructionBoxArchive.",
    );
  }
  const json = decode(Buffer.from(archive), networkPrefix);
  if (typeof json !== "string") {
    throw new Error("Native instruction decoder returned a non-string value.");
  }
  return json;
};

export const defaultConnectTransactionDecoder =
  (): ConnectTransactionDecoder => ({
    inspectPayload: (payloadBytes, expectedAuthority, networkPrefix) =>
      sdkInspectPayload()(payloadBytes, expectedAuthority, networkPrefix),
    decodeInstructionArchive: nativeDecodeInstructionArchive,
  });

/** Iroha `HashOf<TransactionPayload>`: BLAKE2b-256 with the low bit set. */
export const irohaTransactionPayloadHash = (
  payloadBytes: Uint8Array,
): Uint8Array => {
  const digest = blake2b(new Uint8Array(payloadBytes), { dkLen: 32 });
  digest[digest.length - 1] |= 1;
  return digest;
};

class ArchiveReader {
  #offset = 0;
  constructor(
    private readonly bytes: Uint8Array,
    private readonly label: string,
  ) {}

  #take(length: number, field: string): Uint8Array {
    if (
      !Number.isSafeInteger(length) ||
      length < 0 ||
      this.#offset + length > this.bytes.length
    ) {
      throw new Error(`${this.label}.${field} is truncated.`);
    }
    const value = this.bytes.subarray(this.#offset, this.#offset + length);
    this.#offset += length;
    return value;
  }

  u32(field: string): number {
    return Buffer.from(this.#take(4, field)).readUInt32LE(0);
  }

  u64(field: string): bigint {
    return Buffer.from(this.#take(8, field)).readBigUInt64LE(0);
  }

  compactLength(field: string): number {
    let value = 0n;
    let shift = 0n;
    const start = this.#offset;
    for (let index = 0; index < 10; index += 1) {
      const byte = this.#take(1, field)[0]!;
      value |= BigInt(byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) {
        const consumed = this.#offset - start;
        let canonicalLength = 1;
        for (let rest = value >> 7n; rest > 0n; rest >>= 7n) {
          canonicalLength += 1;
        }
        if (consumed !== canonicalLength || value > 1n << 32n) {
          throw new Error(
            `${this.label}.${field} uses a noncanonical length prefix.`,
          );
        }
        return Number(value);
      }
      shift += 7n;
    }
    throw new Error(`${this.label}.${field} length prefix is invalid.`);
  }

  field(field: string): Uint8Array {
    return this.#take(this.compactLength(field), field);
  }

  assertEof() {
    if (this.#offset !== this.bytes.length) {
      throw new Error(
        `${this.label} contains ${this.bytes.length - this.#offset} trailing bytes.`,
      );
    }
  }
}

type ExecutableEntry =
  | { kind: "instruction"; archive: Uint8Array }
  | { kind: "contractCall"; archive: Uint8Array };

const readExecutableEntries = (
  executable: Uint8Array,
): {
  executable: ConnectTransactionReview["executable"];
  entries: ExecutableEntry[];
} => {
  const reader = new ArchiveReader(executable, "transaction executable");
  const variant = reader.u32("variant");
  if (variant !== EXECUTABLE_INSTRUCTIONS && variant !== EXECUTABLE_BATCH) {
    throw new Error(
      `Transaction executable variant ${variant} cannot be reviewed; only native instruction lists and batches are signable here.`,
    );
  }
  const list = new ArchiveReader(
    reader.field(
      variant === EXECUTABLE_INSTRUCTIONS ? "instructions" : "entries",
    ),
    "transaction executable list",
  );
  reader.assertEof();
  const count = list.u64("count");
  if (count === 0n || count > BigInt(CONNECT_TRANSACTION_MAX_INSTRUCTIONS)) {
    throw new Error(
      `Transaction must contain 1..=${CONNECT_TRANSACTION_MAX_INSTRUCTIONS} instructions.`,
    );
  }
  const entries: ExecutableEntry[] = [];
  for (let index = 0; index < Number(count); index += 1) {
    const item = list.field(`item[${index}]`);
    if (variant === EXECUTABLE_INSTRUCTIONS) {
      entries.push({ kind: "instruction", archive: item });
      continue;
    }
    const entry = new ArchiveReader(item, `batch entry ${index}`);
    const tag = entry.u32("variant");
    const value = entry.field("value");
    entry.assertEof();
    if (tag !== 0 && tag !== 1) {
      throw new Error(`Batch entry ${index} uses unsupported variant ${tag}.`);
    }
    entries.push({
      kind: tag === 0 ? "instruction" : "contractCall",
      archive: value,
    });
  }
  list.assertEof();
  return {
    executable: variant === EXECUTABLE_INSTRUCTIONS ? "instructions" : "batch",
    entries,
  };
};

/** The wire identifier is the first field of every compact instruction archive. */
export const readInstructionWireId = (archive: Uint8Array): string => {
  try {
    const outer = new ArchiveReader(archive, "instruction archive");
    const wire = new ArchiveReader(
      outer.field("wire_id"),
      "instruction wire id",
    );
    const text = Buffer.from(wire.field("text")).toString("utf8");
    wire.assertEof();
    return /^[\x20-\x7e]{1,256}$/u.test(text) ? text : "unknown";
  } catch {
    return "unknown";
  }
};

// Control and bidirectional-override characters could disguise what is being
// approved, so they are made visible before any value reaches a review surface.
const UNSAFE_DISPLAY_CHARACTERS =
  /[\p{Cc}\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu;

const bounded = (value: string, maximum = MAX_FIELD_VALUE_CHARACTERS) => {
  const visible = value.replace(UNSAFE_DISPLAY_CHARACTERS, "\ufffd");
  return visible.length > maximum
    ? `${visible.slice(0, maximum - 1)}…`
    : visible;
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const displayValue = (value: unknown): string =>
  bounded(
    typeof value === "string"
      ? value
      : typeof value === "number" || typeof value === "boolean"
        ? String(value)
        : value === null
          ? "null"
          : JSON.stringify(value),
  );

const field = (
  label: string,
  value: unknown,
): ConnectTransactionReviewField => ({
  label,
  value: displayValue(value),
});

const genericFields = (
  value: unknown,
  prefix = "",
): ConnectTransactionReviewField[] => {
  const record = asRecord(value);
  if (!record) {
    return [field(prefix || "Value", value)];
  }
  return Object.entries(record).map(([key, entry]) =>
    field(prefix ? `${prefix} ${key}` : key, entry),
  );
};

/** Split `definition#owner` (and scoped variants) asset-holding literals. */
const splitAssetHolding = (
  holding: unknown,
): { definition: string; owner: string } | null => {
  if (typeof holding !== "string") return null;
  const separator = holding.indexOf("#");
  if (separator <= 0) return null;
  return {
    definition: holding.slice(0, separator),
    owner: holding.slice(separator + 1),
  };
};

const singleVariant = (value: unknown): [string, unknown] | null => {
  const record = asRecord(value);
  if (!record) return null;
  const keys = Object.keys(record);
  return keys.length === 1 ? [keys[0]!, record[keys[0]!]] : null;
};

const describeHoldingMovement = (
  label: string,
  source: unknown,
  quantity: unknown,
  recipient: unknown,
): ConnectTransactionReviewField => {
  const holding = splitAssetHolding(source);
  return {
    label,
    value: bounded(
      holding
        ? `${displayValue(quantity)} of ${holding.definition} from ${holding.owner} to ${displayValue(recipient)}`
        : `${displayValue(quantity)} from ${displayValue(source)} to ${displayValue(recipient)}`,
    ),
  };
};

const ESCROW_INSTRUCTION_TITLES: Record<string, string> = {
  OpenConditionalEscrow: "Open conditional escrow",
  AttestEscrowCondition: "Attest escrow condition",
  ExpireConditionalEscrow: "Expire conditional escrow",
  OpenAssetEscrow: "Open asset escrow",
  AcceptAssetEscrow: "Accept asset escrow",
  MarkEscrowPaymentSent: "Mark escrow payment sent",
  ReleaseAssetEscrow: "Release asset escrow",
  CancelAssetEscrow: "Cancel asset escrow",
  OpenEscrowDispute: "Open escrow dispute",
  ResolveEscrowDispute: "Resolve escrow dispute",
  OpenAssetLock: "Open asset lock",
  DrawdownAssetLock: "Draw down asset lock",
  CancelAssetLock: "Cancel asset lock",
  ExpireAssetLock: "Expire asset lock",
};

const REPO_VARIANT_TITLES: Record<string, string> = {
  Initiate: "Initiate repo",
  Reverse: "Reverse repo",
  MarginCall: "Repo margin call",
  RepoIsi: "Initiate repo",
  ReverseRepoIsi: "Reverse repo",
  RepoMarginCallIsi: "Repo margin call",
};

const BOND_FIELD_LABELS: Record<string, string> = {
  agreement_id: "Agreement ID",
  escrow_id: "Escrow ID",
  asset_definition: "Asset",
  beneficiary: "Beneficiary",
  amount: "Amount",
  initiator: "Borrower / initiator",
  counterparty: "Lender / counterparty",
  custodian: "Custodian",
  rate_bps: "Interest rate (basis points)",
  maturity_timestamp_ms: "Maturity (Unix milliseconds)",
  expires_at_ms: "Expiry (Unix milliseconds)",
  haircut_bps: "Collateral haircut (basis points)",
  margin_frequency_secs: "Margin interval (seconds)",
  allow_early_repayment: "Initiator may repay early",
  condition_id: "Condition ID",
  value: "Attested value",
  evidence_hashes: "Evidence hashes",
};

/** Keep every native field visible, with explicit cash, collateral and policy terms. */
const describeBondFields = (
  value: unknown,
): ConnectTransactionReviewField[] => {
  const record = asRecord(value);
  if (!record) return genericFields(value);
  const fields: ConnectTransactionReviewField[] = [];
  for (const [key, entry] of Object.entries(record)) {
    if (key === "governance" && asRecord(entry)) {
      fields.push(...describeBondFields(entry));
    } else if (
      (key === "cash_leg" || key === "collateral_leg") &&
      asRecord(entry)
    ) {
      const leg = asRecord(entry)!;
      fields.push(
        field(
          key === "cash_leg" ? "Cash principal" : "Collateral",
          `${displayValue(leg.quantity)} of ${displayValue(leg.asset_definition_id)}`,
        ),
      );
      for (const [legKey, legValue] of Object.entries(leg)) {
        if (legKey !== "quantity" && legKey !== "asset_definition_id") {
          fields.push(
            field(
              `${key === "cash_leg" ? "Cash" : "Collateral"} ${legKey}`,
              legValue,
            ),
          );
        }
      }
    } else if (key === "conditions" && Array.isArray(entry)) {
      entry.forEach((condition, index) =>
        fields.push(field(`Condition ${index + 1}`, condition)),
      );
    } else {
      fields.push(field(BOND_FIELD_LABELS[key] ?? key, entry));
    }
  }
  return fields;
};

type InstructionDescription = Pick<
  ConnectTransactionInstructionReview,
  "kind" | "title" | "fields"
> & { warnings?: string[] };

const describeSettlementAtomic = (
  value: unknown,
  sessionNetworkId: string,
): InstructionDescription => {
  const record = asRecord(value) ?? {};
  const fields: ConnectTransactionReviewField[] = [];
  const warnings: string[] = [];
  fields.push(field("Settlement ID", record.settlement_id));
  if (record.network_id !== undefined) {
    fields.push(field("Settlement network", record.network_id));
    if (record.network_id !== sessionNetworkId) {
      warnings.push(
        "The settlement intent names a different NetworkId than this session.",
      );
    }
  }
  if (record.expires_at_height !== undefined) {
    fields.push(field("Expires at block", record.expires_at_height));
  }
  const movements = Array.isArray(record.movements) ? record.movements : [];
  movements.forEach((movement, index) => {
    const entry = asRecord(movement) ?? {};
    fields.push(
      describeHoldingMovement(
        `Movement ${index + 1}`,
        entry.source,
        entry.quantity,
        entry.recipient,
      ),
    );
  });
  const escrows = Array.isArray(record.escrows) ? record.escrows : [];
  escrows.forEach((escrow, index) => {
    const entry = asRecord(escrow) ?? {};
    const holding = splitAssetHolding(entry.source);
    fields.push({
      label: `Escrow leg ${index + 1}`,
      value: bounded(
        `${displayValue(entry.amount)} of ${holding?.definition ?? displayValue(entry.source)} from ${holding?.owner ?? "?"} held for ${displayValue(entry.beneficiary)} (escrow ${displayValue(entry.escrow_id)}, expires ${displayValue(entry.expires_at_ms)} ms)`,
      ),
    });
    const conditions = Array.isArray(entry.conditions) ? entry.conditions : [];
    conditions.forEach((condition, conditionIndex) => {
      fields.push(
        field(
          `Escrow leg ${index + 1} condition ${conditionIndex + 1}`,
          condition,
        ),
      );
    });
  });
  const metadata = asRecord(record.metadata);
  if (metadata && Object.keys(metadata).length > 0) {
    fields.push(field("Metadata", metadata));
  }
  const known = new Set([
    "network_id",
    "settlement_id",
    "movements",
    "escrows",
    "expires_at_height",
    "metadata",
  ]);
  for (const [key, entry] of Object.entries(record)) {
    if (!known.has(key)) {
      fields.push(field(key, entry));
    }
  }
  return {
    kind: "settlement_atomic",
    title:
      escrows.length > 0
        ? `Atomic settlement (${movements.length} movements, ${escrows.length} escrow legs)`
        : `Atomic settlement (${movements.length} movements)`,
    fields,
    warnings,
  };
};

const describeGrant = (value: unknown): InstructionDescription => {
  const variant = singleVariant(value);
  if (!variant || variant[0] !== "Permission") {
    return {
      kind: "grant",
      title: `Grant ${variant?.[0] ?? "role or permission"}`,
      fields: genericFields(variant?.[1] ?? value),
    };
  }
  const record = asRecord(variant[1]) ?? {};
  const permission = asRecord(record.object) ?? {};
  const payload = asRecord(permission.payload);
  const fields: ConnectTransactionReviewField[] = [
    field("Permission", permission.name),
    field("Grantee", record.destination),
  ];
  if (permission.name === "CanExecuteSettlement" && payload) {
    fields.push(
      field("Debited asset", payload.debited_asset),
      field("Settlement ID", payload.settlement_id),
      field("Intent hash", payload.intent_hash),
    );
  } else if (payload) {
    fields.push(...genericFields(payload, "Permission"));
  }
  return {
    kind: "grant_permission",
    title:
      permission.name === "CanExecuteSettlement"
        ? "Grant settlement consent (CanExecuteSettlement)"
        : `Grant permission ${displayValue(permission.name)}`,
    fields,
  };
};

const describeInstruction = (
  json: unknown,
  sessionNetworkId: string,
): InstructionDescription => {
  const outer = singleVariant(json);
  if (!outer) {
    return { kind: "unknown", title: "Unrecognized instruction", fields: [] };
  }
  const [name, body] = outer;
  const inner = singleVariant(body);
  switch (name) {
    case "Transfer": {
      if (inner?.[0] === "Asset") {
        const record = asRecord(inner[1]) ?? {};
        const holding = splitAssetHolding(record.source);
        return {
          kind: "transfer",
          title: "Transfer asset",
          fields: [
            field("Amount", record.object),
            field("Asset", holding?.definition ?? record.source),
            field("From", holding?.owner ?? record.source),
            field("To", record.destination),
          ],
        };
      }
      return {
        kind: "transfer",
        title: `Transfer ${inner?.[0] ?? ""}`.trim(),
        fields: genericFields(inner?.[1] ?? body),
      };
    }
    case "Mint":
    case "Burn": {
      const record = asRecord(inner?.[1]) ?? {};
      const holding = splitAssetHolding(record.destination);
      return {
        kind: name === "Mint" ? "mint" : "burn",
        title:
          `${name} ${inner?.[0] === "Asset" ? "asset" : (inner?.[0] ?? "")}`.trim(),
        fields:
          inner?.[0] === "Asset"
            ? [
                field("Amount", record.object),
                field("Asset", holding?.definition ?? record.destination),
                field("Holder", holding?.owner ?? record.destination),
              ]
            : genericFields(inner?.[1] ?? body),
      };
    }
    case "Grant":
      return describeGrant(body);
    case "Settlement":
      if (inner?.[0] === "Atomic") {
        return describeSettlementAtomic(inner[1], sessionNetworkId);
      }
      return {
        kind: "settlement",
        title: `Settlement ${inner?.[0] ?? ""}`.trim(),
        fields: genericFields(inner?.[1] ?? body),
      };
    case "Repo":
    case "RepoInstructionBox": {
      const variant = inner?.[0] ?? "";
      return {
        kind: "repo",
        title: REPO_VARIANT_TITLES[variant] ?? `Repo ${variant}`.trim(),
        fields: describeBondFields(inner?.[1] ?? body),
      };
    }
    default:
      if (name in ESCROW_INSTRUCTION_TITLES) {
        return {
          kind: "escrow",
          title: ESCROW_INSTRUCTION_TITLES[name]!,
          fields: describeBondFields(body),
        };
      }
      if (name in REPO_VARIANT_TITLES) {
        return {
          kind: "repo",
          title: REPO_VARIANT_TITLES[name]!,
          fields: describeBondFields(body),
        };
      }
      return {
        kind: "unknown",
        title: `Unrecognized instruction ${name}`,
        fields: genericFields(body),
      };
  }
};

const titleFromWireId = (wireId: string): string => {
  const typeName = wireId.split("::").at(-1) ?? wireId;
  if (typeName in ESCROW_INSTRUCTION_TITLES) {
    return ESCROW_INSTRUCTION_TITLES[typeName]!;
  }
  if (wireId === "iroha.repo") return "Repo instruction";
  if (wireId === "iroha.settlement") return "Settlement instruction";
  return `Instruction ${wireId}`;
};

const parseInstructionJson = (json: string): unknown => {
  parseStrictJson(json, "Decoded instruction");
  return JSON.parse(json, function reviver(
    this: unknown,
    _key: string,
    value: unknown,
    context?: { source?: string },
  ) {
    return typeof value === "number" &&
      !Number.isSafeInteger(value) &&
      typeof context?.source === "string"
      ? context.source
      : value;
  } as (key: string, value: unknown) => unknown);
};

const reviewInstruction = (
  entry: ExecutableEntry,
  index: number,
  decoder: ConnectTransactionDecoder,
  networkPrefix: number,
  sessionNetworkId: string,
): ConnectTransactionInstructionReview => {
  if (entry.kind === "contractCall") {
    return {
      index: index + 1,
      wireId: "contract-call",
      kind: "undecoded",
      title: "Smart contract call",
      fields: [
        field("Archive bytes", entry.archive.length),
        field(
          "Archive prefix",
          Buffer.from(
            entry.archive.subarray(0, MAX_UNDECODED_PREVIEW_BYTES),
          ).toString("hex"),
        ),
      ],
      json: null,
      warning:
        "This wallet cannot render contract-call arguments; approve only if you trust the requesting app.",
    };
  }
  const wireId = readInstructionWireId(entry.archive);
  let json: string;
  try {
    json = decoder.decodeInstructionArchive(entry.archive, networkPrefix);
  } catch (error) {
    return {
      index: index + 1,
      wireId,
      kind: "undecoded",
      title: titleFromWireId(wireId),
      fields: [
        field("Wire ID", wireId),
        field("Archive bytes", entry.archive.length),
        field(
          "Archive prefix",
          Buffer.from(
            entry.archive.subarray(0, MAX_UNDECODED_PREVIEW_BYTES),
          ).toString("hex"),
        ),
      ],
      json: null,
      warning: `The wallet SDK could not decode this instruction (${bounded(
        error instanceof Error ? error.message : String(error),
        200,
      )}). Approve only if you trust the requesting app.`,
    };
  }
  const description = describeInstruction(
    parseInstructionJson(json),
    sessionNetworkId,
  );
  return {
    index: index + 1,
    wireId,
    kind: description.kind,
    title: description.title,
    fields: description.fields,
    json: bounded(json, MAX_JSON_PREVIEW_CHARACTERS),
    warning: description.warnings?.length
      ? description.warnings.join(" ")
      : description.kind === "unknown"
        ? "This instruction kind has no dedicated review; check the wire ID and JSON."
        : null,
  };
};

export const reviewConnectTransactionPayload = (input: {
  payloadBytes: Uint8Array;
  expectedAuthority: string;
  expectedNetworkId: string;
  networkPrefix: number;
  decoder?: ConnectTransactionDecoder;
}): { review: ConnectTransactionReview; payloadHash: Uint8Array } => {
  const decoder = input.decoder ?? defaultConnectTransactionDecoder();
  const payloadBytes = Uint8Array.from(input.payloadBytes);
  if (payloadBytes.length === 0) {
    throw new Error("IrohaConnect transaction payload is empty.");
  }
  const expectedNetworkId = NetworkId.parse(input.expectedNetworkId);
  let bindings: PayloadBindings;
  try {
    bindings = decoder.inspectPayload(
      payloadBytes,
      input.expectedAuthority,
      input.networkPrefix,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      /authority/iu.test(message)
        ? `The transaction authority is not the paired account: ${message}`
        : `The transaction payload is not a canonical Iroha payload: ${message}`,
    );
  }
  const payloadNetworkId = NetworkId.fromBytes(bindings.networkId).toString();
  if (payloadNetworkId !== expectedNetworkId.toString()) {
    throw new Error(
      `The transaction is for network ${payloadNetworkId}, not this session's ${expectedNetworkId.toString()}.`,
    );
  }
  const { executable, entries } = readExecutableEntries(
    Uint8Array.from(bindings.executableArchive),
  );
  const instructions = entries.map((entry, index) =>
    reviewInstruction(
      entry,
      index,
      decoder,
      input.networkPrefix,
      expectedNetworkId.toString(),
    ),
  );
  const payloadHash = irohaTransactionPayloadHash(payloadBytes);
  const warnings = instructions
    .filter((instruction) => instruction.warning)
    .map((instruction) => `#${instruction.index}: ${instruction.warning}`);
  return {
    payloadHash,
    review: {
      schema: CONNECT_TRANSACTION_REVIEW_SCHEMA,
      networkId: expectedNetworkId.toString(),
      authority: input.expectedAuthority,
      payloadHashHex: Buffer.from(payloadHash).toString("hex"),
      payloadByteLength: payloadBytes.length,
      creationTimeMs: bindings.creationTimeMs.toString(),
      ttlMs: bindings.ttlMs === null ? null : bindings.ttlMs.toString(),
      executable,
      instructions,
      warnings,
    },
  };
};

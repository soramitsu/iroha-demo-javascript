import { randomBytes } from "node:crypto";
import { blake2b } from "@noble/hashes/blake2.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha3_512 } from "@noble/hashes/sha3.js";
import {
  decryptPayloadForAccount,
  encryptPayloadForAccountId,
} from "./accountSealedBox";
import type { KaigiSealedBox } from "./kaigiCrypto";

export const CONFIDENTIAL_WALLET_METADATA_KEY =
  "iroha_demo_confidential_wallet";
export const CONFIDENTIAL_WALLET_METADATA_SCHEMA =
  "iroha-demo-confidential-wallet/v1";
export const CONFIDENTIAL_WALLET_NOTE_SCHEMA =
  "iroha-demo-confidential-note/v1";

type JsonRecord = Record<string, unknown>;

type ConfidentialInstructionLike = Record<string, unknown>;

export type WalletConfidentialTransactionLike = {
  entrypoint_hash?: string;
  result_ok?: boolean;
  authority?: string;
  metadata?: unknown;
  transaction_metadata?: unknown;
  tx_metadata?: unknown;
  transaction?: unknown;
  tx?: unknown;
  payload?: unknown;
  record?: unknown;
  instructions?: Array<ConfidentialInstructionLike | null | undefined>;
};

export type WalletConfidentialNote = {
  schema: typeof CONFIDENTIAL_WALLET_NOTE_SCHEMA;
  note_id: string;
  asset_definition_id: string;
  amount: string;
  rho_hex: string;
  commitment_hex: string;
  created_at_ms: number;
};

type WalletConfidentialMetadataRecord = {
  schema: typeof CONFIDENTIAL_WALLET_METADATA_SCHEMA;
  outputs: Array<{
    commitment_hex: string;
    envelope: KaigiSealedBox;
  }>;
};

export type WalletSpendableConfidentialNote = WalletConfidentialNote & {
  nullifier_hex: string;
  source_tx_hash: string;
};

export type WalletConfidentialLedger = {
  exact: boolean;
  notes: WalletSpendableConfidentialNote[];
  spendableQuantity: string;
};

const HEX_RE = /^[0-9a-fA-F]+$/;
const NOTE_COMMITMENT_LABEL = "iroha-demo:confidential-wallet:commitment:v1";
const NOTE_NULLIFIER_LABEL = "iroha-demo:confidential-wallet:nullifier:v1";
const CONFIDENTIAL_KEY_SALT = Buffer.from(
  "iroha:confidential:key-derivation:v1",
  "utf8",
);
const CONFIDENTIAL_INFO_NK = Buffer.from("iroha:confidential:nk", "utf8");

const trimString = (value: unknown): string => String(value ?? "").trim();

const isPlainRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseJsonRecord = (value: unknown): JsonRecord | null => {
  if (isPlainRecord(value)) {
    return value;
  }
  if (typeof value !== "string") {
    return null;
  }
  try {
    const parsed = JSON.parse(value);
    return isPlainRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const parsePositiveWholeAmount = (value: unknown, label: string): bigint => {
  const normalized = trimString(value);
  if (!/^\d+$/.test(normalized) || /^0+$/.test(normalized)) {
    throw new Error(`${label} must be a whole number greater than zero.`);
  }
  return BigInt(normalized);
};

const addWholeAmounts = (left: string, right: string): string =>
  (BigInt(left) + BigInt(right)).toString();

const hash32Hex = (label: string, parts: Array<string | Buffer>): string => {
  const chunks: Buffer[] = [Buffer.from(label, "utf8")];
  for (const part of parts) {
    const buffer = Buffer.isBuffer(part) ? part : Buffer.from(part, "utf8");
    const length = Buffer.alloc(8, 0);
    length.writeBigUInt64LE(BigInt(buffer.length));
    chunks.push(length, buffer);
  }
  return Buffer.from(
    blake2b(new Uint8Array(Buffer.concat(chunks)), { dkLen: 64 }),
  )
    .toString("hex")
    .slice(0, 64);
};

const hkdfSha3512 = (
  seed: Buffer,
  salt: Buffer,
  info: Buffer,
  length: number,
): Buffer => {
  const prk = Buffer.from(
    hmac(sha3_512, new Uint8Array(salt), new Uint8Array(seed)),
  );
  const chunks: Buffer[] = [];
  let previous = Buffer.alloc(0);
  let produced = 0;
  let counter = 1;
  while (produced < length) {
    previous = Buffer.from(
      hmac(
        sha3_512,
        new Uint8Array(prk),
        new Uint8Array(Buffer.concat([previous, info, Buffer.from([counter])])),
      ),
    );
    chunks.push(previous);
    produced += previous.length;
    counter += 1;
  }
  return Buffer.concat(chunks).subarray(0, length);
};

const deriveWalletNullifierKeyHex = (privateKeyHex: string): string => {
  const normalized = trimString(privateKeyHex).replace(/^0x/i, "");
  if (!HEX_RE.test(normalized) || ![64, 128].includes(normalized.length)) {
    throw new Error(
      "privateKeyHex must contain a 32-byte Ed25519 seed or 64-byte seed+public payload.",
    );
  }
  const seed = Buffer.from(normalized.slice(0, 64), "hex");
  return hkdfSha3512(
    seed,
    CONFIDENTIAL_KEY_SALT,
    CONFIDENTIAL_INFO_NK,
    32,
  ).toString("hex");
};

const readFixedBytesHex = (value: unknown): string | null => {
  if (typeof value === "string") {
    const normalized = trimString(value).replace(/^0x/i, "");
    return normalized.length === 64 && HEX_RE.test(normalized)
      ? normalized.toLowerCase()
      : null;
  }
  if (Array.isArray(value)) {
    const bytes = Buffer.from(value);
    return bytes.length === 32 ? bytes.toString("hex") : null;
  }
  if (Buffer.isBuffer(value)) {
    return value.length === 32 ? value.toString("hex") : null;
  }
  if (ArrayBuffer.isView(value)) {
    const bytes = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
    return bytes.length === 32 ? bytes.toString("hex") : null;
  }
  if (value instanceof ArrayBuffer) {
    const bytes = Buffer.from(value);
    return bytes.length === 32 ? bytes.toString("hex") : null;
  }
  return null;
};

const extractTransactionMetadata = (
  transaction: WalletConfidentialTransactionLike,
): JsonRecord | null => {
  const directCandidates = [
    transaction.metadata,
    transaction.transaction_metadata,
    transaction.tx_metadata,
  ];
  for (const candidate of directCandidates) {
    const record = parseJsonRecord(candidate);
    if (record) {
      return record;
    }
  }

  const nestedCandidates = [
    parseJsonRecord(transaction.transaction),
    parseJsonRecord(transaction.tx),
    parseJsonRecord(transaction.payload),
    parseJsonRecord(transaction.record),
  ];
  for (const candidate of nestedCandidates) {
    if (!candidate) {
      continue;
    }
    const nestedMetadata = [
      candidate.metadata,
      candidate.transaction_metadata,
      candidate.tx_metadata,
    ];
    for (const nestedCandidate of nestedMetadata) {
      const record = parseJsonRecord(nestedCandidate);
      if (record) {
        return record;
      }
    }
  }

  return null;
};

const parseWalletConfidentialNote = (
  value: unknown,
): WalletConfidentialNote | null => {
  if (!isPlainRecord(value)) {
    return null;
  }
  const schema = trimString(value.schema);
  if (schema !== CONFIDENTIAL_WALLET_NOTE_SCHEMA) {
    return null;
  }
  const noteId = trimString(value.note_id ?? value.noteId);
  const assetDefinitionId = trimString(
    value.asset_definition_id ?? value.assetDefinitionId,
  );
  const amount = trimString(value.amount);
  const rhoHex = trimString(value.rho_hex ?? value.rhoHex).toLowerCase();
  const commitmentHex = trimString(
    value.commitment_hex ?? value.commitmentHex,
  ).toLowerCase();
  const createdAtMs = Number(value.created_at_ms ?? value.createdAtMs);
  if (
    !noteId ||
    !assetDefinitionId ||
    !/^\d+$/.test(amount) ||
    !/^[0-9a-f]{64}$/.test(rhoHex) ||
    !/^[0-9a-f]{64}$/.test(commitmentHex) ||
    !Number.isFinite(createdAtMs) ||
    createdAtMs < 0
  ) {
    return null;
  }
  return {
    schema: CONFIDENTIAL_WALLET_NOTE_SCHEMA,
    note_id: noteId,
    asset_definition_id: assetDefinitionId,
    amount,
    rho_hex: rhoHex,
    commitment_hex: commitmentHex,
    created_at_ms: Math.trunc(createdAtMs),
  };
};

const parseWalletConfidentialMetadataRecord = (
  value: unknown,
): WalletConfidentialMetadataRecord | null => {
  if (!isPlainRecord(value)) {
    return null;
  }
  const schema = trimString(value.schema);
  if (schema !== CONFIDENTIAL_WALLET_METADATA_SCHEMA) {
    return null;
  }
  const outputs = Array.isArray(value.outputs) ? value.outputs : [];
  const normalizedOutputs = outputs
    .map((entry) => {
      if (!isPlainRecord(entry) || !isPlainRecord(entry.envelope)) {
        return null;
      }
      const commitmentHex = trimString(
        entry.commitment_hex ?? entry.commitmentHex,
      ).toLowerCase();
      if (!/^[0-9a-f]{64}$/.test(commitmentHex)) {
        return null;
      }
      return {
        commitment_hex: commitmentHex,
        envelope: entry.envelope as unknown as KaigiSealedBox,
      };
    })
    .filter(
      (entry): entry is WalletConfidentialMetadataRecord["outputs"][number] =>
        Boolean(entry),
    );

  return {
    schema: CONFIDENTIAL_WALLET_METADATA_SCHEMA,
    outputs: normalizedOutputs,
  };
};

const readWalletMetadataRecord = (
  transaction: WalletConfidentialTransactionLike,
): WalletConfidentialMetadataRecord | null => {
  const metadata = extractTransactionMetadata(transaction);
  if (!metadata) {
    return null;
  }
  return parseWalletConfidentialMetadataRecord(
    metadata[CONFIDENTIAL_WALLET_METADATA_KEY],
  );
};

const extractZkTransferNullifiers = (
  transaction: WalletConfidentialTransactionLike,
  assetDefinitionIds: Set<string>,
): string[] => {
  const inputs: string[] = [];
  for (const instruction of transaction.instructions ?? []) {
    const zk =
      instruction &&
      typeof instruction === "object" &&
      !Array.isArray(instruction)
        ? (instruction as Record<string, unknown>).zk
        : null;
    if (!isPlainRecord(zk)) {
      continue;
    }
    const transfer = zk.ZkTransfer;
    if (!isPlainRecord(transfer)) {
      continue;
    }
    const asset = trimString(transfer.asset).toLowerCase();
    if (!assetDefinitionIds.has(asset)) {
      continue;
    }
    for (const input of Array.isArray(transfer.inputs) ? transfer.inputs : []) {
      const normalized = readFixedBytesHex(input);
      if (normalized) {
        inputs.push(normalized);
      }
    }
  }
  return inputs;
};

const hasAssetZkTransfer = (
  transaction: WalletConfidentialTransactionLike,
  assetDefinitionIds: Set<string>,
): boolean =>
  extractZkTransferNullifiers(transaction, assetDefinitionIds).length > 0 ||
  (transaction.instructions ?? []).some((instruction) => {
    const zk =
      instruction &&
      typeof instruction === "object" &&
      !Array.isArray(instruction)
        ? (instruction as Record<string, unknown>).zk
        : null;
    if (!isPlainRecord(zk)) {
      return false;
    }
    const transfer = zk.ZkTransfer;
    return isPlainRecord(transfer)
      ? assetDefinitionIds.has(trimString(transfer.asset).toLowerCase())
      : false;
  });

export const createWalletConfidentialNote = (input: {
  assetDefinitionId: string;
  amount: string;
  createdAtMs?: number;
}): WalletConfidentialNote => {
  const assetDefinitionId = trimString(input.assetDefinitionId);
  if (!assetDefinitionId) {
    throw new Error("assetDefinitionId is required.");
  }
  const amount = parsePositiveWholeAmount(input.amount, "amount").toString();
  const createdAtMs = Math.trunc(input.createdAtMs ?? Date.now());
  if (!Number.isFinite(createdAtMs) || createdAtMs < 0) {
    throw new Error("createdAtMs must be a non-negative integer.");
  }
  const rhoHex = randomBytes(32).toString("hex");
  const commitmentHex = hash32Hex(NOTE_COMMITMENT_LABEL, [
    rhoHex,
    assetDefinitionId,
    amount,
    String(createdAtMs),
  ]);
  return {
    schema: CONFIDENTIAL_WALLET_NOTE_SCHEMA,
    note_id: commitmentHex,
    asset_definition_id: assetDefinitionId,
    amount,
    rho_hex: rhoHex,
    commitment_hex: commitmentHex,
    created_at_ms: createdAtMs,
  };
};

export const deriveWalletConfidentialNullifierHex = (input: {
  privateKeyHex: string;
  assetDefinitionId: string;
  chainId: string;
  rhoHex: string;
}): string => {
  const nkHex = deriveWalletNullifierKeyHex(input.privateKeyHex);
  const assetDefinitionId = trimString(input.assetDefinitionId);
  const chainId = trimString(input.chainId);
  const rhoHex = trimString(input.rhoHex).toLowerCase();
  if (!assetDefinitionId) {
    throw new Error("assetDefinitionId is required.");
  }
  if (!chainId) {
    throw new Error("chainId is required.");
  }
  if (!/^[0-9a-f]{64}$/.test(rhoHex)) {
    throw new Error("rhoHex must be a 32-byte hex string.");
  }
  return hash32Hex(NOTE_NULLIFIER_LABEL, [
    Buffer.from(nkHex, "hex"),
    Buffer.from(rhoHex, "hex"),
    assetDefinitionId,
    chainId,
  ]);
};

export const buildWalletConfidentialMetadata = (input: {
  baseMetadata?: Record<string, unknown>;
  outputs: Array<{
    note: WalletConfidentialNote;
    recipientAccountId: string;
  }>;
}): Record<string, unknown> => {
  const nextMetadata = isPlainRecord(input.baseMetadata)
    ? { ...input.baseMetadata }
    : {};
  nextMetadata[CONFIDENTIAL_WALLET_METADATA_KEY] = {
    schema: CONFIDENTIAL_WALLET_METADATA_SCHEMA,
    outputs: input.outputs.map(({ note, recipientAccountId }) => ({
      commitment_hex: note.commitment_hex,
      envelope: encryptPayloadForAccountId(note, recipientAccountId),
    })),
  };
  return nextMetadata;
};

export const collectWalletConfidentialLedger = (
  transactions: Array<WalletConfidentialTransactionLike | null | undefined>,
  input: {
    privateKeyHex: string;
    chainId: string;
    assetDefinitionIds: Array<string | null | undefined>;
    markUnrecognizedTransfersInexact?: boolean;
  },
): WalletConfidentialLedger => {
  const assetDefinitionIds = new Set(
    input.assetDefinitionIds
      .map((value) => trimString(value).toLowerCase())
      .filter(Boolean),
  );
  if (!assetDefinitionIds.size) {
    return {
      exact: true,
      notes: [],
      spendableQuantity: "0",
    };
  }

  const noteByNullifier = new Map<string, WalletSpendableConfidentialNote>();
  const notesByTxHash = new Map<string, WalletSpendableConfidentialNote[]>();
  const txList = transactions.filter(
    (transaction): transaction is WalletConfidentialTransactionLike =>
      Boolean(transaction),
  );

  txList.forEach((transaction, index) => {
    if (transaction.result_ok === false) {
      return;
    }
    const metadata = readWalletMetadataRecord(transaction);
    if (!metadata) {
      return;
    }
    const txHash = trimString(transaction.entrypoint_hash) || `tx-${index}`;
    for (const output of metadata.outputs) {
      try {
        const note = parseWalletConfidentialNote(
          decryptPayloadForAccount(output.envelope, input.privateKeyHex),
        );
        if (!note) {
          continue;
        }
        if (
          !assetDefinitionIds.has(note.asset_definition_id.trim().toLowerCase())
        ) {
          continue;
        }
        const nullifierHex = deriveWalletConfidentialNullifierHex({
          privateKeyHex: input.privateKeyHex,
          assetDefinitionId: note.asset_definition_id,
          chainId: input.chainId,
          rhoHex: note.rho_hex,
        });
        const spendableNote: WalletSpendableConfidentialNote = {
          ...note,
          nullifier_hex: nullifierHex,
          source_tx_hash: txHash,
        };
        noteByNullifier.set(nullifierHex, spendableNote);
        const notesForTx = notesByTxHash.get(txHash) ?? [];
        notesForTx.push(spendableNote);
        notesByTxHash.set(txHash, notesForTx);
      } catch {
        continue;
      }
    }
  });

  const spentNullifiers = new Set<string>();
  let exact = true;
  txList.forEach((transaction, index) => {
    if (transaction.result_ok === false) {
      return;
    }
    const txHash = trimString(transaction.entrypoint_hash) || `tx-${index}`;
    const transferNullifiers = extractZkTransferNullifiers(
      transaction,
      assetDefinitionIds,
    );
    if (
      !transferNullifiers.length &&
      !hasAssetZkTransfer(transaction, assetDefinitionIds)
    ) {
      return;
    }
    let recognized = (notesByTxHash.get(txHash)?.length ?? 0) > 0;
    for (const nullifierHex of transferNullifiers) {
      if (noteByNullifier.has(nullifierHex)) {
        spentNullifiers.add(nullifierHex);
        recognized = true;
      }
    }
    if (input.markUnrecognizedTransfersInexact !== false && !recognized) {
      exact = false;
    }
  });

  const notes = [...noteByNullifier.values()]
    .filter((note) => !spentNullifiers.has(note.nullifier_hex))
    .sort((left, right) => {
      if (left.created_at_ms !== right.created_at_ms) {
        return left.created_at_ms - right.created_at_ms;
      }
      return left.source_tx_hash.localeCompare(right.source_tx_hash);
    });

  let spendableQuantity = "0";
  for (const note of notes) {
    spendableQuantity = addWholeAmounts(spendableQuantity, note.amount);
  }

  return {
    exact,
    notes,
    spendableQuantity,
  };
};

export const selectWalletConfidentialNotes = (
  notes: ReadonlyArray<WalletSpendableConfidentialNote>,
  amount: string,
): {
  selected: WalletSpendableConfidentialNote[];
  total: string;
  change: string;
} => {
  const target = parsePositiveWholeAmount(amount, "amount");
  const selected: WalletSpendableConfidentialNote[] = [];
  let total = 0n;
  for (const note of notes) {
    if (total >= target) {
      break;
    }
    selected.push(note);
    total += parsePositiveWholeAmount(note.amount, "note.amount");
  }
  if (total < target) {
    throw new Error("Insufficient shielded balance.");
  }
  return {
    selected,
    total: total.toString(),
    change: (total - target).toString(),
  };
};

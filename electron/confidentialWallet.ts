import { randomBytes } from "node:crypto";
import {
  deriveConfidentialNoteV2,
  deriveConfidentialNullifierV2,
  deriveConfidentialOwnerTagV2,
} from "@iroha/iroha-js/crypto";
import {
  decryptPayloadForAccount,
  encryptPayloadForAccountId,
} from "./accountSealedBox";
import type { KaigiSealedBox } from "./kaigiCrypto";

export const CONFIDENTIAL_WALLET_METADATA_KEY =
  "iroha_demo_confidential_wallet";
export const CONFIDENTIAL_WALLET_METADATA_SCHEMA =
  "iroha-demo-confidential-wallet/v2";
export const CONFIDENTIAL_WALLET_METADATA_SCHEMA_LEGACY =
  "iroha-demo-confidential-wallet/v1";
export const CONFIDENTIAL_WALLET_NOTE_SCHEMA =
  "iroha-demo-confidential-note/v2";
export const CONFIDENTIAL_WALLET_NOTE_SCHEMA_LEGACY =
  "iroha-demo-confidential-note/v1";

type JsonRecord = Record<string, unknown>;

type ConfidentialInstructionLike = Record<string, unknown>;

export type WalletConfidentialTransactionLike = {
  entrypoint_hash?: string;
  result_ok?: boolean;
  authority?: string;
  block?: number;
  note_index_order?: number;
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
  owner_tag_hex: string;
  commitment_hex: string;
  created_at_ms: number;
};

export type WalletLegacyConfidentialNote = {
  schema: typeof CONFIDENTIAL_WALLET_NOTE_SCHEMA_LEGACY;
  note_id: string;
  asset_definition_id: string;
  amount: string;
  rho_hex: string;
  commitment_hex: string;
  created_at_ms: number;
};

type WalletParsedNote =
  | { kind: "v2"; note: WalletConfidentialNote }
  | { kind: "legacy"; note: WalletLegacyConfidentialNote };

type WalletConfidentialMetadataRecord = {
  schema:
    | typeof CONFIDENTIAL_WALLET_METADATA_SCHEMA
    | typeof CONFIDENTIAL_WALLET_METADATA_SCHEMA_LEGACY;
  outputs: Array<{
    commitment_hex: string;
    envelope: KaigiSealedBox;
  }>;
};

export type WalletSpendableConfidentialNote = WalletConfidentialNote & {
  nullifier_hex: string;
  source_tx_hash: string;
  leaf_index: number;
};

export type WalletConfidentialLedger = {
  exact: boolean;
  notes: WalletSpendableConfidentialNote[];
  spendableQuantity: string;
  legacyQuantity: string;
  treeCommitmentsHex: string[];
};

type ParsedShieldInstruction = {
  asset_definition_id: string;
  commitment_hex: string;
};

type ParsedTransferInstruction = {
  asset_definition_id: string;
  inputs: string[];
  outputs: string[];
};

type ParsedUnshieldInstruction = {
  asset_definition_id: string;
  inputs: string[];
};

const HEX_RE = /^[0-9a-fA-F]+$/;

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

const parseWalletConfidentialNoteV2 = (
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
  const ownerTagHex = trimString(
    value.owner_tag_hex ?? value.ownerTagHex ?? value.ownerTag,
  ).toLowerCase();
  const commitmentHex = trimString(
    value.commitment_hex ?? value.commitmentHex,
  ).toLowerCase();
  const createdAtMs = Number(value.created_at_ms ?? value.createdAtMs);
  if (
    !noteId ||
    !assetDefinitionId ||
    !/^\d+$/.test(amount) ||
    !/^[0-9a-f]{64}$/.test(rhoHex) ||
    !/^[0-9a-f]{64}$/.test(ownerTagHex) ||
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
    owner_tag_hex: ownerTagHex,
    commitment_hex: commitmentHex,
    created_at_ms: Math.trunc(createdAtMs),
  };
};

const parseWalletLegacyConfidentialNote = (
  value: unknown,
): WalletLegacyConfidentialNote | null => {
  if (!isPlainRecord(value)) {
    return null;
  }
  const schema = trimString(value.schema);
  if (schema !== CONFIDENTIAL_WALLET_NOTE_SCHEMA_LEGACY) {
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
    schema: CONFIDENTIAL_WALLET_NOTE_SCHEMA_LEGACY,
    note_id: noteId,
    asset_definition_id: assetDefinitionId,
    amount,
    rho_hex: rhoHex,
    commitment_hex: commitmentHex,
    created_at_ms: Math.trunc(createdAtMs),
  };
};

const parseWalletConfidentialNote = (value: unknown): WalletParsedNote | null => {
  const noteV2 = parseWalletConfidentialNoteV2(value);
  if (noteV2) {
    return { kind: "v2", note: noteV2 };
  }
  const legacyNote = parseWalletLegacyConfidentialNote(value);
  if (legacyNote) {
    return { kind: "legacy", note: legacyNote };
  }
  return null;
};

const parseWalletConfidentialMetadataRecord = (
  value: unknown,
): WalletConfidentialMetadataRecord | null => {
  if (!isPlainRecord(value)) {
    return null;
  }
  const schema = trimString(value.schema);
  if (
    schema !== CONFIDENTIAL_WALLET_METADATA_SCHEMA &&
    schema !== CONFIDENTIAL_WALLET_METADATA_SCHEMA_LEGACY
  ) {
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
    schema:
      schema === CONFIDENTIAL_WALLET_METADATA_SCHEMA
        ? CONFIDENTIAL_WALLET_METADATA_SCHEMA
        : CONFIDENTIAL_WALLET_METADATA_SCHEMA_LEGACY,
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

const normalizeAssetDefinitionId = (value: string): string => value.trim().toLowerCase();

const parseShieldInstruction = (
  instruction: ConfidentialInstructionLike | null | undefined,
  assetDefinitionIds: Set<string>,
): ParsedShieldInstruction | null => {
  const zk =
    instruction &&
    typeof instruction === "object" &&
    !Array.isArray(instruction)
      ? (instruction as Record<string, unknown>).zk
      : null;
  if (!isPlainRecord(zk)) {
    return null;
  }
  const shield = zk.Shield;
  if (!isPlainRecord(shield)) {
    return null;
  }
  const assetDefinitionId = normalizeAssetDefinitionId(trimString(shield.asset));
  if (!assetDefinitionIds.has(assetDefinitionId)) {
    return null;
  }
  const commitmentHex =
    readFixedBytesHex(shield.note_commitment ?? shield.noteCommitment) ??
    readFixedBytesHex(shield.note_commitment_hex ?? shield.noteCommitmentHex);
  return commitmentHex
    ? {
        asset_definition_id: assetDefinitionId,
        commitment_hex: commitmentHex,
      }
    : null;
};

const parseTransferInstruction = (
  instruction: ConfidentialInstructionLike | null | undefined,
  assetDefinitionIds: Set<string>,
): ParsedTransferInstruction | null => {
  const zk =
    instruction &&
    typeof instruction === "object" &&
    !Array.isArray(instruction)
      ? (instruction as Record<string, unknown>).zk
      : null;
  if (!isPlainRecord(zk)) {
    return null;
  }
  const transfer = zk.ZkTransfer;
  if (!isPlainRecord(transfer)) {
    return null;
  }
  const assetDefinitionId = normalizeAssetDefinitionId(trimString(transfer.asset));
  if (!assetDefinitionIds.has(assetDefinitionId)) {
    return null;
  }
  return {
    asset_definition_id: assetDefinitionId,
    inputs: (Array.isArray(transfer.inputs) ? transfer.inputs : [])
      .map(readFixedBytesHex)
      .filter((value): value is string => Boolean(value)),
    outputs: (Array.isArray(transfer.outputs) ? transfer.outputs : [])
      .map(readFixedBytesHex)
      .filter((value): value is string => Boolean(value)),
  };
};

const parseUnshieldInstruction = (
  instruction: ConfidentialInstructionLike | null | undefined,
  assetDefinitionIds: Set<string>,
): ParsedUnshieldInstruction | null => {
  const zk =
    instruction &&
    typeof instruction === "object" &&
    !Array.isArray(instruction)
      ? (instruction as Record<string, unknown>).zk
      : null;
  if (!isPlainRecord(zk)) {
    return null;
  }
  const unshield = zk.Unshield;
  if (!isPlainRecord(unshield)) {
    return null;
  }
  const assetDefinitionId = normalizeAssetDefinitionId(trimString(unshield.asset));
  if (!assetDefinitionIds.has(assetDefinitionId)) {
    return null;
  }
  return {
    asset_definition_id: assetDefinitionId,
    inputs: (Array.isArray(unshield.inputs) ? unshield.inputs : [])
      .map(readFixedBytesHex)
      .filter((value): value is string => Boolean(value)),
  };
};

const readWalletNotesForTransaction = (
  transaction: WalletConfidentialTransactionLike,
  input: {
    privateKeyHex: string;
    assetDefinitionIds: Set<string>;
  },
) => {
  const metadata = readWalletMetadataRecord(transaction);
  const notesByCommitment = new Map<string, WalletParsedNote>();
  if (!metadata) {
    return notesByCommitment;
  }
  for (const output of metadata.outputs) {
    try {
      const parsed = parseWalletConfidentialNote(
        decryptPayloadForAccount(output.envelope, input.privateKeyHex),
      );
      if (!parsed) {
        continue;
      }
      if (
        !input.assetDefinitionIds.has(
          normalizeAssetDefinitionId(parsed.note.asset_definition_id),
        )
      ) {
        continue;
      }
      if (parsed.note.commitment_hex !== output.commitment_hex) {
        continue;
      }
      notesByCommitment.set(output.commitment_hex, parsed);
    } catch {
      continue;
    }
  }
  return notesByCommitment;
};

const compareTransactionsChronologically = (
  left: WalletConfidentialTransactionLike & { __index: number },
  right: WalletConfidentialTransactionLike & { __index: number },
) => {
  const leftBlock = Number.isFinite(left.block)
    ? Math.trunc(Number(left.block))
    : Number.MAX_SAFE_INTEGER;
  const rightBlock = Number.isFinite(right.block)
    ? Math.trunc(Number(right.block))
    : Number.MAX_SAFE_INTEGER;
  if (leftBlock !== rightBlock) {
    return leftBlock - rightBlock;
  }
  const leftOrder = Number.isFinite(left.note_index_order)
    ? Math.trunc(Number(left.note_index_order))
    : left.__index;
  const rightOrder = Number.isFinite(right.note_index_order)
    ? Math.trunc(Number(right.note_index_order))
    : right.__index;
  if (leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }
  return trimString(left.entrypoint_hash).localeCompare(
    trimString(right.entrypoint_hash),
  );
};

export const createWalletConfidentialNote = (input: {
  assetDefinitionId: string;
  amount: string;
  ownerTagHex: string;
  createdAtMs?: number;
  rhoHex?: string;
}): WalletConfidentialNote => {
  const assetDefinitionId = trimString(input.assetDefinitionId);
  if (!assetDefinitionId) {
    throw new Error("assetDefinitionId is required.");
  }
  const amount = parsePositiveWholeAmount(input.amount, "amount").toString();
  const ownerTagHex = trimString(input.ownerTagHex).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(ownerTagHex)) {
    throw new Error("ownerTagHex must be a 32-byte hex string.");
  }
  const createdAtMs = Math.trunc(input.createdAtMs ?? Date.now());
  if (!Number.isFinite(createdAtMs) || createdAtMs < 0) {
    throw new Error("createdAtMs must be a non-negative integer.");
  }
  const rhoHex = trimString(input.rhoHex ?? randomBytes(32).toString("hex")).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(rhoHex)) {
    throw new Error("rhoHex must be a 32-byte hex string.");
  }
  const { commitmentHex } = deriveConfidentialNoteV2({
    assetDefinitionId,
    amount,
    rhoHex,
    ownerTagHex,
  });
  return {
    schema: CONFIDENTIAL_WALLET_NOTE_SCHEMA,
    note_id: commitmentHex,
    asset_definition_id: assetDefinitionId,
    amount,
    rho_hex: rhoHex,
    owner_tag_hex: ownerTagHex,
    commitment_hex: commitmentHex,
    created_at_ms: createdAtMs,
  };
};

export const deriveWalletConfidentialOwnerTagHex = (input: {
  privateKeyHex: string;
}): string => {
  const privateKeyHex = trimString(input.privateKeyHex);
  if (!/^[0-9a-f]{64}$/i.test(privateKeyHex)) {
    throw new Error("privateKeyHex must be a 32-byte hex string.");
  }
  return Buffer.from(
    deriveConfidentialOwnerTagV2(Buffer.from(privateKeyHex, "hex")),
  ).toString("hex");
};

export const deriveWalletConfidentialNullifierHex = (input: {
  privateKeyHex: string;
  assetDefinitionId: string;
  chainId: string;
  rhoHex: string;
}): string => {
  const privateKeyHex = trimString(input.privateKeyHex);
  const assetDefinitionId = trimString(input.assetDefinitionId);
  const chainId = trimString(input.chainId);
  const rhoHex = trimString(input.rhoHex).toLowerCase();
  if (!/^[0-9a-f]{64}$/i.test(privateKeyHex)) {
    throw new Error("privateKeyHex must be a 32-byte hex string.");
  }
  if (!assetDefinitionId) {
    throw new Error("assetDefinitionId is required.");
  }
  if (!chainId) {
    throw new Error("chainId is required.");
  }
  if (!/^[0-9a-f]{64}$/.test(rhoHex)) {
    throw new Error("rhoHex must be a 32-byte hex string.");
  }
  return deriveConfidentialNullifierV2({
    chainId,
    assetDefinitionId,
    spendKey: Buffer.from(privateKeyHex, "hex"),
    rhoHex,
  }).nullifierHex;
};

export const buildWalletConfidentialMetadata = (input: {
  baseMetadata?: Record<string, unknown>;
  outputs: Array<{
    note: WalletConfidentialNote | WalletLegacyConfidentialNote;
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
      .map((value) => normalizeAssetDefinitionId(trimString(value)))
      .filter(Boolean),
  );
  if (!assetDefinitionIds.size) {
    return {
      exact: true,
      notes: [],
      spendableQuantity: "0",
      legacyQuantity: "0",
      treeCommitmentsHex: [],
    };
  }

  const spendableNotesByNullifier = new Map<
    string,
    WalletSpendableConfidentialNote
  >();
  const spentNullifiers = new Set<string>();
  const treeCommitmentsHex: string[] = [];
  const txList = transactions
    .filter(
      (transaction): transaction is WalletConfidentialTransactionLike =>
        Boolean(transaction),
    )
    .map((transaction, index) => ({ ...transaction, __index: index }))
    .sort(compareTransactionsChronologically);
  let exact = true;
  let legacyQuantity = "0";

  for (const transaction of txList) {
    if (transaction.result_ok === false) {
      continue;
    }
    const txHash = trimString(transaction.entrypoint_hash) || `tx-${transaction.__index}`;
    const notesByCommitment = readWalletNotesForTransaction(transaction, {
      privateKeyHex: input.privateKeyHex,
      assetDefinitionIds,
    });

    const shieldInstructions = (transaction.instructions ?? [])
      .map((instruction) => parseShieldInstruction(instruction, assetDefinitionIds))
      .filter((entry): entry is ParsedShieldInstruction => Boolean(entry));
    for (const shield of shieldInstructions) {
      const leafIndex = treeCommitmentsHex.length;
      treeCommitmentsHex.push(shield.commitment_hex);
      const decrypted = notesByCommitment.get(shield.commitment_hex);
      if (decrypted?.kind === "v2") {
        const nullifierHex = deriveWalletConfidentialNullifierHex({
          privateKeyHex: input.privateKeyHex,
          assetDefinitionId: decrypted.note.asset_definition_id,
          chainId: input.chainId,
          rhoHex: decrypted.note.rho_hex,
        });
        spendableNotesByNullifier.set(nullifierHex, {
          ...decrypted.note,
          nullifier_hex: nullifierHex,
          source_tx_hash: txHash,
          leaf_index: leafIndex,
        });
      } else if (decrypted?.kind === "legacy") {
        legacyQuantity = addWholeAmounts(legacyQuantity, decrypted.note.amount);
        exact = false;
      }
    }

    const transferInstructions = (transaction.instructions ?? [])
      .map((instruction) => parseTransferInstruction(instruction, assetDefinitionIds))
      .filter((entry): entry is ParsedTransferInstruction => Boolean(entry));
    for (const transfer of transferInstructions) {
      for (const nullifierHex of transfer.inputs) {
        if (spendableNotesByNullifier.has(nullifierHex)) {
          spentNullifiers.add(nullifierHex);
        }
      }
      let recognizedOutput = false;
      for (const commitmentHex of transfer.outputs) {
        const leafIndex = treeCommitmentsHex.length;
        treeCommitmentsHex.push(commitmentHex);
        const decrypted = notesByCommitment.get(commitmentHex);
        if (decrypted?.kind === "v2") {
          recognizedOutput = true;
          const nullifierHex = deriveWalletConfidentialNullifierHex({
            privateKeyHex: input.privateKeyHex,
            assetDefinitionId: decrypted.note.asset_definition_id,
            chainId: input.chainId,
            rhoHex: decrypted.note.rho_hex,
          });
          spendableNotesByNullifier.set(nullifierHex, {
            ...decrypted.note,
            nullifier_hex: nullifierHex,
            source_tx_hash: txHash,
            leaf_index: leafIndex,
          });
        } else if (decrypted?.kind === "legacy") {
          recognizedOutput = true;
          legacyQuantity = addWholeAmounts(legacyQuantity, decrypted.note.amount);
          exact = false;
        }
      }
      if (
        input.markUnrecognizedTransfersInexact !== false &&
        !recognizedOutput &&
        notesByCommitment.size === 0
      ) {
        exact = false;
      }
    }

    const unshieldInstructions = (transaction.instructions ?? [])
      .map((instruction) => parseUnshieldInstruction(instruction, assetDefinitionIds))
      .filter((entry): entry is ParsedUnshieldInstruction => Boolean(entry));
    for (const unshield of unshieldInstructions) {
      for (const nullifierHex of unshield.inputs) {
        if (spendableNotesByNullifier.has(nullifierHex)) {
          spentNullifiers.add(nullifierHex);
        }
      }
    }
  }

  const notes = [...spendableNotesByNullifier.values()]
    .filter((note) => !spentNullifiers.has(note.nullifier_hex))
    .sort((left, right) => {
      if (left.leaf_index !== right.leaf_index) {
        return left.leaf_index - right.leaf_index;
      }
      if (left.created_at_ms !== right.created_at_ms) {
        return left.created_at_ms - right.created_at_ms;
      }
      return left.source_tx_hash.localeCompare(right.source_tx_hash);
    });

  let spendableQuantity = "0";
  for (const note of notes) {
    spendableQuantity = addWholeAmounts(spendableQuantity, note.amount);
  }
  if (legacyQuantity !== "0") {
    exact = false;
  }

  return {
    exact,
    notes,
    spendableQuantity,
    legacyQuantity,
    treeCommitmentsHex,
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

export const selectWalletConfidentialNotesForExactAmount = (
  notes: ReadonlyArray<WalletSpendableConfidentialNote>,
  amount: string,
): {
  selected: WalletSpendableConfidentialNote[];
  total: string;
  change: string;
} => {
  const target = parsePositiveWholeAmount(amount, "amount");

  for (const note of notes) {
    if (parsePositiveWholeAmount(note.amount, "note.amount") === target) {
      return {
        selected: [note],
        total: target.toString(),
        change: "0",
      };
    }
  }

  for (let leftIndex = 0; leftIndex < notes.length; leftIndex += 1) {
    const left = notes[leftIndex];
    if (!left) {
      continue;
    }
    const leftAmount = parsePositiveWholeAmount(left.amount, "note.amount");
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < notes.length;
      rightIndex += 1
    ) {
      const right = notes[rightIndex];
      if (!right) {
        continue;
      }
      const rightAmount = parsePositiveWholeAmount(right.amount, "note.amount");
      if (leftAmount + rightAmount === target) {
        return {
          selected: [left, right],
          total: target.toString(),
          change: "0",
        };
      }
    }
  }

  throw new Error(
    "Unable to match the requested amount with an exact one- or two-note shielded spend. Re-shield or consolidate first.",
  );
};

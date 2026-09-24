import { randomBytes } from "node:crypto";
import type { NetworkId } from "@iroha/iroha-js";
import {
  deriveConfidentialNoteV2,
  deriveConfidentialNullifierV2,
  deriveConfidentialOwnerTagV2,
  deriveConfidentialReceiveAddressV2,
} from "@iroha/iroha-js/crypto";
import {
  SECURE_VAULT_MAX_RECEIVE_KEYS_PER_ACCOUNT,
  type ConfidentialReceiveKeyRecord,
} from "./secureVault";
import {
  decryptKaigiPayload,
  KAIGI_ENCRYPTED_PAYLOAD_MAX_BYTES,
  KAIGI_SEALED_BOX_SCHEMA,
  type KaigiSealedBox,
} from "./kaigiCrypto";
import { isCanonicalAssetDefinitionId } from "../src/utils/assetId";
import {
  FIRST_RELEASE_CONFIDENTIAL_NOTE_MAX_ASSETS,
  FIRST_RELEASE_CONFIDENTIAL_NOTE_MAX_ITEMS_PER_ASSET,
} from "./firstReleaseResourceLimits";

export const CONFIDENTIAL_WALLET_METADATA_KEY =
  "iroha_demo_confidential_wallet";
export const CONFIDENTIAL_WALLET_METADATA_SCHEMA =
  "iroha-demo-confidential-wallet/v3";
export const CONFIDENTIAL_WALLET_NOTE_SCHEMA =
  "iroha-demo-confidential-note/v3";

type JsonRecord = Record<string, unknown>;

type ConfidentialInstructionLike = Record<string, unknown>;

export type WalletConfidentialTransactionLike = {
  entrypoint_hash?: string;
  result_ok?: boolean;
  authority?: string;
  block?: number;
  note_index_order?: number;
  metadata?: unknown;
  instructions?: Array<ConfidentialInstructionLike | null | undefined>;
};

export type WalletConfidentialNote = {
  schema: typeof CONFIDENTIAL_WALLET_NOTE_SCHEMA;
  note_id: string;
  asset_definition_id: string;
  amount: string;
  rho_hex: string;
  owner_tag_hex: string;
  diversifier_hex: string;
  commitment_hex: string;
  created_at_ms: number;
};

type WalletParsedNote = { kind: "current"; note: WalletConfidentialNote };

type WalletConfidentialMetadataRecord = {
  schema: typeof CONFIDENTIAL_WALLET_METADATA_SCHEMA;
  outputs: Array<{
    commitment_hex: string;
    envelope: KaigiSealedBox;
    receive_key_id: string;
  }>;
};

export type WalletRecoveredConfidentialNote = WalletConfidentialNote & {
  nullifier_hex: string;
  source_tx_hash: string;
  leaf_index: number;
};

export type WalletConfidentialLedger = {
  exact: boolean;
  notes: WalletRecoveredConfidentialNote[];
  spendableQuantity: string;
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
  outputs: string[];
};

const MAX_CONFIDENTIAL_TRANSACTIONS =
  FIRST_RELEASE_CONFIDENTIAL_NOTE_MAX_ASSETS *
  FIRST_RELEASE_CONFIDENTIAL_NOTE_MAX_ITEMS_PER_ASSET;
const MAX_CONFIDENTIAL_INSTRUCTIONS_PER_TRANSACTION = 64;
const MAX_CONFIDENTIAL_INPUTS_PER_INSTRUCTION = 64;
const MAX_CONFIDENTIAL_OUTPUTS_PER_TRANSACTION = 64;
const MAX_CONFIDENTIAL_AMOUNT_DIGITS = 78;
const MAX_CONFIDENTIAL_NOTE_CIPHERTEXT_BYTES = 4 * 1024;

const isPlainRecord = (value: unknown): value is JsonRecord => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const hasExactKeys = (
  value: JsonRecord,
  expectedKeys: readonly string[],
): boolean => {
  const expected = new Set(expectedKeys);
  let count = 0;
  for (const key in value) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      continue;
    }
    count += 1;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      count > expectedKeys.length ||
      !expected.has(key) ||
      !descriptor?.enumerable ||
      !("value" in descriptor)
    ) {
      return false;
    }
  }
  return count === expectedKeys.length;
};

const readDenseArray = (
  value: unknown,
  maximumItems: number,
): readonly unknown[] | null => {
  if (
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    value.length > maximumItems
  ) {
    return null;
  }
  let enumerableItemCount = 0;
  for (const key in value) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      continue;
    }
    if (!/^(?:0|[1-9]\d*)$/u.test(key) || Number(key) >= value.length) {
      return null;
    }
    enumerableItemCount += 1;
  }
  if (enumerableItemCount !== value.length) {
    return null;
  }
  const snapshot: unknown[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor?.enumerable || !("value" in descriptor)) {
      return null;
    }
    snapshot.push(descriptor.value);
  }
  return snapshot;
};

const readCanonicalBase64Url = (
  value: unknown,
  expectedByteLength?: number,
  maximumByteLength = expectedByteLength,
): string | null => {
  const encodedLengthLimit =
    maximumByteLength === undefined
      ? null
      : Math.ceil((maximumByteLength * 4) / 3);
  if (
    typeof value !== "string" ||
    (encodedLengthLimit !== null && value.length > encodedLengthLimit) ||
    (expectedByteLength !== undefined && value.length !== encodedLengthLimit) ||
    !/^[A-Za-z0-9_-]+$/u.test(value)
  ) {
    return null;
  }
  const bytes = Buffer.from(value, "base64url");
  try {
    if (
      bytes.length === 0 ||
      (expectedByteLength !== undefined &&
        bytes.length !== expectedByteLength) ||
      bytes.toString("base64url") !== value
    ) {
      return null;
    }
    return value;
  } finally {
    bytes.fill(0);
  }
};

const readReceiveKeyId = (value: unknown): string | null =>
  readCanonicalBase64Url(value, 18);

const parseKaigiSealedBox = (value: unknown): KaigiSealedBox | null => {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, [
      "schema",
      "ephemeralPublicKeyBase64Url",
      "saltBase64Url",
      "ivBase64Url",
      "ciphertextBase64Url",
      "authTagBase64Url",
    ]) ||
    value.schema !== KAIGI_SEALED_BOX_SCHEMA
  ) {
    return null;
  }
  const ephemeralPublicKeyBase64Url = readCanonicalBase64Url(
    value.ephemeralPublicKeyBase64Url,
    32,
  );
  const saltBase64Url = readCanonicalBase64Url(value.saltBase64Url, 16);
  const ivBase64Url = readCanonicalBase64Url(value.ivBase64Url, 12);
  const ciphertextBase64Url = readCanonicalBase64Url(
    value.ciphertextBase64Url,
    undefined,
    Math.min(
      KAIGI_ENCRYPTED_PAYLOAD_MAX_BYTES,
      MAX_CONFIDENTIAL_NOTE_CIPHERTEXT_BYTES,
    ),
  );
  const authTagBase64Url = readCanonicalBase64Url(value.authTagBase64Url, 16);
  if (
    !ephemeralPublicKeyBase64Url ||
    !saltBase64Url ||
    !ivBase64Url ||
    !ciphertextBase64Url ||
    !authTagBase64Url
  ) {
    return null;
  }
  return {
    schema: KAIGI_SEALED_BOX_SCHEMA,
    ephemeralPublicKeyBase64Url,
    saltBase64Url,
    ivBase64Url,
    ciphertextBase64Url,
    authTagBase64Url,
  };
};

const addWholeAmounts = (left: string, right: string): string =>
  (BigInt(left) + BigInt(right)).toString();

const readFixedBytesHex = (value: unknown): string | null => {
  return typeof value === "string" && /^[0-9a-f]{64}$/u.test(value)
    ? value
    : null;
};

const extractTransactionMetadata = (
  transaction: WalletConfidentialTransactionLike,
): JsonRecord | null =>
  isPlainRecord(transaction.metadata) ? transaction.metadata : null;

const parseWalletConfidentialNote = (
  value: unknown,
): WalletConfidentialNote | null => {
  if (!isPlainRecord(value)) {
    return null;
  }
  if (
    !hasExactKeys(value, [
      "schema",
      "note_id",
      "asset_definition_id",
      "amount",
      "rho_hex",
      "owner_tag_hex",
      "diversifier_hex",
      "commitment_hex",
      "created_at_ms",
    ]) ||
    value.schema !== CONFIDENTIAL_WALLET_NOTE_SCHEMA
  ) {
    return null;
  }
  const noteId = value.note_id;
  const assetDefinitionId = value.asset_definition_id;
  const amount = value.amount;
  const rhoHex = value.rho_hex;
  const ownerTagHex = value.owner_tag_hex;
  const diversifierHex = value.diversifier_hex;
  const commitmentHex = value.commitment_hex;
  const createdAtMs = value.created_at_ms;
  if (
    typeof noteId !== "string" ||
    !/^[0-9a-f]{64}$/u.test(noteId) ||
    typeof assetDefinitionId !== "string" ||
    !assetDefinitionId ||
    assetDefinitionId.trim() !== assetDefinitionId ||
    !isCanonicalAssetDefinitionId(assetDefinitionId) ||
    typeof amount !== "string" ||
    amount.length > MAX_CONFIDENTIAL_AMOUNT_DIGITS ||
    !/^[1-9]\d*$/u.test(amount) ||
    typeof rhoHex !== "string" ||
    !/^[0-9a-f]{64}$/u.test(rhoHex) ||
    typeof ownerTagHex !== "string" ||
    !/^[0-9a-f]{64}$/u.test(ownerTagHex) ||
    typeof diversifierHex !== "string" ||
    !/^[0-9a-f]{64}$/u.test(diversifierHex) ||
    typeof commitmentHex !== "string" ||
    !/^[0-9a-f]{64}$/u.test(commitmentHex) ||
    noteId !== commitmentHex ||
    typeof createdAtMs !== "number" ||
    !Number.isSafeInteger(createdAtMs) ||
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
    diversifier_hex: diversifierHex,
    commitment_hex: commitmentHex,
    created_at_ms: createdAtMs,
  };
};

const parseWalletConfidentialNoteEnvelope = (
  value: unknown,
): WalletParsedNote | null => {
  const note = parseWalletConfidentialNote(value);
  return note ? { kind: "current", note } : null;
};

const parseWalletConfidentialMetadataRecord = (
  value: unknown,
): WalletConfidentialMetadataRecord | null => {
  if (!isPlainRecord(value)) {
    return null;
  }
  if (
    !hasExactKeys(value, ["schema", "outputs"]) ||
    value.schema !== CONFIDENTIAL_WALLET_METADATA_SCHEMA ||
    !Array.isArray(value.outputs)
  ) {
    return null;
  }
  const rawOutputs = readDenseArray(
    value.outputs,
    MAX_CONFIDENTIAL_OUTPUTS_PER_TRANSACTION,
  );
  if (!rawOutputs || rawOutputs.length === 0) {
    return null;
  }
  const commitments = new Set<string>();
  const receiveKeyIds = new Set<string>();
  const outputs: WalletConfidentialMetadataRecord["outputs"] = [];
  for (const entry of rawOutputs) {
    if (
      !isPlainRecord(entry) ||
      !hasExactKeys(entry, ["commitment_hex", "receive_key_id", "envelope"])
    ) {
      return null;
    }
    const commitmentHex = entry.commitment_hex;
    const receiveKeyId = readReceiveKeyId(entry.receive_key_id);
    const envelope = parseKaigiSealedBox(entry.envelope);
    if (
      typeof commitmentHex !== "string" ||
      !/^[0-9a-f]{64}$/u.test(commitmentHex) ||
      !receiveKeyId ||
      !envelope ||
      commitments.has(commitmentHex) ||
      receiveKeyIds.has(receiveKeyId)
    ) {
      return null;
    }
    commitments.add(commitmentHex);
    receiveKeyIds.add(receiveKeyId);
    outputs.push({
      commitment_hex: commitmentHex,
      receive_key_id: receiveKeyId,
      envelope,
    });
  }
  return { schema: CONFIDENTIAL_WALLET_METADATA_SCHEMA, outputs };
};

const readWalletMetadataRecord = (
  transaction: WalletConfidentialTransactionLike,
): WalletConfidentialMetadataRecord | null => {
  const metadata = extractTransactionMetadata(transaction);
  if (!metadata) {
    return null;
  }
  const descriptor = Object.getOwnPropertyDescriptor(
    metadata,
    CONFIDENTIAL_WALLET_METADATA_KEY,
  );
  if (!descriptor) {
    return null;
  }
  if (!descriptor.enumerable || !("value" in descriptor)) {
    throw new Error(
      "Confidential wallet metadata must be an enumerable data field.",
    );
  }
  const parsed = parseWalletConfidentialMetadataRecord(descriptor.value);
  if (!parsed) {
    throw new Error(
      "Confidential wallet metadata does not match the exact current contract.",
    );
  }
  return parsed;
};

const readAssetDefinitionId = (value: unknown): string | null =>
  typeof value === "string" && isCanonicalAssetDefinitionId(value)
    ? value
    : null;

const requireFixedBytesHexArray = (
  value: unknown,
  label: string,
  options: { allowEmpty: boolean },
): string[] => {
  const raw = readDenseArray(value, MAX_CONFIDENTIAL_INPUTS_PER_INSTRUCTION);
  if (!raw || (!options.allowEmpty && raw.length === 0)) {
    throw new Error(`${label} must be an exact bounded fixed-bytes array.`);
  }
  const result: string[] = [];
  const seen = new Set<string>();
  for (const candidate of raw) {
    const normalized = readFixedBytesHex(candidate);
    if (!normalized || seen.has(normalized)) {
      throw new Error(`${label} must be an exact bounded fixed-bytes array.`);
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
};

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
  if (shield === undefined) {
    return null;
  }
  if (!isPlainRecord(shield)) {
    throw new Error("Confidential Shield instruction must be an object.");
  }
  const assetDefinitionId = readAssetDefinitionId(shield.asset);
  if (!assetDefinitionId) {
    throw new Error(
      "Confidential Shield instruction has a noncanonical asset definition.",
    );
  }
  if (!assetDefinitionIds.has(assetDefinitionId)) {
    return null;
  }
  const commitmentHex = readFixedBytesHex(shield.note_commitment);
  if (!commitmentHex) {
    throw new Error(
      "Confidential Shield instruction has a noncanonical note commitment.",
    );
  }
  return {
    asset_definition_id: assetDefinitionId,
    commitment_hex: commitmentHex,
  };
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
  if (transfer === undefined) {
    return null;
  }
  if (!isPlainRecord(transfer)) {
    throw new Error("Confidential ZkTransfer instruction must be an object.");
  }
  const assetDefinitionId = readAssetDefinitionId(transfer.asset);
  if (!assetDefinitionId) {
    throw new Error(
      "Confidential ZkTransfer instruction has a noncanonical asset definition.",
    );
  }
  if (!assetDefinitionIds.has(assetDefinitionId)) {
    return null;
  }
  return {
    asset_definition_id: assetDefinitionId,
    inputs: requireFixedBytesHexArray(
      transfer.inputs,
      "Confidential ZkTransfer inputs",
      { allowEmpty: false },
    ),
    outputs: requireFixedBytesHexArray(
      transfer.outputs,
      "Confidential ZkTransfer outputs",
      { allowEmpty: false },
    ),
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
  if (unshield === undefined) {
    return null;
  }
  if (!isPlainRecord(unshield)) {
    throw new Error("Confidential Unshield instruction must be an object.");
  }
  const assetDefinitionId = readAssetDefinitionId(unshield.asset);
  if (!assetDefinitionId) {
    throw new Error(
      "Confidential Unshield instruction has a noncanonical asset definition.",
    );
  }
  if (!assetDefinitionIds.has(assetDefinitionId)) {
    return null;
  }
  return {
    asset_definition_id: assetDefinitionId,
    inputs: requireFixedBytesHexArray(
      unshield.inputs,
      "Confidential Unshield inputs",
      { allowEmpty: false },
    ),
    outputs: requireFixedBytesHexArray(
      unshield.outputs,
      "Confidential Unshield outputs",
      { allowEmpty: true },
    ),
  };
};

const readWalletNotesForTransaction = (
  transaction: WalletConfidentialTransactionLike,
  input: {
    privateKeyHex: string;
    receiveKeys?: ConfidentialReceiveKeyRecord[];
    assetDefinitionIds: Set<string>;
  },
) => {
  const metadata = readWalletMetadataRecord(transaction);
  const notesByCommitment = new Map<string, WalletParsedNote>();
  if (!metadata) {
    return notesByCommitment;
  }
  const receiveKeysById = new Map(
    (input.receiveKeys ?? []).map((record) => [record.keyId, record]),
  );
  for (const output of metadata.outputs) {
    const receiveKey = receiveKeysById.get(output.receive_key_id);
    if (!receiveKey) {
      continue;
    }
    let decrypted: unknown;
    try {
      decrypted = decryptKaigiPayload(output.envelope, {
        publicKeyBase64Url: receiveKey.publicKeyBase64Url,
        privateKeyBase64Url: receiveKey.privateKeyBase64Url,
      });
    } catch {
      throw new Error(
        "Confidential note envelope could not be authenticated for its receive key.",
      );
    }
    const parsed = parseWalletConfidentialNoteEnvelope(decrypted);
    if (!parsed) {
      throw new Error(
        "Decrypted confidential note does not match the exact current contract.",
      );
    }
    if (
      parsed.note.owner_tag_hex !== receiveKey.ownerTagHex ||
      parsed.note.diversifier_hex !== receiveKey.diversifierHex ||
      parsed.note.owner_tag_hex !==
        deriveWalletConfidentialOwnerTagHex({
          privateKeyHex: input.privateKeyHex,
          diversifierHex: parsed.note.diversifier_hex,
        })
    ) {
      throw new Error(
        "Confidential note owner material is not bound to the wallet receive key.",
      );
    }
    if (!input.assetDefinitionIds.has(parsed.note.asset_definition_id)) {
      throw new Error(
        "Confidential note asset does not match the tracked instruction asset.",
      );
    }
    const derivedCommitment = deriveConfidentialNoteV2({
      assetDefinitionId: parsed.note.asset_definition_id,
      amount: parsed.note.amount,
      rhoHex: parsed.note.rho_hex,
      ownerTagHex: parsed.note.owner_tag_hex,
    }).commitmentHex;
    if (
      parsed.note.commitment_hex !== output.commitment_hex ||
      derivedCommitment !== output.commitment_hex
    ) {
      throw new Error(
        "Confidential note contents do not match the committed ledger output.",
      );
    }
    notesByCommitment.set(output.commitment_hex, parsed);
  }
  return notesByCommitment;
};

const compareTransactionsChronologically = (
  left: WalletConfidentialTransactionLike & { __index: number },
  right: WalletConfidentialTransactionLike & { __index: number },
) => {
  const leftBlock = left.block ?? Number.MAX_SAFE_INTEGER;
  const rightBlock = right.block ?? Number.MAX_SAFE_INTEGER;
  if (leftBlock !== rightBlock) {
    return leftBlock - rightBlock;
  }
  const leftOrder = left.note_index_order ?? left.__index;
  const rightOrder = right.note_index_order ?? right.__index;
  if (leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }
  return left.entrypoint_hash!.localeCompare(right.entrypoint_hash!);
};

export const deriveWalletConfidentialOwnerTagHex = (input: {
  privateKeyHex: string;
  diversifierHex: string;
}): string => {
  const privateKeyHex = input.privateKeyHex;
  if (!/^[0-9a-f]{64}$/u.test(privateKeyHex)) {
    throw new Error("privateKeyHex must be a 32-byte hex string.");
  }
  const diversifierHex = input.diversifierHex;
  if (!/^[0-9a-f]{64}$/u.test(diversifierHex)) {
    throw new Error("diversifierHex must be a 32-byte hex string.");
  }
  const spendKey = Buffer.from(privateKeyHex, "hex");
  try {
    return Buffer.from(
      deriveConfidentialOwnerTagV2(spendKey, { diversifierHex }),
    ).toString("hex");
  } finally {
    spendKey.fill(0);
  }
};

export const deriveWalletConfidentialReceiveAddress = (input: {
  privateKeyHex: string;
  diversifierSeedHex?: string;
}): { ownerTagHex: string; diversifierHex: string } => {
  const privateKeyHex = input.privateKeyHex;
  if (!/^[0-9a-f]{64}$/u.test(privateKeyHex)) {
    throw new Error("privateKeyHex must be a 32-byte hex string.");
  }
  const diversifierSeedHex =
    input.diversifierSeedHex ?? randomBytes(32).toString("hex");
  if (!/^[0-9a-f]{64}$/u.test(diversifierSeedHex)) {
    throw new Error("diversifierSeedHex must be a 32-byte hex string.");
  }
  const spendKey = Buffer.from(privateKeyHex, "hex");
  const diversifierSeed = Buffer.from(diversifierSeedHex, "hex");
  try {
    const address = deriveConfidentialReceiveAddressV2({
      spendKey,
      diversifierSeed,
    });
    return {
      ownerTagHex: address.ownerTagHex,
      diversifierHex: address.diversifierHex,
    };
  } finally {
    spendKey.fill(0);
    diversifierSeed.fill(0);
  }
};

export const deriveWalletConfidentialNullifierHex = (input: {
  privateKeyHex: string;
  assetDefinitionId: string;
  networkId: NetworkId;
  rhoHex: string;
}): string => {
  const privateKeyHex = input.privateKeyHex;
  const assetDefinitionId = input.assetDefinitionId;
  const rhoHex = input.rhoHex;
  if (!/^[0-9a-f]{64}$/u.test(privateKeyHex)) {
    throw new Error("privateKeyHex must be a 32-byte hex string.");
  }
  if (!isCanonicalAssetDefinitionId(assetDefinitionId)) {
    throw new Error("assetDefinitionId must be a canonical definition ID.");
  }
  if (!/^[0-9a-f]{64}$/u.test(rhoHex)) {
    throw new Error("rhoHex must be a 32-byte hex string.");
  }
  const spendKey = Buffer.from(privateKeyHex, "hex");
  try {
    return deriveConfidentialNullifierV2({
      networkId: input.networkId,
      assetDefinitionId,
      spendKey,
      rhoHex,
    }).nullifierHex;
  } finally {
    spendKey.fill(0);
  }
};

const requireReceiveKeys = (
  value: ConfidentialReceiveKeyRecord[] | undefined,
): ConfidentialReceiveKeyRecord[] => {
  if (value === undefined) {
    return [];
  }
  const records = readDenseArray(
    value,
    SECURE_VAULT_MAX_RECEIVE_KEYS_PER_ACCOUNT,
  );
  if (!records) {
    throw new Error("receiveKeys must be an exact bounded array.");
  }
  const normalized: ConfidentialReceiveKeyRecord[] = [];
  const seen = new Set<string>();
  for (const candidate of records) {
    if (
      !isPlainRecord(candidate) ||
      !hasExactKeys(candidate, [
        "keyId",
        "accountId",
        "ownerTagHex",
        "diversifierHex",
        "publicKeyBase64Url",
        "privateKeyBase64Url",
        "createdAtMs",
      ])
    ) {
      throw new Error("receiveKeys contains an unsupported record.");
    }
    const keyId = readReceiveKeyId(candidate.keyId);
    const publicKeyBase64Url = readCanonicalBase64Url(
      candidate.publicKeyBase64Url,
      32,
    );
    const privateKeyBase64Url = readCanonicalBase64Url(
      candidate.privateKeyBase64Url,
      32,
    );
    if (
      !keyId ||
      seen.has(keyId) ||
      typeof candidate.accountId !== "string" ||
      candidate.accountId.length === 0 ||
      candidate.accountId.trim() !== candidate.accountId ||
      candidate.accountId.normalize("NFC") !== candidate.accountId ||
      Buffer.byteLength(candidate.accountId, "utf8") > 512 ||
      typeof candidate.ownerTagHex !== "string" ||
      !/^[0-9a-f]{64}$/u.test(candidate.ownerTagHex) ||
      typeof candidate.diversifierHex !== "string" ||
      !/^[0-9a-f]{64}$/u.test(candidate.diversifierHex) ||
      !publicKeyBase64Url ||
      !privateKeyBase64Url ||
      typeof candidate.createdAtMs !== "number" ||
      !Number.isSafeInteger(candidate.createdAtMs) ||
      candidate.createdAtMs < 0
    ) {
      throw new Error("receiveKeys contains noncanonical receive material.");
    }
    seen.add(keyId);
    normalized.push({
      keyId,
      accountId: candidate.accountId,
      ownerTagHex: candidate.ownerTagHex,
      diversifierHex: candidate.diversifierHex,
      publicKeyBase64Url,
      privateKeyBase64Url,
      createdAtMs: candidate.createdAtMs,
    });
  }
  return normalized;
};

const requireOptionalSafeInteger = (
  value: unknown,
  label: string,
  minimum: number,
): number | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    Object.is(value, -0) ||
    value < minimum
  ) {
    throw new Error(`${label} must be a canonical safe integer.`);
  }
  return value;
};

const requireConfidentialTransactions = (
  value: Array<WalletConfidentialTransactionLike | null | undefined>,
): Array<WalletConfidentialTransactionLike & { __index: number }> => {
  const records = readDenseArray(value, MAX_CONFIDENTIAL_TRANSACTIONS);
  if (!records) {
    throw new Error("transactions must be an exact bounded array.");
  }
  const seenHashes = new Set<string>();
  const allowedKeys = new Set([
    "entrypoint_hash",
    "result_ok",
    "authority",
    "block",
    "note_index_order",
    "metadata",
    "instructions",
  ]);
  return records.map((candidate, index) => {
    if (!isPlainRecord(candidate) || candidate.result_ok !== true) {
      throw new Error(
        `transactions[${index}] must be a successful transaction object.`,
      );
    }
    let fieldCount = 0;
    for (const key in candidate) {
      if (!Object.prototype.hasOwnProperty.call(candidate, key)) {
        continue;
      }
      fieldCount += 1;
      const descriptor = Object.getOwnPropertyDescriptor(candidate, key);
      if (
        fieldCount > allowedKeys.size ||
        !allowedKeys.has(key) ||
        !descriptor?.enumerable ||
        !("value" in descriptor)
      ) {
        throw new Error(`transactions[${index}] has an unsupported shape.`);
      }
    }
    const entrypointHash = readFixedBytesHex(candidate.entrypoint_hash);
    if (!entrypointHash || seenHashes.has(entrypointHash)) {
      throw new Error(
        `transactions[${index}].entrypoint_hash must be unique canonical lowercase hex.`,
      );
    }
    seenHashes.add(entrypointHash);
    const instructions = readDenseArray(
      candidate.instructions,
      MAX_CONFIDENTIAL_INSTRUCTIONS_PER_TRANSACTION,
    );
    if (
      !instructions ||
      instructions.length === 0 ||
      instructions.some((instruction) => !isPlainRecord(instruction))
    ) {
      throw new Error(
        `transactions[${index}].instructions must be an exact bounded object array.`,
      );
    }
    if (
      candidate.metadata !== undefined &&
      candidate.metadata !== null &&
      !isPlainRecord(candidate.metadata)
    ) {
      throw new Error(`transactions[${index}].metadata must be an object.`);
    }
    if (
      candidate.authority !== undefined &&
      (typeof candidate.authority !== "string" ||
        candidate.authority.length === 0 ||
        candidate.authority.trim() !== candidate.authority ||
        candidate.authority.normalize("NFC") !== candidate.authority ||
        Buffer.byteLength(candidate.authority, "utf8") > 2_048)
    ) {
      throw new Error(
        `transactions[${index}].authority must be canonical bounded text.`,
      );
    }
    return {
      entrypoint_hash: entrypointHash,
      result_ok: true,
      authority: candidate.authority as string | undefined,
      block: requireOptionalSafeInteger(
        candidate.block,
        `transactions[${index}].block`,
        1,
      ),
      note_index_order: requireOptionalSafeInteger(
        candidate.note_index_order,
        `transactions[${index}].note_index_order`,
        0,
      ),
      metadata: candidate.metadata,
      instructions: instructions as Record<string, unknown>[],
      __index: index,
    };
  });
};

export const collectWalletConfidentialLedger = (
  transactions: Array<WalletConfidentialTransactionLike | null | undefined>,
  input: {
    privateKeyHex: string;
    networkId: NetworkId;
    assetDefinitionIds: string[];
    receiveKeys?: ConfidentialReceiveKeyRecord[];
    markUnrecognizedTransfersInexact?: boolean;
  },
): WalletConfidentialLedger => {
  if (!/^[0-9a-f]{64}$/u.test(input.privateKeyHex)) {
    throw new Error("privateKeyHex must be a 32-byte hex string.");
  }
  const rawAssetDefinitionIds = readDenseArray(
    input.assetDefinitionIds,
    FIRST_RELEASE_CONFIDENTIAL_NOTE_MAX_ASSETS,
  );
  if (!rawAssetDefinitionIds) {
    throw new Error("assetDefinitionIds must be an exact bounded array.");
  }
  const assetDefinitionIds = new Set<string>();
  for (const value of rawAssetDefinitionIds) {
    if (
      typeof value !== "string" ||
      !isCanonicalAssetDefinitionId(value) ||
      assetDefinitionIds.has(value)
    ) {
      throw new Error(
        "assetDefinitionIds must contain unique canonical definition IDs.",
      );
    }
    assetDefinitionIds.add(value);
  }
  const receiveKeys = requireReceiveKeys(input.receiveKeys);
  if (
    input.markUnrecognizedTransfersInexact !== undefined &&
    typeof input.markUnrecognizedTransfersInexact !== "boolean"
  ) {
    throw new Error("markUnrecognizedTransfersInexact must be a boolean.");
  }
  const txList = requireConfidentialTransactions(transactions).sort(
    compareTransactionsChronologically,
  );
  if (!assetDefinitionIds.size) {
    return {
      exact: true,
      notes: [],
      spendableQuantity: "0",
      treeCommitmentsHex: [],
    };
  }

  const recoveredNotesByNullifier = new Map<
    string,
    WalletRecoveredConfidentialNote
  >();
  const spentNullifiers = new Set<string>();
  const observedSpentNullifiers = new Set<string>();
  const observedCommitments = new Set<string>();
  const treeCommitmentsHex: string[] = [];
  let exact = true;

  for (const transaction of txList) {
    const txHash = transaction.entrypoint_hash!;
    const notesByCommitment = readWalletNotesForTransaction(transaction, {
      privateKeyHex: input.privateKeyHex,
      receiveKeys,
      assetDefinitionIds,
    });

    const shieldInstructions = (transaction.instructions ?? [])
      .map((instruction) =>
        parseShieldInstruction(instruction, assetDefinitionIds),
      )
      .filter((entry): entry is ParsedShieldInstruction => Boolean(entry));
    for (const shield of shieldInstructions) {
      if (observedCommitments.has(shield.commitment_hex)) {
        throw new Error("Confidential ledger contains a duplicate commitment.");
      }
      observedCommitments.add(shield.commitment_hex);
      const leafIndex = treeCommitmentsHex.length;
      treeCommitmentsHex.push(shield.commitment_hex);
      const decrypted = notesByCommitment.get(shield.commitment_hex);
      if (decrypted?.kind === "current") {
        const nullifierHex = deriveWalletConfidentialNullifierHex({
          privateKeyHex: input.privateKeyHex,
          assetDefinitionId: decrypted.note.asset_definition_id,
          networkId: input.networkId,
          rhoHex: decrypted.note.rho_hex,
        });
        if (recoveredNotesByNullifier.has(nullifierHex)) {
          throw new Error("Confidential ledger contains a duplicate note.");
        }
        recoveredNotesByNullifier.set(nullifierHex, {
          ...decrypted.note,
          nullifier_hex: nullifierHex,
          source_tx_hash: txHash,
          leaf_index: leafIndex,
        });
      }
    }

    const transferInstructions = (transaction.instructions ?? [])
      .map((instruction) =>
        parseTransferInstruction(instruction, assetDefinitionIds),
      )
      .filter((entry): entry is ParsedTransferInstruction => Boolean(entry));
    for (const transfer of transferInstructions) {
      for (const nullifierHex of transfer.inputs) {
        if (observedSpentNullifiers.has(nullifierHex)) {
          throw new Error("Confidential ledger contains a repeated nullifier.");
        }
        observedSpentNullifiers.add(nullifierHex);
        if (recoveredNotesByNullifier.has(nullifierHex)) {
          spentNullifiers.add(nullifierHex);
        }
      }
      let recognizedOutput = false;
      for (const commitmentHex of transfer.outputs) {
        if (observedCommitments.has(commitmentHex)) {
          throw new Error(
            "Confidential ledger contains a duplicate commitment.",
          );
        }
        observedCommitments.add(commitmentHex);
        const leafIndex = treeCommitmentsHex.length;
        treeCommitmentsHex.push(commitmentHex);
        const decrypted = notesByCommitment.get(commitmentHex);
        if (decrypted?.kind === "current") {
          recognizedOutput = true;
          const nullifierHex = deriveWalletConfidentialNullifierHex({
            privateKeyHex: input.privateKeyHex,
            assetDefinitionId: decrypted.note.asset_definition_id,
            networkId: input.networkId,
            rhoHex: decrypted.note.rho_hex,
          });
          if (recoveredNotesByNullifier.has(nullifierHex)) {
            throw new Error("Confidential ledger contains a duplicate note.");
          }
          recoveredNotesByNullifier.set(nullifierHex, {
            ...decrypted.note,
            nullifier_hex: nullifierHex,
            source_tx_hash: txHash,
            leaf_index: leafIndex,
          });
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
      .map((instruction) =>
        parseUnshieldInstruction(instruction, assetDefinitionIds),
      )
      .filter((entry): entry is ParsedUnshieldInstruction => Boolean(entry));
    for (const unshield of unshieldInstructions) {
      for (const nullifierHex of unshield.inputs) {
        if (observedSpentNullifiers.has(nullifierHex)) {
          throw new Error("Confidential ledger contains a repeated nullifier.");
        }
        observedSpentNullifiers.add(nullifierHex);
        if (recoveredNotesByNullifier.has(nullifierHex)) {
          spentNullifiers.add(nullifierHex);
        }
      }
      let recognizedOutput = false;
      for (const commitmentHex of unshield.outputs) {
        if (observedCommitments.has(commitmentHex)) {
          throw new Error(
            "Confidential ledger contains a duplicate commitment.",
          );
        }
        observedCommitments.add(commitmentHex);
        const leafIndex = treeCommitmentsHex.length;
        treeCommitmentsHex.push(commitmentHex);
        const decrypted = notesByCommitment.get(commitmentHex);
        if (decrypted?.kind === "current") {
          recognizedOutput = true;
          const nullifierHex = deriveWalletConfidentialNullifierHex({
            privateKeyHex: input.privateKeyHex,
            assetDefinitionId: decrypted.note.asset_definition_id,
            networkId: input.networkId,
            rhoHex: decrypted.note.rho_hex,
          });
          if (recoveredNotesByNullifier.has(nullifierHex)) {
            throw new Error("Confidential ledger contains a duplicate note.");
          }
          recoveredNotesByNullifier.set(nullifierHex, {
            ...decrypted.note,
            nullifier_hex: nullifierHex,
            source_tx_hash: txHash,
            leaf_index: leafIndex,
          });
        }
      }
      if (
        unshield.outputs.length > 0 &&
        !recognizedOutput &&
        notesByCommitment.size === 0
      ) {
        exact = false;
      }
    }
  }

  const notes = [...recoveredNotesByNullifier.values()]
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
  return {
    exact,
    notes,
    spendableQuantity,
    treeCommitmentsHex,
  };
};

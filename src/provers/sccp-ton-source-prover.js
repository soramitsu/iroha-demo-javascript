/* global BigInt */

import {
  buildTairaXorTonToTairaTransferPayload,
  canonicalSccpPayloadEnvelopeBytes,
  sccpMerkleRootFromCommitment,
  sccpPayloadHash,
  sccpTransferMessageId,
} from "@iroha/iroha-js/sccp";
import { blake2b } from "@noble/hashes/blake2b";

const ROUTE_ID = "taira_ton_xor";
const ASSET_KEY = "xor";
const TAIRA_DOMAIN = 0;
const DECIMALS = 9;

const bytesToHex = (bytes) =>
  `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;

const hexToBytes = (value, label) => {
  const body = normalizeHex32(value, label).slice(2);
  return Uint8Array.from(
    body.match(/.{1,2}/gu).map((byte) => Number.parseInt(byte, 16)),
  );
};

const concatBytes = (...chunks) => {
  const out = new Uint8Array(
    chunks.reduce((total, chunk) => total + chunk.length, 0),
  );
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
};

const writeU32Le = (value) => {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, Number(value), true);
  return out;
};

const sourceEventDigest = ({ messageId, payloadHash }) =>
  bytesToHex(
    blake2b(
      concatBytes(
        new TextEncoder().encode("sccp:source:event:v1"),
        Uint8Array.from([1]),
        writeU32Le(4),
        writeU32Le(TAIRA_DOMAIN),
        hexToBytes(messageId, "messageId"),
        hexToBytes(payloadHash, "payloadHash"),
      ),
      { dkLen: 32 },
    ),
  );

const buildTonTestnetSourceChainProofEnvelope = (input) => {
  const normalized = {
    schema: "iroha-demo-ton-testnet-source-proof-envelope/v1",
    txId: normalizeHex32(input.txId, "txId"),
    messageId: normalizeHex32(input.messageId, "messageId"),
    payloadHash: normalizeHex32(input.payloadHash, "payloadHash"),
    commitmentRoot: normalizeHex32(input.commitmentRoot, "commitmentRoot"),
    finalityHeight: String(input.finalityHeight ?? "0"),
    finalityBlockHash: input.finalityBlockHash
      ? normalizeHex32(input.finalityBlockHash, "finalityBlockHash")
      : normalizeHex32(input.commitmentRoot, "commitmentRoot"),
  };
  const encoded = new TextEncoder().encode(JSON.stringify(normalized));
  return {
    sourceProofHex: bytesToHex(encoded),
    sourceEventDigest: sourceEventDigest(normalized),
  };
};

const asRecord = (value, label) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
  return value;
};

const readString = (value, label) => {
  const text = String(value ?? "").trim();
  if (!text) {
    throw new TypeError(`${label} is required.`);
  }
  return text;
};

const optionalString = (record, ...keys) => {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (typeof value === "number" || typeof value === "bigint") {
      return String(value);
    }
  }
  return "";
};

const normalizeHex32 = (value, label) => {
  const raw = readString(value, label).toLowerCase().replace(/^0x/u, "");
  if (!/^[0-9a-f]{64}$/u.test(raw) || /^0+$/u.test(raw)) {
    throw new TypeError(`${label} must be a non-zero 32-byte hex value.`);
  }
  return `0x${raw}`;
};

const decimalToBaseUnits = (value) => {
  const text = readString(value, "amountDecimal");
  if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/u.test(text)) {
    throw new TypeError("amountDecimal must be a positive decimal string.");
  }
  const [whole, fraction = ""] = text.split(".");
  if (fraction.length > DECIMALS) {
    throw new TypeError("amountDecimal has too many fractional digits.");
  }
  const baseUnits =
    BigInt(whole) * 10n ** BigInt(DECIMALS) +
    BigInt((fraction + "0".repeat(DECIMALS)).slice(0, DECIMALS) || "0");
  if (baseUnits <= 0n) {
    throw new TypeError("amountDecimal must be greater than zero.");
  }
  return baseUnits.toString();
};

const readAmountBaseUnits = (input, transaction) => {
  const explicit = optionalString(
    transaction,
    "amountBaseUnits",
    "amount_base_units",
  );
  if (explicit) {
    if (!/^[1-9][0-9]*$/u.test(explicit)) {
      throw new TypeError("transaction.amountBaseUnits must be positive.");
    }
    return explicit;
  }
  return decimalToBaseUnits(input.amountDecimal ?? input.amount_decimal);
};

const readNonce = (input, transaction) => {
  const nonce =
    optionalString(transaction, "nonce") || optionalString(input, "nonce");
  if (!/^(?:0|[1-9][0-9]*)$/u.test(nonce)) {
    throw new TypeError(
      "TON source proof input must include the source-record nonce.",
    );
  }
  return nonce;
};

const buildTonSourceProofPackage = (inputValue) => {
  const input = asRecord(inputValue, "TON source proof input");
  const transaction = asRecord(
    input.transaction ?? {},
    "TON source proof input.transaction",
  );
  const txId = normalizeHex32(
    input.txId ??
      input.tx_id ??
      transaction.hash ??
      transaction.txId ??
      transaction.tx_id,
    "txId",
  );
  const tonSender = readString(
    input.tonSender ?? input.ton_sender,
    "tonSender",
  );
  const tairaRecipient = readString(
    input.tairaRecipient ?? input.taira_recipient,
    "tairaRecipient",
  );
  const amount = readAmountBaseUnits(input, transaction);
  const nonce = readNonce(input, transaction);
  const payload = buildTairaXorTonToTairaTransferPayload({
    tonSender,
    tairaRecipient,
    amount,
    nonce,
    routeId: ROUTE_ID,
    assetKey: ASSET_KEY,
  });
  const payloadHash = sccpPayloadHash(
    canonicalSccpPayloadEnvelopeBytes({
      kind: "Transfer",
      value: payload,
    }),
  );
  const messageId = sccpTransferMessageId(payload);
  const expectedPayloadHash = optionalString(
    transaction,
    "payloadHash",
    "payload_hash",
  );
  if (
    expectedPayloadHash &&
    normalizeHex32(expectedPayloadHash, "payloadHash") !== payloadHash
  ) {
    throw new TypeError(
      "TON source payload hash does not match the source record.",
    );
  }
  const expectedMessageId = optionalString(
    transaction,
    "messageId",
    "message_id",
  );
  if (
    expectedMessageId &&
    normalizeHex32(expectedMessageId, "messageId") !== messageId
  ) {
    throw new TypeError(
      "TON source message id does not match the source record.",
    );
  }
  const commitment = {
    version: 1,
    kind: "Transfer",
    target_domain: TAIRA_DOMAIN,
    message_id: messageId,
    payload_hash: payloadHash,
  };
  const merkleProof = { steps: [] };
  const commitmentRoot = sccpMerkleRootFromCommitment(commitment, merkleProof);
  const expectedCommitmentRoot = optionalString(
    transaction,
    "commitmentRoot",
    "commitment_root",
  );
  if (
    expectedCommitmentRoot &&
    normalizeHex32(expectedCommitmentRoot, "commitmentRoot") !== commitmentRoot
  ) {
    throw new TypeError(
      "TON source commitment root does not match the source record.",
    );
  }
  const sourceProof = buildTonTestnetSourceChainProofEnvelope({
    txId,
    messageId,
    payloadHash,
    commitmentRoot,
    ...(optionalString(input, "finalityHeight", "finality_height")
      ? {
          finalityHeight: optionalString(
            input,
            "finalityHeight",
            "finality_height",
          ),
        }
      : {}),
    ...(optionalString(input, "finalityBlockHash", "finality_block_hash")
      ? {
          finalityBlockHash: optionalString(
            input,
            "finalityBlockHash",
            "finality_block_hash",
          ),
        }
      : {}),
  });

  return {
    txId,
    messageId,
    commitmentRoot,
    amountBaseUnits: amount,
    sourceEventDigest: sourceProof.sourceEventDigest,
    messageBundle: {
      version: 1,
      commitmentRoot,
      commitment,
      merkleProof,
      payload: {
        kind: "Transfer",
        value: payload,
      },
      finalityProof: sourceProof.sourceProofHex,
    },
    settlement: {
      entrypoint: "finalize_inbound",
      route: ROUTE_ID,
    },
  };
};

export const proveTonSccpSource = async (input) =>
  buildTonSourceProofPackage(input);

export const irohaSccpTonSourceProve = proveTonSccpSource;
export const tonSccpSourceProve = proveTonSccpSource;
export const proveTonSource = proveTonSccpSource;

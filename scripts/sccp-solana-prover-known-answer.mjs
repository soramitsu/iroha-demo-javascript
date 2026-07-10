/* global BigInt */
import { createHash } from "node:crypto";
import { PublicKey } from "@solana/web3.js";
import {
  SCCP_CODEC_SOLANA_BASE58,
  SCCP_CODEC_TEXT_UTF8,
  canonicalSccpMessageProofBundleBytes,
  canonicalSccpPayloadEnvelopeBytes,
  sccpMerkleRootFromCommitment,
  sccpPayloadHash,
  sccpTransferMessageId,
} from "@iroha/iroha-js/sccp";
import {
  SCCP_SOLANA_DOMAIN,
  SCCP_SOLANA_XOR_ROUTE_ID,
  SCCP_XOR_ASSET_KEY,
  SOLANA_DESTINATION_PROOF_BACKEND,
  SOLANA_SOURCE_PROOF_BACKEND,
  SOLANA_TESTNET_GENESIS_HASH,
  SOLANA_TESTNET_NETWORK_ID,
} from "./e2e/sccp-solana-route-preflight.mjs";

export const SOLANA_PROVER_KNOWN_ANSWER_INPUT_SCHEMA =
  "iroha-demo-sccp-solana-prover-known-answer-input/v1";
export const SOLANA_PROVER_KNOWN_ANSWER_VECTOR_SCHEMA =
  "iroha-demo-sccp-solana-prover-known-answer-vector/v1";
export const SOLANA_PROVER_KNOWN_ANSWER_VALIDATION_SCHEMA =
  "iroha-demo-sccp-solana-prover-known-answer-validation/v1";
export const SOLANA_PROVER_KNOWN_ANSWER_VERIFICATION_RECEIPT_SCHEMA =
  "iroha-demo-sccp-solana-prover-known-answer-verification-receipt/v1";

const SCCP_SORA_DOMAIN = 0;
const HEX_BYTES = /^0x(?:[0-9a-f]{2})+$/iu;
const PROOF_KEYS = new Set([
  "proof",
  "proofBytes",
  "proof_bytes",
  "proofHex",
  "proof_hex",
  "recursiveProof",
  "recursive_proof",
  "finalityProof",
  "finality_proof",
]);
const FORBIDDEN_PROVER_ATTESTATION_KEYS = new Set([
  "knownAnswer",
  "known_answer",
  "knownAnswerProbe",
  "known_answer_probe",
  "knownAnswerVector",
  "known_answer_vector",
]);
const VECTOR_KEYS = Object.freeze([
  "schema",
  "challengeId",
  "routeId",
  "assetKey",
  "direction",
  "network",
  "genesisHash",
  "proofBackend",
  "sourceDomain",
  "targetDomain",
  "inputHash",
  "packageHash",
  "proofMaterialHash",
  "verifierKeyHash",
  "verifierArtifactHash",
  "verificationReceiptHash",
]);
const VERIFICATION_RECEIPT_KEYS = Object.freeze([
  "schema",
  "challengeId",
  "routeId",
  "assetKey",
  "direction",
  "network",
  "genesisHash",
  "proofBackend",
  "inputHash",
  "packageHash",
  "proofMaterialHash",
  "verifierKeyHash",
  "verifierArtifactHash",
  "verified",
]);
const SHA256_HEX = /^0x[0-9a-f]{64}$/u;

const profiles = Object.freeze({
  destination: Object.freeze({
    direction: "destination",
    proofBackend: SOLANA_DESTINATION_PROOF_BACKEND,
    sourceDomain: SCCP_SORA_DOMAIN,
    targetDomain: SCCP_SOLANA_DOMAIN,
  }),
  source: Object.freeze({
    direction: "source",
    proofBackend: SOLANA_SOURCE_PROOF_BACKEND,
    sourceDomain: SCCP_SOLANA_DOMAIN,
    targetDomain: SCCP_SORA_DOMAIN,
  }),
});

const isRecord = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const bytesToHex = (bytes) =>
  `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  )}`;

const concatBytes = (...parts) =>
  Buffer.concat(parts.map((part) => Buffer.from(part)));

const u32Le = (value) => {
  const out = Buffer.alloc(4);
  out.writeUInt32LE(value);
  return out;
};

const u64Le = (value) => {
  const out = Buffer.alloc(8);
  out.writeBigUInt64LE(BigInt(value));
  return out;
};

const borshVector = (value) => {
  const bytes = Buffer.from(value);
  return concatBytes(u32Le(bytes.length), bytes);
};

const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

const base58Encode = (bytes) => {
  const input = Buffer.from(bytes);
  let value = 0n;
  for (const byte of input) {
    value = (value << 8n) | BigInt(byte);
  }
  let encoded = "";
  while (value > 0n) {
    encoded = `${BASE58_ALPHABET[Number(value % 58n)]}${encoded}`;
    value /= 58n;
  }
  const firstNonZero = input.findIndex((byte) => byte !== 0);
  const leadingZeroes = firstNonZero < 0 ? input.length : firstNonZero;
  return `${"1".repeat(leadingZeroes)}${encoded}`;
};

const findProgramAddress = (seeds, programId) => {
  const programBytes = new PublicKey(programId).toBytes();
  for (let bump = 255; bump >= 0; bump -= 1) {
    const digest = createHash("sha256")
      .update(
        concatBytes(
          ...seeds,
          Buffer.from([bump]),
          programBytes,
          Buffer.from("ProgramDerivedAddress"),
        ),
      )
      .digest();
    if (!PublicKey.isOnCurve(digest)) {
      return new PublicKey(digest);
    }
  }
  throw new Error("Unable to derive Solana source burn receipt PDA.");
};

const canonicalValue = (value, seen = new Set()) => {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Known-answer values must use finite numbers.");
    }
    return value;
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (ArrayBuffer.isView(value)) {
    return bytesToHex(
      new Uint8Array(value.buffer, value.byteOffset, value.byteLength),
    );
  }
  if (value instanceof ArrayBuffer) {
    return bytesToHex(new Uint8Array(value));
  }
  if (typeof value !== "object" || value === null) {
    throw new Error("Known-answer values must be JSON-compatible data.");
  }
  if (seen.has(value)) {
    throw new Error("Known-answer values must be acyclic.");
  }
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      if (
        Object.getOwnPropertySymbols(value).length > 0 ||
        Object.keys(value).some(
          (key, index) => key !== String(index) || !(index in value),
        ) ||
        Object.keys(value).length !== value.length
      ) {
        throw new Error(
          "Known-answer arrays must be dense and contain no custom properties.",
        );
      }
      return value.map((entry, index) => {
        const descriptor = Object.getOwnPropertyDescriptor(
          value,
          String(index),
        );
        if (
          !descriptor ||
          descriptor.get ||
          descriptor.set ||
          descriptor.enumerable !== true
        ) {
          throw new Error(
            "Known-answer arrays must contain only enumerable data properties.",
          );
        }
        return canonicalValue(entry, seen);
      });
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error("Known-answer values must use plain objects.");
    }
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.some((key) => typeof key !== "string")) {
      throw new Error("Known-answer objects must not contain symbol keys.");
    }
    for (const key of ownKeys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (
        !descriptor ||
        descriptor.get ||
        descriptor.set ||
        descriptor.enumerable !== true
      ) {
        throw new Error(
          "Known-answer objects must contain only enumerable data properties.",
        );
      }
    }
    return Object.fromEntries(
      ownKeys.sort().map((key) => [key, canonicalValue(value[key], seen)]),
    );
  } finally {
    seen.delete(value);
  }
};

export const canonicalSolanaProverKnownAnswerJson = (value) =>
  JSON.stringify(canonicalValue(value));

export const solanaProverKnownAnswerSha256 = (value) =>
  `0x${createHash("sha256")
    .update(canonicalSolanaProverKnownAnswerJson(value))
    .digest("hex")}`;

const profileForDirection = (direction) => {
  const profile = profiles[direction];
  if (!profile) {
    throw new Error("Solana prover direction must be destination or source.");
  }
  return profile;
};

const knownAnswerBase = (direction) => {
  const profile = profileForDirection(direction);
  return {
    schema: SOLANA_PROVER_KNOWN_ANSWER_INPUT_SCHEMA,
    challengeId: `taira-sol-xor-${direction}-known-answer-v1`,
    routeId: SCCP_SOLANA_XOR_ROUTE_ID,
    assetKey: SCCP_XOR_ASSET_KEY,
    direction,
    network: SOLANA_TESTNET_NETWORK_ID,
    genesisHash: SOLANA_TESTNET_GENESIS_HASH,
    proofBackend: profile.proofBackend,
    sourceDomain: profile.sourceDomain,
    targetDomain: profile.targetDomain,
  };
};

const buildKnownAnswerChallenge = (direction, hashMaterial) => {
  const base = knownAnswerBase(direction);
  const inputHash = solanaProverKnownAnswerSha256(hashMaterial);
  return { ...base, inputHash };
};

export const buildSolanaProverKnownAnswerInvocation = (direction) => {
  const profile = profileForDirection(direction);
  if (direction === "destination") {
    const transfer = {
      version: 1,
      source_domain: SCCP_SORA_DOMAIN,
      dest_domain: SCCP_SOLANA_DOMAIN,
      nonce: "13",
      asset_home_domain: SCCP_SORA_DOMAIN,
      asset_id_codec: SCCP_CODEC_TEXT_UTF8,
      asset_id: SCCP_XOR_ASSET_KEY,
      amount: "1000000000",
      sender_codec: SCCP_CODEC_TEXT_UTF8,
      sender: "testuﾛ1Npﾃﾕヱﾇq11pｳﾘ2ｱ5ﾇｦiCJKjRﾔzｷNMNﾆｹﾕPCｳﾙFvｵE9LBLB",
      recipient_codec: SCCP_CODEC_SOLANA_BASE58,
      recipient: "gBxS1f6uyyGPuW5MzGBukidSb71jdsCb5fZaoSzULE5",
      route_id_codec: SCCP_CODEC_TEXT_UTF8,
      route_id: SCCP_SOLANA_XOR_ROUTE_ID,
    };
    const payload = { kind: "Transfer", value: transfer };
    const messageId = sccpTransferMessageId(transfer);
    const payloadHash = sccpPayloadHash(
      canonicalSccpPayloadEnvelopeBytes(payload),
    );
    const commitment = {
      version: 1,
      kind: "Transfer",
      target_domain: SCCP_SOLANA_DOMAIN,
      message_id: messageId,
      payload_hash: payloadHash,
    };
    const merkleProof = { steps: [] };
    const commitmentRoot = sccpMerkleRootFromCommitment(
      commitment,
      merkleProof,
    );
    const bundleBytes = canonicalSccpMessageProofBundleBytes({
      version: 1,
      commitment_root: commitmentRoot,
      commitment,
      merkle_proof: merkleProof,
      payload,
      finality_proof: "0x",
    });
    const witness = {
      messageId,
      payloadHash,
    };
    const contextBase = {
      routeId: SCCP_SOLANA_XOR_ROUTE_ID,
      assetKey: SCCP_XOR_ASSET_KEY,
      solanaNetwork: SOLANA_TESTNET_NETWORK_ID,
      solanaNetworkId: SOLANA_TESTNET_NETWORK_ID,
      solanaGenesisHash: SOLANA_TESTNET_GENESIS_HASH,
      proofBackend: profile.proofBackend,
      requiredProofBackend: profile.proofBackend,
      publicInputs: {
        messageId,
        payloadHash,
        targetDomain: SCCP_SOLANA_DOMAIN,
        commitmentRoot,
        finalityHeight: "42",
        finalityBlockHash: `0x${"44".repeat(32)}`,
      },
      bundleBytes: bytesToHex(bundleBytes),
      manifest: {
        route_id: SCCP_SOLANA_XOR_ROUTE_ID,
        asset_key: SCCP_XOR_ASSET_KEY,
        solana_network: SOLANA_TESTNET_NETWORK_ID,
        solana_genesis_hash: SOLANA_TESTNET_GENESIS_HASH,
        destination_proof_backend: profile.proofBackend,
      },
    };
    const challenge = buildKnownAnswerChallenge(direction, {
      witness,
      context: contextBase,
    });
    return {
      direction,
      profile,
      challengeId: challenge.challengeId,
      inputHash: challenge.inputHash,
      args: [witness, contextBase],
    };
  }

  const sourceBridgeAddress = "4ZKKGz983uec9Bcx6YA9nZ5tcAKCPi514tFyHuFGjcLq";
  const sourceStateAddress = "HWaaX4WBs6iYiNQQbKUgRNR2pWBf1Ms81Q6aP58FzXQS";
  const tokenMintAddress = new PublicKey(
    createHash("sha256").update("solana source KAT mint").digest(),
  ).toBase58();
  const sourceTokenAddress = new PublicKey(
    createHash("sha256").update("solana source KAT token").digest(),
  ).toBase58();
  const ownerAddress = "gBxS1f6uyyGPuW5MzGBukidSb71jdsCb5fZaoSzULE5";
  const tairaRecipient =
    "testuﾛ1Npﾃﾕヱﾇq11pｳﾘ2ｱ5ﾇｦiCJKjRﾔzｷNMNﾆｹﾕPCｳﾙFvｵE9LBLB";
  const txId =
    "2AXDGYSE4f2sz7tvMMzyHvUfcoJmxudvdhBcmiUSo6ijwfYmfZYsKRxboQMPh3R4kUhXRVdtSXFXMheka4Rc4P2";
  const amountBaseUnits = "1000000000";
  const nonce = "13";
  const finalizedSlot = 420_000_000;
  const nonceBytes = u64Le(nonce);
  const sourceBurnReceiptAddress = findProgramAddress(
    [
      Buffer.from("sccp-source-burn-receipt"),
      new PublicKey(sourceStateAddress).toBuffer(),
      new PublicKey(ownerAddress).toBuffer(),
      nonceBytes,
    ],
    sourceBridgeAddress,
  );
  const recipientBytes = Buffer.from(tairaRecipient, "utf8");
  const recipientLength = Buffer.alloc(2);
  recipientLength.writeUInt16LE(recipientBytes.length);
  const sourceEventHashBytes = createHash("sha256")
    .update(Buffer.from("sccp:solana:source-burn:v1"))
    .update(new PublicKey(sourceBridgeAddress).toBuffer())
    .update(new PublicKey(sourceStateAddress).toBuffer())
    .update(new PublicKey(tokenMintAddress).toBuffer())
    .update(new PublicKey(ownerAddress).toBuffer())
    .update(new PublicKey(sourceTokenAddress).toBuffer())
    .update(recipientLength)
    .update(recipientBytes)
    .update(u64Le(amountBaseUnits))
    .update(nonceBytes)
    .update(u64Le(finalizedSlot))
    .digest();
  const burnEnvelope = concatBytes(
    borshVector(Buffer.from("burn_to_taira")),
    borshVector(u64Le(amountBaseUnits)),
    borshVector(recipientBytes),
    borshVector(nonceBytes),
  );
  const burnCpi = concatBytes(Buffer.from([8]), u64Le(amountBaseUnits));
  const createReceiptCpi = concatBytes(
    u32Le(0),
    u64Le(1),
    u64Le(192),
    new PublicKey(sourceBridgeAddress).toBuffer(),
  );
  const sourceEventHash = bytesToHex(sourceEventHashBytes);
  const accountKeys = [
    ownerAddress,
    sourceStateAddress,
    sourceTokenAddress,
    tokenMintAddress,
    sourceBurnReceiptAddress.toBase58(),
    "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    "11111111111111111111111111111111",
    sourceBridgeAddress,
  ];
  const inputBase = {
    manifest: {
      route_id: SCCP_SOLANA_XOR_ROUTE_ID,
      asset_key: SCCP_XOR_ASSET_KEY,
      solana_network: SOLANA_TESTNET_NETWORK_ID,
      solana_genesis_hash: SOLANA_TESTNET_GENESIS_HASH,
      source_proof_backend: profile.proofBackend,
      solanaSourceBridgeAddress: sourceBridgeAddress,
      solanaSourceStateAddress: sourceStateAddress,
      solanaTokenMint: tokenMintAddress,
    },
    solanaNetwork: "testnet",
    solanaNetworkId: SOLANA_TESTNET_NETWORK_ID,
    solanaGenesisHash: SOLANA_TESTNET_GENESIS_HASH,
    sourceProofBackend: profile.proofBackend,
    sourceBridgeAddress,
    sourceStateAddress,
    tokenMintAddress,
    txId,
    transaction: {
      slot: finalizedSlot,
      version: "legacy",
      transaction: {
        signatures: [txId],
        message: {
          header: {
            numRequiredSignatures: 1,
            numReadonlySignedAccounts: 0,
            numReadonlyUnsignedAccounts: 3,
          },
          accountKeys,
          recentBlockhash: new PublicKey(
            createHash("sha256")
              .update("solana source KAT recent blockhash")
              .digest(),
          ).toBase58(),
          instructions: [
            {
              programIdIndex: 7,
              accounts: [0, 1, 2, 3, 5, 4, 6],
              data: base58Encode(burnEnvelope),
            },
          ],
        },
      },
      meta: {
        err: null,
        innerInstructions: [
          {
            index: 0,
            instructions: [
              {
                programIdIndex: 5,
                accounts: [2, 3, 0],
                data: base58Encode(burnCpi),
              },
              {
                programIdIndex: 6,
                accounts: [0, 4],
                data: base58Encode(createReceiptCpi),
              },
            ],
          },
        ],
        preTokenBalances: [
          {
            accountIndex: 2,
            mint: tokenMintAddress,
            owner: ownerAddress,
            programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
            uiTokenAmount: { amount: "2000000000", decimals: 9 },
          },
        ],
        postTokenBalances: [
          {
            accountIndex: 2,
            mint: tokenMintAddress,
            owner: ownerAddress,
            programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
            uiTokenAmount: { amount: "1000000000", decimals: 9 },
          },
        ],
        logMessages: [
          `Program log: burned SCCP Solana XOR for TAIRA settlement: [${Array.from(sourceEventHashBytes).join(", ")}]`,
        ],
      },
    },
    signatureStatus: {
      slot: finalizedSlot,
      confirmationStatus: "finalized",
      err: null,
    },
    finality: {
      slot: finalizedSlot,
      confirmationStatus: "finalized",
      err: null,
    },
    solanaSender: ownerAddress,
    tairaRecipient,
    amountDecimal: "1",
    amountBaseUnits,
    sourceTokenAddress,
    sourceBurnReceiptAddress: sourceBurnReceiptAddress.toBase58(),
    nonce,
    sourceEventHash,
    finalizedSlot: String(finalizedSlot),
  };
  const challenge = buildKnownAnswerChallenge(direction, inputBase);
  return {
    direction,
    profile,
    challengeId: challenge.challengeId,
    inputHash: challenge.inputHash,
    args: [inputBase],
  };
};

const isNonZeroSha256 = (value) =>
  SHA256_HEX.test(String(value ?? "")) && !/^0x0{64}$/u.test(value);

const proofMaterialPresent = (value) =>
  (typeof value === "string" &&
    ((HEX_BYTES.test(value) && value.length >= 34) || value.length >= 24)) ||
  (Array.isArray(value) && value.length >= 16) ||
  (ArrayBuffer.isView(value) && value.byteLength >= 16) ||
  (value instanceof ArrayBuffer && value.byteLength >= 16);

const jsonPointer = (segments) =>
  `/${segments
    .map((segment) =>
      String(segment).replace(/~/gu, "~0").replace(/\//gu, "~1"),
    )
    .join("/")}`;

const proofMaterialEntries = (
  value,
  segments = [],
  found = [],
  seen = new Set(),
) => {
  if (!value || typeof value !== "object") {
    return found;
  }
  if (seen.has(value)) {
    throw new Error("Known-answer proof output must be acyclic.");
  }
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      value.forEach((entry, index) =>
        proofMaterialEntries(entry, [...segments, index], found, seen),
      );
      return found;
    }
    for (const key of Object.keys(value).sort()) {
      const entry = value[key];
      const path = [...segments, key];
      if (PROOF_KEYS.has(key) && proofMaterialPresent(entry)) {
        found.push({ path: jsonPointer(path), value: canonicalValue(entry) });
      }
      proofMaterialEntries(entry, path, found, seen);
    }
    return found;
  } finally {
    seen.delete(value);
  }
};

const forbiddenAttestationPaths = (
  value,
  segments = [],
  found = [],
  seen = new Set(),
) => {
  if (!value || typeof value !== "object" || seen.has(value)) {
    return found;
  }
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      value.forEach((entry, index) =>
        forbiddenAttestationPaths(entry, [...segments, index], found, seen),
      );
      return found;
    }
    for (const key of Object.keys(value).sort()) {
      const path = [...segments, key];
      if (FORBIDDEN_PROVER_ATTESTATION_KEYS.has(key)) {
        found.push(jsonPointer(path));
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor && "value" in descriptor) {
        forbiddenAttestationPaths(descriptor.value, path, found, seen);
      }
    }
    return found;
  } finally {
    seen.delete(value);
  }
};

const inspectKnownAnswerResult = ({ direction, result }) => {
  const errors = [];
  if (!isRecord(result)) {
    return {
      errors: ["Solana prover known-answer output must be an object."],
      packageHash: null,
      proofMaterialHash: null,
      proofEntries: [],
    };
  }
  const expectedKeys =
    direction === "destination"
      ? ["request", "submission"]
      : ["messageBundle", "settlement"];
  const actualKeys = Object.keys(result).sort();
  const unknownKeys = actualKeys.filter((key) => !expectedKeys.includes(key));
  const missingKeys = expectedKeys.filter(
    (key) => !Object.prototype.hasOwnProperty.call(result, key),
  );
  if (unknownKeys.length > 0) {
    errors.push(
      `Known-answer output contains unsupported top-level field(s): ${unknownKeys.join(", ")}.`,
    );
  }
  if (missingKeys.length > 0) {
    errors.push(
      `Known-answer output is missing top-level field(s): ${missingKeys.join(", ")}.`,
    );
  }
  if (expectedKeys.some((key) => !isRecord(result[key]))) {
    errors.push(
      direction === "destination"
        ? "Destination known-answer output must contain only request and submission objects."
        : "Source known-answer output must contain only messageBundle and settlement objects.",
    );
  }
  const forbiddenPaths = forbiddenAttestationPaths(result);
  if (forbiddenPaths.length > 0) {
    errors.push(
      `Prover-returned known-answer attestations are forbidden: ${forbiddenPaths.join(", ")}.`,
    );
  }
  let packageHash = null;
  let proofEntries = [];
  let proofMaterialHash = null;
  try {
    packageHash = solanaProverKnownAnswerSha256(result);
    const proofContainer =
      direction === "destination" ? result.submission : result.messageBundle;
    proofEntries = isRecord(proofContainer)
      ? proofMaterialEntries(proofContainer, [
          direction === "destination" ? "submission" : "messageBundle",
        ])
      : [];
    proofMaterialHash = solanaProverKnownAnswerSha256(proofEntries);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  if (proofEntries.length === 0) {
    errors.push(
      direction === "destination"
        ? "Known-answer submission contains no non-empty proof material."
        : "Known-answer message bundle contains no non-empty proof material.",
    );
  }
  return { errors, packageHash, proofMaterialHash, proofEntries };
};

const validateHashRecord = ({ record, keys, label, errors }) => {
  if (!isRecord(record)) {
    errors.push(`${label} is missing.`);
    return {};
  }
  const unknownKeys = Object.keys(record).filter((key) => !keys.includes(key));
  const missingKeys = keys.filter(
    (key) => !Object.prototype.hasOwnProperty.call(record, key),
  );
  if (unknownKeys.length > 0) {
    errors.push(
      `${label} contains unknown field(s): ${unknownKeys.join(", ")}.`,
    );
  }
  if (missingKeys.length > 0) {
    errors.push(`${label} is missing field(s): ${missingKeys.join(", ")}.`);
  }
  for (const key of keys) {
    if (!isNonZeroSha256(record[key])) {
      errors.push(`${label}.${key} must be a non-zero SHA-256 hash.`);
    }
  }
  return Object.fromEntries(keys.map((key) => [key, record[key] ?? null]));
};

export const solanaProverKnownAnswerVectorHash = (vector) =>
  solanaProverKnownAnswerSha256(vector);

export const validateSolanaProverKnownAnswerVerificationReceipt = ({
  direction,
  receipt,
  vector,
} = {}) => {
  const errors = [];
  if (!isRecord(receipt)) {
    return ["Independent known-answer verification receipt is missing."];
  }
  const unknownKeys = Object.keys(receipt).filter(
    (key) => !VERIFICATION_RECEIPT_KEYS.includes(key),
  );
  const missingKeys = VERIFICATION_RECEIPT_KEYS.filter(
    (key) => !Object.prototype.hasOwnProperty.call(receipt, key),
  );
  if (unknownKeys.length > 0) {
    errors.push(
      `Independent verification receipt contains unknown field(s): ${unknownKeys.join(", ")}.`,
    );
  }
  if (missingKeys.length > 0) {
    errors.push(
      `Independent verification receipt is missing field(s): ${missingKeys.join(", ")}.`,
    );
  }
  const expected = {
    schema: SOLANA_PROVER_KNOWN_ANSWER_VERIFICATION_RECEIPT_SCHEMA,
    challengeId: vector?.challengeId,
    routeId: SCCP_SOLANA_XOR_ROUTE_ID,
    assetKey: SCCP_XOR_ASSET_KEY,
    direction,
    network: SOLANA_TESTNET_NETWORK_ID,
    genesisHash: SOLANA_TESTNET_GENESIS_HASH,
    proofBackend: profileForDirection(direction).proofBackend,
    inputHash: vector?.inputHash,
    packageHash: vector?.packageHash,
    proofMaterialHash: vector?.proofMaterialHash,
    verifierKeyHash: vector?.verifierKeyHash,
    verifierArtifactHash: vector?.verifierArtifactHash,
    verified: true,
  };
  for (const [key, value] of Object.entries(expected)) {
    if (receipt[key] !== value) {
      errors.push(
        `Independent verification receipt ${key} must be ${JSON.stringify(value)}.`,
      );
    }
  }
  try {
    canonicalSolanaProverKnownAnswerJson(receipt);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  return errors;
};

export const buildSolanaProverKnownAnswerVectorCandidate = ({
  direction,
  result,
  artifactEvidence,
} = {}) => {
  const invocation = buildSolanaProverKnownAnswerInvocation(direction);
  const profile = profileForDirection(direction);
  const inspected = inspectKnownAnswerResult({ direction, result });
  const artifactErrors = [];
  const artifacts = validateHashRecord({
    record: artifactEvidence,
    keys: [
      "verifierKeyHash",
      "verifierArtifactHash",
      "verificationReceiptHash",
    ],
    label: "Known-answer artifact evidence",
    errors: artifactErrors,
  });
  const errors = [...inspected.errors, ...artifactErrors];
  if (errors.length > 0) {
    throw new Error(
      `Cannot build Solana prover known-answer vector candidate: ${errors.join(" ")}`,
    );
  }
  return {
    schema: SOLANA_PROVER_KNOWN_ANSWER_VECTOR_SCHEMA,
    challengeId: invocation.challengeId,
    routeId: SCCP_SOLANA_XOR_ROUTE_ID,
    assetKey: SCCP_XOR_ASSET_KEY,
    direction,
    network: SOLANA_TESTNET_NETWORK_ID,
    genesisHash: SOLANA_TESTNET_GENESIS_HASH,
    proofBackend: profile.proofBackend,
    sourceDomain: profile.sourceDomain,
    targetDomain: profile.targetDomain,
    inputHash: invocation.inputHash,
    packageHash: inspected.packageHash,
    proofMaterialHash: inspected.proofMaterialHash,
    verifierKeyHash: artifacts.verifierKeyHash,
    verifierArtifactHash: artifacts.verifierArtifactHash,
    verificationReceiptHash: artifacts.verificationReceiptHash,
  };
};

export const validateSolanaProverKnownAnswerVector = ({
  direction,
  vector,
  governance,
  artifactEvidence,
  invocation = buildSolanaProverKnownAnswerInvocation(direction),
} = {}) => {
  const profile = profileForDirection(direction);
  const errors = [];
  if (!isRecord(vector)) {
    errors.push(
      "Independently supplied Solana known-answer vector is missing.",
    );
  }
  const unknownVectorKeys = isRecord(vector)
    ? Object.keys(vector).filter((key) => !VECTOR_KEYS.includes(key))
    : [];
  const missingVectorKeys = isRecord(vector)
    ? VECTOR_KEYS.filter(
        (key) => !Object.prototype.hasOwnProperty.call(vector, key),
      )
    : [...VECTOR_KEYS];
  if (unknownVectorKeys.length > 0) {
    errors.push(
      `Known-answer vector contains unknown field(s): ${unknownVectorKeys.join(", ")}.`,
    );
  }
  if (isRecord(vector) && missingVectorKeys.length > 0) {
    errors.push(
      `Known-answer vector is missing field(s): ${missingVectorKeys.join(", ")}.`,
    );
  }
  const expectedProfile = {
    schema: SOLANA_PROVER_KNOWN_ANSWER_VECTOR_SCHEMA,
    challengeId: invocation.challengeId,
    routeId: SCCP_SOLANA_XOR_ROUTE_ID,
    assetKey: SCCP_XOR_ASSET_KEY,
    direction,
    network: SOLANA_TESTNET_NETWORK_ID,
    genesisHash: SOLANA_TESTNET_GENESIS_HASH,
    proofBackend: profile.proofBackend,
    sourceDomain: profile.sourceDomain,
    targetDomain: profile.targetDomain,
    inputHash: invocation.inputHash,
  };
  if (isRecord(vector)) {
    for (const [key, expected] of Object.entries(expectedProfile)) {
      if (vector[key] !== expected) {
        errors.push(
          `Known-answer vector ${key} must be ${JSON.stringify(expected)}.`,
        );
      }
    }
    for (const key of [
      "packageHash",
      "proofMaterialHash",
      "verifierKeyHash",
      "verifierArtifactHash",
      "verificationReceiptHash",
    ]) {
      if (!isNonZeroSha256(vector[key])) {
        errors.push(
          `Known-answer vector ${key} must be a non-zero SHA-256 hash.`,
        );
      }
    }
  }
  let vectorHash = null;
  if (isRecord(vector)) {
    try {
      vectorHash = solanaProverKnownAnswerVectorHash(vector);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  const normalizedGovernance = validateHashRecord({
    record: governance,
    keys: ["approvalHash", "expectedApprovalHash", "vectorHashPin"],
    label: "Known-answer governance binding",
    errors,
  });
  if (
    normalizedGovernance.approvalHash &&
    normalizedGovernance.expectedApprovalHash &&
    normalizedGovernance.approvalHash !==
      normalizedGovernance.expectedApprovalHash
  ) {
    errors.push(
      "Known-answer governance approval bytes do not match the independent approval hash pin.",
    );
  }
  if (
    vectorHash &&
    normalizedGovernance.vectorHashPin &&
    vectorHash !== normalizedGovernance.vectorHashPin
  ) {
    errors.push(
      "Known-answer vector does not match the governance-approved vector hash pin.",
    );
  }
  const artifacts = validateHashRecord({
    record: artifactEvidence,
    keys: [
      "verifierKeyHash",
      "verifierArtifactHash",
      "verificationReceiptHash",
    ],
    label: "Known-answer artifact evidence",
    errors,
  });
  if (isRecord(vector)) {
    for (const key of [
      "verifierKeyHash",
      "verifierArtifactHash",
      "verificationReceiptHash",
    ]) {
      if (artifacts[key] && artifacts[key] !== vector[key]) {
        errors.push(
          `Known-answer artifact evidence ${key} does not match the governance-pinned vector.`,
        );
      }
    }
  }
  return {
    ready: errors.length === 0,
    errors,
    vectorHash,
    vector: isRecord(vector) ? vector : null,
    governance: normalizedGovernance,
    artifactEvidence: artifacts,
  };
};

const validationSummaryBase = ({
  direction,
  invocation,
  vectorValidation,
  invoked,
  packageHash = null,
  proofMaterialHash = null,
  errors,
}) => ({
  schema: SOLANA_PROVER_KNOWN_ANSWER_VALIDATION_SCHEMA,
  ready: errors.length === 0 && invoked === true,
  invoked,
  challengeId: invocation.challengeId,
  routeId: SCCP_SOLANA_XOR_ROUTE_ID,
  assetKey: SCCP_XOR_ASSET_KEY,
  direction,
  network: SOLANA_TESTNET_NETWORK_ID,
  genesisHash: SOLANA_TESTNET_GENESIS_HASH,
  proofBackend: invocation.profile.proofBackend,
  sourceDomain: invocation.profile.sourceDomain,
  targetDomain: invocation.profile.targetDomain,
  inputHash: invocation.inputHash,
  packageHash,
  proofMaterialHash,
  vectorHash: vectorValidation.vectorHash,
  vector: vectorValidation.vector,
  governance: vectorValidation.governance,
  artifactEvidence: vectorValidation.artifactEvidence,
  errors,
});

export const validateSolanaProverKnownAnswerResult = ({
  direction,
  result,
  vector,
  governance,
  artifactEvidence,
  invocation = buildSolanaProverKnownAnswerInvocation(direction),
} = {}) => {
  const vectorValidation = validateSolanaProverKnownAnswerVector({
    direction,
    vector,
    governance,
    artifactEvidence,
    invocation,
  });
  const inspected = inspectKnownAnswerResult({ direction, result });
  const errors = [...vectorValidation.errors, ...inspected.errors];
  if (
    isRecord(vector) &&
    inspected.packageHash &&
    inspected.packageHash !== vector.packageHash
  ) {
    errors.push(
      "Computed known-answer package hash does not match the governance-pinned vector.",
    );
  }
  if (
    isRecord(vector) &&
    inspected.proofMaterialHash &&
    inspected.proofMaterialHash !== vector.proofMaterialHash
  ) {
    errors.push(
      "Computed known-answer proof-material hash does not match the governance-pinned vector.",
    );
  }
  return validationSummaryBase({
    direction,
    invocation,
    vectorValidation,
    invoked: true,
    packageHash: inspected.packageHash,
    proofMaterialHash: inspected.proofMaterialHash,
    errors,
  });
};

export const invokeSolanaProverKnownAnswer = async ({
  direction,
  prove,
  vector,
  governance,
  artifactEvidence,
  preflightErrors = [],
  timeoutMs = 15_000,
} = {}) => {
  const invocation = buildSolanaProverKnownAnswerInvocation(direction);
  const vectorValidation = validateSolanaProverKnownAnswerVector({
    direction,
    vector,
    governance,
    artifactEvidence,
    invocation,
  });
  const errorsBeforeInvocation = [
    ...vectorValidation.errors,
    ...(Array.isArray(preflightErrors)
      ? preflightErrors.filter((error) => typeof error === "string" && error)
      : ["Known-answer preflight errors must be an array of strings."]),
  ];
  if (typeof prove !== "function") {
    errorsBeforeInvocation.push("Solana prover export is missing.");
  }
  if (errorsBeforeInvocation.length > 0) {
    return validationSummaryBase({
      direction,
      invocation,
      vectorValidation,
      invoked: false,
      errors: [...new Set(errorsBeforeInvocation)],
    });
  }
  let timeout;
  try {
    const result = await Promise.race([
      Promise.resolve().then(() => prove(...invocation.args)),
      new Promise((_, reject) => {
        timeout = setTimeout(
          () =>
            reject(
              new Error(`known-answer prove timed out after ${timeoutMs}ms`),
            ),
          timeoutMs,
        );
      }),
    ]);
    return validateSolanaProverKnownAnswerResult({
      direction,
      result,
      vector,
      governance,
      artifactEvidence,
      invocation,
    });
  } catch (error) {
    return validationSummaryBase({
      direction,
      invocation,
      vectorValidation,
      invoked: true,
      errors: [error instanceof Error ? error.message : String(error)],
    });
  } finally {
    clearTimeout(timeout);
  }
};

export const validateSolanaProverKnownAnswerSummary = ({
  direction,
  summary,
} = {}) => {
  const invocation = buildSolanaProverKnownAnswerInvocation(direction);
  const errors = [];
  if (!isRecord(summary)) {
    return ["Solana prover governance-pinned known-answer summary is missing."];
  }
  const allowedSummaryKeys = new Set([
    "schema",
    "ready",
    "invoked",
    "challengeId",
    "routeId",
    "assetKey",
    "direction",
    "network",
    "genesisHash",
    "proofBackend",
    "sourceDomain",
    "targetDomain",
    "inputHash",
    "packageHash",
    "proofMaterialHash",
    "vectorHash",
    "vector",
    "governance",
    "artifactEvidence",
    "errors",
  ]);
  const unknownKeys = Object.keys(summary).filter(
    (key) => !allowedSummaryKeys.has(key),
  );
  if (unknownKeys.length > 0) {
    errors.push(
      `Known-answer summary contains unknown field(s): ${unknownKeys.join(", ")}.`,
    );
  }
  const vectorValidation = validateSolanaProverKnownAnswerVector({
    direction,
    vector: summary.vector,
    governance: summary.governance,
    artifactEvidence: summary.artifactEvidence,
    invocation,
  });
  errors.push(...vectorValidation.errors);
  const expected = {
    schema: SOLANA_PROVER_KNOWN_ANSWER_VALIDATION_SCHEMA,
    ready: true,
    invoked: true,
    challengeId: invocation.challengeId,
    routeId: SCCP_SOLANA_XOR_ROUTE_ID,
    assetKey: SCCP_XOR_ASSET_KEY,
    direction,
    network: SOLANA_TESTNET_NETWORK_ID,
    genesisHash: SOLANA_TESTNET_GENESIS_HASH,
    proofBackend: invocation.profile.proofBackend,
    sourceDomain: invocation.profile.sourceDomain,
    targetDomain: invocation.profile.targetDomain,
    inputHash: invocation.inputHash,
    vectorHash: vectorValidation.vectorHash,
    packageHash: summary.vector?.packageHash,
    proofMaterialHash: summary.vector?.proofMaterialHash,
  };
  for (const [key, value] of Object.entries(expected)) {
    if (summary[key] !== value) {
      errors.push(
        `Known-answer summary ${key} must be ${JSON.stringify(value)}.`,
      );
    }
  }
  if (!Array.isArray(summary.errors) || summary.errors.length !== 0) {
    errors.push("Known-answer summary errors must be an empty array.");
  }
  return errors;
};

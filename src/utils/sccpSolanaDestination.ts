import { sha256 } from "@noble/hashes/sha256";
import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import {
  canonicalSccpMessagePublicInputsBytes,
  canonicalSccpPayloadBytes,
  canonicalTairaSccpMessageBundleBytes,
  normalizeSccpMessageBundle,
  normalizeSccpProofRequest,
  sccpLaneIdHash,
  sccpMessageId,
  sccpPayloadHash,
  type SccpLaneIdV1,
  type SccpPayloadV1,
  type SccpProofRequest,
  type SccpTransferPayloadV1,
  type TairaSccpMessageBundleV1,
} from "@iroha/iroha-js/sccp";
import {
  SCCP_SOLANA_XOR_ROUTE_ID_V1,
  SCCP_SOLANA_DESTINATION_RECEIPT_SEED_V1,
  SCCP_TAIRA_TO_SOLANA_LANE_V1,
  SCCP_XOR_ASSET_KEY_V1,
  canonicalSccpTextWireHex,
  canonicalSolanaPubkeyWireHex,
  deriveSolanaProgramAddressV1,
  readGovernedSolanaRoutePinsV1,
} from "@/utils/sccpSolanaCanonical";

const SOLANA_DESTINATION_BACKEND_V1 = "solana_groth16_bn254_v1";
const SOLANA_TESTNET_NETWORK_V1 = "solana_testnet";
const TAIRA_NETWORK_V1 = "sora_taira";
const SOLANA_DOMAIN_V1 = 3;
const SOLANA_PUBKEY_CODEC_V1 = 6;
const SCCP_TOKEN_MULTIPLIER_V1 = 1n;
const MAX_U64 = (1n << 64n) - 1n;
const PUBLIC_INPUTS_BYTES_V1 = 141;
const GROTH16_PROOF_BYTES_V1 = 384;
const MAX_PAYLOAD_BYTES_V1 = 512;
const PROOF_APPEND_CHUNK_BYTES_V1 = 512;

export const SCCP_SOLANA_SPL_TOKEN_PROGRAM_ID_V1 =
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const SCCP_SOLANA_SYSTEM_PROGRAM_ID_V1 =
  "11111111111111111111111111111111";
export const SCCP_SOLANA_COMPUTE_BUDGET_PROGRAM_ID_V1 =
  "ComputeBudget111111111111111111111111111111";
export const SCCP_SOLANA_FINALIZE_COMPUTE_UNIT_LIMIT_V1 = 800_000;

const MATERIAL_SEED_V1 = new TextEncoder().encode("sccp-vk-v1");
const PROOF_SEED_V1 = new TextEncoder().encode("sccp-proof-v1");
const BRIDGE_VERIFIER_AUTHORITY_SEED_V1 = new TextEncoder().encode(
  "sccp-verify-authority-v1",
);
const BRIDGE_MINT_AUTHORITY_SEED_V1 = new TextEncoder().encode(
  "sccp-mint-authority-v1",
);
const BRIDGE_RECEIPT_SEED_V1 = new TextEncoder().encode(
  SCCP_SOLANA_DESTINATION_RECEIPT_SEED_V1,
);

export type SolanaDestinationProverInputV1 = {
  version: 1;
  route_id: typeof SCCP_SOLANA_XOR_ROUTE_ID_V1;
  revision: 1;
  message_id_hex: string;
  payload_amount_u64: string;
  amount_u64_base_units: string;
  destination_token: string;
  public_inputs_b64: string;
  statement_hash_hex: string;
  payload_b64: string;
  proof_request: SccpProofRequest;
};

export type SolanaDestinationProofResultV1 = {
  version: 1;
  route_id: typeof SCCP_SOLANA_XOR_ROUTE_ID_V1;
  revision: 1;
  message_id_hex: string;
  payload_amount_u64: string;
  amount_u64_base_units: string;
  destination_token: string;
  public_inputs_b64: string;
  statement_hash_hex: string;
  proof_b64: string;
  payload_b64: string;
  proof_body_b64: string;
  body_sha256_hex: string;
};

export type SolanaInstructionAccountMetaV1 = {
  pubkey: string;
  isSigner: boolean;
  isWritable: boolean;
};

export type SolanaInstructionV1 = {
  programId: string;
  accounts: SolanaInstructionAccountMetaV1[];
  dataHex: string;
};

export type SolanaDestinationTransactionPlanV1 = {
  version: 1;
  proofAddress: string;
  verifierAuthorityAddress: string;
  mintAuthorityAddress: string;
  receiptAddress: string;
  transactions: Array<{
    phase: "initialize-proof" | "append-proof" | "seal-and-finalize";
    instructions: SolanaInstructionV1[];
  }>;
};

export type SolanaDestinationFinalizedBindingV1 = {
  txId: string;
  finalizedSlot: string;
  payerAddress: string;
  routeProgramAddress: string;
  verifierProgramAddress: string;
  destinationTokenAddress: string;
  tokenMintAddress: string;
  receiptAddress: string;
  messageId: string;
  amountBaseUnits: string;
};

const requirePlainExactRecord = (
  value: unknown,
  fields: readonly string[],
  label: string,
): Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a plain object.`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${label} must be a plain object.`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== "string") {
      throw new Error(`${label} must contain only string-keyed data fields.`);
    }
    const descriptor = descriptors[key];
    if (!descriptor.enumerable || !("value" in descriptor)) {
      throw new Error(`${label} fields must be enumerable data properties.`);
    }
  }
  const keys = Object.keys(descriptors).sort();
  const expected = [...fields].sort();
  if (
    keys.length !== expected.length ||
    keys.some((key, index) => key !== expected[index])
  ) {
    throw new Error(
      `${label} must contain exactly: ${fields.join(", ")}; accounts, metas, transactions, aliases, and legacy fields are forbidden.`,
    );
  }
  return value as Record<string, unknown>;
};

const bytesToHex = (bytes: Uint8Array): string =>
  `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;

const bytesEqual = (left: Uint8Array, right: Uint8Array): boolean =>
  left.length === right.length &&
  left.every((byte, index) => byte === right[index]);

const hexToBytes = (
  value: unknown,
  label: string,
  length?: number,
): Uint8Array => {
  if (typeof value !== "string" || !/^0x(?:[0-9a-f]{2})+$/u.test(value)) {
    throw new Error(`${label} must be canonical lowercase 0x-prefixed hex.`);
  }
  const bytes = Uint8Array.from(value.slice(2).match(/../gu) ?? [], (byte) =>
    Number.parseInt(byte, 16),
  );
  if (length !== undefined && bytes.length !== length) {
    throw new Error(`${label} must contain exactly ${length} bytes.`);
  }
  return bytes;
};

const normalizeSdkHex32 = (value: unknown, label: string): string => {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a 32-byte hex value.`);
  }
  const normalized = `0x${value.trim().replace(/^0x/u, "").toLowerCase()}`;
  if (!/^0x[0-9a-f]{64}$/u.test(normalized)) {
    throw new Error(`${label} must be a 32-byte hex value.`);
  }
  return normalized;
};

const encodeBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

const decodeCanonicalBase64 = (
  value: unknown,
  label: string,
  options: { length?: number; maxLength?: number } = {},
): Uint8Array => {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length % 4 !== 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(
      value,
    )
  ) {
    throw new Error(`${label} must be canonical padded base64.`);
  }
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(value), (character) =>
      character.charCodeAt(0),
    );
  } catch {
    throw new Error(`${label} must be canonical padded base64.`);
  }
  if (encodeBase64(bytes) !== value) {
    throw new Error(`${label} must be canonical padded base64.`);
  }
  if (options.length !== undefined && bytes.length !== options.length) {
    throw new Error(`${label} must contain exactly ${options.length} bytes.`);
  }
  if (options.maxLength !== undefined && bytes.length > options.maxLength) {
    throw new Error(`${label} must not exceed ${options.maxLength} bytes.`);
  }
  return bytes;
};

const concatBytes = (...parts: readonly Uint8Array[]): Uint8Array => {
  const output = new Uint8Array(
    parts.reduce((length, part) => length + part.length, 0),
  );
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
};

const u16Le = (value: number, label: string): Uint8Array => {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff) {
    throw new Error(`${label} must fit an unsigned 16-bit integer.`);
  }
  return Uint8Array.of(value & 0xff, (value >>> 8) & 0xff);
};

const u32Le = (value: number, label: string): Uint8Array => {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffff_ffff) {
    throw new Error(`${label} must fit in an unsigned 32-bit integer.`);
  }
  return Uint8Array.of(
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  );
};

const canonicalU64 = (value: unknown, label: string): string => {
  if (typeof value !== "string" || !/^(?:0|[1-9][0-9]*)$/u.test(value)) {
    throw new Error(`${label} must be a canonical u64 decimal string.`);
  }
  const parsed = BigInt(value);
  if (parsed > MAX_U64) {
    throw new Error(`${label} must fit an unsigned 64-bit integer.`);
  }
  return value;
};

const positiveU64 = (value: unknown, label: string): string => {
  const normalized = canonicalU64(value, label);
  if (normalized === "0") {
    throw new Error(`${label} must be positive.`);
  }
  return normalized;
};

const u64Le = (value: string, label: string): Uint8Array => {
  let remaining = BigInt(positiveU64(value, label));
  const bytes = new Uint8Array(8);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  return bytes;
};

const canonicalPublicKey = (value: unknown, label: string): string => {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a canonical Solana public key.`);
  }
  let key: PublicKey;
  try {
    key = new PublicKey(value);
  } catch {
    throw new Error(`${label} must be a canonical Solana public key.`);
  }
  if (key.toBase58() !== value) {
    throw new Error(`${label} must be a canonical Solana public key.`);
  }
  return value;
};

const exactNetwork = (
  value: unknown,
  expected: string,
  label: string,
): void => {
  const record = requirePlainExactRecord(value, ["network", "profile"], label);
  if (record.network !== expected || record.profile !== null) {
    throw new Error(`${label} must be the exact ${expected} network.`);
  }
};

const exactUnitBackend = (value: unknown): void => {
  const record = requirePlainExactRecord(
    value,
    ["backend", "family"],
    "Solana SCCP proof backend",
  );
  if (
    record.backend !== SOLANA_DESTINATION_BACKEND_V1 ||
    record.family !== null
  ) {
    throw new Error(
      `Solana SCCP proof backend must be exactly ${SOLANA_DESTINATION_BACKEND_V1}.`,
    );
  }
};

const exactBytesEqual = (
  actual: Uint8Array,
  expected: Uint8Array,
  label: string,
): void => {
  if (
    actual.length !== expected.length ||
    actual.some((byte, index) => byte !== expected[index])
  ) {
    throw new Error(`${label} does not match the canonical SCCP value.`);
  }
};

const normalizedProofRequest = (value: unknown): SccpProofRequest =>
  normalizeSccpProofRequest(value) as SccpProofRequest;

const normalizedMessageBundle = (value: unknown): TairaSccpMessageBundleV1 =>
  normalizeSccpMessageBundle(value) as unknown as TairaSccpMessageBundleV1;

const transferPayload = (
  bundle: TairaSccpMessageBundleV1,
): SccpTransferPayloadV1 => bundle.payload.Transfer;

const assertExactOutboundTransfer = (input: {
  transfer: SccpTransferPayloadV1;
  revision: number;
  recipientAddress: string;
}): void => {
  const transfer = input.transfer;
  if (
    transfer.version !== 1 ||
    transfer.source_domain !== 0 ||
    transfer.dest_domain !== SOLANA_DOMAIN_V1 ||
    transfer.route_revision !== input.revision ||
    transfer.asset_home_domain !== 0 ||
    transfer.asset_id_codec !== 1 ||
    transfer.asset_id !== canonicalSccpTextWireHex(SCCP_XOR_ASSET_KEY_V1) ||
    transfer.recipient_codec !== SOLANA_PUBKEY_CODEC_V1 ||
    transfer.recipient !==
      canonicalSolanaPubkeyWireHex(
        input.recipientAddress,
        "Solana recipient",
      ) ||
    transfer.route_id_codec !== 1 ||
    transfer.route_id !== canonicalSccpTextWireHex(SCCP_SOLANA_XOR_ROUTE_ID_V1)
  ) {
    throw new Error(
      "The SCCP transfer must exactly bind route revision 1, XOR, and the connected Solana recipient.",
    );
  }
};

const canonicalBundleBytesFromRequest = (
  request: SccpProofRequest,
): Uint8Array =>
  hexToBytes(request.bundle_bytes, "SCCP proof request bundle_bytes");

export const prepareSolanaDestinationProverInputV1 = (input: {
  manifest: Record<string, unknown> | null | undefined;
  proofRequest: unknown;
  messageBundle: unknown;
  messageId: string;
  recipientAddress: string;
  destinationTokenAddress: string;
}): SolanaDestinationProverInputV1 => {
  const pins = readGovernedSolanaRoutePinsV1(input.manifest);
  if (pins.revision !== 1) {
    throw new Error("The first-release Solana SCCP route revision must be 1.");
  }
  const request = normalizedProofRequest(input.proofRequest);
  const bundle = normalizedMessageBundle(input.messageBundle);
  exactUnitBackend(request.backend);
  exactNetwork(
    request.source_network,
    TAIRA_NETWORK_V1,
    "Solana SCCP proof source network",
  );
  exactNetwork(
    request.target_network,
    SOLANA_TESTNET_NETWORK_V1,
    "Solana SCCP proof target network",
  );
  const messageId = normalizeSdkHex32(input.messageId, "SCCP message id");
  const requestMessageId = normalizeSdkHex32(
    request.public_inputs.message_id,
    "SCCP proof request message id",
  );
  if (messageId !== requestMessageId) {
    throw new Error(
      "The SCCP proof request message id does not match the transfer.",
    );
  }
  if (request.public_inputs.target_domain !== SOLANA_DOMAIN_V1) {
    throw new Error("The SCCP proof request must target Solana domain 3.");
  }
  if (
    normalizeSdkHex32(
      request.destination_binding_hash,
      "SCCP proof request destination binding hash",
    ) !== pins.destinationBindingHash ||
    normalizeSdkHex32(
      request.route_configuration_hash,
      "SCCP proof request route configuration hash",
    ) !== pins.routeConfigurationHash ||
    normalizeSdkHex32(
      request.verifier_key_hash,
      "SCCP proof request verifier key hash",
    ) !== pins.verifierKeyHash
  ) {
    throw new Error(
      "The SCCP proof request does not match the governed Solana destination pins.",
    );
  }
  const commitment = bundle.commitment;
  if (
    sccpLaneIdHash(commitment.context.lane) !==
    sccpLaneIdHash(SCCP_TAIRA_TO_SOLANA_LANE_V1)
  ) {
    throw new Error(
      "The SCCP bundle must use the exact TAIRA-to-Solana-testnet lane.",
    );
  }
  if (
    normalizeSdkHex32(
      commitment.context.destination_binding_hash,
      "SCCP bundle destination binding hash",
    ) !== pins.destinationBindingHash ||
    normalizeSdkHex32(
      commitment.context.route_configuration_hash,
      "SCCP bundle route configuration hash",
    ) !== pins.routeConfigurationHash
  ) {
    throw new Error("The SCCP bundle does not match the governed route pins.");
  }
  const recipientAddress = canonicalPublicKey(
    input.recipientAddress,
    "Solana recipient",
  );
  const destinationToken = canonicalPublicKey(
    input.destinationTokenAddress,
    "Solana destination token account",
  );
  const transfer = transferPayload(bundle);
  assertExactOutboundTransfer({
    transfer,
    revision: pins.revision,
    recipientAddress,
  });
  const payload = bundle.payload as SccpPayloadV1;
  const payloadBytes = canonicalSccpPayloadBytes(payload);
  if (payloadBytes.length > MAX_PAYLOAD_BYTES_V1) {
    throw new Error(
      `The canonical SCCP payload must not exceed ${MAX_PAYLOAD_BYTES_V1} bytes.`,
    );
  }
  const computedMessageId = normalizeSdkHex32(
    sccpMessageId(SCCP_TAIRA_TO_SOLANA_LANE_V1 as SccpLaneIdV1, payload),
    "canonical SCCP message id",
  );
  const computedPayloadHash = normalizeSdkHex32(
    sccpPayloadHash(payloadBytes),
    "canonical SCCP payload hash",
  );
  if (
    computedMessageId !== messageId ||
    normalizeSdkHex32(commitment.message_id, "SCCP bundle message id") !==
      messageId ||
    normalizeSdkHex32(commitment.payload_hash, "SCCP bundle payload hash") !==
      computedPayloadHash ||
    normalizeSdkHex32(
      request.public_inputs.payload_hash,
      "SCCP proof request payload hash",
    ) !== computedPayloadHash ||
    normalizeSdkHex32(
      request.public_inputs.commitment_root,
      "SCCP proof request commitment root",
    ) !==
      normalizeSdkHex32(bundle.commitment_root, "SCCP bundle commitment root")
  ) {
    throw new Error(
      "The SCCP proof request, bundle, and canonical payload are not exactly bound.",
    );
  }
  exactBytesEqual(
    canonicalBundleBytesFromRequest(request),
    canonicalTairaSccpMessageBundleBytes(bundle),
    "SCCP proof request bundle_bytes",
  );
  const publicInputsBytes = canonicalSccpMessagePublicInputsBytes(
    request.public_inputs,
  );
  if (publicInputsBytes.length !== PUBLIC_INPUTS_BYTES_V1) {
    throw new Error(
      `Canonical Solana SCCP public inputs must contain ${PUBLIC_INPUTS_BYTES_V1} bytes.`,
    );
  }
  const payloadAmount = positiveU64(transfer.amount, "SCCP payload_amount_u64");
  const baseUnits = BigInt(payloadAmount) * SCCP_TOKEN_MULTIPLIER_V1;
  if (baseUnits > MAX_U64) {
    throw new Error(
      "SCCP payload amount times the exact governed Solana multiplier overflows u64.",
    );
  }
  return {
    version: 1,
    route_id: SCCP_SOLANA_XOR_ROUTE_ID_V1,
    revision: 1,
    message_id_hex: messageId,
    payload_amount_u64: payloadAmount,
    amount_u64_base_units: baseUnits.toString(),
    destination_token: destinationToken,
    public_inputs_b64: encodeBase64(publicInputsBytes),
    statement_hash_hex: normalizeSdkHex32(
      request.statement_hash,
      "SCCP proof request statement hash",
    ),
    payload_b64: encodeBase64(payloadBytes),
    proof_request: request,
  };
};

const RESULT_FIELDS = [
  "version",
  "route_id",
  "revision",
  "message_id_hex",
  "payload_amount_u64",
  "amount_u64_base_units",
  "destination_token",
  "public_inputs_b64",
  "statement_hash_hex",
  "proof_b64",
  "payload_b64",
  "proof_body_b64",
  "body_sha256_hex",
] as const;

export const buildSolanaDestinationProofBodyV1 = (input: {
  publicInputsB64: string;
  statementHashHex: string;
  proofB64: string;
  payloadB64: string;
}): Uint8Array => {
  const publicInputs = decodeCanonicalBase64(
    input.publicInputsB64,
    "Solana SCCP public_inputs_b64",
    { length: PUBLIC_INPUTS_BYTES_V1 },
  );
  const statementHash = hexToBytes(
    input.statementHashHex,
    "Solana SCCP statement_hash_hex",
    32,
  );
  const proof = decodeCanonicalBase64(input.proofB64, "Solana SCCP proof_b64", {
    length: GROTH16_PROOF_BYTES_V1,
  });
  const payload = decodeCanonicalBase64(
    input.payloadB64,
    "Solana SCCP payload_b64",
    { maxLength: MAX_PAYLOAD_BYTES_V1 },
  );
  return concatBytes(
    publicInputs,
    statementHash,
    proof,
    u16Le(payload.length, "Solana SCCP payload length"),
    payload,
  );
};

export const validateSolanaDestinationProofResultV1 = (
  value: unknown,
  expected: SolanaDestinationProverInputV1,
): SolanaDestinationProofResultV1 => {
  const result = requirePlainExactRecord(
    value,
    RESULT_FIELDS,
    "Solana destination prover result",
  );
  if (
    result.version !== 1 ||
    result.route_id !== expected.route_id ||
    result.revision !== 1 ||
    result.message_id_hex !== expected.message_id_hex ||
    result.destination_token !== expected.destination_token ||
    result.public_inputs_b64 !== expected.public_inputs_b64 ||
    result.statement_hash_hex !== expected.statement_hash_hex ||
    result.payload_b64 !== expected.payload_b64
  ) {
    throw new Error(
      "Solana destination prover result does not exactly echo the governed request binding.",
    );
  }
  const payloadAmount = positiveU64(
    result.payload_amount_u64,
    "Solana destination prover payload_amount_u64",
  );
  const baseUnits = positiveU64(
    result.amount_u64_base_units,
    "Solana destination prover amount_u64_base_units",
  );
  if (
    payloadAmount !== expected.payload_amount_u64 ||
    baseUnits !== expected.amount_u64_base_units ||
    BigInt(payloadAmount) * SCCP_TOKEN_MULTIPLIER_V1 !== BigInt(baseUnits)
  ) {
    throw new Error(
      "Solana destination prover amounts must stay distinctly named and satisfy payload_amount_u64 * governed multiplier 1 == amount_u64_base_units.",
    );
  }
  const proofBody = buildSolanaDestinationProofBodyV1({
    publicInputsB64: result.public_inputs_b64 as string,
    statementHashHex: result.statement_hash_hex as string,
    proofB64: result.proof_b64 as string,
    payloadB64: result.payload_b64 as string,
  });
  const proofBodyB64 = encodeBase64(proofBody);
  if (result.proof_body_b64 !== proofBodyB64) {
    throw new Error(
      "Solana destination prover proof_body_b64 must be the exact canonical proof body.",
    );
  }
  const bodyHash = bytesToHex(sha256(proofBody));
  if (result.body_sha256_hex !== bodyHash) {
    throw new Error(
      "Solana destination prover body_sha256_hex must match the canonical proof body.",
    );
  }
  return result as SolanaDestinationProofResultV1;
};

const account = (
  pubkey: string,
  isSigner: boolean,
  isWritable: boolean,
): SolanaInstructionAccountMetaV1 => ({
  pubkey,
  isSigner,
  isWritable,
});

const findPda = (
  program: PublicKey,
  seeds: readonly Uint8Array[],
  label: string,
): PublicKey => {
  try {
    return new PublicKey(
      deriveSolanaProgramAddressV1({
        programAddress: program.toBase58(),
        seeds,
      }).address,
    );
  } catch (cause) {
    const detail =
      cause instanceof Error && cause.message.length > 0
        ? ` ${cause.message}`
        : "";
    throw new Error(`Unable to derive the exact ${label} PDA.${detail}`);
  }
};

export const buildSolanaDestinationTransactionPlanV1 = (input: {
  manifest: Record<string, unknown> | null | undefined;
  payerAddress: string;
  proverInput: SolanaDestinationProverInputV1;
  proofResult: unknown;
}): SolanaDestinationTransactionPlanV1 => {
  const pins = readGovernedSolanaRoutePinsV1(input.manifest);
  if (pins.revision !== 1) {
    throw new Error("The first-release Solana SCCP route revision must be 1.");
  }
  const result = validateSolanaDestinationProofResultV1(
    input.proofResult,
    input.proverInput,
  );
  const payer = new PublicKey(
    canonicalPublicKey(input.payerAddress, "Solana SCCP payer"),
  );
  const routeProgram = new PublicKey(pins.routeProgramAddress);
  const routeState = new PublicKey(pins.routeStateAddress);
  const tokenMint = new PublicKey(pins.tokenMintAddress);
  const verifierProgram = new PublicKey(pins.nativeVerifierProgramAddress);
  const destinationToken = new PublicKey(result.destination_token);
  const messageId = hexToBytes(
    result.message_id_hex,
    "Solana SCCP message_id_hex",
    32,
  );
  const verifierKeyHash = hexToBytes(
    pins.verifierKeyHash,
    "governed Solana verifier key hash",
    32,
  );
  const verifierConfigHash = hexToBytes(
    pins.nativeVerifierConfigHash,
    "governed Solana verifier config hash",
    32,
  );
  const material = findPda(
    verifierProgram,
    [MATERIAL_SEED_V1, verifierKeyHash, verifierConfigHash],
    "native verifier material",
  );
  if (material.toBase58() !== pins.nativeVerifierMaterialAddress) {
    throw new Error(
      "The governed native verifier material account is not the exact verifier-key/config PDA.",
    );
  }
  const proof = findPda(
    verifierProgram,
    [PROOF_SEED_V1, material.toBytes(), messageId, payer.toBytes()],
    "message proof",
  );
  const verifierAuthority = findPda(
    routeProgram,
    [BRIDGE_VERIFIER_AUTHORITY_SEED_V1, routeState.toBytes()],
    "bridge verifier authority",
  );
  const mintAuthority = findPda(
    routeProgram,
    [BRIDGE_MINT_AUTHORITY_SEED_V1, routeState.toBytes()],
    "bridge mint authority",
  );
  const receipt = findPda(
    routeProgram,
    [BRIDGE_RECEIPT_SEED_V1, routeState.toBytes(), messageId],
    "destination receipt",
  );
  const allRoles = [
    payer,
    routeProgram,
    routeState,
    tokenMint,
    verifierProgram,
    material,
    proof,
    destinationToken,
    verifierAuthority,
    mintAuthority,
    receipt,
  ].map((key) => key.toBase58());
  if (new Set(allRoles).size !== allRoles.length) {
    throw new Error(
      "Solana destination transaction reuses role-separated accounts.",
    );
  }
  const proofBody = decodeCanonicalBase64(
    result.proof_body_b64,
    "Solana SCCP proof_body_b64",
  );
  const bodyHash = hexToBytes(
    result.body_sha256_hex,
    "Solana SCCP body_sha256_hex",
    32,
  );
  const payloadHash = hexToBytes(
    normalizeSdkHex32(
      input.proverInput.proof_request.public_inputs.payload_hash,
      "SCCP proof request payload hash",
    ),
    "SCCP proof request payload hash",
    32,
  );
  const statementHash = hexToBytes(
    result.statement_hash_hex,
    "Solana SCCP statement_hash_hex",
    32,
  );
  const baseUnitsBytes = u64Le(
    result.amount_u64_base_units,
    "Solana SCCP amount_u64_base_units",
  );
  const initializeProof: SolanaInstructionV1 = {
    programId: verifierProgram.toBase58(),
    accounts: [
      account(payer.toBase58(), true, true),
      account(proof.toBase58(), false, true),
      account(material.toBase58(), false, false),
      account(destinationToken.toBase58(), false, false),
      account(SCCP_SOLANA_SYSTEM_PROGRAM_ID_V1, false, false),
    ],
    dataHex: bytesToHex(
      concatBytes(
        Uint8Array.of(1, 3),
        u16Le(proofBody.length, "Solana SCCP proof body length"),
        bodyHash,
        messageId,
        payloadHash,
        statementHash,
        destinationToken.toBytes(),
        baseUnitsBytes,
      ),
    ),
  };
  const appendTransactions: SolanaDestinationTransactionPlanV1["transactions"] =
    [];
  for (
    let offset = 0;
    offset < proofBody.length;
    offset += PROOF_APPEND_CHUNK_BYTES_V1
  ) {
    const chunk = proofBody.slice(
      offset,
      Math.min(offset + PROOF_APPEND_CHUNK_BYTES_V1, proofBody.length),
    );
    appendTransactions.push({
      phase: "append-proof",
      instructions: [
        {
          programId: verifierProgram.toBase58(),
          accounts: [
            account(payer.toBase58(), true, false),
            account(proof.toBase58(), false, true),
          ],
          dataHex: bytesToHex(
            concatBytes(
              Uint8Array.of(1, 4),
              u16Le(offset, "Solana SCCP proof append offset"),
              u16Le(chunk.length, "Solana SCCP proof append length"),
              chunk,
            ),
          ),
        },
      ],
    });
  }
  const sealProof: SolanaInstructionV1 = {
    programId: verifierProgram.toBase58(),
    accounts: [
      account(payer.toBase58(), true, false),
      account(proof.toBase58(), false, true),
      account(material.toBase58(), false, false),
      account(destinationToken.toBase58(), false, false),
    ],
    dataHex: bytesToHex(Uint8Array.of(1, 5)),
  };
  const computeUnitLimit: SolanaInstructionV1 = {
    programId: SCCP_SOLANA_COMPUTE_BUDGET_PROGRAM_ID_V1,
    accounts: [],
    dataHex: bytesToHex(
      concatBytes(
        Uint8Array.of(2),
        u32Le(
          SCCP_SOLANA_FINALIZE_COMPUTE_UNIT_LIMIT_V1,
          "Solana finalize compute-unit limit",
        ),
      ),
    ),
  };
  const finalize: SolanaInstructionV1 = {
    programId: routeProgram.toBase58(),
    accounts: [
      account(payer.toBase58(), true, true),
      account(routeState.toBase58(), false, true),
      account(tokenMint.toBase58(), false, true),
      account(destinationToken.toBase58(), false, true),
      account(material.toBase58(), false, false),
      account(proof.toBase58(), false, false),
      account(verifierProgram.toBase58(), false, false),
      account(verifierAuthority.toBase58(), false, false),
      account(mintAuthority.toBase58(), false, false),
      account(receipt.toBase58(), false, true),
      account(SCCP_SOLANA_SPL_TOKEN_PROGRAM_ID_V1, false, false),
      account(SCCP_SOLANA_SYSTEM_PROGRAM_ID_V1, false, false),
    ],
    dataHex: bytesToHex(
      concatBytes(Uint8Array.of(1, 2), messageId, baseUnitsBytes),
    ),
  };
  return {
    version: 1,
    proofAddress: proof.toBase58(),
    verifierAuthorityAddress: verifierAuthority.toBase58(),
    mintAuthorityAddress: mintAuthority.toBase58(),
    receiptAddress: receipt.toBase58(),
    transactions: [
      { phase: "initialize-proof", instructions: [initializeProof] },
      ...appendTransactions,
      {
        phase: "seal-and-finalize",
        instructions: [computeUnitLimit, sealProof, finalize],
      },
    ],
  };
};

const rpcRecord = (value: unknown, label: string): Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
};

const rpcPublicKey = (value: unknown, label: string): string => {
  if (typeof value !== "string") throw new Error(`${label} is required.`);
  const key = new PublicKey(value);
  if (
    key.toBase58() !== value ||
    (key.toBytes().every((byte) => byte === 0) &&
      value !== SCCP_SOLANA_SYSTEM_PROGRAM_ID_V1)
  ) {
    throw new Error(`${label} must be a canonical non-zero Solana key.`);
  }
  return value;
};

const rpcSafeInteger = (value: unknown, label: string): number => {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`${label} must be a non-negative safe integer.`);
  }
  return Number(value);
};

const readU64Le = (bytes: Uint8Array, label: string): string => {
  if (bytes.length !== 8)
    throw new Error(`${label} must be an eight-byte u64.`);
  let value = 0n;
  for (let index = 7; index >= 0; index -= 1) {
    value = (value << 8n) | BigInt(bytes[index]);
  }
  if (value === 0n) throw new Error(`${label} must be positive.`);
  return value.toString();
};

const decodeRpcInstructionData = (
  value: unknown,
  label: string,
): Uint8Array => {
  if (typeof value !== "string" || !value) {
    throw new Error(`${label} is required.`);
  }
  const bytes = Uint8Array.from(bs58.decode(value));
  if (bs58.encode(bytes) !== value) {
    throw new Error(`${label} must be canonical base58.`);
  }
  return bytes;
};

const requireFinalizedStatus = (
  value: unknown,
  slot: number,
  label: string,
): void => {
  const status = rpcRecord(value, label);
  if (
    status.err !== null ||
    status.confirmationStatus !== "finalized" ||
    rpcSafeInteger(status.slot, `${label}.slot`) !== slot
  ) {
    throw new Error(
      `${label} must independently confirm the exact finalized slot.`,
    );
  }
};

const instructionAccountKeys = (
  instruction: Record<string, unknown>,
  accountKeys: string[],
  label: string,
): string[] => {
  if (!Array.isArray(instruction.accounts)) {
    throw new Error(`${label}.accounts must be an array.`);
  }
  return instruction.accounts.map((value, index) => {
    const accountIndex = rpcSafeInteger(value, `${label}.accounts[${index}]`);
    const key = accountKeys[accountIndex];
    if (!key) throw new Error(`${label} references an unknown account.`);
    return key;
  });
};

const canonicalTokenBalance = (
  entries: unknown,
  accountIndex: number,
  mint: string,
  owner: string,
  label: string,
): bigint => {
  if (!Array.isArray(entries) || entries.length !== 1) {
    throw new Error(`${label} must contain exactly one token balance.`);
  }
  const entry = rpcRecord(entries[0], `${label}[0]`);
  const ui = rpcRecord(entry.uiTokenAmount, `${label}[0].uiTokenAmount`);
  if (
    entry.accountIndex !== accountIndex ||
    entry.mint !== mint ||
    entry.owner !== owner ||
    entry.programId !== SCCP_SOLANA_SPL_TOKEN_PROGRAM_ID_V1 ||
    ui.decimals !== 9 ||
    typeof ui.amount !== "string" ||
    !/^(?:0|[1-9]\d*)$/u.test(ui.amount)
  ) {
    throw new Error(
      `${label} does not bind the exact destination token account.`,
    );
  }
  return BigInt(ui.amount);
};

const canonicalLamportBalance = (
  entries: unknown,
  accountCount: number,
  accountIndex: number,
  label: string,
): bigint => {
  if (!Array.isArray(entries) || entries.length !== accountCount) {
    throw new Error(`${label} must cover every finalized transaction account.`);
  }
  const value = entries[accountIndex];
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(
      `${label} receipt balance must be a non-negative safe integer.`,
    );
  }
  return BigInt(Number(value));
};

const requireDestinationReceiptAccount = (input: {
  accountInfo: unknown;
  minimumSlot: number;
  routeProgram: string;
  routeState: string;
  mint: string;
  payer: string;
  destinationToken: string;
  material: string;
  proof: string;
  receipt: string;
  messageId: string;
  amountBaseUnits: string;
  expectedLamports: bigint;
}): void => {
  const response = rpcRecord(
    input.accountInfo,
    "Solana destination receipt account response",
  );
  const context = rpcRecord(
    response.context,
    "Solana destination receipt account context",
  );
  const contextSlot = rpcSafeInteger(
    context.slot,
    "Solana destination receipt account context slot",
  );
  if (contextSlot < input.minimumSlot) {
    throw new Error(
      "Solana destination receipt account predates the finalized transaction.",
    );
  }
  const account = rpcRecord(
    response.value,
    "Solana destination receipt account",
  );
  if (
    account.owner !== input.routeProgram ||
    account.executable !== false ||
    !Number.isSafeInteger(account.lamports) ||
    Number(account.lamports) <= 0 ||
    BigInt(Number(account.lamports)) !== input.expectedLamports ||
    !Array.isArray(account.data) ||
    account.data.length !== 2 ||
    account.data[1] !== "base64"
  ) {
    throw new Error(
      "Solana destination receipt account is not the finalized route-owned account.",
    );
  }
  const bytes = decodeCanonicalBase64(
    account.data[0],
    "Solana destination receipt account data",
    { length: 272 },
  );
  const derivedReceipt = deriveSolanaProgramAddressV1({
    programAddress: input.routeProgram,
    seeds: [
      BRIDGE_RECEIPT_SEED_V1,
      new PublicKey(input.routeState).toBytes(),
      hexToBytes(input.messageId, "Solana destination receipt message id", 32),
    ],
  });
  const exactFields: Array<[number, string]> = [
    [16, input.routeState],
    [48, input.mint],
    [80, input.payer],
    [112, input.destinationToken],
    [144, input.material],
    [176, input.proof],
  ];
  if (
    derivedReceipt.address !== input.receipt ||
    !bytesEqual(bytes.slice(0, 8), new TextEncoder().encode("SCCPDS01")) ||
    bytes[8] !== 1 ||
    bytes[9] !== derivedReceipt.bump ||
    !bytes.slice(10, 16).every((byte) => byte === 0) ||
    exactFields.some(
      ([offset, address]) =>
        !bytesEqual(
          bytes.slice(offset, offset + 32),
          new PublicKey(address).toBytes(),
        ),
    ) ||
    !bytesEqual(
      bytes.slice(208, 240),
      hexToBytes(input.messageId, "Solana destination receipt message id", 32),
    ) ||
    readU64Le(bytes.slice(240, 248), "Solana destination receipt amount") !==
      input.amountBaseUnits ||
    readU64Le(bytes.slice(248, 256), "Solana destination receipt slot") !==
      String(input.minimumSlot) ||
    !bytes.slice(256).every((byte) => byte === 0)
  ) {
    throw new Error(
      "Solana destination receipt account data does not match the exact finalized receipt.",
    );
  }
};

export const bindFinalizedSolanaDestinationTransactionV1 = (input: {
  plan: SolanaDestinationTransactionPlanV1;
  transaction: Record<string, unknown>;
  signatureStatus: Record<string, unknown>;
  finality: Record<string, unknown>;
  receiptAccount: Record<string, unknown>;
  txId: string;
}): SolanaDestinationFinalizedBindingV1 => {
  const finalStage = input.plan.transactions.at(-1);
  if (
    input.plan.version !== 1 ||
    finalStage?.phase !== "seal-and-finalize" ||
    finalStage.instructions.length !== 3
  ) {
    throw new Error(
      "Solana destination plan must end with exact compute-limit, seal, and finalize instructions.",
    );
  }
  const [computeLimitPlan, , finalizePlan] = finalStage.instructions;
  if (
    computeLimitPlan.programId !== SCCP_SOLANA_COMPUTE_BUDGET_PROGRAM_ID_V1 ||
    computeLimitPlan.accounts.length !== 0 ||
    computeLimitPlan.dataHex !==
      bytesToHex(
        concatBytes(
          Uint8Array.of(2),
          u32Le(
            SCCP_SOLANA_FINALIZE_COMPUTE_UNIT_LIMIT_V1,
            "Solana finalize compute-unit limit",
          ),
        ),
      )
  ) {
    throw new Error(
      "Solana destination plan must use the bounded exact compute-unit limit without a priority fee.",
    );
  }
  if (finalizePlan.accounts.length !== 12) {
    throw new Error(
      "Solana destination finalize plan must carry exactly 12 accounts.",
    );
  }
  const expectedPrivileges = [
    [true, true],
    [false, true],
    [false, true],
    [false, true],
    [false, false],
    [false, false],
    [false, false],
    [false, false],
    [false, false],
    [false, true],
    [false, false],
    [false, false],
  ] as const;
  finalizePlan.accounts.forEach((meta, index) => {
    if (
      meta.isSigner !== expectedPrivileges[index][0] ||
      meta.isWritable !== expectedPrivileges[index][1]
    ) {
      throw new Error(
        "Solana destination finalize plan privileges do not match the 12-account ABI.",
      );
    }
  });
  const finalizeData = hexToBytes(
    finalizePlan.dataHex,
    "Solana destination finalize plan data",
    42,
  );
  if (finalizeData[0] !== 1 || finalizeData[1] !== 2) {
    throw new Error(
      "Solana destination finalize plan must use exact wire [1,2].",
    );
  }
  const messageId = bytesToHex(finalizeData.slice(2, 34));
  const amountBaseUnits = readU64Le(
    finalizeData.slice(34),
    "Solana destination finalize amount",
  );
  const transaction = rpcRecord(
    input.transaction,
    "Solana finalized transaction",
  );
  const slot = rpcSafeInteger(
    transaction.slot,
    "Solana finalized transaction slot",
  );
  if (slot === 0 || transaction.version !== "legacy") {
    throw new Error(
      "Solana destination transaction must be a positive-slot legacy transaction.",
    );
  }
  requireFinalizedStatus(
    input.signatureStatus,
    slot,
    "Solana destination signature status",
  );
  requireFinalizedStatus(
    input.finality,
    slot,
    "Solana destination independent finality",
  );
  const body = rpcRecord(
    transaction.transaction,
    "Solana finalized transaction body",
  );
  if (
    !Array.isArray(body.signatures) ||
    body.signatures.length !== 1 ||
    body.signatures[0] !== input.txId
  ) {
    throw new Error(
      "Solana destination transaction signature is not the wallet-approved signature.",
    );
  }
  const meta = rpcRecord(transaction.meta, "Solana finalized transaction meta");
  if (meta.err !== null)
    throw new Error("Solana destination transaction failed.");
  const loaded = meta.loadedAddresses;
  if (loaded !== undefined) {
    const loadedRecord = rpcRecord(loaded, "Solana loaded addresses");
    if (
      !Array.isArray(loadedRecord.writable) ||
      loadedRecord.writable.length !== 0 ||
      !Array.isArray(loadedRecord.readonly) ||
      loadedRecord.readonly.length !== 0
    ) {
      throw new Error(
        "Solana destination transaction must not use address tables.",
      );
    }
  }
  const message = rpcRecord(body.message, "Solana finalized message");
  if (!Array.isArray(message.accountKeys)) {
    throw new Error("Solana finalized message account keys are required.");
  }
  const accountKeys = message.accountKeys.map((key, index) =>
    rpcPublicKey(key, `Solana finalized account ${index + 1}`),
  );
  if (new Set(accountKeys).size !== accountKeys.length) {
    throw new Error("Solana finalized account keys must be distinct.");
  }
  const header = rpcRecord(message.header, "Solana finalized message header");
  const requiredSignatures = rpcSafeInteger(
    header.numRequiredSignatures,
    "Solana required signatures",
  );
  const readonlySigned = rpcSafeInteger(
    header.numReadonlySignedAccounts,
    "Solana readonly signed accounts",
  );
  const readonlyUnsigned = rpcSafeInteger(
    header.numReadonlyUnsignedAccounts,
    "Solana readonly unsigned accounts",
  );
  const roleFor = (pubkey: string): readonly [boolean, boolean] => {
    const index = accountKeys.indexOf(pubkey);
    if (index < 0)
      throw new Error(`Solana finalized transaction omits ${pubkey}.`);
    const signer = index < requiredSignatures;
    const writable = signer
      ? index < requiredSignatures - readonlySigned
      : index < accountKeys.length - readonlyUnsigned;
    return [signer, writable];
  };
  const expectedTransactionRoles = new Map<
    string,
    { signer: boolean; writable: boolean }
  >();
  for (const instruction of finalStage.instructions) {
    for (const expected of instruction.accounts) {
      const previous = expectedTransactionRoles.get(expected.pubkey);
      expectedTransactionRoles.set(expected.pubkey, {
        signer: (previous?.signer ?? false) || expected.isSigner,
        writable: (previous?.writable ?? false) || expected.isWritable,
      });
    }
    if (!expectedTransactionRoles.has(instruction.programId)) {
      expectedTransactionRoles.set(instruction.programId, {
        signer: false,
        writable: false,
      });
    }
  }
  for (const [pubkey, expected] of expectedTransactionRoles) {
    const role = roleFor(pubkey);
    if (role[0] !== expected.signer || role[1] !== expected.writable) {
      throw new Error(
        "Solana finalized account privileges differ from the approved plan.",
      );
    }
  }
  if (
    !Array.isArray(message.instructions) ||
    message.instructions.length !== 3
  ) {
    throw new Error(
      "Solana destination transaction must contain exactly compute-limit, seal, and finalize.",
    );
  }
  message.instructions.forEach((raw, index) => {
    const actual = rpcRecord(raw, `Solana outer instruction ${index + 1}`);
    const expected = finalStage.instructions[index];
    const programIndex = rpcSafeInteger(
      actual.programIdIndex,
      `Solana outer instruction ${index + 1} program index`,
    );
    if (
      accountKeys[programIndex] !== expected.programId ||
      instructionAccountKeys(
        actual,
        accountKeys,
        `Solana outer instruction ${index + 1}`,
      ).some(
        (key, accountIndex) => key !== expected.accounts[accountIndex]?.pubkey,
      ) ||
      (actual.accounts as unknown[]).length !== expected.accounts.length ||
      !bytesEqual(
        decodeRpcInstructionData(
          actual.data,
          `Solana outer instruction ${index + 1} data`,
        ),
        hexToBytes(
          expected.dataHex,
          `Solana outer instruction ${index + 1} approved data`,
        ),
      )
    ) {
      throw new Error(
        "Solana outer instructions differ from the wallet-approved exact plan.",
      );
    }
  });
  if (
    !Array.isArray(meta.innerInstructions) ||
    meta.innerInstructions.length !== 1
  ) {
    throw new Error(
      "Solana destination finalize must expose one exact inner-instruction group.",
    );
  }
  const innerGroup = rpcRecord(
    meta.innerInstructions[0],
    "Solana finalize inner group",
  );
  if (innerGroup.index !== 2 || !Array.isArray(innerGroup.instructions)) {
    throw new Error(
      "Solana destination inner instructions must belong to finalize.",
    );
  }
  const inner = innerGroup.instructions.map((raw, index) => {
    const instruction = rpcRecord(raw, `Solana finalize CPI ${index + 1}`);
    if (
      Object.prototype.hasOwnProperty.call(instruction, "parsed") ||
      Object.prototype.hasOwnProperty.call(instruction, "programId")
    ) {
      throw new Error("Solana finalize CPIs must use raw compiled form.");
    }
    const programIndex = rpcSafeInteger(
      instruction.programIdIndex,
      `Solana finalize CPI ${index + 1} program index`,
    );
    return {
      programId: accountKeys[programIndex],
      accounts: instructionAccountKeys(
        instruction,
        accountKeys,
        `Solana finalize CPI ${index + 1}`,
      ),
      data: decodeRpcInstructionData(
        instruction.data,
        `Solana finalize CPI ${index + 1} data`,
      ),
    };
  });
  if (inner.length !== 4 && inner.length !== 5) {
    throw new Error(
      "Solana destination finalize must contain verifier, optional receipt funding, allocate, assign, and mint CPIs.",
    );
  }
  const [
    payer,
    state,
    mint,
    destinationToken,
    material,
    proof,
    verifier,
    verifierAuthority,
    mintAuthority,
    receipt,
  ] = finalizePlan.accounts.map(({ pubkey }) => pubkey);
  const verifierCpi = inner[0];
  const expectedVerifierData = concatBytes(
    Uint8Array.of(1, 6),
    finalizeData.slice(2, 34),
    finalizeData.slice(34),
  );
  if (
    verifierCpi.programId !== verifier ||
    verifierCpi.accounts.join("\0") !==
      [
        payer,
        verifierAuthority,
        state,
        mint,
        destinationToken,
        material,
        proof,
      ].join("\0") ||
    !bytesEqual(verifierCpi.data, expectedVerifierData)
  ) {
    throw new Error(
      "Solana finalize lacks the exact successful native-verifier CPI.",
    );
  }
  const tokenCpi = inner.at(-1)!;
  if (
    tokenCpi.programId !== SCCP_SOLANA_SPL_TOKEN_PROGRAM_ID_V1 ||
    tokenCpi.accounts.join("\0") !==
      [mint, destinationToken, mintAuthority].join("\0") ||
    tokenCpi.data.length !== 9 ||
    tokenCpi.data[0] !== 7 ||
    readU64Le(tokenCpi.data.slice(1), "Solana mintTo amount") !==
      amountBaseUnits
  ) {
    throw new Error("Solana finalize lacks the exact SPL mintTo CPI.");
  }
  const hasFundingTransfer = inner.length === 5;
  const systemCpi = inner.slice(1, -1);
  const transferCpi = hasFundingTransfer ? systemCpi[0] : null;
  const allocateCpi = systemCpi[hasFundingTransfer ? 1 : 0];
  const assignCpi = systemCpi[hasFundingTransfer ? 2 : 1];
  const transferLamports = transferCpi
    ? readU64Le(transferCpi.data.slice(4), "Solana destination receipt funding")
    : null;
  if (
    systemCpi.length !== (hasFundingTransfer ? 3 : 2) ||
    systemCpi.some(
      ({ programId }) => programId !== SCCP_SOLANA_SYSTEM_PROGRAM_ID_V1,
    ) ||
    (transferCpi !== null &&
      (transferCpi.accounts.join("\0") !== [payer, receipt].join("\0") ||
        transferCpi.data.length !== 12 ||
        !bytesEqual(
          transferCpi.data.slice(0, 4),
          Uint8Array.of(2, 0, 0, 0),
        ))) ||
    allocateCpi.accounts.join("\0") !== receipt ||
    allocateCpi.data.length !== 12 ||
    !bytesEqual(allocateCpi.data.slice(0, 4), Uint8Array.of(8, 0, 0, 0)) ||
    readU64Le(allocateCpi.data.slice(4), "Solana receipt allocation") !==
      "272" ||
    assignCpi.accounts.join("\0") !== receipt ||
    assignCpi.data.length !== 36 ||
    !bytesEqual(assignCpi.data.slice(0, 4), Uint8Array.of(1, 0, 0, 0)) ||
    !bytesEqual(
      assignCpi.data.slice(4),
      new PublicKey(finalizePlan.programId).toBytes(),
    )
  ) {
    throw new Error(
      "Solana finalize lacks exact route-owned receipt creation.",
    );
  }
  const receiptIndex = accountKeys.indexOf(receipt);
  const preReceiptLamports = canonicalLamportBalance(
    meta.preBalances,
    accountKeys.length,
    receiptIndex,
    "Solana pre-lamport balances",
  );
  const postReceiptLamports = canonicalLamportBalance(
    meta.postBalances,
    accountKeys.length,
    receiptIndex,
    "Solana post-lamport balances",
  );
  if (
    postReceiptLamports <= 0n ||
    (transferLamports === null
      ? preReceiptLamports <= 0n || postReceiptLamports !== preReceiptLamports
      : postReceiptLamports !== preReceiptLamports + BigInt(transferLamports))
  ) {
    throw new Error(
      "Solana destination receipt funding shape does not match finalized balances.",
    );
  }
  requireDestinationReceiptAccount({
    accountInfo: input.receiptAccount,
    minimumSlot: slot,
    routeProgram: finalizePlan.programId,
    routeState: state,
    mint,
    payer,
    destinationToken,
    material,
    proof,
    receipt,
    messageId,
    amountBaseUnits,
    expectedLamports: postReceiptLamports,
  });
  const destinationIndex = accountKeys.indexOf(destinationToken);
  const pre = canonicalTokenBalance(
    meta.preTokenBalances,
    destinationIndex,
    mint,
    payer,
    "Solana pre-token balances",
  );
  const post = canonicalTokenBalance(
    meta.postTokenBalances,
    destinationIndex,
    mint,
    payer,
    "Solana post-token balances",
  );
  if (post - pre !== BigInt(amountBaseUnits)) {
    throw new Error(
      "Solana destination token delta does not match the finalized amount.",
    );
  }
  return {
    txId: input.txId,
    finalizedSlot: slot.toString(),
    payerAddress: payer,
    routeProgramAddress: finalizePlan.programId,
    verifierProgramAddress: verifier,
    destinationTokenAddress: destinationToken,
    tokenMintAddress: mint,
    receiptAddress: receipt,
    messageId,
    amountBaseUnits,
  };
};

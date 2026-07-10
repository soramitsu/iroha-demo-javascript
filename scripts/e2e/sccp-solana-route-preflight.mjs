#!/usr/bin/env node
/* global BigInt */
import { blake2b } from "@noble/hashes/blake2b";
import { PublicKey } from "@solana/web3.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseStrictCliArgs,
  readStableJsonFile,
  writeAtomicJsonFile,
} from "./sccp-solana-report-io.mjs";

export const DEFAULT_TAIRA_TORII_URL = "https://taira.sora.org";
export const DEFAULT_SOLANA_TESTNET_RPC_URL = "https://api.testnet.solana.com";
export const DEFAULT_FETCH_TIMEOUT_MS = 15_000;
export const TAIRA_CHAIN_ID = "809574f5-fee7-5e69-bfcf-52451e42d50f";
export const TAIRA_NETWORK_PREFIX = 369;
export const SCCP_SOLANA_XOR_ROUTE_ID = "taira_sol_xor";
export const SCCP_XOR_ASSET_KEY = "xor";
export const SCCP_SORA_DOMAIN = 0;
export const SCCP_SOLANA_DOMAIN = 3;
export const SCCP_CODEC_SOLANA_BASE58 = 3;
export const SOLANA_TESTNET_NETWORK_ID = "solana-testnet";
export const SOLANA_TESTNET_CAIP_REFERENCE = "4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z";
export const SOLANA_TESTNET_CAIP_CHAIN_ID = `solana:${SOLANA_TESTNET_CAIP_REFERENCE}`;
export const SOLANA_TESTNET_WALLET_STANDARD_CHAIN_ID = "solana:testnet";
export const SOLANA_TESTNET_GENESIS_HASH =
  "4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY";
export const SOLANA_PRODUCTION_ADMISSION_MODE = "governed-zk-verifier-v1";
export const SOLANA_PRODUCTION_VERIFIER_ENFORCEMENT_MODE =
  "native-recursive-verifier-v1";
export const SOLANA_DESTINATION_PROOF_SYSTEM = "stark-fri-v1";
export const SOLANA_SUBMIT_ENTRYPOINT = "submit_sccp_message_proof";
export const SOLANA_DESTINATION_PROOF_BACKEND = "solana-program-v1";
export const SOLANA_SOURCE_PROOF_BACKEND = "sccp-solana-recursive-testnet-v1";
export const SOLANA_DESTINATION_VERIFIER_PLAN = "SolanaProgramNativeRecursive";
export const SOLANA_VERIFIER_TARGET = "SolanaProgram";
export const SOLANA_SOURCE_PROOF_PLAN = "SolanaFinalizedTransactionProof";
export const SOLANA_SOURCE_FINALITY_MODEL = "SolanaFinalizedSlot";
export const SOLANA_SOURCE_ADAPTER_CIRCUIT_ID = "sccp-source-adapter-v1";
export const SOLANA_SOURCE_ADAPTER_PROOF_FAMILY = "stark-fri-v1";
export const SOLANA_TESTNET_SOURCE_PROFILE = Object.freeze({
  sourceTrustAnchorId: "sccp:sol:source-trust-anchor:solana-testnet-genesis:v1",
  consensusVerifierId:
    "sccp:sol:consensus-verifier:finalized-slot-bankhash-testnet:v1",
  messageInclusionVerifierId:
    "sccp:sol:message-inclusion-verifier:transaction-status-root-branch-testnet:v1",
  sourceStateVerifierId:
    "sccp:sol:accounts-db-verifier:accounts-lt-hash-testnet:v1",
  finalityPolicyId: "sccp:sol:finality-policy:finalized-slot-testnet:v1",
});
export const SOLANA_UPGRADEABLE_LOADER_ID =
  "BPFLoaderUpgradeab1e11111111111111111111111";
export const SOLANA_UPGRADEABLE_PROGRAM_TAG = 2;
export const SOLANA_UPGRADEABLE_PROGRAMDATA_TAG = 3;
export const SOLANA_PROGRAMDATA_METADATA_LEN = 45;
export const SOLANA_SPL_TOKEN_PROGRAM_ID =
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const SCCP_SOLANA_STATE_MAGIC = "SCCPSOL1";
export const SCCP_SOLANA_STATE_LEN = 272;
export const SCCP_SOLANA_MINT_AUTHORITY_SEED = "sccp-taira-xor-mint-authority";
export const SCCP_SOLANA_TOKEN_DECIMALS = 9;

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const DEFAULT_OUTPUT_DIR = path.join(repoRoot, "output/sccp-solana-preflight");

const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BASE58_INDEX = new Map(
  Array.from(BASE58_ALPHABET, (character, index) => [character, index]),
);

const trimString = (value) => String(value ?? "").trim();

const isRecord = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readRecord = (record, key) => {
  const value = record?.[key];
  return isRecord(value) ? value : null;
};

const readString = (record, key) => {
  const value = record?.[key];
  return typeof value === "string" ? value.trim() : "";
};

const readFirstString = (record, ...keys) => {
  for (const key of keys) {
    const value = readString(record, key);
    if (value) {
      return value;
    }
  }
  return "";
};

const readRequiredConsistentString = (record, keys, label) => {
  const values = keys
    .filter((key) => Object.prototype.hasOwnProperty.call(record ?? {}, key))
    .map((key) => ({ key, value: readString(record, key) }));
  if (values.length === 0 || values.some(({ value }) => !value)) {
    throw new Error(`${label} is missing.`);
  }
  const [{ key: firstKey, value: firstValue }] = values;
  for (const { key, value } of values.slice(1)) {
    if (value !== firstValue) {
      throw new Error(
        `${label} aliases must agree: ${firstKey}=${firstValue} but ${key}=${value}.`,
      );
    }
  }
  return firstValue;
};

const readRequiredConsistentBoolean = (record, keys, label) => {
  const values = keys
    .filter((key) => Object.prototype.hasOwnProperty.call(record ?? {}, key))
    .map((key) => ({ key, value: record[key] }));
  if (
    values.length === 0 ||
    values.some(({ value }) => typeof value !== "boolean")
  ) {
    throw new Error(`${label} is missing or is not a boolean.`);
  }
  const [{ key: firstKey, value: firstValue }] = values;
  for (const { key, value } of values.slice(1)) {
    if (value !== firstValue) {
      throw new Error(
        `${label} aliases must agree: ${firstKey}=${firstValue} but ${key}=${value}.`,
      );
    }
  }
  return firstValue;
};

const readFirstRecord = (record, ...keys) => {
  for (const key of keys) {
    const value = readRecord(record, key);
    if (value) {
      return value;
    }
  }
  return null;
};

const readNumber = (record, key) => {
  const value = record?.[key];
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const listRecords = (value) =>
  Array.isArray(value) ? value.filter((entry) => isRecord(entry)) : [];

const SOLANA_LANE_BLOCKER_ID_BY_REASON = new Map([
  [
    "immutable Solana verifier program is not deployed for this SCCP lane",
    "immutable-solana-verifier-program",
  ],
  [
    "cryptographic trust anchor is not active for this SCCP lane",
    "active-solana-trust-anchor",
  ],
  [
    "Solana audited Tower replay, full-bank AccountsDB lattice, bank/fork-choice, and source-adapter verifier deployment evidence is not complete for the SCCP inbound path",
    "solana-full-light-client-audit-evidence",
  ],
  [
    "source verifier material is not production-ready for this SCCP lane",
    "solana-source-verifier-material",
  ],
  [
    "Solana finalized-slot/status verifier and full-light-client audit evidence is not deployed for SCCP source proofs",
    "solana-finalized-slot-status-verifier",
  ],
  [
    "Solana transaction status/message inclusion verifier and full-light-client audit evidence is not deployed for SCCP source proofs",
    "solana-transaction-inclusion-verifier",
  ],
  [
    "Solana root/epoch trust anchor and full-light-client audit evidence is not active for SCCP source proofs",
    "solana-root-epoch-trust-anchor",
  ],
  [
    "production route allowlist is not anchored for this SCCP lane",
    "solana-production-route-allowlist",
  ],
  [
    "governance has not activated this SCCP route profile",
    "solana-route-profile-governance-activation",
  ],
  [
    "destination verifier rollout material is not production-ready for this SCCP lane",
    "solana-destination-verifier-rollout-material",
  ],
  [
    `Solana verifier enforcement mode must be ${SOLANA_PRODUCTION_VERIFIER_ENFORCEMENT_MODE}`,
    "solana-verifier-enforcement-mode",
  ],
  [
    "Solana verifier enforcement evidence hash is missing",
    "solana-verifier-enforcement-evidence-hash",
  ],
]);

const stableSolanaLaneBlockerId = (reason) => {
  const text = trimString(reason);
  if (!text) {
    return "";
  }
  const known = SOLANA_LANE_BLOCKER_ID_BY_REASON.get(text);
  if (known) {
    return known;
  }
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 96);
};

const summarizeSolanaLaneBlockers = (reasons) => {
  const details = [];
  const seenIds = new Set();
  for (const reason of reasons) {
    const detail = trimString(reason);
    const id = stableSolanaLaneBlockerId(detail);
    if (!id || seenIds.has(id)) {
      continue;
    }
    seenIds.add(id);
    details.push({ id, detail });
  }
  return {
    blockerIds: details.map((entry) => entry.id),
    blockerDetails: details,
  };
};

const base58Decode = (value) => {
  let number = 0n;
  for (const character of value) {
    const digit = BASE58_INDEX.get(character);
    if (digit === undefined) {
      return null;
    }
    number = number * 58n + BigInt(digit);
  }
  let hex = number === 0n ? "" : number.toString(16);
  if (hex.length % 2 === 1) {
    hex = `0${hex}`;
  }
  const decoded = hex
    ? Uint8Array.from(
        hex.match(/.{1,2}/gu)?.map((byte) => Number.parseInt(byte, 16)) ?? [],
      )
    : new Uint8Array();
  const leadingZeroes = value.match(/^1*/u)?.[0].length ?? 0;
  if (leadingZeroes === 0) {
    return decoded;
  }
  const output = new Uint8Array(leadingZeroes + decoded.length);
  output.set(decoded, leadingZeroes);
  return output;
};

const base58Encode = (bytes) => {
  let number = 0n;
  for (const byte of bytes) {
    number = (number << 8n) + BigInt(byte);
  }
  let encoded = "";
  while (number > 0n) {
    const remainder = Number(number % 58n);
    encoded = `${BASE58_ALPHABET[remainder]}${encoded}`;
    number /= 58n;
  }
  const leadingZeroes = bytes.findIndex((byte) => byte !== 0);
  const prefixLength =
    leadingZeroes === -1 ? bytes.length : Math.max(0, leadingZeroes);
  return `${"1".repeat(prefixLength)}${encoded || ""}`;
};

const normalizeSolanaAddress = (value, label = "Solana address") => {
  const normalized = trimString(value);
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/u.test(normalized)) {
    throw new Error(`${label} must be a canonical Base58 public key.`);
  }
  const decoded = base58Decode(normalized);
  if (
    !decoded ||
    decoded.length !== 32 ||
    decoded.every((byte) => byte === 0)
  ) {
    throw new Error(`${label} must decode to a non-zero 32-byte public key.`);
  }
  if (base58Encode(decoded) !== normalized) {
    throw new Error(`${label} must use canonical Base58 encoding.`);
  }
  return normalized;
};

const normalizeSolanaSignature = (
  value,
  label = "Solana transaction signature",
) => {
  const normalized = trimString(value);
  if (!/^[1-9A-HJ-NP-Za-km-z]{64,88}$/u.test(normalized)) {
    throw new Error(`${label} must be a Base58 transaction signature.`);
  }
  const decoded = base58Decode(normalized);
  if (
    !decoded ||
    decoded.length !== 64 ||
    decoded.every((byte) => byte === 0)
  ) {
    throw new Error(`${label} must decode to a non-zero 64-byte signature.`);
  }
  if (base58Encode(decoded) !== normalized) {
    throw new Error(`${label} must use canonical Base58 encoding.`);
  }
  return normalized;
};

const normalizeHex32 = (value, label) => {
  const normalized = trimString(value).toLowerCase().replace(/^0x/u, "");
  if (!/^[0-9a-f]{64}$/u.test(normalized)) {
    throw new Error(`${label} must be a 32-byte hex value.`);
  }
  if (/^0{64}$/u.test(normalized)) {
    throw new Error(`${label} must be non-zero.`);
  }
  return `0x${normalized}`;
};

const bytesToHex32 = (bytes, label) => {
  if (!(bytes instanceof Uint8Array) || bytes.length !== 32) {
    throw new Error(`${label} must be 32 bytes.`);
  }
  if (bytes.every((byte) => byte === 0)) {
    throw new Error(`${label} must be non-zero.`);
  }
  return `0x${Buffer.from(bytes).toString("hex")}`;
};

const bytesToOptionalHex32 = (bytes, label) => {
  if (!(bytes instanceof Uint8Array) || bytes.length !== 32) {
    throw new Error(`${label} must be 32 bytes.`);
  }
  if (bytes.every((byte) => byte === 0)) {
    return null;
  }
  return `0x${Buffer.from(bytes).toString("hex")}`;
};

export const solanaExecutableBlake2b256 = (programBytes) =>
  bytesToHex32(
    blake2b(Uint8Array.from(programBytes), { dkLen: 32 }),
    "Solana executable BLAKE2b-256 hash",
  );

const normalizeToriiEndpoint = (value) => {
  const raw = trimString(value || DEFAULT_TAIRA_TORII_URL).replace(/\/+$/u, "");
  const url = new URL(raw);
  if (url.protocol !== "https:" && url.hostname !== "localhost") {
    throw new Error("TAIRA Torii URL must be HTTPS or localhost HTTP.");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("TAIRA Torii URL must not contain credentials or query.");
  }
  return url.toString().replace(/\/+$/u, "");
};

const normalizeSolanaRpcEndpoint = (value) => {
  const raw = trimString(value || DEFAULT_SOLANA_TESTNET_RPC_URL);
  const url = new URL(raw);
  if (
    url.protocol !== "https:" &&
    url.hostname !== "localhost" &&
    url.hostname !== "127.0.0.1"
  ) {
    throw new Error("Solana RPC URL must be HTTPS or loopback HTTP.");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("Solana RPC URL must not contain credentials or query.");
  }
  return url.toString().replace(/\/+$/u, "");
};

const normalizeModuleUrl = (value, label) => {
  const normalized = trimString(value).replace(/\\/gu, "/");
  if (!normalized) {
    throw new Error(`${label} is missing.`);
  }
  if (normalized.includes("?") || normalized.includes("#")) {
    throw new Error(`${label} must not contain query strings or fragments.`);
  }
  if (/^https:\/\//iu.test(normalized)) {
    const url = new URL(normalized);
    if (url.username || url.password) {
      throw new Error(`${label} must not contain credentials.`);
    }
    return normalized;
  }
  if (/^http:\/\//iu.test(normalized)) {
    const url = new URL(normalized);
    if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname)) {
      throw new Error(`${label} may use HTTP only for loopback hosts.`);
    }
    if (url.username || url.password) {
      throw new Error(`${label} must not contain credentials.`);
    }
    return normalized;
  }
  if (normalized.startsWith("/") || normalized.startsWith("./")) {
    if (normalized.split("/").includes("..")) {
      throw new Error(`${label} must not contain path traversal.`);
    }
    return normalized;
  }
  throw new Error(
    `${label} must be package-relative, HTTPS, or loopback HTTP.`,
  );
};

const normalizeSolanaProofBackend = (value, label, expected) => {
  const normalized = trimString(value);
  if (normalized !== expected) {
    throw new Error(`${label} must be ${expected}.`);
  }
  return normalized;
};

const normalizeSolanaDestinationProofBackend = (value, label) =>
  normalizeSolanaProofBackend(value, label, SOLANA_DESTINATION_PROOF_BACKEND);

const normalizeSolanaSourceProofBackend = (value, label) =>
  normalizeSolanaProofBackend(value, label, SOLANA_SOURCE_PROOF_BACKEND);

const normalizeRequiredTrue = (value, label) => {
  if (value !== true) {
    throw new Error(`${label} must be true.`);
  }
  return true;
};

const safeJson = (value) =>
  JSON.parse(
    JSON.stringify(value, (_key, entry) =>
      typeof entry === "bigint" ? entry.toString() : entry,
    ),
  );

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const shouldRetryHttpStatus = (status) =>
  status === 429 || status === 502 || status === 503 || status === 504;

const defaultFetchTimeoutMs = () => {
  const value = Number(
    process.env.SCCP_SOLANA_FETCH_TIMEOUT_MS ?? DEFAULT_FETCH_TIMEOUT_MS,
  );
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_FETCH_TIMEOUT_MS;
};

export const fetchJson = async (url, options = {}) => {
  const attempts = Math.max(1, Number(options.attempts ?? 3));
  const timeoutMs = Math.max(
    1,
    Number(options.timeoutMs ?? defaultFetchTimeoutMs()),
  );
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, timeoutMs);
    try {
      const response = await fetch(url, {
        headers: { accept: "application/json", ...(options.headers ?? {}) },
        signal: controller.signal,
        ...Object.fromEntries(
          Object.entries(options).filter(
            ([key]) =>
              !["attempts", "retryDelayMs", "signal", "timeoutMs"].includes(
                key,
              ),
          ),
        ),
      });
      const text = await response.text();
      if (!response.ok) {
        const error = new Error(
          `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}: ${text.slice(0, 300)}`,
        );
        error.status = response.status;
        throw error;
      }
      return text ? JSON.parse(text) : {};
    } catch (error) {
      const fetchError =
        controller.signal.aborted && error?.name === "AbortError"
          ? new Error(`HTTP request timed out after ${timeoutMs}ms: ${url}`)
          : error;
      lastError = fetchError;
      const status = Number(fetchError?.status);
      if (attempt >= attempts || (status && !shouldRetryHttpStatus(status))) {
        throw fetchError;
      }
      await sleep(Number(options.retryDelayMs ?? 250) * attempt);
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError;
};

const readPositiveIntegerOption = (value) => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

const preflightFetchOptions = (options = {}) => {
  const timeoutMs = readPositiveIntegerOption(
    options.fetchTimeoutMs ?? options.timeoutMs,
  );
  const attempts = readPositiveIntegerOption(
    options.fetchAttempts ?? options.attempts,
  );
  return {
    ...(timeoutMs ? { timeoutMs } : {}),
    ...(attempts ? { attempts } : {}),
  };
};

const fetchToriiJson = async (toriiUrl, pathName, options = {}) =>
  fetchJson(`${toriiUrl}${pathName}`, { attempts: 3, ...options });

const fetchSolanaRpc = async (rpcUrl, method, params = [], options = {}) => {
  const payload = await fetchJson(rpcUrl, {
    ...options,
    method: "POST",
    headers: { ...(options.headers ?? {}), "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    }),
  });
  if (payload.error) {
    throw new Error(
      `Solana RPC ${method} failed: ${payload.error.message ?? JSON.stringify(payload.error)}`,
    );
  }
  return payload.result;
};

const readLeU32 = (bytes, offset) =>
  Number(
    BigInt(bytes[offset] ?? 0) |
      (BigInt(bytes[offset + 1] ?? 0) << 8n) |
      (BigInt(bytes[offset + 2] ?? 0) << 16n) |
      (BigInt(bytes[offset + 3] ?? 0) << 24n),
  );

const readLeU64String = (bytes, offset) => {
  let value = 0n;
  for (let index = 0; index < 8; index += 1) {
    value |= BigInt(bytes[offset + index] ?? 0) << BigInt(index * 8);
  }
  return value.toString();
};

const parseSolanaBase64Account = (account, label) => {
  if (!isRecord(account)) {
    throw new Error(`${label} account is missing.`);
  }
  const encoded = Array.isArray(account.data) ? account.data[0] : "";
  if (typeof encoded !== "string" || !encoded) {
    throw new Error(`${label} account must expose base64 data.`);
  }
  return {
    owner: readString(account, "owner"),
    executable: account.executable === true,
    data: Buffer.from(encoded, "base64"),
  };
};

const fetchSolanaBase64Account = async (
  rpcUrl,
  address,
  label,
  fetchOptions = {},
) => {
  const result = await fetchSolanaRpc(
    rpcUrl,
    "getAccountInfo",
    [address, { encoding: "base64", commitment: "finalized" }],
    fetchOptions,
  );
  const value = result?.value;
  if (!value) {
    throw new Error(`${label} account ${address} was not found.`);
  }
  return {
    contextSlot:
      typeof result?.context?.slot === "number" ? result.context.slot : null,
    ...parseSolanaBase64Account(value, label),
  };
};

export const parseUpgradeableProgramAccountData = (bytes) => {
  const data = Uint8Array.from(bytes);
  if (data.length !== 36) {
    throw new Error("Solana Program account data must be 36 bytes.");
  }
  if (readLeU32(data, 0) !== SOLANA_UPGRADEABLE_PROGRAM_TAG) {
    throw new Error("Solana Program account must be upgradeable Program data.");
  }
  return {
    programdataAddress: base58Encode(data.subarray(4, 36)),
  };
};

export const parseUpgradeableProgramDataAccountData = (bytes) => {
  const data = Uint8Array.from(bytes);
  if (data.length <= SOLANA_PROGRAMDATA_METADATA_LEN) {
    throw new Error("Solana ProgramData account is too short.");
  }
  if (readLeU32(data, 0) !== SOLANA_UPGRADEABLE_PROGRAMDATA_TAG) {
    throw new Error("Solana ProgramData account must be ProgramData data.");
  }
  const slot = readLeU64String(data, 4);
  if (slot === "0") {
    throw new Error("Solana ProgramData slot must be positive.");
  }
  if (data[12] !== 0) {
    throw new Error("Solana ProgramData account must be immutable.");
  }
  const executableBytes = data.subarray(SOLANA_PROGRAMDATA_METADATA_LEN);
  if (
    executableBytes.length < 4 ||
    executableBytes[0] !== 0x7f ||
    executableBytes[1] !== 0x45 ||
    executableBytes[2] !== 0x4c ||
    executableBytes[3] !== 0x46
  ) {
    throw new Error("Solana ProgramData executable must be a BPF ELF.");
  }
  return {
    slot,
    metadataHash: solanaExecutableBlake2b256(
      data.subarray(0, SOLANA_PROGRAMDATA_METADATA_LEN),
    ),
    executableHash: solanaExecutableBlake2b256(executableBytes),
    executableLength: executableBytes.length,
  };
};

export const parseSplTokenMintAccountData = (bytes) => {
  const data = Uint8Array.from(bytes);
  if (data.length < 82) {
    throw new Error("SPL Token mint account data must be at least 82 bytes.");
  }
  const mintAuthorityOption = readLeU32(data, 0);
  if (mintAuthorityOption !== 0 && mintAuthorityOption !== 1) {
    throw new Error("SPL Token mint authority option must be 0 or 1.");
  }
  const freezeAuthorityOption = readLeU32(data, 46);
  if (freezeAuthorityOption !== 0 && freezeAuthorityOption !== 1) {
    throw new Error("SPL Token freeze authority option must be 0 or 1.");
  }
  return {
    mintAuthority:
      mintAuthorityOption === 1 ? base58Encode(data.subarray(4, 36)) : null,
    supply: readLeU64String(data, 36),
    decimals: data[44],
    initialized: data[45] === 1,
    freezeAuthority:
      freezeAuthorityOption === 1 ? base58Encode(data.subarray(50, 82)) : null,
  };
};

export const parseSccpSolanaVerifierStateData = (bytes) => {
  const data = Uint8Array.from(bytes);
  if (data.length < SCCP_SOLANA_STATE_LEN) {
    throw new Error("SCCP Solana verifier state account is too small.");
  }
  const magic = Buffer.from(data.subarray(0, 8)).toString("ascii");
  if (magic !== SCCP_SOLANA_STATE_MAGIC) {
    throw new Error("SCCP Solana verifier state magic is invalid.");
  }
  const version = data[8];
  if (version !== 1) {
    throw new Error("SCCP Solana verifier state version is unsupported.");
  }
  const lastBurnHashBytes = data.subarray(240, 272);
  return {
    magic,
    version,
    authority: base58Encode(data.subarray(16, 48)),
    acceptedCount: readLeU64String(data, 48),
    lastSlot: readLeU64String(data, 56),
    acceptedHash: bytesToOptionalHex32(data.subarray(64, 96), "accepted hash"),
    statementHash: bytesToOptionalHex32(
      data.subarray(96, 128),
      "statement hash",
    ),
    destinationBindingHash: bytesToOptionalHex32(
      data.subarray(128, 160),
      "destination binding hash",
    ),
    proofContextHash: bytesToOptionalHex32(
      data.subarray(160, 192),
      "proof context hash",
    ),
    storedMint: base58Encode(data.subarray(192, 224)),
    totalMinted: readLeU64String(data, 224),
    totalBurned: readLeU64String(data, 232),
    lastBurnHash: lastBurnHashBytes.every((byte) => byte === 0)
      ? null
      : bytesToHex32(lastBurnHashBytes, "last burn hash"),
  };
};

const manifestRecords = (manifestSet) => {
  if (Array.isArray(manifestSet)) {
    return manifestSet.filter((entry) => isRecord(entry));
  }
  if (!isRecord(manifestSet)) {
    return [];
  }
  const collectionKeys = ["manifests", "routes", "items", "data"];
  if (!collectionKeys.some((key) => Array.isArray(manifestSet[key]))) {
    return [manifestSet];
  }
  return collectionKeys.flatMap((key) => listRecords(manifestSet[key]));
};

const readOptionalConsistentString = (record, keys, label) => {
  const present = keys.filter((key) =>
    Object.prototype.hasOwnProperty.call(record ?? {}, key),
  );
  if (present.length === 0) {
    return null;
  }
  const absent = present.filter((key) => {
    const value = record[key];
    return value === null || value === undefined || value === "";
  });
  if (absent.length === present.length) {
    return null;
  }
  if (absent.length > 0) {
    throw new Error(
      `${label} aliases must agree; empty and populated aliases cannot be combined.`,
    );
  }
  return readRequiredConsistentString(record, present, label);
};

const readOptionalConsistentNumber = (record, keys, label) => {
  const presentKeys = keys.filter((key) =>
    Object.prototype.hasOwnProperty.call(record ?? {}, key),
  );
  if (
    presentKeys.length > 0 &&
    presentKeys.every((key) => {
      const value = record[key];
      return value === null || value === undefined || value === "";
    })
  ) {
    return null;
  }
  const values = [];
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(record ?? {}, key)) {
      continue;
    }
    const raw = record[key];
    if (
      raw === null ||
      raw === undefined ||
      raw === "" ||
      (typeof raw === "string" && !raw.trim()) ||
      typeof raw === "boolean"
    ) {
      throw new Error(`${label} must be a number.`);
    }
    const value = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(value)) {
      throw new Error(`${label} must be a number.`);
    }
    values.push({ key, value });
  }
  if (values.length === 0) {
    return null;
  }
  const [{ key: firstKey, value: firstValue }] = values;
  for (const { key, value } of values.slice(1)) {
    if (value !== firstValue) {
      throw new Error(
        `${label} aliases must agree: ${firstKey}=${firstValue} but ${key}=${value}.`,
      );
    }
  }
  return firstValue;
};

const readOptionalConsistentBoolean = (record, keys, label) => {
  const present = keys.filter((key) =>
    Object.prototype.hasOwnProperty.call(record ?? {}, key),
  );
  if (present.length === 0) {
    return null;
  }
  if (
    present.every((key) => record[key] === null || record[key] === undefined)
  ) {
    return null;
  }
  return readRequiredConsistentBoolean(record, present, label);
};

const readRouteId = (record) =>
  readOptionalConsistentString(
    record,
    ["routeId", "route_id", "route", "id"],
    "SCCP route id",
  );

const recordClaimsSolana = (record) => {
  const domain = readOptionalConsistentNumber(
    record,
    ["counterpartyDomain", "counterparty_domain", "domain"],
    "Solana counterparty domain",
  );
  const chain = readOptionalConsistentString(record, ["chain"], "Solana chain");
  const network = readOptionalConsistentString(
    record,
    ["solanaNetwork", "solana_network", "networkId", "network_id"],
    "Solana network",
  );
  const target = readOptionalConsistentString(
    record,
    ["verifierTarget", "verifier_target"],
    "Solana verifier target",
  );
  const codec = readOptionalConsistentString(
    record,
    ["counterpartyAccountCodecKey", "counterparty_account_codec_key"],
    "Solana account codec key",
  );
  return (
    domain === SCCP_SOLANA_DOMAIN ||
    chain === "sol" ||
    chain === SOLANA_TESTNET_NETWORK_ID ||
    network === SOLANA_TESTNET_NETWORK_ID ||
    target === SOLANA_VERIFIER_TARGET ||
    codec === "solana_base58"
  );
};

const requireExactString = (record, keys, label, expected) => {
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(record ?? {}, key)) {
      continue;
    }
    const raw = record[key];
    if (typeof raw !== "string" || raw !== raw.trim()) {
      throw new Error(`${label} must use its exact canonical string form.`);
    }
  }
  const value = readRequiredConsistentString(record, keys, label);
  if (value !== expected) {
    throw new Error(`${label} must be ${expected}.`);
  }
  return value;
};

const requireExactNumber = (record, keys, label, expected) => {
  const value = readOptionalConsistentNumber(record, keys, label);
  if (value === null) {
    throw new Error(`${label} is missing.`);
  }
  if (value !== expected) {
    throw new Error(`${label} must be ${expected}.`);
  }
  return value;
};

const assertCanonicalSolanaLaneIdentity = (record, label) => {
  requireExactNumber(
    record,
    ["counterpartyDomain", "counterparty_domain", "domain"],
    `${label} counterparty domain`,
    SCCP_SOLANA_DOMAIN,
  );
  requireExactString(record, ["chain"], `${label} chain`, "sol");
  requireExactString(
    record,
    ["counterpartyAccountCodecKey", "counterparty_account_codec_key"],
    `${label} account codec key`,
    "solana_base58",
  );
  requireExactNumber(
    record,
    ["counterpartyAccountCodec", "counterparty_account_codec"],
    `${label} account codec id`,
    SCCP_CODEC_SOLANA_BASE58,
  );
  const target = readOptionalConsistentString(
    record,
    ["verifierTarget", "verifier_target"],
    `${label} verifier target`,
  );
  if (target !== null && target !== SOLANA_VERIFIER_TARGET) {
    throw new Error(
      `${label} verifier target must be ${SOLANA_VERIFIER_TARGET}.`,
    );
  }
};

const assertCanonicalSolanaRouteSelectionIdentity = (record) => {
  requireExactString(
    record,
    ["routeId", "route_id", "route", "id"],
    "taira_sol_xor route id",
    SCCP_SOLANA_XOR_ROUTE_ID,
  );
  requireExactString(
    record,
    ["assetKey", "asset_key", "assetId", "asset_id"],
    "taira_sol_xor asset key",
    SCCP_XOR_ASSET_KEY,
  );
  requireExactNumber(
    record,
    ["counterpartyDomain", "counterparty_domain", "domain"],
    "taira_sol_xor counterparty domain",
    SCCP_SOLANA_DOMAIN,
  );
  requireExactString(
    record,
    ["chain"],
    "taira_sol_xor chain",
    SOLANA_TESTNET_NETWORK_ID,
  );
  requireExactString(
    record,
    ["solanaNetwork", "solana_network"],
    "taira_sol_xor Solana network",
    "testnet",
  );
  requireExactString(
    record,
    ["networkId", "network_id"],
    "taira_sol_xor network id",
    SOLANA_TESTNET_NETWORK_ID,
  );
  requireExactString(
    record,
    ["counterpartyAccountCodecKey", "counterparty_account_codec_key"],
    "taira_sol_xor account codec key",
    "solana_base58",
  );
  requireExactNumber(
    record,
    ["counterpartyAccountCodec", "counterparty_account_codec"],
    "taira_sol_xor account codec id",
    SCCP_CODEC_SOLANA_BASE58,
  );
  requireExactString(
    record,
    ["verifierTarget", "verifier_target"],
    "taira_sol_xor verifier target",
    SOLANA_VERIFIER_TARGET,
  );
  requireExactString(
    record,
    ["solanaGenesisHash", "solana_genesis_hash", "genesisHash", "genesis_hash"],
    "taira_sol_xor Solana genesis hash",
    SOLANA_TESTNET_GENESIS_HASH,
  );
};

const pickExactlyOneRecord = (records, label) => {
  if (records.length > 1) {
    throw new Error(
      `Expected at most one canonical ${label}; found ${records.length}. Duplicate records are ambiguous even when their JSON is identical.`,
    );
  }
  return records[0] ?? null;
};

export const pickSolanaRouteManifest = (manifestSet) => {
  const candidates = [];
  for (const manifest of manifestRecords(manifestSet)) {
    const routeId = readRouteId(manifest);
    if (routeId !== SCCP_SOLANA_XOR_ROUTE_ID) {
      continue;
    }
    assertCanonicalSolanaRouteSelectionIdentity(manifest);
    candidates.push(manifest);
  }
  return pickExactlyOneRecord(candidates, "taira_sol_xor route record");
};

export const pickSolanaLaneManifest = (manifestSet) => {
  const candidates = [];
  for (const manifest of manifestRecords(manifestSet)) {
    if (readRouteId(manifest) !== null || !recordClaimsSolana(manifest)) {
      continue;
    }
    assertCanonicalSolanaLaneIdentity(manifest, "Solana lane manifest");
    candidates.push(manifest);
  }
  return pickExactlyOneRecord(candidates, "Solana lane manifest record");
};

export const pickSolanaCapability = (capabilities) => {
  const candidates = [];
  for (const counterparty of listRecords(capabilities?.counterparties)) {
    if (!recordClaimsSolana(counterparty)) {
      continue;
    }
    assertCanonicalSolanaLaneIdentity(counterparty, "Solana capability record");
    candidates.push(counterparty);
  }
  return pickExactlyOneRecord(candidates, "Solana capability record");
};

export const mergeSolanaLaneManifestEvidence = (
  laneManifest,
  solanaCapability,
) => {
  if (!isRecord(laneManifest)) {
    return isRecord(solanaCapability) ? solanaCapability : null;
  }
  if (!isRecord(solanaCapability)) {
    return laneManifest;
  }
  throw new Error(
    "Solana lane manifest and capability evidence must be evaluated independently; merging separate records could splice readiness evidence.",
  );
};

const readDestinationRollout = (manifest) =>
  readConsistentRecordAlias(manifest, "destinationRollout", [
    "destinationRollout",
    "destination_rollout",
  ]);

const readSolanaProgramAddress = (manifest) => {
  const rollout = readDestinationRollout(manifest);
  return (
    readFirstString(
      manifest,
      "taira_xor_bridge_address",
      "tairaXorSolanaProgramId",
      "taira_xor_solana_program_id",
      "solanaProgramId",
      "solana_program_id",
      "solanaBridgeProgramId",
      "solana_bridge_program_id",
      "bridgeProgramId",
      "bridge_program_id",
      "bridgeAddress",
      "bridge_address",
      "destinationBridgeAddress",
      "destination_bridge_address",
      "programId",
      "program_id",
    ) ||
    readFirstString(
      rollout,
      "programId",
      "program_id",
      "destinationBridgeAddress",
      "destination_bridge_address",
    )
  );
};

const readSolanaTokenMint = (manifest) =>
  readFirstString(
    manifest,
    "tairaXorTokenAddress",
    "taira_xor_token_address",
    "tairaXorTokenMint",
    "taira_xor_token_mint",
    "solanaTokenMint",
    "solana_token_mint",
    "tokenMint",
    "token_mint",
    "tokenAddress",
    "token_address",
  );

const readSolanaVerifierStateAddress = (manifest) =>
  readFirstString(
    manifest,
    "solanaVerifierStateAddress",
    "solana_verifier_state_address",
    "verifierStateAddress",
    "verifier_state_address",
    "stateAddress",
    "state_address",
  );

const readSolanaSourceStateAddress = (manifest) =>
  readFirstString(
    manifest,
    "sccpSolanaSourceStateAddress",
    "sccp_solana_source_state_address",
    "solanaSourceStateAddress",
    "solana_source_state_address",
    "sourceBridgeStateAddress",
    "source_bridge_state_address",
    "sourceStateAddress",
    "source_state_address",
  );

const readSolanaMintAuthorityAddress = (manifest) =>
  readFirstString(
    manifest,
    "solanaMintAuthorityAddress",
    "solana_mint_authority_address",
    "mintAuthorityAddress",
    "mint_authority_address",
  );

const readSolanaSourceBridgeAddress = (manifest) =>
  readFirstString(
    manifest,
    "sccpSolanaSourceBridgeAddress",
    "sccp_solana_source_bridge_address",
    "solanaSourceBridgeAddress",
    "solana_source_bridge_address",
    "sourceBridgeProgramId",
    "source_bridge_program_id",
    "sourceBridgeAddress",
    "source_bridge_address",
  );

const readSolanaVerifierAddress = (manifest) => {
  const rollout = readDestinationRollout(manifest);
  return (
    readFirstString(
      manifest,
      "solanaVerifierProgramId",
      "solana_verifier_program_id",
      "sccpSolanaDestinationVerifierProgramId",
      "sccp_solana_destination_verifier_program_id",
      "destinationVerifierProgramId",
      "destination_verifier_program_id",
      "verifierProgramId",
      "verifier_program_id",
      "verifierAddress",
      "verifier_address",
      "destinationVerifierAddress",
      "destination_verifier_address",
    ) || readFirstString(rollout, "verifierIdentity", "verifier_identity")
  );
};

const readSolanaNativeVerifierAddress = (manifest) => {
  const rollout = readDestinationRollout(manifest);
  const admission = readFirstRecord(
    manifest,
    "destinationProofAdmission",
    "destination_proof_admission",
  );
  return (
    readFirstString(
      manifest,
      "solanaNativeVerifierProgramId",
      "solana_native_verifier_program_id",
      "nativeVerifierProgramId",
      "native_verifier_program_id",
    ) ||
    readFirstString(
      admission,
      "nativeVerifierProgramId",
      "native_verifier_program_id",
      "solanaNativeVerifierProgramId",
      "solana_native_verifier_program_id",
    ) ||
    readFirstString(
      rollout,
      "nativeVerifierProgramId",
      "native_verifier_program_id",
      "solanaNativeVerifierProgramId",
      "solana_native_verifier_program_id",
    )
  );
};

const readConsistentBrowserProverField = (
  manifest,
  proverKeys,
  fieldKeys,
  label,
  normalize,
) => {
  const records = [];
  for (const proverKey of proverKeys) {
    if (!Object.prototype.hasOwnProperty.call(manifest ?? {}, proverKey)) {
      continue;
    }
    const record = manifest[proverKey];
    if (!isRecord(record)) {
      throw new Error(`${label} prover record must be an object.`);
    }
    records.push({ proverKey, record });
  }
  if (records.length === 0) {
    return normalize("", label);
  }
  const normalizedValues = [];
  for (const { proverKey, record } of records) {
    for (const fieldKey of fieldKeys) {
      if (!Object.prototype.hasOwnProperty.call(record, fieldKey)) {
        continue;
      }
      normalizedValues.push({
        key: `${proverKey}.${fieldKey}`,
        value: normalize(record[fieldKey], label),
      });
    }
  }
  if (normalizedValues.length === 0) {
    return normalize("", label);
  }
  const [{ value: firstValue, key: firstKey }] = normalizedValues;
  for (const { key, value } of normalizedValues.slice(1)) {
    if (value !== firstValue) {
      throw new Error(
        `${label} aliases must agree: ${firstKey}=${firstValue} but ${key}=${value}.`,
      );
    }
  }
  return firstValue;
};

const readBurnRecordMaterial = (manifest) => {
  const burnRecord = readFirstRecord(
    manifest,
    "tairaXorBurnRecord",
    "taira_xor_burn_record",
    "burnRecord",
    "burn_record",
    "sourceRecordContract",
    "source_record_contract",
  );
  const settlementAssetDefinitionId =
    readFirstString(
      burnRecord,
      "settlementAssetDefinitionId",
      "settlement_asset_definition_id",
      "settlementAsset",
      "settlement_asset",
    ) ||
    readFirstString(
      manifest,
      "settlementAssetDefinitionId",
      "settlement_asset_definition_id",
      "tairaXorSettlementAssetDefinitionId",
      "taira_xor_settlement_asset_definition_id",
    );
  const artifactB64 =
    readFirstString(
      burnRecord,
      "contractArtifactB64",
      "contract_artifact_b64",
      "artifactB64",
      "artifact_b64",
      "bytecode",
    ) ||
    readFirstString(
      manifest,
      "tairaXorBurnRecordContractArtifactB64",
      "taira_xor_burn_record_contract_artifact_b64",
    );
  const vkRef =
    readFirstRecord(burnRecord, "vkRef", "vk_ref", "verifyingKeyRef") ??
    readFirstRecord(manifest, "tairaXorBurnRecordVkRef");
  return { settlementAssetDefinitionId, artifactB64, vkRef };
};

const isCanonicalTairaAssetDefinitionId = (value) =>
  /^[1-9A-HJ-NP-Za-km-z]{16,80}$/u.test(trimString(value));

const stableJson = (value) =>
  JSON.stringify(value, (_key, entry) =>
    isRecord(entry)
      ? Object.fromEntries(
          Object.keys(entry)
            .sort()
            .map((key) => [key, entry[key]]),
        )
      : entry,
  );

const readConsistentRecordAlias = (record, label, keys) => {
  const records = [];
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(record ?? {}, key)) {
      continue;
    }
    const value = record[key];
    if (!isRecord(value)) {
      throw new Error(`${label} must be an object.`);
    }
    records.push({ key, value });
  }
  if (records.length === 0) {
    return null;
  }
  const [{ key: firstKey, value: firstValue }] = records;
  const firstJson = stableJson(safeJson(firstValue));
  for (const { key, value } of records.slice(1)) {
    const json = stableJson(safeJson(value));
    if (json !== firstJson) {
      throw new Error(
        `${label} aliases must agree: ${firstKey} differs from ${key}.`,
      );
    }
  }
  return firstValue;
};

const sourceMaterialFlagIsFalse = (value) =>
  value === false ||
  (typeof value === "string" && value.trim().toLowerCase() === "false");

const sourceMaterialTextIsPresent = (record, keys) =>
  keys.some(
    (key) =>
      Object.prototype.hasOwnProperty.call(record ?? {}, key) &&
      trimString(record[key]),
  );

const assertSourceMaterialFlagFalse = (record, label, canonical, keys) => {
  const values = [];
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(record ?? {}, key)) {
      continue;
    }
    if (!sourceMaterialFlagIsFalse(record[key])) {
      throw new Error(`${label}.${canonical} must be false`);
    }
    values.push({ key, value: false });
  }
  if (values.length === 0) {
    throw new Error(`${label}.${canonical} must be explicitly false`);
  }
};

const rejectTruthySourceMaterialFlag = (record, label, canonical, keys) => {
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(record ?? {}, key)) {
      continue;
    }
    if (!sourceMaterialFlagIsFalse(record[key])) {
      throw new Error(`${label}.${canonical} must be false when present`);
    }
  }
};

const requireHashFields = (record, label, fields) => {
  const missing = [];
  for (const aliases of fields) {
    const [primary] = aliases;
    const values = [];
    for (const key of aliases) {
      if (!Object.prototype.hasOwnProperty.call(record ?? {}, key)) {
        continue;
      }
      values.push({
        key,
        value: normalizeHex32(record[key], `${label}.${primary}`),
      });
    }
    if (values.length === 0) {
      missing.push(`${label}.${primary}`);
      continue;
    }
    const [{ key: firstKey, value: firstValue }] = values;
    for (const { key, value } of values.slice(1)) {
      if (value !== firstValue) {
        throw new Error(
          `${label}.${primary} aliases must agree: ${firstKey}=${firstValue} but ${key}=${value}.`,
        );
      }
    }
  }
  return missing;
};

const makeCheck = (id, ok, detail, evidence = undefined) => ({
  id,
  status: ok ? "pass" : "fail",
  detail,
  ...(evidence === undefined ? {} : { evidence: safeJson(evidence) }),
});

const pushCheck = (checks, id, action) => {
  try {
    const evidence = action();
    checks.push(makeCheck(id, true, "ok", evidence));
  } catch (error) {
    checks.push(
      makeCheck(
        id,
        false,
        error instanceof Error ? error.message : String(error),
      ),
    );
  }
};

const checkCapabilities = (capabilities) => {
  const proofPath =
    readFirstString(capabilities, "proofSubmitPath", "proof_submit_path") ||
    readFirstString(readRecord(capabilities, "submit"), "proof") ||
    readFirstString(readRecord(capabilities, "paths"), "proof");
  const messagePath =
    readFirstString(capabilities, "messageSubmitPath", "message_submit_path") ||
    readFirstString(readRecord(capabilities, "submit"), "message") ||
    readFirstString(readRecord(capabilities, "paths"), "message");
  if (!proofPath || !messagePath) {
    throw new Error(
      "SCCP capabilities must expose proof and message submit paths.",
    );
  }
  return { proofPath, messagePath };
};

const selectConsistentEvidenceRecord = (primary, fallback, label) => {
  if (!isRecord(primary)) {
    return isRecord(fallback) ? fallback : null;
  }
  if (!isRecord(fallback)) {
    return primary;
  }
  if (stableJson(safeJson(primary)) !== stableJson(safeJson(fallback))) {
    throw new Error(
      `${label} appears in multiple locations with different content; evidence must not be spliced across records.`,
    );
  }
  return primary;
};

export const summarizeSolanaLaneManifest = (manifest) => {
  if (!manifest) {
    return null;
  }
  const rollout = readDestinationRollout(manifest);
  const readiness = readConsistentRecordAlias(manifest, "productionReadiness", [
    "productionReadiness",
    "production_readiness",
  ]);
  const sourceAdapter = selectConsistentEvidenceRecord(
    readConsistentRecordAlias(manifest, "sourceAdapterEngine", [
      "sourceAdapterEngine",
      "source_adapter_engine",
    ]),
    readConsistentRecordAlias(readiness, "sourceAdapterEngine", [
      "sourceAdapterEngine",
      "source_adapter_engine",
    ]),
    "sourceAdapterEngine",
  );
  const routeAllowlist = readConsistentRecordAlias(
    readiness,
    "routeAllowlist",
    ["routeAllowlist", "route_allowlist"],
  );
  const sourceVerifierMaterial = readConsistentRecordAlias(
    sourceAdapter,
    "sourceVerifierMaterial",
    ["sourceVerifierMaterial", "source_verifier_material"],
  );
  return {
    routeId:
      readOptionalConsistentString(
        manifest,
        ["routeId", "route_id", "route", "id"],
        "Solana lane route id",
      ) ?? "",
    assetKey:
      readOptionalConsistentString(
        manifest,
        ["assetKey", "asset_key", "assetId", "asset_id"],
        "Solana lane asset key",
      ) ?? "",
    chain:
      readOptionalConsistentString(manifest, ["chain"], "Solana lane chain") ??
      "",
    counterpartyDomain:
      readOptionalConsistentNumber(
        manifest,
        ["counterpartyDomain", "counterparty_domain", "domain"],
        "Solana lane counterparty domain",
      ) ?? Number.NaN,
    counterpartyAccountCodecKey:
      readOptionalConsistentString(
        manifest,
        ["counterpartyAccountCodecKey", "counterparty_account_codec_key"],
        "Solana lane account codec key",
      ) ?? "",
    productionReady:
      readOptionalConsistentBoolean(
        manifest,
        ["productionReady", "production_ready"],
        "Solana lane production-ready flag",
      ) === true,
    disabledReason:
      readOptionalConsistentString(
        manifest,
        ["disabledReason", "disabled_reason"],
        "Solana lane disabled reason",
      ) ?? "",
    destinationRollout: rollout
      ? {
          verifierIdentity:
            readOptionalConsistentString(
              rollout,
              ["verifierIdentity", "verifier_identity"],
              "destinationRollout.verifierIdentity",
            ) ?? "",
          verifierCodeHash:
            readOptionalConsistentString(
              rollout,
              ["verifierCodeHash", "verifier_code_hash"],
              "destinationRollout.verifierCodeHash",
            ) ?? "",
          destinationBridgeAddress:
            readOptionalConsistentString(
              rollout,
              ["destinationBridgeAddress", "destination_bridge_address"],
              "destinationRollout.destinationBridgeAddress",
            ) ?? "",
          immutableVerifierReady:
            readOptionalConsistentBoolean(
              rollout,
              ["immutableVerifierReady", "immutable_verifier_ready"],
              "destinationRollout.immutableVerifierReady",
            ) === true,
          anchorsReady:
            readOptionalConsistentBoolean(
              rollout,
              ["anchorsReady", "anchors_ready"],
              "destinationRollout.anchorsReady",
            ) === true,
          proofVerificationMode:
            readOptionalConsistentString(
              rollout,
              [
                "proofVerificationMode",
                "proof_verification_mode",
                "verifierEnforcementMode",
                "verifier_enforcement_mode",
              ],
              "destinationRollout.proofVerificationMode",
            ) ?? "",
          verifierEnforcementEvidenceHash:
            readOptionalConsistentString(
              rollout,
              [
                "verifierEnforcementEvidenceHash",
                "verifier_enforcement_evidence_hash",
                "recursiveVerifierEvidenceHash",
                "recursive_verifier_evidence_hash",
              ],
              "destinationRollout.verifierEnforcementEvidenceHash",
            ) ?? "",
          blockers: Array.isArray(rollout.blockers)
            ? rollout.blockers.map(String)
            : [],
        }
      : null,
    productionReadiness: readiness
      ? {
          sourceAdapterReady:
            readOptionalConsistentBoolean(
              readiness,
              ["sourceAdapterReady", "source_adapter_ready"],
              "productionReadiness.sourceAdapterReady",
            ) === true,
          immutableVerifierReady:
            readOptionalConsistentBoolean(
              readiness,
              ["immutableVerifierReady", "immutable_verifier_ready"],
              "productionReadiness.immutableVerifierReady",
            ) === true,
          anchorsReady:
            readOptionalConsistentBoolean(
              readiness,
              ["anchorsReady", "anchors_ready"],
              "productionReadiness.anchorsReady",
            ) === true,
          proofVerificationMode:
            readOptionalConsistentString(
              readiness,
              [
                "proofVerificationMode",
                "proof_verification_mode",
                "verifierEnforcementMode",
                "verifier_enforcement_mode",
              ],
              "productionReadiness.proofVerificationMode",
            ) ?? "",
          routesAllowlisted:
            readOptionalConsistentBoolean(
              readiness,
              ["routesAllowlisted", "routes_allowlisted"],
              "productionReadiness.routesAllowlisted",
            ) === true,
          productionReady:
            readOptionalConsistentBoolean(
              readiness,
              ["productionReady", "production_ready"],
              "productionReadiness.productionReady",
            ) === true,
          blockers: Array.isArray(readiness.blockers)
            ? readiness.blockers.map(String)
            : [],
        }
      : null,
    sourceAdapterEngine: sourceAdapter
      ? {
          sourceVerifierMaterialReady:
            readOptionalConsistentBoolean(
              sourceAdapter,
              ["sourceVerifierMaterialReady", "source_verifier_material_ready"],
              "sourceAdapterEngine.sourceVerifierMaterialReady",
            ) === true,
          sourceTrustAnchorReady:
            readOptionalConsistentBoolean(
              sourceAdapter,
              ["sourceTrustAnchorReady", "source_trust_anchor_ready"],
              "sourceAdapterEngine.sourceTrustAnchorReady",
            ) === true,
          externalConsensusVerifierReady:
            readOptionalConsistentBoolean(
              sourceAdapter,
              [
                "externalConsensusVerifierReady",
                "external_consensus_verifier_ready",
              ],
              "sourceAdapterEngine.externalConsensusVerifierReady",
            ) === true,
          externalMessageInclusionVerifierReady:
            readOptionalConsistentBoolean(
              sourceAdapter,
              [
                "externalMessageInclusionVerifierReady",
                "external_message_inclusion_verifier_ready",
              ],
              "sourceAdapterEngine.externalMessageInclusionVerifierReady",
            ) === true,
          productionReady:
            readOptionalConsistentBoolean(
              sourceAdapter,
              ["productionReady", "production_ready"],
              "sourceAdapterEngine.productionReady",
            ) === true,
          sourceVerifierMaterial: sourceVerifierMaterial
            ? {
                sourceDomain: Number(
                  readOptionalConsistentNumber(
                    sourceVerifierMaterial,
                    ["sourceDomain", "source_domain"],
                    "sourceVerifierMaterial.sourceDomain",
                  ) ?? Number.NaN,
                ),
                sourceChain:
                  readOptionalConsistentString(
                    sourceVerifierMaterial,
                    ["sourceChain", "source_chain"],
                    "sourceVerifierMaterial.sourceChain",
                  ) ?? "",
                sourceTrustAnchorHash:
                  readOptionalConsistentString(
                    sourceVerifierMaterial,
                    ["sourceTrustAnchorHash", "source_trust_anchor_hash"],
                    "sourceVerifierMaterial.sourceTrustAnchorHash",
                  ) ?? "",
                consensusVerifierHash:
                  readOptionalConsistentString(
                    sourceVerifierMaterial,
                    ["consensusVerifierHash", "consensus_verifier_hash"],
                    "sourceVerifierMaterial.consensusVerifierHash",
                  ) ?? "",
                messageInclusionVerifierHash:
                  readOptionalConsistentString(
                    sourceVerifierMaterial,
                    [
                      "messageInclusionVerifierHash",
                      "message_inclusion_verifier_hash",
                    ],
                    "sourceVerifierMaterial.messageInclusionVerifierHash",
                  ) ?? "",
                finalityPolicyHash:
                  readOptionalConsistentString(
                    sourceVerifierMaterial,
                    ["finalityPolicyHash", "finality_policy_hash"],
                    "sourceVerifierMaterial.finalityPolicyHash",
                  ) ?? "",
                sourceStateVerifierHash:
                  readOptionalConsistentString(
                    sourceVerifierMaterial,
                    ["sourceStateVerifierHash", "source_state_verifier_hash"],
                    "sourceVerifierMaterial.sourceStateVerifierHash",
                  ) ?? "",
                placeholderMaterial:
                  readOptionalConsistentBoolean(
                    sourceVerifierMaterial,
                    ["placeholderMaterial", "placeholder_material"],
                    "sourceVerifierMaterial.placeholderMaterial",
                  ) === true,
              }
            : null,
          blockers: Array.isArray(sourceAdapter.blockers)
            ? sourceAdapter.blockers.map(String)
            : [],
        }
      : null,
    routeAllowlist: routeAllowlist
      ? {
          activationPolicy:
            readOptionalConsistentString(
              routeAllowlist,
              ["activationPolicy", "activation_policy"],
              "routeAllowlist.activationPolicy",
            ) ?? "",
          routesAllowlisted:
            readOptionalConsistentBoolean(
              routeAllowlist,
              ["routesAllowlisted", "routes_allowlisted"],
              "routeAllowlist.routesAllowlisted",
            ) === true,
          routeAllowlistHash:
            readOptionalConsistentString(
              routeAllowlist,
              ["routeAllowlistHash", "route_allowlist_hash"],
              "routeAllowlist.routeAllowlistHash",
            ) ?? "",
          blockers: Array.isArray(routeAllowlist.blockers)
            ? routeAllowlist.blockers.map(String)
            : [],
        }
      : null,
  };
};

export const checkSolanaLanePublication = (manifest) => {
  if (!manifest) {
    return makeCheck(
      "solana-lane-publication",
      false,
      "No public Solana SCCP lane manifest found.",
    );
  }
  const summary = summarizeSolanaLaneManifest(manifest);
  const blockers = [
    ...(summary.destinationRollout?.blockers ?? []),
    ...(summary.productionReadiness?.blockers ?? []),
    ...(summary.sourceAdapterEngine?.blockers ?? []),
    ...(summary.routeAllowlist?.blockers ?? []),
  ];
  if (
    summary.destinationRollout?.proofVerificationMode !==
    SOLANA_PRODUCTION_VERIFIER_ENFORCEMENT_MODE
  ) {
    blockers.push(
      `Solana verifier enforcement mode must be ${SOLANA_PRODUCTION_VERIFIER_ENFORCEMENT_MODE}`,
    );
  }
  try {
    normalizeHex32(
      summary.destinationRollout?.verifierEnforcementEvidenceHash,
      "Solana verifier enforcement evidence hash",
    );
  } catch {
    blockers.push("Solana verifier enforcement evidence hash is missing");
  }
  const { blockerIds, blockerDetails } = summarizeSolanaLaneBlockers(blockers);
  const ready =
    summary.productionReady === true &&
    !summary.disabledReason &&
    summary.destinationRollout?.immutableVerifierReady === true &&
    summary.destinationRollout?.anchorsReady === true &&
    blockerIds.length === 0;
  return makeCheck(
    "solana-lane-publication",
    ready,
    ready
      ? "Public TAIRA Solana SCCP lane manifest is production-ready."
      : summary.disabledReason ||
          "Public TAIRA Solana SCCP lane manifest is not production-ready.",
    {
      ...summary,
      blockerIds,
      blockerDetails,
    },
  );
};

export const checkSolanaRouteInstancePublication = (manifest, laneManifest) => {
  if (manifest) {
    return makeCheck(
      "solana-route-instance-publication",
      true,
      "Public TAIRA exposes the taira_sol_xor Solana route manifest.",
      {
        route: summarizeSolanaLaneManifest(manifest),
        laneTemplate: summarizeSolanaLaneManifest(laneManifest),
      },
    );
  }
  if (laneManifest) {
    return makeCheck(
      "solana-route-instance-publication",
      false,
      "Public TAIRA exposes a generic Solana SCCP lane template, but no taira_sol_xor Solana route instance is published.",
      {
        laneTemplate: summarizeSolanaLaneManifest(laneManifest),
        expectedRouteId: SCCP_SOLANA_XOR_ROUTE_ID,
        expectedAssetKey: SCCP_XOR_ASSET_KEY,
      },
    );
  }
  return makeCheck(
    "solana-route-instance-publication",
    false,
    "Public TAIRA does not expose a Solana SCCP lane template or taira_sol_xor route instance.",
    {
      expectedRouteId: SCCP_SOLANA_XOR_ROUTE_ID,
      expectedAssetKey: SCCP_XOR_ASSET_KEY,
    },
  );
};

const checkManifestShape = (manifest) => {
  if (!manifest) {
    throw new Error("No taira_sol_xor Solana testnet manifest found.");
  }
  const routeId = readRequiredConsistentString(
    manifest,
    ["routeId", "route_id", "route", "id"],
    "Solana route id",
  );
  const assetKey = readRequiredConsistentString(
    manifest,
    ["assetKey", "asset_key", "assetId", "asset_id"],
    "Solana route asset key",
  );
  const codecKey = readRequiredConsistentString(
    manifest,
    ["counterpartyAccountCodecKey", "counterparty_account_codec_key"],
    "Solana account codec key",
  );
  const codecId = requireExactNumber(
    manifest,
    ["counterpartyAccountCodec", "counterparty_account_codec"],
    "Solana account codec id",
    SCCP_CODEC_SOLANA_BASE58,
  );
  const domain = requireExactNumber(
    manifest,
    ["counterpartyDomain", "counterparty_domain", "domain"],
    "Solana manifest counterparty domain",
    SCCP_SOLANA_DOMAIN,
  );
  const chain = requireExactString(
    manifest,
    ["chain"],
    "Solana manifest chain",
    SOLANA_TESTNET_NETWORK_ID,
  );
  const solanaNetwork = requireExactString(
    manifest,
    ["solanaNetwork", "solana_network"],
    "Solana manifest network",
    "testnet",
  );
  const networkId = requireExactString(
    manifest,
    ["networkId", "network_id"],
    "Solana manifest network id",
    SOLANA_TESTNET_NETWORK_ID,
  );
  const verifierTarget = readRequiredConsistentString(
    manifest,
    ["verifierTarget", "verifier_target"],
    "Solana verifierTarget",
  );
  const destinationVerifierPlan = readRequiredConsistentString(
    manifest,
    ["destinationVerifierPlan", "destination_verifier_plan"],
    "Solana destinationVerifierPlan",
  );
  const genesisHash = readRequiredConsistentString(
    manifest,
    ["solanaGenesisHash", "solana_genesis_hash", "genesisHash", "genesis_hash"],
    "Solana genesis hash",
  );
  if (routeId !== SCCP_SOLANA_XOR_ROUTE_ID || assetKey !== SCCP_XOR_ASSET_KEY) {
    throw new Error(
      `Expected ${SCCP_SOLANA_XOR_ROUTE_ID}/${SCCP_XOR_ASSET_KEY}.`,
    );
  }
  if (domain !== SCCP_SOLANA_DOMAIN) {
    throw new Error("Solana manifest counterparty domain must be 3.");
  }
  if (codecKey !== "solana_base58") {
    throw new Error("Solana manifest must use solana_base58 codec key.");
  }
  if (verifierTarget !== SOLANA_VERIFIER_TARGET) {
    throw new Error(`Solana verifierTarget must be ${SOLANA_VERIFIER_TARGET}.`);
  }
  if (destinationVerifierPlan !== SOLANA_DESTINATION_VERIFIER_PLAN) {
    throw new Error(
      `Solana destinationVerifierPlan must be ${SOLANA_DESTINATION_VERIFIER_PLAN}.`,
    );
  }
  if (genesisHash !== SOLANA_TESTNET_GENESIS_HASH) {
    throw new Error(
      `Solana genesis hash must be ${SOLANA_TESTNET_GENESIS_HASH}.`,
    );
  }
  return {
    routeId,
    assetKey,
    domain,
    chain,
    solanaNetwork,
    networkId,
    codecKey,
    codecId,
    verifierTarget,
    destinationVerifierPlan,
    genesisHash,
  };
};

export const checkProductionReadyFlag = (manifest) => {
  if (!manifest) {
    throw new Error("Solana route manifest is missing.");
  }
  if (
    readRequiredConsistentBoolean(
      manifest,
      ["productionReady", "production_ready"],
      "Solana route production-ready flag",
    ) !== true
  ) {
    throw new Error("Solana route manifest is not production-ready.");
  }
  if (readFirstString(manifest, "disabledReason", "disabled_reason")) {
    throw new Error(
      "production-ready Solana manifest carries a disabled reason.",
    );
  }
  return { productionReady: true };
};

const checkDeploymentAddresses = (manifest) => {
  const deployment = {
    bridgeProgramAddress: normalizeSolanaAddress(
      readSolanaProgramAddress(manifest),
      "Solana bridge program address",
    ),
    tokenMintAddress: normalizeSolanaAddress(
      readSolanaTokenMint(manifest),
      "Solana token mint address",
    ),
    sourceBridgeProgramAddress: normalizeSolanaAddress(
      readSolanaSourceBridgeAddress(manifest),
      "Solana source bridge program address",
    ),
    verifierProgramAddress: normalizeSolanaAddress(
      readSolanaVerifierAddress(manifest),
      "Solana verifier program address",
    ),
    nativeVerifierProgramAddress: normalizeSolanaAddress(
      readSolanaNativeVerifierAddress(manifest),
      "Solana native verifier program address",
    ),
    verifierStateAddress: normalizeSolanaAddress(
      readSolanaVerifierStateAddress(manifest),
      "Solana verifier state address",
    ),
    sourceStateAddress: normalizeSolanaAddress(
      readSolanaSourceStateAddress(manifest),
      "Solana source bridge state address",
    ),
  };
  if (
    new Set([
      deployment.bridgeProgramAddress,
      deployment.tokenMintAddress,
      deployment.sourceBridgeProgramAddress,
      deployment.verifierProgramAddress,
      deployment.nativeVerifierProgramAddress,
      deployment.verifierStateAddress,
      deployment.sourceStateAddress,
    ]).size !== 7
  ) {
    throw new Error(
      "Solana deployment program, state, and mint addresses must be distinct.",
    );
  }
  return deployment;
};

const deriveSccpSolanaMintAuthority = (
  verifierProgramAddress,
  verifierStateAddress,
) =>
  PublicKey.findProgramAddressSync(
    [
      Buffer.from(SCCP_SOLANA_MINT_AUTHORITY_SEED, "utf8"),
      new PublicKey(verifierStateAddress).toBuffer(),
    ],
    new PublicKey(verifierProgramAddress),
  )[0].toBase58();

const checkRolloutMaterial = (manifest) => {
  const rollout = readDestinationRollout(manifest) ?? {};
  const verifierCodeHash =
    readFirstString(manifest, "verifierCodeHash", "verifier_code_hash") ||
    readFirstString(rollout, "verifierCodeHash", "verifier_code_hash");
  const verifierKeyHash =
    readFirstString(manifest, "verifierKeyHash", "verifier_key_hash") ||
    readFirstString(rollout, "verifierKeyHash", "verifier_key_hash");
  const destinationBindingHash =
    readFirstString(
      manifest,
      "expectedDestinationBindingHashHex",
      "expected_destination_binding_hash_hex",
      "destinationBindingHash",
      "destination_binding_hash",
    ) ||
    readFirstString(
      rollout,
      "destinationBindingHash",
      "destination_binding_hash",
    ) ||
    readFirstString(
      readFirstRecord(manifest, "destinationBinding", "destination_binding"),
      "bindingHash",
      "binding_hash",
    );
  const programdataAddress =
    readFirstString(
      manifest,
      "solanaProgramdataAddress",
      "solana_programdata_address",
      "programdataAddress",
      "programdata_address",
    ) || readFirstString(rollout, "programdataAddress", "programdata_address");
  const programdataSlot =
    readNumber(manifest, "solanaProgramdataSlot") ??
    readNumber(manifest, "solana_programdata_slot") ??
    readNumber(rollout, "programdataSlot") ??
    readNumber(rollout, "programdata_slot");
  return {
    verifierCodeHash: normalizeHex32(
      verifierCodeHash,
      "Solana verifier code hash",
    ),
    verifierKeyHash: normalizeHex32(
      verifierKeyHash,
      "Solana verifier key hash",
    ),
    destinationBindingHash: normalizeHex32(
      destinationBindingHash,
      "Solana destination binding hash",
    ),
    programdataAddress: normalizeSolanaAddress(
      programdataAddress,
      "Solana programdata address",
    ),
    programdataSlot: (() => {
      if (
        !Number.isSafeInteger(programdataSlot) ||
        Number(programdataSlot) <= 0
      ) {
        throw new Error("Solana programdata slot must be positive.");
      }
      return programdataSlot;
    })(),
  };
};

const readEmbeddedVerifierLiveEvidence = (manifest) => {
  const deploymentEvidence = readFirstRecord(
    manifest,
    "deploymentEvidence",
    "deployment_evidence",
  );
  return readFirstRecord(
    deploymentEvidence,
    "verifierLive",
    "verifier_live",
    "liveVerifier",
    "live_verifier",
  );
};

const checkEmbeddedVerifierLiveEvidence = (
  manifest,
  liveDeploymentEvidence,
) => {
  const embedded = readEmbeddedVerifierLiveEvidence(manifest);
  if (!embedded) {
    return { embedded: false };
  }
  const embeddedCodeHash = normalizeHex32(
    readFirstString(embedded, "verifier_code_hash", "verifierCodeHash"),
    "deploymentEvidence.verifierLive.verifierCodeHash",
  );
  const embeddedProgramdataAddress = normalizeSolanaAddress(
    readFirstString(
      embedded,
      "programdata_address",
      "programdataAddress",
      "programDataAddress",
    ),
    "deploymentEvidence.verifierLive.programdataAddress",
  );
  const embeddedProgramdataSlot = readFirstString(
    embedded,
    "programdata_slot",
    "programdataSlot",
    "programDataSlot",
  );
  const embeddedMetadataHash = readFirstString(
    embedded,
    "programdata_metadata_blake2b256",
    "programdataMetadataBlake2b256",
  );
  if (embeddedCodeHash !== liveDeploymentEvidence.verifierCodeHash) {
    throw new Error(
      "embedded verifier live evidence code hash does not match Solana RPC.",
    );
  }
  if (
    embeddedProgramdataAddress !== liveDeploymentEvidence.programdataAddress
  ) {
    throw new Error(
      "embedded verifier live evidence ProgramData address does not match Solana RPC.",
    );
  }
  if (embeddedProgramdataSlot !== liveDeploymentEvidence.programdataSlot) {
    throw new Error(
      "embedded verifier live evidence ProgramData slot does not match Solana RPC.",
    );
  }
  if (
    embeddedMetadataHash &&
    normalizeHex32(
      embeddedMetadataHash,
      "deploymentEvidence.verifierLive.programdataMetadataBlake2b256",
    ) !== liveDeploymentEvidence.programdataMetadataHash
  ) {
    throw new Error(
      "embedded verifier live evidence ProgramData metadata hash does not match Solana RPC.",
    );
  }
  return {
    embedded: true,
    verifierCodeHash: embeddedCodeHash,
    programdataAddress: embeddedProgramdataAddress,
    programdataSlot: embeddedProgramdataSlot,
    programdataMetadataHash: embeddedMetadataHash
      ? normalizeHex32(
          embeddedMetadataHash,
          "deploymentEvidence.verifierLive.programdataMetadataBlake2b256",
        )
      : null,
  };
};

const checkLiveSolanaDeployment = async (
  manifest,
  rpcUrl,
  fetchOptions = {},
) => {
  const deployment = checkDeploymentAddresses(manifest);
  const rollout = checkRolloutMaterial(manifest);
  const programAccount = await fetchSolanaBase64Account(
    rpcUrl,
    deployment.verifierProgramAddress,
    "Solana verifier program",
    fetchOptions,
  );
  if (programAccount.owner !== SOLANA_UPGRADEABLE_LOADER_ID) {
    throw new Error(
      "Solana verifier program owner is not the upgradeable loader.",
    );
  }
  if (programAccount.executable !== true) {
    throw new Error("Solana verifier program account is not executable.");
  }
  const parsedProgram = parseUpgradeableProgramAccountData(programAccount.data);
  if (parsedProgram.programdataAddress !== rollout.programdataAddress) {
    throw new Error(
      "Solana verifier ProgramData address does not match manifest rollout material.",
    );
  }
  const programdataAccount = await fetchSolanaBase64Account(
    rpcUrl,
    rollout.programdataAddress,
    "Solana verifier ProgramData",
    fetchOptions,
  );
  if (programdataAccount.owner !== SOLANA_UPGRADEABLE_LOADER_ID) {
    throw new Error("Solana ProgramData owner is not the upgradeable loader.");
  }
  const parsedProgramdata = parseUpgradeableProgramDataAccountData(
    programdataAccount.data,
  );
  if (parsedProgramdata.slot !== String(rollout.programdataSlot)) {
    throw new Error(
      "Solana ProgramData slot does not match manifest rollout material.",
    );
  }
  if (parsedProgramdata.executableHash !== rollout.verifierCodeHash) {
    throw new Error(
      "Solana live ProgramData executable hash does not match manifest verifierCodeHash.",
    );
  }
  const liveDeploymentEvidence = {
    verifierProgramAddress: deployment.verifierProgramAddress,
    programdataAddress: rollout.programdataAddress,
    programdataSlot: parsedProgramdata.slot,
    verifierCodeHash: parsedProgramdata.executableHash,
    programdataMetadataHash: parsedProgramdata.metadataHash,
    executableLength: parsedProgramdata.executableLength,
    programContextSlot: programAccount.contextSlot,
    programdataContextSlot: programdataAccount.contextSlot,
  };
  const destinationAdmission =
    readFirstRecord(
      manifest,
      "destinationProofAdmission",
      "destination_proof_admission",
    ) ?? {};
  const destinationRollout = readDestinationRollout(manifest) ?? {};
  const nativeVerifierProgramdataAddress = normalizeSolanaAddress(
    readFirstString(
      manifest,
      "solanaNativeVerifierProgramdataAddress",
      "solana_native_verifier_programdata_address",
      "nativeVerifierProgramdataAddress",
      "native_verifier_programdata_address",
    ) ||
      readFirstString(
        destinationAdmission,
        "nativeVerifierProgramdataAddress",
        "native_verifier_programdata_address",
      ) ||
      readFirstString(
        destinationRollout,
        "nativeVerifierProgramdataAddress",
        "native_verifier_programdata_address",
      ),
    "Solana native verifier ProgramData address",
  );
  const nativeVerifierProgramdataSlot =
    readFirstString(
      manifest,
      "solanaNativeVerifierProgramdataSlot",
      "solana_native_verifier_programdata_slot",
      "nativeVerifierProgramdataSlot",
      "native_verifier_programdata_slot",
    ) ||
    readFirstString(
      destinationAdmission,
      "nativeVerifierProgramdataSlot",
      "native_verifier_programdata_slot",
    ) ||
    readFirstString(
      destinationRollout,
      "nativeVerifierProgramdataSlot",
      "native_verifier_programdata_slot",
    );
  if (!/^[1-9][0-9]*$/u.test(nativeVerifierProgramdataSlot)) {
    throw new Error(
      "Solana native verifier ProgramData slot must be a positive finalized slot pin.",
    );
  }
  const nativeVerifierCodeHash = normalizeHex32(
    readFirstString(
      manifest,
      "solanaNativeVerifierCodeHash",
      "solana_native_verifier_code_hash",
      "nativeVerifierCodeHash",
      "native_verifier_code_hash",
    ) ||
      readFirstString(
        destinationAdmission,
        "nativeVerifierCodeHash",
        "native_verifier_code_hash",
      ) ||
      readFirstString(
        destinationRollout,
        "nativeVerifierCodeHash",
        "native_verifier_code_hash",
      ),
    "Solana native verifier code hash",
  );
  const nativeVerifier = await readImmutableUpgradeableProgramEvidence(
    rpcUrl,
    deployment.nativeVerifierProgramAddress,
    "Solana native verifier program",
    fetchOptions,
  );
  if (nativeVerifier.programdataAddress !== nativeVerifierProgramdataAddress) {
    throw new Error(
      "Solana native verifier ProgramData address does not match manifest material.",
    );
  }
  if (nativeVerifier.programdataSlot !== nativeVerifierProgramdataSlot) {
    throw new Error(
      "Solana native verifier ProgramData slot does not match manifest material.",
    );
  }
  if (nativeVerifier.programCodeHash !== nativeVerifierCodeHash) {
    throw new Error(
      "Solana native verifier executable hash does not match manifest material.",
    );
  }
  return {
    ...liveDeploymentEvidence,
    immutable: true,
    upgradeAuthority: null,
    verifier: {
      role: "verifier",
      programAddress: deployment.verifierProgramAddress,
      programdataAddress: rollout.programdataAddress,
      immutable: true,
      upgradeAuthority: null,
      programdataSlot: parsedProgramdata.slot,
      programCodeHash: parsedProgramdata.executableHash,
      programdataMetadataHash: parsedProgramdata.metadataHash,
      executableLength: parsedProgramdata.executableLength,
      programContextSlot: programAccount.contextSlot,
      programdataContextSlot: programdataAccount.contextSlot,
    },
    nativeVerifier: { role: "nativeVerifier", ...nativeVerifier },
    embeddedEvidence: checkEmbeddedVerifierLiveEvidence(
      manifest,
      liveDeploymentEvidence,
    ),
  };
};

const checkLiveSolanaTokenAndState = async (
  manifest,
  rpcUrl,
  fetchOptions = {},
) => {
  const deployment = checkDeploymentAddresses(manifest);
  const manifestMintAuthority = readSolanaMintAuthorityAddress(manifest);
  const expectedMintAuthority = deriveSccpSolanaMintAuthority(
    deployment.verifierProgramAddress,
    deployment.verifierStateAddress,
  );
  if (
    manifestMintAuthority &&
    normalizeSolanaAddress(manifestMintAuthority, "Solana mint authority") !==
      expectedMintAuthority
  ) {
    throw new Error(
      "Solana manifest mint authority does not match verifier PDA.",
    );
  }
  const mintAccount = await fetchSolanaBase64Account(
    rpcUrl,
    deployment.tokenMintAddress,
    "Solana TairaXOR token mint",
    fetchOptions,
  );
  if (mintAccount.owner !== SOLANA_SPL_TOKEN_PROGRAM_ID) {
    throw new Error("Solana TairaXOR mint is not owned by SPL Token.");
  }
  const mint = parseSplTokenMintAccountData(mintAccount.data);
  if (!mint.initialized) {
    throw new Error("Solana TairaXOR mint is not initialized.");
  }
  if (mint.decimals !== SCCP_SOLANA_TOKEN_DECIMALS) {
    throw new Error(
      `Solana TairaXOR mint decimals must be ${SCCP_SOLANA_TOKEN_DECIMALS}.`,
    );
  }
  if (mint.mintAuthority !== expectedMintAuthority) {
    throw new Error("Solana TairaXOR mint authority is not the verifier PDA.");
  }
  const stateAccount = await fetchSolanaBase64Account(
    rpcUrl,
    deployment.verifierStateAddress,
    "Solana SCCP verifier state",
    fetchOptions,
  );
  if (stateAccount.owner !== deployment.verifierProgramAddress) {
    throw new Error(
      "Solana SCCP verifier state owner does not match verifier program.",
    );
  }
  const state = parseSccpSolanaVerifierStateData(stateAccount.data);
  if (state.storedMint !== deployment.tokenMintAddress) {
    throw new Error(
      "Solana SCCP verifier state stored mint does not match manifest.",
    );
  }
  const sourceStateAccount = await fetchSolanaBase64Account(
    rpcUrl,
    deployment.sourceStateAddress,
    "Solana SCCP source bridge state",
    fetchOptions,
  );
  if (sourceStateAccount.owner !== deployment.sourceBridgeProgramAddress) {
    throw new Error(
      "Solana SCCP source state owner does not match source bridge program.",
    );
  }
  const sourceState = parseSccpSolanaVerifierStateData(sourceStateAccount.data);
  if (sourceState.storedMint !== deployment.tokenMintAddress) {
    throw new Error(
      "Solana SCCP source state stored mint does not match manifest.",
    );
  }
  return {
    tokenMintAddress: deployment.tokenMintAddress,
    verifierStateAddress: deployment.verifierStateAddress,
    sourceStateAddress: deployment.sourceStateAddress,
    mintAuthority: mint.mintAuthority,
    expectedMintAuthority,
    mintSupply: mint.supply,
    mintDecimals: mint.decimals,
    freezeAuthority: mint.freezeAuthority,
    stateStoredMint: state.storedMint,
    stateAcceptedCount: state.acceptedCount,
    stateTotalMinted: state.totalMinted,
    stateTotalBurned: state.totalBurned,
    sourceStateStoredMint: sourceState.storedMint,
    sourceStateAcceptedCount: sourceState.acceptedCount,
    sourceStateTotalMinted: sourceState.totalMinted,
    sourceStateTotalBurned: sourceState.totalBurned,
    mintContextSlot: mintAccount.contextSlot,
    stateContextSlot: stateAccount.contextSlot,
    sourceStateContextSlot: sourceStateAccount.contextSlot,
  };
};

export async function readImmutableUpgradeableProgramEvidence(
  rpcUrl,
  address,
  label,
  fetchOptions = {},
) {
  const programAccount = await fetchSolanaBase64Account(
    rpcUrl,
    address,
    label,
    fetchOptions,
  );
  if (programAccount.owner !== SOLANA_UPGRADEABLE_LOADER_ID) {
    throw new Error(`${label} owner is not the upgradeable loader.`);
  }
  if (programAccount.executable !== true) {
    throw new Error(`${label} account is not executable.`);
  }
  const parsedProgram = parseUpgradeableProgramAccountData(programAccount.data);
  const programdataAccount = await fetchSolanaBase64Account(
    rpcUrl,
    parsedProgram.programdataAddress,
    `${label} ProgramData`,
    fetchOptions,
  );
  if (programdataAccount.owner !== SOLANA_UPGRADEABLE_LOADER_ID) {
    throw new Error(
      `${label} ProgramData owner is not the upgradeable loader.`,
    );
  }
  const parsedProgramdata = parseUpgradeableProgramDataAccountData(
    programdataAccount.data,
  );
  return {
    programAddress: address,
    programdataAddress: parsedProgram.programdataAddress,
    immutable: true,
    upgradeAuthority: null,
    programdataSlot: parsedProgramdata.slot,
    programCodeHash: parsedProgramdata.executableHash,
    programdataMetadataHash: parsedProgramdata.metadataHash,
    executableLength: parsedProgramdata.executableLength,
    programContextSlot: programAccount.contextSlot,
    programdataContextSlot: programdataAccount.contextSlot,
  };
}

const solanaBridgeProgramManifestPins = (manifest, role) => {
  const source = role === "sourceBridge";
  const label = source ? "Solana source bridge" : "Solana destination bridge";
  const programAddress = normalizeSolanaAddress(
    source
      ? readRequiredConsistentString(
          manifest,
          [
            "sccpSolanaSourceBridgeAddress",
            "sccp_solana_source_bridge_address",
            "solanaSourceBridgeAddress",
            "solana_source_bridge_address",
            "solanaSourceBridgeProgramId",
            "solana_source_bridge_program_id",
            "sourceBridgeProgramId",
            "source_bridge_program_id",
            "sourceBridgeAddress",
            "source_bridge_address",
          ],
          `${label} program address`,
        )
      : readRequiredConsistentString(
          manifest,
          [
            "taira_xor_bridge_address",
            "tairaXorSolanaProgramId",
            "taira_xor_solana_program_id",
            "solanaProgramId",
            "solana_program_id",
            "solanaBridgeProgramId",
            "solana_bridge_program_id",
            "bridgeProgramId",
            "bridge_program_id",
            "bridgeAddress",
            "bridge_address",
            "destinationBridgeAddress",
            "destination_bridge_address",
            "programId",
            "program_id",
          ],
          `${label} program address`,
        ),
    `${label} program address`,
  );
  const programdataAddress = normalizeSolanaAddress(
    readRequiredConsistentString(
      manifest,
      source
        ? [
            "solanaSourceBridgeProgramdataAddress",
            "solana_source_bridge_programdata_address",
          ]
        : [
            "solanaBridgeProgramdataAddress",
            "solana_bridge_programdata_address",
          ],
      `${label} ProgramData address`,
    ),
    `${label} ProgramData address`,
  );
  const programdataSlot = readRequiredConsistentString(
    manifest,
    source
      ? [
          "solanaSourceBridgeProgramdataSlot",
          "solana_source_bridge_programdata_slot",
        ]
      : ["solanaBridgeProgramdataSlot", "solana_bridge_programdata_slot"],
    `${label} ProgramData slot`,
  );
  if (!/^[1-9][0-9]*$/u.test(programdataSlot)) {
    throw new Error(`${label} ProgramData slot must be a positive slot pin.`);
  }
  const codeHash = normalizeHex32(
    readRequiredConsistentString(
      manifest,
      source
        ? ["solanaSourceBridgeCodeHash", "solana_source_bridge_code_hash"]
        : ["solanaBridgeCodeHash", "solana_bridge_code_hash"],
      `${label} code hash`,
    ),
    `${label} code hash`,
  );
  return {
    role,
    label,
    programAddress,
    programdataAddress,
    programdataSlot,
    codeHash,
  };
};

export const checkLiveSolanaBridgeProgramPins = (manifest, role, evidence) => {
  if (role !== "destinationBridge" && role !== "sourceBridge") {
    throw new Error("Solana bridge live-pin role is invalid.");
  }
  const pins = solanaBridgeProgramManifestPins(manifest, role);
  if (!isRecord(evidence) || evidence.immutable !== true) {
    throw new Error(`${pins.label} must have fresh immutable live evidence.`);
  }
  for (const [field, value, expected] of [
    ["program address", evidence.programAddress, pins.programAddress],
    [
      "ProgramData address",
      evidence.programdataAddress,
      pins.programdataAddress,
    ],
    ["ProgramData slot", evidence.programdataSlot, pins.programdataSlot],
    ["executable code hash", evidence.programCodeHash, pins.codeHash],
  ]) {
    if (value !== expected) {
      throw new Error(
        `${pins.label} live ${field} does not match exact manifest governance pins.`,
      );
    }
  }
  for (const [field, value] of [
    ["program context slot", evidence.programContextSlot],
    ["ProgramData context slot", evidence.programdataContextSlot],
  ]) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new Error(`${pins.label} live ${field} is missing or invalid.`);
    }
  }
  return {
    role,
    programAddress: pins.programAddress,
    programdataAddress: pins.programdataAddress,
    programdataSlot: pins.programdataSlot,
    programCodeHash: pins.codeHash,
    immutable: true,
  };
};

export const checkLiveSolanaBridgePrograms = async (
  manifest,
  rpcUrl,
  fetchOptions = {},
) => {
  const deployment = checkDeploymentAddresses(manifest);
  const bridge = await readImmutableUpgradeableProgramEvidence(
    rpcUrl,
    deployment.bridgeProgramAddress,
    "Solana bridge program",
    fetchOptions,
  );
  const sourceBridge = await readImmutableUpgradeableProgramEvidence(
    rpcUrl,
    deployment.sourceBridgeProgramAddress,
    "Solana source bridge program",
    fetchOptions,
  );
  const bridgePins = checkLiveSolanaBridgeProgramPins(
    manifest,
    "destinationBridge",
    bridge,
  );
  const sourceBridgePins = checkLiveSolanaBridgeProgramPins(
    manifest,
    "sourceBridge",
    sourceBridge,
  );
  return {
    bridge: { role: "bridge", governancePins: bridgePins, ...bridge },
    sourceBridge: {
      role: "sourceBridge",
      governancePins: sourceBridgePins,
      ...sourceBridge,
    },
  };
};

export const checkProverModules = (manifest) => {
  const destinationProverKeys = [
    "destinationBrowserProver",
    "destination_browser_prover",
    "browserDestinationProver",
    "browser_destination_prover",
    "solanaDestinationBrowserProver",
    "solana_destination_browser_prover",
  ];
  const sourceProverKeys = [
    "sourceBrowserProver",
    "source_browser_prover",
    "browserSourceProver",
    "browser_source_prover",
    "solanaSourceBrowserProver",
    "solana_source_browser_prover",
  ];
  const destinationModuleUrl = readConsistentBrowserProverField(
    manifest,
    destinationProverKeys,
    ["moduleUrl", "module_url", "url", "href"],
    "Solana destination proof module URL",
    normalizeModuleUrl,
  );
  const destinationModuleHash = readConsistentBrowserProverField(
    manifest,
    destinationProverKeys,
    ["moduleHash", "module_hash"],
    "Solana destination proof module hash",
    normalizeHex32,
  );
  const destinationSidecarHash = readConsistentBrowserProverField(
    manifest,
    destinationProverKeys,
    ["manifestHash", "manifest_hash", "sidecarHash", "sidecar_hash"],
    "Solana destination proof sidecar hash",
    normalizeHex32,
  );
  const destinationProofBackend = readConsistentBrowserProverField(
    manifest,
    destinationProverKeys,
    ["proofBackend", "proof_backend"],
    "Solana destination proof backend",
    normalizeSolanaDestinationProofBackend,
  );
  const destinationRequiredProofBackend = readConsistentBrowserProverField(
    manifest,
    destinationProverKeys,
    ["requiredProofBackend", "required_proof_backend"],
    "Solana destination required proof backend",
    normalizeSolanaDestinationProofBackend,
  );
  const destinationGenesisHash = readConsistentBrowserProverField(
    manifest,
    destinationProverKeys,
    ["genesisHash", "genesis_hash"],
    "Solana destination genesis hash",
    (value, label) => {
      const normalized = trimString(value);
      if (normalized !== SOLANA_TESTNET_GENESIS_HASH) {
        throw new Error(`${label} must be ${SOLANA_TESTNET_GENESIS_HASH}.`);
      }
      return normalized;
    },
  );
  const destinationVerifierPlan = readConsistentBrowserProverField(
    manifest,
    destinationProverKeys,
    ["destinationVerifierPlan", "destination_verifier_plan"],
    "Solana destination verifier plan",
    (value, label) => {
      const normalized = trimString(value);
      if (normalized !== SOLANA_DESTINATION_VERIFIER_PLAN) {
        throw new Error(
          `${label} must be ${SOLANA_DESTINATION_VERIFIER_PLAN}.`,
        );
      }
      return normalized;
    },
  );
  const destinationVerifierTarget = readConsistentBrowserProverField(
    manifest,
    destinationProverKeys,
    ["verifierTarget", "verifier_target"],
    "Solana destination verifier target",
    (value, label) => {
      const normalized = trimString(value);
      if (normalized !== SOLANA_VERIFIER_TARGET) {
        throw new Error(`${label} must be ${SOLANA_VERIFIER_TARGET}.`);
      }
      return normalized;
    },
  );
  const destinationProductionProofsReady = readConsistentBrowserProverField(
    manifest,
    destinationProverKeys,
    ["productionProofsReady", "production_proofs_ready"],
    "Solana destination production proofs ready",
    normalizeRequiredTrue,
  );
  const sourceModuleUrl = readConsistentBrowserProverField(
    manifest,
    sourceProverKeys,
    ["moduleUrl", "module_url", "url", "href"],
    "Solana source proof module URL",
    normalizeModuleUrl,
  );
  const sourceModuleHash = readConsistentBrowserProverField(
    manifest,
    sourceProverKeys,
    ["moduleHash", "module_hash"],
    "Solana source proof module hash",
    normalizeHex32,
  );
  const sourceSidecarHash = readConsistentBrowserProverField(
    manifest,
    sourceProverKeys,
    ["manifestHash", "manifest_hash", "sidecarHash", "sidecar_hash"],
    "Solana source proof sidecar hash",
    normalizeHex32,
  );
  const sourceProofBackend = readConsistentBrowserProverField(
    manifest,
    sourceProverKeys,
    ["proofBackend", "proof_backend"],
    "Solana source proof backend",
    normalizeSolanaSourceProofBackend,
  );
  const sourceRequiredProofBackend = readConsistentBrowserProverField(
    manifest,
    sourceProverKeys,
    ["requiredProofBackend", "required_proof_backend"],
    "Solana source required proof backend",
    normalizeSolanaSourceProofBackend,
  );
  const sourceGenesisHash = readConsistentBrowserProverField(
    manifest,
    sourceProverKeys,
    ["genesisHash", "genesis_hash"],
    "Solana source genesis hash",
    (value, label) => {
      const normalized = trimString(value);
      if (normalized !== SOLANA_TESTNET_GENESIS_HASH) {
        throw new Error(`${label} must be ${SOLANA_TESTNET_GENESIS_HASH}.`);
      }
      return normalized;
    },
  );
  const sourceProductionProofsReady = readConsistentBrowserProverField(
    manifest,
    sourceProverKeys,
    ["productionProofsReady", "production_proofs_ready"],
    "Solana source production proofs ready",
    normalizeRequiredTrue,
  );
  return {
    destinationModuleUrl,
    destinationModuleHash,
    destinationSidecarHash,
    destinationProofBackend,
    destinationRequiredProofBackend,
    destinationGenesisHash,
    destinationVerifierPlan,
    destinationVerifierTarget,
    destinationProductionProofsReady,
    sourceModuleUrl,
    sourceModuleHash,
    sourceSidecarHash,
    sourceProofBackend,
    sourceRequiredProofBackend,
    sourceGenesisHash,
    sourceProductionProofsReady,
  };
};

const readDestinationProofAdmission = (manifest) =>
  readFirstRecord(
    manifest,
    "destinationProofAdmission",
    "destination_proof_admission",
    "solanaDestinationProofAdmission",
    "solana_destination_proof_admission",
    "verifierAdmission",
    "verifier_admission",
  );

const readAdmissionString = (admission, label, keys) => {
  const values = [];
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(admission ?? {}, key)) {
      continue;
    }
    const value = readString(admission, key);
    if (!value) {
      throw new Error(
        `Solana destination proof admission ${label} is missing.`,
      );
    }
    values.push({ key, value });
  }
  if (values.length === 0) {
    throw new Error(`Solana destination proof admission ${label} is missing.`);
  }
  const [{ key: firstKey, value: firstValue }] = values;
  for (const { key, value } of values.slice(1)) {
    if (value !== firstValue) {
      throw new Error(
        `Solana destination proof admission ${label} aliases must agree: ${firstKey}=${firstValue} but ${key}=${value}.`,
      );
    }
  }
  return firstValue;
};

const readAdmissionHex32 = (admission, label, keys) => {
  const values = [];
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(admission ?? {}, key)) {
      continue;
    }
    values.push({
      key,
      value: normalizeHex32(
        admission[key],
        `Solana destination proof admission ${label}`,
      ),
    });
  }
  if (values.length === 0) {
    throw new Error(`Solana destination proof admission ${label} is missing.`);
  }
  const [{ key: firstKey, value: firstValue }] = values;
  for (const { key, value } of values.slice(1)) {
    if (value !== firstValue) {
      throw new Error(
        `Solana destination proof admission ${label} aliases must agree: ${firstKey}=${firstValue} but ${key}=${value}.`,
      );
    }
  }
  return firstValue;
};

const assertAdmissionFlagFalse = (admission, canonical, keys) => {
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(admission ?? {}, key)) {
      continue;
    }
    const value = admission[key];
    const falseValue =
      value === false ||
      (typeof value === "string" && value.trim().toLowerCase() === "false");
    if (!falseValue) {
      throw new Error(
        `Solana destination proof admission ${canonical} must be false for production.`,
      );
    }
  }
};

export const checkDestinationProofAdmission = (manifest) => {
  const admission = readDestinationProofAdmission(manifest);
  if (!admission) {
    throw new Error("Solana destination proof admission material is missing.");
  }
  const admissionMode = readAdmissionString(admission, "admissionMode", [
    "admissionMode",
    "admission_mode",
    "mode",
  ]);
  if (admissionMode !== SOLANA_PRODUCTION_ADMISSION_MODE) {
    throw new Error(
      `Solana destination proof admission mode must be ${SOLANA_PRODUCTION_ADMISSION_MODE}.`,
    );
  }
  const proofSystem = readAdmissionString(admission, "proofSystem", [
    "proofSystem",
    "proof_system",
    "proofFamily",
    "proof_family",
  ]);
  if (proofSystem !== SOLANA_DESTINATION_PROOF_SYSTEM) {
    throw new Error(
      `Solana destination proof admission proof system must be ${SOLANA_DESTINATION_PROOF_SYSTEM}.`,
    );
  }
  const entrypoint = readAdmissionString(admission, "entrypoint", [
    "entrypoint",
    "entry_point",
    "verifierEntrypoint",
    "verifier_entrypoint",
  ]);
  if (entrypoint !== SOLANA_SUBMIT_ENTRYPOINT) {
    throw new Error(
      `Solana destination proof admission entrypoint must be ${SOLANA_SUBMIT_ENTRYPOINT}.`,
    );
  }
  const rollout = checkRolloutMaterial(manifest);
  const admissionHashes = {
    verifierCodeHash: readAdmissionHex32(admission, "verifierCodeHash", [
      "verifierCodeHash",
      "verifier_code_hash",
    ]),
    verifierKeyHash: readAdmissionHex32(admission, "verifierKeyHash", [
      "verifierKeyHash",
      "verifier_key_hash",
    ]),
    destinationBindingHash: readAdmissionHex32(
      admission,
      "destinationBindingHash",
      ["destinationBindingHash", "destination_binding_hash"],
    ),
  };
  for (const [key, expected] of [
    ["verifierCodeHash", rollout.verifierCodeHash],
    ["verifierKeyHash", rollout.verifierKeyHash],
    ["destinationBindingHash", rollout.destinationBindingHash],
  ]) {
    if (admissionHashes[key] !== expected) {
      throw new Error(
        `Solana destination proof admission ${key} does not match route rollout material.`,
      );
    }
  }
  for (const [canonical, aliases] of [
    ["shapeOnly", ["shapeOnly", "shape_only"]],
    ["envelopeOnly", ["envelopeOnly", "envelope_only"]],
    [
      "acceptsUnverifiedProofs",
      ["acceptsUnverifiedProofs", "accepts_unverified_proofs"],
    ],
  ]) {
    assertAdmissionFlagFalse(admission, canonical, aliases);
  }
  return {
    admissionMode,
    proofSystem,
    entrypoint,
    ...admissionHashes,
  };
};

export const checkSourceLaneMaterial = (manifest) => {
  const verifier = readConsistentRecordAlias(
    manifest,
    "sourceVerifierMaterial",
    ["sourceVerifierMaterial", "source_verifier_material"],
  );
  const adapter = readConsistentRecordAlias(
    manifest,
    "sourceAdapterEngineDeployment",
    [
      "sourceAdapterEngineDeployment",
      "source_adapter_engine_deployment",
      "sourceAdapterDeployment",
      "source_adapter_deployment",
    ],
  );
  if (!verifier || !adapter) {
    throw new Error(
      "Solana source verifier material and adapter deployment are required.",
    );
  }
  const problems = [];
  const identities = [];
  for (const [record, label, adapterRecord] of [
    [verifier, "sourceVerifierMaterial", false],
    [adapter, "sourceAdapterEngineDeployment", true],
  ]) {
    try {
      const identity = {
        version: requireExactNumber(record, ["version"], `${label}.version`, 1),
        routeId: requireExactString(
          record,
          ["routeId", "route_id", "route"],
          `${label}.routeId`,
          SCCP_SOLANA_XOR_ROUTE_ID,
        ),
        sourceDomain: requireExactNumber(
          record,
          ["sourceDomain", "source_domain", "domain"],
          `${label}.sourceDomain`,
          SCCP_SOLANA_DOMAIN,
        ),
        targetDomain: requireExactNumber(
          record,
          ["targetDomain", "target_domain"],
          `${label}.targetDomain`,
          SCCP_SORA_DOMAIN,
        ),
        sourceChain: requireExactString(
          record,
          ["sourceChain", "source_chain"],
          `${label}.sourceChain`,
          "sol",
        ),
        solanaNetwork: requireExactString(
          record,
          ["solanaNetwork", "solana_network"],
          `${label}.solanaNetwork`,
          SOLANA_TESTNET_NETWORK_ID,
        ),
        genesisHash: requireExactString(
          record,
          [
            "solanaGenesisHash",
            "solana_genesis_hash",
            "genesisHash",
            "genesis_hash",
          ],
          `${label}.genesisHash`,
          SOLANA_TESTNET_GENESIS_HASH,
        ),
        proofBackend: requireExactString(
          record,
          ["proofBackend", "proof_backend"],
          `${label}.proofBackend`,
          SOLANA_SOURCE_PROOF_BACKEND,
        ),
        sourceProofPlan: requireExactString(
          record,
          ["sourceProofPlan", "source_proof_plan"],
          `${label}.sourceProofPlan`,
          SOLANA_SOURCE_PROOF_PLAN,
        ),
        finalityModel: requireExactString(
          record,
          ["finalityModel", "finality_model"],
          `${label}.finalityModel`,
          SOLANA_SOURCE_FINALITY_MODEL,
        ),
        adapterCircuitId: requireExactString(
          record,
          ["adapterCircuitId", "adapter_circuit_id"],
          `${label}.adapterCircuitId`,
          SOLANA_SOURCE_ADAPTER_CIRCUIT_ID,
        ),
      };
      for (const [canonical, snake, expected] of [
        [
          "sourceTrustAnchorId",
          "source_trust_anchor_id",
          SOLANA_TESTNET_SOURCE_PROFILE.sourceTrustAnchorId,
        ],
        [
          "consensusVerifierId",
          "consensus_verifier_id",
          SOLANA_TESTNET_SOURCE_PROFILE.consensusVerifierId,
        ],
        [
          "messageInclusionVerifierId",
          "message_inclusion_verifier_id",
          SOLANA_TESTNET_SOURCE_PROFILE.messageInclusionVerifierId,
        ],
        [
          "sourceStateVerifierId",
          "source_state_verifier_id",
          SOLANA_TESTNET_SOURCE_PROFILE.sourceStateVerifierId,
        ],
        [
          "finalityPolicyId",
          "finality_policy_id",
          SOLANA_TESTNET_SOURCE_PROFILE.finalityPolicyId,
        ],
      ]) {
        identity[canonical] = requireExactString(
          record,
          [canonical, snake],
          `${label}.${canonical}`,
          expected,
        );
      }
      if (adapterRecord) {
        identity.adapterProofFamily = requireExactString(
          record,
          ["adapterProofFamily", "adapter_proof_family"],
          `${label}.adapterProofFamily`,
          SOLANA_SOURCE_ADAPTER_PROOF_FAMILY,
        );
      }
      identities.push(identity);
    } catch (error) {
      problems.push(error instanceof Error ? error.message : String(error));
    }
    try {
      assertSourceMaterialFlagFalse(record, label, "placeholderMaterial", [
        "placeholderMaterial",
        "placeholder_material",
      ]);
    } catch (error) {
      problems.push(error instanceof Error ? error.message : String(error));
    }
    try {
      rejectTruthySourceMaterialFlag(record, label, "templateOnly", [
        "templateOnly",
        "template_only",
      ]);
    } catch (error) {
      problems.push(error instanceof Error ? error.message : String(error));
    }
    if (
      sourceMaterialTextIsPresent(record, ["disabledReason", "disabled_reason"])
    ) {
      problems.push(`${label}.disabledReason must be absent`);
    }
    const missing = requireHashFields(record, label, [
      ["sourceTrustAnchorHash", "source_trust_anchor_hash"],
      ["consensusVerifierHash", "consensus_verifier_hash"],
      ["messageInclusionVerifierHash", "message_inclusion_verifier_hash"],
      ["finalityPolicyHash", "finality_policy_hash"],
      ["sourceStateVerifierHash", "source_state_verifier_hash"],
    ]);
    if (missing.length > 0) {
      problems.push(`${missing.join(", ")} missing`);
    }
  }
  const adapterMissing = requireHashFields(
    adapter,
    "sourceAdapterEngineDeployment",
    [
      ["adapterVerifierVkHash", "adapter_verifier_vk_hash"],
      ["deploymentReceiptHash", "deployment_receipt_hash"],
    ],
  );
  if (adapterMissing.length > 0) {
    problems.push(`${adapterMissing.join(", ")} missing`);
  }
  if (problems.length > 0) {
    throw new Error(`${problems.join("; ")}.`);
  }
  return {
    verifier,
    adapter,
    verifierIdentity: identities[0],
    adapterIdentity: identities[1],
  };
};

const checkBurnRecordMaterial = (manifest) => {
  const material = readBurnRecordMaterial(manifest);
  if (
    !isCanonicalTairaAssetDefinitionId(material.settlementAssetDefinitionId)
  ) {
    throw new Error(
      "TAIRA settlement asset must be a canonical asset definition id.",
    );
  }
  let artifactLength = 0;
  try {
    artifactLength = Buffer.from(material.artifactB64, "base64").length;
  } catch (_error) {
    artifactLength = 0;
  }
  if (artifactLength < 32) {
    throw new Error(
      "TAIRA burn-record contract artifact is missing or too small.",
    );
  }
  if (!isRecord(material.vkRef)) {
    throw new Error("TAIRA burn-record VK reference is missing.");
  }
  return {
    settlementAssetDefinitionId: material.settlementAssetDefinitionId,
    artifactLength,
    vkRef: material.vkRef,
  };
};

const checkPostDeployLiveEvidence = (manifest) => {
  const evidence =
    readFirstRecord(manifest, "postDeployLiveEvidence") ||
    readFirstRecord(manifest, "post_deploy_live_evidence");
  if (!evidence) {
    throw new Error("Solana post-deploy live evidence is missing.");
  }
  if (evidence.fullTomlReady !== true && evidence.full_toml_ready !== true) {
    throw new Error("postDeployLiveEvidence.fullTomlReady must be true.");
  }
  const sourceBridgeConfigHash = normalizeHex32(
    readFirstString(
      evidence,
      "sourceBridgeConfigHash",
      "source_bridge_config_hash",
    ),
    "postDeployLiveEvidence.sourceBridgeConfigHash",
  );
  const routeCanaryEvidenceHash = normalizeHex32(
    readFirstString(
      evidence,
      "routeCanaryEvidenceHash",
      "route_canary_evidence_hash",
    ),
    "postDeployLiveEvidence.routeCanaryEvidenceHash",
  );
  const offlineFullTomlSha256 = normalizeHex32(
    readFirstString(
      evidence,
      "offlineFullTomlSha256",
      "offline_full_toml_sha256",
    ),
    "postDeployLiveEvidence.offlineFullTomlSha256",
  );
  const sourceEventSignature = normalizeSolanaSignature(
    readFirstString(
      evidence,
      "sourceEventTransactionSignature",
      "source_event_transaction_signature",
      "sourceEventSignature",
      "source_event_signature",
      "sourceEventTransactionId",
      "source_event_transaction_id",
    ),
    "postDeployLiveEvidence.sourceEventTransactionSignature",
  );
  const routeCanarySignature = normalizeSolanaSignature(
    readFirstString(
      evidence,
      "routeCanaryTransactionSignature",
      "route_canary_transaction_signature",
      "routeCanarySignature",
      "route_canary_signature",
      "routeCanaryTransactionId",
      "route_canary_transaction_id",
    ),
    "postDeployLiveEvidence.routeCanaryTransactionSignature",
  );
  if (sourceEventSignature === routeCanarySignature) {
    throw new Error(
      "source event and route canary signatures must be distinct.",
    );
  }
  return {
    sourceBridgeConfigHash,
    routeCanaryEvidenceHash,
    offlineFullTomlSha256,
    sourceEventSignature,
    routeCanarySignature,
  };
};

export const checkSolanaRpc = async (rpcUrl, fetchOptions = {}) => {
  const health = await fetchSolanaRpc(rpcUrl, "getHealth", [], fetchOptions);
  if (health !== "ok") {
    throw new Error(
      `Solana testnet RPC health is not ok: ${JSON.stringify(health)}`,
    );
  }
  const genesisHash = await fetchSolanaRpc(
    rpcUrl,
    "getGenesisHash",
    [],
    fetchOptions,
  );
  if (genesisHash !== SOLANA_TESTNET_GENESIS_HASH) {
    throw new Error(
      `Solana RPC genesis hash must be ${SOLANA_TESTNET_GENESIS_HASH}.`,
    );
  }
  return { result: health, genesisHash };
};

export const readBooleanArg = (value) => value === true || value === "true";

export const parseArgs = (argv) =>
  parseStrictCliArgs(argv, {
    booleanFlags: ["help"],
    optionalBooleanFlags: ["skip-solana-rpc", "allow-incomplete"],
    valueFlags: [
      "torii-url",
      "solana-rpc-url",
      "manifest-file",
      "output-dir",
      "fetch-timeout-ms",
      "fetch-attempts",
    ],
  });

const usage = () => {
  console.log(`Usage: node scripts/e2e/sccp-solana-route-preflight.mjs [options]

Read-only TAIRA/Solana testnet SCCP route preflight for taira_sol_xor.

Options:
  --torii-url URL        TAIRA Torii endpoint (default: ${DEFAULT_TAIRA_TORII_URL})
  --solana-rpc-url URL   Solana testnet RPC endpoint (default: ${DEFAULT_SOLANA_TESTNET_RPC_URL})
  --manifest-file PATH   Validate a local manifest set instead of public TAIRA publication
  --output-dir PATH      Report directory (default: output/sccp-solana-preflight)
  --fetch-timeout-ms MS  Per-request fetch timeout for TAIRA/Solana reads
  --fetch-attempts N     Per-request retry attempts for TAIRA/Solana reads
  --skip-solana-rpc [true|false]
                         Skip Solana RPC health/readback checks
  --allow-incomplete [true|false]
                         Write the blocked report and exit 0 during rollout
  --help                 Show this help
`);
};

export const runSccpSolanaRoutePreflight = async (options = {}) => {
  const toriiUrl = normalizeToriiEndpoint(options.toriiUrl);
  const solanaRpcUrl = normalizeSolanaRpcEndpoint(options.solanaRpcUrl);
  const manifestFile = trimString(options.manifestFile);
  const outputDir = path.resolve(options.outputDir || DEFAULT_OUTPUT_DIR);
  const fetchOptions = preflightFetchOptions(options);
  const checks = [];

  let capabilities = null;
  let manifestSet = null;
  let manifestSource = "public";
  let capabilitiesError = null;
  let manifestError = null;

  pushCheck(checks, "taira-endpoint", () => ({ toriiUrl }));

  try {
    capabilities = await fetchToriiJson(
      toriiUrl,
      "/v1/sccp/capabilities",
      fetchOptions,
    );
    pushCheck(checks, "sccp-capabilities-load", () => ({ loaded: true }));
    pushCheck(checks, "sccp-submit-capabilities", () =>
      checkCapabilities(capabilities),
    );
  } catch (error) {
    capabilitiesError = error instanceof Error ? error.message : String(error);
    checks.push(makeCheck("sccp-capabilities-load", false, capabilitiesError));
    checks.push(
      makeCheck(
        "sccp-submit-capabilities",
        false,
        `Cannot validate SCCP submit capabilities because capabilities load failed: ${capabilitiesError}`,
      ),
    );
  }

  try {
    if (manifestFile) {
      manifestSource = "file";
      manifestSet = await readStableJsonFile(path.resolve(manifestFile), {
        label: "Solana route manifest file",
      });
    } else {
      manifestSet = await fetchToriiJson(
        toriiUrl,
        "/v1/sccp/manifests",
        fetchOptions,
      );
    }
    pushCheck(checks, "sccp-manifest-load", () => ({
      source: manifestSource,
      recordCount: manifestRecords(manifestSet).length,
    }));
  } catch (error) {
    manifestError = error instanceof Error ? error.message : String(error);
    checks.push(makeCheck("sccp-manifest-load", false, manifestError));
  }

  let solanaCapability = null;
  let solanaCapabilitySelectionError = null;
  let manifest = null;
  let routeSelectionError = null;
  let solanaLaneManifest = null;
  let laneSelectionError = null;
  if (capabilities) {
    try {
      solanaCapability = pickSolanaCapability(capabilities);
    } catch (error) {
      solanaCapabilitySelectionError =
        error instanceof Error ? error.message : String(error);
    }
  }
  if (manifestSet) {
    try {
      manifest = pickSolanaRouteManifest(manifestSet);
    } catch (error) {
      routeSelectionError =
        error instanceof Error ? error.message : String(error);
    }
    try {
      solanaLaneManifest = pickSolanaLaneManifest(manifestSet);
    } catch (error) {
      laneSelectionError =
        error instanceof Error ? error.message : String(error);
    }
  }
  const publicSolanaLaneEvidence =
    solanaLaneManifest ?? (!laneSelectionError ? solanaCapability : null);
  pushCheck(checks, "solana-capability-publication", () => {
    if (!capabilities && capabilitiesError) {
      throw new Error(
        `Cannot determine Solana SCCP capability lane because capabilities load failed: ${capabilitiesError}`,
      );
    }
    if (!solanaCapability) {
      if (solanaCapabilitySelectionError) {
        throw new Error(
          `Solana SCCP capability selection failed: ${solanaCapabilitySelectionError}`,
        );
      }
      throw new Error("No Solana SCCP capability lane found.");
    }
    return summarizeSolanaLaneManifest(solanaCapability);
  });
  pushCheck(checks, "public-route-publication", () => {
    if (manifestSource === "public" && !manifestSet && manifestError) {
      throw new Error(
        `Public TAIRA route publication cannot be proven because manifest load failed: ${manifestError}`,
      );
    }
    if (manifestSource !== "public") {
      throw new Error(
        "Local manifest-file preflight is local evidence only; public TAIRA route publication is not proven.",
      );
    }
    return { source: manifestSource };
  });
  if (laneSelectionError) {
    checks.push(
      makeCheck(
        "solana-lane-publication",
        false,
        `Solana lane manifest selection failed: ${laneSelectionError}`,
      ),
    );
  } else if (
    !publicSolanaLaneEvidence &&
    (capabilitiesError || manifestError || solanaCapabilitySelectionError)
  ) {
    const unavailableReasons = [
      capabilitiesError ? `capabilities load failed: ${capabilitiesError}` : "",
      manifestError ? `manifest load failed: ${manifestError}` : "",
      solanaCapabilitySelectionError
        ? `capability selection failed: ${solanaCapabilitySelectionError}`
        : "",
    ]
      .filter(Boolean)
      .join("; ");
    checks.push(
      makeCheck(
        "solana-lane-publication",
        false,
        `Cannot determine public Solana SCCP lane because ${unavailableReasons}.`,
      ),
    );
  } else {
    try {
      checks.push(checkSolanaLanePublication(publicSolanaLaneEvidence));
    } catch (error) {
      checks.push(
        makeCheck(
          "solana-lane-publication",
          false,
          error instanceof Error ? error.message : String(error),
        ),
      );
    }
  }
  if (routeSelectionError) {
    checks.push(
      makeCheck(
        "solana-route-instance-publication",
        false,
        `taira_sol_xor route selection failed: ${routeSelectionError}`,
        {
          expectedRouteId: SCCP_SOLANA_XOR_ROUTE_ID,
          expectedAssetKey: SCCP_XOR_ASSET_KEY,
        },
      ),
    );
  } else if (!manifest && manifestError) {
    checks.push(
      makeCheck(
        "solana-route-instance-publication",
        false,
        `Cannot determine taira_sol_xor Solana route publication because manifest load failed: ${manifestError}`,
        {
          expectedRouteId: SCCP_SOLANA_XOR_ROUTE_ID,
          expectedAssetKey: SCCP_XOR_ASSET_KEY,
        },
      ),
    );
  } else {
    try {
      checks.push(
        checkSolanaRouteInstancePublication(manifest, solanaLaneManifest),
      );
    } catch (error) {
      checks.push(
        makeCheck(
          "solana-route-instance-publication",
          false,
          error instanceof Error ? error.message : String(error),
          {
            expectedRouteId: SCCP_SOLANA_XOR_ROUTE_ID,
            expectedAssetKey: SCCP_XOR_ASSET_KEY,
          },
        ),
      );
    }
  }
  pushCheck(checks, "route-manifest-shape", () => {
    if (routeSelectionError) {
      throw new Error(
        `Cannot validate taira_sol_xor Solana route manifest shape because route selection failed: ${routeSelectionError}`,
      );
    }
    if (!manifest && manifestError) {
      throw new Error(
        `Cannot validate taira_sol_xor Solana route manifest shape because manifest load failed: ${manifestError}`,
      );
    }
    return checkManifestShape(manifest);
  });
  pushCheck(checks, "production-ready-flag", () => {
    if (routeSelectionError) {
      throw new Error(
        `Cannot validate taira_sol_xor Solana production flag because route selection failed: ${routeSelectionError}`,
      );
    }
    if (!manifest && manifestError) {
      throw new Error(
        `Cannot validate taira_sol_xor Solana production flag because manifest load failed: ${manifestError}`,
      );
    }
    return checkProductionReadyFlag(manifest);
  });
  pushCheck(checks, "browser-proof-modules", () => {
    if (routeSelectionError) {
      throw new Error(
        `Cannot validate Solana browser proof modules because route selection failed: ${routeSelectionError}`,
      );
    }
    if (!manifest && manifestError) {
      throw new Error(
        `Cannot validate Solana browser proof modules because manifest load failed: ${manifestError}`,
      );
    }
    if (!manifest) {
      throw new Error(
        "Cannot validate Solana browser proof modules because no taira_sol_xor Solana route manifest is published.",
      );
    }
    return checkProverModules(manifest);
  });
  if (manifest) {
    pushCheck(checks, "solana-deployment-addresses", () =>
      checkDeploymentAddresses(manifest),
    );
    pushCheck(checks, "solana-rollout-material", () =>
      checkRolloutMaterial(manifest),
    );
    pushCheck(checks, "destination-proof-admission", () =>
      checkDestinationProofAdmission(manifest),
    );
    pushCheck(checks, "source-lane-material", () =>
      checkSourceLaneMaterial(manifest),
    );
    pushCheck(checks, "taira-burn-record-material", () =>
      checkBurnRecordMaterial(manifest),
    );
    pushCheck(checks, "post-deploy-live-evidence", () =>
      checkPostDeployLiveEvidence(manifest),
    );
  }

  if (!options.skipSolanaRpc) {
    if (manifest) {
      try {
        checks.push(
          makeCheck(
            "solana-live-programdata-evidence",
            true,
            "ok",
            await checkLiveSolanaDeployment(
              manifest,
              solanaRpcUrl,
              fetchOptions,
            ),
          ),
        );
      } catch (error) {
        checks.push(
          makeCheck(
            "solana-live-programdata-evidence",
            false,
            error instanceof Error ? error.message : String(error),
          ),
        );
      }
      try {
        checks.push(
          makeCheck(
            "solana-live-token-state-evidence",
            true,
            "ok",
            await checkLiveSolanaTokenAndState(
              manifest,
              solanaRpcUrl,
              fetchOptions,
            ),
          ),
        );
      } catch (error) {
        checks.push(
          makeCheck(
            "solana-live-token-state-evidence",
            false,
            error instanceof Error ? error.message : String(error),
          ),
        );
      }
      try {
        checks.push(
          makeCheck(
            "solana-live-bridge-source-evidence",
            true,
            "ok",
            await checkLiveSolanaBridgePrograms(
              manifest,
              solanaRpcUrl,
              fetchOptions,
            ),
          ),
        );
      } catch (error) {
        checks.push(
          makeCheck(
            "solana-live-bridge-source-evidence",
            false,
            error instanceof Error ? error.message : String(error),
          ),
        );
      }
    }
    try {
      const evidence = await checkSolanaRpc(solanaRpcUrl, fetchOptions);
      checks.push(makeCheck("solana-testnet-rpc-health", true, "ok", evidence));
    } catch (error) {
      checks.push(
        makeCheck(
          "solana-testnet-rpc-health",
          false,
          error instanceof Error ? error.message : String(error),
        ),
      );
    }
  }

  const summarizeRecordForReport = (record, label) => {
    if (!record) {
      return null;
    }
    try {
      return summarizeSolanaLaneManifest(record);
    } catch (error) {
      return {
        invalid: true,
        error: `${label} summary rejected: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  };

  const failedCheckIds = [
    ...new Set(
      checks
        .filter((check) => check.status !== "pass")
        .map((check) => check.id)
        .filter(Boolean),
    ),
  ];
  const ready = failedCheckIds.length === 0;
  const report = {
    schema: "iroha-demo-sccp-solana-route-preflight/v1",
    ready,
    failedCheckIds,
    blockerIds: failedCheckIds,
    routeId: SCCP_SOLANA_XOR_ROUTE_ID,
    assetKey: SCCP_XOR_ASSET_KEY,
    taira: {
      toriiUrl,
      chainId: TAIRA_CHAIN_ID,
      networkPrefix: TAIRA_NETWORK_PREFIX,
    },
    solana: {
      network: SOLANA_TESTNET_NETWORK_ID,
      caipChainId: SOLANA_TESTNET_CAIP_CHAIN_ID,
      genesisHash: SOLANA_TESTNET_GENESIS_HASH,
      rpcUrl: solanaRpcUrl,
    },
    manifestSource,
    publicSolanaCapability: summarizeRecordForReport(
      solanaCapability,
      "Solana capability",
    ),
    publicSolanaLaneManifest: summarizeRecordForReport(
      solanaLaneManifest,
      "Solana lane manifest",
    ),
    publicSolanaLane: summarizeRecordForReport(
      publicSolanaLaneEvidence,
      "Solana lane evidence",
    ),
    recordSelectionErrors: {
      capability: solanaCapabilitySelectionError,
      lane: laneSelectionError,
      route: routeSelectionError,
    },
    checkedAt: new Date().toISOString(),
    checks,
    deployment: manifest
      ? {
          bridgeProgramAddress: readSolanaProgramAddress(manifest),
          tokenMintAddress: readSolanaTokenMint(manifest),
          sourceBridgeProgramAddress: readSolanaSourceBridgeAddress(manifest),
          verifierProgramAddress: readSolanaVerifierAddress(manifest),
          nativeVerifierProgramAddress:
            readSolanaNativeVerifierAddress(manifest),
          verifierStateAddress: readSolanaVerifierStateAddress(manifest),
          mintAuthorityAddress: readSolanaMintAuthorityAddress(manifest),
          verifierCodeHash: readFirstString(
            manifest,
            "verifierCodeHash",
            "verifier_code_hash",
          ),
          programdataAddress: readFirstString(
            manifest,
            "solanaProgramdataAddress",
            "solana_programdata_address",
          ),
        }
      : null,
  };

  const reportPath = path.join(outputDir, "sccp-solana-route-preflight.json");
  await writeAtomicJsonFile(reportPath, report);
  return { report, reportPath };
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }
  const { report, reportPath } = await runSccpSolanaRoutePreflight({
    toriiUrl: args["torii-url"] || process.env.TAIRA_TORII_URL,
    solanaRpcUrl:
      args["solana-rpc-url"] || process.env.SCCP_SOLANA_TESTNET_RPC_URL,
    manifestFile: args["manifest-file"],
    outputDir: args["output-dir"],
    fetchTimeoutMs: args["fetch-timeout-ms"],
    fetchAttempts: args["fetch-attempts"],
    skipSolanaRpc: readBooleanArg(args["skip-solana-rpc"]),
  });
  console.log(`Solana SCCP route preflight report: ${reportPath}`);
  if (!report.ready) {
    console.error(
      report.checks
        .filter((check) => check.status !== "pass")
        .map((check) => `- ${check.id}: ${check.detail}`)
        .join("\n"),
    );
    if (!readBooleanArg(args["allow-incomplete"])) {
      process.exitCode = 1;
    }
  }
};

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(
      error instanceof Error ? error.stack || error.message : error,
    );
    process.exitCode = 1;
  });
}

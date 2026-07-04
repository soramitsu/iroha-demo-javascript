#!/usr/bin/env node
/* global BigInt */
import { blake2b } from "@noble/hashes/blake2b";
import { PublicKey } from "@solana/web3.js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_TAIRA_TORII_URL = "https://taira.sora.org";
export const DEFAULT_SOLANA_TESTNET_RPC_URL = "https://api.testnet.solana.com";
export const TAIRA_CHAIN_ID = "809574f5-fee7-5e69-bfcf-52451e42d50f";
export const TAIRA_NETWORK_PREFIX = 369;
export const SCCP_SOLANA_XOR_ROUTE_ID = "taira_sol_xor";
export const SCCP_XOR_ASSET_KEY = "xor";
export const SCCP_SORA_DOMAIN = 0;
export const SCCP_SOLANA_DOMAIN = 3;
export const SCCP_CODEC_SOLANA_BASE58 = 3;
export const SOLANA_TESTNET_NETWORK_ID = "solana-testnet";
export const SOLANA_TESTNET_CAIP_CHAIN_ID = "solana:testnet";
export const SOLANA_PRODUCTION_ADMISSION_MODE = "governed-zk-verifier-v1";
export const SOLANA_DESTINATION_PROOF_SYSTEM = "stark-fri-v1";
export const SOLANA_SUBMIT_ENTRYPOINT = "submit_sccp_message_proof";
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

const safeJson = (value) =>
  JSON.parse(
    JSON.stringify(value, (_key, entry) =>
      typeof entry === "bigint" ? entry.toString() : entry,
    ),
  );

const fetchJson = async (url, options = {}) => {
  const response = await fetch(url, {
    headers: { accept: "application/json", ...(options.headers ?? {}) },
    ...options,
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}: ${text.slice(0, 300)}`,
    );
  }
  return text ? JSON.parse(text) : {};
};

const fetchToriiJson = async (toriiUrl, pathName) =>
  fetchJson(`${toriiUrl}${pathName}`);

const fetchSolanaRpc = async (rpcUrl, method, params = []) => {
  const payload = await fetchJson(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
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

const fetchSolanaBase64Account = async (rpcUrl, address, label) => {
  const result = await fetchSolanaRpc(rpcUrl, "getAccountInfo", [
    address,
    { encoding: "base64", commitment: "finalized" },
  ]);
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
  if (manifestMatchesRoute(manifestSet) || manifestTargetsSolana(manifestSet)) {
    return [manifestSet];
  }
  return [
    ...listRecords(manifestSet.manifests),
    ...listRecords(manifestSet.routes),
    ...listRecords(manifestSet.items),
    ...listRecords(manifestSet.data),
  ];
};

const manifestTargetsSolana = (manifest) => {
  const domain = Number(
    manifest.counterpartyDomain ??
      manifest.counterparty_domain ??
      manifest.domain ??
      Number.NaN,
  );
  const chain = readFirstString(manifest, "chain", "network").toLowerCase();
  const target = readFirstString(manifest, "verifierTarget", "verifier_target");
  const codec = readFirstString(
    manifest,
    "counterpartyAccountCodecKey",
    "counterparty_account_codec_key",
  );
  return (
    domain === SCCP_SOLANA_DOMAIN ||
    chain.includes("solana") ||
    chain === "sol" ||
    target === "SolanaProgram" ||
    codec === "solana_base58"
  );
};

const manifestMatchesSolanaTestnet = (manifest) => {
  for (const value of [
    readFirstString(manifest, "solanaNetwork", "solana_network"),
    readFirstString(manifest, "network"),
    readFirstString(manifest, "chain"),
    readFirstString(manifest, "networkId", "network_id", "networkIdHex"),
  ]) {
    const normalized = value.toLowerCase();
    if (!normalized) {
      continue;
    }
    if (
      normalized === "testnet" ||
      normalized === "solana-testnet" ||
      normalized === SOLANA_TESTNET_NETWORK_ID ||
      normalized === SOLANA_TESTNET_CAIP_CHAIN_ID
    ) {
      return true;
    }
    if (normalized.includes("mainnet") || normalized.includes("devnet")) {
      return false;
    }
  }
  return true;
};

const manifestMatchesRoute = (manifest) =>
  readFirstString(manifest, "routeId", "route_id", "route", "id") ===
    SCCP_SOLANA_XOR_ROUTE_ID &&
  readFirstString(manifest, "assetKey", "asset_key", "assetId", "asset_id") ===
    SCCP_XOR_ASSET_KEY;

const pickSolanaManifest = (manifestSet) =>
  manifestRecords(manifestSet).find(
    (manifest) =>
      manifestTargetsSolana(manifest) &&
      manifestMatchesRoute(manifest) &&
      manifestMatchesSolanaTestnet(manifest),
  ) ?? null;

const readDestinationRollout = (manifest) =>
  readFirstRecord(manifest, "destinationRollout", "destination_rollout");

const readSolanaProgramAddress = (manifest) => {
  const rollout = readDestinationRollout(manifest);
  return (
    readFirstString(
      manifest,
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

const readBrowserProverUrl = (manifest, ...keys) => {
  const prover = readFirstRecord(manifest, ...keys);
  return readFirstString(prover, "moduleUrl", "module_url", "url", "href");
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

const requireHashFields = (record, label, fields) => {
  const missing = [];
  for (const [primary, secondary] of fields) {
    const value = readFirstString(record, primary, secondary);
    if (!value) {
      missing.push(`${label}.${primary}`);
      continue;
    }
    normalizeHex32(value, `${label}.${primary}`);
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

const checkManifestShape = (manifest) => {
  if (!manifest) {
    throw new Error("No taira_sol_xor Solana testnet manifest found.");
  }
  const routeId = readFirstString(
    manifest,
    "routeId",
    "route_id",
    "route",
    "id",
  );
  const assetKey = readFirstString(
    manifest,
    "assetKey",
    "asset_key",
    "assetId",
    "asset_id",
  );
  const codecKey = readFirstString(
    manifest,
    "counterpartyAccountCodecKey",
    "counterparty_account_codec_key",
  );
  const codecId = Number(
    manifest.counterpartyAccountCodec ?? manifest.counterparty_account_codec,
  );
  const domain = Number(
    manifest.counterpartyDomain ?? manifest.counterparty_domain,
  );
  if (routeId !== SCCP_SOLANA_XOR_ROUTE_ID || assetKey !== SCCP_XOR_ASSET_KEY) {
    throw new Error(
      `Expected ${SCCP_SOLANA_XOR_ROUTE_ID}/${SCCP_XOR_ASSET_KEY}.`,
    );
  }
  if (domain !== SCCP_SOLANA_DOMAIN) {
    throw new Error("Solana manifest counterparty domain must be 3.");
  }
  if (codecKey && codecKey !== "solana_base58") {
    throw new Error("Solana manifest must use solana_base58 codec key.");
  }
  if (Number.isFinite(codecId) && codecId !== SCCP_CODEC_SOLANA_BASE58) {
    throw new Error("Solana manifest must use codec id 3.");
  }
  if (!manifestMatchesSolanaTestnet(manifest)) {
    throw new Error("Solana manifest must target Solana testnet.");
  }
  return { routeId, assetKey, domain, codecKey, codecId };
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
      deployment.verifierStateAddress,
      deployment.sourceStateAddress,
    ]).size !== 6
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

const checkLiveSolanaDeployment = async (manifest, rpcUrl) => {
  const deployment = checkDeploymentAddresses(manifest);
  const rollout = checkRolloutMaterial(manifest);
  const programAccount = await fetchSolanaBase64Account(
    rpcUrl,
    deployment.verifierProgramAddress,
    "Solana verifier program",
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
  return {
    ...liveDeploymentEvidence,
    embeddedEvidence: checkEmbeddedVerifierLiveEvidence(
      manifest,
      liveDeploymentEvidence,
    ),
  };
};

const checkLiveSolanaTokenAndState = async (manifest, rpcUrl) => {
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

const readImmutableUpgradeableProgramEvidence = async (
  rpcUrl,
  address,
  label,
) => {
  const programAccount = await fetchSolanaBase64Account(rpcUrl, address, label);
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
    programdataSlot: parsedProgramdata.slot,
    programCodeHash: parsedProgramdata.executableHash,
    programdataMetadataHash: parsedProgramdata.metadataHash,
    executableLength: parsedProgramdata.executableLength,
    programContextSlot: programAccount.contextSlot,
    programdataContextSlot: programdataAccount.contextSlot,
  };
};

const checkLiveSolanaBridgePrograms = async (manifest, rpcUrl) => {
  const deployment = checkDeploymentAddresses(manifest);
  const bridge = await readImmutableUpgradeableProgramEvidence(
    rpcUrl,
    deployment.bridgeProgramAddress,
    "Solana bridge program",
  );
  const sourceBridge = await readImmutableUpgradeableProgramEvidence(
    rpcUrl,
    deployment.sourceBridgeProgramAddress,
    "Solana source bridge program",
  );
  return { bridge, sourceBridge };
};

const checkProverModules = (manifest) => {
  const destinationModuleUrl = normalizeModuleUrl(
    readBrowserProverUrl(
      manifest,
      "destinationBrowserProver",
      "destination_browser_prover",
      "browserDestinationProver",
      "browser_destination_prover",
      "solanaDestinationBrowserProver",
      "solana_destination_browser_prover",
    ),
    "Solana destination proof module URL",
  );
  const sourceModuleUrl = normalizeModuleUrl(
    readBrowserProverUrl(
      manifest,
      "sourceBrowserProver",
      "source_browser_prover",
      "browserSourceProver",
      "browser_source_prover",
      "solanaSourceBrowserProver",
      "solana_source_browser_prover",
    ),
    "Solana source proof module URL",
  );
  return { destinationModuleUrl, sourceModuleUrl };
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

const readAdmissionString = (admission, label, ...keys) => {
  const value = readFirstString(admission, ...keys);
  if (!value) {
    throw new Error(`Solana destination proof admission ${label} is missing.`);
  }
  return value;
};

export const checkDestinationProofAdmission = (manifest) => {
  const admission = readDestinationProofAdmission(manifest);
  if (!admission) {
    throw new Error("Solana destination proof admission material is missing.");
  }
  const admissionMode = readAdmissionString(
    admission,
    "admissionMode",
    "admissionMode",
    "admission_mode",
    "mode",
  );
  if (admissionMode !== SOLANA_PRODUCTION_ADMISSION_MODE) {
    throw new Error(
      `Solana destination proof admission mode must be ${SOLANA_PRODUCTION_ADMISSION_MODE}.`,
    );
  }
  const proofSystem = readAdmissionString(
    admission,
    "proofSystem",
    "proofSystem",
    "proof_system",
    "proofFamily",
    "proof_family",
  );
  if (proofSystem !== SOLANA_DESTINATION_PROOF_SYSTEM) {
    throw new Error(
      `Solana destination proof admission proof system must be ${SOLANA_DESTINATION_PROOF_SYSTEM}.`,
    );
  }
  const entrypoint = readAdmissionString(
    admission,
    "entrypoint",
    "entrypoint",
    "entry_point",
    "verifierEntrypoint",
    "verifier_entrypoint",
  );
  if (entrypoint !== SOLANA_SUBMIT_ENTRYPOINT) {
    throw new Error(
      `Solana destination proof admission entrypoint must be ${SOLANA_SUBMIT_ENTRYPOINT}.`,
    );
  }
  const rollout = checkRolloutMaterial(manifest);
  const admissionHashes = {
    verifierCodeHash: normalizeHex32(
      readAdmissionString(
        admission,
        "verifierCodeHash",
        "verifierCodeHash",
        "verifier_code_hash",
      ),
      "Solana destination proof admission verifierCodeHash",
    ),
    verifierKeyHash: normalizeHex32(
      readAdmissionString(
        admission,
        "verifierKeyHash",
        "verifierKeyHash",
        "verifier_key_hash",
      ),
      "Solana destination proof admission verifierKeyHash",
    ),
    destinationBindingHash: normalizeHex32(
      readAdmissionString(
        admission,
        "destinationBindingHash",
        "destinationBindingHash",
        "destination_binding_hash",
      ),
      "Solana destination proof admission destinationBindingHash",
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
  for (const [camel, snake] of [
    ["shapeOnly", "shape_only"],
    ["envelopeOnly", "envelope_only"],
    ["acceptsUnverifiedProofs", "accepts_unverified_proofs"],
  ]) {
    const value = admission[camel] ?? admission[snake];
    if (value === true || value === "true") {
      throw new Error(
        `Solana destination proof admission ${camel} must be false for production.`,
      );
    }
  }
  return {
    admissionMode,
    proofSystem,
    entrypoint,
    ...admissionHashes,
  };
};

const checkSourceLaneMaterial = (manifest) => {
  const verifier = readFirstRecord(
    manifest,
    "sourceVerifierMaterial",
    "source_verifier_material",
  );
  const adapter = readFirstRecord(
    manifest,
    "sourceAdapterEngineDeployment",
    "source_adapter_engine_deployment",
    "sourceAdapterDeployment",
    "source_adapter_deployment",
  );
  if (!verifier || !adapter) {
    throw new Error(
      "Solana source verifier material and adapter deployment are required.",
    );
  }
  for (const [record, label] of [
    [verifier, "sourceVerifierMaterial"],
    [adapter, "sourceAdapterEngineDeployment"],
  ]) {
    if (
      Number(record.sourceDomain ?? record.source_domain ?? record.domain) !==
      SCCP_SOLANA_DOMAIN
    ) {
      throw new Error(`${label}.sourceDomain must be Solana domain 3.`);
    }
    const targetDomain = Number(record.targetDomain ?? record.target_domain);
    if (Number.isFinite(targetDomain) && targetDomain !== SCCP_SORA_DOMAIN) {
      throw new Error(`${label}.targetDomain must target SORA domain 0.`);
    }
    const missing = requireHashFields(record, label, [
      ["sourceTrustAnchorHash", "source_trust_anchor_hash"],
      ["consensusVerifierHash", "consensus_verifier_hash"],
      ["messageInclusionVerifierHash", "message_inclusion_verifier_hash"],
      ["finalityPolicyHash", "finality_policy_hash"],
      ["sourceStateVerifierHash", "source_state_verifier_hash"],
    ]);
    if (missing.length > 0) {
      throw new Error(`${missing.join(", ")} missing.`);
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
    throw new Error(`${adapterMissing.join(", ")} missing.`);
  }
  return { verifier, adapter };
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

const checkSolanaRpc = async (rpcUrl) => {
  const response = await fetchJson(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getHealth",
      params: [],
    }),
  });
  if (response.result !== "ok") {
    throw new Error(
      `Solana testnet RPC health is not ok: ${JSON.stringify(response)}`,
    );
  }
  return { result: response.result };
};

const parseArgs = (argv) => {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    if (!raw.startsWith("--")) {
      throw new Error(`Unexpected argument ${raw}`);
    }
    const key = raw.slice(2);
    if (key === "help") {
      args.help = true;
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      args[key] = "true";
      continue;
    }
    args[key] = value;
    index += 1;
  }
  return args;
};

const usage = () => {
  console.log(`Usage: node scripts/e2e/sccp-solana-route-preflight.mjs [options]

Read-only TAIRA/Solana testnet SCCP route preflight for taira_sol_xor.

Options:
  --torii-url URL        TAIRA Torii endpoint (default: ${DEFAULT_TAIRA_TORII_URL})
  --solana-rpc-url URL   Solana testnet RPC endpoint (default: ${DEFAULT_SOLANA_TESTNET_RPC_URL})
  --manifest-file PATH   Validate a local manifest set instead of public TAIRA publication
  --output-dir PATH      Report directory (default: output/sccp-solana-preflight)
  --skip-solana-rpc      Skip Solana RPC health check
  --help                 Show this help
`);
};

export const runSccpSolanaRoutePreflight = async (options = {}) => {
  const toriiUrl = normalizeToriiEndpoint(options.toriiUrl);
  const solanaRpcUrl = normalizeSolanaRpcEndpoint(options.solanaRpcUrl);
  const manifestFile = trimString(options.manifestFile);
  const outputDir = path.resolve(options.outputDir || DEFAULT_OUTPUT_DIR);
  const checks = [];

  let capabilities = null;
  let manifestSet = null;
  let manifestSource = "public";

  pushCheck(checks, "taira-endpoint", () => ({ toriiUrl }));

  try {
    capabilities = await fetchToriiJson(toriiUrl, "/v1/sccp/capabilities");
    pushCheck(checks, "sccp-capabilities-load", () => ({ loaded: true }));
    pushCheck(checks, "sccp-submit-capabilities", () =>
      checkCapabilities(capabilities),
    );
  } catch (error) {
    checks.push(makeCheck("sccp-capabilities-load", false, error.message));
  }

  try {
    if (manifestFile) {
      manifestSource = "file";
      manifestSet = JSON.parse(
        await readFile(path.resolve(manifestFile), "utf8"),
      );
    } else {
      manifestSet = await fetchToriiJson(toriiUrl, "/v1/sccp/manifests");
    }
    pushCheck(checks, "sccp-manifest-load", () => ({
      source: manifestSource,
      recordCount: manifestRecords(manifestSet).length,
    }));
  } catch (error) {
    checks.push(makeCheck("sccp-manifest-load", false, error.message));
  }

  const manifest = manifestSet ? pickSolanaManifest(manifestSet) : null;
  pushCheck(checks, "public-route-publication", () => {
    if (manifestSource !== "public") {
      throw new Error(
        "Local manifest-file preflight is local evidence only; public TAIRA route publication is not proven.",
      );
    }
    return { source: manifestSource };
  });
  pushCheck(checks, "route-manifest-shape", () => checkManifestShape(manifest));
  if (manifest) {
    pushCheck(checks, "production-ready-flag", () => {
      if (
        manifest.productionReady !== true &&
        manifest.production_ready !== true
      ) {
        throw new Error("Solana route manifest is not production-ready.");
      }
      if (readFirstString(manifest, "disabledReason", "disabled_reason")) {
        throw new Error(
          "production-ready Solana manifest carries a disabled reason.",
        );
      }
      return { productionReady: true };
    });
    pushCheck(checks, "solana-deployment-addresses", () =>
      checkDeploymentAddresses(manifest),
    );
    pushCheck(checks, "solana-rollout-material", () =>
      checkRolloutMaterial(manifest),
    );
    pushCheck(checks, "browser-proof-modules", () =>
      checkProverModules(manifest),
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
            await checkLiveSolanaDeployment(manifest, solanaRpcUrl),
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
            await checkLiveSolanaTokenAndState(manifest, solanaRpcUrl),
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
            await checkLiveSolanaBridgePrograms(manifest, solanaRpcUrl),
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
      const evidence = await checkSolanaRpc(solanaRpcUrl);
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

  const ready = checks.every((check) => check.status === "pass");
  const report = {
    schema: "iroha-demo-sccp-solana-route-preflight/v1",
    ready,
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
      rpcUrl: solanaRpcUrl,
    },
    manifestSource,
    checkedAt: new Date().toISOString(),
    checks,
    deployment: manifest
      ? {
          bridgeProgramAddress: readSolanaProgramAddress(manifest),
          tokenMintAddress: readSolanaTokenMint(manifest),
          sourceBridgeProgramAddress: readSolanaSourceBridgeAddress(manifest),
          verifierProgramAddress: readSolanaVerifierAddress(manifest),
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

  await mkdir(outputDir, { recursive: true });
  const reportPath = path.join(outputDir, "sccp-solana-route-preflight.json");
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
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
    skipSolanaRpc: args["skip-solana-rpc"] === "true",
  });
  console.log(`Solana SCCP route preflight report: ${reportPath}`);
  if (!report.ready) {
    console.error(
      report.checks
        .filter((check) => check.status !== "pass")
        .map((check) => `- ${check.id}: ${check.detail}`)
        .join("\n"),
    );
    process.exitCode = 1;
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

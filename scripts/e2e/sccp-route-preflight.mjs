#!/usr/bin/env node
/* global BigInt, globalThis */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_TAIRA_TORII_URL = "https://taira.sora.org";
export const TAIRA_CHAIN_ID = "809574f5-fee7-5e69-bfcf-52451e42d50f";
export const TAIRA_NETWORK_PREFIX = 369;
export const SCCP_XOR_ROUTE_ID = "taira_tron_xor";
export const SCCP_XOR_ASSET_KEY = "xor";
export const SCCP_SORA_DOMAIN = 0;
export const SCCP_TRON_DOMAIN = 5;
export const TRON_MAINNET_CHAIN_ID_HEX = "0x2b6653dc";
export const TRON_MAINNET_NETWORK_ID_HEX =
  "0x000000000000000000000000000000000000000000000000000000002b6653dc";
export const DEFAULT_TRON_GATEWAY_URL = "https://api.trongrid.io";
export const TRON_NILE_CHAIN_ID_HEX = "0xcd8690dc";
export const TRON_NILE_NETWORK_ID_HEX =
  "0x00000000000000000000000000000000000000000000000000000000cd8690dc";
export const DEFAULT_TRON_NILE_GATEWAY_URL = "https://nile.trongrid.io";

export const SCCP_TRON_NETWORK_PROFILES = {
  mainnet: {
    key: "mainnet",
    label: "TRON mainnet",
    chainIdHex: TRON_MAINNET_CHAIN_ID_HEX,
    networkIdHex: TRON_MAINNET_NETWORK_ID_HEX,
    gatewayUrl: DEFAULT_TRON_GATEWAY_URL,
  },
  nile: {
    key: "nile",
    label: "TRON Nile testnet",
    chainIdHex: TRON_NILE_CHAIN_ID_HEX,
    networkIdHex: TRON_NILE_NETWORK_ID_HEX,
    gatewayUrl: DEFAULT_TRON_NILE_GATEWAY_URL,
  },
};

const TRON_BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const TRON_BASE58_INDEX = new Map(
  Array.from(TRON_BASE58_ALPHABET, (character, index) => [character, index]),
);

const CHAIN_METADATA_PATHS = [
  "/v1/chain/metadata",
  "/chain/metadata",
  "/v1/network/metadata",
  "/network/metadata",
  "/v1/network",
  "/network",
  "/v1/explorer/network",
  "/explorer/network",
  "/v1/explorer/chain",
  "/explorer/chain",
  "/v1/configuration",
  "/configuration",
  "/v1/status",
  "/status",
];

const SCCP_CAPABILITIES_PATH = "/v1/sccp/capabilities";
const SCCP_MANIFESTS_PATH = "/v1/sccp/manifests";

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

export const normalizeSccpTronNetworkKey = (value) => {
  const normalized = trimString(value).toLowerCase();
  if (
    !normalized ||
    normalized === "mainnet" ||
    normalized === "tron-mainnet"
  ) {
    return "mainnet";
  }
  if (normalized === "nile" || normalized === "tron-nile") {
    return "nile";
  }
  throw new Error("--tron-network must be mainnet or nile.");
};

export const resolveSccpTronNetworkProfile = (value) =>
  SCCP_TRON_NETWORK_PROFILES[normalizeSccpTronNetworkKey(value)];

const bytesEqual = (left, right) =>
  left.length === right.length &&
  left.every((byte, index) => byte === right[index]);

const sha256 = (bytes) =>
  new Uint8Array(createHash("sha256").update(bytes).digest());

const doubleSha256 = (bytes) => sha256(sha256(bytes));

const base58Decode = (value) => {
  let number = 0n;
  for (const character of value) {
    const digit = TRON_BASE58_INDEX.get(character);
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

export const decodeTronBase58CheckAddress = (address) => {
  const normalized = trimString(address);
  if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/u.test(normalized)) {
    throw new Error("TRON address must be a Base58Check mainnet address.");
  }
  const decoded = base58Decode(normalized);
  if (!decoded || decoded.length !== 25) {
    throw new Error(
      "TRON address must decode to a 25-byte Base58Check payload.",
    );
  }
  const payload = decoded.slice(0, 21);
  const checksum = decoded.slice(21);
  const expectedChecksum = doubleSha256(payload).slice(0, 4);
  if (!bytesEqual(checksum, expectedChecksum)) {
    throw new Error("TRON address checksum is invalid.");
  }
  if (payload[0] !== 0x41 || payload.slice(1).every((byte) => byte === 0)) {
    throw new Error("TRON address must be a non-zero mainnet account.");
  }
  return payload;
};

export const isValidTronBase58CheckAddress = (address) => {
  try {
    decodeTronBase58CheckAddress(address);
    return true;
  } catch (_error) {
    return false;
  }
};

const normalizeTronNetworkIdHex = (networkId, tronNetwork = "mainnet") => {
  const profile = resolveSccpTronNetworkProfile(tronNetwork);
  const normalized = trimString(networkId).toLowerCase();
  if (normalized === profile.chainIdHex) {
    return profile.networkIdHex;
  }
  if (normalized !== profile.networkIdHex) {
    throw new Error(`TRON SCCP routes must target ${profile.label}.`);
  }
  return normalized;
};

const normalizeHex32 = (value, label) => {
  const normalized = trimString(value).toLowerCase().replace(/^0x/u, "");
  if (!/^[0-9a-f]{64}$/u.test(normalized)) {
    throw new Error(`${label} must be a 32-byte hex value.`);
  }
  return `0x${normalized}`;
};

const normalizeNonZeroHex32 = (value, label) => {
  const normalized = normalizeHex32(value, label);
  if (/^0x0{64}$/u.test(normalized)) {
    throw new Error(`${label} must be non-zero.`);
  }
  return normalized;
};

const readDestinationRollout = (manifest) =>
  readRecord(manifest, "destinationRollout") ||
  readRecord(manifest, "destination_rollout");

export const readSccpTronBridgeAddress = (manifest) =>
  readFirstString(
    manifest,
    "tairaXorBridgeAddress",
    "taira_xor_bridge_address",
    "tronBridgeAddress",
    "tron_bridge_address",
    "bridgeAddress",
    "bridge_address",
    "bridge_contract_address",
    "bridge_address_base58",
  );

export const readSccpTronTokenAddress = (manifest) =>
  readFirstString(
    manifest,
    "tairaXorTokenAddress",
    "taira_xor_token_address",
    "tronTokenAddress",
    "tron_token_address",
    "tokenAddress",
    "token_address",
    "token_contract_address",
    "token_address_base58",
  );

export const readSccpTronSourceBridgeAddress = (manifest) =>
  readFirstString(
    manifest,
    "sccpTronSourceBridgeAddress",
    "sccp_tron_source_bridge_address",
    "tronSourceBridgeAddress",
    "tron_source_bridge_address",
    "sourceBridgeAddress",
    "source_bridge_address",
    "source_bridge_address_base58",
  );

export const readSccpTronVerifierAddress = (manifest) => {
  const rollout = readDestinationRollout(manifest);
  return (
    readFirstString(
      manifest,
      "tronVerifierAddress",
      "tron_verifier_address",
      "sccp_tron_destination_verifier_address",
    ) || readFirstString(rollout, "verifierIdentity", "verifier_identity")
  );
};

export const readSccpTronProofMaterial = (
  manifest,
  tronNetwork = "mainnet",
) => {
  const rollout = readDestinationRollout(manifest);
  try {
    return {
      networkIdHex: normalizeTronNetworkIdHex(
        readFirstString(manifest, "networkIdHex", "network_id_hex") ||
          readFirstString(
            rollout,
            "destinationNetworkId",
            "destination_network_id",
          ),
        tronNetwork,
      ),
      tronVerifierAddress: normalizeTronAddress(
        readSccpTronVerifierAddress(manifest),
      ),
      verifierCodeHashHex: normalizeHex32(
        readFirstString(
          manifest,
          "verifierCodeHashHex",
          "verifier_code_hash_hex",
        ) || readFirstString(rollout, "verifierCodeHash", "verifier_code_hash"),
        "TRON verifier code hash",
      ),
      verifierKeyHashHex: normalizeHex32(
        readFirstString(
          manifest,
          "verifierKeyHashHex",
          "verifier_key_hash_hex",
        ) || readFirstString(rollout, "verifierKeyHash", "verifier_key_hash"),
        "TRON verifier key hash",
      ),
      expectedDestinationBindingHashHex: normalizeHex32(
        readFirstString(
          manifest,
          "expectedDestinationBindingHashHex",
          "expected_destination_binding_hash_hex",
        ) ||
          readFirstString(
            rollout,
            "destinationBindingHash",
            "destination_binding_hash",
          ),
        "TRON destination binding hash",
      ),
    };
  } catch (_error) {
    return null;
  }
};

export const readSccpTairaBurnRecordMaterial = (manifest) => {
  const burnRecord = readFirstRecord(
    manifest,
    "tairaXorBurnRecord",
    "taira_xor_burn_record",
    "burnRecord",
    "burn_record",
    "sourceRecordContract",
    "source_record_contract",
  );
  const vkRef =
    readFirstRecord(
      burnRecord,
      "vkRef",
      "vk_ref",
      "verifyingKeyRef",
      "verifying_key_ref",
    ) ||
    readFirstRecord(
      manifest,
      "tairaXorBurnRecordVkRef",
      "taira_xor_burn_record_vk_ref",
      "burnRecordVkRef",
      "burn_record_vk_ref",
    );
  const material = {
    settlementAssetDefinitionId:
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
        "tairaXorSettlementAsset",
        "taira_xor_settlement_asset",
      ),
    contractArtifactB64:
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
        "burnRecordContractArtifactB64",
        "burn_record_contract_artifact_b64",
      ),
    vkRef: {
      backend: readFirstString(
        vkRef,
        "backend",
        "proofBackend",
        "proof_backend",
      ),
      name: readFirstString(vkRef, "name", "vkName", "vk_name"),
    },
    gasLimit:
      readNumber(burnRecord ?? manifest, "gasLimit") ??
      readNumber(burnRecord ?? manifest, "gas_limit") ??
      undefined,
  };
  if (
    !material.settlementAssetDefinitionId ||
    !material.contractArtifactB64 ||
    !material.vkRef.backend ||
    !material.vkRef.name
  ) {
    return null;
  }
  return material;
};

const manifestRecords = (manifestSet) => {
  if (Array.isArray(manifestSet)) {
    return listRecords(manifestSet);
  }
  if (!isRecord(manifestSet)) {
    return [];
  }
  return [
    ...listRecords(manifestSet.manifests),
    ...listRecords(manifestSet.items),
    ...listRecords(manifestSet.routes),
    ...listRecords(manifestSet.proofManifests),
    ...listRecords(manifestSet.proof_manifests),
  ];
};

const manifestTargetsTron = (manifest) => {
  const counterpartyDomain =
    readNumber(manifest, "counterpartyDomain") ??
    readNumber(manifest, "counterparty_domain");
  const verifierTarget = readFirstString(
    manifest,
    "verifierTarget",
    "verifier_target",
  );
  const chain = readString(manifest, "chain").toLowerCase();
  return (
    counterpartyDomain === SCCP_TRON_DOMAIN ||
    verifierTarget === "TronContract" ||
    chain.includes("tron")
  );
};

const manifestMatchesRoute = (manifest) => {
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
  return routeId === SCCP_XOR_ROUTE_ID && assetKey === SCCP_XOR_ASSET_KEY;
};

const normalizeManifestTronNetworkKey = (value) => {
  const normalized = trimString(value).toLowerCase();
  if (!normalized) {
    return null;
  }
  if (normalized === "tron") {
    return "mainnet";
  }
  try {
    return normalizeSccpTronNetworkKey(normalized);
  } catch (_error) {
    return null;
  }
};

const readManifestTronNetworkKey = (manifest) => {
  for (const value of [
    readString(manifest, "tronNetwork"),
    readString(manifest, "tron_network"),
    readString(manifest, "network"),
    readString(manifest, "chain"),
  ]) {
    const key = normalizeManifestTronNetworkKey(value);
    if (key) {
      return key;
    }
  }
  return null;
};

const manifestMatchesTronNetworkProfile = (
  manifest,
  tronNetwork = "mainnet",
) => {
  const profile = resolveSccpTronNetworkProfile(tronNetwork);
  const declaredNetwork = readManifestTronNetworkKey(manifest);
  if (declaredNetwork) {
    return declaredNetwork === profile.key;
  }
  if (readSccpTronProofMaterial(manifest, profile.key)) {
    return true;
  }
  return profile.key === "mainnet";
};

const safeManifestDiagnosticValue = (value) => {
  const normalized = trimString(value);
  if (!normalized) {
    return "<missing>";
  }
  if (!/^[A-Za-z0-9_.:#-]{1,64}$/u.test(normalized)) {
    return "<redacted>";
  }
  return normalized;
};

const readManifestTargetDiagnostic = (manifest) => {
  const counterpartyDomain =
    readNumber(manifest, "counterpartyDomain") ??
    readNumber(manifest, "counterparty_domain");
  if (counterpartyDomain !== null) {
    return String(counterpartyDomain);
  }
  return (
    readFirstString(manifest, "verifierTarget", "verifier_target") ||
    readString(manifest, "chain")
  );
};

const describeTronManifestCandidates = (manifestSet) => {
  const tronManifests =
    manifestRecords(manifestSet).filter(manifestTargetsTron);
  if (tronManifests.length === 0) {
    return "";
  }
  const shown = tronManifests.slice(0, 5).map((manifest, index) => {
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
    return `#${index + 1} route=${safeManifestDiagnosticValue(
      routeId,
    )} asset=${safeManifestDiagnosticValue(
      assetKey,
    )} target=${safeManifestDiagnosticValue(
      readManifestTargetDiagnostic(manifest),
    )}`;
  });
  const remaining = tronManifests.length - shown.length;
  return ` Observed TRON candidates: ${shown.join("; ")}${
    remaining > 0 ? `; +${remaining} more` : ""
  }.`;
};

export const pickTairaTronXorManifest = (
  manifestSet,
  tronNetwork = "mainnet",
) =>
  manifestRecords(manifestSet).find(
    (manifest) =>
      manifestTargetsTron(manifest) &&
      manifestMatchesRoute(manifest) &&
      manifestMatchesTronNetworkProfile(manifest, tronNetwork),
  ) ?? null;

const hasAnyTronManifest = (manifestSet) =>
  manifestRecords(manifestSet).some(manifestTargetsTron);

export const parseSccpRouteManifestFilePayload = (payload) => {
  if (Array.isArray(payload)) {
    return { routes: listRecords(payload) };
  }
  if (!isRecord(payload)) {
    throw new Error("SCCP route manifest file must contain a JSON object.");
  }
  if (manifestRecords(payload).length > 0) {
    return payload;
  }
  return { routes: [payload] };
};

export const loadSccpRouteManifestFile = async (
  manifestFilePath,
  { readFileImpl = readFile } = {},
) => {
  const raw = await readFileImpl(manifestFilePath, "utf8");
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `SCCP route manifest file is not valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  return parseSccpRouteManifestFilePayload(payload);
};

export const normalizeTronAddress = (address) => {
  const normalized = trimString(address);
  decodeTronBase58CheckAddress(normalized);
  return normalized;
};

const readCapabilityPath = (capabilities, pathKind) => {
  if (pathKind === "proof") {
    return (
      readFirstString(
        capabilities,
        "proofSubmitPath",
        "proof_submit_path",
        "proofSubmit",
        "proof_submit",
      ) ||
      readFirstString(
        readFirstRecord(capabilities, "submit", "submissions", "paths"),
        "proof",
        "proofPath",
        "proof_path",
        "proofSubmitPath",
        "proof_submit_path",
      )
    );
  }
  return (
    readFirstString(
      capabilities,
      "messageSubmitPath",
      "message_submit_path",
      "messageSubmit",
      "message_submit",
    ) ||
    readFirstString(
      readFirstRecord(capabilities, "submit", "submissions", "paths"),
      "message",
      "messagePath",
      "message_path",
      "messageSubmitPath",
      "message_submit_path",
    )
  );
};

const hasUnsafeSccpCapabilityPathCharacter = (path) => {
  for (const character of path) {
    const code = character.charCodeAt(0);
    if (
      code <= 0x20 ||
      code === 0x7f ||
      character === "\\" ||
      character === "?" ||
      character === "#"
    ) {
      return true;
    }
  }
  return false;
};

const normalizeSccpCapabilitySubmitPath = (value, label, kind) => {
  const path = trimString(value);
  if (!path) {
    throw new Error(`${label} is missing.`);
  }
  if (hasUnsafeSccpCapabilityPathCharacter(path)) {
    throw new Error(
      `${label} must be a same-endpoint absolute path without whitespace, query strings, fragments, or backslashes.`,
    );
  }
  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new Error(`${label} must be a same-endpoint absolute path.`);
  }
  let parsed;
  try {
    parsed = new URL(path, "https://taira.sora.org");
  } catch (error) {
    throw new Error(`${label} is not a valid endpoint path: ${error.message}`);
  }
  if (parsed.origin !== "https://taira.sora.org" || parsed.pathname !== path) {
    throw new Error(`${label} must not escape the active Torii endpoint.`);
  }
  const decodedSegments = path
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      try {
        return decodeURIComponent(segment).toLowerCase();
      } catch (_error) {
        throw new Error(`${label} contains invalid percent encoding.`);
      }
    });
  if (decodedSegments.some((segment) => segment === "." || segment === "..")) {
    throw new Error(`${label} must not contain path traversal segments.`);
  }
  if (decodedSegments.some((segment) => /[\\/]/u.test(segment))) {
    throw new Error(`${label} must not contain encoded path separators.`);
  }
  const normalizedPath = decodedSegments.join("/");
  if (!/(?:^|\/)(?:bridge|sccp)(?:\/|$)/u.test(normalizedPath)) {
    throw new Error(`${label} must target an SCCP or bridge endpoint.`);
  }
  if (kind === "proof" && !/(?:^|\/)proofs?(?:\/|$)/u.test(normalizedPath)) {
    throw new Error(`${label} must target a proof submission endpoint.`);
  }
  if (
    kind === "message" &&
    !/(?:^|\/)messages?(?:\/|$)/u.test(normalizedPath)
  ) {
    throw new Error(
      `${label} must target a bridge-message submission endpoint.`,
    );
  }
  return path;
};

const readProductionReadyFlag = (manifest) => {
  const hasCamel = Object.prototype.hasOwnProperty.call(
    manifest,
    "productionReady",
  );
  const value = hasCamel ? manifest.productionReady : manifest.production_ready;
  if (value === true) {
    return { ready: true, invalid: false };
  }
  if (value === false || value === undefined || value === null) {
    return { ready: false, invalid: false };
  }
  return { ready: false, invalid: true };
};

const hasPostDeployLiveEvidence = (manifest) =>
  Boolean(
    readFirstRecord(
      manifest,
      "postDeployLiveEvidence",
      "post_deploy_live_evidence",
    ),
  );

const isCanonicalTairaAssetDefinitionId = (value) =>
  /^[1-9A-HJ-NP-Za-km-z]{16,80}$/u.test(value);

const readPostDeployLiveEvidence = (manifest) => {
  const evidence = readFirstRecord(
    manifest,
    "postDeployLiveEvidence",
    "post_deploy_live_evidence",
  );
  if (!evidence) {
    throw new Error("The TRON SCCP post-deploy live evidence is missing.");
  }
  const fullTomlReady =
    evidence.fullTomlReady ?? evidence.full_toml_ready ?? false;
  if (fullTomlReady !== true) {
    throw new Error("postDeployLiveEvidence.fullTomlReady must be true.");
  }

  const sourceBridgeConfigHash = normalizeNonZeroHex32(
    readFirstString(
      evidence,
      "sourceBridgeConfigHash",
      "source_bridge_config_hash",
    ),
    "postDeployLiveEvidence.sourceBridgeConfigHash",
  );
  const sourceEventTransactionId = normalizeNonZeroHex32(
    readFirstString(
      evidence,
      "sourceEventTransactionId",
      "source_event_transaction_id",
    ),
    "postDeployLiveEvidence.sourceEventTransactionId",
  );
  const routeCanaryEvidenceHash = normalizeNonZeroHex32(
    readFirstString(
      evidence,
      "routeCanaryEvidenceHash",
      "route_canary_evidence_hash",
    ),
    "postDeployLiveEvidence.routeCanaryEvidenceHash",
  );
  const routeCanaryTransactionId = normalizeNonZeroHex32(
    readFirstString(
      evidence,
      "routeCanaryTransactionId",
      "route_canary_transaction_id",
    ),
    "postDeployLiveEvidence.routeCanaryTransactionId",
  );
  const offlineFullTomlSha256 = readFirstString(
    evidence,
    "offlineFullTomlSha256",
    "offline_full_toml_sha256",
  );
  if (offlineFullTomlSha256) {
    normalizeNonZeroHex32(
      offlineFullTomlSha256,
      "postDeployLiveEvidence.offlineFullTomlSha256",
    );
  }
  return {
    fullTomlReady: true,
    sourceBridgeConfigHash,
    sourceEventTransactionId,
    routeCanaryEvidenceHash,
    routeCanaryTransactionId,
    ...(offlineFullTomlSha256
      ? {
          offlineFullTomlSha256: normalizeNonZeroHex32(
            offlineFullTomlSha256,
            "postDeployLiveEvidence.offlineFullTomlSha256",
          ),
        }
      : {}),
  };
};

export const SCCP_BURN_RECORD_ARTIFACT_MIN_BYTES = 32;
export const SCCP_BURN_RECORD_ARTIFACT_MAX_BYTES = 8 * 1024 * 1024;

const strictBase64DecodedLength = (value) => {
  const normalized = value.trim();
  if (
    normalized.length < 8 ||
    normalized.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/u.test(normalized)
  ) {
    return null;
  }
  const decoded = Buffer.from(normalized, "base64");
  return decoded.length > 0 && decoded.toString("base64") === normalized
    ? decoded.length
    : null;
};

const addCheck = (checks, status, id, label, detail) => {
  checks.push({
    id,
    label,
    status,
    ...(detail ? { detail } : {}),
  });
};

const fail = (checks, id, label, detail) =>
  addCheck(checks, "fail", id, label, detail);

const pass = (checks, id, label, detail) =>
  addCheck(checks, "pass", id, label, detail);

const warn = (checks, id, label, detail) =>
  addCheck(checks, "warn", id, label, detail);

const validateAddressCheck = (checks, id, label, address) => {
  if (!address) {
    fail(checks, id, label, "Missing address.");
    return;
  }
  try {
    normalizeTronAddress(address);
    pass(checks, id, label, address);
  } catch (error) {
    fail(
      checks,
      id,
      label,
      error instanceof Error ? error.message : "Invalid TRON address.",
    );
  }
};

const validateDistinctTronContractAddresses = (checks, manifest) => {
  const label =
    "TRON token, bridge, source bridge, and verifier addresses are distinct.";
  const addresses = [
    readSccpTronTokenAddress(manifest),
    readSccpTronBridgeAddress(manifest),
    readSccpTronSourceBridgeAddress(manifest),
    readSccpTronVerifierAddress(manifest),
  ];
  try {
    const normalized = addresses.map((address) =>
      normalizeTronAddress(address),
    );
    if (new Set(normalized).size !== normalized.length) {
      fail(
        checks,
        "tron-contract-addresses-distinct",
        label,
        "Deployment evidence reuses a TRON contract address.",
      );
      return;
    }
    pass(checks, "tron-contract-addresses-distinct", label);
  } catch (error) {
    fail(
      checks,
      "tron-contract-addresses-distinct",
      label,
      error instanceof Error
        ? error.message
        : "TRON contract addresses are incomplete or invalid.",
    );
  }
};

const tronSolidityAddressHex = (address) =>
  Buffer.from(decodeTronBase58CheckAddress(address).slice(1)).toString("hex");

const normalizeAbiWordHex = (value, label) => {
  const normalized = trimString(value).toLowerCase().replace(/^0x/u, "");
  if (!/^[0-9a-f]{64}$/u.test(normalized)) {
    throw new Error(`${label} must be a 32-byte ABI word.`);
  }
  return normalized;
};

const readTronConstantWord = (response, label) => {
  const result = readRecord(response, "result");
  if (result && result.result !== true) {
    throw new Error(
      `${label} was rejected by TRON: ${
        readFirstString(result, "message", "code") || "unknown error"
      }.`,
    );
  }
  const values = response?.constant_result;
  if (!Array.isArray(values) || typeof values[0] !== "string") {
    throw new Error(`${label} is missing constant_result[0].`);
  }
  return normalizeAbiWordHex(values[0], label);
};

const readTronConstantAddress = (response, label) => {
  const word = readTronConstantWord(response, label);
  if (!/^0{24}[0-9a-f]{40}$/u.test(word)) {
    throw new Error(`${label} did not return an ABI address.`);
  }
  if (/^0{64}$/u.test(word)) {
    throw new Error(`${label} returned the zero address.`);
  }
  return word.slice(24);
};

const readTronConstantBool = (response, label) => {
  const word = readTronConstantWord(response, label);
  if (word === `${"0".repeat(63)}1`) {
    return true;
  }
  if (word === "0".repeat(64)) {
    return false;
  }
  throw new Error(`${label} did not return an ABI bool.`);
};

const readTronConstantBytes32 = (response, label) =>
  `0x${readTronConstantWord(response, label)}`;

const validateDestinationBinding = (manifest, tronNetwork = "mainnet") => {
  const proofMaterial = readSccpTronProofMaterial(manifest, tronNetwork);
  if (!proofMaterial) {
    throw new Error(
      "The TRON SCCP verifier rollout proof material is incomplete.",
    );
  }
  const manifestBinding =
    readRecord(manifest, "destinationBinding") ||
    readRecord(manifest, "destination_binding");
  const rollout = readDestinationRollout(manifest);
  const key =
    readFirstString(manifestBinding, "key", "bindingKey", "binding_key") ||
    readFirstString(
      rollout,
      "destinationBindingKey",
      "destination_binding_key",
    );
  if (!key) {
    throw new Error("The TRON SCCP destination binding key is missing.");
  }
  const version =
    readNumber(manifestBinding ?? {}, "version") ??
    readNumber(rollout ?? {}, "version") ??
    1;
  if (version !== 1) {
    throw new Error("The TRON SCCP destination binding version must be 1.");
  }
  const sourceDomain =
    readNumber(manifestBinding ?? {}, "sourceDomain") ??
    readNumber(manifestBinding ?? {}, "source_domain") ??
    readNumber(rollout ?? {}, "sourceDomain") ??
    readNumber(rollout ?? {}, "source_domain");
  const targetDomain =
    readNumber(manifestBinding ?? {}, "targetDomain") ??
    readNumber(manifestBinding ?? {}, "target_domain") ??
    readNumber(rollout ?? {}, "targetDomain") ??
    readNumber(rollout ?? {}, "target_domain");
  if (sourceDomain !== null && sourceDomain !== SCCP_SORA_DOMAIN) {
    throw new Error(
      "The TRON SCCP destination binding source domain is wrong.",
    );
  }
  if (targetDomain !== null && targetDomain !== SCCP_TRON_DOMAIN) {
    throw new Error(
      "The TRON SCCP destination binding target domain is wrong.",
    );
  }
  const bindingHash = normalizeHex32(
    readFirstString(manifestBinding, "bindingHash", "binding_hash") ||
      proofMaterial.expectedDestinationBindingHashHex,
    "TRON destination binding hash",
  );
  if (
    bindingHash.toLowerCase() !==
    proofMaterial.expectedDestinationBindingHashHex.toLowerCase()
  ) {
    throw new Error(
      "The TRON SCCP destination binding hash disagrees with rollout material.",
    );
  }
  return {
    key,
    version: 1,
    bindingHash,
    networkIdHex: proofMaterial.networkIdHex,
  };
};

const validateBurnRecordMaterial = (material) => {
  if (!material) {
    throw new Error("The TAIRA burn-record ZK contract material is missing.");
  }
  if (
    !isCanonicalTairaAssetDefinitionId(material.settlementAssetDefinitionId)
  ) {
    throw new Error(
      "The TAIRA settlement asset definition ID must be a canonical Base58 asset definition ID, not an alias.",
    );
  }
  const contractArtifactBytes = strictBase64DecodedLength(
    material.contractArtifactB64,
  );
  if (contractArtifactBytes === null) {
    throw new Error(
      "The TAIRA burn-record contract artifact must be strict base64.",
    );
  }
  if (
    contractArtifactBytes < SCCP_BURN_RECORD_ARTIFACT_MIN_BYTES ||
    contractArtifactBytes > SCCP_BURN_RECORD_ARTIFACT_MAX_BYTES
  ) {
    throw new Error(
      `The TAIRA burn-record contract artifact must decode to ${SCCP_BURN_RECORD_ARTIFACT_MIN_BYTES}-${SCCP_BURN_RECORD_ARTIFACT_MAX_BYTES} bytes.`,
    );
  }
  if (!material.vkRef.backend || !material.vkRef.name) {
    throw new Error("The TAIRA burn-record VK reference is incomplete.");
  }
  if (
    material.gasLimit !== undefined &&
    (!Number.isSafeInteger(material.gasLimit) || material.gasLimit <= 0)
  ) {
    throw new Error("The TAIRA burn-record gas limit must be positive.");
  }
};

const manifestAllowsSelectedTestnetRoute = (
  manifest,
  profile,
  productionReady,
) =>
  profile.key !== "mainnet" &&
  !productionReady.ready &&
  !productionReady.invalid &&
  readManifestTronNetworkKey(manifest) === profile.key &&
  Boolean(readSccpTronProofMaterial(manifest, profile.key));

export const evaluateSccpRoutePreflight = ({
  endpoint = DEFAULT_TAIRA_TORII_URL,
  tronNetwork = "mainnet",
  chainMetadata,
  capabilities,
  manifestSet,
  tronContractReadback = null,
  manifestSource = "endpoint",
  errors = {},
  warnings = [],
  checkedAt = new Date().toISOString(),
} = {}) => {
  const tronProfile = resolveSccpTronNetworkProfile(tronNetwork);
  const usesLocalManifestFile = manifestSource === "file";
  const checks = [];
  const normalizedChainId = trimString(chainMetadata?.chainId);
  const networkPrefix = Number(chainMetadata?.networkPrefix);

  if (
    normalizedChainId === TAIRA_CHAIN_ID &&
    networkPrefix === TAIRA_NETWORK_PREFIX
  ) {
    pass(
      checks,
      "taira-network",
      "Endpoint reports TAIRA chain id and I105 prefix.",
      `${normalizedChainId} / ${networkPrefix}`,
    );
  } else if (errors.chainMetadata) {
    fail(
      checks,
      "taira-network",
      "Endpoint reports TAIRA chain id and I105 prefix.",
      errors.chainMetadata,
    );
  } else {
    fail(
      checks,
      "taira-network",
      "Endpoint reports TAIRA chain id and I105 prefix.",
      `Observed ${normalizedChainId || "<missing>"} / ${
        Number.isFinite(networkPrefix) ? networkPrefix : "<missing>"
      }.`,
    );
  }

  if (warnings.length) {
    for (const warning of warnings) {
      warn(checks, "endpoint-warning", "Endpoint metadata warning.", warning);
    }
  }

  if (!capabilities) {
    fail(
      checks,
      "sccp-capabilities",
      "SCCP capabilities expose proof and bridge-message submit endpoints.",
      errors.capabilities || "Capabilities were not loaded.",
    );
  } else {
    const proofSubmitPath = readCapabilityPath(capabilities, "proof");
    const messageSubmitPath = readCapabilityPath(capabilities, "message");
    try {
      const normalizedProofPath = normalizeSccpCapabilitySubmitPath(
        proofSubmitPath,
        "SCCP proof submit path",
        "proof",
      );
      const normalizedMessagePath = normalizeSccpCapabilitySubmitPath(
        messageSubmitPath,
        "SCCP bridge-message submit path",
        "message",
      );
      pass(
        checks,
        "sccp-capabilities",
        "SCCP capabilities expose proof and bridge-message submit endpoints.",
        `${normalizedProofPath} / ${normalizedMessagePath}`,
      );
    } catch (error) {
      fail(
        checks,
        "sccp-capabilities",
        "SCCP capabilities expose proof and bridge-message submit endpoints.",
        error instanceof Error
          ? error.message
          : "Missing proofSubmitPath or messageSubmitPath.",
      );
    }
  }

  if (usesLocalManifestFile) {
    warn(
      checks,
      "route-manifest-source",
      "SCCP route manifest source.",
      "Using a local manifest file override; public TAIRA route publication is not proven by this report.",
    );
  }

  const manifest = pickTairaTronXorManifest(manifestSet, tronProfile.key);
  const manifestCheckLabel = usesLocalManifestFile
    ? "Local manifest override provides the taira_tron_xor TRON manifest."
    : "TAIRA advertises the taira_tron_xor TRON manifest.";
  if (!manifestSet) {
    fail(
      checks,
      "route-manifest",
      manifestCheckLabel,
      errors.manifests || "Manifests were not loaded.",
    );
  } else if (!manifest) {
    fail(
      checks,
      "route-manifest",
      manifestCheckLabel,
      hasAnyTronManifest(manifestSet)
        ? `TRON manifests are present, but none match route taira_tron_xor with asset key xor.${describeTronManifestCandidates(
            manifestSet,
          )}`
        : "No TRON SCCP manifest is advertised.",
    );
  } else {
    pass(checks, "route-manifest", manifestCheckLabel, SCCP_XOR_ROUTE_ID);

    const productionReady = readProductionReadyFlag(manifest);
    const allowSelectedTestnetRoute = manifestAllowsSelectedTestnetRoute(
      manifest,
      tronProfile,
      productionReady,
    );
    if (productionReady.invalid) {
      fail(
        checks,
        "production-ready",
        "Route manifest is explicitly production-ready.",
        "productionReady must be boolean true.",
      );
    } else if (!productionReady.ready && !allowSelectedTestnetRoute) {
      fail(
        checks,
        "production-ready",
        "Route manifest is explicitly production-ready.",
        readFirstString(manifest, "disabledReason", "disabled_reason") ||
          "productionReady is not true.",
      );
    } else {
      pass(
        checks,
        "production-ready",
        "Route manifest is explicitly production-ready.",
        allowSelectedTestnetRoute
          ? `Explicit ${tronProfile.label} draft accepted.`
          : undefined,
      );
    }

    validateAddressCheck(
      checks,
      "tron-bridge-address",
      "TRON bridge contract address is a valid Base58Check address.",
      readSccpTronBridgeAddress(manifest),
    );
    validateAddressCheck(
      checks,
      "tron-token-address",
      "TairaXOR token contract address is a valid Base58Check address.",
      readSccpTronTokenAddress(manifest),
    );
    validateAddressCheck(
      checks,
      "tron-source-bridge-address",
      "TRON source bridge contract address is a valid Base58Check address.",
      readSccpTronSourceBridgeAddress(manifest),
    );
    validateAddressCheck(
      checks,
      "tron-verifier-address",
      "TRON verifier identity is a valid Base58Check address.",
      readSccpTronVerifierAddress(manifest),
    );
    validateDistinctTronContractAddresses(checks, manifest);

    const proofMaterial = readSccpTronProofMaterial(manifest, tronProfile.key);
    if (!proofMaterial) {
      fail(
        checks,
        "tron-proof-material",
        "TRON destination verifier rollout material is complete.",
        `Expected ${tronProfile.label} network id, verifier code hash, verifier key hash, and binding hash.`,
      );
    } else {
      pass(
        checks,
        "tron-proof-material",
        "TRON destination verifier rollout material is complete.",
        proofMaterial.networkIdHex,
      );
    }

    try {
      const binding = validateDestinationBinding(manifest, tronProfile.key);
      pass(
        checks,
        "destination-binding",
        "TRON destination binding is versioned and route-bound.",
        `${binding.key} / ${binding.bindingHash}`,
      );
    } catch (error) {
      fail(
        checks,
        "destination-binding",
        "TRON destination binding is versioned and route-bound.",
        error instanceof Error ? error.message : "Destination binding invalid.",
      );
    }

    if (productionReady.ready || hasPostDeployLiveEvidence(manifest)) {
      try {
        readPostDeployLiveEvidence(manifest);
        pass(
          checks,
          "post-deploy-live-evidence",
          "TRON source-event and route-canary live evidence are complete.",
        );
      } catch (error) {
        fail(
          checks,
          "post-deploy-live-evidence",
          "TRON source-event and route-canary live evidence are complete.",
          error instanceof Error
            ? error.message
            : "Post-deploy live evidence invalid.",
        );
      }
    } else if (allowSelectedTestnetRoute) {
      pass(
        checks,
        "post-deploy-live-evidence",
        "TRON source-event and route-canary live evidence are complete.",
        `Skipped for explicit ${tronProfile.label} draft.`,
      );
    }

    const burnRecordMaterial = readSccpTairaBurnRecordMaterial(manifest);
    try {
      validateBurnRecordMaterial(burnRecordMaterial);
      pass(
        checks,
        "taira-burn-record",
        "TAIRA burn-record ZK contract material is deployable.",
        burnRecordMaterial.settlementAssetDefinitionId,
      );
    } catch (error) {
      fail(
        checks,
        "taira-burn-record",
        "TAIRA burn-record ZK contract material is deployable.",
        error instanceof Error
          ? error.message
          : "Burn-record material invalid.",
      );
    }
  }

  const tronContracts = tronContractReadback;
  if (errors.tronContracts) {
    fail(
      checks,
      "tron-contract-readback",
      "TRON contract view readback matches the route manifest.",
      errors.tronContracts,
    );
  } else if (tronContracts) {
    const expectedBridgeAddress = manifest
      ? tronSolidityAddressHex(readSccpTronBridgeAddress(manifest))
      : "";
    const expectedBindingHash = manifest
      ? readSccpTronProofMaterial(manifest, tronProfile.key)
          ?.expectedDestinationBindingHashHex
      : null;
    let failedReadback = false;
    if (tronContracts.tokenBridgeAddress !== expectedBridgeAddress) {
      failedReadback = true;
      fail(
        checks,
        "tron-token-bridge-readback",
        "TairaXOR.bridge() points at the SCCP bridge.",
        "Token bridge address does not match the manifest bridge address.",
      );
    } else {
      pass(
        checks,
        "tron-token-bridge-readback",
        "TairaXOR.bridge() points at the SCCP bridge.",
      );
    }
    if (tronContracts.tokenBridgeLocked !== true) {
      failedReadback = true;
      fail(
        checks,
        "tron-token-lock-readback",
        "TairaXOR.bridgeLocked() is true.",
        "Token bridge is not locked.",
      );
    } else {
      pass(
        checks,
        "tron-token-lock-readback",
        "TairaXOR.bridgeLocked() is true.",
      );
    }
    if (tronContracts.sourceBridgeOwner !== expectedBridgeAddress) {
      failedReadback = true;
      fail(
        checks,
        "tron-source-owner-readback",
        "SccpTronSourceBridge.owner() is the SCCP bridge.",
        "Source bridge owner does not match the manifest bridge address.",
      );
    } else {
      pass(
        checks,
        "tron-source-owner-readback",
        "SccpTronSourceBridge.owner() is the SCCP bridge.",
      );
    }
    if (
      !expectedBindingHash ||
      tronContracts.bridgeDestinationBindingHash !== expectedBindingHash
    ) {
      failedReadback = true;
      fail(
        checks,
        "tron-bridge-binding-readback",
        "TairaXorSccpBridge.destinationBindingHash() matches rollout evidence.",
        "Bridge destination binding hash does not match the manifest.",
      );
    } else {
      pass(
        checks,
        "tron-bridge-binding-readback",
        "TairaXorSccpBridge.destinationBindingHash() matches rollout evidence.",
        expectedBindingHash,
      );
    }
    if (
      !expectedBindingHash ||
      tronContracts.verifierDestinationBindingHash !== expectedBindingHash
    ) {
      failedReadback = true;
      fail(
        checks,
        "tron-verifier-binding-readback",
        "Verifier destinationBindingHash() matches rollout evidence.",
        "Verifier destination binding hash does not match the manifest.",
      );
    } else {
      pass(
        checks,
        "tron-verifier-binding-readback",
        "Verifier destinationBindingHash() matches rollout evidence.",
        expectedBindingHash,
      );
    }
    if (!failedReadback) {
      pass(
        checks,
        "tron-contract-readback",
        "TRON contract view readback matches the route manifest.",
        tronContracts.endpoint,
      );
    }
  }

  const failedChecks = checks.filter((check) => check.status === "fail");
  const failedCheckIds = new Set(failedChecks.map((check) => check.id));
  const routeManifestMissing = failedCheckIds.has("route-manifest");
  let postDeployLiveEvidence = null;
  if (manifest) {
    try {
      postDeployLiveEvidence = readPostDeployLiveEvidence(manifest);
    } catch (_error) {
      postDeployLiveEvidence = null;
    }
  }
  const deployment = manifest
    ? {
        bridgeAddress: readSccpTronBridgeAddress(manifest) || null,
        tokenAddress: readSccpTronTokenAddress(manifest) || null,
        sourceBridgeAddress: readSccpTronSourceBridgeAddress(manifest) || null,
        verifierAddress: readSccpTronVerifierAddress(manifest) || null,
        networkIdHex:
          readSccpTronProofMaterial(manifest, tronProfile.key)?.networkIdHex ??
          null,
        settlementAssetDefinitionId:
          readSccpTairaBurnRecordMaterial(manifest)
            ?.settlementAssetDefinitionId ?? null,
      }
    : null;

  return {
    ready: failedChecks.length === 0,
    checkedAt,
    endpoint,
    tronNetwork: tronProfile.key,
    manifestSource: usesLocalManifestFile ? "file" : "endpoint",
    routeId: SCCP_XOR_ROUTE_ID,
    assetKey: SCCP_XOR_ASSET_KEY,
    deployment,
    postDeployLiveEvidence,
    checks,
    reasons: failedChecks.map((check) => check.detail || check.label),
    nextSteps:
      failedChecks.length === 0
        ? usesLocalManifestFile
          ? [
              "Publish this route manifest into the TAIRA endpoint configuration, then rerun preflight without --manifest-file before live transfer smoke.",
              "Run one tiny TAIRA -> TRON transfer and one tiny TRON -> TAIRA transfer with real WalletConnect approvals after public route publication is complete.",
            ]
          : [
              "Run one tiny TAIRA -> TRON transfer and one tiny TRON -> TAIRA transfer with real WalletConnect approvals after deployment funding is complete.",
            ]
        : routeManifestMissing
          ? [
              "Publish or activate the taira_tron_xor/xor route manifest in the TAIRA endpoint configuration, then rerun preflight without --manifest-file.",
            ]
          : [
              "Deploy or activate the missing TRON contracts, verifier material, TAIRA burn-record contract material, and route manifest evidence before live transfer smoke.",
            ],
  };
};

export const normalizeToriiEndpoint = (value, { allowLocal = false } = {}) => {
  const raw = trimString(value);
  if (!raw) {
    throw new Error("Torii endpoint is required.");
  }
  const parsed = new URL(raw);
  const isLocal =
    ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname) ||
    parsed.hostname.endsWith(".localhost");
  if (
    parsed.protocol !== "https:" &&
    !(allowLocal && parsed.protocol === "http:" && isLocal)
  ) {
    throw new Error("SCCP route preflight requires an HTTPS Torii endpoint.");
  }
  if (parsed.username || parsed.password) {
    throw new Error("Torii endpoint must not include credentials.");
  }
  if (parsed.search || parsed.hash) {
    throw new Error(
      "Torii endpoint must not include query strings or fragments.",
    );
  }
  const path = parsed.pathname.replace(/\/+$/u, "");
  return `${parsed.origin}${path === "/" ? "" : path}`;
};

const parseIpv4Octets = (hostname) => {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/u.test(hostname)) {
    return null;
  }
  const parts = hostname.split(".");
  const octets = parts.map((part) => Number(part));
  return octets.every(
    (part) => Number.isInteger(part) && part >= 0 && part <= 255,
  )
    ? octets
    : null;
};

const isPrivateOrReservedIpv4Octets = (octets) => {
  const [first, second] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    first >= 224
  );
};

const isPrivateOrReservedIpv4 = (hostname) => {
  const octets = parseIpv4Octets(hostname);
  if (!octets) {
    return false;
  }
  return isPrivateOrReservedIpv4Octets(octets);
};

const parseIpv6Hextets = (hostname) => {
  if (!hostname.includes(":")) {
    return null;
  }
  const parts = hostname.split("::");
  if (parts.length > 2) {
    return null;
  }
  const parseSide = (side) =>
    side
      ? side.split(":").map((part) => {
          if (!/^[0-9a-f]{1,4}$/iu.test(part)) {
            return Number.NaN;
          }
          return Number.parseInt(part, 16);
        })
      : [];
  const left = parseSide(parts[0]);
  const right = parseSide(parts[1] ?? "");
  if (
    [...left, ...right].some((hextet) => !Number.isInteger(hextet)) ||
    (parts.length === 1 && left.length !== 8) ||
    left.length + right.length > 8
  ) {
    return null;
  }
  const zeroFill =
    parts.length === 2 ? Array(8 - left.length - right.length).fill(0) : [];
  return [...left, ...zeroFill, ...right];
};

const hextetsToIpv4Octets = (high, low) => [
  (high >> 8) & 0xff,
  high & 0xff,
  (low >> 8) & 0xff,
  low & 0xff,
];

const hasPrivateOrReservedEmbeddedIpv4 = (hextets) => {
  if (hextets.length !== 8) {
    return false;
  }
  const lastIpv4 = hextetsToIpv4Octets(hextets[6], hextets[7]);
  const leadingCompatibleZeros = hextets
    .slice(0, 6)
    .every((part) => part === 0);
  const leadingMappedZeros =
    hextets.slice(0, 5).every((part) => part === 0) && hextets[5] === 0xffff;
  const nat64WellKnownPrefix =
    hextets[0] === 0x64 &&
    hextets[1] === 0xff9b &&
    hextets.slice(2, 6).every((part) => part === 0);
  if (
    (leadingCompatibleZeros || leadingMappedZeros || nat64WellKnownPrefix) &&
    isPrivateOrReservedIpv4Octets(lastIpv4)
  ) {
    return true;
  }
  if (hextets[0] === 0x2002) {
    return isPrivateOrReservedIpv4Octets(
      hextetsToIpv4Octets(hextets[1], hextets[2]),
    );
  }
  return false;
};

export const normalizeTronGatewayEndpoint = (
  value = DEFAULT_TRON_GATEWAY_URL,
) => {
  const endpoint = normalizeToriiEndpoint(value || DEFAULT_TRON_GATEWAY_URL);
  const parsed = new URL(endpoint);
  const hostname = parsed.hostname
    .trim()
    .toLowerCase()
    .replace(/^\[/u, "")
    .replace(/\]$/u, "")
    .replace(/\.$/u, "");
  const hextets = hostname.includes(":") ? parseIpv6Hextets(hostname) : null;
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "local" ||
    hostname === "::1" ||
    hostname === "::" ||
    isPrivateOrReservedIpv4(hostname) ||
    (hextets &&
      (hasPrivateOrReservedEmbeddedIpv4(hextets) ||
        (hextets[0] === 0x2001 && hextets[1] === 0)))
  ) {
    throw new Error("TRON gateway endpoint must not target a local network.");
  }
  return endpoint;
};

const normalizeKey = (key) => key.replace(/[-_\s]/gu, "").toLowerCase();

const normalizeNetworkPrefix = (value) => {
  const candidate = typeof value === "string" ? value.trim() : value;
  if (candidate === null || candidate === undefined || candidate === "") {
    return null;
  }
  const normalized = Number(candidate);
  if (!Number.isInteger(normalized) || normalized < 0 || normalized > 0x3fff) {
    return null;
  }
  return normalized;
};

const isChainIdKey = (key, path) => {
  const normalized = normalizeKey(key);
  if (["chainid", "genesisid", "networkchainid"].includes(normalized)) {
    return true;
  }
  return (
    normalized === "id" &&
    path.some((segment) => normalizeKey(segment).includes("chain"))
  );
};

const isNetworkPrefixKey = (key, path) => {
  const normalized = normalizeKey(key);
  if (
    [
      "networkprefix",
      "addressprefix",
      "accountprefix",
      "accountaddressprefix",
      "chaindiscriminant",
      "networkdiscriminant",
    ].includes(normalized)
  ) {
    return true;
  }
  return (
    normalized === "prefix" &&
    path.some((segment) =>
      ["account", "address", "chain", "i105", "network"].some((marker) =>
        normalizeKey(segment).includes(marker),
      ),
    )
  );
};

const extractChainMetadataFromPayload = (payload) => {
  const draft = {};
  const visit = (value, path) => {
    if (draft.chainId && draft.networkPrefix !== undefined) {
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item, path);
      }
      return;
    }
    if (!isRecord(value)) {
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      if (!draft.chainId && isChainIdKey(key, path)) {
        const chainId = trimString(child);
        if (chainId) {
          draft.chainId = chainId;
        }
      }
      if (draft.networkPrefix === undefined && isNetworkPrefixKey(key, path)) {
        const prefix = normalizeNetworkPrefix(child);
        if (prefix !== null) {
          draft.networkPrefix = prefix;
        }
      }
      visit(child, [...path, key]);
    }
  };
  visit(payload, []);
  return draft;
};

const mergeChainMetadata = (current, next) => ({
  chainId: current.chainId || next.chainId,
  networkPrefix:
    current.networkPrefix === undefined
      ? next.networkPrefix
      : current.networkPrefix,
});

const metadataFromHeaders = (headers) =>
  extractChainMetadataFromPayload({
    chain_id: headers.get?.("x-iroha-chain-id"),
    chainId: headers.get?.("x-iroha-chain-id"),
    network_prefix: headers.get?.("x-iroha-network-prefix"),
    networkPrefix: headers.get?.("x-iroha-network-prefix"),
  });

const normalizeChainMetadata = (draft, fallback) => {
  const chainId = trimString(draft.chainId || fallback?.chainId);
  const networkPrefix =
    normalizeNetworkPrefix(draft.networkPrefix) ??
    normalizeNetworkPrefix(fallback?.networkPrefix);
  if (!chainId) {
    throw new Error("Torii endpoint did not expose a chain ID.");
  }
  if (networkPrefix === null) {
    throw new Error("Torii endpoint did not expose a valid network prefix.");
  }
  return { chainId, networkPrefix };
};

const knownTairaFallback = (endpoint) => {
  const origin = new URL(endpoint).origin;
  return origin === DEFAULT_TAIRA_TORII_URL
    ? { chainId: TAIRA_CHAIN_ID, networkPrefix: TAIRA_NETWORK_PREFIX }
    : undefined;
};

const fetchJson = async (fetchImpl, baseUrl, path, label, timeoutMs) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(new URL(path, `${baseUrl}/`), {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`${label} returned HTTP ${response.status}.`);
    }
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
};

const postJson = async (fetchImpl, baseUrl, path, body, label, timeoutMs) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(new URL(path, `${baseUrl}/`), {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`${label} returned HTTP ${response.status}.`);
    }
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
};

const triggerTronConstant = async ({
  fetchImpl,
  endpoint,
  ownerAddress,
  contractAddress,
  functionSelector,
  label,
  timeoutMs,
}) =>
  postJson(
    fetchImpl,
    endpoint,
    "/wallet/triggerconstantcontract",
    {
      owner_address: normalizeTronAddress(ownerAddress),
      contract_address: normalizeTronAddress(contractAddress),
      function_selector: functionSelector,
      parameter: "",
      visible: true,
    },
    label,
    timeoutMs,
  );

export const fetchTronContractReadback = async ({
  manifest,
  endpoint = DEFAULT_TRON_GATEWAY_URL,
  fetchImpl = globalThis.fetch,
  timeoutMs = 10_000,
} = {}) => {
  const normalizedEndpoint = normalizeTronGatewayEndpoint(endpoint);
  const tokenAddress = normalizeTronAddress(readSccpTronTokenAddress(manifest));
  const bridgeAddress = normalizeTronAddress(
    readSccpTronBridgeAddress(manifest),
  );
  const sourceBridgeAddress = normalizeTronAddress(
    readSccpTronSourceBridgeAddress(manifest),
  );
  const verifierAddress = normalizeTronAddress(
    readSccpTronVerifierAddress(manifest),
  );
  const [
    tokenBridge,
    tokenLocked,
    sourceOwner,
    bridgeBinding,
    verifierBinding,
  ] = await Promise.all([
    triggerTronConstant({
      fetchImpl,
      endpoint: normalizedEndpoint,
      ownerAddress: bridgeAddress,
      contractAddress: tokenAddress,
      functionSelector: "bridge()",
      label: "TairaXOR.bridge()",
      timeoutMs,
    }),
    triggerTronConstant({
      fetchImpl,
      endpoint: normalizedEndpoint,
      ownerAddress: bridgeAddress,
      contractAddress: tokenAddress,
      functionSelector: "bridgeLocked()",
      label: "TairaXOR.bridgeLocked()",
      timeoutMs,
    }),
    triggerTronConstant({
      fetchImpl,
      endpoint: normalizedEndpoint,
      ownerAddress: bridgeAddress,
      contractAddress: sourceBridgeAddress,
      functionSelector: "owner()",
      label: "SccpTronSourceBridge.owner()",
      timeoutMs,
    }),
    triggerTronConstant({
      fetchImpl,
      endpoint: normalizedEndpoint,
      ownerAddress: bridgeAddress,
      contractAddress: bridgeAddress,
      functionSelector: "destinationBindingHash()",
      label: "TairaXorSccpBridge.destinationBindingHash()",
      timeoutMs,
    }),
    triggerTronConstant({
      fetchImpl,
      endpoint: normalizedEndpoint,
      ownerAddress: bridgeAddress,
      contractAddress: verifierAddress,
      functionSelector: "destinationBindingHash()",
      label: "Verifier.destinationBindingHash()",
      timeoutMs,
    }),
  ]);
  return {
    endpoint: normalizedEndpoint,
    tokenBridgeAddress: readTronConstantAddress(
      tokenBridge,
      "TairaXOR.bridge()",
    ),
    tokenBridgeLocked: readTronConstantBool(
      tokenLocked,
      "TairaXOR.bridgeLocked()",
    ),
    sourceBridgeOwner: readTronConstantAddress(
      sourceOwner,
      "SccpTronSourceBridge.owner()",
    ),
    bridgeDestinationBindingHash: readTronConstantBytes32(
      bridgeBinding,
      "TairaXorSccpBridge.destinationBindingHash()",
    ),
    verifierDestinationBindingHash: readTronConstantBytes32(
      verifierBinding,
      "Verifier.destinationBindingHash()",
    ),
  };
};

export const fetchTairaChainMetadata = async ({
  endpoint,
  fetchImpl = globalThis.fetch,
  timeoutMs = 10_000,
} = {}) => {
  let draft = {};
  let reachedEndpoint = false;
  let lastError = null;
  for (const path of CHAIN_METADATA_PATHS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(new URL(path, `${endpoint}/`), {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      reachedEndpoint = true;
      draft = mergeChainMetadata(draft, metadataFromHeaders(response.headers));
      if ([401, 403, 404, 503].includes(response.status)) {
        continue;
      }
      if (!response.ok) {
        throw new Error(`Chain metadata returned HTTP ${response.status}.`);
      }
      const contentType = response.headers.get?.("content-type") ?? "";
      const payload = contentType.toLowerCase().includes("json")
        ? await response.json()
        : null;
      draft = mergeChainMetadata(
        draft,
        extractChainMetadataFromPayload(payload),
      );
      if (draft.chainId && draft.networkPrefix !== undefined) {
        return { metadata: normalizeChainMetadata(draft), warnings: [] };
      }
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeout);
    }
  }

  if (!reachedEndpoint && lastError) {
    throw lastError;
  }

  const fallback = knownTairaFallback(endpoint);
  return {
    metadata: normalizeChainMetadata(draft, fallback),
    warnings: fallback
      ? [
          "Endpoint did not expose full metadata; used the known TAIRA endpoint fallback.",
        ]
      : [],
  };
};

export const runSccpRoutePreflight = async ({
  endpoint = DEFAULT_TAIRA_TORII_URL,
  tronNetwork = "mainnet",
  tronEndpoint,
  manifestFilePath,
  checkTronContracts = false,
  fetchImpl = globalThis.fetch,
  readManifestFile = loadSccpRouteManifestFile,
  timeoutMs = 10_000,
} = {}) => {
  const tronProfile = resolveSccpTronNetworkProfile(tronNetwork);
  const normalizedTronEndpoint = tronEndpoint ?? tronProfile.gatewayUrl;
  const errors = {};
  const warnings = [];
  let chainMetadata = null;
  let capabilities = null;
  let endpointManifestSet = null;
  let manifestSet = null;
  let manifestSource = "endpoint";
  let tronContractReadback = null;

  try {
    const chain = await fetchTairaChainMetadata({
      endpoint,
      fetchImpl,
      timeoutMs,
    });
    chainMetadata = chain.metadata;
    warnings.push(...chain.warnings);
  } catch (error) {
    errors.chainMetadata =
      error instanceof Error ? error.message : "Unable to load chain metadata.";
  }

  try {
    capabilities = await fetchJson(
      fetchImpl,
      endpoint,
      SCCP_CAPABILITIES_PATH,
      "SCCP capabilities",
      timeoutMs,
    );
  } catch (error) {
    errors.capabilities =
      error instanceof Error
        ? error.message
        : "Unable to load SCCP capabilities.";
  }

  try {
    endpointManifestSet = await fetchJson(
      fetchImpl,
      endpoint,
      SCCP_MANIFESTS_PATH,
      "SCCP manifests",
      timeoutMs,
    );
  } catch (error) {
    errors.manifests =
      error instanceof Error ? error.message : "Unable to load SCCP manifests.";
  }

  manifestSet = endpointManifestSet;
  if (manifestFilePath) {
    try {
      manifestSet = await readManifestFile(manifestFilePath);
      manifestSource = "file";
      if (!pickTairaTronXorManifest(endpointManifestSet, tronProfile.key)) {
        warnings.push(
          "Using a local SCCP manifest file; the public TAIRA endpoint still does not advertise this route.",
        );
      }
    } catch (error) {
      manifestSet = null;
      errors.manifests =
        error instanceof Error
          ? error.message
          : "Unable to load SCCP route manifest file.";
    }
  }

  if (checkTronContracts) {
    const manifest = pickTairaTronXorManifest(manifestSet, tronProfile.key);
    if (!manifest) {
      errors.tronContracts =
        "Cannot read TRON contracts before the taira_tron_xor manifest is available.";
    } else {
      try {
        tronContractReadback = await fetchTronContractReadback({
          manifest,
          endpoint: normalizedTronEndpoint,
          fetchImpl,
          timeoutMs,
        });
      } catch (error) {
        errors.tronContracts =
          error instanceof Error
            ? error.message
            : "Unable to read TRON contract views.";
      }
    }
  }

  return evaluateSccpRoutePreflight({
    endpoint,
    tronNetwork: tronProfile.key,
    chainMetadata,
    capabilities,
    manifestSet,
    tronContractReadback,
    manifestSource,
    errors,
    warnings,
  });
};

const parseArgs = (argv) => {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      throw new Error(`Unexpected argument: ${token}`);
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = "true";
    } else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
};

const parseBoolean = (value) =>
  ["1", "true", "yes", "on"].includes(trimString(value).toLowerCase());

const cli = async () => {
  const args = parseArgs(process.argv.slice(2));
  const tronProfile = resolveSccpTronNetworkProfile(
    args["tron-network"] ||
      process.env.SCCP_TRON_NETWORK ||
      process.env.VITE_SCCP_TRON_NETWORK ||
      "mainnet",
  );
  const endpoint = normalizeToriiEndpoint(
    args.endpoint ||
      args["torii-url"] ||
      process.env.SCCP_TAIRA_TORII_URL ||
      process.env.TAIRA_TORII_URL ||
      process.env.E2E_TORII_URL ||
      DEFAULT_TAIRA_TORII_URL,
    { allowLocal: parseBoolean(args["allow-local"]) },
  );
  const tronEndpoint = normalizeTronGatewayEndpoint(
    args["tron-endpoint"] ||
      process.env.SCCP_TRON_GATEWAY_URL ||
      process.env.TRON_GATEWAY_URL ||
      tronProfile.gatewayUrl,
  );
  const timeoutMs = Number(args["timeout-ms"] ?? 10_000);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error("--timeout-ms must be a positive integer.");
  }
  const report = await runSccpRoutePreflight({
    endpoint,
    tronNetwork: tronProfile.key,
    tronEndpoint,
    manifestFilePath:
      args["manifest-file"] ||
      process.env.SCCP_ROUTE_MANIFEST_FILE ||
      process.env.VITE_SCCP_ROUTE_MANIFEST_FILE ||
      undefined,
    checkTronContracts: parseBoolean(args["check-tron-contracts"]),
    timeoutMs,
  });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.ready && !parseBoolean(args["allow-not-ready"])) {
    process.exitCode = 1;
  }
};

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? "")) {
  cli().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}

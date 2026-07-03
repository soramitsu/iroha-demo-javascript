#!/usr/bin/env node

import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_TAIRA_TORII_URL = "https://taira.sora.org";
const SCCP_TON_DOMAIN = 4;
const SCCP_SORA_DOMAIN = 0;
const SCCP_TON_CHAIN_KEY = "ton";
const SCCP_TON_XOR_ROUTE_ID = "taira_ton_xor";
const SCCP_TON_RAW_CODEC = "ton_raw";
const TON_SOURCE_STATE_VERIFIER_ID =
  "sccp:ton:source-state-verifier:shard-state-light-client-mainnet:v1";
const REPEATED_BYTE_HEX32_RE = /^0x([0-9a-f]{2})\1{31}$/u;
const TON_GOVERNED_SOURCE_ADAPTER_AUDIT_HASHES = new Set([
  `0x${"26".repeat(32)}`,
  `0x${"27".repeat(32)}`,
  `0x${"28".repeat(32)}`,
]);
const TON_GOVERNED_SOURCE_ADAPTER_AUDIT_KEYS = new Set([
  "ton_masterchain_config_verifier_hash",
  "ton_validator_set_transition_verifier_hash",
  "ton_shard_accounts_dictionary_verifier_hash",
]);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const args = process.argv.slice(2);

const readArgValue = (name, fallback = "") => {
  const index = args.indexOf(name);
  if (index < 0) {
    return fallback;
  }
  const value = args[index + 1];
  return value && !value.startsWith("--") ? value : fallback;
};

const hasArg = (name) => args.includes(name);

const normalizeBaseUrl = (value) => {
  const normalized = String(value ?? "")
    .trim()
    .replace(/\/+$/u, "");
  if (!/^https?:\/\/[^/\s]+/u.test(normalized)) {
    throw new Error("TAIRA Torii URL must be an absolute HTTP(S) URL.");
  }
  return normalized;
};

const toriiUrl = normalizeBaseUrl(
  readArgValue("--torii-url", process.env.TAIRA_TORII_URL) ||
    DEFAULT_TAIRA_TORII_URL,
);
const outputPath = readArgValue("--output", "");
const jsonOnly = hasArg("--json");

const isRecord = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readString = (record, ...keys) => {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
};

const readNumber = (record, ...keys) => {
  for (const key of keys) {
    const value = record?.[key];
    if (value === undefined || value === null || value === "") {
      continue;
    }
    const parsed = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
};

const readBoolean = (record, ...keys) => {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "boolean") {
      return value;
    }
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (normalized === "true") {
        return true;
      }
      if (normalized === "false") {
        return false;
      }
    }
  }
  return false;
};

const readRecord = (record, ...keys) => {
  for (const key of keys) {
    const value = record?.[key];
    if (isRecord(value)) {
      return value;
    }
  }
  return null;
};

const listRecords = (value) =>
  Array.isArray(value) ? value.filter((entry) => isRecord(entry)) : [];

const fetchJson = async (baseUrl, path) => {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`${path} returned HTTP ${response.status}`);
  }
  return response.json();
};

const normalizeTonRawAddress = (value) => {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  const match = /^(-?\d+):([0-9a-f]{64})$/u.exec(normalized);
  if (!match) {
    return "";
  }
  const workchain = Number(match[1]);
  if (!Number.isInteger(workchain) || workchain < -1 || workchain > 255) {
    return "";
  }
  if (/^0{64}$/u.test(match[2])) {
    return "";
  }
  return `${workchain}:${match[2]}`;
};

const readTonAddress = (record, ...keys) => {
  const value = readString(record, ...keys);
  return value ? normalizeTonRawAddress(value) : "";
};

const normalizeProductionHex32 = (
  value,
  label,
  { allowTonGovernedAuditHash = false } = {},
) => {
  const normalized = `0x${String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^0x/u, "")}`;
  if (!/^0x[0-9a-f]{64}$/u.test(normalized)) {
    throw new Error(`${label} must be a 32-byte hex value.`);
  }
  if (/^0x0{64}$/u.test(normalized)) {
    throw new Error(`${label} must be non-zero.`);
  }
  if (
    REPEATED_BYTE_HEX32_RE.test(normalized) &&
    !(
      allowTonGovernedAuditHash &&
      TON_GOVERNED_SOURCE_ADAPTER_AUDIT_HASHES.has(normalized)
    )
  ) {
    throw new Error(`${label} must not be repeated-byte placeholder material.`);
  }
  return normalized;
};

const readHashField = (record, label, keys, options = {}) => {
  const value = readString(record, ...keys);
  if (!value) {
    return { ok: false, error: `${label} is missing.` };
  }
  try {
    return {
      ok: true,
      value: normalizeProductionHex32(value, label, options),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

const validateHashField = (record, blockers, label, keys, options = {}) => {
  const result = readHashField(record, label, keys, options);
  if (!result.ok) {
    blockers.push(result.error);
  }
};

const isLoopbackHost = (hostname) => {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "[::1]" ||
    /^127(?:\.\d{1,3}){3}$/u.test(normalized)
  );
};

const hasUnsafeModuleUrlCharacter = (value) => {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x20 || code === 0x7f) {
      return true;
    }
  }
  return false;
};

const normalizeBrowserModuleUrl = (value, label, blockers) => {
  const moduleUrl = String(value ?? "").trim();
  if (!moduleUrl) {
    blockers.push(`${label} module_url is missing.`);
    return "";
  }
  if (hasUnsafeModuleUrlCharacter(moduleUrl)) {
    blockers.push(`${label} module_url must not contain whitespace.`);
    return "";
  }
  if (/[?#]/u.test(moduleUrl)) {
    blockers.push(
      `${label} module_url must not include query strings or fragments.`,
    );
    return "";
  }
  if (/(?:^|[\\/])\.\.(?:[\\/]|$)/u.test(moduleUrl)) {
    blockers.push(
      `${label} module_url must not include parent directory segments.`,
    );
    return "";
  }
  if (/^(?:\/(?!\/)|\.\/)/u.test(moduleUrl)) {
    return moduleUrl;
  }
  try {
    const parsed = new URL(moduleUrl);
    if (parsed.username || parsed.password) {
      blockers.push(`${label} module_url must not include credentials.`);
      return "";
    }
    if (parsed.protocol === "https:") {
      return parsed.toString();
    }
    if (parsed.protocol === "http:" && isLoopbackHost(parsed.hostname)) {
      return parsed.toString();
    }
  } catch (_error) {
    // handled below
  }
  blockers.push(
    `${label} module_url must be a package-relative path, HTTPS URL, or loopback HTTP URL.`,
  );
  return "";
};

const validateBrowserProver = ({
  route,
  keys,
  label,
  expectedExport,
  blockers,
}) => {
  const record = readRecord(route, ...keys);
  if (!record) {
    blockers.push(`${label} is missing from the TON route.`);
    return;
  }
  const moduleUrl = normalizeBrowserModuleUrl(
    readString(record, "module_url", "moduleUrl", "url", "href"),
    label,
    blockers,
  );
  validateHashField(record, blockers, `${label}.module_hash`, [
    "module_hash",
    "moduleHash",
  ]);
  validateHashField(record, blockers, `${label}.manifest_hash`, [
    "manifest_hash",
    "manifestHash",
  ]);
  validateHashField(record, blockers, `${label}.bound_route_hash`, [
    "bound_route_hash",
    "boundRouteHash",
  ]);
  validateHashField(record, blockers, `${label}.bound_proof_hash`, [
    "bound_proof_hash",
    "boundProofHash",
  ]);
  const exports = Array.isArray(record.expected_exports)
    ? record.expected_exports
    : Array.isArray(record.expectedExports)
      ? record.expectedExports
      : [];
  if (!exports.includes(expectedExport)) {
    blockers.push(`${label} must declare ${expectedExport}.`);
  }
  if (moduleUrl.startsWith("./") || moduleUrl.startsWith("/")) {
    const modulePaths = moduleUrl.startsWith("/")
      ? [
          resolve(repoRoot, moduleUrl.slice(1)),
          resolve(repoRoot, "public", moduleUrl.slice(1)),
        ]
      : [resolve(repoRoot, moduleUrl)];
    if (!modulePaths.some((modulePath) => existsSync(modulePath))) {
      blockers.push(
        `${label} module_url points at a file that is not bundled: ${moduleUrl}.`,
      );
    }
  }
};

const findTonLane = (capabilities) =>
  listRecords(capabilities?.counterparties).find(
    (entry) =>
      readNumber(entry, "domain", "counterparty_domain") === SCCP_TON_DOMAIN ||
      readString(entry, "chain").toLowerCase() === "ton",
  ) ?? null;

const findTonRoute = (manifests) =>
  listRecords(manifests?.routes).find(
    (entry) =>
      readString(entry, "route_id", "routeId") === SCCP_TON_XOR_ROUTE_ID,
  ) ?? null;

const findGenericTonManifest = (manifests) =>
  listRecords(manifests?.manifests).find(
    (entry) =>
      readNumber(entry, "counterparty_domain", "counterpartyDomain") ===
        SCCP_TON_DOMAIN || readString(entry, "chain").toLowerCase() === "ton",
  ) ?? null;

const readBurnRecord = (route) =>
  readRecord(route, "taira_xor_burn_record", "tairaXorBurnRecord");

const readTonFinalizeMessageValueNano = (route) => {
  const rollout = readRecord(
    route,
    "destination_rollout",
    "destinationRollout",
  );
  return (
    readString(route, "ton_finalize_message_value_nano") ||
    readString(route, "tonFinalizeMessageValueNano") ||
    readString(route, "ton_verifier_message_value_nano") ||
    readString(route, "tonVerifierMessageValueNano") ||
    readString(route, "ton_internal_message_value_nano") ||
    readString(route, "tonInternalMessageValueNano") ||
    readString(rollout, "finalize_message_value_nano") ||
    readString(rollout, "finalizeMessageValueNano") ||
    readString(rollout, "verifier_message_value_nano") ||
    readString(rollout, "verifierMessageValueNano") ||
    readString(rollout, "internal_message_value_nano") ||
    readString(rollout, "internalMessageValueNano") ||
    "100000000"
  );
};

const readTonVerifierProtocolVersion = (route) => {
  const rollout = readRecord(
    route,
    "destination_rollout",
    "destinationRollout",
  );
  return (
    readNumber(route, "ton_verifier_protocol_version") ||
    readNumber(route, "tonVerifierProtocolVersion") ||
    readNumber(route, "ton_finalize_protocol_version") ||
    readNumber(route, "tonFinalizeProtocolVersion") ||
    readNumber(rollout, "verifier_protocol_version") ||
    readNumber(rollout, "verifierProtocolVersion") ||
    readNumber(rollout, "finalize_protocol_version") ||
    readNumber(rollout, "finalizeProtocolVersion") ||
    1
  );
};

const readSourceLaneRecord = (route, ...keys) => readRecord(route, ...keys);

const readSccpLaneMaterialPayload = (parameters) => {
  if (!isRecord(parameters)) {
    return null;
  }
  const custom = readRecord(parameters, "custom", "Custom") ?? parameters;
  const customId = readString(custom, "id");
  const customIsLaneMaterials =
    customId === "sccp_lane_materials_v1" || customId === "sccpLaneMaterialsV1";
  const container =
    readRecord(custom, "sccp_lane_materials_v1", "sccpLaneMaterialsV1") ??
    (customIsLaneMaterials ? custom : null) ??
    readRecord(parameters, "sccp_lane_materials_v1", "sccpLaneMaterialsV1");
  return readRecord(container, "payload") ?? container;
};

const readLaneRecordList = (payload, ...keys) => {
  for (const key of keys) {
    const records = listRecords(payload?.[key]);
    if (records.length > 0) {
      return records;
    }
  }
  return [];
};

const sourceLaneRecordTargetsTon = (record) =>
  readNumber(record, "source_domain", "sourceDomain", "domain") ===
    SCCP_TON_DOMAIN &&
  readString(record, "source_chain", "sourceChain", "chain").toLowerCase() ===
    SCCP_TON_CHAIN_KEY;

const sourceAdapterDeploymentTargetsTon = (record) =>
  sourceLaneRecordTargetsTon(record) &&
  readNumber(record, "target_domain", "targetDomain") === SCCP_SORA_DOMAIN;

const tonLaneEvidenceTargetsTon = (record) =>
  readNumber(record, "domain", "counterparty_domain", "counterpartyDomain") ===
    SCCP_TON_DOMAIN &&
  ["ton", "ton-testnet"].includes(
    readString(record, "chain", "source_chain", "sourceChain").toLowerCase(),
  );

const isLaneMaterialFieldPresent = (value) =>
  value !== null && value !== undefined && value !== "";

const mergeSupplementalLaneRecord = (existing, supplemental) => {
  const base = isRecord(existing) ? JSON.parse(JSON.stringify(existing)) : {};
  const patch = JSON.parse(JSON.stringify(supplemental));
  for (const [key, value] of Object.entries(patch)) {
    if (
      isLaneMaterialFieldPresent(value) ||
      !isLaneMaterialFieldPresent(base[key])
    ) {
      base[key] = value;
    }
  }
  return base;
};

const mergeTonLaneMaterialsIntoManifests = (manifests, parameters) => {
  const payload = readSccpLaneMaterialPayload(parameters);
  const sourceVerifierMaterial = readLaneRecordList(
    payload,
    "sccp_source_verifier_materials",
    "sccpSourceVerifierMaterials",
    "source_verifier_materials",
    "sourceVerifierMaterials",
  ).find(sourceLaneRecordTargetsTon);
  const sourceAdapterEngineDeployment = readLaneRecordList(
    payload,
    "sccp_source_adapter_engine_deployments",
    "sccpSourceAdapterEngineDeployments",
    "source_adapter_engine_deployments",
    "sourceAdapterEngineDeployments",
  ).find(sourceAdapterDeploymentTargetsTon);
  const destinationRollout = readLaneRecordList(
    payload,
    "sccp_destination_rollouts",
    "sccpDestinationRollouts",
    "destination_rollouts",
    "destinationRollouts",
  ).find(tonLaneEvidenceTargetsTon);
  const routeAllowlist = readLaneRecordList(
    payload,
    "sccp_route_allowlists",
    "sccpRouteAllowlists",
    "route_allowlists",
    "routeAllowlists",
  ).find(tonLaneEvidenceTargetsTon);

  if (
    !sourceVerifierMaterial &&
    !sourceAdapterEngineDeployment &&
    !destinationRollout &&
    !routeAllowlist
  ) {
    return manifests;
  }
  const cloned = JSON.parse(JSON.stringify(manifests));
  for (const route of listRecords(cloned?.routes)) {
    if (readString(route, "route_id", "routeId") !== SCCP_TON_XOR_ROUTE_ID) {
      continue;
    }
    if (sourceVerifierMaterial) {
      route.source_verifier_material = sourceVerifierMaterial;
      route.sourceVerifierMaterial = sourceVerifierMaterial;
    }
    if (sourceAdapterEngineDeployment) {
      route.source_adapter_engine_deployment = sourceAdapterEngineDeployment;
      route.sourceAdapterEngineDeployment = sourceAdapterEngineDeployment;
    }
    if (destinationRollout) {
      const merged = mergeSupplementalLaneRecord(
        readRecord(route, "destination_rollout", "destinationRollout"),
        destinationRollout,
      );
      route.destination_rollout = merged;
      route.destinationRollout = merged;
    }
    if (routeAllowlist) {
      const merged = mergeSupplementalLaneRecord(
        readRecord(route, "route_allowlist", "routeAllowlist"),
        routeAllowlist,
      );
      route.route_allowlist = merged;
      route.routeAllowlist = merged;
    }
  }
  return cloned;
};

const validateTonSourceLaneRecord = (record, label, blockers) => {
  if (!record) {
    blockers.push(`${label} is missing from the TON route.`);
    return;
  }
  const sourceDomain = readNumber(
    record,
    "source_domain",
    "sourceDomain",
    "domain",
  );
  if (sourceDomain !== SCCP_TON_DOMAIN) {
    blockers.push(`${label}.source_domain must be TON domain 4.`);
  }
  const targetDomain = readNumber(record, "target_domain", "targetDomain");
  if (targetDomain !== null && targetDomain !== SCCP_SORA_DOMAIN) {
    blockers.push(`${label}.target_domain must target SORA domain 0.`);
  }
  if (
    readString(record, "source_chain", "sourceChain", "chain").toLowerCase() !==
    SCCP_TON_CHAIN_KEY
  ) {
    blockers.push(
      `${label}.source_chain must be canonical "ton", not a network label.`,
    );
  }
  for (const key of [
    "source_trust_anchor_hash",
    "consensus_verifier_hash",
    "message_inclusion_verifier_hash",
    "finality_policy_hash",
    "source_state_verifier_hash",
  ]) {
    validateHashField(record, blockers, `${label}.${key}`, [
      key,
      key.replace(/_([a-z])/gu, (_match, character) => character.toUpperCase()),
    ]);
  }
  if (
    readString(record, "source_state_verifier_id", "sourceStateVerifierId") !==
    TON_SOURCE_STATE_VERIFIER_ID
  ) {
    blockers.push(`${label} has the wrong TON source-state verifier id.`);
  }
};

const validateTonSourceAdapterDeployment = (record, blockers) => {
  validateTonSourceLaneRecord(
    record,
    "TON source adapter deployment",
    blockers,
  );
  if (!record) return;
  for (const key of [
    "adapter_verifier_vk_hash",
    "deployment_receipt_hash",
    "ton_masterchain_config_verifier_hash",
    "ton_validator_set_transition_verifier_hash",
    "ton_shard_accounts_dictionary_verifier_hash",
    "ton_full_light_client_gate_hash",
  ]) {
    validateHashField(
      record,
      blockers,
      `TON source adapter deployment.${key}`,
      [
        key,
        key.replace(/_([a-z])/gu, (_match, character) =>
          character.toUpperCase(),
        ),
      ],
      {
        allowTonGovernedAuditHash:
          TON_GOVERNED_SOURCE_ADAPTER_AUDIT_KEYS.has(key),
      },
    );
  }
  if (
    readString(record, "adapter_proof_family", "adapterProofFamily") !==
    "stark-fri-v1"
  ) {
    blockers.push("TON source adapter deployment must use stark-fri-v1.");
  }
  if (
    readString(record, "adapter_circuit_id", "adapterCircuitId") !==
    "sccp-source-adapter-v1"
  ) {
    blockers.push(
      "TON source adapter deployment has the wrong adapter circuit.",
    );
  }
};

const validateRoute = ({
  capabilities,
  manifests,
  parameters,
  toriiUrl: reportToriiUrl,
}) => {
  const blockers = [];
  const effectiveManifests = mergeTonLaneMaterialsIntoManifests(
    manifests,
    parameters,
  );
  const tonLane = findTonLane(capabilities);
  const genericTonManifest = findGenericTonManifest(effectiveManifests);
  const route = findTonRoute(effectiveManifests);
  const routeProductionReady = route
    ? readBoolean(route, "production_ready", "productionReady")
    : false;
  const routeCarriesTonTrustAnchors = Boolean(
    route &&
      readRecord(route, "destination_rollout", "destinationRollout") &&
      readRecord(route, "route_allowlist", "routeAllowlist") &&
      readSourceLaneRecord(
        route,
        "source_verifier_material",
        "sourceVerifierMaterial",
      ) &&
      readSourceLaneRecord(
        route,
        "source_adapter_engine_deployment",
        "sourceAdapterEngineDeployment",
        "source_adapter_deployment",
        "sourceAdapterDeployment",
      ),
  );
  const routeEffectivelyProductionReady =
    routeProductionReady || routeCarriesTonTrustAnchors;

  if (!readString(capabilities, "message_submit_path", "messageSubmitPath")) {
    blockers.push("TAIRA SCCP capabilities do not expose message submission.");
  }
  if (!readString(capabilities, "message_job_path", "messageJobPath")) {
    blockers.push("TAIRA SCCP capabilities do not expose message proof jobs.");
  }
  if (!tonLane) {
    blockers.push("TAIRA SCCP capabilities do not advertise the TON lane.");
  } else if (!readBoolean(tonLane, "production_ready", "productionReady")) {
    if (!routeCarriesTonTrustAnchors) {
      blockers.push(
        readString(tonLane, "disabled_reason", "disabledReason") ||
          "TAIRA has not activated the TON SCCP source lane.",
      );
    }
  }
  if (!genericTonManifest) {
    blockers.push(
      "TAIRA SCCP manifests do not include a generic TON manifest.",
    );
  }
  if (!route) {
    blockers.push(
      `TAIRA SCCP manifests do not publish the ${SCCP_TON_XOR_ROUTE_ID} route.`,
    );
  }

  if (route) {
    if (!routeEffectivelyProductionReady) {
      blockers.push(`${SCCP_TON_XOR_ROUTE_ID} is not production-ready.`);
    }
    if (
      readNumber(route, "counterparty_domain", "counterpartyDomain") !==
      SCCP_TON_DOMAIN
    ) {
      blockers.push(`${SCCP_TON_XOR_ROUTE_ID} must target TON domain 4.`);
    }
    if (
      readString(
        route,
        "counterparty_account_codec_key",
        "counterpartyAccountCodecKey",
      ) !== SCCP_TON_RAW_CODEC
    ) {
      blockers.push(`${SCCP_TON_XOR_ROUTE_ID} must use ton_raw accounts.`);
    }
    if (
      !readTonAddress(
        route,
        "ton_bridge_address",
        "tonBridgeAddress",
        "taira_xor_bridge_address",
        "tairaXorBridgeAddress",
      )
    ) {
      blockers.push("The TON route is missing the TON bridge address.");
    }
    if (
      !readTonAddress(
        route,
        "ton_token_address",
        "tonTokenAddress",
        "taira_xor_token_address",
        "tairaXorTokenAddress",
      )
    ) {
      blockers.push("The TON route is missing the TON token address.");
    }
    if (
      !readTonAddress(
        route,
        "sccp_ton_source_bridge_address",
        "sccpTonSourceBridgeAddress",
        "ton_source_bridge_address",
        "tonSourceBridgeAddress",
        "source_bridge_address",
        "sourceBridgeAddress",
        "sccp_tron_source_bridge_address",
        "sccpTronSourceBridgeAddress",
      )
    ) {
      blockers.push("The TON route is missing the TON source bridge address.");
    }
    if (
      !readTonAddress(
        route,
        "sccp_ton_destination_verifier_address",
        "sccpTonDestinationVerifierAddress",
        "destination_verifier_address",
        "destinationVerifierAddress",
        "ton_verifier_address",
        "tonVerifierAddress",
        "tron_verifier_address",
        "tronVerifierAddress",
      )
    ) {
      blockers.push("The TON route is missing the TON verifier address.");
    }
    const finalizeMessageValueNano = readTonFinalizeMessageValueNano(route);
    if (!/^[1-9]\d*$/u.test(finalizeMessageValueNano)) {
      blockers.push(
        "The TON route is missing finalize message value in nanoTON.",
      );
    }
    const verifierProtocolVersion = readTonVerifierProtocolVersion(route);
    if (![1, 2].includes(verifierProtocolVersion)) {
      blockers.push("The TON verifier protocol version must be 1 or 2.");
    }
    validateBrowserProver({
      route,
      keys: [
        "destination_browser_prover",
        "destinationBrowserProver",
        "browser_destination_prover",
        "browserDestinationProver",
      ],
      label: "TON destination browser prover",
      expectedExport: "proveTonSccpMessage",
      blockers,
    });
    validateBrowserProver({
      route,
      keys: [
        "source_browser_prover",
        "sourceBrowserProver",
        "browser_source_prover",
        "browserSourceProver",
      ],
      label: "TON source browser prover",
      expectedExport: "proveTonSccpSource",
      blockers,
    });

    const rollout = readRecord(
      route,
      "destination_rollout",
      "destinationRollout",
    );
    if (!rollout) {
      blockers.push("The TON route is missing destination rollout material.");
    } else {
      for (const key of [
        "verifier_code_hash",
        "verifier_key_hash",
        "destination_binding_hash",
      ]) {
        if (!/^0x[0-9a-f]{64}$/u.test(readString(rollout, key))) {
          blockers.push(`The TON route rollout is missing ${key}.`);
        }
      }
    }
    const routeAllowlist = readRecord(
      route,
      "route_allowlist",
      "routeAllowlist",
    );
    if (!routeAllowlist) {
      blockers.push(
        "The TON route is missing governed route allowlist material.",
      );
    } else {
      if (readNumber(routeAllowlist, "domain", "counterpartyDomain") !== 4) {
        blockers.push("The TON route allowlist must target TON domain 4.");
      }
      if (
        !["ton", "ton-testnet"].includes(
          readString(routeAllowlist, "chain").toLowerCase(),
        )
      ) {
        blockers.push("The TON route allowlist must target the TON chain.");
      }
      if (
        readString(routeAllowlist, "activation_policy", "activationPolicy") !==
        "GovernanceAllowlist"
      ) {
        blockers.push(
          "The TON route allowlist must use GovernanceAllowlist activation.",
        );
      }
      if (
        !readBoolean(routeAllowlist, "routes_allowlisted", "routesAllowlisted")
      ) {
        blockers.push("The TON governed route allowlist is not active.");
      }
      const allowlistBlockers = Array.isArray(routeAllowlist.blockers)
        ? routeAllowlist.blockers.filter((entry) => String(entry ?? "").trim())
        : [];
      if (allowlistBlockers.length > 0) {
        blockers.push(
          `The TON governed route allowlist has blockers: ${allowlistBlockers.join(", ")}`,
        );
      }
      for (const key of [
        "route_allowlist_hash",
        "route_canary_evidence_hash",
        "route_canary_route_allowlist_hash",
        "route_canary_destination_binding_hash",
      ]) {
        if (!/^0x[0-9a-f]{64}$/u.test(readString(routeAllowlist, key))) {
          blockers.push(`The TON route allowlist is missing ${key}.`);
        }
      }
    }

    const burnRecord = readBurnRecord(route);
    if (!burnRecord) {
      blockers.push("The TON route is missing TAIRA burn-record material.");
    } else {
      if (
        !readString(
          burnRecord,
          "settlement_asset_definition_id",
          "settlementAssetDefinitionId",
        )
      ) {
        blockers.push(
          "The TON route burn-record material is missing settlement asset id.",
        );
      }
      if (
        !readString(burnRecord, "contract_artifact_b64", "contractArtifactB64")
      ) {
        blockers.push(
          "The TON route burn-record material is missing contract artifact.",
        );
      }
      if (!readRecord(burnRecord, "vk_ref", "vkRef")) {
        blockers.push("The TON route burn-record material is missing vk_ref.");
      }
    }

    validateTonSourceLaneRecord(
      readSourceLaneRecord(
        route,
        "source_verifier_material",
        "sourceVerifierMaterial",
      ),
      "TON source verifier material",
      blockers,
    );
    validateTonSourceAdapterDeployment(
      readSourceLaneRecord(
        route,
        "source_adapter_engine_deployment",
        "sourceAdapterEngineDeployment",
        "source_adapter_deployment",
        "sourceAdapterDeployment",
      ),
      blockers,
    );
  }

  return {
    ready: blockers.length === 0,
    routeId: SCCP_TON_XOR_ROUTE_ID,
    toriiUrl: reportToriiUrl,
    observed: {
      capabilitiesTonLane: Boolean(tonLane),
      capabilitiesTonLaneProductionReady: tonLane
        ? readBoolean(tonLane, "production_ready", "productionReady")
        : false,
      capabilitiesTonLaneDisabledReason: tonLane
        ? readString(tonLane, "disabled_reason", "disabledReason")
        : "",
      genericTonManifest: Boolean(genericTonManifest),
      routePublished: Boolean(route),
      routeProductionReady,
      routeEffectivelyProductionReady,
    },
    blockers,
  };
};

export const runSccpTonRoutePreflight = async ({
  toriiUrl: inputToriiUrl = toriiUrl,
} = {}) => {
  const activeToriiUrl = normalizeBaseUrl(inputToriiUrl);
  const [capabilities, manifests, parametersResult] = await Promise.all([
    fetchJson(activeToriiUrl, "/v1/sccp/capabilities"),
    fetchJson(activeToriiUrl, "/v1/sccp/manifests"),
    fetchJson(activeToriiUrl, "/v1/parameters").catch(() => null),
  ]);
  return validateRoute({
    capabilities,
    manifests,
    parameters: parametersResult,
    toriiUrl: activeToriiUrl,
  });
};

const main = async () => {
  const report = await runSccpTonRoutePreflight({ toriiUrl });
  if (outputPath) {
    const resolved = resolve(outputPath);
    await mkdir(dirname(resolved), { recursive: true });
    await writeFile(`${resolved}`, `${JSON.stringify(report, null, 2)}\n`);
  }
  if (jsonOnly) {
    console.log(JSON.stringify(report, null, 2));
  } else if (report.ready) {
    console.log(`${SCCP_TON_XOR_ROUTE_ID} is ready on ${toriiUrl}.`);
  } else {
    console.error(`${SCCP_TON_XOR_ROUTE_ID} is not ready on ${toriiUrl}:`);
    for (const blocker of report.blockers) {
      console.error(`- ${blocker}`);
    }
  }
  process.exitCode = report.ready ? 0 : 1;
};

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? "")) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

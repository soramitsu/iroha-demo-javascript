#!/usr/bin/env node
/* global BigInt */

import { createHash, randomInt } from "node:crypto";
import {
  constants as fsConstants,
  lstat,
  link,
  mkdir,
  open,
  rename,
  rm,
} from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  ToriiClient,
  buildProposeSccpRouteGovernanceTransaction,
  decodeSignedTransaction,
  hashSignedTransaction,
  hashSignedTransactionPayload,
} from "@iroha/iroha-js";
import { AccountAddress } from "@iroha/iroha-js/address";
import { normalizeSccpRegistry } from "@iroha/iroha-js/sccp";
import {
  SOLANA_SCCP_GOVERNANCE_DRAFT_PATH,
  SOLANA_SCCP_REGISTRY_PATH,
  canonicalSccpJson,
  canonicalSccpObjectSha256,
  summarizeExactSolanaRegistryRoute,
  validateSolanaRouteGovernancePlan,
} from "./e2e/sccp-solana-exact-registry.mjs";
import {
  SOLANA_TESTNET_RPC_URL,
  checkSolanaOrderedInitializationAgainstRegistry,
  solanaOrderedProgramArtifactSha256,
  validateSolanaOrderedInitializationEvidence,
  verifySolanaOrderedInitializationTransactions,
} from "./e2e/sccp-solana-ordered-initialization.mjs";
import {
  parseSolanaGovernanceCanonicalJsonBytes,
  parseSolanaGovernanceDeterministicJsonText,
} from "./e2e/sccp-solana-governance-json.mjs";

export const TAIRA_SCCP_CHAIN_ID = "fc56984b-2be7-431d-840e-21514d1883f0";
export const TAIRA_SCCP_NETWORK_PREFIX = 369;
export const TAIRA_SCCP_PRIVATE_KEY_ENV = "SCCP_TAIRA_GOVERNANCE_PRIVATE_KEY";
export const TAIRA_SCCP_GOVERNANCE_INTENT_SCHEMA =
  "iroha-sccp-route-governance-submit-intent/v1";

const VALIDATOR_HOST = /^taira-validator-[1-4]\.sora\.org$/u;
const HASH32 = /^0x[0-9a-f]{64}$/u;
const PHASES = new Set(["register", "activate"]);
const MAX_REGISTRY_RESPONSE_BYTES = 32 * 1024 * 1024;
const MAX_DRAFT_RESPONSE_BYTES = 1024 * 1024;
const GOVERNANCE_INSTRUCTION_WIRE_ID =
  "iroha_data_model::isi::governance::ProposeSccpRouteGovernance";
const OPTIONS = new Set([
  "plan",
  "phase",
  "expected-plan-sha256",
  "ordered-initialization-evidence",
  "expected-ordered-initialization-evidence-sha256",
  "torii-url",
  "solana-rpc-url",
  "authority",
  "private-key-env",
  "submit",
  "out",
  "intent",
  "ttl-ms",
  "nonce",
  "commit-timeout-ms",
]);

const usage = `Usage:
  node scripts/taira-sccp-route-governance.mjs \\
    --plan <reviewed-plan.json> --phase register|activate \\
    --expected-plan-sha256 0x... --torii-url https://taira-validator-1.sora.org \\
    --ordered-initialization-evidence <reviewed-ordered-init.json> \\
    --expected-ordered-initialization-evidence-sha256 0x... \\
    --solana-rpc-url ${SOLANA_TESTNET_RPC_URL} \\
    --out <result.json> [--intent <durable-intent.json>] \
    [--submit true --authority testu...]

Registration and activation are deliberately separate governance proposals.
The private key is read only from ${TAIRA_SCCP_PRIVATE_KEY_ENV} (or the exact
name supplied by --private-key-env) when --submit true. It is never written.
The submit intent defaults to <out>.intent.json and is durably published before
broadcast. An existing intent is reconciled by transaction hash and is never
re-signed or blindly rebroadcast.
`;

export function parseTairaSccpGovernanceArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--help" || token === "-h") {
      parsed.help = "true";
      continue;
    }
    if (!token.startsWith("--")) {
      throw new TypeError("Unexpected positional governance argument.");
    }
    const key = token.slice(2);
    if (!OPTIONS.has(key)) {
      throw new TypeError(`Unknown governance option --${key}.`);
    }
    if (Object.hasOwn(parsed, key)) {
      throw new TypeError(`Duplicate governance option --${key}.`);
    }
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) {
      throw new TypeError(`Governance option --${key} requires a value.`);
    }
    parsed[key] = next;
    index += 1;
  }
  return parsed;
}

const required = (options, key) => {
  const value = String(options[key] ?? "").trim();
  if (!value) throw new TypeError(`--${key} is required.`);
  return value;
};

const exactBoolean = (value, fallback = false) => {
  if (value === undefined) return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new TypeError("Boolean governance options must be true or false.");
};

const positiveInteger = (value, fallback, label) => {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new TypeError(`${label} must be a positive safe integer.`);
  }
  return parsed;
};

export function validateTairaSccpGovernanceEndpoint(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError("TAIRA governance endpoint must be a valid URL.");
  }
  if (
    url.protocol !== "https:" ||
    !VALIDATOR_HOST.test(url.hostname) ||
    url.username ||
    url.password ||
    url.port ||
    (url.pathname !== "/" && url.pathname !== "") ||
    url.search ||
    url.hash
  ) {
    throw new TypeError(
      "TAIRA governance requires an explicit canonical validator HTTPS root.",
    );
  }
  return url.origin;
}

const exactObjectKeys = (value, keys, label) => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (canonicalSccpJson(actual) !== canonicalSccpJson(expected)) {
    throw new TypeError(`${label} contains an unknown or missing field.`);
  }
  return value;
};

export function validateSccpGovernanceDraftResponse(value) {
  const response = exactObjectKeys(
    value,
    ["ok", "proposal_id", "tx_instructions"],
    "SCCP governance draft response",
  );
  if (
    response.ok !== true ||
    typeof response.proposal_id !== "string" ||
    !/^[0-9a-f]{64}$/u.test(response.proposal_id) ||
    /^0{64}$/u.test(response.proposal_id) ||
    !Array.isArray(response.tx_instructions) ||
    response.tx_instructions.length !== 1
  ) {
    throw new TypeError("SCCP governance draft response is not canonical.");
  }
  const instruction = exactObjectKeys(
    response.tx_instructions[0],
    ["wire_id", "payload_hex"],
    "SCCP governance draft instruction",
  );
  if (
    typeof instruction.wire_id !== "string" ||
    instruction.wire_id.length === 0 ||
    instruction.wire_id !== instruction.wire_id.trim() ||
    typeof instruction.payload_hex !== "string" ||
    instruction.payload_hex.length === 0 ||
    instruction.payload_hex.length % 2 !== 0 ||
    !/^[0-9a-f]+$/u.test(instruction.payload_hex)
  ) {
    throw new TypeError("SCCP governance draft instruction is not canonical.");
  }
  return response;
}

const exactRouteKey = (route) =>
  route?.route_id === "taira_sol_xor" &&
  route?.asset_key === "xor" &&
  route?.revision === 1;

const sameJson = (left, right) =>
  canonicalSccpJson(left) === canonicalSccpJson(right);

const exactSolanaLane = (lane) =>
  lane?.lane_id?.source?.network === "solana_testnet" &&
  lane?.lane_id?.source?.profile === null &&
  lane?.lane_id?.target?.network === "sora_taira" &&
  lane?.lane_id?.target?.profile === null;

/**
 * Fail-closed compare-and-swap precondition for the selected proposal phase.
 * An already enacted exact phase is reported as idempotent; divergent state is
 * never overwritten.
 */
export function evaluateTairaSccpGovernancePhase({
  registry: registryValue,
  plan: planValue,
  phase,
}) {
  if (!PHASES.has(phase)) throw new TypeError("Unknown governance phase.");
  const { registration } = validateSolanaRouteGovernancePlan(planValue);
  const registry = normalizeSccpRegistry(registryValue);
  const lanes = registry.lanes.filter(exactSolanaLane);
  if (lanes.length > 1) {
    throw new TypeError(
      "TAIRA registry contains duplicate exact Solana lanes.",
    );
  }
  const lane = lanes[0] ?? null;
  const routes = (lane?.routes ?? []).filter(exactRouteKey);
  if (routes.length > 1) {
    throw new TypeError(
      "TAIRA registry contains duplicate taira_sol_xor revision 1 routes.",
    );
  }
  const live = routes[0] ?? null;
  const staged = registration.action.route.route;
  const expectedAnchor = registration.action.route.native_trust_anchor;
  if (lane) {
    const matchingAnchor = lane.native_trust_anchors.find(
      (anchor) => anchor.anchor_hash === expectedAnchor.anchor_hash,
    );
    if (!matchingAnchor || !sameJson(matchingAnchor, expectedAnchor)) {
      throw new TypeError(
        "TAIRA lane does not contain the exact reviewed Solana trust anchor.",
      );
    }
    if (lane.current_native_trust_anchor_hash !== expectedAnchor.anchor_hash) {
      throw new TypeError(
        "TAIRA lane current trust anchor differs from the reviewed Solana trust anchor.",
      );
    }
  }
  if (phase === "register") {
    if (live === null) {
      return Object.freeze({ readyToPropose: true, alreadyEnacted: false });
    }
    if (!sameJson(live, staged)) {
      throw new TypeError(
        "TAIRA already contains divergent taira_sol_xor revision 1 material.",
      );
    }
    return Object.freeze({ readyToPropose: false, alreadyEnacted: true });
  }
  if (live === null) {
    throw new TypeError(
      "Activation cannot be proposed before staged registration is enacted.",
    );
  }
  const activation = live.activation?.activation;
  if (activation === "bidirectional") {
    const expectedLive = structuredClone(staged);
    expectedLive.activation = { activation: "bidirectional", direction: null };
    if (!sameJson(live, expectedLive)) {
      throw new TypeError(
        "TAIRA bidirectional route differs from the reviewed plan.",
      );
    }
    return Object.freeze({ readyToPropose: false, alreadyEnacted: true });
  }
  if (activation !== "staged" || !sameJson(live, staged)) {
    throw new TypeError(
      "Activation requires the exact reviewed route in staged state.",
    );
  }
  return Object.freeze({ readyToPropose: true, alreadyEnacted: false });
}

const readJsonNoFollow = async (file, label) => {
  let handle;
  try {
    handle = await open(
      resolve(file),
      fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0),
    );
    const stats = await handle.stat();
    if (!stats.isFile()) throw new Error("not a regular file");
    return parseSolanaGovernanceCanonicalJsonBytes(
      await handle.readFile(),
      label,
    );
  } catch (error) {
    throw new Error(
      `Unable to read ${label}: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    await handle?.close();
  }
};

const readPinnedJsonNoFollow = async (file, expectedSha256, label) => {
  let handle;
  try {
    handle = await open(
      resolve(file),
      fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0),
    );
    const stats = await handle.stat();
    if (!stats.isFile()) throw new Error("not a regular file");
    const bytes = await handle.readFile();
    const actualSha256 = `0x${createHash("sha256")
      .update(bytes)
      .digest("hex")}`;
    if (actualSha256 !== expectedSha256) {
      throw new Error("SHA-256 does not match the independent review pin");
    }
    return Object.freeze({
      value: parseSolanaGovernanceCanonicalJsonBytes(bytes, label),
      sha256: actualSha256,
    });
  } catch (error) {
    throw new Error(
      `Unable to read ${label}: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    await handle?.close();
  }
};

const syncDirectory = async (directory) => {
  let handle;
  try {
    handle = await open(directory, fsConstants.O_RDONLY);
    await handle.sync();
  } finally {
    await handle?.close();
  }
};

const writeBytesAtomic = async (file, bytes) => {
  const destination = resolve(file);
  const directory = dirname(destination);
  await mkdir(directory, { recursive: true });
  const temporary = `${destination}.tmp-${process.pid}-${randomInt(1, 0x7fffffff)}`;
  let handle;
  try {
    handle = await open(
      temporary,
      fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY,
      0o600,
    );
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    handle = null;
    await rename(temporary, destination);
    await syncDirectory(directory);
    return destination;
  } catch (error) {
    await handle?.close().catch(() => {});
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
};

const writeJsonAtomic = (file, value) =>
  writeBytesAtomic(file, Buffer.from(`${JSON.stringify(value, null, 2)}\n`));

const writeCanonicalIntentExclusive = async (file, intent) => {
  const destination = resolve(file);
  const directory = dirname(destination);
  await mkdir(directory, { recursive: true });
  const temporary = `${destination}.tmp-${process.pid}-${randomInt(1, 0x7fffffff)}`;
  let handle;
  try {
    handle = await open(
      temporary,
      fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY,
      0o600,
    );
    await handle.writeFile(`${canonicalSccpJson(intent)}\n`, "utf8");
    await handle.sync();
    await handle.close();
    handle = null;
    await link(temporary, destination);
    await syncDirectory(directory);
    await rm(temporary, { force: true });
    await syncDirectory(directory);
    return destination;
  } catch (error) {
    await handle?.close().catch(() => {});
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
};

const fetchExactJson = async (url, options, timeoutMs, maxBytes) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      redirect: "error",
      signal: controller.signal,
    });
    const contentType = response.headers.get("content-type") ?? "";
    if (!/^application\/json(?:\s*;|$)/iu.test(contentType)) {
      throw new Error(
        `${new URL(url).pathname} returned a non-JSON content type.`,
      );
    }
    const declaredLength = response.headers.get("content-length");
    if (declaredLength !== null) {
      if (!/^(?:0|[1-9][0-9]*)$/u.test(declaredLength)) {
        throw new Error(
          `${new URL(url).pathname} returned an invalid Content-Length.`,
        );
      }
      if (BigInt(declaredLength) > BigInt(maxBytes)) {
        throw new Error(
          `${new URL(url).pathname} response exceeds its byte limit.`,
        );
      }
    }
    const chunks = [];
    let total = 0;
    if (response.body !== null) {
      const reader = response.body.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          total += value.byteLength;
          if (total > maxBytes) {
            controller.abort();
            throw new Error(
              `${new URL(url).pathname} response exceeds its byte limit.`,
            );
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (!response.ok) {
      throw new Error(
        `${new URL(url).pathname} returned HTTP ${response.status}${text ? `: ${text.slice(0, 384)}` : ""}`,
      );
    }
    return parseSolanaGovernanceDeterministicJsonText(
      text,
      `${new URL(url).pathname} response`,
    );
  } finally {
    clearTimeout(timer);
  }
};

const privateKeyFromEnvironment = (name) => {
  if (!/^[A-Z][A-Z0-9_]{0,127}$/u.test(name)) {
    throw new TypeError(
      "--private-key-env must be a canonical environment name.",
    );
  }
  const raw = String(process.env[name] ?? "")
    .trim()
    .replace(/^0x/u, "");
  if (/^[0-9a-fA-F]{64}$/u.test(raw)) return Buffer.from(raw, "hex");
  if (/^802620[0-9a-fA-F]{64}$/u.test(raw)) {
    return Buffer.from(raw.slice(6), "hex");
  }
  throw new TypeError(
    `${name} must contain raw 32-byte hex or 802620-prefixed 32-byte hex.`,
  );
};

const canonicalAuthority = (value) => {
  const literal = String(value ?? "").trim();
  let canonical;
  try {
    canonical = AccountAddress.fromAccountId(
      literal,
      TAIRA_SCCP_NETWORK_PREFIX,
    ).toI105(TAIRA_SCCP_NETWORK_PREFIX);
  } catch {
    throw new TypeError("--authority must be a canonical TAIRA I105 account.");
  }
  if (canonical !== literal || !canonical.startsWith("testu")) {
    throw new TypeError("--authority must be a canonical TAIRA I105 account.");
  }
  return canonical;
};

const terminalStatusKinds = (value, seen = new WeakSet()) => {
  const found = new Set();
  const visit = (candidate) => {
    if (typeof candidate === "string") {
      if (/^(Applied|Rejected|Expired)$/u.test(candidate)) {
        found.add(candidate);
      }
      return;
    }
    if (
      candidate === null ||
      typeof candidate !== "object" ||
      seen.has(candidate)
    ) {
      return;
    }
    seen.add(candidate);
    for (const entry of [
      candidate.kind,
      candidate.status,
      candidate.content,
      candidate.result,
      candidate.receipt,
      candidate.raw,
    ]) {
      visit(entry);
    }
  };
  visit(value);
  return found;
};

const statusKind = (value) => {
  const statuses = terminalStatusKinds(value);
  return statuses.size === 1 ? [...statuses][0] : null;
};

const jsonSafe = (value) =>
  JSON.parse(
    JSON.stringify(value, (_key, child) =>
      typeof child === "bigint" ? child.toString() : child,
    ),
  );

const containsSecretMaterial = (value, seen = new WeakSet()) => {
  if (value === null || typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) {
    return value.some((entry) => containsSecretMaterial(entry, seen));
  }
  return Object.entries(value).some(
    ([key, entry]) =>
      /(?:^|_)(?:private|secret|seed|mnemonic|password)(?:_|$)/iu.test(key) ||
      containsSecretMaterial(entry, seen),
  );
};

const GOVERNANCE_INTENT_KEYS = Object.freeze([
  "schema",
  "created_at",
  "phase",
  "plan_sha256",
  "ordered_initialization_evidence_sha256",
  "fresh_deploy_report_sha256",
  "proposal_id",
  "proposal_sha256",
  "authority",
  "torii_url",
  "solana_rpc_url",
  "chain_id",
  "instruction_wire_id",
  "instruction_payload_sha256",
  "transaction_hash",
  "transaction_payload_hash",
  "signed_transaction_sha256",
  "transaction_signature",
  "transaction_signature_sha256",
  "ttl_ms",
  "nonce",
]);

const unprefixedHash32 = (value, label) => {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/u.test(value)) {
    throw new TypeError(`${label} must be exact lowercase 32-byte hex.`);
  }
  return value;
};

const prefixedHash32 = (value, label) => {
  if (typeof value !== "string" || !HASH32.test(value)) {
    throw new TypeError(`${label} must be exact lowercase 0x hash.`);
  }
  return value;
};

export const validateTairaSccpGovernanceIntent = (value) => {
  const intent = exactObjectKeys(
    value,
    GOVERNANCE_INTENT_KEYS,
    "SCCP governance durable intent",
  );
  if (
    intent.schema !== TAIRA_SCCP_GOVERNANCE_INTENT_SCHEMA ||
    !PHASES.has(intent.phase) ||
    typeof intent.created_at !== "string" ||
    !Number.isFinite(Date.parse(intent.created_at)) ||
    new Date(intent.created_at).toISOString() !== intent.created_at ||
    intent.chain_id !== TAIRA_SCCP_CHAIN_ID ||
    intent.solana_rpc_url !== SOLANA_TESTNET_RPC_URL ||
    intent.instruction_wire_id !== GOVERNANCE_INSTRUCTION_WIRE_ID ||
    typeof intent.proposal_id !== "string" ||
    !/^[0-9a-f]{64}$/u.test(intent.proposal_id) ||
    /^0{64}$/u.test(intent.proposal_id) ||
    !Number.isSafeInteger(intent.ttl_ms) ||
    intent.ttl_ms <= 0 ||
    !Number.isSafeInteger(intent.nonce) ||
    intent.nonce <= 0 ||
    intent.transaction_signature === null ||
    intent.transaction_signature === undefined ||
    containsSecretMaterial(intent)
  ) {
    throw new TypeError("SCCP governance durable intent is not exact or safe.");
  }
  canonicalAuthority(intent.authority);
  validateTairaSccpGovernanceEndpoint(intent.torii_url);
  prefixedHash32(intent.plan_sha256, "Intent plan SHA-256");
  prefixedHash32(
    intent.ordered_initialization_evidence_sha256,
    "Intent ordered-initialization SHA-256",
  );
  prefixedHash32(
    intent.fresh_deploy_report_sha256,
    "Intent fresh-deploy report SHA-256",
  );
  prefixedHash32(intent.proposal_sha256, "Intent proposal SHA-256");
  prefixedHash32(
    intent.instruction_payload_sha256,
    "Intent instruction payload SHA-256",
  );
  unprefixedHash32(intent.transaction_hash, "Intent transaction hash");
  unprefixedHash32(
    intent.transaction_payload_hash,
    "Intent transaction payload hash",
  );
  prefixedHash32(
    intent.signed_transaction_sha256,
    "Intent signed transaction SHA-256",
  );
  prefixedHash32(
    intent.transaction_signature_sha256,
    "Intent transaction signature SHA-256",
  );
  if (
    canonicalSccpObjectSha256(intent.transaction_signature) !==
    intent.transaction_signature_sha256
  ) {
    throw new TypeError(
      "SCCP governance durable intent signature hash is invalid.",
    );
  }
  return intent;
};

const readCanonicalGovernanceIntent = async (file) => {
  let handle;
  try {
    handle = await open(
      resolve(file),
      fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0),
    );
    const stats = await handle.stat();
    if (!stats.isFile() || stats.size <= 0 || stats.size > 64 * 1024) {
      throw new Error("not a bounded regular file");
    }
    const bytes = await handle.readFile();
    const value = parseSolanaGovernanceCanonicalJsonBytes(
      bytes,
      "SCCP governance durable intent",
    );
    const intent = validateTairaSccpGovernanceIntent(value);
    if (!bytes.equals(Buffer.from(`${canonicalSccpJson(intent)}\n`, "utf8"))) {
      throw new Error("intent bytes are not canonical JSON");
    }
    return intent;
  } finally {
    await handle?.close();
  }
};

const inspectSignedGovernanceTransaction = (signedTransaction) => {
  const decoded = decodeSignedTransaction(signedTransaction);
  if (!Object.hasOwn(decoded, "signature")) {
    throw new Error("Decoded governance transaction has no signature.");
  }
  const transactionSignature = jsonSafe(decoded.signature);
  if (containsSecretMaterial(transactionSignature)) {
    throw new Error("Decoded governance transaction signature is unsafe.");
  }
  return Object.freeze({
    transactionHash: hashSignedTransaction(signedTransaction),
    transactionPayloadHash: hashSignedTransactionPayload(signedTransaction),
    signedTransactionSha256: `0x${createHash("sha256")
      .update(signedTransaction)
      .digest("hex")}`,
    transactionSignature,
    transactionSignatureSha256: canonicalSccpObjectSha256(transactionSignature),
  });
};

const validateSignedGovernanceInspection = (value) => {
  const inspection = exactObjectKeys(
    value,
    [
      "transactionPayloadHash",
      "transactionHash",
      "signedTransactionSha256",
      "transactionSignature",
      "transactionSignatureSha256",
    ],
    "signed SCCP governance transaction inspection",
  );
  unprefixedHash32(
    inspection.transactionHash,
    "Signed transaction canonical hash",
  );
  unprefixedHash32(
    inspection.transactionPayloadHash,
    "Signed transaction payload hash",
  );
  prefixedHash32(
    inspection.signedTransactionSha256,
    "Signed transaction bytes SHA-256",
  );
  prefixedHash32(
    inspection.transactionSignatureSha256,
    "Signed transaction signature SHA-256",
  );
  if (
    inspection.transactionSignature === null ||
    inspection.transactionSignature === undefined ||
    containsSecretMaterial(inspection.transactionSignature) ||
    canonicalSccpObjectSha256(inspection.transactionSignature) !==
      inspection.transactionSignatureSha256
  ) {
    throw new TypeError(
      "Signed SCCP governance transaction inspection is not canonical or safe.",
    );
  }
  return inspection;
};

const governanceIntentMatchesRun = ({
  intent,
  phase,
  planSha256,
  orderedInitializationSha256,
  freshDeployReportSha256,
  authority,
  toriiUrl,
  proposalSha256,
  suppliedNonce,
  ttlMs,
}) => {
  const mismatches = [];
  for (const [field, actual, expected] of [
    ["phase", intent.phase, phase],
    ["plan_sha256", intent.plan_sha256, planSha256],
    [
      "ordered_initialization_evidence_sha256",
      intent.ordered_initialization_evidence_sha256,
      orderedInitializationSha256,
    ],
    [
      "fresh_deploy_report_sha256",
      intent.fresh_deploy_report_sha256,
      freshDeployReportSha256,
    ],
    ["authority", intent.authority, authority],
    ["torii_url", intent.torii_url, toriiUrl],
    ["proposal_sha256", intent.proposal_sha256, proposalSha256],
    ["ttl_ms", intent.ttl_ms, ttlMs],
  ]) {
    if (actual !== expected) mismatches.push(field);
  }
  if (suppliedNonce !== null && intent.nonce !== suppliedNonce) {
    mismatches.push("nonce");
  }
  if (mismatches.length > 0) {
    throw new Error(
      `Existing SCCP governance intent differs from this run: ${mismatches.join(", ")}.`,
    );
  }
  return intent;
};

const assertStatusBindsTransaction = (status, transactionHash) => {
  const hashes = new Set();
  const visit = (value, seen = new WeakSet()) => {
    if (value === null || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    for (const [key, entry] of Object.entries(value)) {
      if (
        ["hash", "hashHex", "transaction_hash", "transactionHash"].includes(
          key,
        ) &&
        typeof entry === "string" &&
        /^[0-9a-f]{64}$/u.test(entry)
      ) {
        hashes.add(entry);
      } else {
        visit(entry, seen);
      }
    }
  };
  visit(status);
  if (hashes.size !== 1 || !hashes.has(transactionHash)) {
    throw new Error(
      "TAIRA transaction status does not bind the durable intent hash.",
    );
  }
  return status;
};

const reconcileGovernanceIntent = async ({ client, intent, timeoutMs }) => {
  if (
    typeof client?.getTransactionStatusTyped !== "function" ||
    typeof client?.waitForTransactionStatusTyped !== "function"
  ) {
    throw new Error(
      "TAIRA client cannot reconcile the durable governance intent; refusing any replacement broadcast.",
    );
  }
  let status;
  try {
    status = await client.getTransactionStatusTyped(intent.transaction_hash, {
      scope: "global",
    });
    if (statusKind(status) === null) {
      status = await client.waitForTransactionStatusTyped(
        intent.transaction_hash,
        {
          scope: "global",
          intervalMs: 750,
          timeoutMs,
        },
      );
    }
  } catch (error) {
    throw new Error(
      `Existing SCCP governance intent is unresolved; refusing to sign or broadcast a replacement transaction: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  assertStatusBindsTransaction(status, intent.transaction_hash);
  const kind = statusKind(status);
  if (kind !== "Applied") {
    throw new Error(
      `Existing SCCP governance intent reached ${kind ?? "an unknown status"}; explicit operator reconciliation is required before another proposal.`,
    );
  }
  return jsonSafe(status);
};

const governanceSubmissionResultFromIntent = ({ intent, status }) => ({
  schema: "iroha-sccp-route-governance-submission/v1",
  checked_at: new Date().toISOString(),
  phase: intent.phase,
  plan_sha256: intent.plan_sha256,
  ordered_initialization_evidence_sha256:
    intent.ordered_initialization_evidence_sha256,
  fresh_deploy_report_sha256: intent.fresh_deploy_report_sha256,
  torii_url: intent.torii_url,
  authority: intent.authority,
  submitted: true,
  already_enacted: false,
  proposal_id: intent.proposal_id,
  transaction_hash: intent.transaction_hash,
  instruction_wire_id: intent.instruction_wire_id,
  instruction_payload_sha256: intent.instruction_payload_sha256,
  status,
  recovered_from_durable_intent: true,
  next_required_action:
    "Parliament must enact this proposal; verify typed registry readback before the next phase.",
});

export async function runTairaSccpGovernance(options) {
  const planPath = required(options, "plan");
  const orderedInitializationPath = required(
    options,
    "ordered-initialization-evidence",
  );
  const outPath = required(options, "out");
  const intentPath = String(
    options.intent ?? `${resolve(outPath)}.intent.json`,
  ).trim();
  if (!intentPath) {
    throw new TypeError("--intent must be a nonempty file path.");
  }
  const governanceFiles = [
    resolve(planPath),
    resolve(orderedInitializationPath),
    resolve(outPath),
    resolve(intentPath),
  ];
  if (new Set(governanceFiles).size !== governanceFiles.length) {
    throw new TypeError(
      "Governance plan, ordered-initialization evidence, result output, and durable intent must be distinct files.",
    );
  }
  const existingInodes = [];
  for (const file of governanceFiles) {
    try {
      const stats = await lstat(file);
      existingInodes.push(`${stats.dev}:${stats.ino}`);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  if (new Set(existingInodes).size !== existingInodes.length) {
    throw new TypeError(
      "Governance inputs, output, and durable intent must not alias the same inode.",
    );
  }
  const phase = required(options, "phase");
  if (!PHASES.has(phase))
    throw new TypeError("--phase must be register or activate.");
  const expectedPlanSha256 = required(options, "expected-plan-sha256");
  if (
    !HASH32.test(expectedPlanSha256) ||
    /^0x0{64}$/u.test(expectedPlanSha256)
  ) {
    throw new TypeError(
      "--expected-plan-sha256 must be a nonzero lowercase hash.",
    );
  }
  const toriiUrl = validateTairaSccpGovernanceEndpoint(
    required(options, "torii-url"),
  );
  if (required(options, "solana-rpc-url") !== SOLANA_TESTNET_RPC_URL) {
    throw new TypeError(
      `Solana governance requires the canonical testnet RPC ${SOLANA_TESTNET_RPC_URL}.`,
    );
  }
  const expectedOrderedInitializationSha256 = required(
    options,
    "expected-ordered-initialization-evidence-sha256",
  );
  if (
    !HASH32.test(expectedOrderedInitializationSha256) ||
    /^0x0{64}$/u.test(expectedOrderedInitializationSha256)
  ) {
    throw new TypeError(
      "--expected-ordered-initialization-evidence-sha256 must be a nonzero lowercase hash.",
    );
  }
  const submit = exactBoolean(options.submit, false);
  const timeoutMs = positiveInteger(
    options["commit-timeout-ms"],
    180_000,
    "--commit-timeout-ms",
  );
  const ttlMs = positiveInteger(options["ttl-ms"], 600_000, "--ttl-ms");
  const suppliedNonce =
    options.nonce === undefined
      ? null
      : positiveInteger(options.nonce, null, "--nonce");
  const planValue = await readJsonNoFollow(
    planPath,
    "reviewed governance plan",
  );
  const { plan, registration, activation } =
    validateSolanaRouteGovernancePlan(planValue);
  if (
    plan.plan_sha256 !== expectedPlanSha256 ||
    canonicalSccpObjectSha256(
      Object.fromEntries(
        Object.entries(plan).filter(([key]) => key !== "plan_sha256"),
      ),
    ) !== expectedPlanSha256
  ) {
    throw new TypeError(
      "Reviewed governance plan does not match --expected-plan-sha256.",
    );
  }
  const orderedInitializationArtifact = await readPinnedJsonNoFollow(
    orderedInitializationPath,
    expectedOrderedInitializationSha256,
    "reviewed Solana ordered-initialization evidence",
  );
  if (
    plan.ordered_initialization_evidence_sha256 !==
    orderedInitializationArtifact.sha256
  ) {
    throw new TypeError(
      "Reviewed governance plan does not pin the selected ordered-initialization evidence bytes.",
    );
  }
  const orderedInitialization = validateSolanaOrderedInitializationEvidence(
    orderedInitializationArtifact.value,
  );
  if (
    plan.fresh_deploy_report_sha256 !==
    orderedInitialization.freshDeployReportSha256
  ) {
    throw new TypeError(
      "Reviewed governance plan does not pin the fresh-deploy report committed by ordered initialization evidence.",
    );
  }
  if (
    canonicalSccpJson(plan.program_artifact_sha256) !==
    canonicalSccpJson(solanaOrderedProgramArtifactSha256(orderedInitialization))
  ) {
    throw new TypeError(
      "Reviewed governance plan does not directly pin the destination, source, and native-verifier artifact bytes from ordered initialization evidence.",
    );
  }
  const stagedRoute = registration.action.route.route;
  const expectedAnchor = registration.action.route.native_trust_anchor;
  const governedSummary = summarizeExactSolanaRegistryRoute({
    version: 1,
    lanes: [
      {
        lane_id: structuredClone(stagedRoute.lane_id),
        native_trust_anchors: [structuredClone(expectedAnchor)],
        current_native_trust_anchor_hash: expectedAnchor.anchor_hash,
        routes: [structuredClone(stagedRoute)],
      },
    ],
  });
  checkSolanaOrderedInitializationAgainstRegistry(
    orderedInitialization,
    governedSummary,
  );
  await verifySolanaOrderedInitializationTransactions(orderedInitialization, {
    timeoutMs,
    registrySummary: governedSummary,
  });
  const proposal = phase === "register" ? registration : activation;
  const proposalSha256 = canonicalSccpObjectSha256(proposal);
  const authority = submit
    ? canonicalAuthority(required(options, "authority"))
    : null;
  const clientFactory =
    options.toriiClientFactory ?? ((url) => new ToriiClient(url));
  if (typeof clientFactory !== "function") {
    throw new TypeError("TAIRA client factory must be a function.");
  }
  const client = submit ? await clientFactory(toriiUrl) : null;
  if (submit) {
    let existingIntent = null;
    try {
      existingIntent = await readCanonicalGovernanceIntent(intentPath);
    } catch (error) {
      if (error?.code !== "ENOENT") {
        throw new Error(
          `Unable to read the durable SCCP governance intent; refusing to draft, sign, or broadcast: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    if (existingIntent !== null) {
      governanceIntentMatchesRun({
        intent: existingIntent,
        phase,
        planSha256: expectedPlanSha256,
        orderedInitializationSha256: orderedInitializationArtifact.sha256,
        freshDeployReportSha256: orderedInitialization.freshDeployReportSha256,
        authority,
        toriiUrl,
        proposalSha256,
        suppliedNonce,
        ttlMs,
      });
      const status = await reconcileGovernanceIntent({
        client,
        intent: existingIntent,
        timeoutMs,
      });
      const result = governanceSubmissionResultFromIntent({
        intent: existingIntent,
        status,
      });
      const wrote = await writeJsonAtomic(outPath, result);
      return {
        result,
        wrote,
        intentPath: resolve(intentPath),
        recovered: true,
      };
    }
  }
  const registry = await fetchExactJson(
    new URL(SOLANA_SCCP_REGISTRY_PATH, toriiUrl),
    { headers: { accept: "application/json" } },
    timeoutMs,
    MAX_REGISTRY_RESPONSE_BYTES,
  );
  const phaseState = evaluateTairaSccpGovernancePhase({
    registry,
    plan,
    phase,
  });
  if (phaseState.alreadyEnacted) {
    const result = {
      schema: "iroha-sccp-route-governance-submission/v1",
      checked_at: new Date().toISOString(),
      phase,
      plan_sha256: expectedPlanSha256,
      ordered_initialization_evidence_sha256:
        orderedInitializationArtifact.sha256,
      fresh_deploy_report_sha256: orderedInitialization.freshDeployReportSha256,
      torii_url: toriiUrl,
      submitted: false,
      already_enacted: true,
      proposal_id: null,
      transaction_hash: null,
      status: null,
    };
    const wrote = await writeJsonAtomic(outPath, result);
    return { result, wrote };
  }
  const draftPayload = await fetchExactJson(
    new URL(SOLANA_SCCP_GOVERNANCE_DRAFT_PATH, toriiUrl),
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: canonicalSccpJson(proposal),
    },
    timeoutMs,
    MAX_DRAFT_RESPONSE_BYTES,
  );
  const draft = validateSccpGovernanceDraftResponse(draftPayload);
  if (draft.tx_instructions[0].wire_id !== GOVERNANCE_INSTRUCTION_WIRE_ID) {
    throw new Error(
      "TAIRA governance draft did not return the exact ProposeSccpRouteGovernance instruction wire id.",
    );
  }
  const governanceInstructionPayloadSha256 = `0x${createHash("sha256")
    .update(Buffer.from(draft.tx_instructions[0].payload_hex, "hex"))
    .digest("hex")}`;
  let transactionHash = null;
  let terminalStatus = null;
  if (submit) {
    if (
      typeof client?.submitTransaction !== "function" ||
      typeof client?.getTransactionStatusTyped !== "function" ||
      typeof client?.waitForTransactionStatusTyped !== "function"
    ) {
      throw new Error(
        "TAIRA client cannot submit and reconcile an exact durable governance transaction.",
      );
    }
    const transactionBuilder =
      options.transactionBuilder ?? buildProposeSccpRouteGovernanceTransaction;
    const transactionInspector =
      options.transactionInspector ?? inspectSignedGovernanceTransaction;
    if (
      typeof transactionBuilder !== "function" ||
      typeof transactionInspector !== "function"
    ) {
      throw new TypeError(
        "Governance transaction builder and inspector must be functions.",
      );
    }
    const nonce = suppliedNonce ?? randomInt(1, 0x7fff_ffff);
    const privateKeyEnv = String(
      options["private-key-env"] ?? TAIRA_SCCP_PRIVATE_KEY_ENV,
    ).trim();
    const privateKey = privateKeyFromEnvironment(privateKeyEnv);
    let transaction;
    try {
      transaction = transactionBuilder({
        chainId: TAIRA_SCCP_CHAIN_ID,
        authority,
        proposal,
        metadata: {
          action: "propose_sccp_route_governance",
          route_id: plan.route_id,
          asset_key: plan.asset_key,
          route_revision: plan.revision,
          governance_phase: phase,
          governance_proposal_id: draft.proposal_id,
          reviewed_plan_sha256: expectedPlanSha256,
          ordered_initialization_evidence_sha256:
            orderedInitializationArtifact.sha256,
          fresh_deploy_report_sha256:
            orderedInitialization.freshDeployReportSha256,
        },
        ttlMs,
        nonce,
        privateKey,
      });
    } finally {
      privateKey.fill(0);
    }
    if (
      transaction === null ||
      typeof transaction !== "object" ||
      !Object.hasOwn(transaction, "hash") ||
      !Object.hasOwn(transaction, "signedTransaction")
    ) {
      throw new Error(
        "Governance transaction builder did not return exact signed bytes and hash.",
      );
    }
    const signedTransaction = Buffer.from(transaction.signedTransaction);
    const builtTransactionHash = Buffer.from(transaction.hash);
    if (
      signedTransaction.length === 0 ||
      signedTransaction.length > 1024 * 1024 ||
      builtTransactionHash.length !== 32
    ) {
      throw new Error(
        "Governance transaction builder returned invalid signed bytes or hash.",
      );
    }
    const transactionInspection = validateSignedGovernanceInspection(
      transactionInspector(signedTransaction),
    );
    transactionHash = builtTransactionHash.toString("hex");
    if (transactionInspection.transactionHash !== transactionHash) {
      throw new Error(
        "Governance transaction builder hash differs from the independently decoded signed transaction.",
      );
    }
    const intent = validateTairaSccpGovernanceIntent({
      schema: TAIRA_SCCP_GOVERNANCE_INTENT_SCHEMA,
      created_at: new Date().toISOString(),
      phase,
      plan_sha256: expectedPlanSha256,
      ordered_initialization_evidence_sha256:
        orderedInitializationArtifact.sha256,
      fresh_deploy_report_sha256: orderedInitialization.freshDeployReportSha256,
      proposal_id: draft.proposal_id,
      proposal_sha256: proposalSha256,
      authority,
      torii_url: toriiUrl,
      solana_rpc_url: SOLANA_TESTNET_RPC_URL,
      chain_id: TAIRA_SCCP_CHAIN_ID,
      instruction_wire_id: GOVERNANCE_INSTRUCTION_WIRE_ID,
      instruction_payload_sha256: governanceInstructionPayloadSha256,
      transaction_hash: transactionHash,
      transaction_payload_hash: transactionInspection.transactionPayloadHash,
      signed_transaction_sha256: transactionInspection.signedTransactionSha256,
      transaction_signature: transactionInspection.transactionSignature,
      transaction_signature_sha256:
        transactionInspection.transactionSignatureSha256,
      ttl_ms: ttlMs,
      nonce,
    });
    try {
      await writeCanonicalIntentExclusive(intentPath, intent);
    } catch (error) {
      if (error?.code === "EEXIST") {
        throw new Error(
          "A concurrent durable SCCP governance intent was published; refusing to broadcast. Rerun to reconcile it.",
        );
      }
      throw new Error(
        `Unable to durably publish the SCCP governance intent; refusing to broadcast: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    await client.submitTransaction(signedTransaction);
    terminalStatus = await client.waitForTransactionStatusTyped(
      transactionHash,
      {
        scope: "global",
        intervalMs: 750,
        timeoutMs,
      },
    );
    assertStatusBindsTransaction(terminalStatus, transactionHash);
    const kind = statusKind(terminalStatus);
    if (kind !== "Applied") {
      throw new Error(
        `SCCP governance proposal transaction was not applied: ${kind ?? "unknown"}.`,
      );
    }
  }
  const result = {
    schema: "iroha-sccp-route-governance-submission/v1",
    checked_at: new Date().toISOString(),
    phase,
    plan_sha256: expectedPlanSha256,
    ordered_initialization_evidence_sha256:
      orderedInitializationArtifact.sha256,
    fresh_deploy_report_sha256: orderedInitialization.freshDeployReportSha256,
    torii_url: toriiUrl,
    authority,
    submitted: submit,
    already_enacted: false,
    proposal_id: draft.proposal_id,
    transaction_hash: transactionHash,
    instruction_wire_id: GOVERNANCE_INSTRUCTION_WIRE_ID,
    instruction_payload_sha256: governanceInstructionPayloadSha256,
    status: terminalStatus === null ? null : jsonSafe(terminalStatus),
    next_required_action: submit
      ? "Parliament must enact this proposal; verify typed registry readback before the next phase."
      : "Review the draft, then rerun with --submit true and a runtime-only key.",
  };
  const wrote = await writeJsonAtomic(outPath, result);
  return { result, wrote };
}

async function main() {
  const options = parseTairaSccpGovernanceArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage);
    return;
  }
  const { result, wrote } = await runTairaSccpGovernance(options);
  process.stdout.write(
    `${JSON.stringify({ ok: true, wrote, result }, null, 2)}\n`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}

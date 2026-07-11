#!/usr/bin/env node
import { createHash, randomInt } from "node:crypto";
import {
  constants as fsConstants,
  mkdir,
  open,
  rename,
  rm,
} from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseTairaMcpJsonRpcResponseText } from "./taira-mcp-json-rpc.mjs";

const DEFAULT_TORII_URL = "https://taira-validator-1.sora.org";
const DEFAULT_MCP_URL = "https://taira-validator-1.sora.org/v1/mcp";
const DEFAULT_CHAIN_ID = "809574f5-fee7-5e69-bfcf-52451e42d50f";
const DEFAULT_GAS_ASSET_ID = "6TEAJqbb8oEPmLncoNiMRbLEK6tw";
const DEFAULT_GAS_LIMIT = 2_000_000;
const DEFAULT_PRIVATE_KEY_ENV = "SCCP_TAIRA_ROUTE_MANIFEST_PRIVATE_KEY";
const SOLANA_ROUTE_ID = "taira_sol_xor";
const SOLANA_ASSET_KEY = "xor";
const SOLANA_ISI_SCHEMA = "iroha-sccp-route-manifest-isi/v1";
const HASH32 = /^0x[0-9a-f]{64}$/u;
const TAIRA_VALIDATOR_HOST = /^taira-validator-[1-4]\.sora\.org$/u;
const ALLOWED_OPTIONS = new Set([
  "isi",
  "authority",
  "out",
  "torii-url",
  "mcp-url",
  "submit-via",
  "chain-id",
  "gas-asset-id",
  "gas-limit",
  "private-key-env",
  "wait-for-commit",
  "commit-timeout-ms",
  "ttl-ms",
  "nonce",
  "dry-run",
  "expected-isi-sha256",
]);

const usage = `Usage:
  node scripts/taira-submit-upsert-sccp-route-manifest.mjs --isi <route.upsert-isi.json> --authority <account-id> --out <submission.json>

Options:
  --torii-url              Default: ${DEFAULT_TORII_URL}
  --mcp-url                Default: ${DEFAULT_MCP_URL}
  --submit-via             mcp|torii, default mcp
  --chain-id               Default: ${DEFAULT_CHAIN_ID}
  --gas-asset-id           Default: ${DEFAULT_GAS_ASSET_ID}
  --gas-limit              Default: ${DEFAULT_GAS_LIMIT}
  --private-key-env        Default: ${DEFAULT_PRIVATE_KEY_ENV}
  --expected-isi-sha256    Required independent hash of the exact reviewed ISI object
  --wait-for-commit        true|false, default true
  --commit-timeout-ms      Default: 180000
  --ttl-ms                 Default: 600000
  --nonce                  Positive integer, default random
  --dry-run                Build and hash the transaction without submitting it
`;

export function parseTairaRouteManifestSubmitArgs(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--help" || token === "-h") {
      out.help = "true";
      continue;
    }
    if (!token.startsWith("--")) {
      throw new Error("Unexpected positional argument.");
    }
    const key = token.slice(2);
    if (!ALLOWED_OPTIONS.has(key)) {
      throw new Error("Unknown route-manifest submit option.");
    }
    if (Object.prototype.hasOwnProperty.call(out, key)) {
      throw new Error("Duplicate route-manifest submit option.");
    }
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) {
      throw new Error(
        "Every route-manifest submit option requires an explicit value.",
      );
    }
    out[key] = next;
    index += 1;
  }
  return out;
}

export const canonicalTairaRouteManifestIsiSha256 = (artifact) =>
  `0x${createHash("sha256").update(JSON.stringify(artifact)).digest("hex")}`;

const normalizeHash32 = (value, label) => {
  if (
    typeof value !== "string" ||
    !HASH32.test(value) ||
    /^0x0{64}$/u.test(value) ||
    /^0x([0-9a-f]{2})\1{31}$/u.test(value)
  ) {
    throw new Error(`${label} must be a canonical lowercase SHA-256 hash.`);
  }
  return value;
};

export function validateTairaRouteManifestSubmitEndpoints({
  toriiUrl,
  mcpUrl,
} = {}) {
  let torii;
  let mcp;
  try {
    torii = new URL(toriiUrl);
    mcp = new URL(mcpUrl);
  } catch {
    throw new Error("TAIRA route publication endpoints must be valid URLs.");
  }
  const common = (url) =>
    url.protocol === "https:" &&
    !url.username &&
    !url.password &&
    !url.port &&
    !url.search &&
    !url.hash &&
    TAIRA_VALIDATOR_HOST.test(url.hostname);
  if (
    !common(torii) ||
    !common(mcp) ||
    (torii.pathname !== "/" && torii.pathname !== "") ||
    mcp.pathname !== "/v1/mcp" ||
    torii.origin !== mcp.origin
  ) {
    throw new Error(
      "TAIRA route publication requires one matching canonical validator HTTPS root and /v1/mcp endpoint.",
    );
  }
  return {
    toriiUrl: torii.origin,
    mcpUrl: `${mcp.origin}/v1/mcp`,
  };
}

export function validateTairaRouteManifestIsiArtifact({
  artifact,
  expectedSha256,
} = {}) {
  if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)) {
    throw new Error("Route manifest ISI artifact must be an object.");
  }
  const expected = normalizeHash32(expectedSha256, "--expected-isi-sha256");
  const actual = canonicalTairaRouteManifestIsiSha256(artifact);
  if (actual !== expected) {
    throw new Error(
      "Route manifest ISI artifact no longer matches the independently pinned reviewed object.",
    );
  }
  if (
    artifact.schema !== SOLANA_ISI_SCHEMA ||
    artifact.routeId !== SOLANA_ROUTE_ID ||
    artifact.assetKey !== SOLANA_ASSET_KEY ||
    artifact.productionReady !== true
  ) {
    throw new Error(
      "Route manifest ISI artifact identity is not canonical taira_sol_xor production material.",
    );
  }
  const instruction = artifact.instruction;
  const manifest = instruction?.UpsertSccpRouteManifest?.manifest;
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new Error(
      "Route manifest ISI artifact must contain one UpsertSccpRouteManifest instruction.",
    );
  }
  if (
    manifest.route_id !== SOLANA_ROUTE_ID ||
    manifest.asset_key !== SOLANA_ASSET_KEY ||
    manifest.production_ready !== true
  ) {
    throw new Error(
      "Embedded route manifest identity is not canonical taira_sol_xor production material.",
    );
  }
  const manifestSha256 = canonicalTairaRouteManifestIsiSha256(manifest);
  if (
    artifact.manifestSha256 !== manifestSha256 ||
    artifact.instructionManifestSha256 !== manifestSha256
  ) {
    throw new Error(
      "Embedded route manifest bytes do not match the ISI manifest hash pins.",
    );
  }
  return { instruction, manifest, actualSha256: actual };
}

function requireText(options, key) {
  const value = String(options[key] ?? "").trim();
  if (!value) {
    throw new Error(`--${key} is required.`);
  }
  return value;
}

function parseBoolean(value, fallback) {
  if (value === undefined) return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error("boolean options must be true or false.");
}

function parsePositiveInteger(value, label, fallback) {
  const source = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(source) || source <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return source;
}

async function readJson(path, label) {
  let handle = null;
  try {
    handle = await open(
      resolve(path),
      fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0),
    );
    const stats = await handle.stat();
    if (!stats.isFile()) {
      throw new Error("not-regular");
    }
    return JSON.parse(await handle.readFile("utf8"));
  } catch (error) {
    const code =
      typeof error?.code === "string" && /^[A-Z0-9_]+$/u.test(error.code)
        ? ` (${error.code})`
        : "";
    throw new Error(`failed to read ${label}${code}.`);
  } finally {
    await handle?.close();
  }
}

export async function writeTairaRouteManifestSubmissionJson(path, value) {
  const out = resolve(path);
  await mkdir(dirname(out), { recursive: true });
  const temporary = `${out}.tmp-${process.pid}-${randomInt(1, 0x7fffffff)}`;
  let handle = null;
  try {
    handle = await open(
      temporary,
      fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY,
      0o600,
    );
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    await handle.sync();
    await handle.close();
    handle = null;
    await rename(temporary, out);
    return out;
  } catch (error) {
    await handle?.close().catch(() => {});
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}

function readPrivateKeyFromEnv(envName) {
  const raw = String(process.env[envName] ?? "")
    .trim()
    .replace(/^0x/u, "");
  if (/^[0-9a-fA-F]{64}$/u.test(raw)) {
    return Buffer.from(raw, "hex");
  }
  if (/^802620[0-9a-fA-F]{64}$/u.test(raw)) {
    return Buffer.from(raw.slice(6), "hex");
  }
  throw new Error(
    `${envName} must contain raw 32-byte hex or 802620-prefixed 32-byte hex.`,
  );
}

export function transactionStatusKind(status, seen = new WeakSet()) {
  if (typeof status === "string") {
    const trimmed = status.trim();
    if (
      /^(?:Applied|Rejected|Expired|Queued|Validating|Committed)$/u.test(
        trimmed,
      )
    ) {
      return trimmed;
    }
    if (
      (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
      (trimmed.startsWith("[") && trimmed.endsWith("]"))
    ) {
      try {
        return transactionStatusKind(JSON.parse(trimmed), seen);
      } catch (_error) {
        return null;
      }
    }
    return null;
  }
  if (!status || typeof status !== "object") {
    return null;
  }
  if (seen.has(status)) {
    return null;
  }
  seen.add(status);
  if (
    typeof status.kind === "string" &&
    /^(?:Applied|Rejected|Expired|Queued|Validating|Committed)$/u.test(
      status.kind,
    )
  ) {
    return status.kind;
  }
  const nestedCandidates = [
    status.status,
    status.content,
    status.body,
    status.receipt,
    status.structuredContent,
    status.structured_content,
    status.result,
    status.output,
  ];
  for (const candidate of nestedCandidates) {
    const kind = transactionStatusKind(candidate, seen);
    if (kind) return kind;
  }
  if (Array.isArray(status.content)) {
    for (const item of status.content) {
      const kind = transactionStatusKind(item?.text ?? item, seen);
      if (kind) return kind;
    }
  }
  return null;
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForStatus(client, hashHex, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let status = { local: null, global: null, auto: null };
  while (Date.now() <= deadline) {
    const local = await client.getTransactionStatus(hashHex, {
      allowShortHash: true,
      scope: "local",
    });
    const global = await client.getTransactionStatus(hashHex, {
      allowShortHash: true,
      scope: "global",
    });
    const auto = await client.getTransactionStatus(hashHex, {
      allowShortHash: true,
      scope: "auto",
    });
    status = { local, global, auto };
    const kind =
      transactionStatusKind(global) ??
      transactionStatusKind(auto) ??
      transactionStatusKind(local);
    if (kind === "Applied" || kind === "Rejected" || kind === "Expired") {
      return status;
    }
    await sleep(1_000);
  }
  return status;
}

async function responseBodyPreview(response) {
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0) {
    return "";
  }
  const utf8 = bytes.toString("utf8").replace(/[^\t\n\r -~]/gu, "");
  if (utf8.trim()) {
    return utf8.trim().slice(0, 512);
  }
  return `0x${bytes.toString("hex").slice(0, 512)}`;
}

async function submitSignedTransaction(client, toriiUrl, signedTransaction) {
  const txBuffer = Buffer.from(signedTransaction);
  let jsonError = null;
  try {
    const { getNativeBinding } = await import(
      "../../iroha/javascript/iroha_js/src/native.js"
    );
    const native = getNativeBinding();
    if (!native || typeof native.decodeSignedTransactionJson !== "function") {
      throw new Error(
        "native decodeSignedTransactionJson is unavailable for JSON submission",
      );
    }
    const decodedContent = JSON.parse(
      native.decodeSignedTransactionJson(txBuffer),
    );
    const content = await canonicalizeDecodedSignedTransactionAccountIds(
      decodedContent,
      369,
    );
    const response = await fetch(
      new URL("/v1/pipeline/transactions", toriiUrl),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, application/x-norito",
        },
        body: JSON.stringify({ version: 1, content }),
      },
    );
    if (![200, 201, 202, 204].includes(response.status)) {
      const preview = await responseBodyPreview(response);
      throw new Error(
        `Torii responded with HTTP ${response.status} while submitting JSON signed transaction${
          preview ? `: ${preview}` : ""
        }`,
      );
    }
    const contentType = response.headers.get("content-type") ?? "";
    return {
      receipt: contentType.toLowerCase().includes("application/json")
        ? await response.json().catch(() => null)
        : null,
      encoding: "application/json",
    };
  } catch (error) {
    jsonError = error;
  }
  try {
    return {
      receipt: await client.submitTransaction(txBuffer),
      encoding: "application/x-norito",
    };
  } catch (binaryError) {
    throw jsonError ?? binaryError;
  }
}

async function callMcpTool(mcpUrl, name, args, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(mcpUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name, arguments: args },
      }),
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(
        `MCP ${name} failed with HTTP ${response.status}: ${text.slice(0, 512)}`,
      );
    }
    const payload = parseTairaMcpJsonRpcResponseText(text);
    if (payload?.error) {
      throw new Error(
        `MCP ${name} failed: ${payload.error.message ?? JSON.stringify(payload.error)}`,
      );
    }
    return payload?.result ?? null;
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`MCP ${name} timed out after ${timeoutMs}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function submitSignedTransactionViaMcp({
  mcpUrl,
  signedTransaction,
  hash,
  timeoutMs,
  waitForCommit,
}) {
  const bodyBase64 = Buffer.from(signedTransaction).toString("base64");
  const result = await callMcpTool(
    mcpUrl,
    waitForCommit
      ? "iroha.transactions.submit_and_wait"
      : "iroha.transactions.submit",
    {
      body_base64: bodyBase64,
      ...(waitForCommit
        ? {
            hash,
            timeout_ms: timeoutMs,
            poll_interval_ms: 500,
            terminal_statuses: ["Applied"],
          }
        : {}),
    },
    timeoutMs + 5_000,
  );
  return {
    receipt: result,
    encoding: waitForCommit
      ? "mcp:iroha.transactions.submit_and_wait"
      : "mcp:iroha.transactions.submit",
    status: waitForCommit ? result : null,
  };
}

async function canonicalizeDecodedSignedTransactionAccountIds(
  value,
  accountChainDiscriminant,
) {
  const { AccountAddress } = await import(
    "../../iroha/javascript/iroha_js/src/address.js"
  );
  const canonicalizeAccountLiteral = (literal) => {
    try {
      return AccountAddress.fromAccountId(literal).toI105(
        accountChainDiscriminant,
      );
    } catch (_error) {
      return literal;
    }
  };
  const canonicalizeString = (literal) => {
    const normalized = canonicalizeAccountLiteral(literal);
    if (normalized !== literal) return normalized;
    const parts = literal.split("#");
    if (parts.length < 2) return literal;
    const account = canonicalizeAccountLiteral(parts[1]);
    if (account === parts[1]) return literal;
    return [parts[0], account, ...parts.slice(2)].join("#");
  };
  const visit = (node) => {
    if (typeof node === "string") return canonicalizeString(node);
    if (Array.isArray(node)) return node.map((entry) => visit(entry));
    if (node && typeof node === "object") {
      return Object.fromEntries(
        Object.entries(node).map(([key, entry]) => [key, visit(entry)]),
      );
    }
    return node;
  };
  return visit(value);
}

async function main() {
  const options = parseTairaRouteManifestSubmitArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage);
    return;
  }

  const isiPath = requireText(options, "isi");
  const authority = requireText(options, "authority");
  const out = requireText(options, "out");
  const endpointSelection = validateTairaRouteManifestSubmitEndpoints({
    toriiUrl: String(options["torii-url"] ?? DEFAULT_TORII_URL).trim(),
    mcpUrl: String(options["mcp-url"] ?? DEFAULT_MCP_URL).trim(),
  });
  const { toriiUrl, mcpUrl } = endpointSelection;
  const submitVia = String(options["submit-via"] ?? "mcp").trim();
  if (!["mcp", "torii"].includes(submitVia)) {
    throw new Error("--submit-via must be mcp or torii.");
  }
  const chainId = String(options["chain-id"] ?? DEFAULT_CHAIN_ID).trim();
  if (chainId !== DEFAULT_CHAIN_ID) {
    throw new Error("--chain-id must be the canonical TAIRA chain id.");
  }
  const gasAssetId = String(
    options["gas-asset-id"] ?? DEFAULT_GAS_ASSET_ID,
  ).trim();
  if (gasAssetId !== DEFAULT_GAS_ASSET_ID) {
    throw new Error(
      "--gas-asset-id must be the canonical TAIRA route-publication fee asset.",
    );
  }
  const gasLimit = parsePositiveInteger(
    options["gas-limit"],
    "--gas-limit",
    DEFAULT_GAS_LIMIT,
  );
  const privateKeyEnv = String(
    options["private-key-env"] ?? DEFAULT_PRIVATE_KEY_ENV,
  ).trim();
  if (!/^[A-Z][A-Z0-9_]{0,127}$/u.test(privateKeyEnv)) {
    throw new Error("--private-key-env must be a canonical environment name.");
  }
  const waitForCommit = parseBoolean(options["wait-for-commit"], true);
  const dryRun = parseBoolean(options["dry-run"], false);
  const ttlMs = parsePositiveInteger(options["ttl-ms"], "--ttl-ms", 600_000);
  const nonce = parsePositiveInteger(
    options.nonce,
    "--nonce",
    randomInt(1, 0x7fff_ffff),
  );
  const commitTimeoutMs = parsePositiveInteger(
    options["commit-timeout-ms"],
    "--commit-timeout-ms",
    180_000,
  );

  const artifact = await readJson(isiPath, "route manifest ISI artifact");
  const validatedIsi = validateTairaRouteManifestIsiArtifact({
    artifact,
    expectedSha256: options["expected-isi-sha256"],
  });
  const { instruction } = validatedIsi;
  const reviewedObjectHashes = {
    isiObjectSha256: validatedIsi.actualSha256,
    manifestObjectSha256: artifact.manifestSha256,
    instructionManifestObjectSha256: artifact.instructionManifestSha256,
  };
  const metadata = {
    action: "publish_sccp_route_manifest",
    route_id: artifact.routeId ?? artifact.route_id ?? "unknown",
    asset_key: artifact.assetKey ?? artifact.asset_key ?? "unknown",
    gas_asset_id: gasAssetId,
    gas_limit: gasLimit,
  };

  const { buildTransaction } = await import(
    "../../iroha/javascript/iroha_js/src/transaction.js"
  );
  const { ToriiClient } = await import(
    "../../iroha/javascript/iroha_js/src/toriiClient.js"
  );

  const privateKey = readPrivateKeyFromEnv(privateKeyEnv);
  let transaction;
  try {
    transaction = buildTransaction({
      chainId,
      authority,
      instructions: [instruction],
      metadata,
      ttlMs,
      nonce,
      privateKey,
    });
  } finally {
    privateKey.fill(0);
  }

  const client = new ToriiClient(toriiUrl);
  const hash = transaction.hash.toString("hex");
  if (!dryRun) {
    await writeTairaRouteManifestSubmissionJson(out, {
      prepared: true,
      submitted: false,
      mutationStatus: "prepared-not-yet-submitted",
      submitVia,
      mcpUrl,
      toriiUrl,
      chainId,
      authority,
      hash,
      isiPath,
      ...reviewedObjectHashes,
      metadata,
      ttlMs,
      nonce,
      waitForCommit,
      commitTimeoutMs,
    });
  }
  if (dryRun) {
    const wrote = await writeTairaRouteManifestSubmissionJson(out, {
      submitted: false,
      dryRun: true,
      submitVia,
      mcpUrl,
      toriiUrl,
      chainId,
      authority,
      hash,
      isiPath,
      ...reviewedObjectHashes,
      metadata,
      ttlMs,
      nonce,
      waitForCommit,
      commitTimeoutMs,
    });
    process.stdout.write(
      `${JSON.stringify({ ok: true, dryRun: true, wrote, hash }, null, 2)}\n`,
    );
    return;
  }

  let receipt = null;
  let encoding = null;
  let submitError = null;
  try {
    const submission =
      submitVia === "mcp"
        ? await submitSignedTransactionViaMcp({
            mcpUrl,
            signedTransaction: transaction.signedTransaction,
            hash,
            timeoutMs: commitTimeoutMs,
            waitForCommit,
          })
        : await submitSignedTransaction(
            client,
            toriiUrl,
            transaction.signedTransaction,
          );
    receipt = submission.receipt;
    encoding = submission.encoding;
  } catch (error) {
    submitError = error instanceof Error ? error.message : String(error);
  }

  let status = null;
  let statusKindSource = null;
  if (!submitError && waitForCommit && submitVia === "torii") {
    status = await waitForStatus(client, hash, commitTimeoutMs);
  }
  if (!submitError && waitForCommit && submitVia === "mcp") {
    status = receipt;
  }
  const parsedStatusKind =
    transactionStatusKind(status?.global) ??
    transactionStatusKind(status?.auto) ??
    transactionStatusKind(status?.local) ??
    transactionStatusKind(status);
  const statusKind = parsedStatusKind;
  if (parsedStatusKind) {
    statusKindSource = "receipt";
  }
  const submissionArtifact = {
    prepared: true,
    submitted: !submitError,
    mutationStatus: submitError
      ? "submission-ambiguous"
      : statusKind === "Applied"
        ? "applied"
        : "submitted-status-unknown",
    submitVia,
    toriiUrl,
    mcpUrl,
    chainId,
    authority,
    hash,
    statusKind,
    statusKindSource,
    status,
    receipt,
    encoding,
    submitError,
    isiPath,
    ...reviewedObjectHashes,
    metadata,
    ttlMs,
    nonce,
    waitForCommit,
    commitTimeoutMs,
  };
  const wrote = await writeTairaRouteManifestSubmissionJson(
    out,
    submissionArtifact,
  );
  if (submitError) {
    throw new Error(`failed to submit transaction: ${submitError}`);
  }
  if (waitForCommit && statusKind !== "Applied") {
    throw new Error(`transaction was not applied: ${statusKind ?? "unknown"}`);
  }
  process.stdout.write(
    `${JSON.stringify({ ok: true, wrote, hash, statusKind }, null, 2)}\n`,
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

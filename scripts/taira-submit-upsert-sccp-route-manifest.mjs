#!/usr/bin/env node
import { randomInt } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const DEFAULT_TORII_URL = "https://taira.sora.org";
const DEFAULT_CHAIN_ID = "809574f5-fee7-5e69-bfcf-52451e42d50f";
const DEFAULT_GAS_ASSET_ID = "6TEAJqbb8oEPmLncoNiMRbLEK6tw";
const DEFAULT_GAS_LIMIT = 2_000_000;
const DEFAULT_PRIVATE_KEY_ENV = "SCCP_TAIRA_ROUTE_MANIFEST_PRIVATE_KEY";

const usage = `Usage:
  node scripts/taira-submit-upsert-sccp-route-manifest.mjs --isi <route.upsert-isi.json> --authority <account-id> --out <submission.json>

Options:
  --torii-url              Default: ${DEFAULT_TORII_URL}
  --chain-id               Default: ${DEFAULT_CHAIN_ID}
  --gas-asset-id           Default: ${DEFAULT_GAS_ASSET_ID}
  --gas-limit              Default: ${DEFAULT_GAS_LIMIT}
  --private-key-env        Default: ${DEFAULT_PRIVATE_KEY_ENV}
  --wait-for-commit        true|false, default true
  --commit-timeout-ms      Default: 180000
  --ttl-ms                 Default: 600000
  --nonce                  Positive integer, default random
  --dry-run                Build and hash the transaction without submitting it
`;

function parseArgs(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--help" || token === "-h") {
      out.help = "true";
      continue;
    }
    if (!token.startsWith("--")) {
      throw new Error(`Unexpected argument: ${token}`);
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) {
      out[key] = "true";
      continue;
    }
    out[key] = next;
    index += 1;
  }
  return out;
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
  try {
    return JSON.parse(await readFile(resolve(path), "utf8"));
  } catch (error) {
    throw new Error(
      `failed to read ${label}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function writeJson(path, value) {
  const out = resolve(path);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return out;
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

function transactionStatusKind(status) {
  return (
    status?.status?.kind ??
    status?.kind ??
    status?.content?.status?.kind ??
    null
  );
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

function upsertInstruction(artifact) {
  const instruction = artifact?.instruction;
  if (!instruction?.UpsertSccpRouteManifest?.manifest) {
    throw new Error(
      "--isi must contain instruction.UpsertSccpRouteManifest.manifest.",
    );
  }
  return instruction;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage);
    return;
  }

  const isiPath = requireText(options, "isi");
  const authority = requireText(options, "authority");
  const out = requireText(options, "out");
  const toriiUrl = String(options["torii-url"] ?? DEFAULT_TORII_URL).trim();
  const chainId = String(options["chain-id"] ?? DEFAULT_CHAIN_ID).trim();
  const gasAssetId = String(
    options["gas-asset-id"] ?? DEFAULT_GAS_ASSET_ID,
  ).trim();
  const gasLimit = parsePositiveInteger(
    options["gas-limit"],
    "--gas-limit",
    DEFAULT_GAS_LIMIT,
  );
  const privateKeyEnv = String(
    options["private-key-env"] ?? DEFAULT_PRIVATE_KEY_ENV,
  ).trim();
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
  const instruction = upsertInstruction(artifact);
  const privateKey = readPrivateKeyFromEnv(privateKeyEnv);
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

  const transaction = buildTransaction({
    chainId,
    authority,
    instructions: [instruction],
    metadata,
    ttlMs,
    nonce,
    privateKey,
  });
  privateKey.fill(0);

  const client = new ToriiClient(toriiUrl);
  const hash = transaction.hash.toString("hex");
  if (dryRun) {
    const wrote = await writeJson(out, {
      submitted: false,
      dryRun: true,
      toriiUrl,
      chainId,
      authority,
      hash,
      isiPath,
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
    const submission = await submitSignedTransaction(
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
  if (!submitError && waitForCommit) {
    status = await waitForStatus(client, hash, commitTimeoutMs);
  }
  const statusKind =
    transactionStatusKind(status?.global) ??
    transactionStatusKind(status?.auto) ??
    transactionStatusKind(status?.local) ??
    transactionStatusKind(status);
  const submissionArtifact = {
    submitted: !submitError,
    toriiUrl,
    chainId,
    authority,
    hash,
    statusKind,
    status,
    receipt,
    encoding,
    submitError,
    isiPath,
    metadata,
    ttlMs,
    nonce,
    waitForCommit,
    commitTimeoutMs,
  };
  const wrote = await writeJson(out, submissionArtifact);
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

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});

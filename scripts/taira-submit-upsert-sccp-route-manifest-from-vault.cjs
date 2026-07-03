#!/usr/bin/env electron
"use strict";

const { app, safeStorage } = require("electron");
const { spawn } = require("node:child_process");
const { readFile } = require("node:fs/promises");
const { dirname, resolve } = require("node:path");

const DEFAULT_PRIVATE_KEY_ENV = "SCCP_TAIRA_ROUTE_MANIFEST_PRIVATE_KEY";
const ACCOUNT_SECRET_SCHEMA_V2 = "iroha-demo-account-secret/v2";
const SECURE_VAULT_FILENAME = "secure-vault.json";
const SORA_I105_PREFIX = "sorau";
const SORA_I105_FULLWIDTH_PREFIX = "\uff53\uff4f\uff52\uff41u";
const TAIRA_I105_PREFIX = "testu";
const GENERIC_I105_PREFIX_RE = /^n\d{1,4}u/u;

const usage = `Usage:
  npx electron scripts/taira-submit-upsert-sccp-route-manifest-from-vault.cjs --vault-file <secure-vault.json> --authority <account-id> --isi <route.upsert-isi.json> --out <submission.json>

Options forwarded to scripts/taira-submit-upsert-sccp-route-manifest.mjs:
  --torii-url
  --chain-id
  --gas-asset-id
  --gas-limit
  --wait-for-commit
  --commit-timeout-ms
  --ttl-ms
  --nonce
  --dry-run
  --submit-script          Default: scripts/taira-submit-upsert-sccp-route-manifest.mjs
  --private-key-env        Default: ${DEFAULT_PRIVATE_KEY_ENV}
  --app-name               Electron app name for macOS safeStorage keychain lookup
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

function trimString(value) {
  return String(value ?? "").trim();
}

function requireText(options, key) {
  const value = trimString(options[key]);
  if (!value) {
    throw new Error(`--${key} is required.`);
  }
  return value;
}

function normalizeAccountIdKey(accountId) {
  return trimString(accountId).toLowerCase();
}

function unique(values) {
  const seen = new Set();
  return values.filter((value) => {
    if (!value || seen.has(value)) {
      return false;
    }
    seen.add(value);
    return true;
  });
}

function parseI105AccountKeySuffix(accountId) {
  const normalized = normalizeAccountIdKey(accountId);
  if (normalized.startsWith(SORA_I105_PREFIX)) {
    return normalized.slice(SORA_I105_PREFIX.length);
  }
  if (normalized.startsWith(SORA_I105_FULLWIDTH_PREFIX)) {
    return normalized.slice(SORA_I105_FULLWIDTH_PREFIX.length);
  }
  if (normalized.startsWith(TAIRA_I105_PREFIX)) {
    return normalized.slice(TAIRA_I105_PREFIX.length);
  }
  const genericMatch = normalized.match(GENERIC_I105_PREFIX_RE);
  if (genericMatch) {
    return normalized.slice(genericMatch[0].length);
  }
  if (normalized.startsWith("i105:")) {
    return normalized.slice("i105:".length);
  }
  return null;
}

function accountSecretLookupKeys(accountId) {
  const normalized = normalizeAccountIdKey(accountId);
  const suffix = parseI105AccountKeySuffix(normalized);
  if (!suffix) {
    return normalized ? [normalized] : [];
  }
  return unique([
    `i105:${suffix}`,
    normalized,
    `${SORA_I105_PREFIX}${suffix}`,
    `${SORA_I105_FULLWIDTH_PREFIX}${suffix}`,
    `${TAIRA_I105_PREFIX}${suffix}`,
  ]);
}

function findAccountSecret(accountSecrets, accountId) {
  const directMatch = accountSecretLookupKeys(accountId)
    .map((key) => accountSecrets[key])
    .find(Boolean);
  if (directMatch) {
    return directMatch;
  }
  const suffix = parseI105AccountKeySuffix(accountId);
  if (!suffix) {
    return undefined;
  }
  return Object.entries(accountSecrets).find(
    ([key]) => parseI105AccountKeySuffix(key) === suffix,
  )?.[1];
}

function normalizeHex(value, label) {
  const normalized = trimString(value).replace(/^0x/iu, "");
  if (!/^[0-9a-f]+$/iu.test(normalized) || normalized.length % 2 !== 0) {
    throw new Error(`${label} must be an even-length hex string.`);
  }
  return normalized.toLowerCase();
}

function decodeAccountSecretMaterial(raw) {
  const trimmed = trimString(raw);
  if (trimmed.startsWith("{")) {
    let parsed = null;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      parsed = null;
    }
    if (parsed?.schema === ACCOUNT_SECRET_SCHEMA_V2) {
      return normalizeHex(parsed.privateKeyHex, "privateKeyHex");
    }
  }
  return normalizeHex(trimmed, "privateKeyHex");
}

function decryptVaultString(value) {
  if (String(value).startsWith("win-dpapi:")) {
    throw new Error(
      "Windows DPAPI vault entries are not supported by this Electron helper.",
    );
  }
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("Electron safeStorage encryption is unavailable.");
  }
  return safeStorage.decryptString(Buffer.from(value, "base64"));
}

async function readPrivateKeyHexFromVault(vaultFile, authority) {
  const vault = JSON.parse(await readFile(vaultFile, "utf8"));
  const accountSecrets =
    vault?.accountSecrets && typeof vault.accountSecrets === "object"
      ? vault.accountSecrets
      : {};
  const encrypted = findAccountSecret(accountSecrets, authority);
  if (!encrypted) {
    throw new Error(`No account secret found for authority ${authority}.`);
  }
  const privateKeyHex = decodeAccountSecretMaterial(
    decryptVaultString(encrypted),
  );
  if (!/^[0-9a-f]{64}$/iu.test(privateKeyHex)) {
    throw new Error("Decoded route-manager private key is not 32-byte hex.");
  }
  return privateKeyHex;
}

function forwardedArgs(options) {
  const submitScript =
    trimString(options["submit-script"]) ||
    "scripts/taira-submit-upsert-sccp-route-manifest.mjs";
  const args = [
    submitScript,
    "--isi",
    requireText(options, "isi"),
    "--authority",
    requireText(options, "authority"),
    "--out",
    requireText(options, "out"),
    "--private-key-env",
    trimString(options["private-key-env"]) || DEFAULT_PRIVATE_KEY_ENV,
  ];
  for (const key of [
    "torii-url",
    "chain-id",
    "gas-asset-id",
    "gas-limit",
    "wait-for-commit",
    "commit-timeout-ms",
    "ttl-ms",
    "nonce",
    "dry-run",
  ]) {
    if (options[key] !== undefined) {
      args.push(`--${key}`, String(options[key]));
    }
  }
  return args;
}

const bootOptions = parseArgs(process.argv.slice(2));
if (trimString(bootOptions["app-name"])) {
  app.setName(trimString(bootOptions["app-name"]));
}

async function runSubmitter(options) {
  const authority = requireText(options, "authority");
  const vaultFile = resolve(
    trimString(options["vault-file"]) ||
      `${app.getPath("userData")}/${SECURE_VAULT_FILENAME}`,
  );
  const envName =
    trimString(options["private-key-env"]) || DEFAULT_PRIVATE_KEY_ENV;
  let privateKeyHex = await readPrivateKeyHexFromVault(vaultFile, authority);
  const args = forwardedArgs(options);
  const child = spawn("node", args, {
    cwd: resolve(dirname(__dirname)),
    env: {
      ...process.env,
      [envName]: privateKeyHex,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  privateKeyHex = "";
  child.stdout.on("data", (chunk) => process.stdout.write(chunk));
  child.stderr.on("data", (chunk) => process.stderr.write(chunk));
  const code = await new Promise((resolveCode) => {
    child.on("close", resolveCode);
    child.on("error", (error) => {
      process.stderr.write(
        `${error instanceof Error ? error.message : String(error)}\n`,
      );
      resolveCode(1);
    });
  });
  if (code !== 0) {
    throw new Error(`manifest submitter exited with code ${code}.`);
  }
}

app.whenReady().then(async () => {
  try {
    const options = bootOptions;
    if (options.help) {
      process.stdout.write(usage);
      app.exit(0);
      return;
    }
    await runSubmitter(options);
    app.exit(0);
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    app.exit(1);
  }
});

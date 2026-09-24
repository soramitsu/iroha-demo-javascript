import { safeStorage } from "electron";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, open, rename, unlink } from "node:fs/promises";
import { basename, delimiter, dirname, join } from "node:path";
import { normalizeCryptoAlgorithm } from "@iroha/iroha-js/crypto";
import { parseJsonWithoutDuplicateObjectKeys } from "../src/utils/json";
import { requireFirstReleaseIpcInputObject } from "./firstReleaseIpcInput";
import { FIRST_RELEASE_CRYPTO_KEY_MATERIAL_MAX_BYTES } from "./firstReleaseResourceLimits";

const SECURE_VAULT_FILENAME = "secure-vault.json";
const SECURE_VAULT_VERSION = 1;
const ACCOUNT_SECRET_SCHEMA_V2 = "iroha-demo-account-secret/v2";
const MAX_SECURE_VAULT_BYTES = 16 * 1024 * 1024;
const MAX_ACCOUNT_SECRETS = 256;
const MAX_RECEIVE_KEYS = 4_096;
export const SECURE_VAULT_MAX_RECEIVE_KEYS_PER_ACCOUNT = 1_024;
export const SECURE_VAULT_MAX_RECEIVE_KEY_BATCH =
  SECURE_VAULT_MAX_RECEIVE_KEYS_PER_ACCOUNT;
const MAX_ACCOUNT_SECRET_HEX_CHARACTERS =
  FIRST_RELEASE_CRYPTO_KEY_MATERIAL_MAX_BYTES * 2;
const MAX_ENCRYPTED_ENVELOPE_CHARACTERS = 256 * 1024;
const MAX_DECRYPTED_SECRET_CHARACTERS = 64 * 1024;
const MAX_DPAPI_OUTPUT_CHARACTERS = 256 * 1024;
const WINDOWS_DPAPI_TIMEOUT_MS = 15_000;
const SAFE_STORAGE_ENVELOPE = "electron-safe-storage:";
const WINDOWS_DPAPI_ENVELOPE = "win-dpapi:";
const SECURE_LINUX_STORAGE_BACKENDS = new Set([
  "gnome_libsecret",
  "kwallet",
  "kwallet5",
  "kwallet6",
]);
const WSL_KERNEL_MARKER_RE = /microsoft|wsl/i;
const WINDOWS_POWERSHELL_SUBPATH = [
  "System32",
  "WindowsPowerShell",
  "v1.0",
  "powershell.exe",
];
const WSL_WINDOWS_POWERSHELL_PATH =
  "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe";

const WINDOWS_DPAPI_PROTECT_SCRIPT = `
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Security
$plainText = [Console]::In.ReadToEnd()
$plainBytes = [Text.Encoding]::UTF8.GetBytes($plainText)
$protectedBytes = [Security.Cryptography.ProtectedData]::Protect($plainBytes, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
[Console]::Out.Write([Convert]::ToBase64String($protectedBytes))
`;

const WINDOWS_DPAPI_UNPROTECT_SCRIPT = `
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Security
$protectedBase64 = [Console]::In.ReadToEnd()
$protectedBytes = [Convert]::FromBase64String($protectedBase64)
$plainBytes = [Security.Cryptography.ProtectedData]::Unprotect($protectedBytes, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
[Console]::Out.Write([Text.Encoding]::UTF8.GetString($plainBytes))
`;

const normalizeAccountIdKey = (accountId: string): string => {
  if (
    typeof accountId !== "string" ||
    !accountId ||
    accountId.trim() !== accountId ||
    accountId.normalize("NFC") !== accountId ||
    Buffer.byteLength(accountId, "utf8") > 512 ||
    accountId === "__proto__" ||
    accountId === "constructor" ||
    accountId === "prototype"
  ) {
    throw new Error("accountId must be canonical non-empty text.");
  }
  for (const character of accountId) {
    const codePoint = character.codePointAt(0)!;
    if (
      codePoint <= 0x1f ||
      codePoint === 0x7f ||
      (codePoint >= 0xd800 && codePoint <= 0xdfff) ||
      (codePoint >= 0x202a && codePoint <= 0x202e) ||
      (codePoint >= 0x2066 && codePoint <= 0x2069)
    ) {
      throw new Error("accountId must be canonical non-empty text.");
    }
  }
  return accountId;
};

const unique = (values: string[]): string[] => {
  const seen = new Set<string>();
  return values.filter((value) => {
    if (!value || seen.has(value)) {
      return false;
    }
    seen.add(value);
    return true;
  });
};

const detectWsl = (platform: NodeJS.Platform): boolean => {
  if (platform !== "linux") {
    return false;
  }
  if (process.env["WSL_INTEROP"] || process.env["WSL_DISTRO_NAME"]) {
    return true;
  }
  try {
    return WSL_KERNEL_MARKER_RE.test(
      readFileSync("/proc/sys/kernel/osrelease", "utf8"),
    );
  } catch {
    return false;
  }
};

const windowsPowerShellCandidates = (): string[] => {
  const systemRoot = process.env["SystemRoot"] || process.env["SYSTEMROOT"];
  const pathCandidates =
    process.env["PATH"]
      ?.split(delimiter)
      .filter(Boolean)
      .map((pathEntry) => join(pathEntry, "powershell.exe"))
      .filter((candidate) => existsSync(candidate)) ?? [];
  return unique([
    ...(systemRoot ? [join(systemRoot, ...WINDOWS_POWERSHELL_SUBPATH)] : []),
    ...pathCandidates,
    WSL_WINDOWS_POWERSHELL_PATH,
    "powershell.exe",
  ]);
};

const hasWindowsPowerShellCommand = (): boolean =>
  windowsPowerShellCandidates().some(
    (candidate) => candidate !== "powershell.exe" && existsSync(candidate),
  );

const normalizeAccountSecretStorageKey = (accountId: string): string =>
  normalizeAccountIdKey(accountId);

const findAccountSecret = (
  accountSecrets: Record<string, string>,
  accountId: string,
): string | undefined => {
  return accountSecrets[normalizeAccountIdKey(accountId)];
};

const normalizeHex = (value: string, label: string): string => {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]+$/.test(value) ||
    value.length % 2 !== 0
  ) {
    throw new Error(`${label} must be canonical even-length lowercase hex.`);
  }
  return value;
};

const normalizeSigningAlgorithm = (value: unknown): string => {
  if (typeof value !== "string") {
    throw new Error("signingAlgorithm must be explicitly provided.");
  }
  try {
    const normalized = normalizeCryptoAlgorithm(value);
    if (normalized !== value) {
      throw new Error("noncanonical signing algorithm");
    }
    return normalized;
  } catch {
    throw new Error(
      "signingAlgorithm must be an exact supported algorithm identifier.",
    );
  }
};

const encodeAccountSecretMaterial = (input: AccountSecretMaterial): string =>
  JSON.stringify({
    schema: ACCOUNT_SECRET_SCHEMA_V2,
    privateKeyHex: (() => {
      const privateKeyHex = normalizeHex(input.privateKeyHex, "privateKeyHex");
      if (privateKeyHex.length > MAX_ACCOUNT_SECRET_HEX_CHARACTERS) {
        throw new Error("privateKeyHex exceeds the supported size.");
      }
      return privateKeyHex;
    })(),
    signingAlgorithm: normalizeSigningAlgorithm(input.signingAlgorithm),
  });

const decodeAccountSecretMaterial = (raw: string): AccountSecretMaterial => {
  const parsed = parseJsonWithoutDuplicateObjectKeys(
    raw,
    "Account secret material",
  );
  if (
    !parsed ||
    typeof parsed !== "object" ||
    Array.isArray(parsed) ||
    Object.getPrototypeOf(parsed) !== Object.prototype
  ) {
    throw new Error("Account secret material must be an object.");
  }
  const record = parsed as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (
    keys.length !== 3 ||
    keys[0] !== "privateKeyHex" ||
    keys[1] !== "schema" ||
    keys[2] !== "signingAlgorithm" ||
    record.schema !== ACCOUNT_SECRET_SCHEMA_V2
  ) {
    throw new Error("Unsupported account secret material schema.");
  }
  if (typeof record.privateKeyHex !== "string") {
    throw new Error("privateKeyHex must be a string.");
  }
  const privateKeyHex = normalizeHex(record.privateKeyHex, "privateKeyHex");
  if (privateKeyHex.length > MAX_ACCOUNT_SECRET_HEX_CHARACTERS) {
    throw new Error("privateKeyHex exceeds the supported size.");
  }
  if (privateKeyHex !== record.privateKeyHex) {
    throw new Error("privateKeyHex must use canonical lowercase hex.");
  }
  const signingAlgorithm = normalizeSigningAlgorithm(record.signingAlgorithm);
  if (signingAlgorithm !== record.signingAlgorithm) {
    throw new Error("signingAlgorithm must be canonical lowercase text.");
  }
  return {
    privateKeyHex,
    signingAlgorithm,
  };
};

const normalizeReceiveKeyId = (value: string): string => {
  if (
    typeof value !== "string" ||
    value.length !== 24 ||
    !/^[A-Za-z0-9_-]+$/u.test(value) ||
    Buffer.from(value, "base64url").length !== 18 ||
    Buffer.from(value, "base64url").toString("base64url") !== value
  ) {
    throw new Error(
      "receiveKeyId must be canonical base64url for exactly 18 bytes.",
    );
  }
  return value;
};

const normalizeBase64Url = (value: string, label: string): string => {
  if (
    typeof value !== "string" ||
    value.length !== 43 ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  ) {
    throw new Error(`${label} must be canonical base64url for 32 bytes.`);
  }
  const decoded = Buffer.from(value, "base64url");
  try {
    if (decoded.length !== 32 || decoded.toString("base64url") !== value) {
      throw new Error(`${label} must be canonical base64url for 32 bytes.`);
    }
    return value;
  } finally {
    // This validator also handles confidential receive private keys.
    decoded.fill(0);
  }
};

const normalizeHex32 = (value: string, label: string): string => {
  const normalized = normalizeHex(value, label);
  if (normalized.length !== 64) {
    throw new Error(`${label} must be a 32-byte hex string.`);
  }
  return normalized;
};

export const SECURE_VAULT_UNAVAILABLE_MESSAGE =
  "Secure OS-backed key storage is unavailable on this device.";

type StoredReceiveKeyRecord = {
  keyId: string;
  accountId: string;
  ownerTagHex: string;
  diversifierHex: string;
  encryptedPublicKeyBase64: string;
  encryptedPrivateKeyBase64: string;
  createdAtMs: number;
};

type SecureVaultFile = {
  version: number;
  accountSecrets: Record<string, string>;
  receiveKeys: Record<string, StoredReceiveKeyRecord>;
};

export type AccountSecretMaterial = {
  privateKeyHex: string;
  signingAlgorithm: string;
};

export type ConfidentialReceiveKeyRecord = {
  keyId: string;
  accountId: string;
  ownerTagHex: string;
  diversifierHex: string;
  publicKeyBase64Url: string;
  privateKeyBase64Url: string;
  createdAtMs: number;
};

type WindowsDpapi = {
  protect(value: string): Promise<string>;
  unprotect(value: string): Promise<string>;
};

type SecureVaultOptions = {
  platform?: NodeJS.Platform;
  isWsl?: boolean;
  windowsDpapi?: WindowsDpapi;
};

const encodePowerShellCommand = (script: string): string =>
  Buffer.from(script, "utf16le").toString("base64");

const isMissingExecutableError = (error: unknown): boolean =>
  Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT",
  );

const runWindowsDpapiScriptWithCommand = (
  powerShellPath: string,
  script: string,
  input: string,
): Promise<string> =>
  new Promise((resolve, reject) => {
    const child = spawn(
      powerShellPath,
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-EncodedCommand",
        encodePowerShellCommand(script),
      ],
      {
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      },
    );
    let stdout = "";
    let stderrLength = 0;
    let settled = false;
    const finish = (operation: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      operation();
    };
    const rejectOversizeOutput = () => {
      child.kill();
      finish(() =>
        reject(new Error("Windows DPAPI command output exceeded its limit.")),
      );
    };
    const timeout = setTimeout(() => {
      child.kill();
      finish(() => reject(new Error("Windows DPAPI command timed out.")));
    }, WINDOWS_DPAPI_TIMEOUT_MS);

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
      if (stdout.length > MAX_DPAPI_OUTPUT_CHARACTERS) {
        rejectOversizeOutput();
      }
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderrLength += chunk.length;
      if (stderrLength > MAX_DPAPI_OUTPUT_CHARACTERS) {
        rejectOversizeOutput();
      }
    });
    child.on("error", (error) => {
      finish(() => reject(error));
    });
    child.on("close", (code) => {
      if (code === 0) {
        finish(() => resolve(stdout));
        return;
      }
      finish(() =>
        reject(
          new Error(
            `Windows DPAPI command failed with exit code ${code ?? "unknown"}.`,
          ),
        ),
      );
    });
    child.stdin.end(input, "utf8");
  });

const runWindowsDpapiScript = async (
  script: string,
  input: string,
): Promise<string> => {
  let lastError: unknown = null;
  for (const powerShellPath of windowsPowerShellCandidates()) {
    try {
      return await runWindowsDpapiScriptWithCommand(
        powerShellPath,
        script,
        input,
      );
    } catch (error) {
      lastError = error;
      if (!isMissingExecutableError(error)) {
        throw error;
      }
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Windows DPAPI command failed: powershell.exe was not found.");
};

const defaultWindowsDpapi: WindowsDpapi = {
  protect(value) {
    return runWindowsDpapiScript(WINDOWS_DPAPI_PROTECT_SCRIPT, value);
  },
  unprotect(value) {
    return runWindowsDpapiScript(WINDOWS_DPAPI_UNPROTECT_SCRIPT, value);
  },
};

const emptyVault = (): SecureVaultFile => ({
  version: SECURE_VAULT_VERSION,
  accountSecrets: Object.create(null) as Record<string, string>,
  receiveKeys: Object.create(null) as Record<string, StoredReceiveKeyRecord>,
});

const cloneVault = (vault: SecureVaultFile): SecureVaultFile => ({
  version: vault.version,
  accountSecrets: Object.assign(
    Object.create(null) as Record<string, string>,
    vault.accountSecrets,
  ),
  receiveKeys: (() => {
    const cloned = Object.create(null) as Record<
      string,
      StoredReceiveKeyRecord
    >;
    for (const keyId in vault.receiveKeys) {
      if (!Object.prototype.hasOwnProperty.call(vault.receiveKeys, keyId)) {
        continue;
      }
      cloned[keyId] = { ...vault.receiveKeys[keyId]! };
    }
    return cloned;
  })(),
});

const isMissingFileError = (error: unknown): boolean =>
  Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT",
  );

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype;

const assertExactKeys = (
  record: Record<string, unknown>,
  keys: readonly string[],
  label: string,
): void => {
  const expected = new Set(keys);
  let count = 0;
  for (const key in record) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) {
      continue;
    }
    count += 1;
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    if (
      count > keys.length ||
      !expected.has(key) ||
      !descriptor?.enumerable ||
      !("value" in descriptor)
    ) {
      throw new Error(`${label} has an unsupported shape.`);
    }
  }
  if (count !== keys.length) {
    throw new Error(`${label} has an unsupported shape.`);
  }
};

const assertEnumerablePropertyLimit = (
  record: Record<string, unknown>,
  maximum: number,
  message: string,
): number => {
  let count = 0;
  for (const key in record) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) {
      continue;
    }
    count += 1;
    if (count > maximum) {
      throw new Error(message);
    }
  }
  return count;
};

const requireEncryptedEnvelope = (value: unknown, label: string): string => {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_ENCRYPTED_ENVELOPE_CHARACTERS ||
    (!value.startsWith(SAFE_STORAGE_ENVELOPE) &&
      !value.startsWith(WINDOWS_DPAPI_ENVELOPE))
  ) {
    throw new Error(`${label} must use a supported encrypted envelope.`);
  }
  const separatorIndex = value.indexOf(":");
  const body = value.slice(separatorIndex + 1);
  if (
    body.length === 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(
      body,
    )
  ) {
    throw new Error(`${label} must contain canonical base64 ciphertext.`);
  }
  const decoded = Buffer.from(body, "base64");
  if (decoded.length === 0 || decoded.toString("base64") !== body) {
    throw new Error(`${label} must contain canonical base64 ciphertext.`);
  }
  return value;
};

const decodeVaultFile = (raw: string): SecureVaultFile => {
  if (Buffer.byteLength(raw, "utf8") > MAX_SECURE_VAULT_BYTES) {
    throw new Error("Secure vault exceeds the supported size.");
  }
  const parsed = parseJsonWithoutDuplicateObjectKeys(raw, "Secure vault");
  if (!isPlainRecord(parsed)) {
    throw new Error("Secure vault must be an object.");
  }
  assertExactKeys(
    parsed,
    ["version", "accountSecrets", "receiveKeys"],
    "Secure vault",
  );
  if (parsed.version !== SECURE_VAULT_VERSION) {
    throw new Error("Unsupported secure vault version.");
  }
  if (!isPlainRecord(parsed.accountSecrets)) {
    throw new Error("Secure vault accountSecrets must be an object.");
  }
  if (!isPlainRecord(parsed.receiveKeys)) {
    throw new Error("Secure vault receiveKeys must be an object.");
  }
  assertEnumerablePropertyLimit(
    parsed.accountSecrets,
    MAX_ACCOUNT_SECRETS,
    "Secure vault contains too many account secrets.",
  );
  assertEnumerablePropertyLimit(
    parsed.receiveKeys,
    MAX_RECEIVE_KEYS,
    "Secure vault contains too many receive keys.",
  );
  const accountSecrets = Object.create(null) as Record<string, string>;
  for (const accountId in parsed.accountSecrets) {
    if (
      !Object.prototype.hasOwnProperty.call(parsed.accountSecrets, accountId)
    ) {
      continue;
    }
    const encrypted = parsed.accountSecrets[accountId];
    if (normalizeAccountIdKey(accountId) !== accountId) {
      throw new Error("Secure vault account secret key is not canonical.");
    }
    accountSecrets[accountId] = requireEncryptedEnvelope(
      encrypted,
      `Secure vault account secret ${accountId}`,
    );
  }
  const receiveKeyCountByAccount = new Map<string, number>();
  const receiveKeys = Object.create(null) as Record<
    string,
    StoredReceiveKeyRecord
  >;
  for (const keyId in parsed.receiveKeys) {
    if (!Object.prototype.hasOwnProperty.call(parsed.receiveKeys, keyId)) {
      continue;
    }
    const value = parsed.receiveKeys[keyId];
    if (!isPlainRecord(value)) {
      throw new Error(`Secure vault receive key ${keyId} must be an object.`);
    }
    assertExactKeys(
      value,
      [
        "keyId",
        "accountId",
        "ownerTagHex",
        "diversifierHex",
        "encryptedPublicKeyBase64",
        "encryptedPrivateKeyBase64",
        "createdAtMs",
      ],
      `Secure vault receive key ${keyId}`,
    );
    if (normalizeReceiveKeyId(keyId) !== keyId || value.keyId !== keyId) {
      throw new Error(`Secure vault receive key ${keyId} has an invalid ID.`);
    }
    if (typeof value.accountId !== "string") {
      throw new Error(
        `Secure vault receive key ${keyId} has an invalid account ID.`,
      );
    }
    const accountId = normalizeAccountIdKey(value.accountId);
    const accountReceiveKeyCount =
      (receiveKeyCountByAccount.get(accountId) ?? 0) + 1;
    if (accountReceiveKeyCount > SECURE_VAULT_MAX_RECEIVE_KEYS_PER_ACCOUNT) {
      throw new Error(
        `Secure vault account ${accountId} contains too many receive keys.`,
      );
    }
    receiveKeyCountByAccount.set(accountId, accountReceiveKeyCount);
    if (
      typeof value.ownerTagHex !== "string" ||
      typeof value.diversifierHex !== "string"
    ) {
      throw new Error(`Secure vault receive key ${keyId} uses invalid hex.`);
    }
    const ownerTagHex = normalizeHex32(value.ownerTagHex, "ownerTagHex");
    const diversifierHex = normalizeHex32(
      value.diversifierHex,
      "diversifierHex",
    );
    if (
      ownerTagHex !== value.ownerTagHex ||
      diversifierHex !== value.diversifierHex
    ) {
      throw new Error(
        `Secure vault receive key ${keyId} uses noncanonical hex.`,
      );
    }
    if (
      typeof value.createdAtMs !== "number" ||
      !Number.isSafeInteger(value.createdAtMs) ||
      Object.is(value.createdAtMs, -0) ||
      value.createdAtMs < 0
    ) {
      throw new Error(
        `Secure vault receive key ${keyId} has an invalid timestamp.`,
      );
    }
    receiveKeys[keyId] = {
      keyId,
      accountId,
      ownerTagHex,
      diversifierHex,
      encryptedPublicKeyBase64: requireEncryptedEnvelope(
        value.encryptedPublicKeyBase64,
        `Secure vault receive key ${keyId} public key`,
      ),
      encryptedPrivateKeyBase64: requireEncryptedEnvelope(
        value.encryptedPrivateKeyBase64,
        `Secure vault receive key ${keyId} private key`,
      ),
      createdAtMs: value.createdAtMs,
    };
  }
  return {
    version: SECURE_VAULT_VERSION,
    accountSecrets,
    receiveKeys,
  };
};

const requireReceiveKeyBatch = (
  value: unknown,
): ConfidentialReceiveKeyRecord[] => {
  if (
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    value.length > SECURE_VAULT_MAX_RECEIVE_KEY_BATCH
  ) {
    throw new Error(
      `Receive-key batch must contain at most ${SECURE_VAULT_MAX_RECEIVE_KEY_BATCH} records.`,
    );
  }
  let enumerableItemCount = 0;
  for (const key in value) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      continue;
    }
    if (!/^(?:0|[1-9]\d*)$/u.test(key) || Number(key) >= value.length) {
      throw new Error("Receive-key batch contains unsupported array fields.");
    }
    enumerableItemCount += 1;
    if (enumerableItemCount > value.length) {
      throw new Error("Receive-key batch contains unsupported array fields.");
    }
  }
  if (enumerableItemCount !== value.length) {
    throw new Error("Receive-key batch must be a dense data-field array.");
  }
  if (Object.getOwnPropertySymbols(value).length !== 0) {
    throw new Error("Receive-key batch contains unsupported array fields.");
  }

  const seenKeyIds = new Set<string>();
  const normalized: ConfidentialReceiveKeyRecord[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor?.enumerable || !("value" in descriptor)) {
      throw new Error("Receive-key batch must be a dense data-field array.");
    }
    const exactInput =
      requireFirstReleaseIpcInputObject<ConfidentialReceiveKeyRecord>(
        descriptor.value,
        {
          label: `Secure vault receive-key batch[${index}]`,
          required: [
            "keyId",
            "accountId",
            "ownerTagHex",
            "diversifierHex",
            "publicKeyBase64Url",
            "privateKeyBase64Url",
            "createdAtMs",
          ],
        },
      );
    const record: ConfidentialReceiveKeyRecord = {
      keyId: normalizeReceiveKeyId(exactInput.keyId),
      accountId: normalizeAccountIdKey(exactInput.accountId),
      ownerTagHex: normalizeHex32(exactInput.ownerTagHex, "ownerTagHex"),
      diversifierHex: normalizeHex32(
        exactInput.diversifierHex,
        "diversifierHex",
      ),
      publicKeyBase64Url: normalizeBase64Url(
        exactInput.publicKeyBase64Url,
        "publicKeyBase64Url",
      ),
      privateKeyBase64Url: normalizeBase64Url(
        exactInput.privateKeyBase64Url,
        "privateKeyBase64Url",
      ),
      createdAtMs: exactInput.createdAtMs,
    };
    if (
      !Number.isSafeInteger(record.createdAtMs) ||
      Object.is(record.createdAtMs, -0) ||
      record.createdAtMs < 0
    ) {
      throw new Error("createdAtMs must be a non-negative safe integer.");
    }
    if (seenKeyIds.has(record.keyId)) {
      throw new Error("Receive-key batch must not contain duplicate key IDs.");
    }
    seenKeyIds.add(record.keyId);
    normalized.push(record);
  }
  return normalized;
};

export class SecureVault {
  private readonly filePath: string;

  private readonly platform: NodeJS.Platform;

  private readonly windowsDpapi: WindowsDpapi;

  private readonly isWsl: boolean;

  private readonly hasCustomWindowsDpapi: boolean;

  private cache: SecureVaultFile | null = null;

  private loadPromise: Promise<SecureVaultFile> | null = null;

  private mutationTail: Promise<void> = Promise.resolve();

  constructor(userDataPath: string, options: SecureVaultOptions = {}) {
    this.filePath = join(userDataPath, SECURE_VAULT_FILENAME);
    this.platform = options.platform ?? process.platform;
    this.windowsDpapi = options.windowsDpapi ?? defaultWindowsDpapi;
    this.isWsl = options.isWsl ?? detectWsl(this.platform);
    this.hasCustomWindowsDpapi = Boolean(options.windowsDpapi);
  }

  isAvailable(): boolean {
    return this.isSafeStorageAvailable() || this.canUseWindowsDpapi();
  }

  async storeAccountSecret(input: {
    accountId: string;
    privateKeyHex: string;
    signingAlgorithm: string;
  }): Promise<void> {
    const exactInput = requireFirstReleaseIpcInputObject<typeof input>(input, {
      label: "Secure vault account-secret input",
      required: ["accountId", "privateKeyHex", "signingAlgorithm"],
    });
    const storageKey = normalizeAccountSecretStorageKey(exactInput.accountId);
    const encodedMaterial = encodeAccountSecretMaterial({
      privateKeyHex: exactInput.privateKeyHex,
      signingAlgorithm: normalizeSigningAlgorithm(exactInput.signingAlgorithm),
    });
    this.ensureAvailable();
    await this.mutate(async (vault) => {
      if (
        vault.accountSecrets[storageKey] === undefined &&
        assertEnumerablePropertyLimit(
          vault.accountSecrets,
          MAX_ACCOUNT_SECRETS,
          "Secure vault contains too many account secrets.",
        ) >= MAX_ACCOUNT_SECRETS
      ) {
        throw new Error("Secure vault account-secret capacity is exhausted.");
      }
      const encrypted = await this.encrypt(encodedMaterial);
      vault.accountSecrets[storageKey] = encrypted;
    });
  }

  async getAccountSecret(accountId: string): Promise<string | null> {
    const material = await this.getAccountSecretMaterial(accountId);
    return material?.privateKeyHex ?? null;
  }

  async getAccountSecretMaterial(
    accountId: string,
  ): Promise<AccountSecretMaterial | null> {
    const storageKey = normalizeAccountSecretStorageKey(accountId);
    this.ensureAvailable();
    const vault = await this.load();
    const encrypted = vault.accountSecrets[storageKey];
    if (!encrypted) {
      return null;
    }
    return decodeAccountSecretMaterial(await this.decrypt(encrypted));
  }

  async listAccountSecretFlags(
    accountIds: string[],
  ): Promise<Record<string, boolean>> {
    if (
      !Array.isArray(accountIds) ||
      Object.getPrototypeOf(accountIds) !== Array.prototype ||
      accountIds.length > MAX_ACCOUNT_SECRETS
    ) {
      throw new Error(
        `accountIds must contain at most ${MAX_ACCOUNT_SECRETS} unique entries.`,
      );
    }
    let enumerableItemCount = 0;
    for (const key in accountIds) {
      if (!Object.prototype.hasOwnProperty.call(accountIds, key)) {
        continue;
      }
      if (!/^(?:0|[1-9]\d*)$/u.test(key) || Number(key) >= accountIds.length) {
        throw new Error("accountIds contains unsupported array fields.");
      }
      enumerableItemCount += 1;
    }
    if (enumerableItemCount !== accountIds.length) {
      throw new Error("accountIds must be a dense data-field array.");
    }
    if (Object.getOwnPropertySymbols(accountIds).length !== 0) {
      throw new Error("accountIds contains unsupported array fields.");
    }
    const normalizedAccountIds: string[] = [];
    const seen = new Set<string>();
    for (let index = 0; index < accountIds.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(
        accountIds,
        String(index),
      );
      if (!descriptor?.enumerable || !("value" in descriptor)) {
        throw new Error("accountIds must be a dense data-field array.");
      }
      const accountId = normalizeAccountIdKey(descriptor.value);
      if (seen.has(accountId)) {
        throw new Error(
          `accountIds must contain at most ${MAX_ACCOUNT_SECRETS} unique entries.`,
        );
      }
      seen.add(accountId);
      normalizedAccountIds.push(accountId);
    }
    const vault = this.isAvailable() ? await this.load() : emptyVault();
    return Object.fromEntries(
      normalizedAccountIds.map((accountId) => [
        accountId,
        Boolean(findAccountSecret(vault.accountSecrets, accountId)),
      ]),
    );
  }

  async storeReceiveKey(input: ConfidentialReceiveKeyRecord): Promise<void> {
    await this.storeReceiveKeys([input]);
  }

  async storeReceiveKeys(
    inputs: readonly ConfidentialReceiveKeyRecord[],
  ): Promise<void> {
    const normalized = requireReceiveKeyBatch(inputs);
    if (normalized.length === 0) {
      return;
    }
    this.ensureAvailable();
    await this.mutate(async (vault) => {
      const newRecords = normalized.filter(
        (record) => vault.receiveKeys[record.keyId] === undefined,
      );
      const currentReceiveKeyCount = assertEnumerablePropertyLimit(
        vault.receiveKeys,
        MAX_RECEIVE_KEYS,
        "Secure vault contains too many receive keys.",
      );
      if (currentReceiveKeyCount + newRecords.length > MAX_RECEIVE_KEYS) {
        throw new Error("Secure vault receive-key capacity is exhausted.");
      }
      const receiveKeyCountByAccount = new Map<string, number>();
      for (const keyId in vault.receiveKeys) {
        if (!Object.prototype.hasOwnProperty.call(vault.receiveKeys, keyId)) {
          continue;
        }
        const accountId = vault.receiveKeys[keyId]!.accountId;
        receiveKeyCountByAccount.set(
          accountId,
          (receiveKeyCountByAccount.get(accountId) ?? 0) + 1,
        );
      }
      for (const record of newRecords) {
        const nextCount =
          (receiveKeyCountByAccount.get(record.accountId) ?? 0) + 1;
        if (nextCount > SECURE_VAULT_MAX_RECEIVE_KEYS_PER_ACCOUNT) {
          throw new Error(
            `Secure vault account ${record.accountId} receive-key capacity is exhausted.`,
          );
        }
        receiveKeyCountByAccount.set(record.accountId, nextCount);
      }

      for (const record of normalized) {
        const existing = vault.receiveKeys[record.keyId];
        if (!existing) {
          continue;
        }
        const existingPublicKey = await this.readReceiveKeyPublicKey(existing);
        const existingPrivateKey = normalizeBase64Url(
          await this.decrypt(existing.encryptedPrivateKeyBase64),
          "privateKeyBase64Url",
        );
        const isExactRetry =
          existing.accountId === record.accountId &&
          existing.ownerTagHex === record.ownerTagHex &&
          existing.diversifierHex === record.diversifierHex &&
          existing.createdAtMs === record.createdAtMs &&
          existingPublicKey === record.publicKeyBase64Url &&
          existingPrivateKey === record.privateKeyBase64Url;
        if (!isExactRetry) {
          throw new Error(
            "receiveKeyId is already bound to different receive material.",
          );
        }
      }

      const encryptedRecords: StoredReceiveKeyRecord[] = [];
      for (const record of newRecords) {
        const encryptedPublicKeyBase64 = await this.encrypt(
          record.publicKeyBase64Url,
        );
        const encryptedPrivateKeyBase64 = await this.encrypt(
          record.privateKeyBase64Url,
        );
        encryptedRecords.push({
          keyId: record.keyId,
          accountId: record.accountId,
          ownerTagHex: record.ownerTagHex,
          diversifierHex: record.diversifierHex,
          encryptedPublicKeyBase64,
          encryptedPrivateKeyBase64,
          createdAtMs: record.createdAtMs,
        });
      }
      for (const record of encryptedRecords) {
        vault.receiveKeys[record.keyId] = record;
      }
    });
  }

  async getReceiveKey(
    keyId: string,
  ): Promise<ConfidentialReceiveKeyRecord | null> {
    const normalizedKeyId = normalizeReceiveKeyId(keyId);
    this.ensureAvailable();
    const vault = await this.load();
    const record = vault.receiveKeys[normalizedKeyId];
    if (!record) {
      return null;
    }
    return {
      keyId: record.keyId,
      accountId: record.accountId,
      ownerTagHex: record.ownerTagHex,
      diversifierHex: record.diversifierHex,
      publicKeyBase64Url: await this.readReceiveKeyPublicKey(record),
      privateKeyBase64Url: normalizeBase64Url(
        await this.decrypt(record.encryptedPrivateKeyBase64),
        "privateKeyBase64Url",
      ),
      createdAtMs: record.createdAtMs,
    };
  }

  async listReceiveKeysForAccount(
    accountId: string,
  ): Promise<ConfidentialReceiveKeyRecord[]> {
    const targetAccountId = normalizeAccountIdKey(accountId);
    this.ensureAvailable();
    const vault = await this.load();
    const records: ConfidentialReceiveKeyRecord[] = [];
    for (const keyId in vault.receiveKeys) {
      if (!Object.prototype.hasOwnProperty.call(vault.receiveKeys, keyId)) {
        continue;
      }
      const record = vault.receiveKeys[keyId]!;
      if (record.accountId !== targetAccountId) {
        continue;
      }
      records.push({
        keyId: record.keyId,
        accountId: record.accountId,
        ownerTagHex: record.ownerTagHex,
        diversifierHex: record.diversifierHex,
        publicKeyBase64Url: await this.readReceiveKeyPublicKey(record),
        privateKeyBase64Url: normalizeBase64Url(
          await this.decrypt(record.encryptedPrivateKeyBase64),
          "privateKeyBase64Url",
        ),
        createdAtMs: record.createdAtMs,
      });
    }
    return records.sort((left, right) => left.createdAtMs - right.createdAtMs);
  }

  private ensureAvailable(): void {
    if (!this.isAvailable()) {
      throw new Error(SECURE_VAULT_UNAVAILABLE_MESSAGE);
    }
  }

  private isSafeStorageAvailable(): boolean {
    try {
      if (!safeStorage.isEncryptionAvailable()) {
        return false;
      }
      if (this.platform !== "linux") {
        return true;
      }
      return SECURE_LINUX_STORAGE_BACKENDS.has(
        safeStorage.getSelectedStorageBackend(),
      );
    } catch {
      return false;
    }
  }

  private canUseWindowsDpapi(): boolean {
    if (this.platform === "win32") {
      return true;
    }
    return (
      this.isWsl &&
      (this.hasCustomWindowsDpapi || hasWindowsPowerShellCommand())
    );
  }

  private async encrypt(value: string): Promise<string> {
    if (this.isSafeStorageAvailable()) {
      try {
        const ciphertext = safeStorage.encryptString(value);
        return requireEncryptedEnvelope(
          `${SAFE_STORAGE_ENVELOPE}${ciphertext.toString("base64")}`,
          "Encrypted secure-vault value",
        );
      } catch {
        throw new Error("Secure key encryption failed.");
      }
    }
    if (this.canUseWindowsDpapi()) {
      try {
        return requireEncryptedEnvelope(
          `${WINDOWS_DPAPI_ENVELOPE}${await this.windowsDpapi.protect(value)}`,
          "Encrypted secure-vault value",
        );
      } catch {
        throw new Error("Secure key encryption failed.");
      }
    }
    throw new Error(SECURE_VAULT_UNAVAILABLE_MESSAGE);
  }

  private async decrypt(value: string): Promise<string> {
    requireEncryptedEnvelope(value, "Encrypted secure-vault value");
    let decrypted: unknown;
    if (value.startsWith(WINDOWS_DPAPI_ENVELOPE)) {
      if (!this.canUseWindowsDpapi()) {
        throw new Error(SECURE_VAULT_UNAVAILABLE_MESSAGE);
      }
      try {
        decrypted = await this.windowsDpapi.unprotect(
          value.slice(WINDOWS_DPAPI_ENVELOPE.length),
        );
      } catch {
        throw new Error("Secure key decryption failed.");
      }
    } else if (value.startsWith(SAFE_STORAGE_ENVELOPE)) {
      if (!this.isSafeStorageAvailable()) {
        throw new Error(SECURE_VAULT_UNAVAILABLE_MESSAGE);
      }
      try {
        decrypted = safeStorage.decryptString(
          Buffer.from(value.slice(SAFE_STORAGE_ENVELOPE.length), "base64"),
        );
      } catch {
        throw new Error("Secure key decryption failed.");
      }
    } else {
      throw new Error("Unsupported secure vault encryption envelope.");
    }
    if (
      typeof decrypted !== "string" ||
      decrypted.length > MAX_DECRYPTED_SECRET_CHARACTERS ||
      Buffer.byteLength(decrypted, "utf8") > MAX_DECRYPTED_SECRET_CHARACTERS
    ) {
      throw new Error("Secure key decryption returned invalid material.");
    }
    return decrypted;
  }

  private async readReceiveKeyPublicKey(
    record: StoredReceiveKeyRecord,
  ): Promise<string> {
    return normalizeBase64Url(
      await this.decrypt(record.encryptedPublicKeyBase64),
      "publicKeyBase64Url",
    );
  }

  private async load(): Promise<SecureVaultFile> {
    if (this.cache) {
      return this.cache;
    }
    if (!this.loadPromise) {
      this.loadPromise = (async () => {
        try {
          const handle = await open(this.filePath, "r");
          let raw: string;
          try {
            const metadata = await handle.stat();
            if (!metadata.isFile() || metadata.size > MAX_SECURE_VAULT_BYTES) {
              throw new Error("Secure vault exceeds the supported size.");
            }
            raw = await handle.readFile("utf8");
          } finally {
            await handle.close();
          }
          const vault = decodeVaultFile(raw);
          this.cache = vault;
          return vault;
        } catch (error) {
          if (!isMissingFileError(error)) {
            throw error;
          }
          const vault = emptyVault();
          this.cache = vault;
          return vault;
        }
      })().catch((error: unknown) => {
        this.loadPromise = null;
        throw error;
      });
    }
    return this.loadPromise;
  }

  private async mutate(
    operation: (vault: SecureVaultFile) => void | Promise<void>,
  ): Promise<void> {
    const run = this.mutationTail.then(async () => {
      const vault = cloneVault(await this.load());
      await operation(vault);
      await this.persist(vault);
    });
    this.mutationTail = run.catch(() => undefined);
    return run;
  }

  private async persist(vault: SecureVaultFile): Promise<void> {
    const encodedVault = JSON.stringify(vault, null, 2);
    if (Buffer.byteLength(encodedVault, "utf8") > MAX_SECURE_VAULT_BYTES) {
      throw new Error("Secure vault exceeds the supported size.");
    }
    decodeVaultFile(encodedVault);
    const parentDirectory = dirname(this.filePath);
    await mkdir(parentDirectory, { recursive: true, mode: 0o700 });
    const temporaryPath = join(
      parentDirectory,
      `.${basename(this.filePath)}.${process.pid}.${randomUUID()}.tmp`,
    );
    let handle: Awaited<ReturnType<typeof open>> | null = null;
    let replacedVault = false;
    try {
      handle = await open(temporaryPath, "wx", 0o600);
      await handle.writeFile(encodedVault, "utf8");
      await handle.sync();
      await handle.close();
      handle = null;
      await rename(temporaryPath, this.filePath);
      replacedVault = true;
      if (this.platform !== "win32") {
        const directoryHandle = await open(parentDirectory, "r");
        try {
          await directoryHandle.sync();
        } finally {
          await directoryHandle.close();
        }
      }
      this.cache = cloneVault(vault);
    } catch (error) {
      if (replacedVault) {
        this.cache = null;
        this.loadPromise = null;
      }
      await handle?.close().catch(() => undefined);
      await unlink(temporaryPath).catch(() => undefined);
      throw error;
    }
  }
}

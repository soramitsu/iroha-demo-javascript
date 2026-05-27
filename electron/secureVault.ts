import { safeStorage } from "electron";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { delimiter, dirname, join } from "node:path";

const SECURE_VAULT_FILENAME = "secure-vault.json";
const SECURE_VAULT_VERSION = 1;
const WINDOWS_DPAPI_ENVELOPE = "win-dpapi:";
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
$protectedBase64 = [Console]::In.ReadToEnd().Trim()
$protectedBytes = [Convert]::FromBase64String($protectedBase64)
$plainBytes = [Security.Cryptography.ProtectedData]::Unprotect($protectedBytes, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
[Console]::Out.Write([Text.Encoding]::UTF8.GetString($plainBytes))
`;

const trimString = (value: unknown): string => String(value ?? "").trim();

const normalizeAccountIdKey = (accountId: string): string =>
  trimString(accountId).toLowerCase();

const SORA_I105_PREFIX = "sorau";
const SORA_I105_FULLWIDTH_PREFIX = "\uff53\uff4f\uff52\uff41u";
const TAIRA_I105_PREFIX = "testu";
const GENERIC_I105_PREFIX_RE = /^n\d{1,4}u/;

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

const parseI105AccountKeySuffix = (accountId: string): string | null => {
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
  return null;
};

const accountSecretLookupKeys = (accountId: string): string[] => {
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
};

const normalizeAccountSecretStorageKey = (accountId: string): string =>
  accountSecretLookupKeys(accountId)[0] ?? normalizeAccountIdKey(accountId);

const findAccountSecret = (
  accountSecrets: Record<string, string>,
  accountId: string,
): string | undefined => {
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
};

const normalizeHex = (value: string, label: string): string => {
  const normalized = trimString(value).replace(/^0x/i, "");
  if (!/^[0-9a-f]+$/i.test(normalized) || normalized.length % 2 !== 0) {
    throw new Error(`${label} must be an even-length hex string.`);
  }
  return normalized.toLowerCase();
};

const normalizeReceiveKeyId = (value: string): string => {
  const normalized = trimString(value);
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(normalized)) {
    throw new Error("receiveKeyId must be a compact URL-safe identifier.");
  }
  return normalized;
};

const normalizeBase64Url = (value: string, label: string): string => {
  const normalized = trimString(value);
  if (!/^[A-Za-z0-9_-]+$/.test(normalized)) {
    throw new Error(`${label} must be base64url.`);
  }
  return normalized;
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
  publicKeyBase64Url?: string;
  encryptedPublicKeyBase64?: string;
  encryptedPrivateKeyBase64: string;
  createdAtMs: number;
};

type SecureVaultFile = {
  version: number;
  accountSecrets: Record<string, string>;
  receiveKeys: Record<string, StoredReceiveKeyRecord>;
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
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      reject(error);
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout.trim());
        return;
      }
      const detail = stderr.trim();
      reject(
        new Error(
          detail
            ? `Windows DPAPI command failed: ${detail}`
            : `Windows DPAPI command failed with exit code ${code ?? "unknown"}.`,
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
  accountSecrets: {},
  receiveKeys: {},
});

export class SecureVault {
  private readonly filePath: string;

  private readonly platform: NodeJS.Platform;

  private readonly windowsDpapi: WindowsDpapi;

  private readonly isWsl: boolean;

  private readonly hasCustomWindowsDpapi: boolean;

  private cache: SecureVaultFile | null = null;

  private loadPromise: Promise<SecureVaultFile> | null = null;

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
  }): Promise<void> {
    this.ensureAvailable();
    const vault = await this.load();
    vault.accountSecrets[normalizeAccountSecretStorageKey(input.accountId)] =
      await this.encrypt(normalizeHex(input.privateKeyHex, "privateKeyHex"));
    await this.persist(vault);
  }

  async getAccountSecret(accountId: string): Promise<string | null> {
    this.ensureAvailable();
    const vault = await this.load();
    const encrypted = findAccountSecret(vault.accountSecrets, accountId);
    if (!encrypted) {
      return null;
    }
    return normalizeHex(await this.decrypt(encrypted), "privateKeyHex");
  }

  async listAccountSecretFlags(
    accountIds: string[],
  ): Promise<Record<string, boolean>> {
    const vault = this.isAvailable() ? await this.load() : emptyVault();
    return Object.fromEntries(
      accountIds.map((accountId) => [
        accountId,
        Boolean(findAccountSecret(vault.accountSecrets, accountId)),
      ]),
    );
  }

  async storeReceiveKey(
    input: ConfidentialReceiveKeyRecord,
  ): Promise<ConfidentialReceiveKeyRecord> {
    this.ensureAvailable();
    const vault = await this.load();
    const keyId = normalizeReceiveKeyId(input.keyId);
    const record: StoredReceiveKeyRecord = {
      keyId,
      accountId: normalizeAccountIdKey(input.accountId),
      ownerTagHex: normalizeHex32(input.ownerTagHex, "ownerTagHex"),
      diversifierHex: normalizeHex32(input.diversifierHex, "diversifierHex"),
      encryptedPublicKeyBase64: await this.encrypt(
        normalizeBase64Url(input.publicKeyBase64Url, "publicKeyBase64Url"),
      ),
      encryptedPrivateKeyBase64: await this.encrypt(
        normalizeBase64Url(input.privateKeyBase64Url, "privateKeyBase64Url"),
      ),
      createdAtMs:
        Number.isFinite(input.createdAtMs) && input.createdAtMs >= 0
          ? Math.trunc(input.createdAtMs)
          : Date.now(),
    };
    vault.receiveKeys[keyId] = record;
    await this.persist(vault);
    return {
      keyId: record.keyId,
      accountId: record.accountId,
      ownerTagHex: record.ownerTagHex,
      diversifierHex: record.diversifierHex,
      publicKeyBase64Url: normalizeBase64Url(
        input.publicKeyBase64Url,
        "publicKeyBase64Url",
      ),
      privateKeyBase64Url: normalizeBase64Url(
        input.privateKeyBase64Url,
        "privateKeyBase64Url",
      ),
      createdAtMs: record.createdAtMs,
    };
  }

  async getReceiveKey(
    keyId: string,
  ): Promise<ConfidentialReceiveKeyRecord | null> {
    this.ensureAvailable();
    const vault = await this.load();
    const record = vault.receiveKeys[normalizeReceiveKeyId(keyId)];
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
    this.ensureAvailable();
    const vault = await this.load();
    const targetAccountId = normalizeAccountIdKey(accountId);
    const records = await Promise.all(
      Object.values(vault.receiveKeys)
        .filter((record) => record.accountId === targetAccountId)
        .map(async (record) => ({
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
        })),
    );
    return records.sort((left, right) => left.createdAtMs - right.createdAtMs);
  }

  private ensureAvailable(): void {
    if (!this.isAvailable()) {
      throw new Error(SECURE_VAULT_UNAVAILABLE_MESSAGE);
    }
  }

  private isSafeStorageAvailable(): boolean {
    try {
      return safeStorage.isEncryptionAvailable();
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
      return safeStorage.encryptString(value).toString("base64");
    }
    if (this.canUseWindowsDpapi()) {
      return `${WINDOWS_DPAPI_ENVELOPE}${await this.windowsDpapi.protect(value)}`;
    }
    throw new Error(SECURE_VAULT_UNAVAILABLE_MESSAGE);
  }

  private async decrypt(value: string): Promise<string> {
    if (value.startsWith(WINDOWS_DPAPI_ENVELOPE)) {
      if (!this.canUseWindowsDpapi()) {
        throw new Error(SECURE_VAULT_UNAVAILABLE_MESSAGE);
      }
      return this.windowsDpapi.unprotect(
        value.slice(WINDOWS_DPAPI_ENVELOPE.length),
      );
    }
    if (this.isSafeStorageAvailable()) {
      return safeStorage.decryptString(Buffer.from(value, "base64"));
    }
    throw new Error(SECURE_VAULT_UNAVAILABLE_MESSAGE);
  }

  private async readReceiveKeyPublicKey(
    record: StoredReceiveKeyRecord,
  ): Promise<string> {
    if (record.encryptedPublicKeyBase64) {
      return normalizeBase64Url(
        await this.decrypt(record.encryptedPublicKeyBase64),
        "publicKeyBase64Url",
      );
    }
    return normalizeBase64Url(
      record.publicKeyBase64Url ?? "",
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
          const raw = await readFile(this.filePath, "utf8");
          const parsed = JSON.parse(raw) as Partial<SecureVaultFile>;
          const vault: SecureVaultFile = {
            version:
              parsed.version === SECURE_VAULT_VERSION
                ? SECURE_VAULT_VERSION
                : SECURE_VAULT_VERSION,
            accountSecrets:
              parsed.accountSecrets &&
              typeof parsed.accountSecrets === "object" &&
              !Array.isArray(parsed.accountSecrets)
                ? { ...parsed.accountSecrets }
                : {},
            receiveKeys:
              parsed.receiveKeys &&
              typeof parsed.receiveKeys === "object" &&
              !Array.isArray(parsed.receiveKeys)
                ? { ...parsed.receiveKeys }
                : {},
          };
          this.cache = vault;
          return vault;
        } catch {
          const vault = emptyVault();
          this.cache = vault;
          return vault;
        }
      })();
    }
    return this.loadPromise;
  }

  private async persist(vault: SecureVaultFile): Promise<void> {
    this.cache = vault;
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(vault, null, 2), "utf8");
  }
}

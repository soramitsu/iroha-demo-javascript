import { safeStorage } from "electron";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const SECURE_VAULT_FILENAME = "secure-vault.json";
const SECURE_VAULT_VERSION = 1;

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

const emptyVault = (): SecureVaultFile => ({
  version: SECURE_VAULT_VERSION,
  accountSecrets: {},
  receiveKeys: {},
});

export class SecureVault {
  private readonly filePath: string;

  private cache: SecureVaultFile | null = null;

  private loadPromise: Promise<SecureVaultFile> | null = null;

  constructor(userDataPath: string) {
    this.filePath = join(userDataPath, SECURE_VAULT_FILENAME);
  }

  isAvailable(): boolean {
    return safeStorage.isEncryptionAvailable();
  }

  async storeAccountSecret(input: {
    accountId: string;
    privateKeyHex: string;
  }): Promise<void> {
    this.ensureAvailable();
    const vault = await this.load();
    vault.accountSecrets[normalizeAccountSecretStorageKey(input.accountId)] =
      this.encrypt(normalizeHex(input.privateKeyHex, "privateKeyHex"));
    await this.persist(vault);
  }

  async getAccountSecret(accountId: string): Promise<string | null> {
    this.ensureAvailable();
    const vault = await this.load();
    const encrypted = findAccountSecret(vault.accountSecrets, accountId);
    if (!encrypted) {
      return null;
    }
    return normalizeHex(this.decrypt(encrypted), "privateKeyHex");
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
      encryptedPublicKeyBase64: this.encrypt(
        normalizeBase64Url(input.publicKeyBase64Url, "publicKeyBase64Url"),
      ),
      encryptedPrivateKeyBase64: this.encrypt(
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
      publicKeyBase64Url: this.readReceiveKeyPublicKey(record),
      privateKeyBase64Url: normalizeBase64Url(
        this.decrypt(record.encryptedPrivateKeyBase64),
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
    return Object.values(vault.receiveKeys)
      .filter((record) => record.accountId === targetAccountId)
      .map((record) => ({
        keyId: record.keyId,
        accountId: record.accountId,
        ownerTagHex: record.ownerTagHex,
        diversifierHex: record.diversifierHex,
        publicKeyBase64Url: this.readReceiveKeyPublicKey(record),
        privateKeyBase64Url: normalizeBase64Url(
          this.decrypt(record.encryptedPrivateKeyBase64),
          "privateKeyBase64Url",
        ),
        createdAtMs: record.createdAtMs,
      }))
      .sort((left, right) => left.createdAtMs - right.createdAtMs);
  }

  private ensureAvailable(): void {
    if (!this.isAvailable()) {
      throw new Error(SECURE_VAULT_UNAVAILABLE_MESSAGE);
    }
  }

  private encrypt(value: string): string {
    return safeStorage.encryptString(value).toString("base64");
  }

  private decrypt(value: string): string {
    return safeStorage.decryptString(Buffer.from(value, "base64"));
  }

  private readReceiveKeyPublicKey(record: StoredReceiveKeyRecord): string {
    if (record.encryptedPublicKeyBase64) {
      return normalizeBase64Url(
        this.decrypt(record.encryptedPublicKeyBase64),
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

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SecureVault,
  SECURE_VAULT_UNAVAILABLE_MESSAGE,
} from "../electron/secureVault";

const safeStorageMock = vi.hoisted(() => ({
  isEncryptionAvailable: vi.fn(),
  encryptString: vi.fn(),
  decryptString: vi.fn(),
}));

vi.mock("electron", () => ({
  safeStorage: safeStorageMock,
}));

const vaultFile = (dir: string) => join(dir, "secure-vault.json");
const encryptFixture = (value: string) =>
  Buffer.from(value, "utf8").toString("base64");
const protectFixture = (value: string) =>
  `dpapi-${Buffer.from(value, "utf8").toString("base64url")}`;
const unprotectFixture = (value: string) =>
  Buffer.from(value.replace(/^dpapi-/, ""), "base64url").toString("utf8");
const createWindowsDpapiMock = () => ({
  protect: vi.fn(async (value: string) => protectFixture(value)),
  unprotect: vi.fn(async (value: string) => unprotectFixture(value)),
});

describe("SecureVault", () => {
  let tempDir = "";

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "iroha-secure-vault-"));
    vi.clearAllMocks();
    safeStorageMock.isEncryptionAvailable.mockReturnValue(true);
    safeStorageMock.encryptString.mockImplementation((value: string) =>
      Buffer.from(value, "utf8"),
    );
    safeStorageMock.decryptString.mockImplementation((value: Buffer) =>
      value.toString("utf8"),
    );
  });

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("finds existing TAIRA secrets after the account id is rendered for mainnet", async () => {
    const privateKeyHex = "aa".repeat(32);
    await writeFile(
      vaultFile(tempDir),
      JSON.stringify({
        version: 1,
        accountSecrets: {
          testulegacyaccount1234567890: encryptFixture(privateKeyHex),
        },
        receiveKeys: {},
      }),
    );

    const vault = new SecureVault(tempDir);

    await expect(
      vault.getAccountSecret("sorauLegacyAccount1234567890"),
    ).resolves.toBe(privateKeyHex);
    await expect(
      vault.listAccountSecretFlags([
        "sorauLegacyAccount1234567890",
        "sorauMissingAccount1234567890",
      ]),
    ).resolves.toEqual({
      sorauLegacyAccount1234567890: true,
      sorauMissingAccount1234567890: false,
    });
  });

  it("finds existing custom-prefix I105 secrets after the account prefix changes", async () => {
    const privateKeyHex = "cc".repeat(32);
    await writeFile(
      vaultFile(tempDir),
      JSON.stringify({
        version: 1,
        accountSecrets: {
          n42ucustomaccount1234567890: encryptFixture(privateKeyHex),
        },
        receiveKeys: {},
      }),
    );

    const vault = new SecureVault(tempDir);

    await expect(
      vault.getAccountSecret("sorauCustomAccount1234567890"),
    ).resolves.toBe(privateKeyHex);
  });

  it("stores new I105 secrets under a prefix-neutral key", async () => {
    const privateKeyHex = "bb".repeat(32);
    const vault = new SecureVault(tempDir);

    await vault.storeAccountSecret({
      accountId: "sorauSharedAccount1234567890",
      privateKeyHex,
    });

    await expect(
      vault.getAccountSecret("testuSharedAccount1234567890"),
    ).resolves.toBe(privateKeyHex);

    const persisted = JSON.parse(await readFile(vaultFile(tempDir), "utf8"));
    expect(persisted.accountSecrets).toHaveProperty(
      "i105:sharedaccount1234567890",
    );
    expect(persisted.accountSecrets).not.toHaveProperty(
      "sorausharedaccount1234567890",
    );
  });

  it("uses Windows DPAPI when safeStorage is unavailable on Windows", async () => {
    const privateKeyHex = "dd".repeat(32);
    safeStorageMock.isEncryptionAvailable.mockReturnValue(false);
    const windowsDpapi = createWindowsDpapiMock();
    const vault = new SecureVault(tempDir, {
      platform: "win32",
      windowsDpapi,
    });

    expect(vault.isAvailable()).toBe(true);

    await vault.storeAccountSecret({
      accountId: "sorauWindowsAccount1234567890",
      privateKeyHex,
    });

    const persisted = JSON.parse(await readFile(vaultFile(tempDir), "utf8"));
    const encrypted = persisted.accountSecrets["i105:windowsaccount1234567890"];
    expect(encrypted).toBe(`win-dpapi:${protectFixture(privateKeyHex)}`);
    expect(safeStorageMock.encryptString).not.toHaveBeenCalled();
    await expect(
      vault.getAccountSecret("testuWindowsAccount1234567890"),
    ).resolves.toBe(privateKeyHex);
    expect(windowsDpapi.unprotect).toHaveBeenCalledWith(
      protectFixture(privateKeyHex),
    );
  });

  it("uses Windows DPAPI when safeStorage is unavailable under WSL2", async () => {
    const privateKeyHex = "ab".repeat(32);
    safeStorageMock.isEncryptionAvailable.mockReturnValue(false);
    const windowsDpapi = createWindowsDpapiMock();
    const vault = new SecureVault(tempDir, {
      platform: "linux",
      isWsl: true,
      windowsDpapi,
    });

    expect(vault.isAvailable()).toBe(true);

    await vault.storeAccountSecret({
      accountId: "sorauWslAccount1234567890",
      privateKeyHex,
    });

    const persisted = JSON.parse(await readFile(vaultFile(tempDir), "utf8"));
    expect(persisted.accountSecrets["i105:wslaccount1234567890"]).toBe(
      `win-dpapi:${protectFixture(privateKeyHex)}`,
    );
    expect(safeStorageMock.encryptString).not.toHaveBeenCalled();
    await expect(
      vault.getAccountSecret("testuWslAccount1234567890"),
    ).resolves.toBe(privateKeyHex);
    expect(windowsDpapi.unprotect).toHaveBeenCalledWith(
      protectFixture(privateKeyHex),
    );
  });

  it("stores confidential receive keys with Windows DPAPI fallback", async () => {
    safeStorageMock.isEncryptionAvailable.mockReturnValue(false);
    const windowsDpapi = createWindowsDpapiMock();
    const vault = new SecureVault(tempDir, {
      platform: "win32",
      windowsDpapi,
    });
    const record = {
      keyId: "receive_key_123",
      accountId: "sorauReceiveAccount1234567890",
      ownerTagHex: "11".repeat(32),
      diversifierHex: "22".repeat(32),
      publicKeyBase64Url: "public_key",
      privateKeyBase64Url: "private_key",
      createdAtMs: 42,
    };

    await vault.storeReceiveKey(record);

    const persisted = JSON.parse(await readFile(vaultFile(tempDir), "utf8"));
    expect(
      persisted.receiveKeys.receive_key_123.encryptedPrivateKeyBase64,
    ).toBe(`win-dpapi:${protectFixture("private_key")}`);
    await expect(vault.getReceiveKey("receive_key_123")).resolves.toEqual({
      ...record,
      accountId: record.accountId.toLowerCase(),
    });
    await expect(
      vault.listReceiveKeysForAccount("sorauReceiveAccount1234567890"),
    ).resolves.toEqual([
      { ...record, accountId: record.accountId.toLowerCase() },
    ]);
  });

  it("does not report availability on non-Windows when safeStorage is unavailable", async () => {
    safeStorageMock.isEncryptionAvailable.mockReturnValue(false);
    const vault = new SecureVault(tempDir, { platform: "linux", isWsl: false });

    expect(vault.isAvailable()).toBe(false);
    await expect(
      vault.storeAccountSecret({
        accountId: "sorauLinuxAccount1234567890",
        privateKeyHex: "aa".repeat(32),
      }),
    ).rejects.toThrow(SECURE_VAULT_UNAVAILABLE_MESSAGE);
    await expect(readFile(vaultFile(tempDir), "utf8")).rejects.toThrow();
  });

  it("falls back to Windows DPAPI when the safeStorage availability probe throws", async () => {
    const privateKeyHex = "ee".repeat(32);
    safeStorageMock.isEncryptionAvailable.mockImplementation(() => {
      throw new Error("safeStorage probe failed");
    });
    const windowsDpapi = createWindowsDpapiMock();
    const vault = new SecureVault(tempDir, {
      platform: "win32",
      windowsDpapi,
    });

    expect(vault.isAvailable()).toBe(true);

    await vault.storeAccountSecret({
      accountId: "sorauProbeAccount1234567890",
      privateKeyHex,
    });

    const persisted = JSON.parse(await readFile(vaultFile(tempDir), "utf8"));
    expect(persisted.accountSecrets["i105:probeaccount1234567890"]).toBe(
      `win-dpapi:${protectFixture(privateKeyHex)}`,
    );
  });

  it("treats safeStorage probe exceptions as unavailable off Windows", async () => {
    safeStorageMock.isEncryptionAvailable.mockImplementation(() => {
      throw new Error("safeStorage probe failed");
    });
    const vault = new SecureVault(tempDir, { platform: "darwin" });

    expect(vault.isAvailable()).toBe(false);
    await expect(
      vault.getAccountSecret("sorauProbeAccount1234567890"),
    ).rejects.toThrow(SECURE_VAULT_UNAVAILABLE_MESSAGE);
  });

  it("does not persist account secrets when Windows DPAPI protection fails", async () => {
    safeStorageMock.isEncryptionAvailable.mockReturnValue(false);
    const windowsDpapi = {
      protect: vi.fn(async () => {
        throw new Error("DPAPI protect denied");
      }),
      unprotect: vi.fn(async (value: string) => unprotectFixture(value)),
    };
    const vault = new SecureVault(tempDir, {
      platform: "win32",
      windowsDpapi,
    });

    await expect(
      vault.storeAccountSecret({
        accountId: "sorauDeniedAccount1234567890",
        privateKeyHex: "aa".repeat(32),
      }),
    ).rejects.toThrow("DPAPI protect denied");
    await expect(readFile(vaultFile(tempDir), "utf8")).rejects.toThrow();
  });

  it("does not persist account secrets when WSL DPAPI protection fails", async () => {
    safeStorageMock.isEncryptionAvailable.mockReturnValue(false);
    const windowsDpapi = {
      protect: vi.fn(async () => {
        throw new Error("WSL DPAPI protect denied");
      }),
      unprotect: vi.fn(async (value: string) => unprotectFixture(value)),
    };
    const vault = new SecureVault(tempDir, {
      platform: "linux",
      isWsl: true,
      windowsDpapi,
    });

    expect(vault.isAvailable()).toBe(true);
    await expect(
      vault.storeAccountSecret({
        accountId: "sorauDeniedWslAccount1234567890",
        privateKeyHex: "aa".repeat(32),
      }),
    ).rejects.toThrow("WSL DPAPI protect denied");
    expect(safeStorageMock.encryptString).not.toHaveBeenCalled();
    await expect(readFile(vaultFile(tempDir), "utf8")).rejects.toThrow();
  });

  it("does not call any encryption backend for malformed private keys", async () => {
    safeStorageMock.isEncryptionAvailable.mockReturnValue(false);
    const windowsDpapi = createWindowsDpapiMock();
    const vault = new SecureVault(tempDir, {
      platform: "win32",
      windowsDpapi,
    });

    await expect(
      vault.storeAccountSecret({
        accountId: "sorauBadKeyAccount1234567890",
        privateKeyHex: "zz",
      }),
    ).rejects.toThrow("privateKeyHex must be an even-length hex string.");
    expect(windowsDpapi.protect).not.toHaveBeenCalled();
    expect(safeStorageMock.encryptString).not.toHaveBeenCalled();
    await expect(readFile(vaultFile(tempDir), "utf8")).rejects.toThrow();
  });

  it("rejects odd-length private keys before encrypting", async () => {
    const vault = new SecureVault(tempDir);

    await expect(
      vault.storeAccountSecret({
        accountId: "sorauOddKeyAccount1234567890",
        privateKeyHex: "abc",
      }),
    ).rejects.toThrow("privateKeyHex must be an even-length hex string.");
    expect(safeStorageMock.encryptString).not.toHaveBeenCalled();
  });

  it("refuses Windows DPAPI envelopes on non-Windows platforms", async () => {
    await writeFile(
      vaultFile(tempDir),
      JSON.stringify({
        version: 1,
        accountSecrets: {
          "i105:foreignaccount1234567890": `win-dpapi:${protectFixture(
            "aa".repeat(32),
          )}`,
        },
        receiveKeys: {},
      }),
    );
    const vault = new SecureVault(tempDir, { platform: "darwin" });

    await expect(
      vault.getAccountSecret("sorauForeignAccount1234567890"),
    ).rejects.toThrow(SECURE_VAULT_UNAVAILABLE_MESSAGE);
    expect(safeStorageMock.decryptString).not.toHaveBeenCalled();
  });

  it("does not route legacy safeStorage blobs through Windows DPAPI fallback", async () => {
    const privateKeyHex = "af".repeat(32);
    safeStorageMock.isEncryptionAvailable.mockReturnValue(false);
    const windowsDpapi = createWindowsDpapiMock();
    await writeFile(
      vaultFile(tempDir),
      JSON.stringify({
        version: 1,
        accountSecrets: {
          "i105:legacyaccount1234567890": encryptFixture(privateKeyHex),
        },
        receiveKeys: {},
      }),
    );
    const vault = new SecureVault(tempDir, {
      platform: "win32",
      windowsDpapi,
    });

    await expect(
      vault.getAccountSecret("sorauLegacyAccount1234567890"),
    ).rejects.toThrow(SECURE_VAULT_UNAVAILABLE_MESSAGE);
    expect(windowsDpapi.unprotect).not.toHaveBeenCalled();
  });

  it("propagates Windows DPAPI unprotect failures without returning a secret", async () => {
    safeStorageMock.isEncryptionAvailable.mockReturnValue(false);
    const windowsDpapi = {
      protect: vi.fn(async (value: string) => protectFixture(value)),
      unprotect: vi.fn(async () => {
        throw new Error("DPAPI unprotect denied");
      }),
    };
    await writeFile(
      vaultFile(tempDir),
      JSON.stringify({
        version: 1,
        accountSecrets: {
          "i105:deniedaccount1234567890": "win-dpapi:unreadable",
        },
        receiveKeys: {},
      }),
    );
    const vault = new SecureVault(tempDir, {
      platform: "win32",
      windowsDpapi,
    });

    await expect(
      vault.getAccountSecret("sorauDeniedAccount1234567890"),
    ).rejects.toThrow("DPAPI unprotect denied");
  });

  it("rejects decrypted Windows DPAPI payloads that are not private-key hex", async () => {
    safeStorageMock.isEncryptionAvailable.mockReturnValue(false);
    const windowsDpapi = {
      protect: vi.fn(async (value: string) => protectFixture(value)),
      unprotect: vi.fn(async () => "not-private-key-hex"),
    };
    await writeFile(
      vaultFile(tempDir),
      JSON.stringify({
        version: 1,
        accountSecrets: {
          "i105:invalidpayload1234567890": "win-dpapi:invalid",
        },
        receiveKeys: {},
      }),
    );
    const vault = new SecureVault(tempDir, {
      platform: "win32",
      windowsDpapi,
    });

    await expect(
      vault.getAccountSecret("sorauInvalidPayload1234567890"),
    ).rejects.toThrow("privateKeyHex must be an even-length hex string.");
  });

  it("returns no flags for malformed vault files instead of trusting bad JSON", async () => {
    await writeFile(vaultFile(tempDir), "{ not valid json");
    const vault = new SecureVault(tempDir);

    await expect(
      vault.listAccountSecretFlags(["sorauCorruptAccount1234567890"]),
    ).resolves.toEqual({ sorauCorruptAccount1234567890: false });
    await expect(
      vault.getAccountSecret("sorauCorruptAccount1234567890"),
    ).resolves.toBeNull();
  });

  it("ignores non-object secret maps in persisted vault files", async () => {
    await writeFile(
      vaultFile(tempDir),
      JSON.stringify({
        version: 1,
        accountSecrets: ["not", "a", "map"],
        receiveKeys: ["also", "bad"],
      }),
    );
    const vault = new SecureVault(tempDir);

    await expect(
      vault.listAccountSecretFlags(["sorauArrayAccount1234567890"]),
    ).resolves.toEqual({ sorauArrayAccount1234567890: false });
    await expect(
      vault.listReceiveKeysForAccount("sorauArrayAccount1234567890"),
    ).resolves.toEqual([]);
  });

  it("rejects receive-key ids that look like path traversal", async () => {
    const vault = new SecureVault(tempDir);

    await expect(
      vault.storeReceiveKey({
        keyId: "../receive_key_123",
        accountId: "sorauReceiveAccount1234567890",
        ownerTagHex: "11".repeat(32),
        diversifierHex: "22".repeat(32),
        publicKeyBase64Url: "public_key",
        privateKeyBase64Url: "private_key",
        createdAtMs: 42,
      }),
    ).rejects.toThrow("receiveKeyId must be a compact URL-safe identifier.");
    expect(safeStorageMock.encryptString).not.toHaveBeenCalled();
  });

  it("rejects receive-key owner tags with the wrong byte length", async () => {
    const vault = new SecureVault(tempDir);

    await expect(
      vault.storeReceiveKey({
        keyId: "receive_key_123",
        accountId: "sorauReceiveAccount1234567890",
        ownerTagHex: "11".repeat(31),
        diversifierHex: "22".repeat(32),
        publicKeyBase64Url: "public_key",
        privateKeyBase64Url: "private_key",
        createdAtMs: 42,
      }),
    ).rejects.toThrow("ownerTagHex must be a 32-byte hex string.");
    expect(safeStorageMock.encryptString).not.toHaveBeenCalled();
  });

  it("rejects receive keys with non-base64url public material", async () => {
    const vault = new SecureVault(tempDir);

    await expect(
      vault.storeReceiveKey({
        keyId: "receive_key_123",
        accountId: "sorauReceiveAccount1234567890",
        ownerTagHex: "11".repeat(32),
        diversifierHex: "22".repeat(32),
        publicKeyBase64Url: "public key!",
        privateKeyBase64Url: "private_key",
        createdAtMs: 42,
      }),
    ).rejects.toThrow("publicKeyBase64Url must be base64url.");
    expect(safeStorageMock.encryptString).not.toHaveBeenCalled();
  });

  it("rejects corrupted encrypted receive-key private material on read", async () => {
    await writeFile(
      vaultFile(tempDir),
      JSON.stringify({
        version: 1,
        accountSecrets: {},
        receiveKeys: {
          receive_key_123: {
            keyId: "receive_key_123",
            accountId: "soraureceiveaccount1234567890",
            ownerTagHex: "11".repeat(32),
            diversifierHex: "22".repeat(32),
            encryptedPublicKeyBase64: encryptFixture("public_key"),
            encryptedPrivateKeyBase64: encryptFixture("private key!"),
            createdAtMs: 42,
          },
        },
      }),
    );
    const vault = new SecureVault(tempDir);

    await expect(vault.getReceiveKey("receive_key_123")).rejects.toThrow(
      "privateKeyBase64Url must be base64url.",
    );
  });
});

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SecureVault,
  SECURE_VAULT_MAX_RECEIVE_KEY_BATCH,
  SECURE_VAULT_UNAVAILABLE_MESSAGE,
} from "../electron/secureVault";

const safeStorageMock = vi.hoisted(() => ({
  isEncryptionAvailable: vi.fn(),
  getSelectedStorageBackend: vi.fn(),
  encryptString: vi.fn(),
  decryptString: vi.fn(),
}));

vi.mock("electron", () => ({
  safeStorage: safeStorageMock,
}));

const vaultFile = (dir: string) => join(dir, "secure-vault.json");
const encryptFixture = (value: string) =>
  `electron-safe-storage:${Buffer.from(value, "utf8").toString("base64")}`;
const protectFixture = (value: string) =>
  Buffer.from(value, "utf8").toString("base64");
const unprotectFixture = (value: string) =>
  Buffer.from(value, "base64").toString("utf8");
const accountSecretMaterialFixture = (
  privateKeyHex: string,
  signingAlgorithm = "ed25519",
) =>
  JSON.stringify({
    schema: "iroha-demo-account-secret/v2",
    privateKeyHex,
    signingAlgorithm,
  });
const protectAccountSecretFixture = (
  privateKeyHex: string,
  signingAlgorithm = "ed25519",
) =>
  protectFixture(accountSecretMaterialFixture(privateKeyHex, signingAlgorithm));
const createWindowsDpapiMock = () => ({
  protect: vi.fn(async (value: string) => protectFixture(value)),
  unprotect: vi.fn(async (value: string) => unprotectFixture(value)),
});
const receiveKeyIdFixture = (index = 1) => {
  const bytes = Buffer.alloc(18);
  bytes.writeUInt32BE(index, 14);
  return bytes.toString("base64url");
};
const RECEIVE_KEY_ID = receiveKeyIdFixture();
const receiveKeyRecordFixture = (index: number, accountId: string) => ({
  keyId: receiveKeyIdFixture(index),
  accountId,
  ownerTagHex: index.toString(16).padStart(2, "0").repeat(32),
  diversifierHex: (index + 16).toString(16).padStart(2, "0").repeat(32),
  publicKeyBase64Url: Buffer.alloc(32, index).toString("base64url"),
  privateKeyBase64Url: Buffer.alloc(32, index + 32).toString("base64url"),
  createdAtMs: index,
});

describe("SecureVault", () => {
  let tempDir = "";

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "iroha-secure-vault-"));
    vi.clearAllMocks();
    safeStorageMock.isEncryptionAvailable.mockReturnValue(true);
    safeStorageMock.getSelectedStorageBackend.mockReturnValue(
      "gnome_libsecret",
    );
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

  it("does not alias secrets across network-specific account IDs", async () => {
    const privateKeyHex = "aa".repeat(32);
    await writeFile(
      vaultFile(tempDir),
      JSON.stringify({
        version: 1,
        accountSecrets: {
          testuAccount1234567890: encryptFixture(
            accountSecretMaterialFixture(privateKeyHex),
          ),
        },
        receiveKeys: {},
      }),
    );

    const vault = new SecureVault(tempDir);

    await expect(
      vault.getAccountSecret("sorauAccount1234567890"),
    ).resolves.toBeNull();
    await expect(
      vault.getAccountSecretMaterial("testuAccount1234567890"),
    ).resolves.toEqual({
      privateKeyHex,
      signingAlgorithm: "ed25519",
    });
    await expect(
      vault.listAccountSecretFlags([
        "sorauAccount1234567890",
        "testuAccount1234567890",
        "sorauMissingAccount1234567890",
      ]),
    ).resolves.toEqual({
      sorauAccount1234567890: false,
      testuAccount1234567890: true,
      sorauMissingAccount1234567890: false,
    });
  });

  it("requires an exact custom-prefix account key", async () => {
    const privateKeyHex = "cc".repeat(32);
    await writeFile(
      vaultFile(tempDir),
      JSON.stringify({
        version: 1,
        accountSecrets: {
          n42uCustomAccount1234567890: encryptFixture(
            accountSecretMaterialFixture(privateKeyHex),
          ),
        },
        receiveKeys: {},
      }),
    );

    const vault = new SecureVault(tempDir);

    await expect(
      vault.getAccountSecret("sorauCustomAccount1234567890"),
    ).resolves.toBeNull();
    await expect(
      vault.getAccountSecret("n42uCustomAccount1234567890"),
    ).resolves.toBe(privateKeyHex);
  });

  it("stores new secrets under the exact account ID", async () => {
    const privateKeyHex = "bb".repeat(32);
    const vault = new SecureVault(tempDir);

    await vault.storeAccountSecret({
      accountId: "sorauSharedAccount1234567890",
      privateKeyHex,
      signingAlgorithm: "ed25519",
    });

    await expect(
      vault.getAccountSecret("testuSharedAccount1234567890"),
    ).resolves.toBeNull();
    await expect(
      vault.getAccountSecret("sorauSharedAccount1234567890"),
    ).resolves.toBe(privateKeyHex);

    const persisted = JSON.parse(await readFile(vaultFile(tempDir), "utf8"));
    expect(persisted.accountSecrets).toHaveProperty(
      "sorauSharedAccount1234567890",
    );
  });

  it("keeps case-sensitive I105 payloads in separate vault entries", async () => {
    const vault = new SecureVault(tempDir);
    const upperSecret = "ab".repeat(32);
    const lowerSecret = "cd".repeat(32);

    await vault.storeAccountSecret({
      accountId: "testuCaseSensitivePayloadABC",
      privateKeyHex: upperSecret,
      signingAlgorithm: "ed25519",
    });
    await vault.storeAccountSecret({
      accountId: "testucasesensitivepayloadabc",
      privateKeyHex: lowerSecret,
      signingAlgorithm: "ed25519",
    });

    await expect(
      vault.getAccountSecret("testuCaseSensitivePayloadABC"),
    ).resolves.toBe(upperSecret);
    await expect(
      vault.getAccountSecret("testucasesensitivepayloadabc"),
    ).resolves.toBe(lowerSecret);

    const persisted = JSON.parse(await readFile(vaultFile(tempDir), "utf8"));
    expect(Object.keys(persisted.accountSecrets)).toEqual(
      expect.arrayContaining([
        "testuCaseSensitivePayloadABC",
        "testucasesensitivepayloadabc",
      ]),
    );
  });

  it("serializes concurrent writes without losing either secret", async () => {
    const vault = new SecureVault(tempDir);

    await Promise.all([
      vault.storeAccountSecret({
        accountId: "testuConcurrentAccountOne1234567890",
        privateKeyHex: "ab".repeat(32),
        signingAlgorithm: "ed25519",
      }),
      vault.storeAccountSecret({
        accountId: "testuConcurrentAccountTwo1234567890",
        privateKeyHex: "cd".repeat(32),
        signingAlgorithm: "ed25519",
      }),
    ]);

    await expect(
      vault.listAccountSecretFlags([
        "testuConcurrentAccountOne1234567890",
        "testuConcurrentAccountTwo1234567890",
      ]),
    ).resolves.toEqual({
      testuConcurrentAccountOne1234567890: true,
      testuConcurrentAccountTwo1234567890: true,
    });
    const persisted = JSON.parse(await readFile(vaultFile(tempDir), "utf8"));
    expect(Object.keys(persisted.accountSecrets).sort()).toEqual([
      "testuConcurrentAccountOne1234567890",
      "testuConcurrentAccountTwo1234567890",
    ]);
  });

  it("stores the signing algorithm with account secret material", async () => {
    const privateKeyHex = "12".repeat(32);
    const vault = new SecureVault(tempDir);

    await vault.storeAccountSecret({
      accountId: "sorauSecpAccount1234567890",
      privateKeyHex,
      signingAlgorithm: "secp256k1",
    });

    await expect(
      vault.getAccountSecretMaterial("sorauSecpAccount1234567890"),
    ).resolves.toEqual({
      privateKeyHex,
      signingAlgorithm: "secp256k1",
    });
    await expect(
      vault.getAccountSecret("sorauSecpAccount1234567890"),
    ).resolves.toBe(privateKeyHex);
  });

  it("rejects noncanonical signing algorithm casing", async () => {
    const privateKeyHex = "13".repeat(32);
    const vault = new SecureVault(tempDir);

    await expect(
      vault.storeAccountSecret({
        accountId: "sorauUpperAlgoAccount1234567890",
        privateKeyHex,
        signingAlgorithm: "  Secp256K1  ",
      }),
    ).rejects.toThrow("exact supported algorithm identifier");
  });

  it("rejects malformed signing algorithm metadata before encrypting", async () => {
    const vault = new SecureVault(tempDir);

    await expect(
      vault.storeAccountSecret({
        accountId: "sorauBadAlgoAccount1234567890",
        privateKeyHex: "14".repeat(32),
        signingAlgorithm: "ed25519\nsecp256k1",
      }),
    ).rejects.toThrow("exact supported algorithm identifier");
    await expect(
      vault.storeAccountSecret({
        accountId: "sorauObjectAlgoAccount1234567890",
        privateKeyHex: "15".repeat(32),
        signingAlgorithm: { nested: "secp256k1" } as unknown as string,
      }),
    ).rejects.toThrow("signingAlgorithm must be explicitly provided.");
    expect(safeStorageMock.encryptString).not.toHaveBeenCalled();
  });

  it("rejects decrypted account secret wrappers with adversarial algorithms", async () => {
    await writeFile(
      vaultFile(tempDir),
      JSON.stringify({
        version: 1,
        accountSecrets: {
          sorauBadAlgoAccount1234567890: encryptFixture(
            JSON.stringify({
              schema: "iroha-demo-account-secret/v2",
              privateKeyHex: "16".repeat(32),
              signingAlgorithm: { nested: "secp256k1" },
            }),
          ),
        },
        receiveKeys: {},
      }),
    );
    const vault = new SecureVault(tempDir);

    await expect(
      vault.getAccountSecretMaterial("sorauBadAlgoAccount1234567890"),
    ).rejects.toThrow("signingAlgorithm must be explicitly provided.");
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
      signingAlgorithm: "ed25519",
    });

    const persisted = JSON.parse(await readFile(vaultFile(tempDir), "utf8"));
    const encrypted = persisted.accountSecrets.sorauWindowsAccount1234567890;
    expect(encrypted).toBe(
      `win-dpapi:${protectAccountSecretFixture(privateKeyHex)}`,
    );
    expect(safeStorageMock.encryptString).not.toHaveBeenCalled();
    await expect(
      vault.getAccountSecret("sorauWindowsAccount1234567890"),
    ).resolves.toBe(privateKeyHex);
    expect(windowsDpapi.unprotect).toHaveBeenCalledWith(
      protectAccountSecretFixture(privateKeyHex),
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
      signingAlgorithm: "ed25519",
    });

    const persisted = JSON.parse(await readFile(vaultFile(tempDir), "utf8"));
    expect(persisted.accountSecrets.sorauWslAccount1234567890).toBe(
      `win-dpapi:${protectAccountSecretFixture(privateKeyHex)}`,
    );
    expect(safeStorageMock.encryptString).not.toHaveBeenCalled();
    await expect(
      vault.getAccountSecret("sorauWslAccount1234567890"),
    ).resolves.toBe(privateKeyHex);
    expect(windowsDpapi.unprotect).toHaveBeenCalledWith(
      protectAccountSecretFixture(privateKeyHex),
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
      keyId: RECEIVE_KEY_ID,
      accountId: "sorauReceiveAccount1234567890",
      ownerTagHex: "11".repeat(32),
      diversifierHex: "22".repeat(32),
      publicKeyBase64Url: "A".repeat(43),
      privateKeyBase64Url: "E".repeat(43),
      createdAtMs: 42,
    };

    await vault.storeReceiveKey(record);

    const persisted = JSON.parse(await readFile(vaultFile(tempDir), "utf8"));
    expect(
      persisted.receiveKeys[RECEIVE_KEY_ID].encryptedPrivateKeyBase64,
    ).toBe(`win-dpapi:${protectFixture("E".repeat(43))}`);
    await expect(vault.getReceiveKey(RECEIVE_KEY_ID)).resolves.toEqual({
      ...record,
      accountId: record.accountId,
    });
    await expect(
      vault.listReceiveKeysForAccount("sorauReceiveAccount1234567890"),
    ).resolves.toEqual([{ ...record, accountId: record.accountId }]);
    await expect(
      vault.listReceiveKeysForAccount(record.accountId.toLowerCase()),
    ).resolves.toEqual([]);
    await expect(vault.storeReceiveKey(record)).resolves.toBeUndefined();
    await expect(
      vault.storeReceiveKey({
        ...record,
        privateKeyBase64Url: "I".repeat(43),
      }),
    ).rejects.toThrow("already bound to different receive material");
  });

  it("does not report availability on non-Windows when safeStorage is unavailable", async () => {
    safeStorageMock.isEncryptionAvailable.mockReturnValue(false);
    const vault = new SecureVault(tempDir, { platform: "linux", isWsl: false });

    expect(vault.isAvailable()).toBe(false);
    await expect(
      vault.storeAccountSecret({
        accountId: "sorauLinuxAccount1234567890",
        privateKeyHex: "aa".repeat(32),
        signingAlgorithm: "ed25519",
      }),
    ).rejects.toThrow(SECURE_VAULT_UNAVAILABLE_MESSAGE);
    await expect(readFile(vaultFile(tempDir), "utf8")).rejects.toThrow();
  });

  it("rejects Electron's plaintext Linux storage backend", async () => {
    safeStorageMock.getSelectedStorageBackend.mockReturnValue("basic_text");
    const vault = new SecureVault(tempDir, { platform: "linux", isWsl: false });

    expect(vault.isAvailable()).toBe(false);
    await expect(
      vault.storeAccountSecret({
        accountId: "sorauLinuxAccount1234567890",
        privateKeyHex: "aa".repeat(32),
        signingAlgorithm: "ed25519",
      }),
    ).rejects.toThrow(SECURE_VAULT_UNAVAILABLE_MESSAGE);
    expect(safeStorageMock.encryptString).not.toHaveBeenCalled();
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
      signingAlgorithm: "ed25519",
    });

    const persisted = JSON.parse(await readFile(vaultFile(tempDir), "utf8"));
    expect(persisted.accountSecrets.sorauProbeAccount1234567890).toBe(
      `win-dpapi:${protectAccountSecretFixture(privateKeyHex)}`,
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
        signingAlgorithm: "ed25519",
      }),
    ).rejects.toThrow("Secure key encryption failed.");
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
        signingAlgorithm: "ed25519",
      }),
    ).rejects.toThrow("Secure key encryption failed.");
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
        signingAlgorithm: "ed25519",
      }),
    ).rejects.toThrow(
      "privateKeyHex must be canonical even-length lowercase hex.",
    );
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
        signingAlgorithm: "ed25519",
      }),
    ).rejects.toThrow(
      "privateKeyHex must be canonical even-length lowercase hex.",
    );
    expect(safeStorageMock.encryptString).not.toHaveBeenCalled();
  });

  it("refuses Windows DPAPI envelopes on non-Windows platforms", async () => {
    await writeFile(
      vaultFile(tempDir),
      JSON.stringify({
        version: 1,
        accountSecrets: {
          sorauForeignAccount1234567890: `win-dpapi:${protectAccountSecretFixture(
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

  it("does not route safeStorage envelopes through Windows DPAPI", async () => {
    const privateKeyHex = "af".repeat(32);
    safeStorageMock.isEncryptionAvailable.mockReturnValue(false);
    const windowsDpapi = createWindowsDpapiMock();
    await writeFile(
      vaultFile(tempDir),
      JSON.stringify({
        version: 1,
        accountSecrets: {
          sorauLegacyAccount1234567890: encryptFixture(
            accountSecretMaterialFixture(privateKeyHex),
          ),
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
          sorauDeniedAccount1234567890: "win-dpapi:dW5yZWFkYWJsZQ==",
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
    ).rejects.toThrow("Secure key decryption failed.");
  });

  it("rejects decrypted payloads outside the exact account-secret schema", async () => {
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
          sorauInvalidPayload1234567890: "win-dpapi:invalid",
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
    ).rejects.toThrow();
  });

  it("fails closed for malformed vault files", async () => {
    await writeFile(vaultFile(tempDir), "{ not valid json");
    const vault = new SecureVault(tempDir);

    await expect(
      vault.listAccountSecretFlags(["sorauCorruptAccount1234567890"]),
    ).rejects.toThrow();
    await expect(
      vault.getAccountSecret("sorauCorruptAccount1234567890"),
    ).rejects.toThrow();
  });

  it("fails closed for non-object vault maps", async () => {
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
    ).rejects.toThrow("Secure vault accountSecrets must be an object.");
    await expect(
      vault.listReceiveKeysForAccount("sorauArrayAccount1234567890"),
    ).rejects.toThrow("Secure vault accountSecrets must be an object.");
  });

  it("rejects supplied account secrets without exact current key metadata", async () => {
    const vault = new SecureVault(tempDir);
    const missingAlgorithm = {
      accountId: "sorauMissingAlgorithm1234567890",
      privateKeyHex: "ab".repeat(32),
    } as unknown as Parameters<SecureVault["storeAccountSecret"]>[0];

    await expect(vault.storeAccountSecret(missingAlgorithm)).rejects.toThrow(
      "Secure vault account-secret input has an unsupported shape.",
    );
    await expect(
      vault.storeAccountSecret({
        accountId: "sorauUnknownFieldAccount1234567890",
        privateKeyHex: "ab".repeat(32),
        signingAlgorithm: "ed25519",
        compatibility: true,
      } as never),
    ).rejects.toThrow(
      "Secure vault account-secret input has an unsupported shape.",
    );
    await expect(
      vault.storeAccountSecret({
        accountId: "sorauUppercaseSecret1234567890",
        privateKeyHex: "AB".repeat(32),
        signingAlgorithm: "ed25519",
      }),
    ).rejects.toThrow("canonical even-length lowercase hex");
    await expect(
      vault.storeAccountSecret({
        accountId: "sorauAlgorithmAlias1234567890",
        privateKeyHex: "ab".repeat(32),
        signingAlgorithm: "Ed25519",
      }),
    ).rejects.toThrow("exact supported algorithm identifier");
    expect(safeStorageMock.encryptString).not.toHaveBeenCalled();
  });

  it("rejects receive-key DTO drift before encryption", async () => {
    const vault = new SecureVault(tempDir);
    await expect(
      vault.storeReceiveKey({
        keyId: RECEIVE_KEY_ID,
        accountId: "sorauReceiveAccount1234567890",
        ownerTagHex: "11".repeat(32),
        diversifierHex: "22".repeat(32),
        publicKeyBase64Url: "A".repeat(43),
        privateKeyBase64Url: "E".repeat(43),
        createdAtMs: 42,
        legacy: true,
      } as never),
    ).rejects.toThrow("Secure vault receive-key batch[0]");
    expect(safeStorageMock.encryptString).not.toHaveBeenCalled();
  });

  it("bounds account-secret entries before loading a vault", async () => {
    const accountSecrets = Object.fromEntries(
      Array.from({ length: 257 }, (_, index) => [
        `testuBoundedAccount${String(index).padStart(4, "0")}`,
        encryptFixture(accountSecretMaterialFixture("ab".repeat(32))),
      ]),
    );
    await writeFile(
      vaultFile(tempDir),
      JSON.stringify({ version: 1, accountSecrets, receiveKeys: {} }),
    );
    const vault = new SecureVault(tempDir);

    await expect(vault.listAccountSecretFlags([])).rejects.toThrow(
      "Secure vault contains too many account secrets.",
    );
  });

  it("bounds receive-key retention per account", async () => {
    const accountId = "testuBoundedReceiveAccount1234567890";
    const receiveKeys = Object.fromEntries(
      Array.from({ length: 1_025 }, (_, index) => {
        const keyId = receiveKeyIdFixture(index);
        return [
          keyId,
          {
            keyId,
            accountId,
            ownerTagHex: "11".repeat(32),
            diversifierHex: "22".repeat(32),
            encryptedPublicKeyBase64: encryptFixture("A".repeat(43)),
            encryptedPrivateKeyBase64: encryptFixture("E".repeat(43)),
            createdAtMs: index,
          },
        ];
      }),
    );
    await writeFile(
      vaultFile(tempDir),
      JSON.stringify({ version: 1, accountSecrets: {}, receiveKeys }),
    );
    const vault = new SecureVault(tempDir);

    await expect(vault.listReceiveKeysForAccount(accountId)).rejects.toThrow(
      "contains too many receive keys.",
    );
  });

  it("rejects receive-key ids that look like path traversal", async () => {
    const vault = new SecureVault(tempDir);

    await expect(
      vault.storeReceiveKey({
        keyId: "../receive_key_123",
        accountId: "sorauReceiveAccount1234567890",
        ownerTagHex: "11".repeat(32),
        diversifierHex: "22".repeat(32),
        publicKeyBase64Url: "A".repeat(43),
        privateKeyBase64Url: "E".repeat(43),
        createdAtMs: 42,
      }),
    ).rejects.toThrow("receiveKeyId must be canonical base64url");
    expect(safeStorageMock.encryptString).not.toHaveBeenCalled();
  });

  it("rejects receive-key owner tags with the wrong byte length", async () => {
    const vault = new SecureVault(tempDir);

    await expect(
      vault.storeReceiveKey({
        keyId: RECEIVE_KEY_ID,
        accountId: "sorauReceiveAccount1234567890",
        ownerTagHex: "11".repeat(31),
        diversifierHex: "22".repeat(32),
        publicKeyBase64Url: "A".repeat(43),
        privateKeyBase64Url: "E".repeat(43),
        createdAtMs: 42,
      }),
    ).rejects.toThrow("ownerTagHex must be a 32-byte hex string.");
    expect(safeStorageMock.encryptString).not.toHaveBeenCalled();
  });

  it("rejects receive keys with non-base64url public material", async () => {
    const vault = new SecureVault(tempDir);

    await expect(
      vault.storeReceiveKey({
        keyId: RECEIVE_KEY_ID,
        accountId: "sorauReceiveAccount1234567890",
        ownerTagHex: "11".repeat(32),
        diversifierHex: "22".repeat(32),
        publicKeyBase64Url: "public key!",
        privateKeyBase64Url: "E".repeat(43),
        createdAtMs: 42,
      }),
    ).rejects.toThrow(
      "publicKeyBase64Url must be canonical base64url for 32 bytes.",
    );
    expect(safeStorageMock.encryptString).not.toHaveBeenCalled();
  });

  it("rejects corrupted encrypted receive-key private material on read", async () => {
    await writeFile(
      vaultFile(tempDir),
      JSON.stringify({
        version: 1,
        accountSecrets: {},
        receiveKeys: {
          [RECEIVE_KEY_ID]: {
            keyId: RECEIVE_KEY_ID,
            accountId: "soraureceiveaccount1234567890",
            ownerTagHex: "11".repeat(32),
            diversifierHex: "22".repeat(32),
            encryptedPublicKeyBase64: encryptFixture("A".repeat(43)),
            encryptedPrivateKeyBase64: encryptFixture("private key!"),
            createdAtMs: 42,
          },
        },
      }),
    );
    const vault = new SecureVault(tempDir);

    await expect(vault.getReceiveKey(RECEIVE_KEY_ID)).rejects.toThrow(
      "privateKeyBase64Url must be canonical base64url for 32 bytes.",
    );
  });

  it("stores a receive-key batch with one atomic vault commit", async () => {
    const accountId = "testuAtomicReceiveAccount1234567890";
    const first = receiveKeyRecordFixture(21, accountId);
    const second = receiveKeyRecordFixture(22, accountId);
    const vault = new SecureVault(tempDir);

    await expect(
      vault.storeReceiveKeys([first, second]),
    ).resolves.toBeUndefined();
    await expect(vault.listReceiveKeysForAccount(accountId)).resolves.toEqual([
      first,
      second,
    ]);
    const persisted = JSON.parse(await readFile(vaultFile(tempDir), "utf8"));
    expect(Object.keys(persisted.receiveKeys).sort()).toEqual(
      [first.keyId, second.keyId].sort(),
    );
  });

  it("preflights every receive-key batch record before encryption", async () => {
    const accountId = "testuAtomicPreflightAccount1234567890";
    const first = receiveKeyRecordFixture(23, accountId);
    const invalid = {
      ...receiveKeyRecordFixture(24, accountId),
      ownerTagHex: 7,
    } as never;
    const vault = new SecureVault(tempDir);

    await expect(vault.storeReceiveKeys([first, invalid])).rejects.toThrow();
    expect(safeStorageMock.encryptString).not.toHaveBeenCalled();
    await expect(readFile(vaultFile(tempDir), "utf8")).rejects.toThrow();
  });

  it("rejects oversized and exotic receive-key batches before encryption", async () => {
    const vault = new SecureVault(tempDir);
    const oversized = new Array(
      SECURE_VAULT_MAX_RECEIVE_KEY_BATCH + 1,
    ) as ReturnType<typeof receiveKeyRecordFixture>[];
    await expect(vault.storeReceiveKeys(oversized)).rejects.toThrow(/at most/u);

    const sparse = new Array(1) as ReturnType<typeof receiveKeyRecordFixture>[];
    await expect(vault.storeReceiveKeys(sparse)).rejects.toThrow(/dense/u);

    const expando = [
      receiveKeyRecordFixture(31, "testuAtomicExpandoAccount1234567890"),
    ] as Array<ReturnType<typeof receiveKeyRecordFixture>> & { extra?: string };
    expando.extra = "unsupported";
    await expect(vault.storeReceiveKeys(expando)).rejects.toThrow(
      /unsupported array fields/u,
    );

    const symbolExpando = [
      receiveKeyRecordFixture(32, "testuAtomicSymbolAccount1234567890"),
    ];
    Object.defineProperty(symbolExpando, Symbol("unsupported"), {
      value: true,
      enumerable: true,
    });
    await expect(vault.storeReceiveKeys(symbolExpando)).rejects.toThrow(
      /unsupported array fields/u,
    );

    let accessorRead = false;
    const accessor = new Array(1) as ReturnType<
      typeof receiveKeyRecordFixture
    >[];
    Object.defineProperty(accessor, "0", {
      enumerable: true,
      get() {
        accessorRead = true;
        return receiveKeyRecordFixture(
          33,
          "testuAtomicAccessorAccount1234567890",
        );
      },
    });
    await expect(vault.storeReceiveKeys(accessor)).rejects.toThrow(/dense/u);
    expect(accessorRead).toBe(false);
    expect(safeStorageMock.encryptString).not.toHaveBeenCalled();
  });

  it("does not persist a prefix when later receive-key encryption fails", async () => {
    const accountId = "testuAtomicEncryptionAccount1234567890";
    const first = receiveKeyRecordFixture(25, accountId);
    const second = receiveKeyRecordFixture(26, accountId);
    let encryptionCalls = 0;
    safeStorageMock.encryptString.mockImplementation((value: string) => {
      encryptionCalls += 1;
      if (encryptionCalls === 3) {
        throw new Error(`must not leak ${value}`);
      }
      return Buffer.from(value, "utf8");
    });
    const vault = new SecureVault(tempDir);

    await expect(vault.storeReceiveKeys([first, second])).rejects.toThrow(
      "Secure key encryption failed.",
    );
    await expect(readFile(vaultFile(tempDir), "utf8")).rejects.toThrow();
  });

  it("does not persist new keys when any batch ID conflicts", async () => {
    const accountId = "testuAtomicConflictAccount1234567890";
    const existing = receiveKeyRecordFixture(27, accountId);
    const added = receiveKeyRecordFixture(28, accountId);
    const vault = new SecureVault(tempDir);
    await vault.storeReceiveKey(existing);

    await expect(
      vault.storeReceiveKeys([
        added,
        {
          ...existing,
          privateKeyBase64Url: Buffer.alloc(32, 99).toString("base64url"),
        },
      ]),
    ).rejects.toThrow("already bound to different receive material");
    const persisted = JSON.parse(await readFile(vaultFile(tempDir), "utf8"));
    expect(Object.keys(persisted.receiveKeys)).toEqual([existing.keyId]);
  });

  it("rejects duplicate batch IDs and noncanonical backend ciphertext", async () => {
    const accountId = "testuAtomicDuplicateAccount1234567890";
    const record = receiveKeyRecordFixture(29, accountId);
    const vault = new SecureVault(tempDir);
    await expect(vault.storeReceiveKeys([record, record])).rejects.toThrow(
      "must not contain duplicate key IDs",
    );
    expect(safeStorageMock.encryptString).not.toHaveBeenCalled();

    safeStorageMock.isEncryptionAvailable.mockReturnValue(false);
    const malformedDpapiVault = new SecureVault(tempDir, {
      platform: "win32",
      windowsDpapi: {
        protect: vi.fn(async () => "AB=="),
        unprotect: vi.fn(async () => ""),
      },
    });
    await expect(
      malformedDpapiVault.storeAccountSecret({
        accountId: "testuMalformedCiphertext1234567890",
        privateKeyHex: "ab".repeat(32),
        signingAlgorithm: "ed25519",
      }),
    ).rejects.toThrow("Secure key encryption failed.");
    await expect(readFile(vaultFile(tempDir), "utf8")).rejects.toThrow();
  });

  it("rejects persisted receive-key field coercions", async () => {
    const record = receiveKeyRecordFixture(
      30,
      "testuPersistedCoercionAccount1234567890",
    );
    await writeFile(
      vaultFile(tempDir),
      JSON.stringify({
        version: 1,
        accountSecrets: {},
        receiveKeys: {
          [record.keyId]: {
            keyId: record.keyId,
            accountId: 123,
            ownerTagHex: record.ownerTagHex,
            diversifierHex: record.diversifierHex,
            encryptedPublicKeyBase64: encryptFixture(record.publicKeyBase64Url),
            encryptedPrivateKeyBase64: encryptFixture(
              record.privateKeyBase64Url,
            ),
            createdAtMs: record.createdAtMs,
          },
        },
      }),
    );
    const vault = new SecureVault(tempDir);

    await expect(vault.getReceiveKey(record.keyId)).rejects.toThrow(
      "invalid account ID",
    );
  });
});

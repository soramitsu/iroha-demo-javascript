import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SecureVault } from "../electron/secureVault";

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

describe("SecureVault", () => {
  let tempDir = "";

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "iroha-secure-vault-"));
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
});

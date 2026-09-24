import { describe, expect, it } from "vitest";
import {
  CONFIDENTIAL_WALLET_BACKUP_SCHEMA_V2,
  MAX_WALLET_BACKUP_JSON_BYTES,
  WALLET_BACKUP_SCHEMA,
  buildWalletBackupPayload,
  parseWalletBackupPayload,
} from "@/utils/walletBackup";

const VALID_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const STATE_BOX = {
  kdf: "HKDF-SHA256" as const,
  cipher: "AES-256-GCM" as const,
  saltBase64Url: "A".repeat(43),
  ivBase64Url: "B".repeat(16),
  ciphertextBase64Url: "C".repeat(32),
  authTagBase64Url: "Q".repeat(22),
};
const CONFIDENTIAL_WALLET = {
  schema: CONFIDENTIAL_WALLET_BACKUP_SCHEMA_V2,
  chainId: "chain",
  accountId: "testuAlice",
  scanWatermarkBlock: null,
  stateBox: STATE_BOX,
} as const;

describe("wallet backup helpers", () => {
  it("builds a backup payload with local metadata", () => {
    expect(
      buildWalletBackupPayload({
        mnemonic: VALID_MNEMONIC,
        wordCount: 12,
        createdAt: "2026-03-29T00:00:00.000Z",
        target: "manual",
        displayName: "  Alice  ",
        domain: "  default  ",
        confidentialWallet: CONFIDENTIAL_WALLET,
      }),
    ).toEqual({
      schema: WALLET_BACKUP_SCHEMA,
      mnemonic: VALID_MNEMONIC,
      wordCount: 12,
      signingAlgorithm: "ed25519",
      createdAt: "2026-03-29T00:00:00.000Z",
      target: "manual",
      displayName: "Alice",
      domain: "default",
      confidentialWallet: CONFIDENTIAL_WALLET,
    });
  });

  it("preserves a selected non-default signing algorithm in backup metadata", () => {
    const payload = buildWalletBackupPayload({
      mnemonic: VALID_MNEMONIC,
      wordCount: 12,
      createdAt: "2026-03-29T00:00:00.000Z",
      target: "manual",
      signingAlgorithm: "secp256k1",
      confidentialWallet: CONFIDENTIAL_WALLET,
    });

    expect(payload.signingAlgorithm).toBe("secp256k1");
    expect(parseWalletBackupPayload(JSON.stringify(payload))).toMatchObject({
      signingAlgorithm: "secp256k1",
    });
  });

  it("round-trips encrypted confidential wallet backup metadata", () => {
    const payload = buildWalletBackupPayload({
      mnemonic: VALID_MNEMONIC,
      wordCount: 12,
      createdAt: "2026-03-29T00:00:00.000Z",
      target: "manual",
      confidentialWallet: {
        schema: CONFIDENTIAL_WALLET_BACKUP_SCHEMA_V2,
        chainId: "chain",
        accountId: "testuAlice",
        scanWatermarkBlock: 42,
        stateBox: STATE_BOX,
      },
    });

    expect(parseWalletBackupPayload(JSON.stringify(payload))).toMatchObject({
      mnemonic: VALID_MNEMONIC,
      wordCount: 12,
      confidentialWallet: {
        schema: CONFIDENTIAL_WALLET_BACKUP_SCHEMA_V2,
        chainId: "chain",
        accountId: "testuAlice",
        scanWatermarkBlock: 42,
        stateBox: STATE_BOX,
      },
    });
  });

  it("parses the exact current backup without optional metadata", () => {
    const payload = buildWalletBackupPayload({
      mnemonic: VALID_MNEMONIC,
      wordCount: 12,
      createdAt: "2026-03-29T00:00:00.000Z",
      target: "manual",
      confidentialWallet: CONFIDENTIAL_WALLET,
    });
    expect(parseWalletBackupPayload(JSON.stringify(payload))).toEqual({
      schema: WALLET_BACKUP_SCHEMA,
      mnemonic: VALID_MNEMONIC,
      wordCount: 12,
      signingAlgorithm: "ed25519",
      createdAt: "2026-03-29T00:00:00.000Z",
      target: "manual",
      confidentialWallet: CONFIDENTIAL_WALLET,
    });
  });

  it("rejects noncanonical field types and encodings", () => {
    const exact = buildWalletBackupPayload({
      mnemonic: VALID_MNEMONIC,
      wordCount: 12,
      createdAt: "2026-03-29T00:00:00.000Z",
      target: "manual",
      confidentialWallet: CONFIDENTIAL_WALLET,
    });

    expect(() =>
      parseWalletBackupPayload(
        JSON.stringify({
          ...exact,
          wordCount: "12",
        }),
      ),
    ).toThrow("Backup word count does not match");
    expect(() =>
      parseWalletBackupPayload(
        JSON.stringify({
          ...exact,
          mnemonic: ` ${VALID_MNEMONIC}`,
        }),
      ),
    ).toThrow("Backup recovery phrase is not canonical");
    expect(() =>
      parseWalletBackupPayload(
        JSON.stringify({
          ...exact,
          displayName: "Alice\u0000",
        }),
      ),
    ).toThrow("Backup display name is invalid");
    expect(() =>
      parseWalletBackupPayload(
        JSON.stringify({
          ...exact,
          confidentialWallet: {
            schema: CONFIDENTIAL_WALLET_BACKUP_SCHEMA_V2,
            chainId: "chain",
            accountId: "testuAlice",
            scanWatermarkBlock: 42,
            stateBox: {
              ...STATE_BOX,
              authTagBase64Url: "D".repeat(22),
            },
          },
        }),
      ),
    ).toThrow("Confidential wallet backup state box is invalid");
  });

  it("rejects legacy and malformed backup metadata", () => {
    const exact = buildWalletBackupPayload({
      mnemonic: VALID_MNEMONIC,
      wordCount: 12,
      createdAt: "2026-03-29T00:00:00.000Z",
      target: "manual",
      confidentialWallet: CONFIDENTIAL_WALLET,
    });

    expect(() =>
      parseWalletBackupPayload(
        JSON.stringify({
          mnemonic: VALID_MNEMONIC,
          wordCount: 12,
          createdAt: "2026-03-29T00:00:00.000Z",
          target: "manual",
        }),
      ),
    ).toThrow("Invalid backup file schema");

    for (const signingAlgorithm of [
      { nested: "secp256k1" },
      "ed25519\nsecp256k1",
      "x".repeat(129),
    ]) {
      expect(() =>
        parseWalletBackupPayload(
          JSON.stringify({
            ...exact,
            signingAlgorithm,
          }),
        ),
      ).toThrow("Backup signing algorithm is invalid");
    }

    expect(() =>
      parseWalletBackupPayload(
        JSON.stringify({
          ...exact,
          confidentialWallet: {
            schema: "iroha-demo-confidential-wallet-backup/v1",
            chainId: "chain",
            accountId: "testuAlice",
          },
        }),
      ),
    ).toThrow("Confidential wallet backup metadata is invalid");
  });

  it("rejects invalid backup payloads", () => {
    expect(() => parseWalletBackupPayload("nope")).toThrow(
      "Invalid backup file.",
    );
    expect(() =>
      parseWalletBackupPayload(JSON.stringify({ target: "manual" })),
    ).toThrow("Invalid backup file schema.");
  });

  it("requires the current confidential wallet bundle", () => {
    const incomplete = {
      schema: WALLET_BACKUP_SCHEMA,
      mnemonic: VALID_MNEMONIC,
      wordCount: 12,
      signingAlgorithm: "ed25519",
      createdAt: "2026-03-29T00:00:00.000Z",
      target: "manual",
    };

    expect(() => parseWalletBackupPayload(JSON.stringify(incomplete))).toThrow(
      "Invalid backup file schema.",
    );
  });

  it("rejects duplicate keys, unknown fields, and oversized JSON", () => {
    const exact = buildWalletBackupPayload({
      mnemonic: VALID_MNEMONIC,
      wordCount: 12,
      createdAt: "2026-03-29T00:00:00.000Z",
      target: "manual",
      confidentialWallet: CONFIDENTIAL_WALLET,
    });
    const raw = JSON.stringify(exact);

    expect(() =>
      parseWalletBackupPayload(
        raw.replace(
          `"schema":"${WALLET_BACKUP_SCHEMA}"`,
          `"schema":"${WALLET_BACKUP_SCHEMA}","schema":"${WALLET_BACKUP_SCHEMA}"`,
        ),
      ),
    ).toThrow("Invalid backup file.");
    expect(() =>
      parseWalletBackupPayload(
        raw.replace(
          '"kdf":"HKDF-SHA256"',
          '"kdf":"HKDF-SHA256","kdf":"HKDF-SHA256"',
        ),
      ),
    ).toThrow("Invalid backup file.");
    expect(() =>
      parseWalletBackupPayload(
        JSON.stringify({
          ...exact,
          legacyNotes: [],
        }),
      ),
    ).toThrow("Invalid backup file schema.");
    expect(() =>
      parseWalletBackupPayload(" ".repeat(MAX_WALLET_BACKUP_JSON_BYTES + 1)),
    ).toThrow("Invalid backup file.");
  });
});

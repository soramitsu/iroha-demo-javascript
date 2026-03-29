import { describe, expect, it } from "vitest";
import {
  buildWalletBackupPayload,
  parseWalletBackupPayload,
} from "@/utils/walletBackup";

const VALID_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

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
      }),
    ).toEqual({
      mnemonic: VALID_MNEMONIC,
      wordCount: 12,
      createdAt: "2026-03-29T00:00:00.000Z",
      target: "manual",
      displayName: "Alice",
      domain: "default",
    });
  });

  it("parses legacy backup files without local metadata", () => {
    expect(
      parseWalletBackupPayload(
        JSON.stringify({
          mnemonic: VALID_MNEMONIC,
          wordCount: 12,
          createdAt: "2026-03-29T00:00:00.000Z",
          target: "manual",
        }),
      ),
    ).toEqual({
      mnemonic: VALID_MNEMONIC,
      wordCount: 12,
      displayName: "",
      domain: "",
    });
  });

  it("rejects invalid backup payloads", () => {
    expect(() => parseWalletBackupPayload("nope")).toThrow(
      "Invalid backup file.",
    );
    expect(() =>
      parseWalletBackupPayload(JSON.stringify({ target: "manual" })),
    ).toThrow("Backup file is missing a recovery phrase.");
  });
});

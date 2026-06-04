import { createHash } from "crypto";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
  deriveTronTestSignerAddressFromPrivateKey,
  getSccpNileTestTronSignerStatus,
  SCCP_TRON_NILE_TEST_SIGNER_ENV,
  SCCP_TRON_NILE_TEST_SIGNER_SECRET_FILE_ENV,
  signSccpNileTestTronTransaction,
} from "../electron/tronTestSigner";

const PRIVATE_KEY_HEX =
  "0000000000000000000000000000000000000000000000000000000000000001";
const SECOND_PRIVATE_KEY_HEX =
  "0000000000000000000000000000000000000000000000000000000000000002";

const privateKeyBytes = (hex: string): Uint8Array =>
  Uint8Array.from(Buffer.from(hex, "hex"));

const signerAddress = deriveTronTestSignerAddressFromPrivateKey(
  privateKeyBytes(PRIVATE_KEY_HEX),
);
const secondAddress = deriveTronTestSignerAddressFromPrivateKey(
  privateKeyBytes(SECOND_PRIVATE_KEY_HEX),
);

const txIdFromRawDataHex = (rawDataHex: string): string =>
  createHash("sha256").update(Buffer.from(rawDataHex, "hex")).digest("hex");

const unsignedTransaction = (ownerAddress = signerAddress.base58) => {
  const rawDataHex = "01020304";
  return {
    txID: txIdFromRawDataHex(rawDataHex),
    raw_data_hex: rawDataHex,
    raw_data: {
      contract: [
        {
          parameter: {
            value: {
              owner_address: ownerAddress,
            },
          },
          type: "TriggerSmartContract",
        },
      ],
    },
  };
};

const tempDirs: string[] = [];

const writeSecret = async (
  override: Record<string, unknown> = {},
): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), "tron-test-signer-"));
  tempDirs.push(dir);
  const path = join(dir, "secret.json");
  await writeFile(
    path,
    JSON.stringify({
      schema: "iroha-sccp-tron-taira-xor-deployer/v1",
      tron_network: "nile",
      address_base58: signerAddress.base58,
      private_key_hex: PRIVATE_KEY_HEX,
      ...override,
    }),
    "utf8",
  );
  return path;
};

const enabledEnv = (secretFile: string): NodeJS.ProcessEnv =>
  ({
    [SCCP_TRON_NILE_TEST_SIGNER_ENV]: "1",
    [SCCP_TRON_NILE_TEST_SIGNER_SECRET_FILE_ENV]: secretFile,
  }) as NodeJS.ProcessEnv;

describe("TRON Nile test signer", () => {
  afterEach(async () => {
    await Promise.all(
      tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
    );
  });

  it("stays disabled unless explicitly enabled", async () => {
    const status = await getSccpNileTestTronSignerStatus({});

    expect(status).toEqual({
      enabled: false,
      network: "nile",
      address: "",
    });
  });

  it("reports only non-secret signer status when the Nile secret is valid", async () => {
    const secretFile = await writeSecret();
    const status = await getSccpNileTestTronSignerStatus(
      enabledEnv(secretFile),
    );

    expect(status).toEqual({
      enabled: true,
      network: "nile",
      address: signerAddress.base58,
    });
    expect(JSON.stringify(status)).not.toContain(PRIVATE_KEY_HEX);
  });

  it("signs an unsigned transaction for the configured owner only", async () => {
    const secretFile = await writeSecret();
    const transaction = unsignedTransaction();
    const signed = await signSccpNileTestTronTransaction(
      {
        transaction,
        ownerAddress: signerAddress.base58,
      },
      enabledEnv(secretFile),
    );

    expect(signed).toMatchObject({
      txID: transaction.txID,
      raw_data_hex: transaction.raw_data_hex,
      signature: [expect.stringMatching(/^[0-9a-f]{130}$/u)],
    });
    expect(transaction).not.toHaveProperty("signature");
    expect(JSON.stringify(signed)).not.toContain(PRIVATE_KEY_HEX);

    await expect(
      signSccpNileTestTronTransaction(
        {
          transaction: unsignedTransaction(secondAddress.base58),
          ownerAddress: secondAddress.base58,
        },
        enabledEnv(secretFile),
      ),
    ).rejects.toThrow(/owner does not match/);
  });

  it("rejects non-Nile secrets and pre-signed transaction payloads", async () => {
    const mainnetSecret = await writeSecret({ tron_network: "mainnet" });
    await expect(
      signSccpNileTestTronTransaction(
        { transaction: unsignedTransaction() },
        enabledEnv(mainnetSecret),
      ),
    ).rejects.toThrow(/target nile/);

    const secretFile = await writeSecret();
    await expect(
      signSccpNileTestTronTransaction(
        {
          transaction: {
            ...unsignedTransaction(),
            signature: ["11".repeat(65)],
          },
        },
        enabledEnv(secretFile),
      ),
    ).rejects.toThrow(/must not already contain signatures/);
  });
});

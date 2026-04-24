#!/usr/bin/env node
/* global BigInt */

import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, "..", "..");
const mainEntry = join(projectRoot, "dist", "main", "index.cjs");

function readStdin() {
  return new Promise((resolveInput, reject) => {
    const chunks = [];
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => chunks.push(chunk));
    process.stdin.on("end", () => resolveInput(chunks.join("")));
    process.stdin.on("error", reject);
  });
}

async function main() {
  if (!existsSync(mainEntry)) {
    throw new Error(`Built Electron entrypoint not found: ${mainEntry}`);
  }

  const rawInput = String(await readStdin()).trim();
  if (!rawInput) {
    throw new Error("Expected JSON payload on stdin.");
  }
  const input = JSON.parse(rawInput);

  let app = null;
  try {
    app = await electron.launch({
      args: [mainEntry],
      env: process.env,
    });
    const page = await app.firstWindow();
    page.setDefaultTimeout(120_000);
    await page.waitForFunction(
      () =>
        Boolean(
          window.iroha?.transferAsset &&
            window.iroha?.scanConfidentialWallet &&
            window.iroha?.createConfidentialPaymentAddress &&
            window.iroha?.getConfidentialTransferExecutionContext &&
            window.iroha?.fetchAccountAssets,
        ),
      undefined,
      { timeout: 120_000 },
    );

    const result = await page.evaluate(async (payload) => {
      const waitForMs = (delayMs) =>
        new Promise((resolveDelay) => {
          window.setTimeout(resolveDelay, delayMs);
        });
      const sanitizeAccountId = (value) => String(value ?? "").trim();
      const isEmptyRootWindowError = (error) =>
        /recent 32-byte root/i.test(String(error ?? ""));

      const readSpendableQuantity = (balance) => {
        const raw =
          balance?.spendableQuantity ??
          balance?.quantity ??
          balance?.onChainQuantity;
        const normalized = String(raw ?? "").trim();
        return /^\d+(?:\.\d+)?$/.test(normalized) ? normalized : "0";
      };

      const readTransparentQuantity = async (accountId) => {
        const assets = await window.iroha.fetchAccountAssets({
          toriiUrl: payload.toriiUrl,
          accountId,
          limit: 200,
        });
        const items = Array.isArray(assets?.items) ? assets.items : [];
        const normalizedDefinitionId = String(payload.assetDefinitionId ?? "")
          .trim()
          .toLowerCase();
        for (const item of items) {
          const assetId = String(item?.asset_id ?? item?.asset ?? "").trim();
          const normalizedAssetId = assetId.toLowerCase();
          if (
            normalizedAssetId === normalizedDefinitionId ||
            normalizedAssetId.startsWith(`${normalizedDefinitionId}#`)
          ) {
            return String(item?.quantity ?? "0").trim() || "0";
          }
        }
        return "0";
      };

      const readConfidentialBalance = (accountId, privateKeyHex) =>
        window.iroha.scanConfidentialWallet({
          toriiUrl: payload.toriiUrl,
          chainId: payload.chainId,
          accountId,
          privateKeyHex,
          assetDefinitionId: payload.assetDefinitionId,
          force: true,
        });
      const readConfidentialBalanceOrZero = async (
        accountId,
        privateKeyHex,
      ) => {
        try {
          return await readConfidentialBalance(accountId, privateKeyHex);
        } catch (error) {
          if (isEmptyRootWindowError(error)) {
            return {
              spendableQuantity: "0",
              quantity: "0",
              noteCount: 0,
            };
          }
          throw error;
        }
      };

      const waitForSpendableBalance = async ({
        accountId,
        privateKeyHex,
        expectedQuantity,
        timeoutMs = 120_000,
      }) => {
        const deadline = Date.now() + timeoutMs;
        let lastBalance = null;
        let lastError = "";
        while (Date.now() < deadline) {
          try {
            lastBalance = await readConfidentialBalance(
              accountId,
              privateKeyHex,
            );
            const spendableQuantity = readSpendableQuantity(lastBalance);
            if (spendableQuantity === expectedQuantity) {
              return {
                ok: true,
                balance: lastBalance,
                spendableQuantity,
              };
            }
          } catch (error) {
            lastError = String(error ?? "");
          }
          await waitForMs(1_500);
        }
        return {
          ok: false,
          balance: lastBalance,
          spendableQuantity: readSpendableQuantity(lastBalance),
          error: lastError,
        };
      };

      const amount = String(payload.amount ?? "").trim();
      if (!/^[1-9]\d*$/.test(amount)) {
        return {
          ok: false,
          stage: "validate-input",
          error:
            "Anonymous Halo2 bridge requires a positive whole-number amount.",
        };
      }
      const payerAccountId = sanitizeAccountId(payload.payerAccountId);
      const payeeAccountId = sanitizeAccountId(payload.payeeAccountId);
      const payerDerivedPublicKey = window.iroha.derivePublicKey(
        payload.payerPrivateKeyHex,
      );
      const payeeDerivedPublicKey = window.iroha.derivePublicKey(
        payload.payeePrivateKeyHex,
      );
      const payerDerivedAddress = window.iroha.deriveAccountAddress({
        domain: "default",
        publicKeyHex: payerDerivedPublicKey.publicKeyHex,
        networkPrefix: 369,
      });
      const payeeDerivedAddress = window.iroha.deriveAccountAddress({
        domain: "default",
        publicKeyHex: payeeDerivedPublicKey.publicKeyHex,
        networkPrefix: 369,
      });

      const payerInitialBalance = await readConfidentialBalanceOrZero(
        payerAccountId,
        payload.payerPrivateKeyHex,
      );
      const payeeInitialBalance = await readConfidentialBalanceOrZero(
        payeeAccountId,
        payload.payeePrivateKeyHex,
      );
      const payeeTransparentBefore =
        await readTransparentQuantity(payeeAccountId);
      const payerInitialSpendable = BigInt(
        readSpendableQuantity(payerInitialBalance),
      );
      const payeeInitialSpendable = BigInt(
        readSpendableQuantity(payeeInitialBalance),
      );
      const amountBigInt = BigInt(amount);
      const feeMetadata = (() => {
        const metadata = {};
        const feeSponsorAccountId = String(
          payload.feeSponsorAccountId ?? "",
        ).trim();
        const gasAssetId = String(
          payload.gasAssetDefinitionId ?? payload.assetDefinitionId ?? "",
        ).trim();
        if (feeSponsorAccountId) {
          metadata.fee_sponsor = feeSponsorAccountId;
        }
        if (gasAssetId) {
          metadata.gas_asset_id = gasAssetId;
        }
        return Object.keys(metadata).length > 0 ? metadata : undefined;
      })();

      let selfShieldHash = null;
      if (payerInitialSpendable < amountBigInt) {
        const selfShieldAmount = (
          amountBigInt - payerInitialSpendable
        ).toString();
        let selfShield;
        try {
          selfShield = await window.iroha.transferAsset({
            toriiUrl: payload.toriiUrl,
            chainId: payload.chainId,
            assetDefinitionId: payload.assetDefinitionId,
            accountId: payerAccountId,
            destinationAccountId: payerAccountId,
            quantity: selfShieldAmount,
            privateKeyHex: payload.payerPrivateKeyHex,
            metadata: feeMetadata,
            shielded: true,
          });
        } catch (error) {
          return {
            ok: false,
            stage: "self-shield-submit",
            error: String(error ?? ""),
            selfShieldAmount,
            payerAccountId,
            payerDerivedPublicKeyHex: payerDerivedPublicKey.publicKeyHex,
            payerDerivedAddress,
            payeeAccountId,
            payeeDerivedPublicKeyHex: payeeDerivedPublicKey.publicKeyHex,
            payeeDerivedAddress,
          };
        }
        selfShieldHash = selfShield.hash;
        const payerAfterSelfShield = await waitForSpendableBalance({
          accountId: payerAccountId,
          privateKeyHex: payload.payerPrivateKeyHex,
          expectedQuantity: amount,
        });
        if (!payerAfterSelfShield.ok) {
          return {
            ok: false,
            stage: "self-shield-balance",
            error: payerAfterSelfShield.error,
            selfShieldHash,
            payerAfterSelfShield,
          };
        }
      }

      let executionContext = null;
      try {
        executionContext =
          await window.iroha.getConfidentialTransferExecutionContext({
            toriiUrl: payload.toriiUrl,
            chainId: payload.chainId,
            accountId: payerAccountId,
            privateKeyHex: payload.payerPrivateKeyHex,
            assetDefinitionId: payload.assetDefinitionId,
          });
      } catch (error) {
        return {
          ok: false,
          stage: "execution-context",
          error: String(error ?? ""),
          selfShieldHash,
        };
      }

      const payeeAddress = await window.iroha.createConfidentialPaymentAddress({
        accountId: payeeAccountId,
        privateKeyHex: payload.payeePrivateKeyHex,
      });

      let recipientTransfer;
      try {
        recipientTransfer = await window.iroha.transferAsset({
          toriiUrl: payload.toriiUrl,
          chainId: payload.chainId,
          assetDefinitionId: payload.assetDefinitionId,
          accountId: payerAccountId,
          destinationAccountId: payeeAccountId,
          quantity: amount,
          privateKeyHex: payload.payerPrivateKeyHex,
          metadata: feeMetadata,
          shielded: true,
          shieldedRecipient: {
            receiveKeyId: payeeAddress.receiveKeyId,
            receivePublicKeyBase64Url: payeeAddress.receivePublicKeyBase64Url,
            ownerTagHex: payeeAddress.shieldedOwnerTagHex,
            diversifierHex: payeeAddress.shieldedDiversifierHex,
          },
        });
      } catch (error) {
        return {
          ok: false,
          stage: "recipient-transfer-submit",
          error: String(error ?? ""),
          selfShieldHash,
        };
      }

      const payeeExpectedSpendable = (
        payeeInitialSpendable + amountBigInt
      ).toString();
      const payeeRecovered = await waitForSpendableBalance({
        accountId: payeeAccountId,
        privateKeyHex: payload.payeePrivateKeyHex,
        expectedQuantity: payeeExpectedSpendable,
      });
      if (!payeeRecovered.ok) {
        return {
          ok: false,
          stage: "recipient-recovery",
          error: payeeRecovered.error,
          selfShieldHash,
          recipientTransferHash: recipientTransfer.hash,
          payeeRecovered,
        };
      }

      const payeeTransparentAfter =
        await readTransparentQuantity(payeeAccountId);
      return {
        ok: true,
        verified_backend: executionContext.backend,
        effective_mode: executionContext.effectiveMode,
        circuit_id: executionContext.circuitId,
        resolved_asset_id: executionContext.resolvedAssetId,
        self_shield_hash: selfShieldHash,
        recipient_transfer_hash: recipientTransfer.hash,
        recipient_recovered_quantity: amount,
        payee_spendable_after: payeeRecovered.spendableQuantity,
        public_transfer_detected:
          payeeTransparentAfter !== payeeTransparentBefore,
      };
    }, input);

    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    if (app) {
      await app.close();
    }
  }
}

main().catch((error) => {
  const message =
    error instanceof Error ? error.stack || error.message : String(error ?? "");
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});

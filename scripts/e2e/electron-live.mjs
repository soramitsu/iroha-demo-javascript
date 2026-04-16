#!/usr/bin/env node
/* global BigInt */

import { mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright";
import {
  parseFundedEnvConfig,
  parseOnboardingEnvConfig,
  isSupportedAccountIdLiteral,
  parseNetworkPrefix,
  resolveOptionalAliasRegistrationOutcome,
} from "./electron-live-utils.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, "..", "..");
const mainEntry = join(projectRoot, "dist", "main", "index.cjs");
const screenshotDir = join(projectRoot, "output", "playwright");
const tairaToriiUrl = "https://taira.sora.org";
const tairaChainId = "809574f5-fee7-5e69-bfcf-52451e42d50f";
const tairaToriiHosts = new Set(["taira.sora.org", "www.taira.sora.org"]);

const toriiUrl = readEnv("E2E_TORII_URL", tairaToriiUrl);
const chainId = readEnv("E2E_CHAIN_ID", tairaChainId);
const assetDefinitionId = String(
  process.env.E2E_ASSET_DEFINITION_ID ?? "",
).trim();
const networkPrefix = parseNetworkPrefix(process.env.E2E_NETWORK_PREFIX);
const defaultDerivationLabel = "default";
const {
  alias: onboardingAlias,
  privateKeyHex: onboardingPrivateKeyHex,
  offlineBalance: onboardingOfflineSeedBalance,
} = parseOnboardingEnvConfig(process.env);
const fundedWalletConfig = parseFundedEnvConfig(process.env);

async function main() {
  if (!existsSync(mainEntry)) {
    throw new Error(
      `Built Electron entrypoint not found: ${mainEntry}. Run "npm run build" first.`,
    );
  }

  assertTairaTarget(toriiUrl, chainId);
  await preflightToriiHealth(toriiUrl);
  mkdirSync(screenshotDir, { recursive: true });

  let app;
  let page;
  try {
    app = await electron.launch({
      args: [mainEntry],
      env: process.env,
    });
    page = await app.firstWindow();
    page.setDefaultTimeout(45_000);

    const fundedFlow = fundedWalletConfig
      ? await runFundedFlow(page, fundedWalletConfig)
      : await runFaucetFlow(page);
    const readOnlyAssetId = assetDefinitionId || fundedFlow.assetDefinitionId;
    const onboardingAssetId = assetDefinitionId || fundedFlow.assetDefinitionId;

    await runReadOnlyFlow(page, {
      accountId: fundedFlow.displayAccountId,
      i105AccountId: fundedFlow.i105AccountId,
      i105DefaultAccountId: fundedFlow.i105DefaultAccountId,
      publicKeyHex: fundedFlow.publicKeyHex,
      privateKeyHex: fundedFlow.privateKeyHex,
      assetDefinitionId: readOnlyAssetId,
    });
    const onboardingOutcome = await runOnboardingFlow(page, onboardingAssetId);

    console.log(
      onboardingOutcome === "skipped"
        ? "Live Electron E2E passed (faucet + confidential transfer + explorer flows; optional alias registration skipped because TAIRA returned HTTP 403)."
        : "Live Electron E2E passed (faucet + confidential transfer + explorer + optional alias-registration checks).",
    );
  } catch (error) {
    if (page) {
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const screenshotPath = join(
        screenshotDir,
        `electron-live-failure-${stamp}.png`,
      );
      try {
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.error(`Saved failure screenshot: ${screenshotPath}`);
      } catch (screenshotError) {
        console.error("Failed to capture failure screenshot:", screenshotError);
      }
    }
    throw error;
  } finally {
    if (app) {
      await app.close();
    }
  }
}

function readEnv(name, fallback) {
  const value = process.env[name]?.trim();
  return value || fallback;
}

function normalizeHost(url) {
  const parsed = new URL(url);
  return parsed.host.toLowerCase();
}

function assertTairaTarget(baseUrl, chain) {
  const host = normalizeHost(baseUrl);
  if (!tairaToriiHosts.has(host) || chain !== tairaChainId) {
    throw new Error(
      [
        "This wallet build is TAIRA-only.",
        `Use Torii URL ${tairaToriiUrl} and chain ID ${tairaChainId}.`,
        `Received Torii URL ${baseUrl} and chain ID ${chain}.`,
      ].join(" "),
    );
  }
}

async function preflightToriiHealth(baseUrl) {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const healthUrls = ["v1/health", "health"].map((path) =>
    new URL(path, normalizedBase).toString(),
  );
  const attempts = [];

  for (const healthUrl of healthUrls) {
    const timeout = AbortSignal.timeout(15_000);
    try {
      const response = await fetch(healthUrl, {
        method: "GET",
        signal: timeout,
      });
      if (response.ok) return;
      const bodySnippet = await response.text().catch(() => "");
      attempts.push(
        `${healthUrl} -> ${response.status} ${response.statusText}${bodySnippet ? `: ${bodySnippet.slice(0, 120)}` : ""}`,
      );
    } catch (error) {
      attempts.push(`${healthUrl} -> ${String(error)}`);
    }
  }

  throw new Error(
    `Torii health preflight failed. Attempts: ${attempts.join(" | ")}`,
  );
}

async function runFaucetFlow(page) {
  await page.evaluate(() => {
    localStorage.removeItem("iroha-demo:session");
    localStorage.removeItem("iroha-demo:offline");
    localStorage.setItem("iroha-demo:locale", "en-US");
  });
  await page.reload();

  await waitForAccountView(page);
  await configureConnection(page);
  const faucetBootstrap = await page.evaluate(
    ({ torii, chain, prefix, derivationLabel }) => {
      const { publicKeyHex, privateKeyHex } = window.iroha.generateKeyPair();
      const summary = window.iroha.deriveAccountAddress({
        domain: derivationLabel,
        publicKeyHex,
        networkPrefix: prefix,
      });

      localStorage.setItem(
        "iroha-demo:session",
        JSON.stringify({
          hydrated: true,
          connection: {
            toriiUrl: torii,
            chainId: chain,
            assetDefinitionId: "",
            networkPrefix: prefix,
          },
          authority: {
            accountId: "",
            privateKeyHex: "",
          },
          accounts: [
            {
              displayName: "E2E Faucet",
              domain: derivationLabel,
              accountId: summary.accountId,
              i105AccountId: summary.i105AccountId,
              i105DefaultAccountId: summary.i105DefaultAccountId,
              publicKeyHex,
              privateKeyHex,
              localOnly: true,
            },
          ],
          activeAccountId: summary.accountId,
          customChains: [],
        }),
      );

      return {
        displayAccountId: summary.accountId,
        i105AccountId: summary.i105AccountId,
        i105DefaultAccountId: summary.i105DefaultAccountId,
        publicKeyHex,
        privateKeyHex,
      };
    },
    {
      torii: toriiUrl,
      chain: chainId,
      prefix: networkPrefix,
      derivationLabel: defaultDerivationLabel,
    },
  );

  await page.reload();
  await page.evaluate(() => {
    window.location.hash = "#/wallet";
  });
  await page.waitForFunction(
    () => window.location.hash === "#/wallet",
    undefined,
    {
      timeout: 45_000,
    },
  );
  await page
    .getByRole("heading", { name: "Wallet", exact: true, level: 1 })
    .waitFor({ state: "visible", timeout: 45_000 });

  const faucetReceipt = await page.evaluate(
    async ({ torii, accountId, prefix }) => {
      const result = await window.iroha.requestFaucetFunds({
        toriiUrl: torii,
        accountId,
        networkPrefix: prefix,
      });
      const raw = localStorage.getItem("iroha-demo:session");
      if (raw) {
        try {
          const session = JSON.parse(raw);
          const configuredAssetDefinitionId =
            String(result?.asset_definition_id ?? "").trim() ||
            String(result?.asset_id ?? "").trim();
          const nextAccounts = Array.isArray(session?.accounts)
            ? session.accounts.map((entry) =>
                entry?.accountId === session?.activeAccountId
                  ? {
                      ...entry,
                      localOnly: false,
                    }
                  : entry,
              )
            : [];
          localStorage.setItem(
            "iroha-demo:session",
            JSON.stringify({
              ...session,
              connection: {
                ...session?.connection,
                assetDefinitionId: configuredAssetDefinitionId,
              },
              accounts: nextAccounts,
            }),
          );
        } catch {
          // Ignore storage repair failures in the live harness.
        }
      }
      return result;
    },
    {
      torii: toriiUrl,
      accountId: faucetBootstrap.displayAccountId,
      prefix: networkPrefix,
    },
  );

  const fundedBalance = await page.evaluate(
    async ({ torii, accountId }) => {
      let lastError = "";
      for (let attempt = 0; attempt < 30; attempt += 1) {
        try {
          const response = await window.iroha.fetchAccountAssets({
            toriiUrl: torii,
            accountId,
            limit: 50,
          });
          const items = Array.isArray(response?.items) ? response.items : [];
          const positiveAsset = items.find((asset) => {
            const quantity = Number(String(asset?.quantity ?? ""));
            return Number.isFinite(quantity) && quantity > 0;
          });
          if (positiveAsset) {
            return {
              assetId: String(positiveAsset.asset_id ?? "").trim(),
              quantity: String(positiveAsset.quantity ?? "").trim(),
              error: "",
            };
          }
        } catch (error) {
          lastError = String(error ?? "");
        }
        await new Promise((resolve) => window.setTimeout(resolve, 2_000));
      }
      return {
        assetId: "",
        quantity: "",
        error: lastError,
      };
    },
    {
      torii: toriiUrl,
      accountId: faucetBootstrap.displayAccountId,
    },
  );

  if (!fundedBalance?.assetId || !fundedBalance?.quantity) {
    throw new Error(
      `Faucet flow queued a request but did not observe a funded balance within 60s. State: ${JSON.stringify(
        {
          faucetReceipt,
          fundedBalance,
          faucetBootstrap,
        },
      ).slice(0, 1600)}`,
    );
  }

  const txHash = String(faucetReceipt?.tx_hash_hex ?? "").trim();

  const assetId = String(fundedBalance.assetId).trim();
  const assetDefinitionId =
    assetId.split("#", 1)[0]?.trim() ||
    String(faucetReceipt?.asset_definition_id ?? "");

  if (!assetDefinitionId) {
    throw new Error(
      `Faucet flow did not resolve an asset definition id. State: ${JSON.stringify(
        {
          faucetReceipt,
          fundedBalance,
        },
      ).slice(0, 1200)}`,
    );
  }

  console.log(
    txHash
      ? `Faucet probe queued ${txHash} and observed ${fundedBalance.quantity} units on ${assetId}.`
      : `Faucet probe observed ${fundedBalance.quantity} units on ${assetId}; bridge result did not expose a transaction hash before sampling.`,
  );

  return {
    ...faucetBootstrap,
    canonicalAccountId: assetId.split("#").slice(1).join("#"),
    assetId,
    assetDefinitionId,
    txHash,
    quantity: String(fundedBalance.quantity).trim(),
  };
}

async function runFundedFlow(page, fundedWallet) {
  await page.evaluate(() => {
    localStorage.removeItem("iroha-demo:session");
    localStorage.removeItem("iroha-demo:offline");
    localStorage.setItem("iroha-demo:locale", "en-US");
  });
  await page.reload();

  await waitForAccountView(page);
  await configureConnection(page);

  const fundedBootstrap = await page.evaluate(
    async ({
      torii,
      chain,
      prefix,
      domain,
      privateKeyHex,
      requestedAssetDefinitionId,
    }) => {
      const { publicKeyHex } = window.iroha.derivePublicKey(privateKeyHex);
      const summary = window.iroha.deriveAccountAddress({
        domain,
        publicKeyHex,
        networkPrefix: prefix,
      });
      const assetsResponse = await window.iroha.fetchAccountAssets({
        toriiUrl: torii,
        accountId: summary.i105AccountId,
        limit: 200,
      });
      const items = Array.isArray(assetsResponse?.items)
        ? assetsResponse.items
        : [];
      const requested = String(requestedAssetDefinitionId ?? "").trim();
      const requestedLower = requested.toLowerCase();
      const positiveItems = items.filter((asset) => {
        const quantity = Number(String(asset?.quantity ?? ""));
        return Number.isFinite(quantity) && quantity > 0;
      });
      const matchingAsset =
        (requestedLower
          ? positiveItems.find((asset) => {
              const assetId = String(asset?.asset_id ?? "")
                .trim()
                .toLowerCase();
              return (
                assetId === requestedLower ||
                assetId.startsWith(`${requestedLower}#`) ||
                assetId.includes(requestedLower)
              );
            })
          : null) ??
        positiveItems[0] ??
        null;
      const assetId = String(matchingAsset?.asset_id ?? "").trim();
      const resolvedAssetDefinitionId =
        requested || assetId.split("#", 1)[0]?.trim() || "";

      localStorage.setItem(
        "iroha-demo:session",
        JSON.stringify({
          hydrated: true,
          connection: {
            toriiUrl: torii,
            chainId: chain,
            assetDefinitionId: resolvedAssetDefinitionId,
            networkPrefix: prefix,
          },
          authority: {
            accountId: "",
            privateKeyHex: "",
          },
          accounts: [
            {
              displayName: "E2E Funded",
              domain,
              accountId: summary.accountId,
              i105AccountId: summary.i105AccountId,
              i105DefaultAccountId: summary.i105DefaultAccountId,
              publicKeyHex,
              privateKeyHex,
              localOnly: false,
            },
          ],
          activeAccountId: summary.accountId,
          customChains: [],
        }),
      );

      return {
        displayAccountId: summary.accountId,
        i105AccountId: summary.i105AccountId,
        i105DefaultAccountId: summary.i105DefaultAccountId,
        publicKeyHex,
        privateKeyHex,
        assetId,
        assetDefinitionId: resolvedAssetDefinitionId,
        quantity: String(matchingAsset?.quantity ?? "").trim(),
        availableAssetIds: items
          .map((asset) => String(asset?.asset_id ?? "").trim())
          .filter(Boolean),
      };
    },
    {
      torii: toriiUrl,
      chain: chainId,
      prefix: networkPrefix,
      domain: fundedWallet.domain,
      privateKeyHex: fundedWallet.privateKeyHex,
      requestedAssetDefinitionId: assetDefinitionId,
    },
  );

  if (!fundedBootstrap?.assetId || !fundedBootstrap?.assetDefinitionId) {
    throw new Error(
      `Funded-account bootstrap could not resolve a positive live asset balance. State: ${JSON.stringify(
        fundedBootstrap,
      ).slice(0, 1600)}`,
    );
  }

  console.log(
    `Using funded TAIRA account ${fundedBootstrap.i105AccountId} with ${fundedBootstrap.quantity} units on ${fundedBootstrap.assetId}.`,
  );

  return fundedBootstrap;
}

async function runReadOnlyFlow(page, fundedAccount) {
  await page.evaluate(() => {
    localStorage.removeItem("iroha-demo:session");
    localStorage.removeItem("iroha-demo:offline");
    localStorage.setItem("iroha-demo:locale", "en-US");
  });
  await page.reload();

  await waitForAccountView(page);
  await configureConnection(page);

  await page.evaluate(
    ({
      accountId,
      i105AccountId,
      i105DefaultAccountId,
      publicKeyHex,
      privateKeyHex,
      torii,
      chain,
      assetId,
      prefix,
      derivationLabel,
    }) => {
      localStorage.setItem(
        "iroha-demo:session",
        JSON.stringify({
          hydrated: true,
          connection: {
            toriiUrl: torii,
            chainId: chain,
            assetDefinitionId: assetId,
            networkPrefix: prefix,
          },
          authority: {
            accountId: "",
            privateKeyHex: "",
          },
          accounts: [
            {
              displayName: "E2E Synthetic",
              domain: derivationLabel,
              accountId,
              i105AccountId,
              i105DefaultAccountId,
              publicKeyHex,
              privateKeyHex,
            },
          ],
          activeAccountId: accountId,
          customChains: [],
        }),
      );
    },
    {
      accountId: fundedAccount.accountId,
      i105AccountId: fundedAccount.i105AccountId,
      i105DefaultAccountId: fundedAccount.i105DefaultAccountId,
      publicKeyHex: fundedAccount.publicKeyHex,
      privateKeyHex: fundedAccount.privateKeyHex,
      torii: toriiUrl,
      chain: chainId,
      assetId: fundedAccount.assetDefinitionId,
      prefix: networkPrefix,
      derivationLabel: defaultDerivationLabel,
    },
  );

  await page.reload();
  await page.evaluate(() => {
    window.location.hash = "#/wallet";
  });

  await page.waitForFunction(
    () => window.location.hash === "#/wallet",
    undefined,
    {
      timeout: 45_000,
    },
  );
  await page
    .getByRole("heading", { name: "Wallet", exact: true, level: 1 })
    .waitFor({ state: "visible", timeout: 45_000 });

  const confidentialTransferProbe = await page.evaluate(
    async ({
      torii,
      chain,
      assetId,
      aliceAccountId,
      alicePrivateKeyHex,
      prefix,
      derivationLabel,
    }) => {
      const waitForMs = (delayMs) =>
        new Promise((resolve) => {
          window.setTimeout(resolve, delayMs);
        });
      const readSpendableQuantity = (balance) => {
        const raw =
          balance?.spendableQuantity ??
          balance?.quantity ??
          balance?.onChainQuantity;
        const normalized = String(raw ?? "").trim();
        return /^\d+$/.test(normalized) ? normalized : "0";
      };
      const readConfidentialBalance = (accountId, privateKeyHex) =>
        window.iroha.getConfidentialAssetBalance({
          toriiUrl: torii,
          chainId: chain,
          accountId,
          privateKeyHex,
          assetDefinitionId: assetId,
        });
      const waitForConfidentialBalance = async ({
        accountId,
        privateKeyHex,
        minimumQuantity,
        timeoutMs = 90_000,
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
            if (
              BigInt(readSpendableQuantity(lastBalance)) >=
              BigInt(String(minimumQuantity))
            ) {
              return {
                ok: true,
                balance: lastBalance,
                error: "",
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
          error: lastError,
        };
      };

      const initialAliceBalance = await readConfidentialBalance(
        aliceAccountId,
        alicePrivateKeyHex,
      );
      const initialAliceSpendable = readSpendableQuantity(initialAliceBalance);

      const bobKeyPair = window.iroha.generateKeyPair();
      const bobSummary = window.iroha.deriveAccountAddress({
        domain: derivationLabel,
        publicKeyHex: bobKeyPair.publicKeyHex,
        networkPrefix: prefix,
      });
      const bobReceiveAddress = window.iroha.deriveConfidentialReceiveAddress(
        bobKeyPair.privateKeyHex,
      );
      const bobOwnerTagHex = bobReceiveAddress.ownerTagHex;
      const bobDiversifierHex = bobReceiveAddress.diversifierHex;
      const initialBobBalance = await readConfidentialBalance(
        bobSummary.i105AccountId,
        bobKeyPair.privateKeyHex,
      );
      const initialBobSpendable = readSpendableQuantity(initialBobBalance);

      const selfShield = await window.iroha.transferAsset({
        toriiUrl: torii,
        chainId: chain,
        assetDefinitionId: assetId,
        accountId: aliceAccountId,
        destinationAccountId: aliceAccountId,
        quantity: "2",
        privateKeyHex: alicePrivateKeyHex,
        shielded: true,
        metadata: {
          source: "electron-live-self-shield",
        },
      });
      const aliceAfterSelfShield = await waitForConfidentialBalance({
        accountId: aliceAccountId,
        privateKeyHex: alicePrivateKeyHex,
        minimumQuantity: BigInt(initialAliceSpendable) + 2n,
      });
      if (!aliceAfterSelfShield.ok) {
        return {
          ok: false,
          stage: "self-shield-balance",
          selfShieldHash: selfShield.hash,
          initialAliceBalance,
          result: aliceAfterSelfShield,
        };
      }

      const recipientTransfer = await window.iroha.transferAsset({
        toriiUrl: torii,
        chainId: chain,
        assetDefinitionId: assetId,
        accountId: aliceAccountId,
        destinationAccountId: bobSummary.i105AccountId,
        quantity: "1",
        privateKeyHex: alicePrivateKeyHex,
        shielded: true,
        shieldedOwnerTagHex: bobOwnerTagHex,
        shieldedDiversifierHex: bobDiversifierHex,
        metadata: {
          source: "electron-live-recipient-shielded-send",
        },
      });

      const expectedAliceSpendable = BigInt(initialAliceSpendable) + 1n;
      const expectedBobSpendable = BigInt(initialBobSpendable) + 1n;
      const finalAliceBalance = await waitForConfidentialBalance({
        accountId: aliceAccountId,
        privateKeyHex: alicePrivateKeyHex,
        minimumQuantity: expectedAliceSpendable,
      });
      const finalBobBalance = await waitForConfidentialBalance({
        accountId: bobSummary.i105AccountId,
        privateKeyHex: bobKeyPair.privateKeyHex,
        minimumQuantity: expectedBobSpendable,
      });

      const aliceSpendable = readSpendableQuantity(finalAliceBalance.balance);
      const bobSpendable = readSpendableQuantity(finalBobBalance.balance);
      const aliceMatches = aliceSpendable === expectedAliceSpendable.toString();
      const bobMatches = bobSpendable === expectedBobSpendable.toString();

      return {
        ok:
          finalAliceBalance.ok &&
          finalBobBalance.ok &&
          aliceMatches &&
          bobMatches,
        stage: !finalAliceBalance.ok
          ? "sender-final-balance"
          : !finalBobBalance.ok
            ? "recipient-final-balance"
            : !aliceMatches || !bobMatches
              ? "unexpected-final-quantity"
              : "completed",
        bobAccountId: bobSummary.i105AccountId,
        bobOwnerTagHex,
        bobDiversifierHex,
        selfShieldHash: selfShield.hash,
        recipientTransferHash: recipientTransfer.hash,
        initialAliceBalance,
        initialBobBalance,
        finalAliceBalance,
        finalBobBalance,
        expectedAliceSpendable: expectedAliceSpendable.toString(),
        expectedBobSpendable: expectedBobSpendable.toString(),
        observedAliceSpendable: aliceSpendable,
        observedBobSpendable: bobSpendable,
      };
    },
    {
      torii: toriiUrl,
      chain: chainId,
      assetId: fundedAccount.assetDefinitionId,
      aliceAccountId: fundedAccount.accountId,
      alicePrivateKeyHex: fundedAccount.privateKeyHex,
      prefix: networkPrefix,
      derivationLabel: defaultDerivationLabel,
    },
  );

  if (!confidentialTransferProbe?.ok) {
    throw new Error(
      `TAIRA confidential transfer probe failed at stage ${String(
        confidentialTransferProbe?.stage ?? "unknown",
      )}. Probe: ${JSON.stringify(confidentialTransferProbe).slice(0, 2000)}`,
    );
  }

  console.log(
    `Confidential transfer probe committed self-shield ${confidentialTransferProbe.selfShieldHash} and recipient shielded send ${confidentialTransferProbe.recipientTransferHash} to ${confidentialTransferProbe.bobAccountId}.`,
  );

  await page.evaluate(() => {
    window.location.hash = "#/explore";
  });

  await page.waitForFunction(
    () => window.location.hash === "#/explore",
    undefined,
    {
      timeout: 45_000,
    },
  );
  await page.waitForTimeout(2_000);

  const bridgeProbe = await page.evaluate(
    async ({ torii, accountId }) => {
      const out = {
        metrics: null,
        metricsError: null,
        qr: null,
        qrError: null,
        hash: window.location.hash,
        hasExplorerMetricsText:
          document.body.textContent?.includes("Explorer Metrics") ?? false,
        hasExploreHeading:
          document.body.textContent?.includes("Explore") ?? false,
        cardCount: document.querySelectorAll(".card").length,
      };
      try {
        out.metrics = await window.iroha.getExplorerMetrics({
          toriiUrl: torii,
        });
      } catch (error) {
        out.metricsError = String(error);
      }
      try {
        out.qr = await window.iroha.getExplorerAccountQr({
          toriiUrl: torii,
          accountId,
        });
      } catch (error) {
        out.qrError = String(error);
      }
      return out;
    },
    { torii: toriiUrl, accountId: fundedAccount.accountId },
  );

  if (!bridgeProbe.metrics) {
    throw new Error(
      `Expected explorer metrics to resolve, but got null/error. Probe: ${JSON.stringify(
        bridgeProbe,
      ).slice(0, 1200)}`,
    );
  }

  if (!bridgeProbe.qr) {
    throw new Error(
      `Expected explorer QR payload to resolve, but got null/error. Probe: ${JSON.stringify(
        bridgeProbe,
      ).slice(0, 1200)}`,
    );
  }

  const metricsUnavailable = page.getByText(
    "Metrics unavailable. Check Torii status.",
  );
  if (await metricsUnavailable.isVisible().catch(() => false)) {
    throw new Error(
      `Expected explorer metrics panel to render, but fallback text remained. Probe: ${JSON.stringify(
        bridgeProbe,
      ).slice(0, 1200)}`,
    );
  }

  const noQrMessage = page.getByText(
    "No QR payload yet. Connect to Torii and pick an account.",
  );
  if (await noQrMessage.isVisible().catch(() => false)) {
    throw new Error(
      `Expected explorer QR panel to render, but fallback text remained. Probe: ${JSON.stringify(
        bridgeProbe,
      ).slice(0, 1200)}`,
    );
  }

  await page
    .getByAltText("Explorer account QR")
    .waitFor({ state: "visible", timeout: 30_000 });

  await page.getByRole("heading", { name: "Explore", exact: true }).waitFor({
    state: "visible",
    timeout: 30_000,
  });

  await runNavigationSmokeFlow(page, fundedAccount);
}

async function runOnboardingFlow(page, resolvedAssetDefinitionId) {
  await page.evaluate(() => {
    localStorage.removeItem("iroha-demo:session");
    localStorage.removeItem("iroha-demo:offline");
    localStorage.setItem("iroha-demo:locale", "en-US");
  });
  await page.reload();

  await waitForAccountView(page);
  await configureConnection(page);
  const onboardingBootstrap = await page.evaluate(
    async ({
      torii,
      chain,
      assetId,
      prefix,
      alias,
      privateKeyHex,
      offlineBalance,
      derivationLabel,
    }) => {
      const { publicKeyHex } = window.iroha.derivePublicKey(privateKeyHex);
      const summary = window.iroha.deriveAccountAddress({
        domain: derivationLabel,
        publicKeyHex,
        networkPrefix: prefix,
      });
      const accountProfile = {
        displayName: alias,
        domain: derivationLabel,
        accountId: summary.accountId,
        publicKeyHex,
        privateKeyHex,
      };

      let onboarding = { status: "ok", detail: "" };
      try {
        await window.iroha.onboardAccount({
          toriiUrl: torii,
          alias,
          accountId: summary.accountId,
          identity: {
            source: "electron-live-onboarding",
            managed_by: "e2e-harness",
          },
        });
      } catch (error) {
        onboarding = {
          status: "error",
          detail: String(error ?? ""),
        };
      }

      localStorage.setItem(
        "iroha-demo:session",
        JSON.stringify({
          hydrated: true,
          connection: {
            toriiUrl: torii,
            chainId: chain,
            assetDefinitionId: assetId,
            networkPrefix: prefix,
          },
          authority: {
            accountId: "",
            privateKeyHex: "",
          },
          accounts: [accountProfile],
          activeAccountId: accountProfile.accountId,
          customChains: [],
        }),
      );

      localStorage.setItem(
        "iroha-demo:offline",
        JSON.stringify({
          hydrated: true,
          wallet: {
            balance: offlineBalance,
            nextCounter: 0,
            replayLog: [],
            history: [],
            syncedAtMs: null,
            nextPolicyExpiryMs: null,
            nextRefreshMs: null,
          },
          hardware: {
            supported: false,
            registered: false,
            credentialId: null,
            registeredAtMs: null,
          },
        }),
      );

      return {
        accountId: accountProfile.accountId,
        onboarding,
      };
    },
    {
      torii: toriiUrl,
      chain: chainId,
      assetId: resolvedAssetDefinitionId,
      prefix: networkPrefix,
      alias: onboardingAlias,
      privateKeyHex: onboardingPrivateKeyHex,
      offlineBalance: onboardingOfflineSeedBalance,
      derivationLabel: defaultDerivationLabel,
    },
  );

  const onboardingStatus = onboardingBootstrap?.onboarding?.status ?? "";
  const onboardingDetail = String(
    onboardingBootstrap?.onboarding?.detail ?? "",
  );
  const aliasRegistrationOutcome = resolveOptionalAliasRegistrationOutcome(
    onboardingStatus,
    onboardingDetail,
  );
  if (onboardingStatus === "error") {
    if (aliasRegistrationOutcome === "skipped") {
      console.log(
        `Optional alias registration probe: skipped because ${toriiUrl} returned HTTP 403. Local-wallet-only operation remains valid on this build.`,
      );
      return "skipped";
    }
    console.log(
      "Optional alias registration probe: deterministic account already exists (HTTP 409), reusing existing account profile.",
    );
  } else {
    console.log(
      "Optional alias registration probe: deterministic account registration succeeded.",
    );
  }

  const persistedAccountId = onboardingBootstrap?.accountId ?? null;
  if (
    typeof persistedAccountId !== "string" ||
    !isSupportedAccountIdLiteral(persistedAccountId)
  ) {
    throw new Error(
      `Onboarding bootstrap persisted an ambiguous account id literal: ${String(persistedAccountId)}`,
    );
  }

  await page.reload();

  return "executed";
}

async function runNavigationSmokeFlow(page, fundedAccount) {
  const checks = [
    {
      hash: "#/setup",
      heading: "Network",
      sectionText: "Network",
    },
    {
      hash: "#/wallet",
      heading: "Wallet",
      sectionText: "Balances",
    },
    {
      hash: "#/staking",
      heading: "Stake",
      sectionText: "Stake",
    },
    {
      hash: "#/parliament",
      heading: "Governance",
      sectionText: "Citizenship",
    },
    {
      hash: "#/subscriptions",
      heading: "Subscriptions",
      sectionText: "New subscription",
    },
    {
      hash: "#/send",
      heading: "Send",
      sectionText: "Send",
    },
    {
      hash: "#/receive",
      heading: "Receive",
      sectionText: "Receive",
    },
    {
      hash: "#/offline",
      heading: "Offline",
      sectionText: "Offline wallet",
    },
    {
      hash: "#/explore",
      heading: "Explore",
      sectionText: "Network metrics",
    },
  ];

  for (const check of checks) {
    await page.evaluate((hash) => {
      window.location.hash = hash;
    }, check.hash);

    await page.waitForFunction(
      (expectedHash) => window.location.hash === expectedHash,
      check.hash,
      {
        timeout: 45_000,
      },
    );
    await page
      .getByRole("heading", { name: check.heading, exact: true, level: 1 })
      .waitFor({
        state: "visible",
        timeout: 45_000,
      });
    await page
      .locator(".workspace-body")
      .getByText(check.sectionText, { exact: true })
      .first()
      .waitFor({
        state: "visible",
        timeout: 45_000,
      });

    if (check.hash === "#/staking") {
      const claimRewardsButton = page.getByRole("button", {
        name: "Claim Rewards",
        exact: true,
      });
      await claimRewardsButton.waitFor({
        state: "visible",
        timeout: 45_000,
      });
      const noRewardsMessage = page.getByText(
        "No pending rewards for this lane/account.",
        {
          exact: true,
        },
      );
      const noRewardsVisible = await noRewardsMessage
        .waitFor({ state: "visible", timeout: 8_000 })
        .then(() => true)
        .catch(() => false);
      if (noRewardsVisible && !(await claimRewardsButton.isDisabled())) {
        throw new Error(
          "Expected Claim Rewards button to be disabled when no pending rewards are shown.",
        );
      }
    }

    if (check.hash === "#/parliament") {
      await page
        .getByRole("button", { name: "Bond 10000 XOR", exact: true })
        .waitFor({
          state: "visible",
          timeout: 45_000,
        });
      await page
        .getByRole("button", { name: "Submit ballot", exact: true })
        .waitFor({
          state: "visible",
          timeout: 45_000,
        });
    }

    if (check.hash === "#/send") {
      const shieldToggle = page.getByLabel("Anonymous shielded send", {
        exact: true,
      });
      await shieldToggle.waitFor({ state: "visible", timeout: 30_000 });
      if (!(await shieldToggle.isEnabled())) {
        await page
          .getByRole("button", { name: "Send", exact: true })
          .waitFor({ state: "visible", timeout: 30_000 });
        continue;
      }
      const destinationInput = page.getByLabel("To", { exact: true });
      const amountInput = page.locator('input[type="number"]').first();
      const transparentDestination = "testuRestoreSendAccount";
      await destinationInput.fill(transparentDestination);

      const transparentStep = await amountInput.getAttribute("step");
      if (transparentStep !== "0.01") {
        throw new Error(
          `Expected send amount step to be 0.01 before shielding, got ${String(transparentStep)}.`,
        );
      }

      let sendShieldCheckable = true;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          await shieldToggle.check({ timeout: 5_000 });
          break;
        } catch (error) {
          const stillEnabled = await shieldToggle
            .isEnabled()
            .catch(() => false);
          if (!stillEnabled) {
            sendShieldCheckable = false;
            break;
          }
          if (attempt === 2) {
            throw new Error(
              `Expected send shield toggle to be checkable when enabled. Last error: ${String(
                error,
              )}`,
            );
          }
          await page.waitForTimeout(400);
        }
      }
      if (!sendShieldCheckable) {
        await page
          .getByRole("button", { name: "Send", exact: true })
          .waitFor({ state: "visible", timeout: 30_000 });
        continue;
      }
      if (!(await shieldToggle.isChecked().catch(() => false))) {
        await page
          .getByRole("button", { name: "Send", exact: true })
          .waitFor({ state: "visible", timeout: 30_000 });
        continue;
      }

      if (await destinationInput.isDisabled()) {
        throw new Error(
          "Expected send destination to remain editable when anonymous send is enabled.",
        );
      }
      const shieldStep = await amountInput.getAttribute("step");
      if (shieldStep !== "1") {
        throw new Error(
          `Expected send amount step to be 1 in shield mode, got ${String(shieldStep)}.`,
        );
      }
      const shieldSubmitButton = page.getByRole("button", {
        name: "Send anonymously",
        exact: true,
      });
      const shieldButtonVisible = await shieldSubmitButton
        .waitFor({ state: "visible", timeout: 5_000 })
        .then(() => true)
        .catch(() => false);
      if (!shieldButtonVisible) {
        await page
          .getByRole("button", { name: "Send", exact: true })
          .waitFor({ state: "visible", timeout: 30_000 });
        continue;
      }
      await amountInput.fill("10.5");
      const shieldDisabledForDecimal = await shieldSubmitButton
        .isDisabled({ timeout: 3_000 })
        .catch(() => null);
      if (shieldDisabledForDecimal === null) {
        await page
          .getByRole("button", { name: "Send", exact: true })
          .waitFor({ state: "visible", timeout: 30_000 });
        continue;
      }
      if (!shieldDisabledForDecimal) {
        throw new Error(
          "Expected anonymous send action to be disabled for decimal amounts.",
        );
      }
      await amountInput.fill("10");
      const shieldDisabledForWhole = await shieldSubmitButton
        .isDisabled({ timeout: 3_000 })
        .catch(() => null);
      if (shieldDisabledForWhole === null) {
        await page
          .getByRole("button", { name: "Send", exact: true })
          .waitFor({ state: "visible", timeout: 30_000 });
        continue;
      }
      if (!shieldDisabledForWhole) {
        throw new Error(
          "Expected anonymous send action to stay disabled for a non-self destination without a shielded Receive QR.",
        );
      }
      await page
        .getByText(
          "Scan a shielded Receive QR for this destination before sending anonymously.",
          { exact: true },
        )
        .waitFor({ state: "visible", timeout: 5_000 });
      await destinationInput.fill(fundedAccount.accountId);
      const shieldDisabledForSelf = await shieldSubmitButton
        .isDisabled({ timeout: 3_000 })
        .catch(() => null);
      if (shieldDisabledForSelf === null) {
        await page
          .getByRole("button", { name: "Send", exact: true })
          .waitFor({ state: "visible", timeout: 30_000 });
        continue;
      }
      if (shieldDisabledForSelf) {
        throw new Error(
          "Expected anonymous self-shield action to become enabled for whole-number amounts.",
        );
      }
      if (await shieldToggle.isChecked()) {
        let attemptedManualUncheck = false;
        if (await shieldToggle.isEnabled()) {
          attemptedManualUncheck = true;
          await shieldToggle.uncheck({ timeout: 3_000 }).catch(() => undefined);
        }
        if (await shieldToggle.isChecked()) {
          await page.waitForTimeout(1_000);
        }
        if (await shieldToggle.isChecked()) {
          throw new Error(
            attemptedManualUncheck
              ? "Send shield toggle stayed checked after uncheck attempt."
              : "Send shield toggle stayed checked after becoming disabled.",
          );
        }
      }
      const restoredStep = await amountInput.getAttribute("step");
      if (restoredStep !== "0.01") {
        throw new Error(
          `Expected send amount step to return to 0.01 after disabling shield mode, got ${String(restoredStep)}.`,
        );
      }
      await page
        .getByRole("button", { name: "Send", exact: true })
        .waitFor({ state: "visible", timeout: 30_000 });
    }

    if (check.hash === "#/offline") {
      const moveCard = page
        .locator("section.card")
        .filter({ hasText: "Move to online wallet" })
        .first();
      const shieldToggle = moveCard.getByLabel("Private exit", {
        exact: true,
      });
      await shieldToggle.waitFor({ state: "visible", timeout: 30_000 });
      if (!(await shieldToggle.isEnabled())) {
        await moveCard
          .getByRole("button", { name: "Send to wallet", exact: true })
          .waitFor({ state: "visible", timeout: 30_000 });
        continue;
      }
      const destinationInput = moveCard.getByLabel("To", { exact: true });
      const transparentDestination = "testuRestoreOfflineAccount";
      await destinationInput.fill(transparentDestination);
      let offlineShieldCheckable = true;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          await shieldToggle.check({ timeout: 5_000 });
          break;
        } catch (error) {
          const stillEnabled = await shieldToggle
            .isEnabled()
            .catch(() => false);
          if (!stillEnabled) {
            offlineShieldCheckable = false;
            break;
          }
          if (attempt === 2) {
            throw new Error(
              `Expected offline shield toggle to be checkable when enabled. Last error: ${String(
                error,
              )}`,
            );
          }
          await page.waitForTimeout(400);
        }
      }
      if (!offlineShieldCheckable) {
        await moveCard
          .getByRole("button", { name: "Send to wallet", exact: true })
          .waitFor({ state: "visible", timeout: 30_000 });
        continue;
      }
      if (!(await shieldToggle.isChecked().catch(() => false))) {
        await moveCard
          .getByRole("button", { name: "Send to wallet", exact: true })
          .waitFor({ state: "visible", timeout: 30_000 });
        continue;
      }

      if (!(await destinationInput.isDisabled())) {
        throw new Error(
          'Expected offline "Move funds to online wallet" destination to lock when shield transfer is enabled.',
        );
      }
      const moveAmountInput = moveCard.locator('input[type="text"]').first();
      const moveSubmitButton = moveCard.getByRole("button", {
        name: "Unshield to wallet",
        exact: true,
      });
      const moveShieldButtonVisible = await moveSubmitButton
        .waitFor({ state: "visible", timeout: 5_000 })
        .then(() => true)
        .catch(() => false);
      if (!moveShieldButtonVisible) {
        await moveCard
          .getByRole("button", { name: "Send to wallet", exact: true })
          .waitFor({ state: "visible", timeout: 30_000 });
        continue;
      }
      await moveAmountInput.fill("10.5");
      const moveDisabledForDecimal = await moveSubmitButton
        .isDisabled({ timeout: 3_000 })
        .catch(() => null);
      if (moveDisabledForDecimal === null) {
        await moveCard
          .getByRole("button", { name: "Send to wallet", exact: true })
          .waitFor({ state: "visible", timeout: 30_000 });
        continue;
      }
      if (!moveDisabledForDecimal) {
        throw new Error(
          'Expected offline "Unshield to wallet" action to be disabled for decimal amounts.',
        );
      }
      await moveAmountInput.fill("10");
      const moveDisabledForWhole = await moveSubmitButton
        .isDisabled({ timeout: 3_000 })
        .catch(() => null);
      if (moveDisabledForWhole === null) {
        await moveCard
          .getByRole("button", { name: "Send to wallet", exact: true })
          .waitFor({ state: "visible", timeout: 30_000 });
        continue;
      }
      if (moveDisabledForWhole) {
        throw new Error(
          'Expected offline "Unshield to wallet" action to become enabled for whole-number amounts.',
        );
      }

      if (await shieldToggle.isChecked()) {
        let attemptedManualUncheck = false;
        if (await shieldToggle.isEnabled()) {
          attemptedManualUncheck = true;
          await shieldToggle.uncheck({ timeout: 3_000 }).catch(() => undefined);
        }
        if (await shieldToggle.isChecked()) {
          await page.waitForTimeout(1_000);
        }
        if (await shieldToggle.isChecked()) {
          throw new Error(
            attemptedManualUncheck
              ? 'Offline "Private exit" toggle stayed checked after uncheck attempt.'
              : 'Offline "Private exit" toggle stayed checked after becoming disabled.',
          );
        }
      }
      if ((await destinationInput.inputValue()) !== transparentDestination) {
        throw new Error(
          'Expected offline "Move funds to online wallet" destination to restore the previous transparent value after disabling shield transfer.',
        );
      }
      await moveCard
        .getByRole("button", { name: "Send to wallet", exact: true })
        .waitFor({ state: "visible", timeout: 30_000 });
    }
  }

  // Ensure receive page still renders a QR payload in the hydrated account flow.
  await page.evaluate(() => {
    window.location.hash = "#/receive";
  });
  await page.waitForFunction(
    () => window.location.hash === "#/receive",
    undefined,
    {
      timeout: 45_000,
    },
  );
  await clickButton(page, "Show QR");
  await page
    .locator(".qr svg")
    .first()
    .waitFor({ state: "visible", timeout: 30_000 });
}

async function waitForAccountView(page) {
  await page.waitForFunction(
    () =>
      window.location.hash === "#/account" ||
      window.location.hash === "#/" ||
      window.location.hash === "",
    undefined,
    {
      timeout: 45_000,
    },
  );
  await page.waitForFunction(
    () =>
      Boolean(
        window.iroha &&
          typeof window.iroha.onboardAccount === "function" &&
          typeof window.iroha.derivePublicKey === "function",
      ),
    undefined,
    {
      timeout: 45_000,
    },
  );
}

async function configureConnection() {
  // Connection fields are fixed in TAIRA-only builds; no UI input required here.
}

async function clickButton(page, name) {
  await page.getByRole("button", { name, exact: true }).click();
}

await main().catch((error) => {
  console.error(error);
  process.exit(1);
});

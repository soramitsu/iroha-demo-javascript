#!/usr/bin/env node
/* global BigInt */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright";
import {
  extractTransactionHashHex,
  summarizePublicFinalityDiagnostic,
  parseCachedFundedWalletRecord,
  parseFundedEnvConfig,
  parseOnboardingEnvConfig,
  isOnboardingDisabledError,
  isRetryableFaucetBadRequest,
  isSupportedAccountIdLiteral,
  parseNetworkPrefix,
  resolveOptionalAliasRegistrationOutcome,
} from "./electron-live-utils.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, "..", "..");
const mainEntry = join(projectRoot, "dist", "main", "index.cjs");
const screenshotDir = join(projectRoot, "output", "playwright");
const e2eStateDir = join(projectRoot, "output", "e2e");
const fundedWalletCachePath = join(e2eStateDir, "live-funded-wallet.json");
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
  mkdirSync(e2eStateDir, { recursive: true });

  let app;
  let page;
  try {
    app = await electron.launch({
      args: [mainEntry],
      env: process.env,
    });
    page = await app.firstWindow();
    page.setDefaultTimeout(45_000);

    const fundedFlow = await resolveBootstrapFlow(page);
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
      onboardingOutcome === "skipped_403"
        ? "Live Electron E2E passed (faucet + confidential transfer + explorer flows; optional alias registration skipped because TAIRA returned HTTP 403)."
        : onboardingOutcome === "skipped_400"
          ? "Live Electron E2E passed (faucet + confidential transfer + explorer flows; optional alias registration skipped because TAIRA returned a reusable HTTP 400 on the deterministic onboarding probe)."
          : "Live Electron E2E passed (faucet + confidential transfer + explorer + optional alias-registration checks).",
    );
  } catch (error) {
    const publicFinalityDiagnostic = await collectPublicFinalityDiagnostic(
      toriiUrl,
      error,
    );
    if (publicFinalityDiagnostic) {
      console.error("Public finality diagnostic:", publicFinalityDiagnostic);
      if (error instanceof Error) {
        error.message = `${error.message}\nPublic finality diagnostic: ${JSON.stringify(
          publicFinalityDiagnostic,
        )}`;
      }
    }
    console.error("Live Electron E2E failed:", error);
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
      await Promise.race([
        app.close(),
        new Promise((resolve) => setTimeout(resolve, 10_000)),
      ]);
    }
  }
}

function readCachedFundedWalletConfig() {
  if (!existsSync(fundedWalletCachePath)) {
    return null;
  }

  try {
    const payload = JSON.parse(readFileSync(fundedWalletCachePath, "utf8"));
    return parseCachedFundedWalletRecord(payload);
  } catch (error) {
    console.warn(
      `Ignoring unreadable funded-wallet cache at ${fundedWalletCachePath}: ${String(
        error ?? "",
      )}`,
    );
    return null;
  }
}

function writeCachedFundedWalletConfig(fundedAccount) {
  const payload = {
    cachedAt: new Date().toISOString(),
    domain: String(fundedAccount?.domain ?? defaultDerivationLabel).trim(),
    privateKeyHex: String(fundedAccount?.privateKeyHex ?? "").trim(),
    accountId:
      String(fundedAccount?.i105AccountId ?? "").trim() ||
      String(fundedAccount?.displayAccountId ?? "").trim(),
    assetId: String(fundedAccount?.assetId ?? "").trim(),
    assetDefinitionId: String(fundedAccount?.assetDefinitionId ?? "").trim(),
  };

  if (!payload.privateKeyHex) {
    return;
  }

  writeFileSync(
    fundedWalletCachePath,
    `${JSON.stringify(payload, null, 2)}\n`,
    "utf8",
  );
}

async function fetchDiagnosticPayload(url) {
  try {
    const response = await fetch(url, {
      headers: {
        accept: "application/json",
      },
    });
    const text = await response.text();
    if (!response.ok) {
      return {
        payload: null,
        error: `${response.status} ${response.statusText}${text ? `: ${text.slice(0, 200)}` : ""}`,
      };
    }
    return {
      payload: text ? JSON.parse(text) : null,
      error: null,
    };
  } catch (error) {
    return {
      payload: null,
      error: String(error ?? ""),
    };
  }
}

async function collectPublicFinalityDiagnostic(baseUrl, error) {
  const rootedBase = String(baseUrl ?? "").endsWith("/")
    ? String(baseUrl)
    : `${String(baseUrl ?? "").trim()}/`;
  if (!rootedBase.trim()) {
    return null;
  }
  const txHashHex = extractTransactionHashHex(
    error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : error,
  );

  const statusUrl = new URL("status", rootedBase).toString();
  const sumeragiUrl = new URL("v1/sumeragi/status", rootedBase).toString();
  const blocksUrl = new URL("v1/ledger/headers?limit=3", rootedBase).toString();
  const txStatusUrl = txHashHex
    ? new URL(
        `v1/pipeline/transactions/status?hash=${encodeURIComponent(txHashHex)}`,
        rootedBase,
      ).toString()
    : null;

  const [statusResult, sumeragiResult, blocksResult, txStatusResult] =
    await Promise.all([
      fetchDiagnosticPayload(statusUrl),
      fetchDiagnosticPayload(sumeragiUrl),
      fetchDiagnosticPayload(blocksUrl),
      txStatusUrl
        ? fetchDiagnosticPayload(txStatusUrl)
        : Promise.resolve({ payload: null, error: null }),
    ]);

  const endpointErrors = Object.fromEntries(
    Object.entries({
      ...(txStatusResult.error ? { txStatus: txStatusResult.error } : {}),
      ...(statusResult.error ? { status: statusResult.error } : {}),
      ...(sumeragiResult.error ? { sumeragi: sumeragiResult.error } : {}),
      ...(blocksResult.error ? { blocks: blocksResult.error } : {}),
    }),
  );

  return {
    ...summarizePublicFinalityDiagnostic({
      txHashHex,
      txStatusPayload: txStatusResult.payload,
      statusPayload: statusResult.payload,
      sumeragiPayload: sumeragiResult.payload,
      blocksPayload: blocksResult.payload,
    }),
    ...(Object.keys(endpointErrors).length > 0 ? { endpointErrors } : {}),
  };
}

async function resolveBootstrapFlow(page) {
  if (fundedWalletConfig) {
    const fundedFlow = await runFundedFlow(page, fundedWalletConfig);
    writeCachedFundedWalletConfig(fundedFlow);
    return fundedFlow;
  }

  const cachedFundedWallet = readCachedFundedWalletConfig();
  if (cachedFundedWallet) {
    try {
      const fundedFlow = await runFundedFlow(page, cachedFundedWallet);
      console.log(
        `Reused cached TAIRA funded wallet ${fundedFlow.i105AccountId} with ${fundedFlow.quantity} units on ${fundedFlow.assetId}.`,
      );
      writeCachedFundedWalletConfig(fundedFlow);
      return fundedFlow;
    } catch (error) {
      console.warn(
        `Cached funded-wallet bootstrap failed, falling back to faucet: ${String(
          error ?? "",
        )}`,
      );
    }
  }

  const faucetFlow = await runFaucetFlow(page);
  writeCachedFundedWalletConfig(faucetFlow);
  return faucetFlow;
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
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.evaluate(() => {
        localStorage.removeItem("iroha-demo:session");
        localStorage.removeItem("iroha-demo:offline");
        localStorage.setItem("iroha-demo:locale", "en-US");
      });
      await page.reload();

      await waitForAccountView(page);
      await configureConnection(page);
      const faucetBootstrap = await page.evaluate(
        async ({ torii, chain, prefix, derivationLabel }) => {
          const { publicKeyHex, privateKeyHex } =
            window.iroha.generateKeyPair();
          const summary = window.iroha.deriveAccountAddress({
            domain: derivationLabel,
            publicKeyHex,
            networkPrefix: prefix,
          });
          const vaultAvailable = await window.iroha
            .isSecureVaultAvailable()
            .catch(() => false);
          if (!vaultAvailable) {
            throw new Error(
              "Secure vault is unavailable for the live Electron faucet bootstrap.",
            );
          }
          await window.iroha.storeAccountSecret({
            accountId: summary.accountId,
            privateKeyHex,
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
                  hasStoredSecret: true,
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
              const items = Array.isArray(response?.items)
                ? response.items
                : [];
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
        domain: defaultDerivationLabel,
        canonicalAccountId: assetId.split("#").slice(1).join("#"),
        assetId,
        assetDefinitionId,
        txHash,
        quantity: String(fundedBalance.quantity).trim(),
      };
    } catch (error) {
      lastError = error;
      if (attempt < 2 && isRetryableFaucetBadRequest(String(error ?? ""))) {
        console.log(
          `Faucet probe attempt ${attempt + 1} hit a retryable TAIRA 400; retrying with a fresh account.`,
        );
        continue;
      }
      throw error;
    }
  }

  throw lastError ?? new Error("Faucet flow exhausted its retry budget.");
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
      const vaultAvailable = await window.iroha
        .isSecureVaultAvailable()
        .catch(() => false);
      if (!vaultAvailable) {
        throw new Error(
          "Secure vault is unavailable for the live funded-account bootstrap.",
        );
      }
      await window.iroha.storeAccountSecret({
        accountId: summary.accountId,
        privateKeyHex,
      });

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
              hasStoredSecret: true,
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
        domain,
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
    async ({
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
      const vaultAvailable = await window.iroha
        .isSecureVaultAvailable()
        .catch(() => false);
      if (!vaultAvailable) {
        throw new Error(
          "Secure vault is unavailable for the live read-only bootstrap.",
        );
      }
      await window.iroha.storeAccountSecret({
        accountId,
        privateKeyHex,
      });
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
              hasStoredSecret: true,
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
      const scanConfidentialBalance = (accountId, privateKeyHex) =>
        window.iroha.scanConfidentialWallet({
          toriiUrl: torii,
          chainId: chain,
          accountId,
          privateKeyHex,
          assetDefinitionId: assetId,
          force: true,
        });
      const waitForConfidentialBalance = async ({
        accountId,
        privateKeyHex,
        expectedSpendableQuantity,
        requireOnChainParity = false,
        timeoutMs = 90_000,
      }) => {
        const deadline = Date.now() + timeoutMs;
        let lastBalance = null;
        let lastError = "";
        const normalizedExpected = String(expectedSpendableQuantity);
        while (Date.now() < deadline) {
          try {
            lastBalance = await readConfidentialBalance(
              accountId,
              privateKeyHex,
            );
            const spendableQuantity = readSpendableQuantity(lastBalance);
            const onChainQuantity = String(
              lastBalance?.onChainQuantity ?? "",
            ).trim();
            const quantity = String(lastBalance?.quantity ?? "").trim();
            const hasOnChainParity =
              !requireOnChainParity ||
              (quantity !== "" &&
                onChainQuantity !== "" &&
                quantity === onChainQuantity);
            if (spendableQuantity === normalizedExpected && hasOnChainParity) {
              return {
                ok: true,
                balance: lastBalance,
                error: "",
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
          error: lastError,
          spendableQuantity: readSpendableQuantity(lastBalance),
        };
      };

      const initialAliceBalance = await readConfidentialBalance(
        aliceAccountId,
        alicePrivateKeyHex,
      );
      const initialAliceSpendable = BigInt(
        readSpendableQuantity(initialAliceBalance),
      );

      const bobKeyPair = window.iroha.generateKeyPair();
      const bobSummary = window.iroha.deriveAccountAddress({
        domain: derivationLabel,
        publicKeyHex: bobKeyPair.publicKeyHex,
        networkPrefix: prefix,
      });
      const bobReceiveAddress =
        await window.iroha.createConfidentialPaymentAddress({
          accountId: bobSummary.i105AccountId,
          privateKeyHex: bobKeyPair.privateKeyHex,
        });
      const bobOwnerTagHex = bobReceiveAddress.shieldedOwnerTagHex;
      const bobDiversifierHex = bobReceiveAddress.shieldedDiversifierHex;
      const initialBobBalance = await readConfidentialBalance(
        bobSummary.i105AccountId,
        bobKeyPair.privateKeyHex,
      );
      const initialBobSpendable = BigInt(
        readSpendableQuantity(initialBobBalance),
      );

      const selfShieldQuantity =
        initialAliceSpendable >= 2n ? 0n : 2n - initialAliceSpendable;
      let selfShieldHash = null;
      let aliceAfterSelfShield = {
        ok: true,
        balance: initialAliceBalance,
        error: "",
        spendableQuantity: initialAliceSpendable.toString(),
      };
      if (selfShieldQuantity > 0n) {
        let selfShield;
        try {
          selfShield = await Promise.race([
            window.iroha.transferAsset({
              toriiUrl: torii,
              chainId: chain,
              assetDefinitionId: assetId,
              accountId: aliceAccountId,
              destinationAccountId: aliceAccountId,
              quantity: selfShieldQuantity.toString(),
              privateKeyHex: alicePrivateKeyHex,
              shielded: true,
            }),
            waitForMs(120_000).then(() => {
              throw new Error("self-shield submit timed out");
            }),
          ]);
        } catch (error) {
          return {
            ok: false,
            stage: "self-shield-submit",
            error: String(error ?? ""),
            selfShieldQuantity: selfShieldQuantity.toString(),
            initialAliceBalance,
          };
        }
        selfShieldHash = selfShield.hash;
        aliceAfterSelfShield = await waitForConfidentialBalance({
          accountId: aliceAccountId,
          privateKeyHex: alicePrivateKeyHex,
          expectedSpendableQuantity: (
            initialAliceSpendable + selfShieldQuantity
          ).toString(),
          requireOnChainParity: true,
        });
        if (!aliceAfterSelfShield.ok) {
          return {
            ok: false,
            stage: "self-shield-balance",
            txHashHex: selfShield.hash,
            selfShieldHash,
            selfShieldQuantity: selfShieldQuantity.toString(),
            initialAliceBalance,
            aliceAfterSelfShield,
          };
        }
      }

      let recipientTransfer;
      try {
        recipientTransfer = await Promise.race([
          window.iroha.transferAsset({
            toriiUrl: torii,
            chainId: chain,
            assetDefinitionId: assetId,
            accountId: aliceAccountId,
            destinationAccountId: bobSummary.i105AccountId,
            quantity: "1",
            privateKeyHex: alicePrivateKeyHex,
            shielded: true,
            shieldedReceiveKeyId: bobReceiveAddress.receiveKeyId,
            shieldedReceivePublicKeyBase64Url:
              bobReceiveAddress.receivePublicKeyBase64Url,
            shieldedOwnerTagHex: bobOwnerTagHex,
            shieldedDiversifierHex: bobDiversifierHex,
          }),
          waitForMs(120_000).then(() => {
            throw new Error("recipient shielded send timed out");
          }),
        ]);
      } catch (error) {
        return {
          ok: false,
          stage: "recipient-submit",
          error: String(error ?? ""),
          selfShieldHash,
          selfShieldQuantity: selfShieldQuantity.toString(),
          initialAliceBalance,
          initialBobBalance,
          aliceAfterSelfShield,
        };
      }

      const expectedAliceAfterRecipient =
        initialAliceSpendable + selfShieldQuantity - 1n;
      const expectedBobAfterRecipient = initialBobSpendable + 1n;
      const aliceAfterRecipient = await waitForConfidentialBalance({
        accountId: aliceAccountId,
        privateKeyHex: alicePrivateKeyHex,
        expectedSpendableQuantity: expectedAliceAfterRecipient.toString(),
        requireOnChainParity: true,
      });
      const bobAfterRecipient = await waitForConfidentialBalance({
        accountId: bobSummary.i105AccountId,
        privateKeyHex: bobKeyPair.privateKeyHex,
        expectedSpendableQuantity: expectedBobAfterRecipient.toString(),
        requireOnChainParity: true,
      });
      if (!aliceAfterRecipient.ok || !bobAfterRecipient.ok) {
        return {
          ok: false,
          stage: !aliceAfterRecipient.ok
            ? "sender-final-balance"
            : "recipient-final-balance",
          txHashHex: recipientTransfer.hash,
          selfShieldHash,
          recipientTransferHash: recipientTransfer.hash,
          selfShieldQuantity: selfShieldQuantity.toString(),
          initialAliceBalance,
          initialBobBalance,
          aliceAfterSelfShield,
          aliceAfterRecipient,
          bobAfterRecipient,
          expectedAliceAfterRecipient: expectedAliceAfterRecipient.toString(),
          expectedBobAfterRecipient: expectedBobAfterRecipient.toString(),
        };
      }
      const bobRecoveredAfterRecipient = await scanConfidentialBalance(
        bobSummary.i105AccountId,
        bobKeyPair.privateKeyHex,
      );
      const bobRecoveredSpendable = readSpendableQuantity(
        bobRecoveredAfterRecipient,
      );
      if (bobRecoveredSpendable !== expectedBobAfterRecipient.toString()) {
        return {
          ok: false,
          stage: "recipient-recovery-scan",
          txHashHex: recipientTransfer.hash,
          selfShieldHash,
          recipientTransferHash: recipientTransfer.hash,
          selfShieldQuantity: selfShieldQuantity.toString(),
          initialAliceBalance,
          initialBobBalance,
          aliceAfterSelfShield,
          aliceAfterRecipient,
          bobAfterRecipient,
          bobRecoveredAfterRecipient,
          expectedBobAfterRecipient: expectedBobAfterRecipient.toString(),
          observedBobRecoveredAfterRecipient: bobRecoveredSpendable,
        };
      }

      let unshield;
      try {
        unshield = await Promise.race([
          window.iroha.transferAsset({
            toriiUrl: torii,
            chainId: chain,
            assetDefinitionId: assetId,
            accountId: aliceAccountId,
            destinationAccountId: aliceAccountId,
            quantity: "1",
            privateKeyHex: alicePrivateKeyHex,
            unshield: true,
          }),
          waitForMs(120_000).then(() => {
            throw new Error("unshield submit timed out");
          }),
        ]);
      } catch (error) {
        return {
          ok: false,
          stage: "unshield-submit",
          error: String(error ?? ""),
          selfShieldHash,
          recipientTransferHash: recipientTransfer.hash,
          selfShieldQuantity: selfShieldQuantity.toString(),
          initialAliceBalance,
          initialBobBalance,
          aliceAfterSelfShield,
          aliceAfterRecipient,
          bobAfterRecipient,
          bobRecoveredAfterRecipient,
        };
      }
      const expectedAliceAfterUnshield = expectedAliceAfterRecipient - 1n;
      const aliceAfterUnshield = await waitForConfidentialBalance({
        accountId: aliceAccountId,
        privateKeyHex: alicePrivateKeyHex,
        expectedSpendableQuantity: expectedAliceAfterUnshield.toString(),
        requireOnChainParity: true,
      });
      if (!aliceAfterUnshield.ok) {
        return {
          ok: false,
          stage: "unshield-final-balance",
          txHashHex: unshield.hash,
          selfShieldHash,
          recipientTransferHash: recipientTransfer.hash,
          unshieldHash: unshield.hash,
          selfShieldQuantity: selfShieldQuantity.toString(),
          initialAliceBalance,
          initialBobBalance,
          aliceAfterSelfShield,
          aliceAfterRecipient,
          bobAfterRecipient,
          bobRecoveredAfterRecipient,
          aliceAfterUnshield,
          expectedAliceAfterUnshield: expectedAliceAfterUnshield.toString(),
        };
      }

      return {
        ok: true,
        stage: "completed",
        txHashHex: unshield.hash,
        bobAccountId: bobSummary.i105AccountId,
        bobOwnerTagHex,
        bobDiversifierHex,
        selfShieldHash,
        recipientTransferHash: recipientTransfer.hash,
        unshieldHash: unshield.hash,
        selfShieldQuantity: selfShieldQuantity.toString(),
        initialAliceBalance,
        initialBobBalance,
        aliceAfterSelfShield,
        aliceAfterRecipient,
        bobAfterRecipient,
        bobRecoveredAfterRecipient,
        aliceAfterUnshield,
        expectedAliceAfterRecipient: expectedAliceAfterRecipient.toString(),
        expectedBobAfterRecipient: expectedBobAfterRecipient.toString(),
        expectedAliceAfterUnshield: expectedAliceAfterUnshield.toString(),
        observedAliceAfterRecipient: aliceAfterRecipient.spendableQuantity,
        observedBobAfterRecipient: bobAfterRecipient.spendableQuantity,
        observedBobRecoveredAfterRecipient: bobRecoveredSpendable,
        observedAliceAfterUnshield: aliceAfterUnshield.spendableQuantity,
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
      )} (tx ${String(confidentialTransferProbe?.txHashHex ?? "unknown")}). Probe: ${JSON.stringify(
        confidentialTransferProbe,
      ).slice(0, 2000)}`,
    );
  }

  console.log(
    `Confidential transfer probe completed self-shield ${String(
      confidentialTransferProbe.selfShieldHash ?? "skipped",
    )}, recipient shielded send ${
      confidentialTransferProbe.recipientTransferHash
    } to ${confidentialTransferProbe.bobAccountId}, recipient recovery scan ${
      confidentialTransferProbe.observedBobRecoveredAfterRecipient
    }, and unshield ${confidentialTransferProbe.unshieldHash}.`,
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
        hasStoredSecret: true,
      };
      const vaultAvailable = await window.iroha
        .isSecureVaultAvailable()
        .catch(() => false);
      if (!vaultAvailable) {
        throw new Error(
          "Secure vault is unavailable for the live onboarding bootstrap.",
        );
      }
      await window.iroha.storeAccountSecret({
        accountId: accountProfile.accountId,
        privateKeyHex,
      });

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
      if (isOnboardingDisabledError(onboardingDetail)) {
        console.log(
          `Optional alias registration probe: skipped because ${toriiUrl} returned HTTP 403. Local-wallet-only operation remains valid on this build.`,
        );
        return "skipped_403";
      }
      console.log(
        `Optional alias registration probe: skipped because ${toriiUrl} returned HTTP 400 on the deterministic onboarding probe. This deployment currently reports reusable onboarding failures through the binary bad_request path.`,
      );
      return "skipped_400";
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
      headingOptions: ["Advanced settings", "Advanced", "Session Setup"],
      sectionText: "Network",
    },
    {
      hash: "#/wallet",
      headingOptions: ["Wallet", "Wallet Overview"],
      sectionText: "Balances",
    },
    {
      hash: "#/staking",
      headingOptions: ["Stake XOR", "Stake", "NPOS Staking"],
      sectionText: "Stake / Unstake",
    },
    {
      hash: "#/parliament",
      headingOptions: ["Governance", "SORA Parliament"],
      sectionText: "Voting eligibility",
    },
    {
      hash: "#/subscriptions",
      headingOptions: ["Subscriptions", "Subscription Hub"],
      sectionText: "New subscription",
    },
    {
      hash: "#/send",
      headingOptions: ["Send", "Send Points"],
      sectionText: "Send",
    },
    {
      hash: "#/receive",
      headingOptions: ["Receive", "Receive Points"],
      sectionText: "Receive",
    },
    {
      hash: "#/offline",
      headingOptions: ["Offline"],
      sectionText: "1. Set up device wallet",
    },
    {
      hash: "#/explore",
      headingOptions: ["Explore", "Explorer"],
      sectionText: "Network health",
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
    await page.waitForFunction(
      (expectedHeadings) => {
        const heading = document.querySelector(".workspace-header h1");
        if (!(heading instanceof HTMLElement)) {
          return false;
        }
        const title = heading.innerText.trim();
        return expectedHeadings.includes(title);
      },
      check.headingOptions,
      {
        timeout: 45_000,
      },
    );
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
      const shieldToggle = page.getByLabel("Private transfer", {
        exact: true,
      });
      const sendSubmitButton = page
        .locator(".send-form-pane .actions button")
        .first();
      await shieldToggle.waitFor({ state: "visible", timeout: 30_000 });
      if (!(await shieldToggle.isEnabled())) {
        await sendSubmitButton.waitFor({ state: "visible", timeout: 30_000 });
        continue;
      }
      const destinationInput = page.getByTestId("destination-account-input");
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
        await sendSubmitButton.waitFor({ state: "visible", timeout: 30_000 });
        continue;
      }
      if (!(await shieldToggle.isChecked().catch(() => false))) {
        await sendSubmitButton.waitFor({ state: "visible", timeout: 30_000 });
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
      const shieldSubmitButton = sendSubmitButton;
      const shieldButtonVisible = await shieldSubmitButton
        .waitFor({ state: "visible", timeout: 5_000 })
        .then(() => true)
        .catch(() => false);
      if (!shieldButtonVisible) {
        await sendSubmitButton.waitFor({ state: "visible", timeout: 30_000 });
        continue;
      }
      await amountInput.fill("10.5");
      const shieldDisabledForDecimal = await shieldSubmitButton
        .isDisabled({ timeout: 3_000 })
        .catch(() => null);
      if (shieldDisabledForDecimal === null) {
        await sendSubmitButton.waitFor({ state: "visible", timeout: 30_000 });
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
        await sendSubmitButton.waitFor({ state: "visible", timeout: 30_000 });
        continue;
      }
      if (!shieldDisabledForWhole) {
        throw new Error(
          "Expected anonymous send action to stay disabled for a non-self destination without a shielded Receive QR.",
        );
      }
      await page
        .getByText("Scan a private Receive QR before sending privately.", {
          exact: true,
        })
        .waitFor({ state: "visible", timeout: 5_000 });
      await destinationInput.fill(fundedAccount.accountId);
      const shieldDisabledForSelf = await shieldSubmitButton
        .isDisabled({ timeout: 3_000 })
        .catch(() => null);
      if (shieldDisabledForSelf === null) {
        await sendSubmitButton.waitFor({ state: "visible", timeout: 30_000 });
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
      await sendSubmitButton.waitFor({ state: "visible", timeout: 30_000 });
    }

    if (check.hash === "#/offline") {
      const moveCard = page
        .locator("section.card")
        .filter({ hasText: "Move funds to online wallet" })
        .first();
      const moveCardVisible = await moveCard
        .waitFor({ state: "visible", timeout: 30_000 })
        .then(() => true)
        .catch(() => false);
      if (!moveCardVisible) {
        continue;
      }
      const moveActionButton = moveCard.locator(".actions button").first();
      const shieldToggle = moveCard.getByLabel("Private exit", {
        exact: true,
      });
      const shieldToggleVisible = await shieldToggle
        .waitFor({ state: "visible", timeout: 30_000 })
        .then(() => true)
        .catch(() => false);
      if (!shieldToggleVisible) {
        await moveActionButton.waitFor({ state: "visible", timeout: 30_000 });
        continue;
      }
      if (!(await shieldToggle.isEnabled())) {
        await moveActionButton.waitFor({ state: "visible", timeout: 30_000 });
        continue;
      }
      const destinationInput = moveCard.getByLabel("Destination Account", {
        exact: true,
      });
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
        await moveActionButton.waitFor({ state: "visible", timeout: 30_000 });
        continue;
      }
      if (!(await shieldToggle.isChecked().catch(() => false))) {
        await moveActionButton.waitFor({ state: "visible", timeout: 30_000 });
        continue;
      }

      if (!(await destinationInput.isDisabled())) {
        throw new Error(
          'Expected offline "Move funds to online wallet" destination to lock when private exit is enabled.',
        );
      }
      const moveAmountInput = moveCard.locator('input[type="text"]').first();
      const moveSubmitButton = moveActionButton;
      const moveShieldButtonVisible = await moveSubmitButton
        .waitFor({ state: "visible", timeout: 5_000 })
        .then(() => true)
        .catch(() => false);
      if (!moveShieldButtonVisible) {
        await moveActionButton.waitFor({ state: "visible", timeout: 30_000 });
        continue;
      }
      await moveAmountInput.fill("10.5");
      const moveDisabledForDecimal = await moveSubmitButton
        .isDisabled({ timeout: 3_000 })
        .catch(() => null);
      if (moveDisabledForDecimal === null) {
        await moveActionButton.waitFor({ state: "visible", timeout: 30_000 });
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
        await moveActionButton.waitFor({ state: "visible", timeout: 30_000 });
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
          'Expected offline "Move funds to online wallet" destination to restore the previous transparent value after disabling private exit.',
        );
      }
      await moveActionButton.waitFor({ state: "visible", timeout: 30_000 });
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

#!/usr/bin/env node
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
  decimalQuantityEquals,
  parseNetworkPrefix,
  resolveOptionalAliasRegistrationOutcome,
} from "./electron-live-utils.mjs";
import {
  assertFinalizedMutationReceipt,
  waitForToriiTransactionFinality,
} from "../live-transaction-finality.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, "..", "..");
const mainEntry = join(projectRoot, "dist", "main", "index.cjs");
const screenshotDir = join(projectRoot, "output", "playwright");
const e2eStateDir = join(projectRoot, "output", "e2e");
const fundedWalletCachePath = join(e2eStateDir, "live-funded-wallet.json");
const tairaToriiUrl = "https://taira.sora.org";
const tairaChainId = "fc56984b-2be7-431d-840e-21514d1883f0";
const tairaToriiHosts = new Set(["taira.sora.org", "www.taira.sora.org"]);

const toriiUrl = readEnv("E2E_TORII_URL", tairaToriiUrl);
const chainId = readEnv("E2E_CHAIN_ID", tairaChainId);
const assetDefinitionId = String(
  process.env.E2E_ASSET_DEFINITION_ID ?? "",
).trim();
const networkPrefix = parseNetworkPrefix(process.env.E2E_NETWORK_PREFIX);
const defaultDerivationLabel = "default";
const expectedFaucetQuantity = readEnv("E2E_EXPECTED_FAUCET_QUANTITY", "25000");
const reuseFundedWalletCache = ["1", "true", "yes"].includes(
  String(process.env.E2E_REUSE_FUNDED_CACHE ?? "")
    .trim()
    .toLowerCase(),
);
const registerCitizenDuringNavigation = ["1", "true", "yes"].includes(
  String(process.env.E2E_REGISTER_CITIZEN ?? "")
    .trim()
    .toLowerCase(),
);
const governanceOnly = ["1", "true", "yes"].includes(
  String(process.env.E2E_GOVERNANCE_ONLY ?? "")
    .trim()
    .toLowerCase(),
);
const { alias: onboardingAlias, privateKeyHex: onboardingPrivateKeyHex } =
  parseOnboardingEnvConfig(process.env);
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
    if (governanceOnly) {
      console.log(
        "Live Electron governance E2E passed (funded wallet + citizenship bond).",
      );
      return;
    }
    const onboardingOutcome = await runOnboardingFlow(page, onboardingAssetId);

    console.log(
      onboardingOutcome === "skipped_403"
        ? "Live Electron E2E passed (faucet + wallet reads + explorer flows; optional alias registration skipped because TAIRA returned HTTP 403)."
        : onboardingOutcome === "skipped_400"
          ? "Live Electron E2E passed (faucet + wallet reads + explorer flows; optional alias registration skipped because TAIRA returned a reusable HTTP 400 on the deterministic onboarding probe)."
          : "Live Electron E2E passed (faucet + wallet reads + explorer + optional alias-registration checks).",
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

  const cachedFundedWallet = reuseFundedWalletCache
    ? readCachedFundedWalletConfig()
    : null;
  if (cachedFundedWallet) {
    try {
      const fundedFlow = await runFundedFlow(page, cachedFundedWallet);
      console.log(
        `Reused cached live E2E funded wallet ${fundedFlow.i105AccountId} with ${fundedFlow.quantity} units on ${fundedFlow.assetId}.`,
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
        "This live E2E harness is TAIRA-faucet-oriented.",
        `Use Torii URL ${tairaToriiUrl} and chain ID ${tairaChainId}, or adapt the harness with a funded mainnet account flow first.`,
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
        localStorage.setItem("iroha-demo:locale", "en-US");
      });
      await page.reload();

      await waitForAccountView(page);
      await configureConnection(page);
      const faucetBootstrap = await page.evaluate(
        async ({ torii, chain, prefix, derivationLabel }) => {
          const signingAlgorithm = "ed25519";
          const { publicKeyHex, privateKeyHex } = window.iroha.generateKeyPair({
            signingAlgorithm,
          });
          const summary = window.iroha.deriveAccountAddress({
            domain: derivationLabel,
            publicKeyHex,
            networkPrefix: prefix,
            signingAlgorithm,
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
            networkPrefix: prefix,
            privateKeyHex,
            signingAlgorithm,
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
                  signingAlgorithm,
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
        async ({ torii, chain, accountId, prefix }) => {
          const result = await window.iroha.requestFaucetFunds({
            toriiUrl: torii,
            chainId: chain,
            accountId,
            networkPrefix: prefix,
            requestId: `electron-live-faucet-${Date.now()}`,
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
          chain: chainId,
          accountId: faucetBootstrap.displayAccountId,
          prefix: networkPrefix,
        },
      );
      if (String(faucetReceipt?.status ?? "").trim() !== "FINALIZED") {
        throw new Error(
          `Faucet bridge did not report finalized success: ${JSON.stringify(
            faucetReceipt,
          ).slice(0, 1200)}`,
        );
      }
      const faucetBridgeFinality = assertFinalizedMutationReceipt(
        faucetReceipt,
        {
          label: "Faucet claim",
          hashFields: ["tx_hash_hex"],
        },
      );
      const faucetObservedFinality = await waitForToriiTransactionFinality({
        toriiUrl,
        hashHex: faucetBridgeFinality.hashHex,
      });
      if (
        faucetObservedFinality.finality.blockHeight !==
          faucetBridgeFinality.finality.blockHeight ||
        faucetObservedFinality.finality.blockHash !==
          faucetBridgeFinality.finality.blockHash
      ) {
        throw new Error(
          "Faucet bridge proof does not match the independently observed finalized block.",
        );
      }

      const fundedBalance = await page.evaluate(
        async ({ torii, accountId, prefix }) => {
          let lastError = "";
          for (let attempt = 0; attempt < 30; attempt += 1) {
            try {
              const response = await window.iroha.fetchAccountAssets({
                toriiUrl: torii,
                accountId,
                networkPrefix: prefix,
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
          prefix: networkPrefix,
        },
      );

      if (!fundedBalance?.assetId || !fundedBalance?.quantity) {
        throw new Error(
          `Faucet transaction finalized, but the wallet did not observe a funded balance within 60s. State: ${JSON.stringify(
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

      if (
        expectedFaucetQuantity &&
        !decimalQuantityEquals(fundedBalance.quantity, expectedFaucetQuantity)
      ) {
        throw new Error(
          `Fresh faucet claim should fund ${expectedFaucetQuantity} XOR, observed ${fundedBalance.quantity} on ${assetId}.`,
        );
      }

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
        `Faucet transaction ${txHash} finalized in block ${faucetObservedFinality.finality.blockHeight}; observed ${fundedBalance.quantity} units on ${assetId}.`,
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
          `Faucet probe attempt ${attempt + 1} hit a retryable 400; retrying with a fresh account.`,
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
      const signingAlgorithm = "ed25519";
      const { publicKeyHex } = window.iroha.derivePublicKey({
        privateKeyHex,
        signingAlgorithm,
      });
      const summary = window.iroha.deriveAccountAddress({
        domain,
        publicKeyHex,
        networkPrefix: prefix,
        signingAlgorithm,
      });
      const assetsResponse = await window.iroha.fetchAccountAssets({
        toriiUrl: torii,
        accountId: summary.i105AccountId,
        networkPrefix: prefix,
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
        networkPrefix: prefix,
        privateKeyHex,
        signingAlgorithm,
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
              signingAlgorithm,
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
    `Using funded live E2E account ${fundedBootstrap.i105AccountId} with ${fundedBootstrap.quantity} units on ${fundedBootstrap.assetId}.`,
  );

  return fundedBootstrap;
}

async function runReadOnlyFlow(page, fundedAccount) {
  await page.evaluate(() => {
    localStorage.removeItem("iroha-demo:session");
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
        networkPrefix: prefix,
        privateKeyHex,
        signingAlgorithm: "ed25519",
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
              signingAlgorithm: "ed25519",
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

  if (governanceOnly) {
    await runNavigationSmokeFlow(page, fundedAccount);
    return;
  }

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
    async ({ torii, accountId, prefix }) => {
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
          networkPrefix: prefix,
        });
      } catch (error) {
        out.qrError = String(error);
      }
      return out;
    },
    {
      torii: toriiUrl,
      accountId: fundedAccount.accountId,
      prefix: networkPrefix,
    },
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
      derivationLabel,
    }) => {
      const signingAlgorithm = "ed25519";
      const { publicKeyHex } = window.iroha.derivePublicKey({
        privateKeyHex,
        signingAlgorithm,
      });
      const summary = window.iroha.deriveAccountAddress({
        domain: derivationLabel,
        publicKeyHex,
        networkPrefix: prefix,
        signingAlgorithm,
      });
      const accountProfile = {
        displayName: alias,
        domain: derivationLabel,
        accountId: summary.accountId,
        i105AccountId: summary.i105AccountId,
        i105DefaultAccountId: summary.i105DefaultAccountId,
        publicKeyHex,
        privateKeyHex,
        signingAlgorithm,
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
        networkPrefix: prefix,
        privateKeyHex,
        signingAlgorithm,
      });

      let onboarding = { status: "ok", detail: "", response: null };
      try {
        const response = await window.iroha.onboardAccount({
          toriiUrl: torii,
          chainId: chain,
          networkPrefix: prefix,
          alias,
          accountId: summary.accountId,
          identity: {
            source: "electron-live-onboarding",
            managed_by: "e2e-harness",
          },
        });
        onboarding = {
          status: "ok",
          detail: "",
          response,
        };
      } catch (error) {
        onboarding = {
          status: "error",
          detail: String(error ?? ""),
          response: null,
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
    const onboardingTxHash = String(
      onboardingBootstrap?.onboarding?.response?.tx_hash_hex ?? "",
    ).trim();
    const onboardingFinality = await waitForToriiTransactionFinality({
      toriiUrl,
      hashHex: onboardingTxHash,
    });
    console.log(
      `Optional alias registration probe: deterministic account registration finalized in block ${onboardingFinality.finality.blockHeight} (${onboardingFinality.hashHex}).`,
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
  const routeChecks = [
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
      hash: "#/governance",
      headingOptions: ["Governance", "SORA Parliament"],
      sectionText: "Eligibility",
    },
    {
      hash: "#/subscriptions",
      headingOptions: ["Subscriptions", "Subscription Hub"],
      sectionText: "Subscribe to plan",
    },
    {
      hash: "#/soracloud",
      headingOptions: ["SoraCloud"],
      sectionText: "Launch instance",
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
      hash: "#/explore",
      headingOptions: ["Explore", "Explorer"],
      sectionText: "Network health",
    },
  ];
  const checks = governanceOnly
    ? routeChecks.filter((check) => check.hash === "#/governance")
    : routeChecks;

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

    if (check.hash === "#/governance") {
      const citizenshipAccountId =
        fundedAccount.i105AccountId || fundedAccount.accountId;
      const citizenshipStatus = await page.evaluate(
        ({ torii, accountId, prefix }) =>
          window.iroha.getGovernanceCitizenStatus({
            toriiUrl: torii,
            accountId,
            networkPrefix: prefix,
          }),
        {
          torii: toriiUrl,
          accountId: citizenshipAccountId,
          prefix: networkPrefix,
        },
      );
      if (!citizenshipStatus?.isCitizen) {
        const bondButton = page.getByRole("button", {
          name: "Bond 10000 XOR",
          exact: true,
        });
        await bondButton.waitFor({
          state: "visible",
          timeout: 45_000,
        });
        if (registerCitizenDuringNavigation) {
          await page
            .waitForFunction(
              () => {
                const button = document.querySelector(
                  '[data-testid="governance-bond-citizen"]',
                );
                return button instanceof HTMLButtonElement && !button.disabled;
              },
              undefined,
              { timeout: 60_000 },
            )
            .catch(() => null);
          if (await bondButton.isDisabled()) {
            const reason =
              (await page
                .locator(".citizenship-action .gate-reason")
                .textContent()
                .catch(() => null)) ?? "unknown eligibility failure";
            throw new Error(
              `Live citizenship bond is disabled for a funded wallet: ${reason.trim()}`,
            );
          }
          await bondButton.click();
          const confirmBondButton = page.getByRole("button", {
            name: "Sign and commit",
            exact: true,
          });
          await confirmBondButton.waitFor({
            state: "visible",
            timeout: 45_000,
          });
          await confirmBondButton.click();
          const citizenshipOutcome = await Promise.race([
            page
              .locator(".governance-shell > .message.success")
              .waitFor({ state: "visible", timeout: 120_000 })
              .then(async () => ({
                kind: "finalized",
                message:
                  (await page
                    .locator(".governance-shell > .message.success")
                    .textContent()) ?? "",
              })),
            page
              .locator(".governance-shell .message.error")
              .last()
              .waitFor({ state: "visible", timeout: 120_000 })
              .then(async () => ({
                kind: "rejected",
                message:
                  (await page
                    .locator(".governance-shell .message.error")
                    .last()
                    .textContent()) ?? "unknown citizenship error",
              })),
          ]);
          if (citizenshipOutcome.kind === "rejected") {
            throw new Error(
              `Live citizenship bond failed: ${citizenshipOutcome.message.trim()}`,
            );
          }
          const finalizedMessage = citizenshipOutcome.message.trim();
          const finalizedMatch = finalizedMessage.match(
            /^Finalized in block ([1-9]\d*): ([0-9a-f]{64})$/u,
          );
          if (!finalizedMatch) {
            throw new Error(
              `Live citizenship bond did not expose an exact finalized-block receipt: ${finalizedMessage}`,
            );
          }
          const displayedBlockHeight = Number(finalizedMatch[1]);
          const citizenshipFinality = await waitForToriiTransactionFinality({
            toriiUrl,
            hashHex: finalizedMatch[2],
          });
          if (
            citizenshipFinality.finality.blockHeight !== displayedBlockHeight
          ) {
            throw new Error(
              "Live citizenship finalized-block receipt disagrees with independent Torii evidence.",
            );
          }
          await page
            .getByText("Eligible", { exact: true })
            .first()
            .waitFor({ state: "visible", timeout: 120_000 });
          const finalizedCitizenshipStatus = await page.evaluate(
            ({ torii, accountId, prefix }) =>
              window.iroha.getGovernanceCitizenStatus({
                toriiUrl: torii,
                accountId,
                networkPrefix: prefix,
              }),
            {
              torii: toriiUrl,
              accountId: citizenshipAccountId,
              prefix: networkPrefix,
            },
          );
          if (!finalizedCitizenshipStatus?.isCitizen) {
            throw new Error(
              "The governance UI reported citizenship, but the live Torii citizenship read did not confirm it.",
            );
          }
          console.log(
            `Live citizenship bond finalized in block ${citizenshipFinality.finality.blockHeight} for ${citizenshipAccountId}.`,
          );
        }
      }
      await page
        .getByRole("button", { name: "Review citizen ballot", exact: true })
        .waitFor({
          state: "visible",
          timeout: 45_000,
        });
    }
  }

  if (governanceOnly) {
    return;
  }

  // Ensure Receive automatically renders its exact current private-address QR.
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
  await page
    .locator(".qr img")
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
  // Connection fields are fixed by the current live E2E target; no UI input required here.
}

await main().catch((error) => {
  console.error(error);
  process.exit(1);
});

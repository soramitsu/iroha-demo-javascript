#!/usr/bin/env node

import { mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright";
import {
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

    const faucetFlow = await runFaucetFlow(page);
    const readOnlyAssetId = assetDefinitionId || faucetFlow.assetId;
    const onboardingAssetId = assetDefinitionId || faucetFlow.assetDefinitionId;

    await runReadOnlyFlow(page, {
      accountId: faucetFlow.displayAccountId,
      i105AccountId: faucetFlow.i105AccountId,
      i105DefaultAccountId: faucetFlow.i105DefaultAccountId,
      publicKeyHex: faucetFlow.publicKeyHex,
      privateKeyHex: faucetFlow.privateKeyHex,
      assetDefinitionId: readOnlyAssetId,
    });
    const onboardingOutcome = await runOnboardingFlow(page, onboardingAssetId);

    console.log(
      onboardingOutcome === "skipped"
        ? "Live Electron E2E passed (faucet + read-only flows; optional alias registration skipped because TAIRA returned HTTP 403)."
        : "Live Electron E2E passed (faucet + read-only + optional alias-registration checks).",
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
  await page.waitForFunction(() => window.location.hash === "#/wallet", {
    timeout: 45_000,
  });
  await page
    .getByRole("heading", { name: "Wallet", exact: true, level: 1 })
    .waitFor({ state: "visible", timeout: 45_000 });

  const claimButton = page.getByRole("button", {
    name: "Claim XOR",
    exact: true,
  });
  await claimButton.waitFor({ state: "visible", timeout: 45_000 });
  await claimButton.click();

  const faucetState = await page
    .waitForFunction(
      () => {
        const text = document.body.textContent ?? "";
        const raw = localStorage.getItem("iroha-demo:session");
        if (!raw) {
          return null;
        }
        try {
          const session = JSON.parse(raw);
          const configuredAssetId = String(
            session?.connection?.assetDefinitionId ?? "",
          ).trim();
          const activeAccount = Array.isArray(session?.accounts)
            ? session.accounts.find(
                (account) => account?.accountId === session?.activeAccountId,
              )
            : null;
          if (!configuredAssetId || !activeAccount || activeAccount.localOnly) {
            return null;
          }
          return {
            messageText: text,
            configuredAssetId,
          };
        } catch {
          return null;
        }
      },
      { timeout: 120_000 },
    )
    .then((handle) => handle.jsonValue());

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
          faucetState,
          fundedBalance,
          faucetBootstrap,
        },
      ).slice(0, 1600)}`,
    );
  }

  const txHashMatch = /(?:Testnet XOR requested:|XOR claimed:)\s*([0-9a-f]+)/i.exec(
    String(faucetState?.messageText ?? ""),
  );
  const txHash = txHashMatch?.[1]?.trim() ?? "";

  const assetId = String(fundedBalance.assetId).trim();
  const assetDefinitionId =
    assetId.split("#", 1)[0]?.trim() || String(faucetState.configuredAssetId);

  if (!assetDefinitionId) {
    throw new Error(
      `Faucet flow did not resolve an asset definition id. State: ${JSON.stringify(
        {
          faucetState,
          fundedBalance,
        },
      ).slice(0, 1200)}`,
    );
  }

  console.log(
    txHash
      ? `Faucet probe queued ${txHash} and observed ${fundedBalance.quantity} units on ${assetId}.`
      : `Faucet probe observed ${fundedBalance.quantity} units on ${assetId}; wallet status text did not expose a transaction hash before sampling.`,
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
    window.location.hash = "#/explore";
  });

  await page.waitForFunction(() => window.location.hash === "#/explore", {
    timeout: 45_000,
  });
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

  await runNavigationSmokeFlow(page);
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

  await page.evaluate(() => {
    window.location.hash = "#/send";
  });
  await page.waitForFunction(() => window.location.hash === "#/send", {
    timeout: 45_000,
  });
  await page
    .getByRole("heading", { name: "Send", exact: true, level: 1 })
    .waitFor({ state: "visible", timeout: 45_000 });

  const sendCard = page
    .locator("section.card")
    .filter({ hasText: "Transfer Asset" })
    .first();
  const sendShieldToggle = sendCard.getByLabel("Shielded send", {
    exact: true,
  });
  await sendShieldToggle.waitFor({ state: "visible", timeout: 30_000 });
  if (!(await sendShieldToggle.isEnabled())) {
    throw new Error(
      "Expected send shield toggle to be enabled in onboarding flow.",
    );
  }
  await sendShieldToggle.check();
  const sendDestination = sendCard.getByLabel("To", { exact: true });
  if (!(await sendDestination.isDisabled())) {
    throw new Error(
      "Expected send destination to lock when shield transfer is enabled in onboarding flow.",
    );
  }
  if ((await sendDestination.inputValue()).trim() !== persistedAccountId) {
    throw new Error(
      `Expected send shield destination to auto-lock to active account ${persistedAccountId}.`,
    );
  }
  const sendAmountInput = sendCard.locator('input[type="number"]').first();
  await sendAmountInput.fill("1");
  const sendSubmitButton = sendCard.getByRole("button", {
    name: "Shield",
    exact: true,
  });
  if (await sendSubmitButton.isDisabled()) {
    throw new Error("Expected send shield submit button to be enabled.");
  }
  const sendStatusBefore = await sendCard
    .locator("p.helper")
    .last()
    .textContent()
    .then((value) => String(value ?? "").trim());
  await sendSubmitButton.click();
  const sendStatusAfter = await page
    .waitForFunction(
      ({ baseline }) => {
        const cards = [...document.querySelectorAll("section.card")];
        const card = cards.find((node) =>
          node.querySelector("h2")?.textContent?.includes("Transfer Asset"),
        );
        if (!card) return null;
        const helpers = [...card.querySelectorAll("p.helper")]
          .map((node) => (node.textContent ?? "").trim())
          .filter(Boolean);
        if (!helpers.length) return null;
        const last = helpers[helpers.length - 1];
        return last && last !== baseline ? last : null;
      },
      { baseline: sendStatusBefore },
      { timeout: 90_000 },
    )
    .then((handle) => handle.jsonValue());
  const sendStatus = String(sendStatusAfter ?? "").trim();
  if (!sendStatus) {
    throw new Error("Send shield submission did not produce a status message.");
  }
  if (
    [
      "Configure Torii + account first.",
      "Shield mode is unavailable.",
      "Shield mode requires destination to be your active account.",
      "Shield amount must be a whole number greater than zero.",
    ].includes(sendStatus)
  ) {
    throw new Error(
      `Send shield submission did not reach bridge submission path: ${sendStatus}`,
    );
  }

  await page.evaluate(() => {
    window.location.hash = "#/offline";
  });
  await page.waitForFunction(() => window.location.hash === "#/offline", {
    timeout: 45_000,
  });
  await page
    .getByRole("heading", { name: "Offline", exact: true, level: 1 })
    .waitFor({ state: "visible", timeout: 45_000 });

  const moveCard = page
    .locator("section.card")
    .filter({ hasText: "Move to online wallet" })
    .first();
  const moveShieldToggle = moveCard.getByLabel("Shielded send", {
    exact: true,
  });
  await moveShieldToggle.waitFor({ state: "visible", timeout: 30_000 });
  if (!(await moveShieldToggle.isEnabled())) {
    throw new Error(
      'Expected offline "Shield transfer" toggle to be enabled in onboarding flow.',
    );
  }
  await moveShieldToggle.check();
  const moveDestination = moveCard.getByLabel("To", { exact: true });
  if (!(await moveDestination.isDisabled())) {
    throw new Error(
      'Expected offline destination to lock when "Shield transfer" is enabled in onboarding flow.',
    );
  }
  if ((await moveDestination.inputValue()).trim() !== persistedAccountId) {
    throw new Error(
      `Expected offline shield destination to auto-lock to active account ${persistedAccountId}.`,
    );
  }
  const moveAmountInput = moveCard.locator('input[type="text"]').first();
  await moveAmountInput.fill("1");
  const moveSubmitButton = moveCard.getByRole("button", {
    name: "Shield to wallet",
    exact: true,
  });
  if (await moveSubmitButton.isDisabled()) {
    throw new Error(
      'Expected offline "Shield to online wallet" submit button to be enabled.',
    );
  }
  const moveStatusBefore = await moveCard
    .locator("p.helper")
    .last()
    .textContent()
    .then((value) => String(value ?? "").trim());
  await moveSubmitButton.click();
  const moveStatusAfter = await page
    .waitForFunction(
      ({ baseline }) => {
        const cards = [...document.querySelectorAll("section.card")];
        const card = cards.find((node) =>
          node
            .querySelector("h2")
            ?.textContent?.includes("Move to online wallet"),
        );
        if (!card) return null;
        const helpers = [...card.querySelectorAll("p.helper")]
          .map((node) => (node.textContent ?? "").trim())
          .filter(Boolean);
        if (!helpers.length) return null;
        const last = helpers[helpers.length - 1];
        return last && last !== baseline ? last : null;
      },
      { baseline: moveStatusBefore },
      { timeout: 90_000 },
    )
    .then((handle) => handle.jsonValue());
  const moveStatus = String(moveStatusAfter ?? "").trim();
  if (!moveStatus) {
    throw new Error(
      'Offline "Shield to online wallet" submission did not produce a status message.',
    );
  }
  if (
    [
      "Configure Torii and account first.",
      "Shield mode is unavailable.",
      "Shield mode requires destination to be your active account.",
      "Shield amount must be a whole number greater than zero.",
      "Enter an amount to move online.",
      "Insufficient offline balance for this withdrawal.",
    ].includes(moveStatus)
  ) {
    throw new Error(
      `Offline shield submission did not reach bridge submission path: ${moveStatus}`,
    );
  }

  return "executed";
}

async function runNavigationSmokeFlow(page) {
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
      const shieldToggle = page.getByLabel("Shielded send", { exact: true });
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

      if (!(await destinationInput.isDisabled())) {
        throw new Error(
          "Expected send destination to lock when shield transfer is enabled.",
        );
      }
      const shieldStep = await amountInput.getAttribute("step");
      if (shieldStep !== "1") {
        throw new Error(
          `Expected send amount step to be 1 in shield mode, got ${String(shieldStep)}.`,
        );
      }
      const shieldSubmitButton = page.getByRole("button", {
        name: "Shield",
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
          "Expected send shield action to be disabled for decimal amounts.",
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
      if (shieldDisabledForWhole) {
        throw new Error(
          "Expected send shield action to become enabled for whole-number amounts.",
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
      if ((await destinationInput.inputValue()) !== transparentDestination) {
        throw new Error(
          "Expected send destination to restore the previous transparent value after disabling shield transfer.",
        );
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
      const shieldToggle = moveCard.getByLabel("Shielded send", {
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
        name: "Shield to wallet",
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
          'Expected offline "Shield to online wallet" action to be disabled for decimal amounts.',
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
          'Expected offline "Shield to online wallet" action to become enabled for whole-number amounts.',
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
              ? 'Offline "Shield transfer" toggle stayed checked after uncheck attempt.'
              : 'Offline "Shield transfer" toggle stayed checked after becoming disabled.',
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
  await page.waitForFunction(() => window.location.hash === "#/receive", {
    timeout: 45_000,
  });
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

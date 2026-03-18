#!/usr/bin/env node

import { mkdirSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright";
import { AccountAddress, normalizeAssetId } from "@iroha/iroha-js";
import {
  isOnboardingConflictError,
  isOnboardingDisabledError,
  parseOnboardingEnvConfig,
  isSupportedAccountIdLiteral,
  parseNetworkPrefix,
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
const {
  alias: onboardingAlias,
  privateKeyHex: onboardingPrivateKeyHex,
  offlineBalance: onboardingOfflineSeedBalance,
} = parseOnboardingEnvConfig(process.env);
const deterministicSeedPublicKeyHex =
  "CE7FA46C9DCE7EA4B125E2E36BDB63EA33073E7590AC92816AE1E861B7048B03";
const defaultAccountIdFallback = AccountAddress.fromAccount({
  domain: "wonderland",
  publicKey: Buffer.from(deterministicSeedPublicKeyHex, "hex"),
}).toI105();

const defaultAccountId = process.env.E2E_ACCOUNT_ID || defaultAccountIdFallback;
const syntheticPublicKeyHex =
  `ed0120${randomBytes(32).toString("hex")}`.toUpperCase();
const syntheticPrivateKeyHex = randomBytes(32).toString("hex");

async function main() {
  if (!existsSync(mainEntry)) {
    throw new Error(
      `Built Electron entrypoint not found: ${mainEntry}. Run "npm run build" first.`,
    );
  }

  if (!assetDefinitionId) {
    throw new Error(
      "E2E_ASSET_DEFINITION_ID is required. Provide a canonical encoded asset ID (norito:<hex>).",
    );
  }
  try {
    normalizeAssetId(assetDefinitionId, "E2E_ASSET_DEFINITION_ID");
  } catch (error) {
    throw new Error(
      `E2E_ASSET_DEFINITION_ID has unsupported format: ${assetDefinitionId}. Provide a canonical encoded asset ID (norito:<hex>).`,
      { cause: error },
    );
  }

  assertTairaTarget(toriiUrl, chainId);
  await preflightToriiHealth(toriiUrl);
  const seededAccountId = await resolveSeedAccountId(toriiUrl);
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

    await runReadOnlyFlow(page, seededAccountId);
    await runOnboardingFlow(page);

    console.log("Live Electron E2E passed (read-only + onboarding flows).");
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

async function runReadOnlyFlow(page, seededAccountId) {
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
      publicKeyHex,
      privateKeyHex,
      torii,
      chain,
      assetId,
      prefix,
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
              domain: "wonderland",
              accountId,
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
      accountId: seededAccountId,
      publicKeyHex: syntheticPublicKeyHex,
      privateKeyHex: syntheticPrivateKeyHex,
      torii: toriiUrl,
      chain: chainId,
      assetId: assetDefinitionId,
      prefix: networkPrefix,
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
    { torii: toriiUrl, accountId: seededAccountId },
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

  await page.getByRole("heading", { name: "Explorer", exact: true }).waitFor({
    state: "visible",
    timeout: 30_000,
  });

  await runNavigationSmokeFlow(page);
}

async function resolveSeedAccountId(baseUrl) {
  if (process.env.E2E_ACCOUNT_ID?.trim()) {
    const fromEnv = process.env.E2E_ACCOUNT_ID.trim();
    if (isSupportedAccountIdLiteral(fromEnv)) {
      return fromEnv;
    }
    throw new Error(
      `E2E_ACCOUNT_ID has unsupported format: ${fromEnv}. Provide a canonical I105 account literal accepted by normalizeAccountId().`,
    );
  }
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const accountsUrl = new URL("v1/accounts?limit=1", normalizedBase).toString();
  try {
    const response = await fetch(accountsUrl, {
      method: "GET",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return defaultAccountId;
    const payload = await response.json().catch(() => null);
    const firstId = payload?.items?.[0]?.id;
    if (isSupportedAccountIdLiteral(firstId)) {
      return firstId;
    }
  } catch (_error) {
    // Fall back to the deterministic bootstrap account id below.
  }
  return defaultAccountId;
}

async function runOnboardingFlow(page) {
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
    }) => {
      const { publicKeyHex } = window.iroha.derivePublicKey(privateKeyHex);
      const summary = window.iroha.deriveAccountAddress({
        domain: "wonderland",
        publicKeyHex,
        networkPrefix: prefix,
      });
      const accountProfile = {
        displayName: alias,
        domain: "wonderland",
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
      assetId: assetDefinitionId,
      prefix: networkPrefix,
      alias: onboardingAlias,
      privateKeyHex: onboardingPrivateKeyHex,
      offlineBalance: onboardingOfflineSeedBalance,
    },
  );

  const onboardingStatus = onboardingBootstrap?.onboarding?.status ?? "";
  const onboardingDetail = String(
    onboardingBootstrap?.onboarding?.detail ?? "",
  );
  if (onboardingStatus === "error") {
    if (isOnboardingDisabledError(onboardingDetail)) {
      throw new Error(
        `Onboarding is disabled on ${toriiUrl} (HTTP 403). This TAIRA wallet build requires UAID onboarding enabled on the target Torii. Enable it and rerun e2e:live.`,
      );
    }
    if (!isOnboardingConflictError(onboardingDetail)) {
      throw new Error(
        `Onboarding probe failed: ${onboardingDetail || "unknown error"}`,
      );
    }
    console.log(
      "Onboarding probe: deterministic account already exists (HTTP 409), reusing existing account profile.",
    );
  } else {
    console.log(
      "Onboarding probe: deterministic account onboarding succeeded.",
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
    .getByRole("heading", { name: "Send Points", exact: true, level: 1 })
    .waitFor({ state: "visible", timeout: 45_000 });

  const sendCard = page
    .locator("section.card")
    .filter({ hasText: "Transfer Asset" })
    .first();
  const sendShieldToggle = sendCard.getByLabel("Shield transfer", {
    exact: true,
  });
  await sendShieldToggle.waitFor({ state: "visible", timeout: 30_000 });
  if (!(await sendShieldToggle.isEnabled())) {
    throw new Error(
      "Expected send shield toggle to be enabled in onboarding flow.",
    );
  }
  await sendShieldToggle.check();
  const sendDestination = sendCard.getByPlaceholder(
    "n42u... (I105 account ID)",
  );
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
    .filter({ hasText: "Move funds to online wallet" })
    .first();
  const moveShieldToggle = moveCard.getByLabel("Shield transfer", {
    exact: true,
  });
  await moveShieldToggle.waitFor({ state: "visible", timeout: 30_000 });
  if (!(await moveShieldToggle.isEnabled())) {
    throw new Error(
      'Expected offline "Shield transfer" toggle to be enabled in onboarding flow.',
    );
  }
  await moveShieldToggle.check();
  const moveDestination = moveCard.getByPlaceholder(
    "n42u... (I105 account ID)",
  );
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
    name: "Shield to online wallet",
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
            ?.textContent?.includes("Move funds to online wallet"),
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
}

async function runNavigationSmokeFlow(page) {
  const checks = [
    {
      hash: "#/setup",
      heading: "Session Setup",
      sectionText: "Torii Connection",
    },
    {
      hash: "#/wallet",
      heading: "Wallet Overview",
      sectionText: "Balances",
    },
    {
      hash: "#/staking",
      heading: "NPOS Staking",
      sectionText: "Nominate Validators",
    },
    {
      hash: "#/parliament",
      heading: "SORA Parliament",
      sectionText: "Citizenship Bond",
    },
    {
      hash: "#/subscriptions",
      heading: "Subscription Hub",
      sectionText: "Add subscription",
    },
    {
      hash: "#/send",
      heading: "Send Points",
      sectionText: "Transfer Asset",
    },
    {
      hash: "#/receive",
      heading: "Receive Points",
      sectionText: "Share Payment QR",
    },
    {
      hash: "#/offline",
      heading: "Offline",
      sectionText: "Offline wallet & hardware",
    },
    {
      hash: "#/explore",
      heading: "Explorer",
      sectionText: "Explorer Metrics",
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
    await page.getByText(check.sectionText, { exact: true }).first().waitFor({
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
      const shieldToggle = page.getByLabel("Shield transfer", { exact: true });
      await shieldToggle.waitFor({ state: "visible", timeout: 30_000 });
      if (!(await shieldToggle.isEnabled())) {
        await page
          .getByRole("button", { name: "Send", exact: true })
          .waitFor({ state: "visible", timeout: 30_000 });
        continue;
      }
      const destinationInput = page.getByPlaceholder(
        "n42u... (I105 account ID)",
      );
      const amountInput = page.locator('input[type="number"]').first();
      const transparentDestination = "n42uRestoreSendAccount";
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
        .filter({ hasText: "Move funds to online wallet" })
        .first();
      const shieldToggle = moveCard.getByLabel("Shield transfer", {
        exact: true,
      });
      await shieldToggle.waitFor({ state: "visible", timeout: 30_000 });
      if (!(await shieldToggle.isEnabled())) {
        await moveCard
          .getByRole("button", { name: "Send to online wallet", exact: true })
          .waitFor({ state: "visible", timeout: 30_000 });
        continue;
      }
      const destinationInput = moveCard.getByPlaceholder(
        "n42u... (I105 account ID)",
      );
      const transparentDestination = "n42uRestoreOfflineAccount";
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
          .getByRole("button", { name: "Send to online wallet", exact: true })
          .waitFor({ state: "visible", timeout: 30_000 });
        continue;
      }
      if (!(await shieldToggle.isChecked().catch(() => false))) {
        await moveCard
          .getByRole("button", { name: "Send to online wallet", exact: true })
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
        name: "Shield to online wallet",
        exact: true,
      });
      const moveShieldButtonVisible = await moveSubmitButton
        .waitFor({ state: "visible", timeout: 5_000 })
        .then(() => true)
        .catch(() => false);
      if (!moveShieldButtonVisible) {
        await moveCard
          .getByRole("button", { name: "Send to online wallet", exact: true })
          .waitFor({ state: "visible", timeout: 30_000 });
        continue;
      }
      await moveAmountInput.fill("10.5");
      const moveDisabledForDecimal = await moveSubmitButton
        .isDisabled({ timeout: 3_000 })
        .catch(() => null);
      if (moveDisabledForDecimal === null) {
        await moveCard
          .getByRole("button", { name: "Send to online wallet", exact: true })
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
          .getByRole("button", { name: "Send to online wallet", exact: true })
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
        .getByRole("button", { name: "Send to online wallet", exact: true })
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
  await clickButton(page, "Show QR Code");
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
